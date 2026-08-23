-- Remove políticas duplicadas NÃO escopadas de gestor_direto (23/08/2026).
-- Cada tabela já possui a política escopada equivalente criada na migração anterior;
-- sem este DROP, a versão ampla continuaria valendo (políticas RLS são OR).
DROP POLICY IF EXISTS "Gestor direto can view acessos" ON public.colaborador_acessos_sistemas;
DROP POLICY IF EXISTS "Gestor direto can view equipamentos" ON public.colaborador_equipamentos;
DROP POLICY IF EXISTS "Gestor direto can view contratos_pj" ON public.contratos_pj;
DROP POLICY IF EXISTS "Gestor direto can view pj acessos" ON public.contrato_pj_acessos_sistemas;
DROP POLICY IF EXISTS "Gestor direto can view pj equipamentos" ON public.contrato_pj_equipamentos;