-- Pacote do Contador v2 (03/11/2026): geração em segundo plano, versões e partes.
ALTER TABLE public.remessas_contador
  ADD COLUMN IF NOT EXISTS competencia date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS progresso jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS erro_mensagem text,
  ADD COLUMN IF NOT EXISTS versao integer,
  ADD COLUMN IF NOT EXISTS gerado_por uuid,
  ADD COLUMN IF NOT EXISTS gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS partes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manifesto jsonb;

ALTER TABLE public.remessas_contador DROP CONSTRAINT IF EXISTS remessas_contador_status_check;
ALTER TABLE public.remessas_contador ADD CONSTRAINT remessas_contador_status_check
  CHECK (status IS NULL OR status IN ('gerando','pronto','erro'));

CREATE UNIQUE INDEX IF NOT EXISTS remessas_contador_comp_versao_uq
  ON public.remessas_contador (competencia, versao) WHERE versao IS NOT NULL;

-- Upload da planilha do pacote pela tela (pasta pacotes/ do bucket contabil).
DROP POLICY IF EXISTS contabil_pacote_insert ON storage.objects;
CREATE POLICY contabil_pacote_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contabil' AND name LIKE 'pacotes/%' AND public.pode_ler_tabela('remessas_contador'));

CREATE OR REPLACE FUNCTION public.fn_remessa_contador_iniciar(
  p_competencia date, p_destinatarios text[] DEFAULT '{}', p_observacao text DEFAULT NULL, p_limite_parte_mb integer DEFAULT 150)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record; v_comp date := date_trunc('month', p_competencia)::date; v_versao int; v_id uuid; v_dest text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ler_tabela('remessas_contador') THEN
    RAISE EXCEPTION 'Sem permissão para gerar o pacote do contador.'; END IF;
  IF p_limite_parte_mb IS NULL OR p_limite_parte_mb < 1 OR p_limite_parte_mb > 150 THEN
    RAISE EXCEPTION 'Limite por parte deve ficar entre 1 e 150 MB (recebido %).', p_limite_parte_mb; END IF;
  SELECT * INTO f FROM contabil_fechamento WHERE competencia = v_comp;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Competência % não existe no fechamento contábil.', to_char(v_comp,'MM/YYYY'); END IF;
  IF f.status <> 'fechado' THEN RAISE EXCEPTION 'Feche a competência % antes de gerar o pacote (status atual: %).', to_char(v_comp,'MM/YYYY'), f.status; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('remessa_contador_' || v_comp::text));
  IF EXISTS (SELECT 1 FROM remessas_contador WHERE competencia = v_comp AND status = 'gerando') THEN
    RAISE EXCEPTION 'Já existe um pacote de % sendo gerado.', to_char(v_comp,'MM/YYYY'); END IF;
  SELECT coalesce(array_agg(lower(trim(e))), '{}') INTO v_dest FROM unnest(coalesce(p_destinatarios,'{}')) e WHERE trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM remessas_contador WHERE competencia = v_comp;
  INSERT INTO remessas_contador (tipo, fechamento_id, competencia, versao, status, progresso, descricao, periodo_inicio, periodo_fim,
    enviada_em, enviada_por, metodo, destinatarios, observacao, gerado_por, gerado_em)
  VALUES ('fechamento_estoque', f.id, v_comp, v_versao, 'gerando',
    jsonb_build_object('etapa','iniciado','limite_parte_mb',p_limite_parte_mb,'atualizado_em',now()),
    'Pacote contábil ' || to_char(v_comp,'MM/YYYY') || ' v' || v_versao, v_comp, (v_comp + interval '1 month - 1 day')::date,
    now(), auth.uid(), 'sistema', v_dest, nullif(trim(p_observacao),''), auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'remessa_id', v_id, 'versao', v_versao, 'competencia', v_comp);
END $$;
REVOKE ALL ON FUNCTION public.fn_remessa_contador_iniciar(date, text[], text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_remessa_contador_iniciar(date, text[], text, integer) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_contabil_remessas WITH (security_invoker = true) AS
 SELECT r.id, r.tipo, coalesce(r.competencia, f.competencia) AS competencia,
    to_char(coalesce(r.competencia, f.competencia)::timestamptz, 'MM/YYYY') AS rotulo,
    r.descricao, r.enviada_em, r.destinatarios, r.link_signed, r.link_expira_em,
    (r.link_expira_em < now()) AS link_expirado, r.storage_path, r.qtd_documentos, r.observacao,
    f.unidades, f.valor_custo,
    r.versao, r.status, r.progresso, r.erro_mensagem, r.partes, r.manifesto, r.gerado_em,
    coalesce(r.gerado_por, r.enviada_por) AS gerado_por,
    (SELECT p.full_name FROM profiles p WHERE p.user_id = coalesce(r.gerado_por, r.enviada_por) LIMIT 1) AS gerado_por_nome
   FROM remessas_contador r LEFT JOIN contabil_fechamento f ON f.id = r.fechamento_id
  WHERE r.tipo = 'fechamento_estoque';
GRANT SELECT ON public.vw_contabil_remessas TO authenticated, service_role;