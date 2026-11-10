-- lovable-cron-fallback-reviewed: bounded retry queue, armed only on contention and unscheduled on acquisition/drain; at most 1440 checks/day only while pending, one-minute recovery after lease expiry.
CREATE TABLE public.catalogo_planilha_trava (ambiente text PRIMARY KEY,dono text,token uuid,iniciada_em timestamptz,expira_em timestamptz,ator uuid,leitura_aguardando boolean NOT NULL DEFAULT false,tentar_em timestamptz);
GRANT ALL ON public.catalogo_planilha_trava TO service_role;
ALTER TABLE public.catalogo_planilha_trava ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogo_trava_servico ON public.catalogo_planilha_trava TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.fn_catalogo_leitura_retentar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.catalogo_planilha_trava;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 SELECT * INTO t FROM public.catalogo_planilha_trava WHERE ambiente='oficial' AND leitura_aguardando FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='catalogo-sharepoint-retentativa') THEN PERFORM cron.unschedule('catalogo-sharepoint-retentativa'); END IF;
  RETURN;
 END IF;
 IF coalesce(t.tentar_em,clock_timestamp())>clock_timestamp() OR (t.token IS NOT NULL AND t.expira_em>clock_timestamp()) THEN RETURN; END IF;
 PERFORM public.fn_cron_chamar_edge('catalogo-sharepoint-retentativa','catalogo-planilha-ler','{"acao":"ler"}'::jsonb,120000);
 UPDATE public.catalogo_planilha_trava SET tentar_em=clock_timestamp()+interval '5 minutes' WHERE ambiente='oficial';
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_leitura_retentar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_leitura_retentar() TO service_role;

CREATE FUNCTION public.fn_catalogo_trava_pegar(p_ambiente text,p_dono text,p_segundos integer,p_ator uuid DEFAULT NULL,p_aguardar boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.catalogo_planilha_trava; v_token uuid:=gen_random_uuid();
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 IF p_ambiente IS DISTINCT FROM 'oficial' OR p_dono IS NULL OR p_dono NOT IN ('leitura','aplicacao') OR p_segundos IS NULL OR p_segundos<60 OR p_segundos>900 THEN RAISE EXCEPTION 'Trava inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 INSERT INTO public.catalogo_planilha_trava(ambiente) VALUES(p_ambiente) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT t FROM public.catalogo_planilha_trava WHERE ambiente=p_ambiente FOR UPDATE;
 IF t.token IS NOT NULL AND t.expira_em>clock_timestamp() THEN
  IF p_aguardar AND p_dono='leitura' THEN
   UPDATE public.catalogo_planilha_trava SET leitura_aguardando=true,tentar_em=coalesce(tentar_em,clock_timestamp()) WHERE ambiente=p_ambiente;
   PERFORM cron.schedule('catalogo-sharepoint-retentativa','* * * * *','SELECT public.fn_catalogo_leitura_retentar();');
  END IF;
  RETURN jsonb_build_object('ok',false,'dono',t.dono,'expira_em',t.expira_em);
 END IF;
 UPDATE public.catalogo_planilha_trava SET dono=p_dono,token=v_token,iniciada_em=clock_timestamp(),expira_em=clock_timestamp()+make_interval(secs=>p_segundos),ator=p_ator,leitura_aguardando=CASE WHEN p_dono='leitura' THEN false ELSE leitura_aguardando END,tentar_em=CASE WHEN p_dono='leitura' THEN NULL ELSE tentar_em END WHERE ambiente=p_ambiente;
 IF p_dono='leitura' AND EXISTS(SELECT 1 FROM cron.job WHERE jobname='catalogo-sharepoint-retentativa') THEN PERFORM cron.unschedule('catalogo-sharepoint-retentativa'); END IF;
 RETURN jsonb_build_object('ok',true,'token',v_token);
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_trava_pegar(text,text,integer,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_trava_pegar(text,text,integer,uuid,boolean) TO service_role;

CREATE FUNCTION public.fn_catalogo_trava_renovar(p_ambiente text,p_token uuid,p_segundos integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 IF p_segundos IS NULL OR p_segundos<60 OR p_segundos>900 THEN RAISE EXCEPTION 'Prazo inválido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 UPDATE public.catalogo_planilha_trava SET expira_em=clock_timestamp()+make_interval(secs=>p_segundos) WHERE ambiente=p_ambiente AND token=p_token AND expira_em>clock_timestamp();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_trava_renovar(text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_trava_renovar(text,uuid,integer) TO service_role;

CREATE FUNCTION public.fn_catalogo_trava_soltar(p_ambiente text,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 UPDATE public.catalogo_planilha_trava SET dono=NULL,token=NULL,expira_em=NULL,ator=NULL WHERE ambiente=p_ambiente AND token=p_token;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_trava_soltar(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_trava_soltar(text,uuid) TO service_role;