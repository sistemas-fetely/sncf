CREATE OR REPLACE FUNCTION public.fn_contabil_nf_numeracao(p_competencia date)
RETURNS TABLE(emitente_cnpj text, serie text, numero bigint, ocorrencia text, data_emissao date, detalhe text, prazo_inutilizacao date, dentro_prazo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ini date := date_trunc('month', p_competencia)::date;
        v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
        v_prazo date := (date_trunc('month', p_competencia) + interval '1 month 9 days')::date;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.pode_ler_tabela('remessas_contador') THEN
    RAISE EXCEPTION 'Sem permissão para o pacote do contador'; END IF;
  RETURN QUERY
  WITH emitentes AS (
    SELECT regexp_replace(u.cnpj,'\D','','g') cnpj FROM public.unidades u WHERE u.cnpj IS NOT NULL
    UNION
    SELECT regexp_replace(cd.cnpj_emitente,'\D','','g') FROM public.centro_distribuicao cd WHERE cd.cnpj_emitente IS NOT NULL
  ), base AS (
    -- A chave prevalece sobre campos isolados; fallback preserva documentos legados sem chave.
    SELECT CASE WHEN n.chave_acesso ~ '^\d{44}$' THEN substr(n.chave_acesso,7,14) ELSE nullif(regexp_replace(n.emitente_cnpj,'\D','','g'),'') END cnpj,
           CASE WHEN n.chave_acesso ~ '^\d{44}$' THEN substr(n.chave_acesso,23,3)::integer::text ELSE coalesce(nullif(ltrim(n.serie,'0'),''),'1') END se,
           CASE WHEN n.chave_acesso ~ '^\d{44}$' THEN substr(n.chave_acesso,26,9)::bigint ELSE n.numero::bigint END num,
           n.data_emissao dt, n.situacao sit, false propria
      FROM public.nfs_emitidas n WHERE n.chave_acesso ~ '^\d{44}$' OR n.numero ~ '^\d+$'
    UNION ALL
    SELECT substr(s.nf_chave_acesso,7,14), substr(s.nf_chave_acesso,23,3)::integer::text,
           substr(s.nf_chave_acesso,26,9)::bigint, s.nf_data_emissao, 'autorizada', true
      FROM public.nfs_stage s
     WHERE s.nf_chave_acesso ~ '^\d{44}$'
       AND EXISTS (SELECT 1 FROM emitentes e WHERE e.cnpj = substr(s.nf_chave_acesso,7,14))
    UNION ALL
    SELECT substr(d.nf_devolucao,7,14), substr(d.nf_devolucao,23,3)::integer::text,
           substr(d.nf_devolucao,26,9)::bigint,
           to_date('20'||substr(d.nf_devolucao,3,4)||'01','YYYYMMDD'), 'autorizada', true
      FROM public.devolucao d
     WHERE d.nf_devolucao ~ '^\d{44}$'
       AND EXISTS (SELECT 1 FROM emitentes e WHERE e.cnpj = substr(d.nf_devolucao,7,14))
  ), mes_grupos AS (
    SELECT b.cnpj, b.se, min(b.num) mn, max(b.num) mx FROM base b
     WHERE b.cnpj IS NOT NULL AND b.dt BETWEEN v_ini AND v_fim GROUP BY 1,2
  ), resolvida AS (
    SELECT coalesce(b.cnpj, (SELECT g.cnpj FROM mes_grupos g WHERE g.se = b.se AND b.num BETWEEN g.mn AND g.mx LIMIT 1)) cnpj,
           b.se, b.num, b.dt, b.sit, b.propria FROM base b
  ), conhecida AS (
    -- Uma NF pode existir em múltiplas fontes e em várias parcelas do Stage.
    SELECT r.cnpj, r.se, r.num, min(r.dt) dt,
           CASE WHEN bool_or(r.sit = 'cancelada') THEN 'cancelada'
                WHEN bool_or(r.sit = 'autorizada') THEN 'autorizada' ELSE min(r.sit) END sit,
           bool_or(r.propria) propria
      FROM resolvida r GROUP BY r.cnpj,r.se,r.num
  ), grupos AS (
    SELECT g.cnpj, g.se, g.mx,
           coalesce((SELECT max(c.num) FROM conhecida c WHERE c.cnpj = g.cnpj AND c.se = g.se AND c.dt < v_ini) + 1, g.mn) lo
      FROM mes_grupos g
  ), inut AS (
    SELECT i.emitente_cnpj cnpj, coalesce(nullif(ltrim(i.serie,'0'),''),'0') se, gs.n num, i.data_inutilizacao dt,
           'Inutilizada' || coalesce(' · protocolo ' || i.protocolo, '') || ' · ' || i.justificativa det
      FROM public.nf_inutilizacao i CROSS JOIN LATERAL generate_series(i.numero_inicial, i.numero_final) gs(n)
  )
  SELECT c.cnpj, c.se, c.num, 'cancelada'::text, c.dt, 'Cancelada'::text, NULL::date, NULL::boolean
    FROM conhecida c WHERE c.sit = 'cancelada' AND c.dt BETWEEN v_ini AND v_fim
  UNION ALL
  SELECT c.cnpj, c.se, c.num, 'entrada_propria', c.dt, 'NF de entrada própria', NULL::date, NULL::boolean
    FROM conhecida c WHERE c.propria AND c.sit = 'autorizada' AND c.dt BETWEEN v_ini AND v_fim
  UNION ALL
  SELECT c.cnpj, c.se, c.num, 'nao_autorizada', c.dt, 'Situação ' || c.sit || ' — verificar inutilização', v_prazo, current_date <= v_prazo
    FROM conhecida c WHERE c.sit NOT IN ('cancelada','autorizada') AND c.dt BETWEEN v_ini AND v_fim
      AND NOT EXISTS (SELECT 1 FROM inut i WHERE i.cnpj = c.cnpj AND i.se = c.se AND i.num = c.num)
  UNION ALL
  SELECT i.cnpj, i.se, i.num, 'inutilizada', i.dt, i.det, NULL, NULL
    FROM inut i JOIN grupos g ON g.cnpj = i.cnpj AND g.se = i.se
   WHERE i.num BETWEEN g.lo AND g.mx OR i.dt BETWEEN v_ini AND v_fim
  UNION ALL
  SELECT g.cnpj, g.se, gs.n, 'buraco', NULL::date, 'Não identificado — verificar inutilização', v_prazo, current_date <= v_prazo
    FROM grupos g CROSS JOIN LATERAL generate_series(g.lo, g.mx) gs(n)
   WHERE NOT EXISTS (SELECT 1 FROM conhecida c WHERE c.cnpj = g.cnpj AND c.se = g.se AND c.num = gs.n)
     AND NOT EXISTS (SELECT 1 FROM inut i WHERE i.cnpj = g.cnpj AND i.se = g.se AND i.num = gs.n)
  ORDER BY 1, 2, 3;
END $function$;
COMMENT ON FUNCTION public.fn_contabil_nf_numeracao(date) IS 'Numeração compartilhada por CNPJ/série da chave: saídas, entradas próprias (emitentes do cadastro) e devoluções; deduplicação entre fontes e parcelas. Entradas próprias não são buracos.';