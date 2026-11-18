DO $migration$
DECLARE v text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO v FROM pg_constraint WHERE conrelid='public.pedido_eventos'::regclass AND conname='pedido_eventos_tipo_evento_check';
 IF v IS NULL OR v NOT LIKE '%NOT VALID' THEN RAISE EXCEPTION 'Trava de eventos ausente ou diferente de NOT VALID.'; END IF;
 v := replace(v,'ARRAY[','ARRAY[''mesa_aguardando_item''::text, ''mesa_item_chegou''::text, ');
 ALTER TABLE public.pedido_eventos DROP CONSTRAINT pedido_eventos_tipo_evento_check;
 EXECUTE 'ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_tipo_evento_check '||v;
END $migration$;
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_aguardar_item(p_pedido_id uuid,p_itens jsonb,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_p record; v_ultimo text; v_item jsonb; v_sku text; v_qtd numeric; v_pedida numeric; v_nome text; v_fisico numeric; v_itens jsonb := '[]'; v_etapa text;
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE='42501'; END IF;
 SELECT p.id,p.estagio,p.origem_centro_id INTO v_p FROM public.pedidos p WHERE p.id=p_pedido_id FOR UPDATE;
 IF v_p.id IS NULL THEN RAISE EXCEPTION 'Pedido % não existe.',p_pedido_id; END IF;
 PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
 IF v_p.estagio <> 'em_separacao' THEN RAISE EXCEPTION 'Aguardar item só na Mesa em separação (pedido em "%").',v_p.estagio; END IF;
 SELECT e.tipo_evento INTO v_ultimo FROM public.pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento LIKE 'mesa\_%' ORDER BY e.criado_em DESC,e.id DESC LIMIT 1;
 IF v_ultimo IS NULL OR v_ultimo NOT IN ('mesa_separacao_iniciada','mesa_voltou_separacao','mesa_item_chegou','mesa_conferencia_iniciada') THEN RAISE EXCEPTION 'Pedido não está em separação ou conferência (último passo: %).',coalesce(v_ultimo,'nenhum'); END IF;
 IF length(btrim(coalesce(p_motivo,''))) < 5 THEN RAISE EXCEPTION 'Informe motivo com pelo menos 5 caracteres.'; END IF;
 IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Itens faltantes devem ser um array não vazio.'; END IF;
 IF jsonb_array_length(p_itens)=0 THEN RAISE EXCEPTION 'Selecione ao menos um item faltante.'; END IF;
 IF v_p.origem_centro_id IS NULL THEN RAISE EXCEPTION 'Pedido sem CD de origem para registrar o saldo físico.'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
  IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR jsonb_typeof(v_item->'sku') IS DISTINCT FROM 'string' OR jsonb_typeof(v_item->'quantidade') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Cada item deve conter SKU e quantidade numérica positiva.'; END IF;
  v_sku := btrim(v_item->>'sku'); v_qtd := (v_item->>'quantidade')::numeric;
  IF v_sku='' OR v_qtd<=0 THEN RAISE EXCEPTION 'SKU e quantidade positiva são obrigatórios.'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_itens) i WHERE i->>'sku'=v_sku) THEN RAISE EXCEPTION 'SKU % repetido na lista de faltantes.',v_sku; END IF;
  SELECT sum(pi.quantidade),(array_agg(pi.descricao ORDER BY pi.ordem,pi.id))[1] INTO v_pedida,v_nome FROM public.pedido_itens pi WHERE pi.pedido_id=p_pedido_id AND pi.sku=v_sku;
  IF v_pedida IS NULL THEN RAISE EXCEPTION 'SKU % não pertence ao pedido.',v_sku; END IF;
  IF v_qtd>v_pedida THEN RAISE EXCEPTION 'Quantidade faltante de % excede a quantidade do pedido (%).',v_sku,v_pedida; END IF;
  SELECT ec.fisico_sadio INTO v_fisico FROM public.vw_estoque_centro ec WHERE ec.sku=v_sku AND ec.centro_id=v_p.origem_centro_id;
  IF v_fisico IS NULL THEN RAISE EXCEPTION 'Saldo físico indisponível para SKU % no CD do pedido.',v_sku; END IF;
  v_itens := v_itens || jsonb_build_array(jsonb_build_object('sku',v_sku,'nome',v_nome,'quantidade',v_qtd,'fisico_no_cd_no_registro',v_fisico));
 END LOOP;
 v_etapa := CASE WHEN v_ultimo='mesa_conferencia_iniciada' THEN 'conferencia' ELSE 'separacao' END;
 INSERT INTO public.pedido_eventos(pedido_id,tipo_evento,descricao,metadata,automatico,ator_tipo,ator_origem) VALUES(p_pedido_id,'mesa_aguardando_item','Mesa SP: aguardando item — '||(SELECT string_agg(i->>'sku',', ') FROM jsonb_array_elements(v_itens) i)||' — '||btrim(p_motivo),jsonb_build_object('itens',v_itens,'motivo',btrim(p_motivo),'etapa_origem',v_etapa,'auth_uid',auth.uid()),false,'humano','mesa_sp');
 RETURN jsonb_build_object('ok',true,'etapa','aguardando_item');
