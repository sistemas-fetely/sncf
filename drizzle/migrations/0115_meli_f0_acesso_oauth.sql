SET LOCAL lock_timeout = '3s';

CREATE TABLE public.meli_conta (
  codigo text PRIMARY KEY,
  rotulo text NOT NULL,
  login_email text,
  mp_conta_codigo text REFERENCES public.mp_conta_dim(codigo),
  segredo_client_id text NOT NULL,
  segredo_client_secret text NOT NULL,
  segredo_access_token text NOT NULL,
  segredo_refresh_token text NOT NULL,
  seller_id bigint,
  nickname text,
  site_id text,
  conectado_em timestamptz,
  conectado_por uuid,
  token_expira_em timestamptz,
  ultimo_refresh_em timestamptz,
  ultimo_refresh_ok boolean,
  ultimo_erro text,
  refresh_reservado_ate timestamptz,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meli_conta_mp_conta_idx ON public.meli_conta(mp_conta_codigo);
GRANT SELECT ON public.meli_conta TO authenticated;
GRANT ALL ON public.meli_conta TO service_role;
ALTER TABLE public.meli_conta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meli_conta leitura credenciais" ON public.meli_conta FOR SELECT TO authenticated
  USING (public.usuario_tem_acao('acao.credenciais_integracao.gravar', auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE TRIGGER trg_meli_conta_updated BEFORE UPDATE ON public.meli_conta FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();

INSERT INTO public.meli_conta (codigo, rotulo, login_email, mp_conta_codigo, segredo_client_id, segredo_client_secret, segredo_access_token, segredo_refresh_token, ordem)
VALUES ('MELI-FETELY', 'Mercado Livre — Fetély', 'sistemas@fetely.com.br', 'MP-MELI', 'meli_client_id', 'meli_client_secret', 'meli_access_token', 'meli_refresh_token', 10);

CREATE TABLE public.meli_oauth_state (
  state text PRIMARY KEY,
  conta_codigo text NOT NULL REFERENCES public.meli_conta(codigo),
  code_verifier text NOT NULL,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  expira_em timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX meli_oauth_state_conta_idx ON public.meli_oauth_state(conta_codigo);
GRANT ALL ON public.meli_oauth_state TO service_role;
ALTER TABLE public.meli_oauth_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meli_eventos_raw (
  id bigserial PRIMARY KEY,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  topic text,
  resource text,
  user_id bigint,
  application_id bigint,
  attempts int,
  sent timestamptz,
  payload jsonb,
  processado_em timestamptz,
  erro text
);
CREATE INDEX meli_eventos_raw_topic_idx ON public.meli_eventos_raw(topic, recebido_em);
CREATE UNIQUE INDEX meli_eventos_raw_idem ON public.meli_eventos_raw(topic, resource, sent) WHERE topic IS NOT NULL AND resource IS NOT NULL AND sent IS NOT NULL;
GRANT ALL ON public.meli_eventos_raw TO service_role;
GRANT USAGE ON SEQUENCE public.meli_eventos_raw_id_seq TO service_role;
ALTER TABLE public.meli_eventos_raw ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._meli_gravar_segredo(p_nome text, p_valor text, p_desc text, p_por uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
DECLARE v_id uuid; v_acao text;
BEGIN
  IF p_valor IS NULL OR p_valor = '' THEN RAISE EXCEPTION 'Valor vazio para %', p_nome USING ERRCODE='22023'; END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_nome;
  IF v_id IS NULL THEN PERFORM vault.create_secret(p_valor, p_nome, p_desc); v_acao := 'criado';
  ELSE PERFORM vault.update_secret(v_id, p_valor, p_nome, p_desc); v_acao := 'atualizado'; END IF;
  INSERT INTO public.credenciais_integracao_log (nome, descricao, acao, por) VALUES (p_nome, p_desc, v_acao, p_por);
END $$;

CREATE OR REPLACE FUNCTION public.fn_meli_gravar_tokens(p_conta text, p_access text, p_refresh text, p_expira_em timestamptz, p_seller_id bigint DEFAULT NULL, p_nickname text DEFAULT NULL, p_site_id text DEFAULT NULL, p_por uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, pg_temp AS $$
DECLARE c public.meli_conta;
BEGIN
  SELECT * INTO c FROM public.meli_conta WHERE codigo = p_conta FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta Mercado Livre % não cadastrada', p_conta USING ERRCODE='22023'; END IF;
  IF p_expira_em IS NULL THEN RAISE EXCEPTION 'Validade do token ausente' USING ERRCODE='22023'; END IF;
  PERFORM public._meli_gravar_segredo(c.segredo_access_token, p_access, c.rotulo || ' — access token (OAuth)', p_por);
  PERFORM public._meli_gravar_segredo(c.segredo_refresh_token, p_refresh, c.rotulo || ' — refresh token (OAuth, uso único)', p_por);
  UPDATE public.meli_conta SET
    token_expira_em = p_expira_em, ultimo_refresh_em = now(), ultimo_refresh_ok = true, ultimo_erro = NULL,
    refresh_reservado_ate = NULL,
    seller_id = coalesce(p_seller_id, seller_id), nickname = coalesce(p_nickname, nickname), site_id = coalesce(p_site_id, site_id),
    conectado_em = CASE WHEN p_seller_id IS NOT NULL THEN now() ELSE conectado_em END,
    conectado_por = CASE WHEN p_seller_id IS NOT NULL THEN p_por ELSE conectado_por END
  WHERE codigo = p_conta;
  RETURN jsonb_build_object('ok', true, 'conta', p_conta, 'expira_em', p_expira_em);
END $$;

CREATE OR REPLACE FUNCTION public.fn_meli_registrar_erro_token(p_conta text, p_erro text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.meli_conta SET ultimo_refresh_ok = false, ultimo_erro = left(p_erro, 500), ultimo_refresh_em = now(), refresh_reservado_ate = NULL
  WHERE codigo = p_conta;
END $$;

-- Reserva atômica da renovação (equivalente ao advisory lock, que não sobrevive entre chamadas PostgREST).
CREATE OR REPLACE FUNCTION public.fn_meli_reservar_refresh(p_conta text, p_segundos int DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v boolean;
BEGIN
  UPDATE public.meli_conta SET refresh_reservado_ate = now() + make_interval(secs => p_segundos)
  WHERE codigo = p_conta AND (refresh_reservado_ate IS NULL OR refresh_reservado_ate < now())
  RETURNING true INTO v;
  RETURN coalesce(v, false);
END $$;

CREATE OR REPLACE FUNCTION public.fn_meli_liberar_refresh(p_conta text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.meli_conta SET refresh_reservado_ate = NULL WHERE codigo = p_conta;
$$;

REVOKE ALL ON FUNCTION public._meli_gravar_segredo(text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_meli_gravar_tokens(text,text,text,timestamptz,bigint,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_meli_registrar_erro_token(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_meli_reservar_refresh(text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_meli_liberar_refresh(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._meli_gravar_segredo(text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_meli_gravar_tokens(text,text,text,timestamptz,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_meli_registrar_erro_token(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_meli_reservar_refresh(text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_meli_liberar_refresh(text) TO service_role;

CREATE VIEW public.vw_fila_meli_token_falha WITH (security_invoker = on) AS
SELECT codigo AS id, rotulo, ultimo_erro, token_expira_em, ultimo_refresh_em AS desde, true AS exige_acao_nossa
FROM public.meli_conta
WHERE ativo AND seller_id IS NOT NULL AND (ultimo_refresh_ok = false OR token_expira_em < now());
GRANT SELECT ON public.vw_fila_meli_token_falha TO authenticated, service_role;

INSERT INTO public.tarefas_filas (chave, nome, descricao, departamento_id, fonte_contagem, fonte_tipo, estado, rota, severidade, coluna_entrada, exec_coluna_id, coluna_acao_nossa)
VALUES ('meli_token_falha', 'Mercado Livre — conexão caiu', 'Conta do Mercado Livre com renovação de token falhando ou token vencido; reconectar em TI › Integrações › Mercado Livre.',
  '58ca979d-a3fc-4f2d-9f28-0c9c5c4eb120', 'vw_fila_meli_token_falha', 'view', 'pronta', '/ti/integracoes?aba=mercado-livre', 'critica', 'desde', 'id', 'exige_acao_nossa');