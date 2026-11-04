-- Pacote do Contador etapa 2 (fase 1): vínculo NFS-e ↔ pagamento e documentos de despesa do mês.

-- 1) Vínculo de pagamento da NFS-e com retenção (não altera movimentacoes_bancarias)
CREATE TABLE public.contabil_nfse_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfs_stage_id uuid NOT NULL REFERENCES public.nfs_stage(id),
  movimentacao_id uuid NOT NULL REFERENCES public.movimentacoes_bancarias(id),
  valor_liquido_calculado numeric NOT NULL,
  confirmado_por uuid NOT NULL,
  confirmado_em timestamptz NOT NULL DEFAULT now(),
  vigente boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.contabil_nfse_pagamento TO authenticated;
GRANT ALL ON public.contabil_nfse_pagamento TO service_role;
ALTER TABLE public.contabil_nfse_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_pagamento_ler ON public.contabil_nfse_pagamento FOR SELECT TO authenticated USING (public.pode_ler_tabela('remessas_contador'));
CREATE UNIQUE INDEX contabil_nfse_pagamento_vigente ON public.contabil_nfse_pagamento (nfs_stage_id) WHERE vigente;

-- 2) Tipos de documento de despesa esperados (dimensão cadastrável; nasce vazia)
CREATE TABLE public.contabil_documento_despesa_tipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  pasta text NOT NULL CHECK (pasta IN ('consumo','aluguel','cupons','outros')),
  periodicidade text NOT NULL CHECK (periodicidade IN ('mensal','contrato_vigente')),
  local text,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid, criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contabil_documento_despesa_tipo TO authenticated;
GRANT ALL ON public.contabil_documento_despesa_tipo TO service_role;
ALTER TABLE public.contabil_documento_despesa_tipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_despesa_tipo_ler ON public.contabil_documento_despesa_tipo FOR SELECT TO authenticated USING (public.pode_ler_tabela('remessas_contador'));
CREATE UNIQUE INDEX contabil_documento_despesa_tipo_nome ON public.contabil_documento_despesa_tipo (lower(nome));

-- 3) Documentos de despesa guardados (substituir preserva o anterior)
CREATE TABLE public.contabil_documento_despesa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia date NOT NULL,
  tipo_id uuid REFERENCES public.contabil_documento_despesa_tipo(id),
  pasta text NOT NULL CHECK (pasta IN ('consumo','aluguel','cupons','outros')),
  storage_path text NOT NULL, nome_arquivo text NOT NULL, sha256 text NOT NULL, bytes bigint NOT NULL,
  descricao text,
  enviado_por uuid NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(), vigente boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.contabil_documento_despesa TO authenticated;
GRANT ALL ON public.contabil_documento_despesa TO service_role;
ALTER TABLE public.contabil_documento_despesa ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_despesa_ler ON public.contabil_documento_despesa FOR SELECT TO authenticated USING (public.pode_ler_tabela('remessas_contador'));
CREATE UNIQUE INDEX contabil_documento_despesa_vigente ON public.contabil_documento_despesa (competencia, tipo_id) WHERE vigente AND tipo_id IS NOT NULL;

-- 4) Permissões + censo
INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao) VALUES
 ('acao.contabil_nfse_pagamento.confirmar','acao','financas','Confirmar pagamento de NFS-e com retenção','Liga a NFS-e com retenção à movimentação bancária que a pagou (planilha de serviços tomados)'),
 ('acao.contabil_documento_despesa.enviar','acao','financas','Enviar documento de despesa do mês','Guarda fatura, recibo, contrato ou cupom de despesa para o pacote do contador'),
 ('acao.contabil_documento_despesa_tipo.editar','acao','financas','Cadastrar documentos de despesa esperados','Cadastra os tipos de documento de despesa esperados por mês no pacote do contador')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem)
