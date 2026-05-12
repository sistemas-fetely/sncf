
CREATE OR REPLACE FUNCTION public.fn_cpr_timeline_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_payload JSONB;
BEGIN
  IF NEW.pedido_compra_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_user_id := COALESCE(auth.uid(), NEW.enviado_pagamento_por, NEW.aprovado_por);

  v_payload := jsonb_build_object(
    'cpr_id', NEW.id,
    'valor', NEW.valor,
    'data_vencimento', NEW.data_vencimento,
    'status_anterior', OLD.status,
    'novo_status', NEW.status,
    'pagamento_com_pendencia', NEW.pagamento_com_pendencia,
    'pendencias', COALESCE(NEW.pendencias_no_envio, ARRAY[]::TEXT[])
  );

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'aguardando_pagamento' THEN
      PERFORM public.fn_log_evento_pedido(NEW.pedido_compra_id, 'cpr_para_aguardando_pagamento', v_payload, v_user_id);
    ELSIF NEW.status = 'paga' THEN
      PERFORM public.fn_log_evento_pedido(NEW.pedido_compra_id, 'cpr_paga', v_payload, v_user_id);
    ELSIF NEW.status = 'cancelado' THEN
      PERFORM public.fn_log_evento_pedido(NEW.pedido_compra_id, 'cpr_cancelada', v_payload, v_user_id);
    END IF;
  END IF;

  IF NEW.email_pagamento_enviado IS TRUE
     AND COALESCE(OLD.email_pagamento_enviado, FALSE) IS DISTINCT FROM TRUE
  THEN
    PERFORM public.fn_log_evento_pedido(
      NEW.pedido_compra_id,
      'cpr_email_enviado',
      v_payload || jsonb_build_object('email_enviado_em', now()),
      v_user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_cpr_timeline_pedido IS
'D-65 Camada 1 — registra eventos no Timeline do Pedido quando CPR muda de status ou email_pagamento_enviado. CPRs sem pedido_compra_id sao ignoradas.';

DROP TRIGGER IF EXISTS trg_cpr_timeline_pedido ON public.contas_pagar_receber;
CREATE TRIGGER trg_cpr_timeline_pedido
AFTER UPDATE ON public.contas_pagar_receber
FOR EACH ROW
EXECUTE FUNCTION public.fn_cpr_timeline_pedido();


CREATE OR REPLACE FUNCTION public.fn_cpr_tarefa_pendencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitante_id  UUID;
  v_fornecedor_nome TEXT;
  v_pendencias_str  TEXT;
  v_titulo          TEXT;
  v_descricao       TEXT;
  v_prioridade      TEXT;
  v_dias_ate_vencer INT;
  v_user_id         UUID;
BEGIN
  IF NEW.pedido_compra_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_user_id := COALESCE(auth.uid(), NEW.enviado_pagamento_por, NEW.aprovado_por);

  -- CASO A: pendencia FALSE -> TRUE
  IF NEW.pagamento_com_pendencia IS TRUE
     AND COALESCE(OLD.pagamento_com_pendencia, FALSE) IS DISTINCT FROM TRUE
  THEN
    SELECT solicitante_id INTO v_solicitante_id
      FROM public.pedidos_compra
     WHERE id = NEW.pedido_compra_id;

    IF v_solicitante_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(nome_fantasia, razao_social, 'fornecedor') INTO v_fornecedor_nome
      FROM public.parceiros_comerciais
     WHERE id = NEW.parceiro_id;
    v_fornecedor_nome := COALESCE(v_fornecedor_nome, 'fornecedor');

    v_pendencias_str := array_to_string(COALESCE(NEW.pendencias_no_envio, ARRAY[]::TEXT[]), ', ');

    v_titulo := 'Completar dados de pagamento: ' || v_fornecedor_nome;
    v_descricao := 'Faltam dados pra fechar o pagamento (' || v_pendencias_str || '). '
                || 'Valor: R$ ' || to_char(NEW.valor, 'FM999G999G990D00')
                || ' - Vencimento: ' || to_char(NEW.data_vencimento, 'DD/MM/YYYY')
                || '. Acesse a CPR pelo link e complete os campos faltantes.';

    v_dias_ate_vencer := (NEW.data_vencimento - CURRENT_DATE)::INT;
    v_prioridade := CASE
      WHEN v_dias_ate_vencer IS NULL THEN 'media'
      WHEN v_dias_ate_vencer <= 3 THEN 'alta'
      ELSE 'media'
    END;

    INSERT INTO public.sncf_tarefas (
      titulo, descricao, status, prioridade, prazo_data,
      responsavel_user_id, sistema_origem, tipo_processo, processo_id, link_acao, criado_por
    ) VALUES (
      v_titulo, v_descricao, 'pendente', v_prioridade, NEW.data_vencimento,
      v_solicitante_id, 'financeiro', 'cpr_pendencia_dados', NEW.id::TEXT,
      '/administrativo/contas-pagar?id=' || NEW.id, v_user_id
    );

    RETURN NEW;
  END IF;

  -- CASO B: pendencia TRUE -> FALSE (auto-close)
  IF COALESCE(OLD.pagamento_com_pendencia, FALSE) IS TRUE
     AND COALESCE(NEW.pagamento_com_pendencia, FALSE) IS FALSE
  THEN
    UPDATE public.sncf_tarefas
       SET status = 'concluida',
           concluida_em = now(),
           concluida_por = v_user_id,
           updated_at = now()
     WHERE tipo_processo = 'cpr_pendencia_dados'
       AND processo_id   = NEW.id::TEXT
       AND status        = 'pendente';
    RETURN NEW;
  END IF;

  -- CASO C: status terminal (auto-close)
  IF NEW.status IN ('paga', 'conciliado', 'cancelado')
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    UPDATE public.sncf_tarefas
       SET status = 'concluida',
           concluida_em = now(),
           concluida_por = v_user_id,
           updated_at = now()
     WHERE tipo_processo = 'cpr_pendencia_dados'
       AND processo_id   = NEW.id::TEXT
       AND status        = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_cpr_tarefa_pendencia IS
'D-65 Camada 2 — gerencia tarefa "Solicitar info" pro Solicitante quando CPR fica com pagamento_com_pendencia=TRUE. Auto-close quando pendencia volta a FALSE OU status vira terminal (paga/conciliado/cancelado). CPRs sem pedido_compra_id sao ignoradas.';

DROP TRIGGER IF EXISTS trg_cpr_tarefa_pendencia ON public.contas_pagar_receber;
CREATE TRIGGER trg_cpr_tarefa_pendencia
AFTER UPDATE ON public.contas_pagar_receber
FOR EACH ROW
EXECUTE FUNCTION public.fn_cpr_tarefa_pendencia();
