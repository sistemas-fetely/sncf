-- ============================================================
-- Correções de segurança — 23/08/2026
-- 1) Trilha de auditoria não-forjável (audit_log / acesso_dados_log)
-- 2) gestor_direto com escopo hierárquico nas tabelas de RH
-- 3) search_path fixo nas funções do schema public
-- ============================================================

-- ---------- 1) Audit log: fim do INSERT direto do cliente ----------
-- A escrita passa a ocorrer SOMENTE via funções SECURITY DEFINER
-- (registrar_audit, registrar_acesso_dado, etc.) e via service_role,
-- que não passam por RLS. Nenhum código cliente insere nessas tabelas.
DROP POLICY IF EXISTS audit_log_escrita_sistema ON public.audit_log;
DROP POLICY IF EXISTS sistema_registra_acesso ON public.acesso_dados_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;
REVOKE INSERT ON public.acesso_dados_log FROM authenticated, anon;

-- ---------- 2) RH: gestor_direto enxerga apenas seus subordinados ----------
-- Helpers SECURITY DEFINER (evitam recursão de RLS) que resolvem a
-- hierarquia canônica via public.tarefas_eh_gestor_de (vinculos.gestor_pessoa_id).
CREATE OR REPLACE FUNCTION public.rh_eh_gestor_de_clt(_colaborador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores_clt c
    WHERE c.id = _colaborador_id
      AND public.tarefas_eh_gestor_de(auth.uid(), c.user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.rh_eh_gestor_de_pj(_contrato_pj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_pj p
    WHERE p.id = _contrato_pj_id
      AND public.tarefas_eh_gestor_de(auth.uid(), p.user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.rh_eh_gestor_de_checklist(_checklist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.onboarding_checklists oc
    JOIN public.colaboradores_clt c ON c.id = oc.colaborador_id
    WHERE oc.id = _checklist_id
      AND public.tarefas_eh_gestor_de(auth.uid(), c.user_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.rh_eh_gestor_de_clt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rh_eh_gestor_de_pj(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rh_eh_gestor_de_checklist(uuid) TO authenticated;

-- Tabelas-pai (vínculo direto pela coluna user_id)
DROP POLICY IF EXISTS "Gestor direto can view colaboradores" ON public.colaboradores_clt;
CREATE POLICY "Gestor direto can view colaboradores"
ON public.colaboradores_clt FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.tarefas_eh_gestor_de(auth.uid(), user_id));

DROP POLICY IF EXISTS "Gestor direto can view contratos PJ" ON public.contratos_pj;
CREATE POLICY "Gestor direto can view contratos PJ"
ON public.contratos_pj FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.tarefas_eh_gestor_de(auth.uid(), user_id));

-- Tabelas filhas CLT (via colaborador_id)
DROP POLICY IF EXISTS "Gestor direto can view colaborador_acessos_sistemas" ON public.colaborador_acessos_sistemas;
CREATE POLICY "Gestor direto can view colaborador_acessos_sistemas"
ON public.colaborador_acessos_sistemas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

DROP POLICY IF EXISTS "Gestor direto can view colaborador_departamentos" ON public.colaborador_departamentos;
CREATE POLICY "Gestor direto can view colaborador_departamentos"
ON public.colaborador_departamentos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

DROP POLICY IF EXISTS "Gestor direto can view colaborador_equipamentos" ON public.colaborador_equipamentos;
CREATE POLICY "Gestor direto can view colaborador_equipamentos"
ON public.colaborador_equipamentos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

DROP POLICY IF EXISTS "Gestor direto can view ferias_periodos" ON public.ferias_periodos;
CREATE POLICY "Gestor direto can view ferias_periodos"
ON public.ferias_periodos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

DROP POLICY IF EXISTS "Gestor direto can view ferias_programacoes" ON public.ferias_programacoes;
CREATE POLICY "Gestor direto can view ferias_programacoes"
ON public.ferias_programacoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

DROP POLICY IF EXISTS "Gestor direto can view onboarding_checklists" ON public.onboarding_checklists;
CREATE POLICY "Gestor direto can view onboarding_checklists"
ON public.onboarding_checklists FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_clt(colaborador_id));

-- movimentacoes: atende os dois lados (CLT e PJ)
DROP POLICY IF EXISTS "Gestor direto can view movimentacoes" ON public.movimentacoes;
CREATE POLICY "Gestor direto can view movimentacoes"
ON public.movimentacoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND (public.rh_eh_gestor_de_clt(colaborador_id) OR public.rh_eh_gestor_de_pj(contrato_pj_id)));

-- Tabelas filhas PJ (via contrato_id)
DROP POLICY IF EXISTS "Gestor direto can view notas_fiscais_pj" ON public.notas_fiscais_pj;
CREATE POLICY "Gestor direto can view notas_fiscais_pj"
ON public.notas_fiscais_pj FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_id));

DROP POLICY IF EXISTS "Gestor direto can view pagamentos_pj" ON public.pagamentos_pj;
CREATE POLICY "Gestor direto can view pagamentos_pj"
ON public.pagamentos_pj FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_id));

DROP POLICY IF EXISTS "Gestor direto can view ferias_periodos_pj" ON public.ferias_periodos_pj;
CREATE POLICY "Gestor direto can view ferias_periodos_pj"
ON public.ferias_periodos_pj FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_id));

DROP POLICY IF EXISTS "Gestor direto can view ferias_pj" ON public.ferias_pj;
CREATE POLICY "Gestor direto can view ferias_pj"
ON public.ferias_pj FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_id));

-- Tabelas filhas PJ (via contrato_pj_id)
DROP POLICY IF EXISTS "Gestor direto can view contrato_pj_acessos_sistemas" ON public.contrato_pj_acessos_sistemas;
CREATE POLICY "Gestor direto can view contrato_pj_acessos_sistemas"
ON public.contrato_pj_acessos_sistemas FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_pj_id));

DROP POLICY IF EXISTS "Gestor direto can view contrato_pj_equipamentos" ON public.contrato_pj_equipamentos;
CREATE POLICY "Gestor direto can view contrato_pj_equipamentos"
ON public.contrato_pj_equipamentos FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_pj(contrato_pj_id));

-- onboarding_tarefas: via checklist do colaborador; responsável pela tarefa também vê
DROP POLICY IF EXISTS "Gestor direto can view onboarding_tarefas" ON public.onboarding_tarefas;
CREATE POLICY "Gestor direto can view onboarding_tarefas"
ON public.onboarding_tarefas FOR SELECT TO authenticated
USING (
  responsavel_user_id = auth.uid()
  OR (public.has_role(auth.uid(), 'gestor_direto') AND public.rh_eh_gestor_de_checklist(checklist_id))
);

-- ---------- 3) search_path fixo em todas as funções public sem configuração ----------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', f.sig, SQLERRM;
    END;
  END LOOP;
END $$;