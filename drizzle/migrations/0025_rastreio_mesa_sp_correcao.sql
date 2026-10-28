ALTER TABLE public.pedido_eventos DROP CONSTRAINT pedido_eventos_tipo_evento_check;
ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_tipo_evento_check CHECK (tipo_evento = ANY (ARRAY['alterado'::text, 'anotacao'::text, 'atencao_limpa'::text, 'atencao_marcada'::text, 'cancelado'::text, 'credito_pendente_cliente'::text, 'em_transporte'::text, 'entregue'::text, 'erro_automacao'::text, 'faturado'::text, 'itens_editados'::text, 'msg_comercial'::text, 'msg_sops'::text, 'mudou_estagio'::text, 'outro'::text, 'pagamento_confirmado'::text, 'alerta_disparado'::text, 'pedido_clonado'::text, 'pedido_substituicao'::text, 'devolucao'::text, 'baixa_por_perda'::text, 'devolucao_estornada'::text, 'urgencia_alterada'::text, 'xpm_push_forcado'::text, 'xpm_cancelamento_declarado'::text, 'ancora_declarada'::text, 'bling_enviado'::text, 'roteado_mesa_sp'::text, 'mesa_separacao_iniciada'::text, 'mesa_conferencia_ok'::text, 'mesa_conferencia_divergencia'::text, 'mesa_embalado'::text, 'mesa_despachado'::text, 'devolucao_recebida'::text, 'devolucao_reversa'::text, 'devolucao_recebimento_estornado'::text, 'mesa_devolvido_fila'::text, 'mesa_encerrado_cancelamento'::text, 'cd_expedicao_escolhido'::text, 'mesa_conferencia_iniciada'::text, 'mesa_voltou_separacao'::text, 'mesa_documentos_ok'::text, 'mesa_nf_solicitada'::text, 'mesa_rastreio_registrado'::text, 'cd_falta_aceita'::text, 'cd_falta_corrigida'::text, 'mesa_modal_trocado'::text, 'mesa_postagem_agencia'::text, 'mesa_rastreio_substituido'::text, 'rastreio_substituido'::text, 'shopify_rastreio_atualizado'::text])) NOT VALID;

DROP FUNCTION IF EXISTS public.fn_registrar_rastreio_pedido(uuid, text, text);
CREATE FUNCTION public.fn_registrar_rastreio_pedido(p_pedido_id uuid, p_codigo_rastreio text, p_servico text DEFAULT NULL::text, p_origem text DEFAULT 'manual_dados_envio')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- 28/10/2026 RASTREIO-MESA-SP: origem explícita (bling_etiqueta | manual_dados_envio). Cron não aparece
-- como "registrado manualmente". Manual no B2C SUBSTITUI o código anterior (B2B mantém vários volumes).
declare
  v_codigo text; v_id_externo text; v_canal text; v_existente_pedido_id uuid; v_rastreio_id uuid;
  v_origem text := coalesce(nullif(btrim(p_origem),''), 'manual_dados_envio');
  v_antigos jsonb; v_manual boolean;
