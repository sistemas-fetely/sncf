-- 1) Posse do estoque por centro (dimensão)
CREATE TABLE public.estoque_posse_dim (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  ordem integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.estoque_posse_dim TO authenticated;
GRANT ALL ON public.estoque_posse_dim TO service_role;
ALTER TABLE public.estoque_posse_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posse dim leitura" ON public.estoque_posse_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.estoque_posse_dim (codigo, rotulo, ordem) VALUES
  ('proprio', 'Próprio em nosso poder', 1),
  ('proprio_em_poder_de_terceiros', 'Próprio em poder de terceiros', 2),
  ('de_terceiros_em_nosso_poder', 'De terceiros em nosso poder', 3);

ALTER TABLE public.centro_distribuicao
  ADD COLUMN posse text REFERENCES public.estoque_posse_dim(codigo),
  ADD COLUMN participante_cnpj text CHECK (participante_cnpj IS NULL OR participante_cnpj ~ '^\d{14}$');
COMMENT ON COLUMN public.centro_distribuicao.posse IS 'Bloco K: estoque em poder de. NULL = a confirmar com o contador.';

UPDATE public.centro_distribuicao SET posse = 'proprio' WHERE codigo IN ('SITE-SP','FET-SP-SR');
UPDATE public.centro_distribuicao cd SET posse = 'proprio_em_poder_de_terceiros',
  participante_cnpj = nullif(regexp_replace(coalesce(pc.cnpj,''),'\D','','g'),'')
  FROM public.parceiros_comerciais pc
 WHERE cd.codigo IN ('CONSIG-UTILPLAST','VENDA-FORA-CASA22') AND pc.id = cd.parceiro_id;
UPDATE public.centro_distribuicao SET posse = 'proprio_em_poder_de_terceiros' WHERE codigo = 'TERCEIRO-SP';

-- 2) Permissão de edição da posse
INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao)
VALUES ('acao.contabil_centro_posse.editar', 'acao', 'financas', 'Editar posse do estoque (Bloco K)',
        'Define "estoque em poder de" e CNPJ do participante de cada centro para o Bloco K')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao)
VALUES ('acao.nf_inutilizacao.registrar', 'acao', 'financas', 'Registrar inutilização de NF',
        'Registra faixa de numeração de NF-e inutilizada na SEFAZ (feita no Bling)')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem)
SELECT '/administrativo/contabilidade/pacote', 'src/components/contabil/PosseCentros.tsx', 'Salvar posse do centro (Bloco K)',
       'fn_contabil_centro_posse_salvar', 'usuario_tem_acao', 'MEDIO', id, 'lovable'
  FROM public.permissoes_catalogo WHERE slug = 'acao.contabil_centro_posse.editar';
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem)
SELECT '/administrativo/contabilidade/pacote', 'src/components/contabil/NumeracaoNfs.tsx', 'Registrar inutilização de NF',
       'fn_nf_inutilizacao_registrar', 'usuario_tem_acao', 'MEDIO', id, 'lovable'
  FROM public.permissoes_catalogo WHERE slug = 'acao.nf_inutilizacao.registrar';

