ALTER TABLE public.parceiros_comerciais
  ADD COLUMN IF NOT EXISTS consignado_instrumento text
    CHECK (consignado_instrumento IN ('pix','boleto')),
  ADD COLUMN IF NOT EXISTS consignado_prazo_dias_nf integer
    CHECK (consignado_prazo_dias_nf > 0);
COMMENT ON COLUMN public.parceiros_comerciais.consignado_instrumento IS
  'Consignado modelo 2: instrumento de cobranca do acerto (pix|boleto). Null = boleto em conta corrente (comportamento antigo).';
COMMENT ON COLUMN public.parceiros_comerciais.consignado_prazo_dias_nf IS
  'Consignado modelo 2: vencimento = emissao da NF de venda do acerto + N dias. Null = dia de acerto/cadencia (comportamento antigo).';

CREATE OR REPLACE FUNCTION public.fn_consignado_cobranca_salvar(p_parceiro_id uuid, p_instrumento text, p_prazo_dias_nf integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
BEGIN
  IF auth.uid() IS NULL OR NOT usuario_tem_acao('acao.consignado_contrato_gerir', auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão (acao.consignado_contrato_gerir)' USING ERRCODE='42501'; END IF;
  IF p_instrumento IS NOT NULL AND p_instrumento NOT IN ('pix','boleto') THEN
    RAISE EXCEPTION 'Instrumento inválido: % (use pix ou boleto)', p_instrumento USING ERRCODE='23514'; END IF;
  IF p_prazo_dias_nf IS NOT NULL AND p_prazo_dias_nf <= 0 THEN
    RAISE EXCEPTION 'Prazo após a NF deve ser maior que zero' USING ERRCODE='23514'; END IF;
  UPDATE parceiros_comerciais SET consignado_instrumento = p_instrumento, consignado_prazo_dias_nf = p_prazo_dias_nf
   WHERE id = p_parceiro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parceiro não encontrado' USING ERRCODE='02000'; END IF;
  RETURN jsonb_build_object('ok', true, 'instrumento', p_instrumento, 'prazo_dias_nf', p_prazo_dias_nf);
END $f$;
REVOKE ALL ON FUNCTION public.fn_consignado_cobranca_salvar(uuid, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_consignado_cobranca_salvar(uuid, text, integer) TO authenticated, service_role;