END $function$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_aguardar_item(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_aguardar_item(uuid,jsonb,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_item_chegou(p_pedido_id uuid,p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_estagio text; v_evento record;
BEGIN
 IF coalesce(auth.role(),'') IN ('anon','authenticated') AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE='42501'; END IF;
 SELECT p.estagio INTO v_estagio FROM public.pedidos p WHERE p.id=p_pedido_id FOR UPDATE;
 IF v_estagio IS NULL THEN RAISE EXCEPTION 'Pedido % não existe.',p_pedido_id; END IF;
 PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
 IF v_estagio <> 'em_separacao' THEN RAISE EXCEPTION 'Confirmar item só na Mesa em separação.'; END IF;
 SELECT e.tipo_evento,e.metadata INTO v_evento FROM public.pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento LIKE 'mesa\_%' ORDER BY e.criado_em DESC,e.id DESC LIMIT 1;
 IF v_evento.tipo_evento IS DISTINCT FROM 'mesa_aguardando_item' THEN RAISE EXCEPTION 'Pedido não está aguardando item.'; END IF;
 INSERT INTO public.pedido_eventos(pedido_id,tipo_evento,descricao,metadata,automatico,ator_tipo,ator_origem) VALUES(p_pedido_id,'mesa_item_chegou','Mesa SP: item chegou, voltou para separação',jsonb_build_object('itens',v_evento.metadata->'itens','observacao',nullif(btrim(p_observacao),''),'auth_uid',auth.uid()),false,'humano','mesa_sp');
 RETURN jsonb_build_object('ok',true,'etapa','separacao');
END $function$;
REVOKE ALL ON FUNCTION public.fn_mesa_sp_item_chegou(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_item_chegou(uuid,text) TO authenticated,service_role;
DO $migration$
DECLARE v text; old text; sig text;
BEGIN
 v := pg_get_viewdef('public.vw_mesa_sp_quadro'::regclass,true); old := v;
 v := replace(v,'ELSE ''separacao''::text','WHEN ul.tipo_evento = ''mesa_aguardando_item''::text THEN ''aguardando_item''::text ELSE ''separacao''::text');
 IF v=old THEN RAISE EXCEPTION 'CASE da etapa não encontrado.'; END IF;
 v := replace(v,' AS liberado_para_postar',$append$ AS liberado_para_postar,
 CASE WHEN d.etapa='aguardando_item' THEN espera.metadata->'itens' ELSE NULL END AS itens_faltando,
 CASE WHEN d.etapa='aguardando_item' AND jsonb_array_length(coalesce(espera.metadata->'itens','[]'::jsonb))>0 THEN
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(espera.metadata->'itens') i LEFT JOIN public.vw_estoque_centro ec ON ec.sku=i->>'sku' AND ec.centro_id=d.origem_centro_id WHERE ec.fisico_sadio IS NULL OR (i->>'fisico_no_cd_no_registro') IS NULL OR ec.fisico_sadio <= (i->>'fisico_no_cd_no_registro')::numeric)
 ELSE false END AS item_pode_ter_chegado$append$);
 v := replace(v,'FROM derivado d',$join$FROM derivado d LEFT JOIN LATERAL(SELECT e.metadata FROM public.pedido_eventos e WHERE e.pedido_id=d.id AND e.tipo_evento='mesa_aguardando_item' ORDER BY e.criado_em DESC,e.id DESC LIMIT 1) espera ON true$join$);
 EXECUTE 'CREATE OR REPLACE VIEW public.vw_mesa_sp_quadro AS '||v;
 v := pg_get_functiondef('public.fn_mesa_sp_iniciar_conferencia(uuid)'::regprocedure);
 v := replace(v,'''mesa_conferencia_divergencia'',''mesa_voltou_separacao''','''mesa_conferencia_divergencia'',''mesa_voltou_separacao'',''mesa_item_chegou''');
 v := replace(v,'where id = p_pedido_id;','where id = p_pedido_id FOR UPDATE;'); EXECUTE v;
 FOREACH sig IN ARRAY ARRAY['public.fn_mesa_sp_registrar_conferencia(uuid,jsonb,boolean,text)','public.fn_mesa_sp_embalar(uuid,numeric,integer,text,jsonb,text,jsonb)','public.fn_mesa_sp_entregar_transferencia(uuid,text)'] LOOP
  v := pg_get_functiondef(sig::regprocedure); old := v;
  v := replace(v,E'BEGIN\n',E'BEGIN\n  PERFORM 1 FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;\n  IF (SELECT e.tipo_evento FROM public.pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento LIKE ''mesa\\_%'' ORDER BY e.criado_em DESC,e.id DESC LIMIT 1) = ''mesa_aguardando_item'' THEN\n    RAISE EXCEPTION ''Pedido aguardando item — confirme a chegada antes de avançar.'';\n  END IF;\n');
  IF v=old THEN RAISE EXCEPTION 'Guarda não aplicada em %.',sig; END IF;
  IF sig LIKE '%fn_mesa_sp_embalar%' THEN v := replace(v,'e.tipo_evento=''mesa_conferencia_ok''','e.tipo_evento=''mesa_conferencia_ok'' AND e.criado_em > coalesce((SELECT max(x.criado_em) FROM public.pedido_eventos x WHERE x.pedido_id=p_pedido_id AND x.tipo_evento IN (''mesa_aguardando_item'',''mesa_item_chegou'')), ''-infinity'')');
  ELSIF sig LIKE '%fn_mesa_sp_entregar_transferencia%' THEN v := replace(v,'''mesa_devolvido_fila'',''mesa_voltou_separacao''','''mesa_devolvido_fila'',''mesa_voltou_separacao'',''mesa_aguardando_item'',''mesa_item_chegou'''); END IF;
  EXECUTE v;
 END LOOP;
END $migration$;