begin
  if v_origem not in ('manual_dados_envio','bling_etiqueta') then
    raise exception 'Origem de rastreio "%" desconhecida (use manual_dados_envio ou bling_etiqueta).', v_origem;
  end if;
  v_manual := v_origem = 'manual_dados_envio';
  v_codigo := upper(trim(p_codigo_rastreio));

  select id_externo, canal into v_id_externo, v_canal from pedidos where id = p_pedido_id;
  if v_id_externo is null then
    raise exception 'Pedido % nao encontrado', p_pedido_id;
  end if;

  if v_codigo !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' then
    raise exception 'Codigo "%" nao parece um codigo de rastreio valido (formato esperado: AA123456789BR). Confira e tente de novo.', v_codigo
      using errcode = 'P0001';
  end if;

  select pedido_id into v_existente_pedido_id from pedido_rastreamento where codigo_rastreio = v_codigo;
  if v_existente_pedido_id is not null and v_existente_pedido_id <> p_pedido_id then
    raise exception 'Codigo % ja esta vinculado a outro pedido. Confira se digitou certo.', v_codigo
      using errcode = 'P0001';
  end if;

  if v_manual and coalesce(v_canal,'') <> 'B2B' then
    select jsonb_agg(jsonb_build_object('codigo', r.codigo_rastreio, 'servico', r.servico, 'status', r.status_atual, 'criado_em', r.criado_em))
      into v_antigos
      from pedido_rastreamento r where r.pedido_id = p_pedido_id and r.codigo_rastreio <> v_codigo;
    if v_antigos is not null then
      delete from pedido_rastreamento where pedido_id = p_pedido_id and codigo_rastreio <> v_codigo;
      insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
      values (p_pedido_id, 'rastreio_substituido',
        format('Codigo de rastreio substituido manualmente: %s -> %s',
               (select string_agg(x->>'codigo', ', ') from jsonb_array_elements(v_antigos) x), v_codigo),
        jsonb_build_object('fonte','manual_dados_envio','codigo_novo', v_codigo, 'codigos_antigos', v_antigos, 'auth_uid', auth.uid()),
        false, 'humano', 'dados_envio');
    end if;
  end if;

  insert into pedido_rastreamento (codigo_rastreio, pedido_id, servico)
  values (v_codigo, p_pedido_id, p_servico)
  on conflict (codigo_rastreio) do update
    set pedido_id = excluded.pedido_id,
        servico = coalesce(excluded.servico, pedido_rastreamento.servico)
  returning id into v_rastreio_id;

  if v_manual then
    insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
    values (p_pedido_id, 'anotacao',
      format('Codigo de rastreio registrado manualmente: %s%s', v_codigo, case when p_servico is not null then ' ('||p_servico||')' else '' end),
      jsonb_build_object('fonte','manual_dados_envio','codigo_rastreio', v_codigo, 'servico', p_servico, 'auth_uid', auth.uid()),
      false, 'humano', 'dados_envio');
  else
    insert into pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
    values (p_pedido_id, 'anotacao',
      format('Codigo de rastreio lido da etiqueta Correios do Bling (automatico): %s%s', v_codigo, case when p_servico is not null then ' ('||p_servico||')' else '' end),
      jsonb_build_object('fonte','bling_etiqueta','codigo_rastreio', v_codigo, 'servico', p_servico),
      true, 'sistema', 'bling_rastreio_sync');
  end if;

  return v_rastreio_id;
