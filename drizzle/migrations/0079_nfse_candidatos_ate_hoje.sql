CREATE OR REPLACE FUNCTION public.fn_contabil_nfse_pagamento_candidatos(p_nfs_stage_id uuid, p_valor_liquido numeric)
RETURNS TABLE (movimentacao_id uuid, data_transacao date, valor numeric, descricao text, contraparte_nome text, conta text, exato boolean, mesmo_favorecido boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emissao date; v_cnpj text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.pode_ler_tabela('remessas_contador') THEN RAISE EXCEPTION 'Sem permissão para o pacote do contador'; END IF;
  SELECT nf_data_emissao::date, regexp_replace(coalesce(fornecedor_cnpj,''),'\D','','g') INTO v_emissao, v_cnpj FROM nfs_stage WHERE id = p_nfs_stage_id;
  IF v_emissao IS NULL THEN RAISE EXCEPTION 'NFS-e não encontrada ou sem data de emissão'; END IF;
  -- 05/11/2026: retenção é devida pela data do pagamento; janela vai da emissão − 5 dias até hoje (sem teto de +45).
  RETURN QUERY
  SELECT m.id, m.data_transacao::date, abs(m.valor), m.descricao, m.contraparte_nome, cb.nome_exibicao,
         abs(abs(m.valor) - p_valor_liquido) <= 0.01,
         v_cnpj <> '' AND regexp_replace(coalesce(m.contraparte_documento,''),'\D','','g') = v_cnpj
    FROM movimentacoes_bancarias m LEFT JOIN contas_bancarias cb ON cb.id = m.conta_bancaria_id
   WHERE m.valor < 0 AND m.duplicada_de IS NULL
     AND m.data_transacao BETWEEN v_emissao - 5 AND current_date
     AND abs(abs(m.valor) - p_valor_liquido) <= greatest(0.01, p_valor_liquido * 0.10)
     AND NOT EXISTS (SELECT 1 FROM contabil_nfse_pagamento x WHERE x.movimentacao_id = m.id AND x.vigente AND x.nfs_stage_id <> p_nfs_stage_id)
   ORDER BY 7 DESC, 8 DESC, abs(abs(m.valor) - p_valor_liquido), m.data_transacao
   LIMIT 30;
END $$;