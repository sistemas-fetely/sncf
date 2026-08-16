-- =====================================================================
-- MIGRATION RETROATIVA: documenta estado do banco criado fora de migration.
-- Idempotente. Sem UPDATE/DELETE de dado.
-- =====================================================================

-- ---------- SCHEMA cron_jobs ----------
CREATE SCHEMA IF NOT EXISTS cron_jobs;
REVOKE ALL ON SCHEMA cron_jobs FROM PUBLIC;
REVOKE ALL ON SCHEMA cron_jobs FROM anon;
REVOKE ALL ON SCHEMA cron_jobs FROM authenticated;
GRANT USAGE, CREATE ON SCHEMA cron_jobs TO postgres;

-- ---------- TABELA tipos_vinculo ----------
CREATE TABLE IF NOT EXISTS public.tipos_vinculo (
  codigo text NOT NULL PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  entra_folha boolean NOT NULL DEFAULT true,
  entra_headcount boolean NOT NULL DEFAULT true,
  permite_reembolso boolean NOT NULL DEFAULT true,
  aparece_organograma boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_vinculo TO authenticated;
GRANT ALL ON public.tipos_vinculo TO service_role;

ALTER TABLE public.tipos_vinculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver tipos de vinculo" ON public.tipos_vinculo;
CREATE POLICY "Ver tipos de vinculo" ON public.tipos_vinculo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin gerencia tipos de vinculo" ON public.tipos_vinculo;
CREATE POLICY "Super admin gerencia tipos de vinculo" ON public.tipos_vinculo
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.tipos_vinculo
  (codigo, nome, descricao, entra_folha, entra_headcount, permite_reembolso, aparece_organograma, ativo, ordem)
VALUES
  ('CLT','CLT','Colaborador com carteira assinada.',true,true,true,true,true,10),
  ('PJ','Colaborador PJ','Colaborador com as MESMAS condicoes internas do CLT. A diferenca e apenas juridica.',true,true,true,true,true,20),
  ('PRESTADOR','Prestador','Terceiro pilar. Custo mensal que COMPOE a folha, mas nao e funcionario: sem beneficios e fora do headcount. Tem lider a quem reportar, entao aparece no organograma. Nao confundir com prestador de servico tradicional (fornecedor), que nao tem vinculo e vive so em despesas.',true,false,false,true,true,30),
  ('SOCIO','Socio','Socio da empresa. Aparece no organograma para sustentar a hierarquia, mas nao entra na folha nem no headcount.',false,false,false,true,true,40)
ON CONFLICT (codigo) DO NOTHING;

-- ---------- COLUNA posicoes.vinculo_id ----------
ALTER TABLE public.posicoes ADD COLUMN IF NOT EXISTS vinculo_id uuid;

DO $$ BEGIN
  ALTER TABLE public.posicoes
    ADD CONSTRAINT posicoes_vinculo_id_fkey
    FOREIGN KEY (vinculo_id) REFERENCES public.vinculos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS posicoes_vinculo_id_uniq
  ON public.posicoes USING btree (vinculo_id) WHERE (vinculo_id IS NOT NULL);

-- ---------- FKs de tipo_vinculo ----------
DO $$ BEGIN
  ALTER TABLE public.vinculos
    ADD CONSTRAINT vinculos_tipo_vinculo_fkey
    FOREIGN KEY (tipo_vinculo) REFERENCES public.tipos_vinculo(codigo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.encargos_parametros
    ADD CONSTRAINT encargos_parametros_tipo_vinculo_fkey
    FOREIGN KEY (tipo_vinculo) REFERENCES public.tipos_vinculo(codigo);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- VIEW v_pessoas_sistema ----------
CREATE OR REPLACE VIEW public.v_pessoas_sistema AS
 SELECT u.id,
    COALESCE(ps.nome_completo, p.full_name, u.email::text) AS nome,
    COALESCE(v.email_corporativo, u.email::text) AS email,
    COALESCE(cg.nome, p."position") AS cargo,
    COALESCE(ps.foto_url, p.avatar_url) AS avatar_url,
    COALESCE(v.departamento_id, p.departamento_id) AS departamento_id,
    d.nome AS departamento_nome,
        CASE
            WHEN v.id IS NOT NULL AND v.status = 'ativo'::text THEN 'ativo'::text
            ELSE 'inativo'::text
        END AS status,
    COALESCE(v.tipo_vinculo, 'indefinido'::text) AS tipo_vinculo,
        CASE
            WHEN v.id IS NOT NULL AND v.status = 'ativo'::text THEN 'colaborador'::text
            ELSE 'sem_ficha'::text
        END AS origem
   FROM auth.users u
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN vinculos v ON v.usuario_id = u.id AND v.status = 'ativo'::text
     LEFT JOIN pessoas ps ON ps.id = v.pessoa_id
     LEFT JOIN cargos cg ON cg.id = v.cargo_id
     LEFT JOIN departamentos d ON d.id = COALESCE(v.departamento_id, p.departamento_id);

REVOKE ALL ON public.v_pessoas_sistema FROM anon;
GRANT SELECT ON public.v_pessoas_sistema TO authenticated;
GRANT ALL ON public.v_pessoas_sistema TO service_role;

-- ---------- FUNCOES public ----------
CREATE OR REPLACE FUNCTION public.tarefas_is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'super_admin'::public.app_role) $function$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _modulo text, _acao text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _acao = 'ver_sensivel' THEN public.has_role(_user_id, 'super_admin'::public.app_role)
    ELSE public.tem_permissao(_user_id, _modulo,
      CASE _acao WHEN 'ver' THEN 'view' WHEN 'criar' THEN 'create' WHEN 'editar' THEN 'edit' ELSE _acao END,
      NULL)
  END
$function$;

CREATE OR REPLACE FUNCTION public.rh_pode_ver_sensivel(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'super_admin'::public.app_role) $function$;

CREATE OR REPLACE FUNCTION public.is_rh(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'rh'::public.app_role)
        OR public.has_role(_user_id, 'admin_rh'::public.app_role)
        OR public.has_role(_user_id, 'gestor_rh'::public.app_role) $function$;

CREATE OR REPLACE FUNCTION public.is_controladoria(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'financeiro'::public.app_role)
        OR public.has_role(_user_id, 'coordenacao_op_fin'::public.app_role) $function$;

-- tipo de retorno mudou: precisa DROP antes
DROP FUNCTION IF EXISTS public.tarefas_meu_time();
CREATE OR REPLACE FUNCTION public.tarefas_meu_time()
 RETURNS TABLE(user_id uuid, gestor_user_id uuid, nivel integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE eu AS (
    SELECT v.pessoa_id
    FROM public.vinculos v
    WHERE v.usuario_id = auth.uid() AND v.status = 'ativo'
  ),
  cadeia AS (
    SELECT v.pessoa_id, v.usuario_id, v.gestor_pessoa_id,
           1 AS nivel, ARRAY[v.pessoa_id] AS caminho
    FROM public.vinculos v
    WHERE v.status = 'ativo'
      AND v.gestor_pessoa_id IN (SELECT pessoa_id FROM eu)
    UNION ALL
    SELECT v.pessoa_id, v.usuario_id, v.gestor_pessoa_id,
           c.nivel + 1, c.caminho || v.pessoa_id
    FROM public.vinculos v
    JOIN cadeia c ON v.gestor_pessoa_id = c.pessoa_id
    WHERE v.status = 'ativo'
      AND NOT v.pessoa_id = ANY(c.caminho)
      AND array_length(c.caminho, 1) < 20
  )
  SELECT DISTINCT ON (c.usuario_id)
         c.usuario_id AS user_id,
         g.usuario_id AS gestor_user_id,
         c.nivel
  FROM cadeia c
  LEFT JOIN public.vinculos g
         ON g.pessoa_id = c.gestor_pessoa_id AND g.status = 'ativo'
  WHERE c.usuario_id IS NOT NULL
  ORDER BY c.usuario_id, c.nivel
$function$;
GRANT EXECUTE ON FUNCTION public.tarefas_meu_time() TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_recalcular_gestores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE afetados integer;
BEGIN
  WITH RECURSIVE subida AS (
    SELECT p.id AS origem, p.vinculo_id AS vinculo_origem, p.id_pai
    FROM posicoes p WHERE p.vinculo_id IS NOT NULL
    UNION ALL
    SELECT s.origem, s.vinculo_origem, pai.id_pai
    FROM subida s
    JOIN posicoes pai ON pai.id = s.id_pai
    WHERE pai.vinculo_id IS NULL          -- vaga: atravessa e continua subindo
  ),
  resolvido AS (
    SELECT DISTINCT ON (s.vinculo_origem)
           s.vinculo_origem, vg.pessoa_id AS gestor
    FROM subida s
    JOIN posicoes pai ON pai.id = s.id_pai
    JOIN vinculos vg ON vg.id = pai.vinculo_id AND vg.status = 'ativo'
    WHERE pai.vinculo_id IS NOT NULL
  )
  UPDATE vinculos v
  SET gestor_pessoa_id = r.gestor
  FROM resolvido r
  WHERE v.id = r.vinculo_origem
    AND v.gestor_pessoa_id IS DISTINCT FROM r.gestor;
  GET DIAGNOSTICS afetados = ROW_COUNT;

  -- quem nao tem ancestral ocupado nao tem gestor
  UPDATE vinculos v SET gestor_pessoa_id = NULL
  WHERE v.gestor_pessoa_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM posicoes p
      JOIN posicoes pai ON pai.id = p.id_pai AND pai.vinculo_id IS NOT NULL
      WHERE p.vinculo_id = v.id
    );
  RETURN afetados;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_fn_posicoes_gestores()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_recalcular_gestores();
  RETURN NULL;
END $function$;

-- tipo de retorno mudou: precisa DROP antes
DROP FUNCTION IF EXISTS public.get_organograma_tree();
CREATE OR REPLACE FUNCTION public.get_organograma_tree()
 RETURNS TABLE(id uuid, titulo_cargo text, nivel_hierarquico integer, departamento text, area text, filial text, status text, id_pai uuid, colaborador_id uuid, contrato_pj_id uuid, vinculo_id uuid, salario_previsto numeric, centro_custo text, created_at timestamp with time zone, updated_at timestamp with time zone, depth integer, path uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE tree AS (
    SELECT p.id, p.titulo_cargo, p.nivel_hierarquico, p.departamento, p.area, p.filial,
           p.status, p.id_pai, p.colaborador_id, p.contrato_pj_id, p.vinculo_id,
           p.salario_previsto, p.centro_custo, p.created_at, p.updated_at,
           0 AS depth, ARRAY[p.id] AS path
    FROM posicoes p WHERE p.id_pai IS NULL
    UNION ALL
    SELECT p.id, p.titulo_cargo, p.nivel_hierarquico, p.departamento, p.area, p.filial,
           p.status, p.id_pai, p.colaborador_id, p.contrato_pj_id, p.vinculo_id,
           p.salario_previsto, p.centro_custo, p.created_at, p.updated_at,
           t.depth + 1, t.path || p.id
    FROM posicoes p INNER JOIN tree t ON p.id_pai = t.id
  )
  SELECT * FROM tree ORDER BY path;
$function$;
GRANT EXECUTE ON FUNCTION public.get_organograma_tree() TO authenticated;

-- ---------- FUNCOES cron_jobs ----------
CREATE OR REPLACE FUNCTION cron_jobs.gerar_tarefas_recorrentes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r record; _d date; _horizonte date; _total integer := 0; _n integer; _guard integer;
BEGIN
  FOR _r IN SELECT * FROM public.tarefas_recorrencias
             WHERE ativo AND (fim_em IS NULL OR fim_em >= current_date)
  LOOP
    _horizonte := current_date + 7 + COALESCE(_r.antecedencia_dias, 0);
    _d := GREATEST(COALESCE(_r.proxima_geracao, _r.inicio_em), _r.inicio_em);
    _guard := 0;
    LOOP
      _guard := _guard + 1;
      EXIT WHEN _guard > 200;
      _d := public.tarefas_rec_proxima(_r.frequencia, _r.intervalo, _r.dias_semana,
                                       _r.dia_mes, _r.mes, _r.inicio_em, _d);
      EXIT WHEN _d IS NULL OR _d > _horizonte OR (_r.fim_em IS NOT NULL AND _d > _r.fim_em);

      INSERT INTO public.tarefas (
        titulo, descricao, prioridade, projeto_id, secao_id, responsavel_id,
        visibilidade, estimativa_horas, departamento_destino_id,
        status, criado_por, data_limite, tipo_origem, modulo_origem,
        recorrencia_id, ocorrencia_data
      ) VALUES (
        _r.titulo, _r.descricao, _r.prioridade, _r.projeto_id, _r.secao_id, _r.responsavel_id,
        _r.visibilidade, _r.estimativa_horas, _r.departamento_destino_id,
        'pendente', _r.criado_por, _d, 'recorrente', 'tarefas', _r.id, _d
      )
      -- CORRECAO 16/08: o indice e PARCIAL. O ON CONFLICT precisa repetir o
      -- predicado, senao o Postgres nao casa o indice e aborta a geracao.
      ON CONFLICT (recorrencia_id, ocorrencia_data)
        WHERE recorrencia_id IS NOT NULL AND ocorrencia_data IS NOT NULL
        DO NOTHING;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _total := _total + _n;

      _d := _d + 1;   -- avanco obrigatorio: tarefas_rec_proxima e inclusiva
    END LOOP;

    UPDATE public.tarefas_recorrencias SET proxima_geracao = _d, atualizado_em = now()
     WHERE id = _r.id;
  END LOOP;
  RETURN _total;
END;
$function$;

REVOKE ALL ON FUNCTION cron_jobs.gerar_tarefas_recorrentes() FROM PUBLIC;
REVOKE ALL ON FUNCTION cron_jobs.gerar_tarefas_recorrentes() FROM anon;
REVOKE ALL ON FUNCTION cron_jobs.gerar_tarefas_recorrentes() FROM authenticated;

CREATE OR REPLACE FUNCTION cron_jobs.gerar_notificacoes_prazo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _t record; _n integer := 0; _id uuid;
BEGIN
  FOR _t IN
    SELECT t.id, t.titulo, t.responsavel_id, t.data_limite FROM public.tarefas t
    WHERE t.status NOT IN ('concluida', 'cancelada')
      AND t.responsavel_id IS NOT NULL AND t.data_limite IS NOT NULL
      AND t.data_limite <= current_date + 1
  LOOP
    IF _t.data_limite < current_date THEN
      _id := public.notificar(_t.responsavel_id, 'tarefa_atrasada', _t.titulo,
        'O prazo venceu em ' || to_char(_t.data_limite, 'DD/MM/YYYY') || '.',
        'tarefa', _t.id, public.notif_url_tarefa(_t.id), NULL, 'tarefas', current_date);
    ELSE
      _id := public.notificar(_t.responsavel_id, 'prazo_proximo', _t.titulo,
        'Vence em ' || to_char(_t.data_limite, 'DD/MM/YYYY') || '.',
        'tarefa', _t.id, public.notif_url_tarefa(_t.id), NULL, 'tarefas', current_date);
    END IF;
    IF _id IS NOT NULL THEN _n := _n + 1; END IF;
  END LOOP;
  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION cron_jobs.gerar_notificacoes_prazo() FROM PUBLIC;
REVOKE ALL ON FUNCTION cron_jobs.gerar_notificacoes_prazo() FROM anon;
REVOKE ALL ON FUNCTION cron_jobs.gerar_notificacoes_prazo() FROM authenticated;

-- wrappers public (chamados pelo app)
CREATE OR REPLACE FUNCTION public.gerar_tarefas_recorrentes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;
  IF NOT (public.tarefas_is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'tarefas','criar')) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerar tarefas.';
  END IF;
  RETURN cron_jobs.gerar_tarefas_recorrentes();
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_notificacoes_prazo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;
  RETURN cron_jobs.gerar_notificacoes_prazo();
END;
$function$;

-- ---------- TRIGGER ----------
DROP TRIGGER IF EXISTS trg_posicoes_gestores ON public.posicoes;
CREATE TRIGGER trg_posicoes_gestores
  AFTER INSERT OR DELETE OR UPDATE OF id_pai, vinculo_id ON public.posicoes
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_fn_posicoes_gestores();

-- ---------- REALTIME ----------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- ---------- CRON ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tarefas_gerar_recorrentes') THEN
    PERFORM cron.schedule('tarefas_gerar_recorrentes', '10 9 * * *', 'SELECT cron_jobs.gerar_tarefas_recorrentes();');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tarefas_notificacoes_prazo') THEN
    PERFORM cron.schedule('tarefas_notificacoes_prazo', '30 9 * * *', 'SELECT cron_jobs.gerar_notificacoes_prazo();');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';