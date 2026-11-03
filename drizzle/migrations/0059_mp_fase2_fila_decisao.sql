SET LOCAL lock_timeout = '15s';
CREATE TABLE public.recebivel_b2c_destino_dim (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  ordem int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.recebivel_b2c_destino_dim TO authenticated;
GRANT ALL ON public.recebivel_b2c_destino_dim TO service_role;
ALTER TABLE public.recebivel_b2c_destino_dim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recebivel_destino_dim_ler" ON public.recebivel_b2c_destino_dim FOR SELECT TO authenticated USING (true);
INSERT INTO public.recebivel_b2c_destino_dim (codigo, rotulo, ordem) VALUES
  ('venda_direta', 'Venda direta', 1), ('link_avulso', 'Link avulso', 2), ('outro', 'Outro', 3);

CREATE TABLE public.recebivel_b2c_decisao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimentacao_id uuid NOT NULL UNIQUE,
  decisao text NOT NULL CHECK (decisao IN ('vinculado','nao_site')),
  order_name text,
  destino text REFERENCES public.recebivel_b2c_destino_dim(codigo),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  autor uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((decisao = 'vinculado' AND order_name IS NOT NULL AND destino IS NULL)
      OR (decisao = 'nao_site' AND order_name IS NULL AND destino IS NOT NULL))
);
GRANT SELECT ON public.recebivel_b2c_decisao TO authenticated;
GRANT ALL ON public.recebivel_b2c_decisao TO service_role;
ALTER TABLE public.recebivel_b2c_decisao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recebivel_decisao_ler" ON public.recebivel_b2c_decisao FOR SELECT TO authenticated
  USING (public.usuario_tem_acao('acao.recebivel_b2c.vincular') OR public.usuario_tem_acao('acao.recebivel_b2c.classificar') OR public.pode_ler_tabela('recebivel_b2c_decisao', auth.uid()));

CREATE VIEW public.vw_recebivel_b2c_sem_pedido WITH (security_invoker = true) AS
SELECT v.movimentacao_id::text AS id, v.movimentacao_id, v.data_transacao, v.valor_liquido_mp, v.tipo_meio, v.mp_payment_id, v.mp_token,
       (v.data_transacao::date)::timestamptz AS desde
  FROM public.vw_recebivel_b2c_pedido v
 WHERE v.status_atribuicao = 'sem_pedido'
   AND NOT EXISTS (SELECT 1 FROM public.recebivel_b2c_decisao d WHERE d.movimentacao_id = v.movimentacao_id);
GRANT SELECT ON public.vw_recebivel_b2c_sem_pedido TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, ordem, coluna_entrada)
VALUES ('recebivel_b2c_sem_pedido_fin', 'Recebível Mercado Pago sem pedido',
  'Liberação do Mercado Pago que nenhuma regra automática ligou a um pedido do site: vincular a um pedido ou classificar como não-site.',
  'c752fdfe-cdcc-47ad-9c97-5cb3777efe36', 'vw_recebivel_b2c_sem_pedido', 'view', 'pronta', '/administrativo/contas-receber?aba=b2c&fila=sem_pedido', 'normal', 112, 'desde')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao, categoria_sod, contem_dado_sensivel, ativo, publica) VALUES
 ('acao.recebivel_b2c.vincular','acao','recebivel','Vincular recebível MP a pedido','Liga manualmente uma liberação do Mercado Pago sem pedido a um pedido Shopify.','execucao', false, true, false),
 ('acao.recebivel_b2c.classificar','acao','recebivel','Classificar recebível MP como não-site','Marca uma liberação do Mercado Pago como venda fora do site (venda direta, link avulso, outro) com motivo.','execucao', false, true, false)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.acao_superficie (rota, arquivo, rotulo, dispara, guarda_atual, risco, permissao_id, origem, observacao)
