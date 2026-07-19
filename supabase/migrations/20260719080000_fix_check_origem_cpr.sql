-- 🔵 SNCF
-- FIX DOC≠ESTADO — contas_pagar_receber_origem_check estava curto (5 valores)
-- enquanto o front insere origem 'manual' (9x) e 'cartao' (4x): bomba dormindo.
-- Diagnostico de saude dos CHECKs (19/07): dos 40 CHECKs, este era o UNICO divergente.
-- Correcao: CHECK vivo passa a conter as 5 origens atuais + as usadas pelo codigo +
-- as historicas legitimas. Lista consolidada = uniao do que nasce hoje e do que o codigo cria.
-- Espelho identico vai ao GitHub (este arquivo) — banco e repo voltam a coincidir.

ALTER TABLE public.contas_pagar_receber
  DROP CONSTRAINT IF EXISTS contas_pagar_receber_origem_check;

ALTER TABLE public.contas_pagar_receber
  ADD CONSTRAINT contas_pagar_receber_origem_check CHECK (origem = ANY (ARRAY[
      -- origens vivas atuais (as que nascem no fluxo de hoje)
      'api_bling'::text, 'pedido_venda'::text, 'conciliacao_stage_1'::text,
      'nf_stage'::text, 'reembolso'::text,
      -- usadas pelo front (confirmado no codigo — evitam a bomba dormindo)
      'manual'::text, 'cartao'::text,
      -- historicas legitimas mantidas por seguranca de dados existentes
      'contrato'::text, 'fatura_cartao'::text, 'recorrente'::text,
      'importacao'::text
  ]));
