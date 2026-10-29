-- ETIQUETA-CORREIOS-SNCF (29/10/2026, Flávio): o SNCF gera a pré-postagem dos pedidos expedidos em SP.
CREATE TABLE public.correios_cartao_postagem (
  cartao text PRIMARY KEY,
  contrato text NOT NULL,
  dr integer NOT NULL,
  centro_id uuid REFERENCES public.centro_distribuicao(id),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.correios_cartao_postagem TO authenticated;
GRANT ALL ON public.correios_cartao_postagem TO service_role;
ALTER TABLE public.correios_cartao_postagem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura autenticada" ON public.correios_cartao_postagem FOR SELECT TO authenticated USING (true);
CREATE UNIQUE INDEX correios_cartao_postagem_centro_uq ON public.correios_cartao_postagem(centro_id) WHERE ativo AND centro_id IS NOT NULL;
INSERT INTO public.correios_cartao_postagem (cartao, contrato, dr, observacao) VALUES
  ('0080156126','9912751570',72,'Estabelecimento a definir'),
  ('0080390781','9912751570',72,'Estabelecimento a definir');

CREATE TABLE public.correios_servico_codigo (
  servico text PRIMARY KEY,
  codigo_servico text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.correios_servico_codigo TO authenticated;
GRANT ALL ON public.correios_servico_codigo TO service_role;
ALTER TABLE public.correios_servico_codigo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura autenticada" ON public.correios_servico_codigo FOR SELECT TO authenticated USING (true);
INSERT INTO public.correios_servico_codigo VALUES ('SEDEX','03220',true),('PAC','03298',true);

CREATE TABLE public.correios_prepostagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid,
  cartao text REFERENCES public.correios_cartao_postagem(cartao),
  id_prepostagem_correios text,
  codigo_objeto text,
  codigo_servico text,
  servico text CHECK (servico IN ('SEDEX','PAC')),
  peso_g integer,
  altura_cm numeric, largura_cm numeric, comprimento_cm numeric,
  caixa_codigo text,
  chave_nfe text,
  status text NOT NULL DEFAULT 'criada' CHECK (status IN ('criada','rotulo_impresso','cancelada','postada')),
  payload_envio jsonb,
  resposta jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  cancelado_em timestamptz,
  cancelado_motivo text
);
GRANT SELECT ON public.correios_prepostagem TO authenticated;
GRANT ALL ON public.correios_prepostagem TO service_role;
ALTER TABLE public.correios_prepostagem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura autenticada" ON public.correios_prepostagem FOR SELECT TO authenticated USING (true);
CREATE UNIQUE INDEX correios_prepostagem_viva_uq ON public.correios_prepostagem(pedido_id) WHERE status <> 'cancelada' AND pedido_id IS NOT NULL;
CREATE INDEX correios_prepostagem_codigo_idx ON public.correios_prepostagem(codigo_objeto);

-- Registra o código da pré-postagem no pedido (porta oficial da Mesa: pedido_rastreamento + evento).
CREATE OR REPLACE FUNCTION public.fn_correios_prepostagem_vincular(p_prepostagem_id uuid, p_auth_uid uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_dono uuid; v_sv jsonb;
BEGIN
  SELECT * INTO v FROM correios_prepostagem WHERE id = p_prepostagem_id AND status <> 'cancelada';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pré-postagem % não encontrada ou cancelada.', p_prepostagem_id; END IF;
  IF v.codigo_objeto IS NULL OR NOT public.fn_sro_codigo_valido(v.codigo_objeto) THEN
    RAISE EXCEPTION 'Pré-postagem sem código de objeto válido (%).', coalesce(v.codigo_objeto,'vazio'); END IF;
  SELECT pedido_id INTO v_dono FROM pedido_rastreamento WHERE codigo_rastreio = v.codigo_objeto;
  IF v_dono IS NOT NULL AND v_dono <> v.pedido_id THEN
    RAISE EXCEPTION 'Código % já está em outro pedido (%).', v.codigo_objeto, (SELECT id_externo FROM pedidos WHERE id = v_dono); END IF;
  DELETE FROM pedido_rastreamento WHERE pedido_id = v.pedido_id AND codigo_rastreio <> v.codigo_objeto AND coalesce(entregue,false) = false;
  IF v_dono IS NULL THEN
    INSERT INTO pedido_rastreamento (pedido_id, codigo_rastreio, servico, status_atual)
    VALUES (v.pedido_id, v.codigo_objeto, 'Correios', 'postagem_pendente');
  END IF;
  v_sv := public.fn_mesa_sp_servico_correios(v.pedido_id);
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (v.pedido_id, 'mesa_rastreio_registrado', format('Mesa SP: pré-postagem Correios %s (%s) gerada pelo SNCF.', v.codigo_objeto, v.servico),
          jsonb_build_object('codigo', v.codigo_objeto, 'origem', 'sncf_prepostagem', 'prepostagem_id', v.id, 'cartao', v.cartao,
                             'servico', v.servico, 'frete_cliente_valor', (v_sv->>'frete_cliente_valor')::numeric, 'auth_uid', p_auth_uid),
          false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true, 'codigo', v.codigo_objeto);
END $$;

-- Marca cancelada e desvincula o código do pedido.
CREATE OR REPLACE FUNCTION public.fn_correios_prepostagem_desvincular(p_prepostagem_id uuid, p_motivo text, p_auth_uid uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record;
BEGIN
  UPDATE correios_prepostagem SET status = 'cancelada', cancelado_em = now(), cancelado_motivo = p_motivo
   WHERE id = p_prepostagem_id AND status <> 'cancelada' RETURNING * INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pré-postagem % não encontrada ou já cancelada.', p_prepostagem_id; END IF;
  IF v.pedido_id IS NOT NULL AND v.codigo_objeto IS NOT NULL THEN
    DELETE FROM pedido_rastreamento WHERE pedido_id = v.pedido_id AND codigo_rastreio = v.codigo_objeto AND coalesce(entregue,false) = false;
    INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
    VALUES (v.pedido_id, 'mesa_rastreio_substituido', format('Mesa SP: pré-postagem Correios %s cancelada — %s', v.codigo_objeto, coalesce(p_motivo,'')),
            jsonb_build_object('codigos_antigos', jsonb_build_array(jsonb_build_object('codigo', v.codigo_objeto, 'origem', 'sncf_prepostagem')),
                               'acao', 'prepostagem_cancelada', 'motivo', p_motivo, 'auth_uid', p_auth_uid), false, 'humano', 'mesa_sp');
  END IF;
  RETURN jsonb_build_object('ok', true, 'codigo', v.codigo_objeto);
END $$;
REVOKE ALL ON FUNCTION public.fn_correios_prepostagem_vincular(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_correios_prepostagem_desvincular(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_correios_prepostagem_vincular(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_correios_prepostagem_desvincular(uuid, text, uuid) TO service_role;

-- Troca de modal saindo de Correios exige a pré-postagem viva cancelada antes (a tela cancela pela edge).
CREATE OR REPLACE FUNCTION public.fn_mesa_sp_trocar_modal(p_pedido_id uuid, p_modal text, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- 26/10/2026 MESA-SP-MODAIS-NEGOCIO: troca de modal com motivo — antes da embalagem ou no despacho.
-- 29/10/2026 ETIQUETA-CORREIOS-SNCF: sair de Correios com pré-postagem viva é recusado (cancele antes).
DECLARE v_de text; v_ult_emb timestamptz; v_pp text;
BEGIN
  IF coalesce(auth.role(), '') IN ('anon','authenticated')
     AND NOT public.usuario_tem_acao('acao.expedicao_sp_operar') THEN
    RAISE EXCEPTION 'Sem permissão para esta ação (acao.expedicao_sp_operar).' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fn_mesa_sp_trava_cancelamento(p_pedido_id);
  IF NOT EXISTS (SELECT 1 FROM b2c_modal_entrega WHERE codigo = p_modal AND ativo) THEN
    RAISE EXCEPTION 'Modal "%" inexistente ou inativo.', p_modal; END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da troca de modal.'; END IF;
  SELECT max(criado_em) INTO v_ult_emb FROM pedido_eventos WHERE pedido_id = p_pedido_id AND tipo_evento = 'mesa_embalado';
  IF v_ult_emb IS NOT NULL AND EXISTS (SELECT 1 FROM pedido_eventos WHERE pedido_id = p_pedido_id AND tipo_evento = 'mesa_despachado' AND criado_em > v_ult_emb) THEN
    RAISE EXCEPTION 'Pedido já despachado.'; END IF;
  v_de := coalesce(public.fn_mesa_sp_modal_do_pedido(p_pedido_id), public.fn_mesa_sp_modal_sugerido(p_pedido_id)->>'modal');
  IF v_de = p_modal THEN RAISE EXCEPTION 'O pedido já está como %.', p_modal; END IF;
  SELECT codigo_objeto INTO v_pp FROM correios_prepostagem WHERE pedido_id = p_pedido_id AND status <> 'cancelada';
  IF v_pp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM b2c_modal_entrega WHERE codigo = p_modal AND exige_etiqueta_correios) THEN
    RAISE EXCEPTION 'Pedido tem pré-postagem Correios viva (%): cancele a etiqueta antes de trocar o modal.', v_pp; END IF;
  INSERT INTO pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico, ator_tipo, ator_origem)
  VALUES (p_pedido_id, 'mesa_modal_trocado',
          format('Mesa SP: modal trocado de %s para %s — %s', coalesce(v_de,'(sem modal)'), p_modal, btrim(p_motivo)),
          jsonb_build_object('de', v_de, 'para', p_modal, 'motivo', btrim(p_motivo),
                             'momento', CASE WHEN v_ult_emb IS NULL THEN 'antes_embalagem' ELSE 'despacho' END, 'auth_uid', auth.uid()),
          false, 'humano', 'mesa_sp');
  RETURN jsonb_build_object('ok', true, 'de', v_de, 'para', p_modal);
END $function$;

-- Despacho Correios: com pré-postagem do SNCF viva, o bipe CONFIRMA (tem que bater com o código).
DO $do$
DECLARE d text; ancora text := $a$  IF v_cod !~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$' THEN
      RAISE EXCEPTION 'Correios só despacha com código de rastreio: bipe o código do comprovante de postagem (ex. AA123456789BR).';
    END IF;$a$;
BEGIN
  d := pg_get_functiondef('public.fn_mesa_sp_despachar(uuid,text,text,text)'::regprocedure);
  IF position(ancora in d) = 0 THEN RAISE EXCEPTION 'âncora do despacho não encontrada'; END IF;
  d := replace(d, ancora, ancora || $b$
    -- 29/10/2026 ETIQUETA-CORREIOS-SNCF: pré-postagem viva do SNCF → bipe tem que bater.
    IF EXISTS (SELECT 1 FROM correios_prepostagem pp WHERE pp.pedido_id = p_pedido_id AND pp.status <> 'cancelada' AND pp.codigo_objeto <> v_cod) THEN
      RAISE EXCEPTION 'Código bipado % não confere com a etiqueta gerada pelo SNCF (%). Bipe a etiqueta da caixa.', v_cod,
        (SELECT pp.codigo_objeto FROM correios_prepostagem pp WHERE pp.pedido_id = p_pedido_id AND pp.status <> 'cancelada');
    END IF;$b$);
  EXECUTE d;
END $do$;

-- Gestão VD: modal efetivo do despacho da Mesa vence o modal comprado (Correios mantém sedex/pac do pedido).
CREATE OR REPLACE FUNCTION public.fn_vd_modal_efetivo(p_pedido_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN m IS NULL OR m = 'CORREIOS' THEN NULL ELSE lower(m) END
  FROM (SELECT public.fn_mesa_sp_modal_do_pedido(p_pedido_id) m) x
$$;
GRANT EXECUTE ON FUNCTION public.fn_vd_modal_efetivo(uuid) TO authenticated, service_role;

DO $do$
DECLARE d text; ancora text := $a$COALESCE(NULLIF((p.endereco_entrega ->> 'modal'::text), ''::text), 'entrega'::text) AS modal$a$;
BEGIN
  d := pg_get_viewdef('public.vw_venda_direta_gestao'::regclass);
  IF position(ancora in d) = 0 THEN RAISE EXCEPTION 'âncora da view VD não encontrada'; END IF;
  d := replace(d, ancora, $b$COALESCE(public.fn_vd_modal_efetivo(p.id), NULLIF((p.endereco_entrega ->> 'modal'::text), ''::text), 'entrega'::text) AS modal$b$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_venda_direta_gestao WITH (security_invoker = true) AS ' || d;
END $do$;