SELECT '/administrativo/contabilidade/pacote', a.arquivo, a.rotulo, a.dispara, 'usuario_tem_acao', 'MEDIO', p.id, 'lovable'
  FROM (VALUES
   ('acao.contabil_nfse_pagamento.confirmar','src/components/contabil/RetencoesNfse.tsx','Confirmar pagamento da NFS-e','fn_contabil_nfse_pagamento_confirmar'),
   ('acao.contabil_documento_despesa.enviar','src/components/contabil/DocumentosDespesaMes.tsx','Enviar documento de despesa','fn_contabil_documento_despesa_guardar'),
   ('acao.contabil_documento_despesa_tipo.editar','src/components/contabil/DocumentosDespesaMes.tsx','Salvar documento esperado','fn_contabil_documento_despesa_tipo_salvar')
  ) a(slug, arquivo, rotulo, dispara)
  JOIN public.permissoes_catalogo p ON p.slug = a.slug;

-- 5) Storage: upload só em despesas/ com a permissão de envio
CREATE POLICY contabil_despesas_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contabil' AND name LIKE 'despesas/%' AND public.usuario_tem_acao('acao.contabil_documento_despesa.enviar'));

-- 6) Candidatos de pagamento: débitos pelo valor líquido (±0,01) na janela emissão−5 a +45 dias
CREATE FUNCTION public.fn_contabil_nfse_pagamento_candidatos(p_nfs_stage_id uuid, p_valor_liquido numeric)
RETURNS TABLE (movimentacao_id uuid, data_transacao date, valor numeric, descricao text, contraparte_nome text, conta text, exato boolean, mesmo_favorecido boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emissao date; v_cnpj text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.pode_ler_tabela('remessas_contador') THEN RAISE EXCEPTION 'Sem permissão para o pacote do contador'; END IF;
  SELECT nf_data_emissao::date, regexp_replace(coalesce(fornecedor_cnpj,''),'\D','','g') INTO v_emissao, v_cnpj FROM nfs_stage WHERE id = p_nfs_stage_id;
  IF v_emissao IS NULL THEN RAISE EXCEPTION 'NFS-e não encontrada ou sem data de emissão'; END IF;
  RETURN QUERY
  SELECT m.id, m.data_transacao::date, abs(m.valor), m.descricao, m.contraparte_nome, cb.nome_exibicao,
         abs(abs(m.valor) - p_valor_liquido) <= 0.01,
         v_cnpj <> '' AND regexp_replace(coalesce(m.contraparte_documento,''),'\D','','g') = v_cnpj
    FROM movimentacoes_bancarias m LEFT JOIN contas_bancarias cb ON cb.id = m.conta_bancaria_id
   WHERE m.valor < 0 AND m.duplicada_de IS NULL
     AND m.data_transacao BETWEEN v_emissao - 5 AND v_emissao + 45
     AND abs(abs(m.valor) - p_valor_liquido) <= greatest(0.01, p_valor_liquido * 0.10)
     AND NOT EXISTS (SELECT 1 FROM contabil_nfse_pagamento x WHERE x.movimentacao_id = m.id AND x.vigente AND x.nfs_stage_id <> p_nfs_stage_id)
   ORDER BY 7 DESC, 8 DESC, abs(abs(m.valor) - p_valor_liquido), m.data_transacao
   LIMIT 30;
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_nfse_pagamento_candidatos(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_nfse_pagamento_candidatos(uuid,numeric) TO authenticated, service_role;

CREATE FUNCTION public.fn_contabil_nfse_pagamento_confirmar(p_nfs_stage_id uuid, p_movimentacao_id uuid, p_valor_liquido numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.contabil_nfse_pagamento.confirmar') THEN RAISE EXCEPTION 'Sem permissão para confirmar pagamento de NFS-e'; END IF;
  PERFORM 1 FROM nfs_stage WHERE id = p_nfs_stage_id AND tipo_documento = 'nfse' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NFS-e não encontrada'; END IF;
  PERFORM 1 FROM movimentacoes_bancarias WHERE id = p_movimentacao_id AND valor < 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimentação não encontrada ou não é débito'; END IF;
  IF EXISTS (SELECT 1 FROM contabil_nfse_pagamento WHERE movimentacao_id = p_movimentacao_id AND vigente AND nfs_stage_id <> p_nfs_stage_id) THEN
    RAISE EXCEPTION 'Esta movimentação já está ligada a outra NFS-e'; END IF;
  UPDATE contabil_nfse_pagamento SET vigente = false WHERE nfs_stage_id = p_nfs_stage_id AND vigente;
  INSERT INTO contabil_nfse_pagamento (nfs_stage_id, movimentacao_id, valor_liquido_calculado, confirmado_por)
  VALUES (p_nfs_stage_id, p_movimentacao_id, p_valor_liquido, auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_nfse_pagamento_confirmar(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_nfse_pagamento_confirmar(uuid,uuid,numeric) TO authenticated, service_role;

-- 7) CRUD do tipo esperado e guarda do documento
CREATE FUNCTION public.fn_contabil_documento_despesa_tipo_salvar(p_id uuid, p_nome text, p_pasta text, p_periodicidade text, p_local text, p_ativo boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.contabil_documento_despesa_tipo.editar') THEN RAISE EXCEPTION 'Sem permissão para cadastrar documentos esperados'; END IF;
  IF length(trim(coalesce(p_nome,''))) < 3 THEN RAISE EXCEPTION 'Nome do documento precisa de ao menos 3 caracteres'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO contabil_documento_despesa_tipo (nome, pasta, periodicidade, local, ativo, criado_por)
    VALUES (trim(p_nome), p_pasta, p_periodicidade, nullif(trim(coalesce(p_local,'')),''), coalesce(p_ativo,true), auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE contabil_documento_despesa_tipo SET nome = trim(p_nome), pasta = p_pasta, periodicidade = p_periodicidade,
      local = nullif(trim(coalesce(p_local,'')),''), ativo = coalesce(p_ativo,true), atualizado_em = now() WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Documento esperado não encontrado'; END IF;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_documento_despesa_tipo_salvar(uuid,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_documento_despesa_tipo_salvar(uuid,text,text,text,text,boolean) TO authenticated, service_role;

CREATE FUNCTION public.fn_contabil_documento_despesa_guardar(p_competencia date, p_tipo_id uuid, p_pasta text, p_storage_path text, p_nome text, p_sha256 text, p_bytes bigint, p_descricao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date := date_trunc('month', p_competencia)::date; v_pasta text := p_pasta; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.contabil_documento_despesa.enviar') THEN RAISE EXCEPTION 'Sem permissão para enviar documento de despesa'; END IF;
  IF p_tipo_id IS NOT NULL THEN
    SELECT pasta INTO v_pasta FROM contabil_documento_despesa_tipo WHERE id = p_tipo_id AND ativo FOR UPDATE;
    IF v_pasta IS NULL THEN RAISE EXCEPTION 'Documento esperado inativo ou inexistente'; END IF;
  ELSIF v_pasta NOT IN ('cupons','outros') THEN RAISE EXCEPTION 'Documento avulso vai para cupons ou outros';
  END IF;
  IF p_storage_path NOT LIKE 'despesas/' || to_char(v_ini,'YYYY-MM') || '/' || v_pasta || '/%' OR p_storage_path LIKE '%..%' THEN RAISE EXCEPTION 'Caminho do documento inválido'; END IF;
  IF p_sha256 !~ '^[a-f0-9]{64}$' OR p_bytes <= 0 OR nullif(trim(p_nome),'') IS NULL THEN RAISE EXCEPTION 'Metadados do arquivo inválidos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'contabil' AND name = p_storage_path) THEN RAISE EXCEPTION 'Arquivo não encontrado no armazenamento'; END IF;
  IF p_tipo_id IS NOT NULL THEN UPDATE contabil_documento_despesa SET vigente = false WHERE competencia = v_ini AND tipo_id = p_tipo_id AND vigente; END IF;
  INSERT INTO contabil_documento_despesa (competencia, tipo_id, pasta, storage_path, nome_arquivo, sha256, bytes, descricao, enviado_por)
  VALUES (v_ini, p_tipo_id, v_pasta, p_storage_path, p_nome, p_sha256, p_bytes, nullif(trim(coalesce(p_descricao,'')),''), auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_documento_despesa_guardar(date,uuid,text,text,text,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_documento_despesa_guardar(date,uuid,text,text,text,text,bigint,text) TO authenticated, service_role;
