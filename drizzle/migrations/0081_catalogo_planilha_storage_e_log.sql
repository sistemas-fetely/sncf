CREATE POLICY catalogo_planilha_storage_ler ON storage.objects FOR SELECT TO authenticated USING(bucket_id='catalogo-planilha' AND (public.usuario_tem_acao('acao.produto_importar_planilha_cadastro') OR public.usuario_tem_acao('acao.credenciais_integracao.gravar')));
CREATE POLICY catalogo_planilha_storage_teste ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='catalogo-planilha' AND name LIKE 'testes/%' AND public.has_role(auth.uid(),'super_admin'));
CREATE FUNCTION public.fn_catalogo_status_leitura(p_leitura_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço'; END IF;
 UPDATE catalogo_planilha_leitura SET status=CASE WHEN EXISTS(SELECT 1 FROM catalogo_planilha_mudanca WHERE leitura_id=p_leitura_id AND status='pendente') THEN 'aplicada_parcial' ELSE 'aplicada' END WHERE id=p_leitura_id AND ambiente='oficial';
 END $$;
REVOKE ALL ON FUNCTION public.fn_catalogo_status_leitura(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_status_leitura(uuid) TO service_role;