CREATE OR REPLACE FUNCTION public.fn_mesa_sp_despachar_lote(p_modal text, p_itens jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- 28/10/2026 MESA-SP-LOTE-BIPE: lote com referência por pedido; chama fn_mesa_sp_despachar pedido a pedido
-- (mesma regra do unitário: Correios exige bipe, substitui anterior, trava código de outro pedido).
DECLARE v_modal record; v_item jsonb; v_id uuid; v_ref text; v_cod text; v_ok int := 0;
        v_falhas jsonb := '[]'::jsonb; v_res jsonb := '[]'::jsonb; v_vistos text[] := '{}'; v_erro text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon','authenticated')
     AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN
    RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_modal FROM b2c_modal_entrega WHERE codigo = p_modal AND ativo;
  IF v_modal.codigo IS NULL THEN RAISE EXCEPTION 'Modal "%" inexistente ou inativo.', p_modal; END IF;
  IF v_modal.sem_despacho THEN RAISE EXCEPTION 'Modal "%" nao se despacha: e retirada no balcao — registre a retirada em Pedidos Site SP.', v_modal.nome; END IF;
  IF NOT v_modal.tem_rastreio_automatico THEN
    RAISE EXCEPTION 'Modal % exige referência por pedido (ID da corrida / portador) — despache um a um.', p_modal;
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Nenhum pedido selecionado para a coleta.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_id := nullif(v_item->>'pedido_id','')::uuid;
    v_ref := nullif(btrim(coalesce(v_item->>'referencia','')), '');
    v_erro := NULL;
    IF v_modal.exige_etiqueta_correios THEN
      v_cod := upper(regexp_replace(coalesce(v_ref,''), '\s', '', 'g'));
      IF v_cod <> '' AND v_cod = ANY(v_vistos) THEN
        v_erro := 'Código ' || v_cod || ' repetido dentro do lote.';
      ELSIF v_cod <> '' THEN
        v_vistos := v_vistos || v_cod;
      END IF;
    END IF;
    IF v_erro IS NULL THEN
      BEGIN
        PERFORM public.fn_mesa_sp_despachar(v_id, p_modal, v_ref);
        v_ok := v_ok + 1;
      EXCEPTION WHEN OTHERS THEN v_erro := SQLERRM;
      END;
    END IF;
    v_res := v_res || jsonb_build_object('pedido_id', v_id,
      'id_externo', (SELECT id_externo FROM pedidos WHERE id = v_id),
      'referencia', v_ref, 'ok', v_erro IS NULL, 'erro', v_erro);
    IF v_erro IS NOT NULL THEN
      v_falhas := v_falhas || jsonb_build_object('pedido_id', v_id,
        'id_externo', (SELECT id_externo FROM pedidos WHERE id = v_id), 'erro', v_erro);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('modal', p_modal, 'despachados', v_ok, 'falhas', v_falhas,
                            'itens', v_res, 'total', jsonb_array_length(p_itens));
END $function$;

-- Versão antiga (uuid[]) passa a delegar para a nova, sem referência (modais não-Correios seguem iguais).
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_despachar_lote(p_modal text, p_pedido_ids uuid[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.fn_mesa_sp_despachar_lote(p_modal,
    coalesce((SELECT jsonb_agg(jsonb_build_object('pedido_id', x)) FROM unnest(p_pedido_ids) x), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.fn_mesa_sp_despachar_lote(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mesa_sp_despachar_lote(text, jsonb) TO authenticated, service_role;