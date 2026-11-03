CREATE TABLE public.credenciais_integracao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  acao text NOT NULL CHECK (acao IN ('criado','atualizado','removido')),
  por uuid,
  em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credenciais_integracao_log TO authenticated;
GRANT ALL ON public.credenciais_integracao_log TO service_role;
ALTER TABLE public.credenciais_integracao_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credenciais_log_ler" ON public.credenciais_integracao_log FOR SELECT TO authenticated
  USING (public.usuario_tem_acao('acao.credenciais_integracao.gravar', auth.uid()));

INSERT INTO public.permissoes_catalogo (slug, tipo, pilar, nome_exibicao, descricao, categoria_sod, contem_dado_sensivel, ativo, publica)
VALUES ('acao.credenciais_integracao.gravar','acao','sistema','Gravar credencial de integração',
  'Grava ou substitui credenciais de sistemas externos no cofre (Vault). Nunca mostra o valor.','execucao', true, true, false)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_vault_gravar_segredo(p_nome text, p_valor text, p_descricao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_acao text;
BEGIN
  IF v_uid IS NULL OR NOT public.usuario_tem_acao('acao.credenciais_integracao.gravar', v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para gravar credenciais (acao.credenciais_integracao.gravar).' USING ERRCODE = '42501';
  END IF;
  IF p_nome IS NULL OR p_nome !~ '^[a-z0-9_]{3,80}$' THEN
    RAISE EXCEPTION 'Nome inválido: use só minúsculas, números e _ (3 a 80 caracteres).' USING ERRCODE = '22023';
  END IF;
  IF p_valor IS NULL OR p_valor = '' THEN
    RAISE EXCEPTION 'Valor da credencial vazio.' USING ERRCODE = '22023';
  END IF;
  IF p_valor <> btrim(p_valor, E' \t\r\n') THEN
    RAISE EXCEPTION 'Valor da credencial tem espaço no começo ou no fim.' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_nome;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_valor, p_nome, nullif(btrim(coalesce(p_descricao,'')),''));
    v_acao := 'criado';
  ELSE
    PERFORM vault.update_secret(v_id, p_valor, p_nome, coalesce(nullif(btrim(coalesce(p_descricao,'')),''), (SELECT description FROM vault.secrets WHERE id = v_id)));
    v_acao := 'atualizado';
  END IF;
  INSERT INTO public.credenciais_integracao_log (nome, descricao, acao, por) VALUES (p_nome, p_descricao, v_acao, v_uid);
  RETURN jsonb_build_object('ok', true, 'nome', p_nome, 'acao', v_acao, 'em', now());
END $$;

CREATE OR REPLACE FUNCTION public.fn_vault_listar_segredos()
RETURNS TABLE (nome text, descricao text, atualizado_em timestamptz, atualizado_por text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tem_acao('acao.credenciais_integracao.gravar', auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para ver credenciais (acao.credenciais_integracao.gravar).' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.name::text, s.description::text, s.updated_at,
    (SELECT p.full_name FROM public.credenciais_integracao_log l LEFT JOIN public.profiles p ON p.user_id = l.por
      WHERE l.nome = s.name ORDER BY l.em DESC LIMIT 1)::text
  FROM vault.secrets s ORDER BY s.name;
END $$;

REVOKE ALL ON FUNCTION public.fn_vault_gravar_segredo(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_vault_listar_segredos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vault_gravar_segredo(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vault_listar_segredos() TO authenticated;