SELECT '/administrativo/contas-receber', 'src/components/financeiro/FilaRecebivelSemPedido.tsx', x.rotulo, x.rpc, pc.slug, 'MEDIO', pc.id, 'mp-fase2-2026-11-03', 'Fila de recebível MP sem pedido.'
FROM public.permissoes_catalogo pc
JOIN (VALUES ('acao.recebivel_b2c.vincular', 'Vincular a pedido', 'rpc fn_recebivel_b2c_vincular'),
             ('acao.recebivel_b2c.classificar', 'Classificar como não-site', 'rpc fn_recebivel_b2c_classificar')) x(slug, rotulo, rpc)
  ON x.slug = pc.slug;
INSERT INTO public.grupo_acesso_permissoes (grupo_acesso_id, permissao_id, pode_ver, pode_criar, pode_editar, pode_apagar)
SELECT 'de97e246-bee5-426b-8b3f-b23df9fd50b4', pc.id, true, true, true, false
  FROM public.permissoes_catalogo pc
 WHERE pc.slug IN ('acao.recebivel_b2c.vincular','acao.recebivel_b2c.classificar')
   AND NOT EXISTS (SELECT 1 FROM public.grupo_acesso_permissoes g WHERE g.grupo_acesso_id = 'de97e246-bee5-426b-8b3f-b23df9fd50b4' AND g.permissao_id = pc.id);

CREATE FUNCTION public.fn_recebivel_b2c_vincular(p_movimentacao_id uuid, p_order_name text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order text := btrim(coalesce(p_order_name, '')); v_outro uuid;
BEGIN
  IF NOT public.usuario_tem_acao('acao.recebivel_b2c.vincular') THEN RAISE EXCEPTION 'Sem permissão (acao.recebivel_b2c.vincular).'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 3 caracteres).'; END IF;
  IF v_order <> '' AND left(v_order, 1) <> '#' THEN v_order := '#' || v_order; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vw_recebivel_b2c_sem_pedido WHERE movimentacao_id = p_movimentacao_id) THEN
    RAISE EXCEPTION 'Lançamento % não está na fila de recebível sem pedido (já atribuído ou já decidido).', p_movimentacao_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shopify_pedidos WHERE order_name = v_order) THEN RAISE EXCEPTION 'Pedido % não existe na Shopify sincronizada.', v_order; END IF;
  SELECT movimentacao_id INTO v_outro FROM public.vw_recebivel_b2c_pedido WHERE order_name = v_order LIMIT 1;
  IF v_outro IS NULL THEN SELECT movimentacao_id INTO v_outro FROM public.recebivel_b2c_decisao WHERE order_name = v_order LIMIT 1; END IF;
  IF v_outro IS NOT NULL THEN RAISE EXCEPTION 'Pedido % já está ligado a outro recebível (%).', v_order, v_outro; END IF;
  INSERT INTO public.recebivel_b2c_decisao (movimentacao_id, decisao, order_name, motivo, autor)
  VALUES (p_movimentacao_id, 'vinculado', v_order, btrim(p_motivo), auth.uid());
  RETURN jsonb_build_object('ok', true, 'order_name', v_order);
END $$;

CREATE FUNCTION public.fn_recebivel_b2c_classificar(p_movimentacao_id uuid, p_destino text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.usuario_tem_acao('acao.recebivel_b2c.classificar') THEN RAISE EXCEPTION 'Sem permissão (acao.recebivel_b2c.classificar).'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Motivo obrigatório (mínimo 3 caracteres).'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recebivel_b2c_destino_dim WHERE codigo = p_destino) THEN RAISE EXCEPTION 'Destino inválido: %.', p_destino; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vw_recebivel_b2c_sem_pedido WHERE movimentacao_id = p_movimentacao_id) THEN
    RAISE EXCEPTION 'Lançamento % não está na fila de recebível sem pedido (já atribuído ou já decidido).', p_movimentacao_id; END IF;
  INSERT INTO public.recebivel_b2c_decisao (movimentacao_id, decisao, destino, motivo, autor)
  VALUES (p_movimentacao_id, 'nao_site', p_destino, btrim(p_motivo), auth.uid());
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.fn_recebivel_b2c_vincular(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_recebivel_b2c_classificar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_recebivel_b2c_vincular(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recebivel_b2c_classificar(uuid, text, text) TO authenticated;