ALTER TABLE public.nfs_emitidas
  ADD COLUMN IF NOT EXISTS transferencia_ignorada_em timestamptz,
  ADD COLUMN IF NOT EXISTS transferencia_ignorada_por uuid,
  ADD COLUMN IF NOT EXISTS transferencia_ignorada_motivo text;

CREATE OR REPLACE FUNCTION public._nf_fetely_parceiro(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.parceiros_comerciais pc
    WHERE pc.id = p AND left(regexp_replace(coalesce(pc.cnpj,''),'\D','','g'),8) = '63591078');
$$;

CREATE OR REPLACE VIEW public.vw_nf_fetely_orfa WITH (security_invoker = true) AS
SELECT n.id, n.numero, n.serie, n.situacao, n.data_emissao, n.emitente_cnpj,
  cd.id AS origem_centro_id, cd.codigo AS origem_codigo, cd.rotulo_curto AS origem_rotulo,
  (SELECT array_agg(DISTINCT i->>'cfop' ORDER BY i->>'cfop') FROM jsonb_array_elements(coalesce(n.itens_json,'[]'::jsonb)) i) AS cfops,
  jsonb_array_length(coalesce(n.itens_json,'[]'::jsonb)) AS qtd_itens,
  (SELECT coalesce(sum((i->>'quantidade')::numeric),0) FROM jsonb_array_elements(coalesce(n.itens_json,'[]'::jsonb)) i) AS pecas,
  n.valor_nota, n.chave_acesso, n.pdf_url,
  n.transferencia_ignorada_em, n.transferencia_ignorada_por, n.transferencia_ignorada_motivo,
  (n.transferencia_ignorada_em IS NOT NULL) AS ignorada
FROM public.nfs_emitidas n
LEFT JOIN public.centro_distribuicao cd ON cd.cnpj_emitente = n.emitente_cnpj
WHERE n.tipo = 'saida'
  AND public._nf_fetely_parceiro(n.parceiro_id)
  AND n.pedido_venda_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.transferencia_remessa_vinculo v WHERE v.nf_remessa_id = n.id);

GRANT SELECT ON public.vw_nf_fetely_orfa TO authenticated;
GRANT SELECT ON public.vw_nf_fetely_orfa TO service_role;

