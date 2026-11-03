SET LOCAL lock_timeout = '10s';
CREATE OR REPLACE VIEW public.vw_recebivel_b2c_pedido WITH (security_invoker = true) AS
 SELECT m.id AS movimentacao_id,
    m.data_transacao,
    m.valor AS valor_liquido_mp,
    m.tipo_meio,
    m.id_transacao_banco AS mp_payment_id,
    COALESCE(s_tok.shopify_id, s_num.shopify_id, s_man.shopify_id) AS shopify_id,
    COALESCE(s_tok.order_name, s_num.order_name, s_man.order_name) AS order_name,
    COALESCE(s_tok.total, s_num.total, s_man.total) AS pedido_total_bruto,
    COALESCE(s_tok.financial_status, s_num.financial_status, s_man.financial_status) AS financial_status,
    COALESCE(s_tok.shipping_city, s_num.shipping_city, s_man.shipping_city) AS shipping_city,
    COALESCE(s_tok.shipping_province, s_num.shipping_province, s_man.shipping_province) AS shipping_province,
    COALESCE(s_tok.created_at_shopify, s_num.created_at_shopify, s_man.created_at_shopify) AS created_at_shopify,
        CASE
            WHEN COALESCE(s_tok.shopify_id, s_num.shopify_id, s_man.shopify_id) IS NOT NULL THEN 'atribuido'::text
            WHEN d.decisao = 'nao_site' THEN 'nao_site'::text
            ELSE 'sem_pedido'::text
        END AS status_atribuicao,
    m.referencia_pedido AS mp_token,
        CASE
            WHEN s_tok.shopify_id IS NOT NULL THEN 'token'::text
            WHEN s_num.shopify_id IS NOT NULL THEN 'numero'::text
            WHEN s_man.shopify_id IS NOT NULL THEN 'manual'::text
            ELSE NULL::text
        END AS via_chave,
    d.decisao AS decisao_manual,
    d.destino AS decisao_destino,
    d.motivo AS decisao_motivo
   FROM movimentacoes_bancarias m
     LEFT JOIN shopify_pagamento_ref r ON r.token = m.referencia_pedido
     LEFT JOIN shopify_pedidos s_tok ON s_tok.order_name = r.order_name
     LEFT JOIN shopify_pedidos s_num ON s_num.payment_reference = m.id_transacao_banco
     LEFT JOIN recebivel_b2c_decisao d ON d.movimentacao_id = m.id
     LEFT JOIN shopify_pedidos s_man ON d.decisao = 'vinculado' AND s_man.order_name = d.order_name
  WHERE m.origem = 'mp_release'::text AND m.classe = 'recebivel_b2c'::text;