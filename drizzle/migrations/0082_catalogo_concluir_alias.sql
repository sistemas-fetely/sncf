CREATE OR REPLACE FUNCTION public.fn_catalogo_leitura_concluir(p_leitura_id uuid,p_status text,p_totais jsonb,p_mudancas jsonb DEFAULT '[]',p_base_inicial jsonb DEFAULT '[]',p_erro text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l catalogo_planilha_leitura; celula jsonb;
BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Somente serviço.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('catalogo_planilha'));
 SELECT * INTO STRICT l FROM catalogo_planilha_leitura WHERE id=p_leitura_id FOR UPDATE;
 IF l.ambiente='oficial' THEN
  FOR celula IN SELECT * FROM jsonb_array_elements(p_base_inicial) LOOP
   INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id) VALUES(celula->>'cod_cadastro',celula->>'campo',celula->'valor',l.id) ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 INSERT INTO catalogo_planilha_mudanca(leitura_id,cod_cadastro,campo,dono,valor_base,valor_planilha,valor_sistema,tipo,status,erro,resolvido_em)
 SELECT l.id,j->>'cod_cadastro',j->>'campo',j->>'dono',j->'valor_base',j->'valor_planilha',j->'valor_sistema',j->>'tipo',CASE WHEN j->>'tipo'='ja_igual' THEN 'resolvida' ELSE 'pendente' END,j->>'erro',CASE WHEN j->>'tipo'='ja_igual' THEN now() END FROM jsonb_array_elements(p_mudancas) j;
 IF l.ambiente='oficial' THEN
  INSERT INTO catalogo_planilha_base(cod_cadastro,campo,valor,leitura_id)
  SELECT cod_cadastro,campo,valor_planilha,l.id FROM catalogo_planilha_mudanca WHERE leitura_id=l.id AND tipo='ja_igual'
  ON CONFLICT(cod_cadastro,campo) DO UPDATE SET valor=excluded.valor,leitura_id=excluded.leitura_id,atualizado_em=now();
 END IF;
 UPDATE catalogo_planilha_leitura SET status=p_status,totais=p_totais,erro=p_erro WHERE id=l.id;
 RETURN jsonb_build_object('ok',true,'id',l.id);
END $$;