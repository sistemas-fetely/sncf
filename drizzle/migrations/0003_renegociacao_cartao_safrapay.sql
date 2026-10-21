-- 21/10/2026 (Flavio): troca de instrumento para cartão (link SafraPay) com juros calculados pelo SNCF.
CREATE TABLE public.safrapay_taxa_parcelamento (
  parcelas smallint PRIMARY KEY CHECK (parcelas BETWEEN 1 AND 12),
  taxa_percentual numeric(7,4) NOT NULL CHECK (taxa_percentual >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid DEFAULT auth.uid()
);
COMMENT ON TABLE public.safrapay_taxa_parcelamento IS 'Taxa % TOTAL cobrada por parcelamento no cartão (link SafraPay), por nº de parcelas. Usada quando os juros são por conta do cliente.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safrapay_taxa_parcelamento TO authenticated;
GRANT ALL ON public.safrapay_taxa_parcelamento TO service_role;
ALTER TABLE public.safrapay_taxa_parcelamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY taxa_parc_ler ON public.safrapay_taxa_parcelamento FOR SELECT TO authenticated USING (true);
CREATE POLICY taxa_parc_ins ON public.safrapay_taxa_parcelamento FOR INSERT TO authenticated WITH CHECK (public.usuario_tem_acao('acao.safrapay_taxas_editar'));
CREATE POLICY taxa_parc_upd ON public.safrapay_taxa_parcelamento FOR UPDATE TO authenticated USING (public.usuario_tem_acao('acao.safrapay_taxas_editar')) WITH CHECK (public.usuario_tem_acao('acao.safrapay_taxas_editar'));
CREATE POLICY taxa_parc_del ON public.safrapay_taxa_parcelamento FOR DELETE TO authenticated USING (public.usuario_tem_acao('acao.safrapay_taxas_editar'));
INSERT INTO public.safrapay_taxa_parcelamento (parcelas, taxa_percentual, atualizado_por) VALUES (1, 0, NULL);

ALTER TABLE public.titulo_a_receber ADD COLUMN valor_juros_cartao numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_juros_cartao >= 0);
COMMENT ON COLUMN public.titulo_a_receber.valor_juros_cartao IS 'Juros de parcelamento no cartão repassados ao cliente, já INCLUÍDOS em valor_bruto (principal = valor_bruto - valor_juros_cartao).';

ALTER TABLE public.pagamento_link ADD COLUMN titulo_id uuid REFERENCES public.titulo_a_receber(id);
CREATE INDEX pagamento_link_titulo_idx ON public.pagamento_link (titulo_id) WHERE titulo_id IS NOT NULL;
COMMENT ON COLUMN public.pagamento_link.titulo_id IS 'Link gerado para um título a receber (renegociação por cartão). Pago → marcar_titulo_pago nesse título, sem tocar no portão do pedido.';

DO $do$
DECLARE d text; o text; n text;
BEGIN
  d := pg_get_functiondef('public.renegociar_acordo(uuid[],jsonb,text,text,uuid,smallint)'::regprocedure);
  o := $o$IF coalesce(p_tipo_pagamento,'') NOT IN ('boleto','pix') THEN$o$;
  n := $n$IF coalesce(p_tipo_pagamento,'') NOT IN ('boleto','pix','cartao') OR (p_tipo_pagamento = 'cartao' AND coalesce(p_modalidade,0) <> 3) THEN -- 21/10/2026 (Flavio): cartão só na troca de instrumento$n$;
  IF position(o in d) = 0 THEN RAISE EXCEPTION 'renegociar_acordo: trecho da validação de tipo não encontrado'; END IF;
  EXECUTE replace(d, o, n);
END
$do$;

CREATE OR REPLACE FUNCTION public.renegociar_titulo_cartao(
  p_titulo_id uuid, p_justificativa text, p_valor numeric, p_data_vencimento date,
  p_max_parcelas smallint, p_juros_por text, p_plano_contas_ajuste_id uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
-- 21/10/2026 (Flavio): o SNCF calcula os juros e soma ao link; a API SafraPay recebe só valor e máximo de parcelas.
DECLARE
  v_taxa numeric; v_principal numeric(14,2); v_juros numeric(14,2) := 0; v_res jsonb; v_filho uuid;
BEGIN
  IF coalesce(p_max_parcelas,0) NOT BETWEEN 1 AND 12 THEN
    RETURN jsonb_build_object('ok',false,'erro','Nº de parcelas deve ser de 1 a 12');
  END IF;
  IF coalesce(p_juros_por,'') NOT IN ('cliente','fetely') THEN
    RETURN jsonb_build_object('ok',false,'erro','Juros por conta de: cliente ou fetely');
  END IF;
  v_principal := round(coalesce(p_valor,0),2);
  IF p_juros_por = 'cliente' THEN
    SELECT taxa_percentual INTO v_taxa FROM safrapay_taxa_parcelamento WHERE parcelas = p_max_parcelas;
    IF v_taxa IS NULL THEN
      RETURN jsonb_build_object('ok',false,'erro','Taxa de parcelamento para ' || p_max_parcelas || 'x não cadastrada — cadastre ou escolha juros por conta da Fetely');
    END IF;
    v_juros := round(v_principal * v_taxa / 100, 2);
  END IF;

  v_res := renegociar_acordo(ARRAY[p_titulo_id],
    jsonb_build_array(jsonb_build_object('valor', v_principal, 'data_vencimento', p_data_vencimento)),
    p_justificativa, 'cartao', p_plano_contas_ajuste_id, 3::smallint);
  IF coalesce((v_res->>'ok')::boolean,false) IS NOT TRUE THEN RETURN v_res; END IF;

  v_filho := (v_res->'filhos'->>0)::uuid;
  IF v_juros > 0 THEN
    UPDATE titulo_a_receber SET valor_bruto = valor_bruto + v_juros, valor_juros_cartao = v_juros WHERE id = v_filho;
  END IF;

  RETURN v_res || jsonb_build_object('titulo_cartao_id', v_filho, 'principal', v_principal, 'juros_cartao', v_juros,
    'taxa_percentual', v_taxa, 'total_link', v_principal + v_juros, 'max_parcelas', p_max_parcelas, 'juros_por', p_juros_por);
END;
$fn$;
REVOKE ALL ON FUNCTION public.renegociar_titulo_cartao(uuid,text,numeric,date,smallint,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renegociar_titulo_cartao(uuid,text,numeric,date,smallint,text,uuid) TO authenticated, service_role;