end;
$function$;
REVOKE ALL ON FUNCTION public.fn_registrar_rastreio_pedido(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_rastreio_pedido(uuid,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_mesa_sp_despachar(p_pedido_id uuid, p_modal text, p_referencia text DEFAULT NULL::text, p_executor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- 05/10/2026 MESA-SP-MODO-B2B (F4): B2B expedido pelo Site SP despacha DEPOIS da NF (estagio faturado).
-- 19/10/2026 NF-DO-CD: B2B do Site SP so despacha com NF emitida pelo CNPJ do Site SP (matriz).
-- 22/10/2026 MESA-SP-V2 E2: despacho exige a estação Documentos concluída.
-- 26/10/2026 MESA-SP-MODAIS-NEGOCIO: despacho usa o modal vigente (embalagem ou troca registrada); Frete Fetely
--   exige executor (mesa_sp_executor); Correios só sai com código de rastreio (agência bipa o código aqui);
--   Retirada vale para B2B (quem retirou na referência) e fecha o pedido como entregue.
-- 28/10/2026 RASTREIO-MESA-SP: Correios SEMPRE exige o bipe; bipado diferente substitui o código anterior.
DECLARE v_estagio text; v_canal text; v_modal record; v_b2b boolean; v_nf_errada text;
        v_modal_vig text; v_exec_codigo text; v_exec_nome text; v_exec_ref boolean;
        v_ref text; v_cod text; v_dono_pedido uuid; v_dono_status text; v_dono_achou boolean; v_desc text; v_substituidos jsonb;
BEGIN
  PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
  IF coalesce(auth.role(), '') IN ('anon','authenticated')
     AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN
    RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE = '42501';
  END IF;
  v_ref := nullif(btrim(coalesce(p_referencia,'')), '');
  SELECT estagio, canal INTO v_estagio, v_canal FROM pedidos WHERE id = p_pedido_id FOR UPDATE;
  v_b2b := v_canal = 'B2B';
  IF v_b2b THEN
    IF NOT EXISTS (SELECT 1 FROM pedidos px JOIN centro_distribuicao cx ON cx.id = px.origem_centro_id WHERE px.id = p_pedido_id AND public.fn_estabelecimento_fiscal(cx.id) = (SELECT cs.id FROM public.centro_distribuicao cs WHERE cs.codigo = 'SITE-SP')) THEN
      RAISE EXCEPTION 'Pedido B2B não está com CD de expedição Site SP.'; END IF;
    IF v_estagio <> 'faturado' THEN
      RAISE EXCEPTION 'Pedido B2B despacha depois da NF (pedido em "%"; precisa estar faturado).', coalesce(v_estagio,'?'); END IF;
    SELECT string_agg(n.numero || ' (CNPJ ' || n.emitente_cnpj || ')', ', ') INTO v_nf_errada
      FROM nfs_emitidas n JOIN centro_distribuicao c ON c.codigo = 'SITE-SP'
     WHERE n.pedido_venda_id = p_pedido_id AND n.situacao = 'autorizada'
       AND regexp_replace(coalesce(n.emitente_cnpj,''), '\D', '', 'g') <> c.cnpj_emitente;
    IF v_nf_errada IS NOT NULL THEN
      RAISE EXCEPTION 'NF % não foi emitida pela matriz SP (63.591.078/0001-48). Pedido separado no Site SP só sai com NF da matriz — cancele e reemita pela matriz.', v_nf_errada;
    END IF;
  ELSIF v_estagio <> 'em_separacao' THEN
    RAISE EXCEPTION 'Despacho só a partir da separação (pedido em "%").', coalesce(v_estagio,'?');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento='mesa_embalado') THEN
    RAISE EXCEPTION 'Despacho exige embalagem registrada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pedido_eventos e WHERE e.pedido_id=p_pedido_id AND e.tipo_evento='mesa_documentos_ok'
                   AND e.criado_em > (SELECT max(criado_em) FROM pedido_eventos WHERE pedido_id=p_pedido_id AND tipo_evento='mesa_embalado')) THEN
    RAISE EXCEPTION 'Despacho exige a estação Documentos concluída (DANFE, etiqueta/romaneio).';
  END IF;

  v_modal_vig := public.fn_mesa_sp_modal_do_pedido(p_pedido_id);
  IF p_modal IS DISTINCT FROM v_modal_vig THEN
    RAISE EXCEPTION 'Modal do pedido é %: para despachar como %, registre a troca com motivo.', coalesce(v_modal_vig,'?'), p_modal;
  END IF;
  SELECT * INTO v_modal FROM b2c_modal_entrega WHERE codigo = p_modal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modal "%" inexistente.', p_modal; END IF;

  IF v_modal.sem_despacho THEN
    IF NOT v_b2b THEN
      RAISE EXCEPTION 'Modal "%" nao se despacha: e retirada no balcao — registre a retirada em Pedidos Site SP.', v_modal.nome;
    END IF;
    IF v_ref IS NULL THEN RAISE EXCEPTION 'Retirada: informe quem retirou (nome / transportadora do cliente).'; END IF;
  ELSIF EXISTS (SELECT 1 FROM mesa_sp_executor x WHERE x.modal_codigo = p_modal AND x.ativo) THEN
    SELECT x.codigo, x.nome, x.exige_referencia INTO v_exec_codigo, v_exec_nome, v_exec_ref
      FROM mesa_sp_executor x WHERE x.codigo = p_executor AND x.modal_codigo = p_modal AND x.ativo;
    IF v_exec_codigo IS NULL THEN
      RAISE EXCEPTION '%: informe quem faz a entrega (%).', v_modal.nome,
        (SELECT string_agg(x.nome, ' / ' ORDER BY x.ordem) FROM mesa_sp_executor x WHERE x.modal_codigo = p_modal AND x.ativo);
    END IF;
    IF v_exec_ref AND v_ref IS NULL THEN
      RAISE EXCEPTION '% exige a referência da corrida.', v_exec_nome; END IF;
  ELSIF v_modal.exige_etiqueta_correios THEN
    v_cod := upper(regexp_replace(coalesce(v_ref,''), '\s', '', 'g'));
    IF v_cod !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' THEN
      RAISE EXCEPTION 'Correios só despacha com código de rastreio: bipe o código do comprovante de postagem (ex. AA123456789BR).';
    END IF;
    SELECT r.pedido_id, r.status_atual, true INTO v_dono_pedido, v_dono_status, v_dono_achou
      FROM pedido_rastreamento r WHERE r.codigo_rastreio = v_cod;
    IF coalesce(v_dono_achou, false) AND v_dono_pedido IS DISTINCT FROM p_pedido_id THEN
      RAISE EXCEPTION 'Código % já existe no sistema (%; status: %). Confira o comprovante.', v_cod,
        coalesce((SELECT id_externo FROM pedidos WHERE id = v_dono_pedido), 'sem pedido'), coalesce(v_dono_status,'—');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('codigo', r.codigo_rastreio, 'servico', r.servico, 'status', r.status_atual, 'criado_em', r.criado_em,
             'origem', (SELECT coalesce(e.metadata->>'origem', e.metadata->>'fonte') FROM pedido_eventos e
                         WHERE e.pedido_id = p_pedido_id AND (e.metadata->>'codigo' = r.codigo_rastreio OR e.metadata->>'codigo_rastreio' = r.codigo_rastreio)
                         ORDER BY e.criado_em DESC LIMIT 1)))
      INTO v_substituidos
      FROM pedido_rastreamento r WHERE r.pedido_id = p_pedido_id AND r.codigo_rastreio <> v_cod;
    IF v_substituidos IS NOT NULL THEN
      DELETE FROM pedido_rastreamento WHERE pedido_id = p_pedido_id AND codigo_rastreio <> v_cod;
      INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
      VALUES (p_pedido_id, 'mesa_rastreio_substituido',
              format('Mesa SP: código bipado %s substituiu %s no despacho.', v_cod,
                     (SELECT string_agg(x->>'codigo', ', ') FROM jsonb_array_elements(v_substituidos) x)),
              jsonb_build_object('codigo_novo', v_cod, 'codigos_antigos', v_substituidos, 'origem', 'despacho_mesa_sp', 'auth_uid', auth.uid()),
              false, 'humano', 'mesa_sp');
    END IF;
    IF NOT coalesce(v_dono_achou, false) THEN
      INSERT INTO pedido_rastreamento (pedido_id, codigo_rastreio, servico, status_atual)
      VALUES (p_pedido_id, v_cod, 'Correios', 'postagem_pendente');
      INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
      VALUES (p_pedido_id, 'mesa_rastreio_registrado', format('Mesa SP: código %s do comprovante de postagem registrado no despacho.', v_cod),
              jsonb_build_object('codigo', v_cod, 'origem', 'despacho_agencia', 'auth_uid', auth.uid(), 'servico', public.fn_mesa_sp_servico_correios(p_pedido_id)->>'servico', 'frete_cliente_valor', (public.fn_mesa_sp_servico_correios(p_pedido_id)->>'frete_cliente_valor')::numeric), false, 'humano', 'mesa_sp');
    END IF;
    v_ref := v_cod;
  ELSIF NOT v_modal.tem_rastreio_automatico AND v_ref IS NULL THEN
    RAISE EXCEPTION 'Modal % exige referência de despacho (nº da coleta / CT-e / portador).', v_modal.nome;
  END IF;

  v_desc := CASE WHEN v_modal.sem_despacho THEN format('Mesa SP: retirado por %s', v_ref)
                 ELSE format('Mesa SP: despachado via %s%s%s', v_modal.nome,
                        CASE WHEN v_exec_codigo IS NOT NULL THEN ' ('||v_exec_nome||')' ELSE '' END,
                        CASE WHEN v_ref IS NOT NULL THEN ' — ref '||v_ref ELSE '' END) END;

  IF v_b2b THEN
    PERFORM public.transicionar_pedido(p_pedido_id, 'em_transporte', NULL, v_desc, false);
  ELSE
    UPDATE pedidos SET estagio='em_transporte' WHERE id = p_pedido_id;
  END IF;
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, estagio_anterior, estagio_novo, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_despachado', v_estagio, 'em_transporte', v_desc || '.',
          jsonb_build_object('modal',p_modal,'executor',v_exec_codigo,'referencia',v_ref,'auth_uid',auth.uid()),
          false, 'humano', 'mesa_sp');

  -- Retirada B2B: o FOB já fecha pelo gatilho do embarque; CIF retirado também fecha aqui.
  IF v_b2b AND v_modal.sem_despacho AND (SELECT estagio FROM pedidos WHERE id = p_pedido_id) = 'em_transporte' THEN
    PERFORM public.fn_transicionar_pedido(p_pedido_id, 'entregue', 'retirada_expedicao',
      'Retirado na expedição SP por ' || v_ref, jsonb_build_object('origem','mesa_sp_retirada'), NULL::text);
    UPDATE pedidos SET entregue_em = now(), entregue_metodo = 'retirada_expedicao',
           entregue_motivo = 'Retirado na expedição SP por ' || v_ref, area_atual = 'nenhuma', proxima_acao = NULL
     WHERE id = p_pedido_id;
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (p_pedido_id, 'entregue', 'Retirado na expedição SP por ' || v_ref, jsonb_build_object('origem','mesa_sp_retirada'), false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'estagio', (SELECT estagio FROM pedidos WHERE id = p_pedido_id), 'referencia', v_ref);
END $function$;