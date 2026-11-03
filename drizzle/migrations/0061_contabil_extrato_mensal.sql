CREATE TABLE public.contabil_extrato_mensal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), competencia date NOT NULL,
 conta_bancaria_id uuid NOT NULL REFERENCES public.contas_bancarias(id),
 storage_path text NOT NULL, nome_arquivo text NOT NULL,
 formato text NOT NULL CHECK (formato IN ('ofx','pdf','xlsx')),
 sha256 text NOT NULL, bytes bigint NOT NULL,
 periodo_inicio date, periodo_fim date, saldo_inicial numeric, saldo_final numeric,
 saldo_inicial_sncf numeric, saldo_final_sncf numeric, conferencia jsonb NOT NULL DEFAULT '{}'::jsonb,
 enviado_por uuid NOT NULL, enviado_em timestamptz NOT NULL DEFAULT now(), vigente boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.contabil_extrato_mensal TO authenticated;
GRANT ALL ON public.contabil_extrato_mensal TO service_role;
ALTER TABLE public.contabil_extrato_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY extrato_mensal_ler ON public.contabil_extrato_mensal FOR SELECT TO authenticated USING (public.pode_ler_tabela('contabil_extrato_mensal'));
CREATE UNIQUE INDEX contabil_extrato_mensal_vigente ON public.contabil_extrato_mensal (competencia,conta_bancaria_id) WHERE vigente;
CREATE FUNCTION public.fn_contabil_extrato_mensal_guardar(p_competencia date,p_conta uuid,p_storage_path text,p_nome text,p_formato text,p_sha256 text,p_bytes bigint,p_periodo_inicio date DEFAULT NULL,p_periodo_fim date DEFAULT NULL,p_saldo_inicial numeric DEFAULT NULL,p_saldo_final numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_ini date; v_fim date; v_si numeric; v_sf numeric; v_av text[] := '{}'; v_conf jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.contabil_extrato_mensal.enviar') THEN RAISE EXCEPTION 'Sem permissão para enviar extrato mensal'; END IF;
 v_ini := date_trunc('month',p_competencia)::date; v_fim := (v_ini + interval '1 month - 1 day')::date;
 PERFORM 1 FROM public.contas_bancarias WHERE id=p_conta AND ativo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta bancária inativa ou inexistente'; END IF;
 IF p_formato NOT IN ('ofx','pdf','xlsx') OR p_storage_path NOT LIKE 'bancos/' || to_char(v_ini,'YYYY-MM') || '/extrato_mensal/' || p_conta::text || '/%' OR p_storage_path LIKE '%..%' THEN RAISE EXCEPTION 'Arquivo ou caminho de extrato mensal inválido'; END IF;
 IF p_sha256 !~ '^[a-f0-9]{64}$' OR p_bytes <= 0 OR nullif(trim(p_nome),'') IS NULL THEN RAISE EXCEPTION 'Metadados do arquivo inválidos'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='contabil' AND name=p_storage_path) THEN RAISE EXCEPTION 'Arquivo não encontrado no armazenamento'; END IF;
 IF p_formato <> 'pdf' AND NOT EXISTS (SELECT 1 FROM public.extrato_fontes WHERE conta_bancaria_id=p_conta AND ativo AND periodicidade='mensal' AND formato=p_formato AND ((papel='extrato' AND destino='movimentacoes_bancarias') OR (papel='conferencia' AND destino='saldo_diario_conta'))) THEN RAISE EXCEPTION 'Formato não corresponde ao extrato oficial desta conta'; END IF;
 -- Saldo de abertura = saldo corrido da primeira linha menos seu valor; fechamento = última linha.
 SELECT saldo_corrido - CASE WHEN conta_no_saldo THEN valor ELSE 0 END INTO v_si FROM public.vw_extrato_conta WHERE conta_bancaria_id=p_conta AND data_transacao BETWEEN v_ini AND v_fim ORDER BY data_transacao,data_hora NULLS FIRST,id LIMIT 1;
 SELECT saldo_corrido INTO v_sf FROM public.vw_extrato_conta WHERE conta_bancaria_id=p_conta AND data_transacao BETWEEN v_ini AND v_fim ORDER BY data_transacao DESC,data_hora DESC NULLS LAST,id DESC LIMIT 1;
 IF v_si IS NULL THEN SELECT saldo INTO v_si FROM public.saldo_diario_conta WHERE conta_bancaria_id=p_conta AND data<v_ini ORDER BY data DESC,created_at DESC LIMIT 1; END IF;
 IF v_sf IS NULL THEN SELECT saldo INTO v_sf FROM public.saldo_diario_conta WHERE conta_bancaria_id=p_conta AND data<=v_fim ORDER BY data DESC,created_at DESC LIMIT 1; END IF;
 IF p_formato='pdf' THEN v_av := array_append(v_av,'Não conferido — PDF');
 ELSE
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL OR p_periodo_inicio>v_ini OR p_periodo_fim<v_fim THEN v_av:=array_append(v_av,'Período não cobre o mês inteiro'); END IF;
  IF p_saldo_inicial IS NULL OR p_saldo_final IS NULL THEN v_av:=array_append(v_av,'Saldos do arquivo não identificados'); END IF;
  IF v_si IS NULL OR v_sf IS NULL THEN v_av:=array_append(v_av,'Saldo SNCF indisponível'); END IF;
  IF abs(p_saldo_inicial-v_si)>0.005 THEN v_av:=array_append(v_av,'Saldo inicial divergente'); END IF;
  IF abs(p_saldo_final-v_sf)>0.005 THEN v_av:=array_append(v_av,'Saldo final divergente'); END IF;
 END IF;
 v_conf:=jsonb_build_object('conferido',p_formato<>'pdf','periodo_cobre_mes',p_periodo_inicio<=v_ini AND p_periodo_fim>=v_fim,'diferenca_inicial',round(p_saldo_inicial-v_si,2),'diferenca_final',round(p_saldo_final-v_sf,2),'avisos',to_jsonb(v_av));
 UPDATE public.contabil_extrato_mensal SET vigente=false WHERE competencia=v_ini AND conta_bancaria_id=p_conta AND vigente;
 INSERT INTO public.contabil_extrato_mensal(competencia,conta_bancaria_id,storage_path,nome_arquivo,formato,sha256,bytes,periodo_inicio,periodo_fim,saldo_inicial,saldo_final,saldo_inicial_sncf,saldo_final_sncf,conferencia,enviado_por)
 VALUES(v_ini,p_conta,p_storage_path,p_nome,p_formato,p_sha256,p_bytes,p_periodo_inicio,p_periodo_fim,p_saldo_inicial,p_saldo_final,v_si,v_sf,v_conf,auth.uid()) RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id,'conferencia',v_conf);
END $$;
REVOKE ALL ON FUNCTION public.fn_contabil_extrato_mensal_guardar(date,uuid,text,text,text,text,bigint,date,date,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_contabil_extrato_mensal_guardar(date,uuid,text,text,text,text,bigint,date,date,numeric,numeric) TO authenticated,service_role;