DO $migration$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conrelid='public.pedido_eventos'::regclass AND conname='pedido_eventos_tipo_evento_check';
  IF v_def IS NULL THEN RAISE EXCEPTION 'Check de eventos não encontrado'; END IF;
  IF position('''bling_reenvio''' in v_def)=0 THEN
    v_def := replace(v_def, 'ARRAY[', 'ARRAY[''bling_reenvio''::text, ');
    ALTER TABLE public.pedido_eventos DROP CONSTRAINT pedido_eventos_tipo_evento_check;
    EXECUTE 'ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_tipo_evento_check ' || regexp_replace(v_def, '\s+NOT VALID$', '') || ' NOT VALID';
  END IF;
END $migration$;

CREATE OR REPLACE FUNCTION public.fn_bling_reenvio_verificado_preparar(p_pedido_id uuid, p_bling_id_anterior text, p_situacao_bling text, p_motivo text, p_usuario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $function$
DECLARE v_p public.pedidos%ROWTYPE; v_evento uuid;
BEGIN
  IF p_usuario IS NULL OR NOT public.usuario_tem_acao('acao.enviar_bling', p_usuario) OR public.nivel_do_usuario(p_usuario)<2 THEN
    RAISE EXCEPTION 'Sem permissão para reenviar ao Bling. Ação do time de Operações.' USING ERRCODE='42501';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo))<10 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 10 caracteres).'; END IF;
  IF p_situacao_bling NOT IN ('Cancelado','Excluído (404)') THEN RAISE EXCEPTION 'Cancelamento no Bling não confirmado'; END IF;
  SELECT * INTO v_p FROM public.pedidos WHERE id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_p.bling_id_destino IS NULL OR v_p.bling_id_destino::text IS DISTINCT FROM p_bling_id_anterior THEN
    RAISE EXCEPTION 'Vínculo Bling mudou durante a conferência — reabra o pedido.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.nfs_emitidas n WHERE (n.pedido_venda_id=p_pedido_id OR n.bling_pedido_venda_id=p_bling_id_anterior)
    AND n.tipo='saida' AND (n.situacao IS NULL OR n.situacao NOT IN ('cancelada','rejeitada','denegada'))
    AND n.anulada_por_devolucao_em IS NULL AND n.substituida_por_nf_id IS NULL) THEN
    RAISE EXCEPTION 'Pedido já tem NF — corrija pela NF, não reenviando o pedido';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pedido_remessa WHERE pedido_id=p_pedido_id AND status<>'cancelada'
    AND (bling_pedido_id IS NULL OR bling_pedido_id<>p_bling_id_anterior)) THEN
    RAISE EXCEPTION 'Pedido possui outras tentativas vivas — confira as remessas antes de reenviar.';
  END IF;
  INSERT INTO public.pedido_eventos(pedido_id,tipo_evento,descricao,metadata,operador_id,automatico,ator_tipo,ator_origem)
    VALUES(p_pedido_id,'bling_reenvio','Reenvio ao Bling: '||p_bling_id_anterior||' → aguardando envio · '||btrim(p_motivo),
      jsonb_build_object('bling_id_anterior',p_bling_id_anterior,'situacao_bling',p_situacao_bling,'motivo',btrim(p_motivo),'usuario',p_usuario),p_usuario,false,'humano','bling_reenvio') RETURNING id INTO v_evento;
  UPDATE public.pedido_remessa SET status='cancelada' WHERE pedido_id=p_pedido_id AND bling_pedido_id=p_bling_id_anterior AND status<>'cancelada';
  UPDATE public.pedidos SET bling_id_destino=NULL,bling_enviado_em=NULL,bling_enviado_por=NULL,bling_envio_erro=NULL WHERE id=p_pedido_id;
  RETURN jsonb_build_object('evento_id',v_evento);
END $function$;
REVOKE ALL ON FUNCTION public.fn_bling_reenvio_verificado_preparar(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bling_reenvio_verificado_preparar(uuid,text,text,text,uuid) TO service_role;