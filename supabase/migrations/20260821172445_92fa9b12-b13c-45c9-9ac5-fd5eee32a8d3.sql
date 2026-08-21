-- ============================================================
-- 1) v_pessoas_sistema: remove SECURITY DEFINER view over auth.users
--    (fix SUPA_security_definer_view + SUPA_auth_users_exposed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_v_pessoas_sistema()
RETURNS TABLE (
  id uuid, nome text, email text, cargo text, avatar_url text,
  departamento_id uuid, departamento_nome text, status text, tipo_vinculo text, origem text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT u.id,
         COALESCE(ps.nome_completo, p.full_name, (u.email)::text) AS nome,
         COALESCE(v.email_corporativo, (u.email)::text) AS email,
         COALESCE(cg.nome, p."position") AS cargo,
         COALESCE(ps.foto_url, p.avatar_url) AS avatar_url,
         COALESCE(v.departamento_id, p.departamento_id) AS departamento_id,
         d.nome AS departamento_nome,
         CASE WHEN (v.id IS NOT NULL AND v.status = 'ativo') THEN 'ativo' ELSE 'inativo' END AS status,
         COALESCE(v.tipo_vinculo, 'indefinido') AS tipo_vinculo,
         CASE WHEN (v.id IS NOT NULL AND v.status = 'ativo') THEN 'colaborador' ELSE 'sem_ficha' END AS origem
  FROM auth.users u
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN vinculos v ON v.usuario_id = u.id AND v.status = 'ativo'
  LEFT JOIN pessoas ps ON ps.id = v.pessoa_id
  LEFT JOIN cargos cg ON cg.id = v.cargo_id
  LEFT JOIN departamentos d ON d.id = COALESCE(v.departamento_id, p.departamento_id);
$fn$;

-- A policy "Ver projetos de tarefas" depende da view: remover e recriar identica
DROP POLICY "Ver projetos de tarefas" ON public.tarefas_projetos;
DROP VIEW public.v_pessoas_sistema;
CREATE VIEW public.v_pessoas_sistema WITH (security_invoker = true) AS
SELECT * FROM public.fn_v_pessoas_sistema();
GRANT SELECT ON public.v_pessoas_sistema TO authenticated;
GRANT SELECT ON public.v_pessoas_sistema TO service_role;
CREATE POLICY "Ver projetos de tarefas" ON public.tarefas_projetos
  FOR SELECT TO authenticated
  USING (
    tarefas_is_admin(auth.uid())
    OR criado_por = auth.uid()
    OR responsavel_id = auth.uid()
    OR (visibilidade)::text = 'publica'::text
    OR (((visibilidade)::text = 'departamento'::text) AND EXISTS (
      SELECT 1 FROM v_pessoas_sistema p
      WHERE p.id = auth.uid() AND p.departamento_id = tarefas_projetos.departamento_id
    ))
    OR (((visibilidade)::text = 'privada'::text) AND rh_pode_ver_sensivel(auth.uid()))
  );

-- ============================================================
-- 2) v_parceiro_timeline: remove direct auth.users dependency
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_email_usuario(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$ SELECT (u.email)::text FROM auth.users u WHERE u.id = p_user_id $fn$;

DROP VIEW public.v_parceiro_timeline;
CREATE VIEW public.v_parceiro_timeline WITH (security_invoker = true) AS
SELECT pm.id,
       pm.parceiro_id,
       pm.tipo_marco,
       pm.valor_anterior,
       pm.valor_novo,
       pm.motivo,
       pm.referencia_id,
       pm.referencia_tipo,
       pm.operador_id,
       public.fn_email_usuario(pm.operador_id) AS operador_email,
       pm.criado_em
FROM public.parceiro_marcos pm;
GRANT SELECT ON public.v_parceiro_timeline TO authenticated;
GRANT SELECT ON public.v_parceiro_timeline TO service_role;

-- ============================================================
-- 3) vw_reembolso_saneamento: tem_login without reading auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_email_tem_login(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$ SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower((u.email)::text) = lower(p_email)) $fn$;

DROP VIEW public.vw_reembolso_saneamento;
CREATE VIEW public.vw_reembolso_saneamento WITH (security_invoker = true) AS
SELECT v.id AS vinculo_id,
       p.id AS pessoa_id,
       p.nome_completo,
       v.tipo_vinculo,
       c.nome AS cargo,
       cc.codigo AS centro_custo_codigo,
       cc.nome AS centro_custo_nome,
       gp.nome_completo AS gestor_nome,
       v.email_corporativo,
       (COALESCE(btrim(v.chave_pix), ''::text) <> ''::text) AS tem_pix,
       (COALESCE(btrim(v.email_corporativo), ''::text) = ''::text) AS falta_email,
       (COALESCE(btrim(v.chave_pix), ''::text) = ''::text) AS falta_pix,
       (v.gestor_pessoa_id IS NULL) AS falta_gestor,
       (v.centro_custo_id IS NULL) AS falta_centro_custo,
       ((v.tipo_vinculo = 'PJ'::text) AND (NOT v.contrato_preve_reembolso)) AS falta_previsao_contratual,
       v.contrato_preve_reembolso,
       ((COALESCE(btrim(v.email_corporativo), ''::text) <> ''::text) AND (COALESCE(btrim(v.chave_pix), ''::text) <> ''::text) AND (v.centro_custo_id IS NOT NULL) AND ((v.tipo_vinculo <> 'PJ'::text) OR v.contrato_preve_reembolso)) AS pronto_para_reembolso,
       public.fn_email_tem_login(v.email_corporativo) AS tem_login
FROM vinculos v
JOIN pessoas p ON p.id = v.pessoa_id
LEFT JOIN pessoas gp ON gp.id = v.gestor_pessoa_id
LEFT JOIN cargos c ON c.id = v.cargo_id
LEFT JOIN centros_custo cc ON cc.id = v.centro_custo_id
WHERE v.status = 'ativo'
  AND (has_role(auth.uid(), 'diretoria_executiva'::app_role)
       OR has_role(auth.uid(), 'coordenacao_op_fin'::app_role)
       OR has_role(auth.uid(), 'auditor'::app_role)
       OR has_role(auth.uid(), 'super_admin'::app_role));
GRANT SELECT ON public.vw_reembolso_saneamento TO authenticated;
GRANT SELECT ON public.vw_reembolso_saneamento TO service_role;

-- ============================================================
-- 4) mv_dre_fato: move materialized view out of the exposed API schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;
ALTER MATERIALIZED VIEW public.mv_dre_fato SET SCHEMA private;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.mv_dre_fato TO authenticated;
GRANT SELECT ON private.mv_dre_fato TO service_role;

CREATE OR REPLACE FUNCTION public.fn_refresh_dre()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare t0 timestamptz := clock_timestamp(); n int;
begin
  refresh materialized view concurrently private.mv_dre_fato;
  select count(*) into n from private.mv_dre_fato;
  update public.dre_refresh_estado
     set refreshed_em = now(),
         duracao_ms = extract(milliseconds from clock_timestamp()-t0)::int,
         linhas = n, erro = null
   where id;
exception when others then
  update public.dre_refresh_estado set erro = SQLERRM, refreshed_em = now() where id;
  raise;
end $function$;

-- ============================================================
-- 5) Function privilege hardening
--    (fix SUPA_anon_security_definer_function_executable)
-- ============================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'obter_pagamento_publico',   -- public PIX payment page (token-gated)
        'has_role',                  -- RLS policy helpers evaluated for public-role policies
        'has_module_permission',
        'rh_pode_ver_sensivel',
        'tarefas_is_admin',
        'fn_reembolso_meu_vinculo'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.sig);
  END LOOP;
END $$;

-- Functions created by this admin role from now on: no implicit PUBLIC EXECUTE
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;