-- 🔵 SNCF
-- Expande contas_pagar_receber_origem_check: + nf_stage, cartao, conciliacao_stage_1
-- nf_stage: Entrega 2 (parcelas de NF Stage)
-- cartao e conciliacao_stage_1: bombas dormindo — criar_despesa_de_lancamento_v2 e
-- criar_cpr_e_vincular_stage_1 gravavam origens fora da lista; nunca rodaram no caminho de criação
-- Aplicado no banco em 18/07/2026; este arquivo é o espelho
-- Destino: supabase/migrations/ via GitHub web

ALTER TABLE public.contas_pagar_receber
    DROP CONSTRAINT contas_pagar_receber_origem_check;

ALTER TABLE public.contas_pagar_receber
    ADD CONSTRAINT contas_pagar_receber_origem_check
    CHECK (origem = ANY (ARRAY[
        'manual'::text, 'csv_qive'::text, 'xml_nfe'::text, 'pdf_nfe'::text,
        'nf_pj_interno'::text, 'api_bling'::text, 'csv'::text, 'recorrente'::text,
        'extrato'::text, 'nf_import'::text, 'boleto_stage'::text, 'contrato'::text,
        'fatura_cartao'::text, 'pedido_compra'::text, 'pedido_venda'::text,
        'nf_stage'::text, 'cartao'::text, 'conciliacao_stage_1'::text
    ]));