CREATE OR REPLACE FUNCTION public._nf_fetely_exigir_permissao() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT (public.has_role(auth.uid(),'super_admin') OR coalesce(public.usuario_tem_acao('acao.transferencia_criar', auth.uid()), false)) THEN
    RAISE EXCEPTION 'Sem permissão para tratar NFs Fetely→Fetely (acao.transferencia_criar).' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_nf_fetely_ignorar(p_nf_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._nf_fetely_exigir_permissao();
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo para ignorar a NF.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vw_nf_fetely_orfa WHERE id = p_nf_id AND NOT ignorada) THEN
    RAISE EXCEPTION 'NF não está na lista de NFs Fetely→Fetely sem pedido (ou já ignorada).' USING ERRCODE='22023';
  END IF;
  UPDATE public.nfs_emitidas SET transferencia_ignorada_em = now(), transferencia_ignorada_por = auth.uid(),
    transferencia_ignorada_motivo = btrim(p_motivo) WHERE id = p_nf_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.fn_nf_fetely_desfazer_ignorar(p_nf_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._nf_fetely_exigir_permissao();
  UPDATE public.nfs_emitidas SET transferencia_ignorada_em = NULL, transferencia_ignorada_por = NULL,
    transferencia_ignorada_motivo = NULL WHERE id = p_nf_id AND transferencia_ignorada_em IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NF não estava ignorada.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.fn_nf_fetely_virar_transferencia(
  p_nf_id uuid, p_destino_codigo text, p_finalidade_codigo text, p_observacao text, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_nf record; v_fin record; v_dest record; v_orig record;
  v_faltando text[]; v_json jsonb := '[]'::jsonb; v_it jsonb; v_custo numeric; v_desc text;
  v_bruto numeric := 0; v_pecas numeric := 0; v_parceiro uuid; v_natureza uuid;
  v_pedido uuid; v_idext text; v_n int;
BEGIN
  PERFORM public._nf_fetely_exigir_permissao();

  SELECT o.*, n.itens_json INTO v_nf FROM public.vw_nf_fetely_orfa o JOIN public.nfs_emitidas n ON n.id = o.id WHERE o.id = p_nf_id;
  IF v_nf.id IS NULL THEN RAISE EXCEPTION 'NF não é Fetely→Fetely sem pedido (já tem pedido, é remessa vinculada ou não existe).' USING ERRCODE='22023'; END IF;
  IF v_nf.ignorada THEN RAISE EXCEPTION 'NF % está ignorada — desfaça antes de virar transferência.', v_nf.numero USING ERRCODE='22023'; END IF;
  IF v_nf.situacao IS DISTINCT FROM 'autorizada' THEN
    RAISE EXCEPTION 'NF % está % — só NF autorizada pode virar transferência.', v_nf.numero, coalesce(v_nf.situacao,'sem situação') USING ERRCODE='22023';
  END IF;
  SELECT id, codigo, rotulo_curto INTO v_orig FROM public.centro_distribuicao WHERE id = v_nf.origem_centro_id;
  IF v_orig.id IS NULL THEN RAISE EXCEPTION 'Origem não resolvida: nenhum CD com CNPJ emitente %.', coalesce(v_nf.emitente_cnpj,'vazio') USING ERRCODE='22023'; END IF;

  SELECT id, codigo, rotulo_curto INTO v_dest FROM public.centro_distribuicao
   WHERE codigo = p_destino_codigo AND ativo AND tipo IN ('armazem','showroom');
  IF v_dest.id IS NULL THEN RAISE EXCEPTION 'Destino inválido ou inativo: %', coalesce(p_destino_codigo,'vazio') USING ERRCODE='22023'; END IF;
  IF v_dest.id = v_orig.id THEN RAISE EXCEPTION 'Origem e destino são o mesmo CD (%).', v_orig.rotulo_curto USING ERRCODE='22023'; END IF;

  SELECT id, codigo, rotulo, exige_descricao, automatica INTO v_fin FROM public.transferencia_finalidade
   WHERE ativo AND codigo = nullif(btrim(coalesce(p_finalidade_codigo,'')),'');
  IF v_fin.id IS NULL THEN RAISE EXCEPTION 'Informe a finalidade da transferencia (%).', coalesce(p_finalidade_codigo,'vazia') USING ERRCODE='22023'; END IF;
  IF v_fin.automatica THEN RAISE EXCEPTION 'A finalidade % e definida pelo sistema e nao pode ser escolhida manualmente.', v_fin.rotulo USING ERRCODE='22023'; END IF;
  IF v_fin.exige_descricao AND nullif(btrim(coalesce(p_observacao,'')),'') IS NULL THEN
    RAISE EXCEPTION 'A finalidade % exige descricao.', v_fin.rotulo USING ERRCODE='22023';
  END IF;

  SELECT array_agg(DISTINCT coalesce(i->>'codigo','(sem código)')) INTO v_faltando
  FROM jsonb_array_elements(coalesce(v_nf.itens_json,'[]'::jsonb)) i
  WHERE NOT EXISTS (SELECT 1 FROM public.sncf_produtos sp WHERE sp.sku = i->>'codigo');

  IF jsonb_array_length(coalesce(v_nf.itens_json,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'NF % não tem itens.', v_nf.numero USING ERRCODE='22023';
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_nf.itens_json) LOOP
    v_custo := NULL; v_desc := NULL;
    SELECT preco_custo, coalesce(nullif(btrim(nome_comercial),''), nome_completo) INTO v_custo, v_desc
      FROM public.sncf_produtos WHERE sku = v_it->>'codigo';
    v_json := v_json || jsonb_build_array(jsonb_build_object(
      'sku', v_it->>'codigo', 'descricao', coalesce(v_desc, v_it->>'descricao', v_it->>'codigo'),
      'quantidade', coalesce((v_it->>'quantidade')::numeric,0), 'valor_unitario', coalesce(v_custo,0),
      'existe_no_catalogo', v_desc IS NOT NULL OR v_custo IS NOT NULL OR EXISTS (SELECT 1 FROM public.sncf_produtos WHERE sku = v_it->>'codigo')));
    v_bruto := v_bruto + round(coalesce((v_it->>'quantidade')::numeric,0) * coalesce(v_custo,0), 2);
    v_pecas := v_pecas + coalesce((v_it->>'quantidade')::numeric,0);
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object('ok', v_faltando IS NULL, 'dry_run', true, 'nf_numero', v_nf.numero,
      'origem', v_orig.rotulo_curto, 'origem_codigo', v_orig.codigo, 'destino', v_dest.rotulo_curto, 'destino_codigo', v_dest.codigo,
      'finalidade', v_fin.rotulo, 'itens', v_json, 'qtd_itens', jsonb_array_length(v_json), 'pecas', v_pecas,
      'valor_custo', v_bruto, 'valor_nota', v_nf.valor_nota, 'skus_faltando', coalesce(to_jsonb(v_faltando), '[]'::jsonb));
  END IF;

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'SKU(s) nao encontrado(s) no catalogo: %', array_to_string(v_faltando, ', ') USING ERRCODE='22023';
  END IF;

  SELECT id INTO v_parceiro FROM public.parceiros_comerciais WHERE cnpj = '63591078000148';
  IF v_parceiro IS NULL THEN RAISE EXCEPTION 'Parceiro Fetely (0148) nao encontrado'; END IF;
  SELECT id INTO v_natureza FROM public.naturezas_operacao WHERE codigo = 'transferencia_interna' AND ativo;
  IF v_natureza IS NULL THEN RAISE EXCEPTION 'Natureza transferencia_interna nao cadastrada ou inativa'; END IF;

  -- remove a marca auxiliar antes de gravar
  SELECT jsonb_agg(x - 'existe_no_catalogo') INTO v_json FROM jsonb_array_elements(v_json) x;

  v_idext := 'TRS-' || lpad(nextval('public.seq_pedido_transferencia')::text, 4, '0');
  INSERT INTO public.pedidos (
    id_externo, parceiro_id, natureza_operacao_id, canal, origem, recebido_via,
    data_pedido, condicao_solicitada, forma_solicitada, valor_bruto, valor_liquido,
    origem_centro_id, destino_centro_id, destino_interno, observacao_pedido, itens_json, transferencia_finalidade_id
  ) VALUES (
    v_idext, v_parceiro, v_natureza, 'interno', 'outro', 'manual',
    coalesce(v_nf.data_emissao, CURRENT_DATE), 'Transferencia interna - sem cobranca', 'sem_pagamento', v_bruto, v_bruto,
    v_orig.id, v_dest.id, v_dest.rotulo_curto, p_observacao, v_json, v_fin.id
  ) RETURNING id INTO v_pedido;

  SELECT count(*) INTO v_n FROM public.pedido_itens WHERE pedido_id = v_pedido;
  IF v_n <> jsonb_array_length(v_json) THEN
    RAISE EXCEPTION 'Materializacao dos itens falhou: % no json, % na tabela', jsonb_array_length(v_json), v_n;
  END IF;

  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico)
  VALUES (v_pedido, 'mudou_estagio', NULL, 'recebido',
    'TRS criada a partir da NF ' || v_nf.numero || ' já emitida (Fetely→Fetely sem pedido) - ' || v_orig.rotulo_curto || ' → ' || v_dest.rotulo_curto || ' - finalidade: ' || v_fin.rotulo,
    jsonb_build_object('nf_id', v_nf.id, 'nf_numero', v_nf.numero, 'origem_codigo', v_orig.codigo, 'destino_codigo', v_dest.codigo,
      'finalidade', v_fin.codigo, 'qtd_itens', jsonb_array_length(v_json), 'valor_bruto', v_bruto, 'criado_por', auth.uid()), true);

  UPDATE public.nfs_emitidas SET pedido_venda_id = v_pedido WHERE id = v_nf.id;

  UPDATE public.pedidos SET estagio = 'em_transporte' WHERE id = v_pedido;
  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, automatico)
  VALUES (v_pedido, 'mudou_estagio', 'recebido', 'em_transporte',
    'NF ' || v_nf.numero || ' já emitida: direto para Em transporte (não vai ao Bling nem à XPM). Entrada no destino pelo "Receber no destino".', true);

  RETURN jsonb_build_object('ok', true, 'dry_run', false, 'pedido_id', v_pedido, 'id_externo', v_idext,
    'nf_numero', v_nf.numero, 'origem', v_orig.rotulo_curto, 'destino', v_dest.rotulo_curto, 'pecas', v_pecas, 'valor_custo', v_bruto);
END $$;

REVOKE ALL ON FUNCTION public.fn_nf_fetely_ignorar(uuid,text), public.fn_nf_fetely_desfazer_ignorar(uuid),
  public.fn_nf_fetely_virar_transferencia(uuid,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nf_fetely_ignorar(uuid,text), public.fn_nf_fetely_desfazer_ignorar(uuid),
  public.fn_nf_fetely_virar_transferencia(uuid,text,text,text,boolean) TO authenticated, service_role;