CREATE OR REPLACE FUNCTION public.fn_contabil_centro_posse_salvar(p_centro_id uuid, p_posse text, p_participante_cnpj text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cnpj text := nullif(regexp_replace(coalesce(p_participante_cnpj,''),'\D','','g'),'');
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.contabil_centro_posse.editar') THEN
    RAISE EXCEPTION 'Sem permissão para editar a posse do estoque'; END IF;
  IF p_posse IS NOT NULL AND NOT EXISTS (SELECT 1 FROM estoque_posse_dim WHERE codigo = p_posse) THEN
    RAISE EXCEPTION 'Posse inválida: %', p_posse; END IF;
  IF v_cnpj IS NOT NULL AND length(v_cnpj) <> 14 THEN RAISE EXCEPTION 'CNPJ do participante deve ter 14 dígitos'; END IF;
  UPDATE centro_distribuicao SET posse = p_posse, participante_cnpj = v_cnpj WHERE id = p_centro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Centro não encontrado'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_centro_posse_salvar(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_centro_posse_salvar(uuid,text,text) TO authenticated, service_role;

-- 3) Bloco K: posição por produto e local com NCM, unidade e posse
CREATE OR REPLACE FUNCTION public.fn_contabil_bloco_k(p_competencia date)
RETURNS TABLE(sku text, codigo_produto text, produto text, centro text, quantidade numeric, valor_unitario numeric,
              valor_total numeric, unidade text, ncm text, posse text, posse_rotulo text, participante_cnpj text,
              participante_nome text, fonte text, sem_ncm boolean, sem_unidade boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.pode_ler_tabela('remessas_contador') THEN
    RAISE EXCEPTION 'Sem permissão para o pacote do contador'; END IF;
  RETURN QUERY
  SELECT p.sku, coalesce(sp.cod_cadastro, p.sku), p.produto, p.centro, p.quantidade, p.custo_unitario, p.valor_total,
         nullif(trim(pr.unidade),''), nullif(regexp_replace(coalesce(pr.ncm, sp.ncm,''),'\D','','g'),''),
         cd.posse, coalesce(pd.rotulo, 'a confirmar'), cd.participante_cnpj, pc.razao_social, p.fonte,
         nullif(regexp_replace(coalesce(pr.ncm, sp.ncm,''),'\D','','g'),'') IS NULL,
         nullif(trim(pr.unidade),'') IS NULL
    FROM public.fn_contabil_posicao(p_competencia) p
    LEFT JOIN centro_distribuicao cd ON cd.codigo = p.centro
    LEFT JOIN estoque_posse_dim pd ON pd.codigo = cd.posse
    LEFT JOIN parceiros_comerciais pc ON pc.id = cd.parceiro_id AND cd.participante_cnpj IS NOT NULL
    LEFT JOIN sncf_produtos sp ON sp.sku = p.sku
    LEFT JOIN LATERAL (SELECT x.unidade, x.ncm FROM produtos x WHERE x.codigo = fn_produto_codigo_externo(p.sku)
                        ORDER BY x.ativo DESC NULLS LAST, x.updated_at DESC NULLS LAST LIMIT 1) pr ON true
   ORDER BY p.centro, 2;
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_bloco_k(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_bloco_k(date) TO authenticated, service_role;

-- 4) Inutilizações registradas (a API v3 do Bling não expõe inutilização)
CREATE TABLE public.nf_inutilizacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emitente_cnpj text NOT NULL CHECK (emitente_cnpj ~ '^\d{14}$'),
  serie text NOT NULL,
  numero_inicial bigint NOT NULL,
  numero_final bigint NOT NULL,
  data_inutilizacao date NOT NULL,
  protocolo text,
  justificativa text NOT NULL CHECK (length(trim(justificativa)) >= 15),
  registrado_por uuid,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (numero_final >= numero_inicial)
);
GRANT ALL ON public.nf_inutilizacao TO service_role;
ALTER TABLE public.nf_inutilizacao ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_nf_inutilizacao_registrar(p_emitente_cnpj text, p_serie text, p_inicial bigint, p_final bigint,
  p_data date, p_protocolo text, p_justificativa text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.nf_inutilizacao.registrar') THEN
    RAISE EXCEPTION 'Sem permissão para registrar inutilização'; END IF;
  INSERT INTO nf_inutilizacao (emitente_cnpj, serie, numero_inicial, numero_final, data_inutilizacao, protocolo, justificativa, registrado_por)
  VALUES (regexp_replace(coalesce(p_emitente_cnpj,''),'\D','','g'), trim(p_serie), p_inicial, coalesce(p_final, p_inicial), p_data,
          nullif(trim(p_protocolo),''), p_justificativa, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_nf_inutilizacao_registrar(text,text,bigint,bigint,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nf_inutilizacao_registrar(text,text,bigint,bigint,date,text,text) TO authenticated, service_role;

-- 5) Canceladas, inutilizadas e buracos de numeração por emitente + série
CREATE OR REPLACE FUNCTION public.fn_contabil_nf_numeracao(p_competencia date)
RETURNS TABLE(emitente_cnpj text, serie text, numero bigint, ocorrencia text, data_emissao date, detalhe text,
              prazo_inutilizacao date, dentro_prazo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date := date_trunc('month', p_competencia)::date;
        v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
        v_prazo date := (date_trunc('month', p_competencia) + interval '1 month 9 days')::date;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT public.pode_ler_tabela('remessas_contador') THEN
    RAISE EXCEPTION 'Sem permissão para o pacote do contador'; END IF;
  RETURN QUERY
  WITH base AS (  -- numeração conhecida: NFs do Bling/Sublimity + NFs de devolução (entrada emitida)
    SELECT coalesce(n.emitente_cnpj, nullif(substr(n.chave_acesso,7,14),'')) cnpj, coalesce(n.serie,'1') se,
           n.numero::bigint num, n.data_emissao dt, n.situacao sit
      FROM nfs_emitidas n WHERE n.numero ~ '^\d+$'
    UNION ALL
    SELECT substr(d.nf_devolucao,7,14), ltrim(substr(d.nf_devolucao,23,3),'0'), substr(d.nf_devolucao,26,9)::bigint,
           to_date('20'||substr(d.nf_devolucao,3,4)||'01','YYYYMMDD'), 'autorizada'
      FROM devolucao d WHERE d.nf_devolucao ~ '^\d{44}$'
  ), mes_grupos AS (
    SELECT b.cnpj, b.se, min(b.num) mn, max(b.num) mx FROM base b
     WHERE b.cnpj IS NOT NULL AND b.dt BETWEEN v_ini AND v_fim GROUP BY 1,2
  ), conhecida AS (  -- sem CNPJ: atribui ao grupo cuja faixa do mês contém o número
    SELECT coalesce(b.cnpj, (SELECT g.cnpj FROM mes_grupos g WHERE g.se = b.se AND b.num BETWEEN g.mn AND g.mx LIMIT 1)) cnpj,
           b.se, b.num, b.dt, b.sit FROM base b
  ), grupos AS (
    SELECT g.cnpj, g.se, g.mx,
           coalesce((SELECT max(c.num) FROM conhecida c WHERE c.cnpj = g.cnpj AND c.se = g.se AND c.dt < v_ini) + 1, g.mn) lo
      FROM mes_grupos g
  ), inut AS (
    SELECT i.emitente_cnpj cnpj, i.serie se, gs.n num, i.data_inutilizacao dt,
           'Inutilizada' || coalesce(' · protocolo ' || i.protocolo, '') || ' · ' || i.justificativa det
      FROM nf_inutilizacao i CROSS JOIN LATERAL generate_series(i.numero_inicial, i.numero_final) gs(n)
  )
  SELECT c.cnpj, c.se, c.num, 'cancelada'::text, c.dt, 'Cancelada'::text, NULL::date, NULL::boolean
    FROM conhecida c WHERE c.sit = 'cancelada' AND c.dt BETWEEN v_ini AND v_fim
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
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_nf_numeracao(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_nf_numeracao(date) TO authenticated, service_role;