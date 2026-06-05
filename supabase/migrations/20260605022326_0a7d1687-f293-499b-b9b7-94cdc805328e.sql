CREATE OR REPLACE VIEW public.v_pedidos_fila AS
SELECT p.id,
    p.id_externo,
    p.estagio,
        CASE
            WHEN p.estagio = 'recebido'::text THEN 'sistema'::text
            WHEN p.estagio = 'em_analise_credito'::text THEN 'credito'::text
            WHEN p.estagio = ANY (ARRAY['credito_aprovado'::text, 'pre_faturado'::text, 'recuperacao_venda'::text]) THEN 'sops'::text
            WHEN p.estagio = ANY (ARRAY['em_separacao'::text, 'faturado'::text, 'em_transporte'::text]) THEN 'bling'::text
            WHEN p.estagio = ANY (ARRAY['entregue'::text, 'cancelado'::text]) THEN 'nenhuma'::text
            ELSE 'nenhuma'::text
        END AS area_atual,
    COALESCE(p.proxima_acao,
        CASE p.estagio
            WHEN 'recebido'::text THEN 'Iniciar análise de crédito'::text
            WHEN 'em_analise_credito'::text THEN 'Aguardando decisão do Crédito'::text
            WHEN 'credito_aprovado'::text THEN 'Aguardando geração de títulos'::text
            WHEN 'pre_faturado'::text THEN 'Pronto pra enviar ao Bling'::text
            WHEN 'em_separacao'::text THEN 'Bling separando'::text
            WHEN 'faturado'::text THEN 'NF emitida'::text
            WHEN 'em_transporte'::text THEN 'Em entrega'::text
            ELSE NULL::text
        END) AS proxima_acao,
        CASE
            WHEN ac.condicao_final_aprovada IS NULL THEN NULL::text
            WHEN (ac.condicao_final_aprovada -> 'entrada'::text) IS NOT NULL AND (ac.condicao_final_aprovada -> 'entrada'::text) <> 'null'::jsonb AND (((ac.condicao_final_aprovada -> 'entrada'::text) ->> 'pct'::text)::numeric) >= 100::numeric THEN 'a_vista'::text
            ELSE 'a_prazo'::text
        END AS tipo_pagamento,
    p.recebido_via,
    p.origem,
    p.parceiro_id,
    pc.cnpj AS parceiro_cnpj,
    pc.razao_social AS parceiro_razao,
    pc.nivel_programa,
    pc.categoria_ka,
    pc.bandeira_vermelha,
    p.vendedor,
    p.data_pedido::text AS data_pedido,
    p.recebido_em::text AS recebido_em,
    p.valor_bruto,
    p.valor_liquido,
    p.condicao_solicitada,
    p.forma_solicitada,
    0::numeric AS prioridade_score,
    NULL::text AS prioridade_motivo,
    p.faturado_em::text AS faturado_em,
    p.cancelado_em::text AS cancelado_em,
    p.cancelado_motivo,
    EXTRACT(epoch FROM now() - p.recebido_em) / 60::numeric AS idade_minutos,
    false AS sla_estourado,
    ac.id AS analise_credito_id,
    p.marcacao
   FROM pedidos p
     JOIN parceiros_comerciais pc ON pc.id = p.parceiro_id
     LEFT JOIN LATERAL ( SELECT analises_credito.id,
            analises_credito.condicao_final_aprovada,
            analises_credito.status_final,
            pc.created_at
           FROM analises_credito
          WHERE analises_credito.pedido_id = p.id
          ORDER BY pc.created_at DESC
         LIMIT 1) ac ON true;