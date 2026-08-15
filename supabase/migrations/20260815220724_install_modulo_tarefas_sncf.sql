-- ============================================================================
-- MÓDULO TAREFAS — INSTALAÇÃO COMPLETA
-- Gerado do banco vivo da SERGET em 15/08/2026 (não das migrations).
-- 26 tabelas · 37 funções · 72 policies · 18 triggers · 1 view · 1 bucket.
--
-- ---------------------------------------------------------------------------
-- ALTERAÇÕES EM RELAÇÃO AO BANCO DE ORIGEM (D1..D6)
-- ---------------------------------------------------------------------------
-- D1  tarefa_decidir_aprovacao: `public.public.tarefas_is_admin` ->
--     `public.tarefas_is_admin`. Era bug real em produção na origem; já
--     corrigido lá também (migration 20260815-210209).
--
-- D2  Dependências do hospedeiro que o install referencia mas não cria
--     (rh_pode_ver_sensivel, is_rh, is_controladoria) agora estão declaradas
--     na SEÇÃO 0 com pré-checagem que aborta com mensagem clara.
--
-- D3  `colaboradores_dados_rh` deixou de ser referenciada diretamente. A
--     hierarquia gestor->liderado passa por public.tarefas_eh_gestor_de(),
--     ÚNICO ponto a reescrever por instalação junto com tarefas_is_admin().
--
-- D4  As 6 chamadas remanescentes de has_role(...,'admin') em radar_eventos,
--     radar_destinatarios, historico_tarefas e storage.objects passaram a
--     usar tarefas_is_admin(). O módulo não exige mais um papel 'admin'.
--
-- D5  tarefas_carga_semanal() e a policy "Ver projetos de tarefas" liam
--     public.profiles direto, assumindo profiles.id = auth.uid(). Passaram a
--     ler v_pessoas_sistema. Sem isso a tela de Carga volta VAZIA, sem erro,
--     em hospedeiro onde o perfil tem chave própria.
--
-- D6  radar_push: `_papeis[_i]` -> `COALESCE(_papeis[_i], 'r')`. Com _papeis
--     NULL (como tarefas_regras_aplicar chama) violava NOT NULL e a ação de
--     automação "notificar responsavel" falhava sempre.
--
-- Também removidas 3 policies redundantes e amplas do bucket, que existiam na
-- origem por sobreposição histórica e davam acesso a qualquer autenticado.
-- ---------------------------------------------------------------------------
--
-- PRESSUPÕE o contrato aplicado (ver SEÇÃO 0). Rodar de cima para baixo,
-- uma vez, em banco onde o módulo ainda não existe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SEÇÃO 0 — PRÉ-CHECAGEM DO CONTRATO
-- Falha cedo e com mensagem legível em vez de estourar no meio do CREATE POLICY.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _faltando text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.departamentos')      IS NULL THEN _faltando := _faltando || 'tabela departamentos(id uuid, nome text)'; END IF;
  IF to_regclass('public.v_pessoas_sistema')  IS NULL THEN _faltando := _faltando || 'view v_pessoas_sistema(id=uid do auth, nome, status, departamento_id, ...)'; END IF;
  IF to_regprocedure('public.has_module_permission(uuid,character varying,character varying)') IS NULL
     AND to_regprocedure('public.has_module_permission(uuid,text,text)') IS NULL
     THEN _faltando := _faltando || 'has_module_permission(uuid, modulo, acao)'; END IF;
  IF to_regprocedure('public.rh_pode_ver_sensivel(uuid)') IS NULL THEN _faltando := _faltando || 'rh_pode_ver_sensivel(uuid)'; END IF;
  IF to_regprocedure('public.is_rh(uuid)')             IS NULL THEN _faltando := _faltando || 'is_rh(uuid)'; END IF;
  IF to_regprocedure('public.is_controladoria(uuid)')  IS NULL THEN _faltando := _faltando || 'is_controladoria(uuid)'; END IF;

  IF array_length(_faltando, 1) > 0 THEN
    RAISE EXCEPTION E'CONTRATO INCOMPLETO. Aplique o arquivo de contrato antes deste.\nFaltando:\n  - %',
      array_to_string(_faltando, E'\n  - ');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- SEÇÃO 1 — TABELAS (ordem de dependência) + PK/UNIQUE/CHECK, depois FKs e índices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tarefas_projetos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome character varying(200) NOT NULL,
  descricao text,
  departamento_id uuid,
  responsavel_id uuid,
  cor character varying(7) DEFAULT '#E8590C'::character varying NOT NULL,
  icone character varying(10),
  visibilidade character varying(20) DEFAULT 'departamento'::character varying NOT NULL,
  status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_por uuid,
  data_inicio date,
  data_fim_prevista date,
  saude character varying DEFAULT 'no_prazo'::character varying NOT NULL,
  saude_atualizada_em timestamp with time zone,
  saude_atualizada_por uuid,
  CONSTRAINT tarefas_projetos_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_projetos_saude_check CHECK (((saude)::text = ANY ((ARRAY['no_prazo'::character varying,'em_risco'::character varying,'atrasado'::character varying])::text[]))),
  CONSTRAINT tarefas_projetos_status_check CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying,'arquivado'::character varying,'encerrado'::character varying])::text[]))),
  CONSTRAINT tarefas_projetos_visibilidade_check CHECK (((visibilidade)::text = ANY ((ARRAY['publica'::character varying,'departamento'::character varying,'privada'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_secoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  projeto_id uuid NOT NULL,
  nome character varying(100) NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  cor character varying(7),
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_secoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_etiquetas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome character varying(50) NOT NULL,
  cor character varying(7) DEFAULT '#6B7280'::character varying NOT NULL,
  departamento_id uuid,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_etiquetas_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_etiquetas_nome_departamento_id_key UNIQUE (nome, departamento_id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_recorrencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titulo character varying NOT NULL,
  descricao text,
  prioridade character varying DEFAULT 'media'::character varying NOT NULL,
  projeto_id uuid,
  secao_id uuid,
  responsavel_id uuid,
  visibilidade character varying DEFAULT 'publica'::character varying NOT NULL,
  estimativa_horas numeric,
  departamento_destino_id uuid,
  frequencia character varying NOT NULL,
  intervalo integer DEFAULT 1 NOT NULL,
  dias_semana integer[],
  dia_mes integer,
  mes integer,
  inicio_em date DEFAULT CURRENT_DATE NOT NULL,
  fim_em date,
  proxima_geracao date,
  antecedencia_dias integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_recorrencias_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_recorrencias_antecedencia_dias_check CHECK ((antecedencia_dias >= 0)),
  CONSTRAINT tarefas_recorrencias_dia_mes_check CHECK (((dia_mes IS NULL) OR ((dia_mes >= 1) AND (dia_mes <= 31)))),
  CONSTRAINT tarefas_recorrencias_frequencia_check CHECK (((frequencia)::text = ANY ((ARRAY['diaria'::character varying,'semanal'::character varying,'mensal'::character varying,'anual'::character varying])::text[]))),
  CONSTRAINT tarefas_recorrencias_intervalo_check CHECK ((intervalo >= 1)),
  CONSTRAINT tarefas_recorrencias_mes_check CHECK (((mes IS NULL) OR ((mes >= 1) AND (mes <= 12)))),
  CONSTRAINT tarefas_recorrencias_prioridade_check CHECK (((prioridade)::text = ANY ((ARRAY['baixa'::character varying,'media'::character varying,'alta'::character varying,'urgente'::character varying])::text[]))),
  CONSTRAINT tarefas_recorrencias_visibilidade_check CHECK (((visibilidade)::text = ANY ((ARRAY['publica'::character varying,'privada'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome character varying NOT NULL,
  descricao text,
  tipo character varying DEFAULT 'projeto'::character varying NOT NULL,
  departamento_id uuid,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_templates_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_templates_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['projeto'::character varying,'checklist'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_template_itens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  parent_item_id uuid,
  secao_nome character varying,
  titulo character varying NOT NULL,
  descricao text,
  prioridade character varying DEFAULT 'media'::character varying NOT NULL,
  responsavel_id uuid,
  dias_offset integer DEFAULT 0 NOT NULL,
  estimativa_horas numeric,
  ordem integer DEFAULT 0 NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_template_itens_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_template_itens_prioridade_check CHECK (((prioridade)::text = ANY ((ARRAY['baixa'::character varying,'media'::character varying,'alta'::character varying,'urgente'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_campos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome character varying(120) NOT NULL,
  descricao text,
  tipo text NOT NULL,
  opcoes jsonb DEFAULT '[]'::jsonb NOT NULL,
  departamento_id uuid,
  ativo boolean DEFAULT true NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_campos_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_campos_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text,'numero'::text,'moeda'::text,'data'::text,'selecao'::text,'multi_selecao'::text,'pessoa'::text,'checkbox'::text])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_campos_projeto (
  projeto_id uuid NOT NULL,
  campo_id uuid NOT NULL,
  obrigatorio boolean DEFAULT false NOT NULL,
  mostrar_no_card boolean DEFAULT false NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_por uuid,
  CONSTRAINT tarefas_campos_projeto_pkey PRIMARY KEY (projeto_id, campo_id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_capacidade (
  user_id uuid NOT NULL,
  horas_semana numeric DEFAULT 40 NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_por uuid,
  CONSTRAINT tarefas_capacidade_pkey PRIMARY KEY (user_id),
  CONSTRAINT tarefas_capacidade_horas_semana_check CHECK (((horas_semana > (0)::numeric) AND (horas_semana <= (168)::numeric)))
);

CREATE TABLE IF NOT EXISTS public.tarefas_regras (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  projeto_id uuid,
  nome character varying NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  gatilho jsonb NOT NULL,
  acoes jsonb DEFAULT '[]'::jsonb NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  ultima_execucao_em timestamp with time zone,
  execucoes integer DEFAULT 0 NOT NULL,
  CONSTRAINT tarefas_regras_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_regras_gatilho_check CHECK (((gatilho ->> 'tipo'::text) = ANY (ARRAY['tarefa_criada'::text,'secao_alterada'::text,'status_alterado'::text,'responsavel_alterado'::text,'etiqueta_adicionada'::text,'concluida'::text])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_projeto_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  projeto_id uuid NOT NULL,
  saude character varying NOT NULL,
  resumo text,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_projeto_status_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_projeto_status_saude_check CHECK (((saude)::text = ANY ((ARRAY['no_prazo'::character varying,'em_risco'::character varying,'atrasado'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_visoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  nome character varying(80) NOT NULL,
  escopo character varying(20) NOT NULL,
  filtros jsonb DEFAULT '{}'::jsonb NOT NULL,
  padrao boolean DEFAULT false NOT NULL,
  compartilhada boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_visoes_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_visoes_escopo_check CHECK (((escopo)::text = ANY ((ARRAY['lista'::character varying,'board'::character varying,'calendario'::character varying,'carga'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  modulo character varying DEFAULT 'tarefas'::character varying NOT NULL,
  tipo character varying NOT NULL,
  titulo text NOT NULL,
  corpo text,
  entidade_tipo character varying,
  entidade_id uuid,
  url text,
  lida boolean DEFAULT false NOT NULL,
  lida_em timestamp with time zone,
  dia_ref date,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notificacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.notificacoes_preferencias (
  user_id uuid NOT NULL,
  tipo character varying NOT NULL,
  in_app boolean DEFAULT true NOT NULL,
  email boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT notificacoes_preferencias_pkey PRIMARY KEY (user_id, tipo)
);

CREATE TABLE IF NOT EXISTS public.radar_eventos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  modulo character varying(50) NOT NULL,
  tipo_evento character varying(100) NOT NULL,
  titulo text NOT NULL,
  descricao text,
  acao_label character varying(50),
  acao_url text,
  quantidade integer DEFAULT 1 NOT NULL,
  prioridade character varying(20) DEFAULT 'normal'::character varying NOT NULL,
  status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
  entidade_ids jsonb,
  expira_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_por uuid,
  CONSTRAINT radar_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT radar_eventos_prioridade_check CHECK (((prioridade)::text = ANY ((ARRAY['urgente'::character varying,'alta'::character varying,'normal'::character varying,'baixa'::character varying])::text[]))),
  CONSTRAINT radar_eventos_status_check CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying,'resolvido'::character varying,'ignorado'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.radar_destinatarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  evento_id uuid NOT NULL,
  user_id uuid NOT NULL,
  papel character varying(10) DEFAULT 'r'::character varying NOT NULL,
  visto boolean DEFAULT false NOT NULL,
  visto_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT radar_destinatarios_pkey PRIMARY KEY (id),
  CONSTRAINT radar_destinatarios_evento_id_user_id_key UNIQUE (evento_id, user_id),
  CONSTRAINT radar_destinatarios_papel_check CHECK (((papel)::text = ANY ((ARRAY['r'::character varying,'a'::character varying,'c'::character varying,'i'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  projeto_id uuid,
  secao_id uuid,
  parent_id uuid,
  titulo character varying(500) NOT NULL,
  descricao text,
  status character varying(30) DEFAULT 'pendente'::character varying NOT NULL,
  prioridade character varying(20) DEFAULT 'media'::character varying NOT NULL,
  responsavel_id uuid,
  criado_por uuid,
  departamento_destino_id uuid,
  data_inicio date,
  data_limite date,
  data_conclusao timestamp with time zone,
  visibilidade character varying(20) DEFAULT 'publica'::character varying NOT NULL,
  ordem integer DEFAULT 0 NOT NULL,
  estimativa_horas numeric(5,1),
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  tipo_origem character varying(20) DEFAULT 'manual'::character varying NOT NULL,
  modulo_origem character varying(50),
  entidade_origem_id uuid,
  acao_url text,
  recorrencia_id uuid,
  ocorrencia_data date,
  hora_limite time without time zone,
  tipo_tarefa text DEFAULT 'tarefa'::text NOT NULL,
  aprovacao_status character varying(20),
  aprovacao_por uuid,
  aprovacao_em timestamp with time zone,
  aprovacao_comentario text,
  CONSTRAINT tarefas_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_aprovacao_status_check CHECK (((aprovacao_status IS NULL) OR ((aprovacao_status)::text = ANY ((ARRAY['pendente'::character varying,'aprovada'::character varying,'rejeitada'::character varying,'ajuste_solicitado'::character varying])::text[])))),
  CONSTRAINT tarefas_prioridade_check CHECK (((prioridade)::text = ANY ((ARRAY['baixa'::character varying,'media'::character varying,'alta'::character varying,'urgente'::character varying])::text[]))),
  CONSTRAINT tarefas_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying,'em_andamento'::character varying,'em_revisao'::character varying,'concluida'::character varying,'cancelada'::character varying])::text[]))),
  CONSTRAINT tarefas_tipo_origem_check CHECK (((tipo_origem)::text = ANY ((ARRAY['manual'::character varying,'sistemica'::character varying,'recorrente'::character varying,'template'::character varying])::text[]))),
  CONSTRAINT tarefas_tipo_tarefa_check CHECK ((tipo_tarefa = ANY (ARRAY['tarefa'::text,'marco'::text,'aprovacao'::text]))),
  CONSTRAINT tarefas_visibilidade_check CHECK (((visibilidade)::text = ANY ((ARRAY['publica'::character varying,'privada'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_comentarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conteudo text NOT NULL,
  editado boolean DEFAULT false NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  mencionados uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  CONSTRAINT tarefas_comentarios_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_anexos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  nome_arquivo character varying(255) NOT NULL,
  storage_path character varying(500) NOT NULL,
  tamanho_bytes integer,
  mime_type character varying(100),
  enviado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_anexos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_tarefa_etiquetas (
  tarefa_id uuid NOT NULL,
  etiqueta_id uuid NOT NULL,
  CONSTRAINT tarefas_tarefa_etiquetas_pkey PRIMARY KEY (tarefa_id, etiqueta_id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_papeis (
  tarefa_id uuid NOT NULL,
  user_id uuid NOT NULL,
  papel character(1) NOT NULL,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  criado_por uuid,
  CONSTRAINT tarefas_papeis_pkey PRIMARY KEY (tarefa_id, user_id, papel),
  CONSTRAINT tarefas_papeis_papel_check CHECK ((papel = ANY (ARRAY['r'::bpchar,'a'::bpchar,'c'::bpchar,'i'::bpchar])))
);

CREATE TABLE IF NOT EXISTS public.tarefas_campos_valores (
  tarefa_id uuid NOT NULL,
  campo_id uuid NOT NULL,
  valor jsonb DEFAULT '{}'::jsonb NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_por uuid,
  CONSTRAINT tarefas_campos_valores_pkey PRIMARY KEY (tarefa_id, campo_id)
);

CREATE TABLE IF NOT EXISTS public.tarefas_dependencias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  depende_de_id uuid NOT NULL,
  criado_por uuid,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_dependencias_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_dependencias_unica UNIQUE (tarefa_id, depende_de_id),
  CONSTRAINT tarefas_dependencias_nao_propria CHECK ((tarefa_id <> depende_de_id))
);

CREATE TABLE IF NOT EXISTS public.tarefas_apontamentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  data date DEFAULT CURRENT_DATE NOT NULL,
  horas numeric(6,2) NOT NULL,
  descricao text,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_apontamentos_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_apontamentos_horas_check CHECK (((horas > (0)::numeric) AND (horas <= (24)::numeric)))
);

CREATE TABLE IF NOT EXISTS public.tarefas_timer (
  user_id uuid DEFAULT auth.uid() NOT NULL,
  tarefa_id uuid NOT NULL,
  iniciado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tarefas_timer_pkey PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS public.historico_tarefas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tarefa_id uuid NOT NULL,
  user_id uuid,
  acao character varying(50) NOT NULL,
  de jsonb,
  para jsonb,
  criado_em timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT historico_tarefas_pkey PRIMARY KEY (id)
);

-- FKs -----------------------------------------------------------------------
ALTER TABLE public.tarefas_projetos ADD CONSTRAINT tarefas_projetos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_projetos ADD CONSTRAINT tarefas_projetos_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id);
ALTER TABLE public.tarefas_projetos ADD CONSTRAINT tarefas_projetos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_projetos ADD CONSTRAINT tarefas_projetos_saude_atualizada_por_fkey FOREIGN KEY (saude_atualizada_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_secoes ADD CONSTRAINT tarefas_secoes_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_etiquetas ADD CONSTRAINT tarefas_etiquetas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_etiquetas ADD CONSTRAINT tarefas_etiquetas_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id);
ALTER TABLE public.tarefas_recorrencias ADD CONSTRAINT tarefas_recorrencias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_recorrencias ADD CONSTRAINT tarefas_recorrencias_departamento_destino_id_fkey FOREIGN KEY (departamento_destino_id) REFERENCES public.departamentos(id);
ALTER TABLE public.tarefas_recorrencias ADD CONSTRAINT tarefas_recorrencias_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_recorrencias ADD CONSTRAINT tarefas_recorrencias_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_recorrencias ADD CONSTRAINT tarefas_recorrencias_secao_id_fkey FOREIGN KEY (secao_id) REFERENCES public.tarefas_secoes(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_templates ADD CONSTRAINT tarefas_templates_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_templates ADD CONSTRAINT tarefas_templates_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id);
ALTER TABLE public.tarefas_template_itens ADD CONSTRAINT tarefas_template_itens_parent_item_id_fkey FOREIGN KEY (parent_item_id) REFERENCES public.tarefas_template_itens(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_template_itens ADD CONSTRAINT tarefas_template_itens_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_template_itens ADD CONSTRAINT tarefas_template_itens_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.tarefas_templates(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_campos ADD CONSTRAINT tarefas_campos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_campos ADD CONSTRAINT tarefas_campos_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES public.departamentos(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_campos_projeto ADD CONSTRAINT tarefas_campos_projeto_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.tarefas_campos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_campos_projeto ADD CONSTRAINT tarefas_campos_projeto_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_campos_projeto ADD CONSTRAINT tarefas_campos_projeto_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_capacidade ADD CONSTRAINT tarefas_capacidade_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_capacidade ADD CONSTRAINT tarefas_capacidade_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_regras ADD CONSTRAINT tarefas_regras_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_regras ADD CONSTRAINT tarefas_regras_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_projeto_status ADD CONSTRAINT tarefas_projeto_status_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_projeto_status ADD CONSTRAINT tarefas_projeto_status_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_visoes ADD CONSTRAINT tarefas_visoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes_preferencias ADD CONSTRAINT notificacoes_preferencias_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.radar_eventos ADD CONSTRAINT radar_eventos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.radar_destinatarios ADD CONSTRAINT radar_destinatarios_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.radar_eventos(id) ON DELETE CASCADE;
ALTER TABLE public.radar_destinatarios ADD CONSTRAINT radar_destinatarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_aprovacao_por_fkey FOREIGN KEY (aprovacao_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_departamento_destino_id_fkey FOREIGN KEY (departamento_destino_id) REFERENCES public.departamentos(id);
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES public.tarefas_projetos(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_recorrencia_id_fkey FOREIGN KEY (recorrencia_id) REFERENCES public.tarefas_recorrencias(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES auth.users(id);
ALTER TABLE public.tarefas ADD CONSTRAINT tarefas_secao_id_fkey FOREIGN KEY (secao_id) REFERENCES public.tarefas_secoes(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_comentarios ADD CONSTRAINT tarefas_comentarios_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_comentarios ADD CONSTRAINT tarefas_comentarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_anexos ADD CONSTRAINT tarefas_anexos_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id);
ALTER TABLE public.tarefas_anexos ADD CONSTRAINT tarefas_anexos_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_tarefa_etiquetas ADD CONSTRAINT tarefas_tarefa_etiquetas_etiqueta_id_fkey FOREIGN KEY (etiqueta_id) REFERENCES public.tarefas_etiquetas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_tarefa_etiquetas ADD CONSTRAINT tarefas_tarefa_etiquetas_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_papeis ADD CONSTRAINT tarefas_papeis_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_papeis ADD CONSTRAINT tarefas_papeis_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_papeis ADD CONSTRAINT tarefas_papeis_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_campos_valores ADD CONSTRAINT tarefas_campos_valores_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_campos_valores ADD CONSTRAINT tarefas_campos_valores_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.tarefas_campos(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_campos_valores ADD CONSTRAINT tarefas_campos_valores_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_dependencias ADD CONSTRAINT tarefas_dependencias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.tarefas_dependencias ADD CONSTRAINT tarefas_dependencias_depende_de_id_fkey FOREIGN KEY (depende_de_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_dependencias ADD CONSTRAINT tarefas_dependencias_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_apontamentos ADD CONSTRAINT tarefas_apontamentos_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_apontamentos ADD CONSTRAINT tarefas_apontamentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_timer ADD CONSTRAINT tarefas_timer_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.tarefas_timer ADD CONSTRAINT tarefas_timer_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.historico_tarefas ADD CONSTRAINT historico_tarefas_tarefa_id_fkey FOREIGN KEY (tarefa_id) REFERENCES public.tarefas(id) ON DELETE CASCADE;
ALTER TABLE public.historico_tarefas ADD CONSTRAINT historico_tarefas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Índices -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tarefas_template_itens_tpl_idx ON public.tarefas_template_itens USING btree (template_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarefas_campos_nome ON public.tarefas_campos USING btree (lower((nome)::text));
CREATE INDEX IF NOT EXISTS idx_tarefas_campos_projeto_projeto ON public.tarefas_campos_projeto USING btree (projeto_id, ordem);
CREATE INDEX IF NOT EXISTS idx_tarefas_regras_projeto ON public.tarefas_regras USING btree (projeto_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_tarefas_projeto_status_projeto ON public.tarefas_projeto_status USING btree (projeto_id, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarefas_visoes_padrao ON public.tarefas_visoes USING btree (user_id, escopo) WHERE padrao;
CREATE INDEX IF NOT EXISTS idx_tarefas_visoes_user ON public.tarefas_visoes USING btree (user_id, escopo);
CREATE INDEX IF NOT EXISTS idx_notificacoes_sino ON public.notificacoes USING btree (user_id, lida, criado_em DESC);
-- impede notificar duas vezes o mesmo atraso no mesmo dia. NÃO REMOVER.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacoes_dia ON public.notificacoes USING btree (user_id, tipo, entidade_id, dia_ref) WHERE (dia_ref IS NOT NULL);
CREATE INDEX IF NOT EXISTS radar_eventos_modulo_idx ON public.radar_eventos USING btree (modulo, status);
CREATE INDEX IF NOT EXISTS radar_eventos_status_idx ON public.radar_eventos USING btree (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS radar_dest_user_idx ON public.radar_destinatarios USING btree (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tarefas_aprovacao ON public.tarefas USING btree (aprovacao_status) WHERE (tipo_tarefa = 'aprovacao'::text);
CREATE INDEX IF NOT EXISTS tarefas_data_limite_idx ON public.tarefas USING btree (data_limite);
CREATE INDEX IF NOT EXISTS tarefas_modulo_origem_idx ON public.tarefas USING btree (modulo_origem) WHERE (modulo_origem IS NOT NULL);
CREATE INDEX IF NOT EXISTS tarefas_parent_idx ON public.tarefas USING btree (parent_id);
CREATE INDEX IF NOT EXISTS tarefas_projeto_idx ON public.tarefas USING btree (projeto_id);
-- idempotência da recorrência: rodar o gerador N vezes não duplica. NÃO REMOVER.
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_recorrencia_ocorrencia_uidx ON public.tarefas USING btree (recorrencia_id, ocorrencia_data) WHERE ((recorrencia_id IS NOT NULL) AND (ocorrencia_data IS NOT NULL));
CREATE INDEX IF NOT EXISTS tarefas_responsavel_idx ON public.tarefas USING btree (responsavel_id);
CREATE INDEX IF NOT EXISTS tarefas_status_idx ON public.tarefas USING btree (status);
CREATE INDEX IF NOT EXISTS tarefas_tipo_origem_idx ON public.tarefas USING btree (tipo_origem);
CREATE INDEX IF NOT EXISTS idx_tarefas_papeis_tarefa ON public.tarefas_papeis USING btree (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_papeis_user_papel ON public.tarefas_papeis USING btree (user_id, papel);
CREATE INDEX IF NOT EXISTS idx_tarefas_campos_valores_campo ON public.tarefas_campos_valores USING btree (campo_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_campos_valores_valor ON public.tarefas_campos_valores USING gin (valor);
CREATE INDEX IF NOT EXISTS idx_tarefas_dependencias_depende ON public.tarefas_dependencias USING btree (depende_de_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_dependencias_tarefa ON public.tarefas_dependencias USING btree (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_apontamentos_tarefa ON public.tarefas_apontamentos USING btree (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_apontamentos_user_data ON public.tarefas_apontamentos USING btree (user_id, data);
CREATE INDEX IF NOT EXISTS historico_tarefas_tarefa_idx ON public.historico_tarefas USING btree (tarefa_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- SEÇÃO 2 — FUNÇÕES DO MÓDULO
--
-- >>> PONTOS DE ADAPTAÇÃO POR INSTALAÇÃO — são só estes dois: <<<
--       public.tarefas_is_admin(uuid)
--       public.tarefas_eh_gestor_de(uuid, uuid)
--     Todo o resto do módulo é portável sem edição.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_atualizado_em()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN NEW.atualizado_em = now(); RETURN NEW; END; $function$;

-- ADAPTAR: mapeie para o papel de administrador do hospedeiro.
-- SERGET: 'admin'. Fetely: 'super_admin'.
CREATE OR REPLACE FUNCTION public.tarefas_is_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.has_role(_user_id, 'super_admin'::public.app_role) $function$;

-- ADAPTAR (D3): hierarquia gestor -> liderado do hospedeiro.
-- Substitui a referência direta a colaboradores_dados_rh, que não é contrato.
-- Se o hospedeiro não tiver hierarquia, retorne false: a Carga degrada para
-- "cada um vê só a si mesmo" e quem tem 'aprovar' continua vendo todos.
CREATE OR REPLACE FUNCTION public.tarefas_eh_gestor_de(_gestor uuid, _pessoa uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- SNCF: hierarquia mora em vinculos.gestor_pessoa_id, que aponta para
  -- pessoas.id e NAO para o uid do auth. Sao dois saltos, nao um.
  SELECT EXISTS (
    SELECT 1
    FROM public.vinculos vl
    JOIN public.vinculos vg ON vg.pessoa_id = vl.gestor_pessoa_id
    WHERE vl.usuario_id = _pessoa AND vg.usuario_id = _gestor
      AND vl.status = 'ativo' AND vg.status = 'ativo'
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_users_by_roles(_roles app_role[])
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT ARRAY_AGG(DISTINCT user_id) FROM public.user_roles WHERE role = ANY(_roles);
$function$;

-- Guarda anti-recursão. Setada só por tarefas_regras_aplicar e
-- trg_fn_notif_comentario, sempre com is_local=true. Ausente = guarda aberta.
CREATE OR REPLACE FUNCTION public.notif_suprimido()
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(current_setting('serget.regra_exec', true), '0') = '1'
      OR COALESCE(current_setting('serget.sem_notif', true), '0') = '1'
$function$;

CREATE OR REPLACE FUNCTION public.notif_url_tarefa(_tarefa_id uuid)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$ SELECT '/tarefas/minhas?tarefa=' || _tarefa_id::text $function$;

CREATE OR REPLACE FUNCTION public.notificar(_user_id uuid, _tipo character varying, _titulo text, _corpo text DEFAULT NULL::text, _entidade_tipo character varying DEFAULT 'tarefa'::character varying, _entidade_id uuid DEFAULT NULL::uuid, _url text DEFAULT NULL::text, _criado_por uuid DEFAULT NULL::uuid, _modulo character varying DEFAULT 'tarefas'::character varying, _dia_ref date DEFAULT NULL::date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _in_app boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  -- ninguém é notificado da própria ação
  IF _criado_por IS NOT NULL AND _user_id = _criado_por THEN RETURN NULL; END IF;

  SELECT p.in_app INTO _in_app FROM public.notificacoes_preferencias p
   WHERE p.user_id = _user_id AND p.tipo = _tipo;
  IF _in_app IS NOT NULL AND _in_app = false THEN RETURN NULL; END IF;

  INSERT INTO public.notificacoes (user_id, modulo, tipo, titulo, corpo, entidade_tipo, entidade_id, url, criado_por, dia_ref)
  VALUES (_user_id, _modulo, _tipo, _titulo, _corpo, _entidade_tipo, _entidade_id, _url, _criado_por, _dia_ref)
  ON CONFLICT DO NOTHING RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notificacoes_marcar_lidas(_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;
  UPDATE public.notificacoes SET lida = true, lida_em = now()
   WHERE user_id = auth.uid() AND lida = false AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tarefas_pode_gerenciar_projeto(_projeto_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.tarefas_is_admin(auth.uid())
      OR public.has_module_permission(auth.uid(), 'tarefas', 'aprovar')
      OR EXISTS (SELECT 1 FROM public.tarefas_projetos tp
                  WHERE tp.id = _projeto_id AND tp.responsavel_id = auth.uid())
$function$;

CREATE OR REPLACE FUNCTION public.tarefas_pode_ver_tarefa(_tarefa_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.id = _tarefa_id
      AND ( public.tarefas_is_admin(auth.uid())
         OR t.visibilidade = 'publica'
         OR t.responsavel_id = auth.uid()
         OR t.criado_por = auth.uid()
         OR (t.visibilidade = 'privada' AND public.rh_pode_ver_sensivel(auth.uid())) )
  )
$function$;

CREATE OR REPLACE FUNCTION public.tarefas_anexo_path_visivel(_name text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $function$
DECLARE _tarefa uuid;
BEGIN
  BEGIN _tarefa := ((storage.foldername(_name))[1])::uuid;
  EXCEPTION WHEN OTHERS THEN RETURN false; END;
  IF _tarefa IS NULL THEN RETURN false; END IF;
  RETURN public.tarefas_pode_ver_tarefa(_tarefa);
END;
$function$;

-- D3: usa tarefas_eh_gestor_de em vez de colaboradores_dados_rh direto.
CREATE OR REPLACE FUNCTION public.tarefas_carga_pessoas_visiveis()
 RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id FROM public.v_pessoas_sistema p
  WHERE p.status = 'ativo'
    AND ( public.tarefas_is_admin(auth.uid())
       OR public.has_module_permission(auth.uid(), 'tarefas', 'aprovar')
       OR p.id = auth.uid()
       OR public.tarefas_eh_gestor_de(auth.uid(), p.id) )
$function$;

-- D5: lê v_pessoas_sistema, não profiles. Em hospedeiro onde profiles.id não é
-- o uid do auth, o join com profiles devolvia zero linhas SEM ERRO.
CREATE OR REPLACE FUNCTION public.tarefas_carga_semanal(_inicio date, _semanas integer DEFAULT 6)
 RETURNS TABLE(user_id uuid, nome text, departamento_id uuid, horas_semana numeric, semana_inicio date, horas numeric, sem_estimativa integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH pessoas AS (
    SELECT p.id, p.nome, p.departamento_id, COALESCE(c.horas_semana, 40) AS horas_semana
    FROM public.v_pessoas_sistema p
    JOIN public.tarefas_carga_pessoas_visiveis() v ON v.user_id = p.id
    LEFT JOIN public.tarefas_capacidade c ON c.user_id = p.id
  ),
  semanas AS (
    SELECT (_inicio + (n * 7))::date AS ini, (_inicio + (n * 7) + 6)::date AS fim
    FROM generate_series(0, GREATEST(_semanas, 1) - 1) AS n
  )
  SELECT pe.id, pe.nome, pe.departamento_id, pe.horas_semana, s.ini,
         COALESCE(SUM(t.estimativa_horas), 0)::numeric,
         COALESCE(SUM(CASE WHEN t.estimativa_horas IS NULL THEN 1 ELSE 0 END), 0)::integer
  FROM pessoas pe
  CROSS JOIN semanas s
  LEFT JOIN public.tarefas t
    ON t.responsavel_id = pe.id
   AND t.status NOT IN ('concluida', 'cancelada')
   AND t.data_limite BETWEEN s.ini AND s.fim
  GROUP BY pe.id, pe.nome, pe.departamento_id, pe.horas_semana, s.ini
$function$;

CREATE OR REPLACE FUNCTION public.tarefas_carga_detalhe(_user_id uuid, _inicio date, _fim date)
 RETURNS TABLE(id uuid, titulo character varying, status character varying, prioridade character varying, data_limite date, hora_limite time without time zone, estimativa_horas numeric, projeto_id uuid, tipo_tarefa text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT t.id, t.titulo, t.status, t.prioridade, t.data_limite, t.hora_limite,
         t.estimativa_horas, t.projeto_id, t.tipo_tarefa
  FROM public.tarefas t
  WHERE t.responsavel_id = _user_id
    AND t.status NOT IN ('concluida', 'cancelada')
    AND t.data_limite BETWEEN _inicio AND _fim
    AND EXISTS (SELECT 1 FROM public.tarefas_carga_pessoas_visiveis() v WHERE v.user_id = _user_id)
  ORDER BY t.data_limite, t.hora_limite NULLS LAST, t.titulo
$function$;

-- CONTRATO COM gerar_tarefas_recorrentes: esta função é INCLUSIVA — devolve a
-- primeira ocorrência >= _de, portanto devolve o próprio _de quando ele já é
-- ocorrência válida. Quem avança é o laço do gerador, com `_d := _d + 1`.
-- Mexer numa sem mexer na outra = ou pula ocorrências, ou laço infinito.
CREATE OR REPLACE FUNCTION public.tarefas_rec_proxima(_frequencia text, _intervalo integer, _dias_semana integer[], _dia_mes integer, _mes integer, _inicio date, _de date)
 RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  _iv integer := GREATEST(COALESCE(_intervalo,1),1);
  _d date := GREATEST(_de, _inicio);
  _dias integer[]; _cand date; _ano integer; _mes_ref integer; _i integer; _ultimo integer;
BEGIN
  IF _frequencia = 'diaria' THEN
    RETURN _d + ((_iv - ((_d - _inicio) % _iv)) % _iv);

  ELSIF _frequencia = 'semanal' THEN
    _dias := COALESCE(NULLIF(_dias_semana, '{}'::integer[]), ARRAY[EXTRACT(dow FROM _inicio)::integer]);
    FOR _i IN 0..(7 * _iv + 7) LOOP
      _cand := _d + _i;
      IF EXTRACT(dow FROM _cand)::integer = ANY(_dias)
         AND ((date_trunc('week', _cand)::date - date_trunc('week', _inicio)::date) / 7) % _iv = 0 THEN
        RETURN _cand;
      END IF;
    END LOOP;
    RETURN NULL;

  ELSIF _frequencia = 'mensal' THEN
    _ano := EXTRACT(year FROM _d)::integer;
    _mes_ref := EXTRACT(month FROM _d)::integer;
    FOR _i IN 0..(12 * _iv + 12) LOOP
      _cand := make_date(_ano, _mes_ref, 1);
      IF ((EXTRACT(year FROM _cand)::integer - EXTRACT(year FROM _inicio)::integer) * 12
          + (EXTRACT(month FROM _cand)::integer - EXTRACT(month FROM _inicio)::integer)) % _iv = 0 THEN
        -- dia 31 em mês curto cai no último dia, não pula o mês
        _ultimo := EXTRACT(day FROM (_cand + interval '1 month - 1 day'))::integer;
        _cand := make_date(_ano, _mes_ref, LEAST(COALESCE(_dia_mes, EXTRACT(day FROM _inicio)::integer), _ultimo));
        IF _cand >= _d THEN RETURN _cand; END IF;
      END IF;
      _mes_ref := _mes_ref + 1;
      IF _mes_ref > 12 THEN _mes_ref := 1; _ano := _ano + 1; END IF;
    END LOOP;
    RETURN NULL;

  ELSIF _frequencia = 'anual' THEN
    _ano := EXTRACT(year FROM _d)::integer;
    _mes_ref := COALESCE(_mes, EXTRACT(month FROM _inicio)::integer);
    FOR _i IN 0..(_iv + 10) LOOP
      IF (_ano - EXTRACT(year FROM _inicio)::integer) % _iv = 0 THEN
        _ultimo := EXTRACT(day FROM (make_date(_ano, _mes_ref, 1) + interval '1 month - 1 day'))::integer;
        _cand := make_date(_ano, _mes_ref, LEAST(COALESCE(_dia_mes, EXTRACT(day FROM _inicio)::integer), _ultimo));
        IF _cand >= _d THEN RETURN _cand; END IF;
      END IF;
      _ano := _ano + 1;
    END LOOP;
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_tarefas_recorrentes()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _r record; _d date; _horizonte date; _total integer := 0; _n integer; _guard integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;
  IF NOT (public.tarefas_is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'tarefas','criar')) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerar tarefas.';
  END IF;

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
      ON CONFLICT (recorrencia_id, ocorrencia_data) DO NOTHING;
      GET DIAGNOSTICS _n = ROW_COUNT;
      _total := _total + _n;

      _d := _d + 1;   -- avanço obrigatório: tarefas_rec_proxima é inclusiva
    END LOOP;

    UPDATE public.tarefas_recorrencias SET proxima_geracao = _d, atualizado_em = now()
     WHERE id = _r.id;
  END LOOP;

  RETURN _total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aplicar_template(_template_id uuid, _nome_projeto text DEFAULT NULL::text, _data_inicio date DEFAULT CURRENT_DATE, _responsavel_padrao uuid DEFAULT NULL::uuid, _projeto_existente uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tpl record; _projeto_id uuid; _secoes jsonb := '{}'::jsonb; _mapa jsonb := '{}'::jsonb;
  _it record; _sec_id uuid; _nova uuid; _ordem integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;
  IF NOT (public.tarefas_is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'tarefas','criar')) THEN
    RAISE EXCEPTION 'Você não tem permissão para criar tarefas.';
  END IF;

  SELECT * INTO _tpl FROM public.tarefas_templates WHERE id = _template_id AND ativo;
  IF _tpl IS NULL THEN RAISE EXCEPTION 'Template não encontrado ou inativo.'; END IF;

  IF _tpl.tipo = 'checklist' THEN
    IF _projeto_existente IS NULL THEN RAISE EXCEPTION 'Informe o projeto de destino.'; END IF;
    _projeto_id := _projeto_existente;
  ELSE
    INSERT INTO public.tarefas_projetos (nome, descricao, departamento_id, responsavel_id, criado_por, status, visibilidade)
    VALUES (COALESCE(NULLIF(trim(COALESCE(_nome_projeto,'')),''), _tpl.nome), _tpl.descricao,
            _tpl.departamento_id, _responsavel_padrao, auth.uid(), 'ativo', 'publica')
    RETURNING id INTO _projeto_id;
  END IF;

  FOR _it IN
    SELECT secao_nome, MIN(ordem) AS o FROM public.tarefas_template_itens
     WHERE template_id = _template_id AND secao_nome IS NOT NULL AND secao_nome <> ''
     GROUP BY secao_nome ORDER BY MIN(ordem)
  LOOP
    _ordem := _ordem + 1;
    INSERT INTO public.tarefas_secoes (projeto_id, nome, ordem)
    VALUES (_projeto_id, _it.secao_nome, _ordem) RETURNING id INTO _sec_id;
    _secoes := _secoes || jsonb_build_object(_it.secao_nome, _sec_id::text);
  END LOOP;

  FOR _it IN SELECT * FROM public.tarefas_template_itens
              WHERE template_id = _template_id AND parent_item_id IS NULL ORDER BY ordem
  LOOP
    INSERT INTO public.tarefas (titulo, descricao, prioridade, projeto_id, secao_id, responsavel_id,
      estimativa_horas, status, criado_por, data_limite, tipo_origem, modulo_origem, ordem)
    VALUES (_it.titulo, _it.descricao, _it.prioridade, _projeto_id,
      NULLIF(_secoes->>COALESCE(_it.secao_nome,''),'')::uuid,
      COALESCE(_it.responsavel_id, _responsavel_padrao),
      _it.estimativa_horas, 'pendente', auth.uid(),
      _data_inicio + COALESCE(_it.dias_offset,0), 'template', 'tarefas', _it.ordem)
    RETURNING id INTO _nova;
    _mapa := _mapa || jsonb_build_object(_it.id::text, _nova::text);
  END LOOP;

  FOR _it IN SELECT * FROM public.tarefas_template_itens
              WHERE template_id = _template_id AND parent_item_id IS NOT NULL ORDER BY ordem
  LOOP
    INSERT INTO public.tarefas (titulo, descricao, prioridade, projeto_id, secao_id, parent_id, responsavel_id,
      estimativa_horas, status, criado_por, data_limite, tipo_origem, modulo_origem, ordem)
    VALUES (_it.titulo, _it.descricao, _it.prioridade, _projeto_id,
      NULLIF(_secoes->>COALESCE(_it.secao_nome,''),'')::uuid,
      NULLIF(_mapa->>_it.parent_item_id::text,'')::uuid,
      COALESCE(_it.responsavel_id, _responsavel_padrao),
      _it.estimativa_horas, 'pendente', auth.uid(),
      _data_inicio + COALESCE(_it.dias_offset,0), 'template', 'tarefas', _it.ordem);
  END LOOP;

  RETURN _projeto_id;
END;
$function$;

-- D6: COALESCE(_papeis[_i],'r') — com _papeis NULL violava NOT NULL e a ação
-- de automação "notificar_responsavel" falhava sempre.
CREATE OR REPLACE FUNCTION public.radar_push(_modulo character varying, _tipo_evento character varying, _titulo text, _destinatarios uuid[], _papeis character varying[], _acao_label character varying DEFAULT NULL::character varying, _acao_url text DEFAULT NULL::text, _descricao text DEFAULT NULL::text, _quantidade integer DEFAULT 1, _prioridade character varying DEFAULT 'normal'::character varying, _entidade_ids jsonb DEFAULT NULL::jsonb, _expira_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _evento_id UUID; _i INTEGER;
BEGIN
  INSERT INTO public.radar_eventos (modulo, tipo_evento, titulo, descricao,
    acao_label, acao_url, quantidade, prioridade, entidade_ids, expira_em)
  VALUES (_modulo, _tipo_evento, _titulo, _descricao,
    _acao_label, _acao_url, _quantidade, _prioridade, _entidade_ids, _expira_em)
  RETURNING id INTO _evento_id;

  FOR _i IN 1..COALESCE(array_length(_destinatarios, 1), 0) LOOP
    INSERT INTO public.radar_destinatarios (evento_id, user_id, papel)
    VALUES (_evento_id, _destinatarios[_i], COALESCE(_papeis[_i], 'r'))
    ON CONFLICT (evento_id, user_id) DO NOTHING;
  END LOOP;

  RETURN _evento_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.radar_resolver(_evento_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.radar_eventos SET status = 'resolvido', atualizado_em = now() WHERE id = _evento_id;
$function$;

CREATE OR REPLACE FUNCTION public.radar_resolver_tipo(_modulo character varying, _tipo_evento character varying)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.radar_eventos SET status = 'resolvido', atualizado_em = now()
   WHERE modulo = _modulo AND tipo_evento = _tipo_evento AND status = 'ativo';
$function$;

CREATE OR REPLACE FUNCTION public.radar_existe_ativo(_modulo character varying, _tipo_evento character varying, _entidade_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.radar_eventos
    WHERE modulo = _modulo AND tipo_evento = _tipo_evento AND status = 'ativo'
      AND entidade_ids @> jsonb_build_object('id', _entidade_id::text));
$function$;

CREATE OR REPLACE FUNCTION public.radar_resolver_entidade(_modulo character varying, _tipo_evento character varying, _entidade_id uuid)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.radar_eventos SET status = 'resolvido', atualizado_em = now()
   WHERE modulo = _modulo AND tipo_evento = _tipo_evento AND status = 'ativo'
     AND entidade_ids @> jsonb_build_object('id', _entidade_id::text);
$function$;

-- D1 APLICADO: era public.public.tarefas_is_admin(_uid)
CREATE OR REPLACE FUNCTION public.tarefa_decidir_aprovacao(_tarefa_id uuid, _decisao character varying, _comentario text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _t record; _uid uuid := auth.uid(); _eh_a boolean; _novo_status varchar;
  _com text := nullif(btrim(coalesce(_comentario,'')), ''); _r record; _rotulo text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Você precisa estar autenticado.'; END IF;

  SELECT * INTO _t FROM public.tarefas WHERE id = _tarefa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  IF _t.tipo_tarefa <> 'aprovacao' THEN RAISE EXCEPTION 'Esta tarefa não é uma aprovação.'; END IF;
  IF _decisao NOT IN ('aprovada','rejeitada','ajuste_solicitado') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.tarefas_papeis
    WHERE tarefa_id = _tarefa_id AND user_id = _uid AND papel = 'a') INTO _eh_a;

  IF NOT (_eh_a OR public.tarefas_is_admin(_uid)) THEN
    RAISE EXCEPTION 'Você não tem permissão para decidir esta aprovação.';
  END IF;

  IF _decisao IN ('rejeitada','ajuste_solicitado') AND _com IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da decisão.';
  END IF;

  _novo_status := CASE _decisao
    WHEN 'aprovada'  THEN 'concluida'
    WHEN 'rejeitada' THEN 'cancelada'
    ELSE 'em_andamento' END;

  UPDATE public.tarefas SET
    aprovacao_status = _decisao, aprovacao_por = _uid, aprovacao_em = now(),
    aprovacao_comentario = _com, status = _novo_status,
    data_conclusao = CASE WHEN _decisao = 'aprovada' THEN now() ELSE NULL END
  WHERE id = _tarefa_id;

  INSERT INTO public.historico_tarefas (tarefa_id, user_id, acao, de, para)
  VALUES (_tarefa_id, _uid, 'aprovacao',
    jsonb_build_object('aprovacao_status', _t.aprovacao_status, 'status', _t.status),
    jsonb_build_object('aprovacao_status', _decisao, 'status', _novo_status, 'comentario', _com));

  _rotulo := CASE _decisao
    WHEN 'aprovada'  THEN 'Aprovada'
    WHEN 'rejeitada' THEN 'Rejeitada'
    ELSE 'Ajuste solicitado' END;

  IF NOT public.notif_suprimido() THEN
    FOR _r IN
      SELECT DISTINCT u.user_id FROM (
        SELECT user_id FROM public.tarefas_papeis WHERE tarefa_id = _tarefa_id AND papel = 'r'
        UNION SELECT _t.responsavel_id WHERE _t.responsavel_id IS NOT NULL
      ) u WHERE u.user_id IS NOT NULL
    LOOP
      PERFORM public.notificar(_r.user_id, 'aprovacao_decidida', _t.titulo,
        _rotulo || COALESCE(': ' || _com, '.'), 'tarefa', _tarefa_id,
        public.notif_url_tarefa(_tarefa_id), _uid, 'tarefas', NULL);
    END LOOP;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_notificacoes_prazo()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _t record; _n integer := 0; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Usuário autenticado obrigatório.'; END IF;

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

CREATE OR REPLACE FUNCTION public.tarefas_regras_aplicar(_tarefa_id uuid, _tipo text, _contexto jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _projeto uuid; _resp uuid; _regra record; _acao jsonb; _casa boolean; _rotulos text[];
BEGIN
  IF COALESCE(current_setting('serget.regra_exec', true), '0') = '1' THEN
    RETURN; -- já estamos dentro de uma automação
  END IF;

  SELECT projeto_id, responsavel_id INTO _projeto, _resp FROM public.tarefas WHERE id = _tarefa_id;

  FOR _regra IN SELECT * FROM public.tarefas_regras r
    WHERE r.ativo AND (r.projeto_id IS NULL OR r.projeto_id = _projeto)
      AND r.gatilho->>'tipo' = _tipo ORDER BY r.criado_em
  LOOP
    _casa := CASE _tipo
      WHEN 'secao_alterada'      THEN _regra.gatilho->>'secao_id'    = _contexto->>'secao_id'
      WHEN 'status_alterado'     THEN _regra.gatilho->>'status'      = _contexto->>'status'
      WHEN 'etiqueta_adicionada' THEN _regra.gatilho->>'etiqueta_id' = _contexto->>'etiqueta_id'
      ELSE true END;
    IF NOT COALESCE(_casa, false) THEN CONTINUE; END IF;

    PERFORM set_config('serget.regra_exec', '1', true);
    _rotulos := ARRAY[]::text[];

    FOR _acao IN SELECT * FROM jsonb_array_elements(COALESCE(_regra.acoes, '[]'::jsonb))
    LOOP
      CASE _acao->>'tipo'
        WHEN 'definir_status' THEN
          UPDATE public.tarefas SET status = _acao->>'valor' WHERE id = _tarefa_id;
          _rotulos := _rotulos || ('status: ' || (_acao->>'valor'));
        WHEN 'definir_prioridade' THEN
          UPDATE public.tarefas SET prioridade = _acao->>'valor' WHERE id = _tarefa_id;
          _rotulos := _rotulos || ('prioridade: ' || (_acao->>'valor'));
        WHEN 'atribuir_responsavel' THEN
          UPDATE public.tarefas SET responsavel_id = (_acao->>'valor')::uuid WHERE id = _tarefa_id;
          _rotulos := _rotulos || 'responsável definido';
        WHEN 'mover_secao' THEN
          UPDATE public.tarefas SET secao_id = (_acao->>'valor')::uuid WHERE id = _tarefa_id;
          _rotulos := _rotulos || 'movida de seção';
        WHEN 'adicionar_etiqueta' THEN
          INSERT INTO public.tarefas_tarefa_etiquetas (tarefa_id, etiqueta_id)
          VALUES (_tarefa_id, (_acao->>'valor')::uuid) ON CONFLICT DO NOTHING;
          _rotulos := _rotulos || 'etiqueta adicionada';
        WHEN 'definir_prazo_relativo' THEN
          UPDATE public.tarefas SET data_limite = (CURRENT_DATE + COALESCE((_acao->>'valor')::int, 0))
           WHERE id = _tarefa_id;
          _rotulos := _rotulos || ('prazo: hoje + ' || COALESCE(_acao->>'valor','0') || 'd');
        WHEN 'adicionar_papel' THEN
          INSERT INTO public.tarefas_papeis (tarefa_id, user_id, papel, criado_por)
          VALUES (_tarefa_id, (_acao->>'valor')::uuid, COALESCE(_acao->>'papel','i'), NULL)
          ON CONFLICT (tarefa_id, user_id, papel) DO NOTHING;
          _rotulos := _rotulos || ('papel ' || upper(COALESCE(_acao->>'papel','i')) || ' atribuído');
        WHEN 'notificar_responsavel' THEN
          SELECT responsavel_id INTO _resp FROM public.tarefas WHERE id = _tarefa_id;
          IF _resp IS NOT NULL THEN
            PERFORM public.radar_push('tarefas', 'automacao',
              COALESCE(_acao->>'valor', 'Automação: ' || _regra.nome),
              ARRAY[_resp], NULL, 'Abrir tarefa',
              '/tarefas/minhas?tarefa=' || _tarefa_id::text,
              _regra.nome, 1, 'media',
              jsonb_build_object('tarefa_id', _tarefa_id), NULL);
            _rotulos := _rotulos || 'responsável notificado';
          END IF;
        ELSE NULL;
      END CASE;
    END LOOP;

    PERFORM set_config('serget.regra_exec', '0', true);

    INSERT INTO public.historico_tarefas (tarefa_id, user_id, acao, de, para)
    VALUES (_tarefa_id, NULL, 'automacao',
      jsonb_build_object('regra', _regra.nome, 'gatilho', _regra.gatilho->>'tipo'),
      jsonb_build_object('acoes', to_jsonb(_rotulos)));

    UPDATE public.tarefas_regras SET execucoes = execucoes + 1, ultima_execucao_em = now()
     WHERE id = _regra.id;
  END LOOP;
END;
$function$;

-- Triggers do módulo --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_tarefas_historico()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_tarefas (tarefa_id, user_id, acao, de, para)
    VALUES (NEW.id, auth.uid(),
      CASE NEW.status WHEN 'concluida' THEN 'concluida'
                      WHEN 'cancelada' THEN 'cancelada'
                      ELSE 'status_alterado' END,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    -- data_conclusao é do banco, não do front
    IF NEW.status = 'concluida' THEN NEW.data_conclusao = now();
    ELSE NEW.data_conclusao = NULL; END IF;
  END IF;

  IF OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id THEN
    INSERT INTO public.historico_tarefas (tarefa_id, user_id, acao, de, para)
    VALUES (NEW.id, auth.uid(), 'atribuida',
      jsonb_build_object('responsavel_id', OLD.responsavel_id),
      jsonb_build_object('responsavel_id', NEW.responsavel_id));
  END IF;

  IF OLD.data_limite IS DISTINCT FROM NEW.data_limite THEN
    INSERT INTO public.historico_tarefas (tarefa_id, user_id, acao, de, para)
    VALUES (NEW.id, auth.uid(), 'data_alterada',
      jsonb_build_object('data_limite', OLD.data_limite),
      jsonb_build_object('data_limite', NEW.data_limite));
  END IF;

  RETURN NEW;
END;
$function$;

-- Sincronia UNIDIRECIONAL: tarefas.responsavel_id é a verdade,
-- tarefas_papeis papel='r' é o espelho. Não existe o caminho inverso.
CREATE OR REPLACE FUNCTION public.trg_fn_tarefas_sync_papel_r()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT NULL THEN
    DELETE FROM public.tarefas_papeis
     WHERE tarefa_id = NEW.id AND papel = 'r' AND user_id = OLD.responsavel_id;
  END IF;
  IF NEW.responsavel_id IS NOT NULL THEN
    INSERT INTO public.tarefas_papeis (tarefa_id, user_id, papel, criado_por)
    VALUES (NEW.id, NEW.responsavel_id, 'r', COALESCE(auth.uid(), NEW.criado_por))
    ON CONFLICT (tarefa_id, user_id, papel) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_tarefas_dep_sem_ciclo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _titulo text;
BEGIN
  IF EXISTS (
    WITH RECURSIVE cadeia AS (
      SELECT NEW.depende_de_id AS id
      UNION
      SELECT d.depende_de_id FROM public.tarefas_dependencias d JOIN cadeia c ON d.tarefa_id = c.id
    ) SELECT 1 FROM cadeia WHERE id = NEW.tarefa_id
  ) THEN
    SELECT titulo INTO _titulo FROM public.tarefas WHERE id = NEW.depende_de_id;
    RAISE EXCEPTION 'Essa dependência criaria um ciclo: a tarefa "%" já depende desta, direta ou indiretamente.',
      COALESCE(_titulo, 'sem título');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_tarefas_regras()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('serget.regra_exec', true), '0') = '1' THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.tarefas_regras_aplicar(NEW.id, 'tarefa_criada', '{}'::jsonb);
    RETURN NULL;
  END IF;

  IF NEW.secao_id IS DISTINCT FROM OLD.secao_id AND NEW.secao_id IS NOT NULL THEN
    PERFORM public.tarefas_regras_aplicar(NEW.id, 'secao_alterada', jsonb_build_object('secao_id', NEW.secao_id));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.tarefas_regras_aplicar(NEW.id, 'status_alterado', jsonb_build_object('status', NEW.status));
    IF NEW.status = 'concluida' THEN
      PERFORM public.tarefas_regras_aplicar(NEW.id, 'concluida', '{}'::jsonb);
    END IF;
  END IF;
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    PERFORM public.tarefas_regras_aplicar(NEW.id, 'responsavel_alterado', '{}'::jsonb);
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_tarefas_etiqueta_regras()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('serget.regra_exec', true), '0') = '1' THEN RETURN NULL; END IF;
  PERFORM public.tarefas_regras_aplicar(NEW.tarefa_id, 'etiqueta_adicionada',
    jsonb_build_object('etiqueta_id', NEW.etiqueta_id));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notif_tarefa_atribuida()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.notif_suprimido() THEN RETURN NULL; END IF;
  IF NEW.responsavel_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN RETURN NULL; END IF;

  PERFORM public.notificar(NEW.responsavel_id, 'tarefa_atribuida', NEW.titulo,
    'Você é o responsável por esta tarefa.', 'tarefa', NEW.id,
    public.notif_url_tarefa(NEW.id), COALESCE(auth.uid(), NEW.criado_por));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notif_papel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _titulo text; _label text;
BEGIN
  IF public.notif_suprimido() THEN RETURN NULL; END IF;
  IF NEW.papel = 'r' THEN RETURN NULL; END IF; -- coberto por tarefa_atribuida

  SELECT titulo INTO _titulo FROM public.tarefas WHERE id = NEW.tarefa_id;
  _label := CASE NEW.papel WHEN 'a' THEN 'Aprovador' WHEN 'c' THEN 'Consultado' ELSE 'Informado' END;

  PERFORM public.notificar(NEW.user_id, 'papel_atribuido', COALESCE(_titulo, 'Tarefa'),
    'Você foi incluído como ' || _label || '.', 'tarefa', NEW.tarefa_id,
    public.notif_url_tarefa(NEW.tarefa_id), COALESCE(auth.uid(), NEW.criado_por));
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notif_comentario()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _titulo text; _uid uuid; _mencionados uuid[] := COALESCE(NEW.mencionados, '{}'::uuid[]);
BEGIN
  IF public.notif_suprimido() THEN RETURN NULL; END IF;
  SELECT titulo INTO _titulo FROM public.tarefas WHERE id = NEW.tarefa_id;

  FOREACH _uid IN ARRAY _mencionados LOOP
    IF _uid IS NULL OR _uid = NEW.user_id THEN CONTINUE; END IF;
    -- mencionar é informar: entra como 'i' sem gerar notificação de papel
    PERFORM set_config('serget.sem_notif', '1', true);
    INSERT INTO public.tarefas_papeis (tarefa_id, user_id, papel, criado_por)
    VALUES (NEW.tarefa_id, _uid, 'i', NEW.user_id)
    ON CONFLICT (tarefa_id, user_id, papel) DO NOTHING;
    PERFORM set_config('serget.sem_notif', '0', true);

    PERFORM public.notificar(_uid, 'mencao', COALESCE(_titulo, 'Tarefa'),
      'Você foi mencionado em um comentário.', 'tarefa', NEW.tarefa_id,
      public.notif_url_tarefa(NEW.tarefa_id), NEW.user_id);
  END LOOP;

  FOR _uid IN
    SELECT DISTINCT p.user_id FROM public.tarefas_papeis p
    WHERE p.tarefa_id = NEW.tarefa_id AND p.user_id <> NEW.user_id
      AND NOT (p.user_id = ANY(_mencionados))
  LOOP
    PERFORM public.notificar(_uid, 'comentario', COALESCE(_titulo, 'Tarefa'),
      'Novo comentário na tarefa.', 'tarefa', NEW.tarefa_id,
      public.notif_url_tarefa(NEW.tarefa_id), NEW.user_id);
  END LOOP;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notif_desbloqueio()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _t record;
BEGIN
  IF public.notif_suprimido() THEN RETURN NULL; END IF;
  IF NEW.status <> 'concluida' OR OLD.status = 'concluida' THEN RETURN NULL; END IF;

  FOR _t IN
    SELECT t.id, t.titulo, t.responsavel_id
    FROM public.tarefas_dependencias d JOIN public.tarefas t ON t.id = d.tarefa_id
    WHERE d.depende_de_id = NEW.id
      AND t.status NOT IN ('concluida', 'cancelada') AND t.responsavel_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tarefas_dependencias d2 JOIN public.tarefas b ON b.id = d2.depende_de_id
        WHERE d2.tarefa_id = t.id AND b.id <> NEW.id AND b.status NOT IN ('concluida', 'cancelada'))
  LOOP
    PERFORM public.notificar(_t.responsavel_id, 'desbloqueada', _t.titulo,
      'A dependência "' || NEW.titulo || '" foi concluída. A tarefa está liberada.',
      'tarefa', _t.id, public.notif_url_tarefa(_t.id), auth.uid());
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_fn_notif_status_projeto()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _nome text; _uid uuid;
BEGIN
  IF public.notif_suprimido() THEN RETURN NULL; END IF;
  SELECT nome INTO _nome FROM public.tarefas_projetos WHERE id = NEW.projeto_id;

  FOR _uid IN
    SELECT DISTINCT u FROM (
      SELECT t.responsavel_id AS u FROM public.tarefas t WHERE t.projeto_id = NEW.projeto_id
      UNION
      SELECT p.user_id FROM public.tarefas_papeis p
      JOIN public.tarefas t2 ON t2.id = p.tarefa_id WHERE t2.projeto_id = NEW.projeto_id
    ) s WHERE u IS NOT NULL
  LOOP
    PERFORM public.notificar(_uid, 'status_projeto', COALESCE(_nome, 'Projeto'),
      'Novo status report publicado.', 'projeto', NEW.projeto_id,
      '/tarefas/projeto/' || NEW.projeto_id::text, COALESCE(auth.uid(), NEW.criado_por));
  END LOOP;
  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- SEÇÃO 3 — VIEW v_radar_usuario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_radar_usuario AS
 SELECT re.id, re.modulo, re.tipo_evento, re.titulo, re.descricao,
        re.acao_label, re.acao_url, re.quantidade, re.prioridade, re.status,
        re.entidade_ids, re.criado_em, rd.user_id, rd.papel, rd.visto
   FROM public.radar_eventos re
   JOIN public.radar_destinatarios rd ON rd.evento_id = re.id
  WHERE re.status::text = 'ativo'::text
    AND rd.user_id = auth.uid()
    AND (re.expira_em IS NULL OR re.expira_em > now());

REVOKE ALL ON public.v_radar_usuario FROM anon;
GRANT SELECT ON public.v_radar_usuario TO authenticated;

-- ---------------------------------------------------------------------------
-- SEÇÃO 4 — RLS + POLICIES
-- D4 aplicado: has_role(...,'admin') -> tarefas_is_admin() em radar_eventos,
-- radar_destinatarios e historico_tarefas.
-- D5 aplicado: "Ver projetos de tarefas" lê v_pessoas_sistema, não profiles.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tarefas_projetos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_secoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_etiquetas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_recorrencias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_template_itens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_campos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_campos_projeto    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_capacidade        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_regras            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_projeto_status    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_visoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_preferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_eventos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_destinatarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_comentarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_anexos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_tarefa_etiquetas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_papeis            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_campos_valores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_dependencias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_apontamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas_timer             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_tarefas         ENABLE ROW LEVEL SECURITY;

-- tarefas_projetos
CREATE POLICY "Criar projetos de tarefas" ON public.tarefas_projetos FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'rh','criar') OR has_module_permission(auth.uid(),'tarefas','criar'));
CREATE POLICY "Deletar projetos de tarefas" ON public.tarefas_projetos FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid());
CREATE POLICY "Editar projetos de tarefas" ON public.tarefas_projetos FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR responsavel_id = auth.uid() OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'rh','editar'));
CREATE POLICY "Ver projetos de tarefas" ON public.tarefas_projetos FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR responsavel_id = auth.uid()
     OR (visibilidade)::text = 'publica'
     OR ((visibilidade)::text = 'departamento' AND EXISTS (
          SELECT 1 FROM public.v_pessoas_sistema p
           WHERE p.id = auth.uid() AND p.departamento_id = tarefas_projetos.departamento_id))
     OR ((visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())));

-- tarefas_secoes
CREATE POLICY "Gerenciar seções" ON public.tarefas_secoes FOR ALL TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'rh','editar')
     OR EXISTS (SELECT 1 FROM public.tarefas_projetos tp
                 WHERE tp.id = tarefas_secoes.projeto_id
                   AND (tp.responsavel_id = auth.uid() OR tp.criado_por = auth.uid())));
CREATE POLICY "Ver seções de projetos visíveis" ON public.tarefas_secoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tarefas_projetos tp WHERE tp.id = tarefas_secoes.projeto_id));

-- tarefas_etiquetas
CREATE POLICY "Ver etiquetas" ON public.tarefas_etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY "etiquetas_insert_tarefas" ON public.tarefas_etiquetas FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','criar'));
CREATE POLICY "etiquetas_update_tarefas" ON public.tarefas_etiquetas FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'))
  WITH CHECK (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "etiquetas_delete_tarefas" ON public.tarefas_etiquetas FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid());

-- tarefas_recorrencias
CREATE POLICY "rec_select" ON public.tarefas_recorrencias FOR SELECT TO authenticated
  USING (has_module_permission(auth.uid(),'tarefas','ver'));
CREATE POLICY "rec_insert" ON public.tarefas_recorrencias FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "rec_update" ON public.tarefas_recorrencias FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "rec_delete" ON public.tarefas_recorrencias FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid());

-- tarefas_templates
CREATE POLICY "tpl_select" ON public.tarefas_templates FOR SELECT TO authenticated
  USING (has_module_permission(auth.uid(),'tarefas','ver'));
CREATE POLICY "tpl_insert" ON public.tarefas_templates FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "tpl_update" ON public.tarefas_templates FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "tpl_delete" ON public.tarefas_templates FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid());

-- tarefas_template_itens
CREATE POLICY "tpli_select" ON public.tarefas_template_itens FOR SELECT TO authenticated
  USING (has_module_permission(auth.uid(),'tarefas','ver'));
CREATE POLICY "tpli_insert" ON public.tarefas_template_itens FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar')
     OR EXISTS (SELECT 1 FROM public.tarefas_templates t WHERE t.id = tarefas_template_itens.template_id AND t.criado_por = auth.uid()));
CREATE POLICY "tpli_update" ON public.tarefas_template_itens FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar')
     OR EXISTS (SELECT 1 FROM public.tarefas_templates t WHERE t.id = tarefas_template_itens.template_id AND t.criado_por = auth.uid()));
CREATE POLICY "tpli_delete" ON public.tarefas_template_itens FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid())
     OR EXISTS (SELECT 1 FROM public.tarefas_templates t WHERE t.id = tarefas_template_itens.template_id AND t.criado_por = auth.uid()));

-- tarefas_campos
CREATE POLICY "Ver catalogo de campos" ON public.tarefas_campos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gerenciar catalogo de campos" ON public.tarefas_campos FOR ALL TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar') OR criado_por = auth.uid())
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar') OR criado_por = auth.uid());

-- tarefas_campos_projeto
CREATE POLICY "Ver campos do projeto" ON public.tarefas_campos_projeto FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gerenciar campos do projeto" ON public.tarefas_campos_projeto FOR ALL TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar') OR criado_por = auth.uid()
     OR EXISTS (SELECT 1 FROM public.tarefas_projetos p WHERE p.id = tarefas_campos_projeto.projeto_id AND (p.criado_por = auth.uid() OR p.responsavel_id = auth.uid())))
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar') OR criado_por = auth.uid()
     OR EXISTS (SELECT 1 FROM public.tarefas_projetos p WHERE p.id = tarefas_campos_projeto.projeto_id AND (p.criado_por = auth.uid() OR p.responsavel_id = auth.uid())));

-- tarefas_capacidade
CREATE POLICY "Ver capacidade" ON public.tarefas_capacidade FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR user_id = auth.uid() OR has_module_permission(auth.uid(),'tarefas','ver'));
CREATE POLICY "Gerenciar capacidade" ON public.tarefas_capacidade FOR ALL TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar'))
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','editar'));

-- tarefas_regras
CREATE POLICY "Ver regras de projetos visiveis" ON public.tarefas_regras FOR SELECT TO authenticated
  USING (projeto_id IS NULL OR EXISTS (SELECT 1 FROM public.tarefas_projetos tp WHERE tp.id = tarefas_regras.projeto_id));
CREATE POLICY "Criar regras" ON public.tarefas_regras FOR INSERT TO authenticated
  WITH CHECK (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','aprovar') OR (projeto_id IS NOT NULL AND tarefas_pode_gerenciar_projeto(projeto_id)));
CREATE POLICY "Editar regras" ON public.tarefas_regras FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','aprovar') OR (projeto_id IS NOT NULL AND tarefas_pode_gerenciar_projeto(projeto_id)));
CREATE POLICY "Apagar regras" ON public.tarefas_regras FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'tarefas','aprovar') OR (projeto_id IS NOT NULL AND tarefas_pode_gerenciar_projeto(projeto_id)));

-- tarefas_projeto_status
CREATE POLICY "Ver status de projetos visiveis" ON public.tarefas_projeto_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tarefas_projetos tp WHERE tp.id = tarefas_projeto_status.projeto_id));
CREATE POLICY "Registrar status do projeto" ON public.tarefas_projeto_status FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid() AND tarefas_pode_gerenciar_projeto(projeto_id));

-- tarefas_visoes
CREATE POLICY "visoes_select" ON public.tarefas_visoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR compartilhada = true);
CREATE POLICY "visoes_insert" ON public.tarefas_visoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "visoes_update" ON public.tarefas_visoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "visoes_delete" ON public.tarefas_visoes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));

-- notificacoes (INSERT só via funções SECURITY DEFINER — sem policy de INSERT)
CREATE POLICY "Ver próprias notificações" ON public.notificacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "Marcar próprias notificações" ON public.notificacoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));

-- notificacoes_preferencias
CREATE POLICY "Gerenciar próprias preferências" ON public.notificacoes_preferencias FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- radar_eventos (D4)
CREATE POLICY "Ver eventos do radar" ON public.radar_eventos FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid())
     OR EXISTS (SELECT 1 FROM public.radar_destinatarios rd WHERE rd.evento_id = radar_eventos.id AND rd.user_id = auth.uid()));
CREATE POLICY "Módulos inserem eventos no radar" ON public.radar_eventos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Módulos atualizam eventos" ON public.radar_eventos FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR is_rh(auth.uid()) OR is_controladoria(auth.uid()));

-- radar_destinatarios (D4)
CREATE POLICY "Usuário vê seu radar" ON public.radar_destinatarios FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "Sistema insere no radar" ON public.radar_destinatarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Usuário atualiza seu radar" ON public.radar_destinatarios FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- tarefas
CREATE POLICY "Ver tarefas" ON public.tarefas FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR responsavel_id = auth.uid()
     OR (visibilidade)::text = 'publica'
     OR ((visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())));
CREATE POLICY "Criar tarefas" ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (tarefas_is_admin(auth.uid()) OR has_module_permission(auth.uid(),'rh','criar') OR has_module_permission(auth.uid(),'tarefas','criar')));
CREATE POLICY "Atualizar tarefas" ON public.tarefas FOR UPDATE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid() OR responsavel_id = auth.uid()
     OR has_module_permission(auth.uid(),'rh','editar') OR has_module_permission(auth.uid(),'tarefas','editar'));
CREATE POLICY "Deletar tarefas" ON public.tarefas FOR DELETE TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR criado_por = auth.uid());

-- tarefas_comentarios
CREATE POLICY "Ver comentários de tarefas visíveis" ON public.tarefas_comentarios FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_comentarios.tarefa_id
        AND ((t.visibilidade)::text = 'publica' OR t.responsavel_id = auth.uid() OR t.criado_por = auth.uid()
          OR ((t.visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())))));
CREATE POLICY "Criar comentários" ON public.tarefas_comentarios FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Editar próprio comentário" ON public.tarefas_comentarios FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "Deletar comentário" ON public.tarefas_comentarios FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));

-- tarefas_anexos
CREATE POLICY "Ver anexos de tarefas visíveis" ON public.tarefas_anexos FOR SELECT TO authenticated
  USING (tarefas_pode_ver_tarefa(tarefa_id));
CREATE POLICY "Enviar e deletar próprios anexos" ON public.tarefas_anexos FOR ALL TO authenticated
  USING (enviado_por = auth.uid() OR tarefas_is_admin(auth.uid()));

-- tarefas_tarefa_etiquetas
CREATE POLICY "Ver vínculos de etiquetas" ON public.tarefas_tarefa_etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gerenciar vínculos de etiquetas" ON public.tarefas_tarefa_etiquetas FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL);

-- tarefas_papeis
CREATE POLICY "Ver papeis da tarefa" ON public.tarefas_papeis FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_papeis.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR (t.visibilidade)::text = 'publica'
       OR ((t.visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())))));
CREATE POLICY "Gerenciar papeis da tarefa" ON public.tarefas_papeis FOR ALL TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_papeis.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'rh','editar') OR has_module_permission(auth.uid(),'tarefas','editar'))))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_papeis.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'rh','editar') OR has_module_permission(auth.uid(),'tarefas','editar'))));

-- tarefas_campos_valores
CREATE POLICY "Ver valores de campos" ON public.tarefas_campos_valores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_campos_valores.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR (t.visibilidade)::text = 'publica' OR has_module_permission(auth.uid(),'tarefas','ver')
       OR ((t.visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())))));
CREATE POLICY "Gerenciar valores de campos" ON public.tarefas_campos_valores FOR ALL TO authenticated
  USING (atualizado_por = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_campos_valores.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar'))))
  WITH CHECK (atualizado_por = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_campos_valores.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar'))));

-- tarefas_dependencias
CREATE POLICY "Ver dependencias" ON public.tarefas_dependencias FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_dependencias.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR (t.visibilidade)::text = 'publica' OR has_module_permission(auth.uid(),'tarefas','ver')
       OR ((t.visibilidade)::text = 'privada' AND rh_pode_ver_sensivel(auth.uid())))));
CREATE POLICY "Gerenciar dependencias" ON public.tarefas_dependencias FOR ALL TO authenticated
  USING (criado_por = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_dependencias.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar'))))
  WITH CHECK (criado_por = auth.uid() OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = tarefas_dependencias.tarefa_id
     AND (tarefas_is_admin(auth.uid()) OR t.criado_por = auth.uid() OR t.responsavel_id = auth.uid()
       OR has_module_permission(auth.uid(),'tarefas','editar') OR has_module_permission(auth.uid(),'rh','editar'))));

-- tarefas_apontamentos (D3: tarefas_eh_gestor_de no lugar de colaboradores_dados_rh)
-- 'aprovar', não 'editar': hora lançada por pessoa é dado de desempenho.
CREATE POLICY "Ver apontamentos" ON public.tarefas_apontamentos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid())
     OR has_module_permission(auth.uid(),'tarefas','aprovar')
     OR tarefas_eh_gestor_de(auth.uid(), tarefas_apontamentos.user_id));
CREATE POLICY "Lancar apontamentos proprios" ON public.tarefas_apontamentos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "Editar apontamentos proprios" ON public.tarefas_apontamentos FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));
CREATE POLICY "Apagar apontamentos proprios" ON public.tarefas_apontamentos FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));

-- tarefas_timer
CREATE POLICY "Timer proprio" ON public.tarefas_timer FOR ALL TO authenticated
  USING (user_id = auth.uid() OR tarefas_is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR tarefas_is_admin(auth.uid()));

-- historico_tarefas (D4)
CREATE POLICY "Ver histórico de tarefas" ON public.historico_tarefas FOR SELECT TO authenticated
  USING (tarefas_is_admin(auth.uid()) OR is_rh(auth.uid())
     OR EXISTS (SELECT 1 FROM public.tarefas t WHERE t.id = historico_tarefas.tarefa_id
        AND (t.responsavel_id = auth.uid() OR t.criado_por = auth.uid())));
CREATE POLICY "Inserir histórico automaticamente" ON public.historico_tarefas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- SEÇÃO 5 — TRIGGERS
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tarefas_upd ON public.tarefas;
CREATE TRIGGER trg_tarefas_upd BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_tarefas_historico ON public.tarefas;
CREATE TRIGGER trg_tarefas_historico BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tarefas_historico();
DROP TRIGGER IF EXISTS trg_tarefas_sync_papel_r ON public.tarefas;
CREATE TRIGGER trg_tarefas_sync_papel_r AFTER INSERT OR UPDATE OF responsavel_id ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tarefas_sync_papel_r();
DROP TRIGGER IF EXISTS trg_tarefas_regras ON public.tarefas;
CREATE TRIGGER trg_tarefas_regras AFTER INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tarefas_regras();
DROP TRIGGER IF EXISTS trg_notif_tarefa_atribuida ON public.tarefas;
CREATE TRIGGER trg_notif_tarefa_atribuida AFTER INSERT OR UPDATE OF responsavel_id ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notif_tarefa_atribuida();
DROP TRIGGER IF EXISTS trg_notif_desbloqueio ON public.tarefas;
CREATE TRIGGER trg_notif_desbloqueio AFTER UPDATE OF status ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notif_desbloqueio();
DROP TRIGGER IF EXISTS trg_tarefas_projetos_upd ON public.tarefas_projetos;
CREATE TRIGGER trg_tarefas_projetos_upd BEFORE UPDATE ON public.tarefas_projetos FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_tarefas_comentarios_upd ON public.tarefas_comentarios;
CREATE TRIGGER trg_tarefas_comentarios_upd BEFORE UPDATE ON public.tarefas_comentarios FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_notif_comentario ON public.tarefas_comentarios;
CREATE TRIGGER trg_notif_comentario AFTER INSERT ON public.tarefas_comentarios FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notif_comentario();
DROP TRIGGER IF EXISTS trg_notif_papel ON public.tarefas_papeis;
CREATE TRIGGER trg_notif_papel AFTER INSERT ON public.tarefas_papeis FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notif_papel();
DROP TRIGGER IF EXISTS trg_tarefas_dep_sem_ciclo ON public.tarefas_dependencias;
CREATE TRIGGER trg_tarefas_dep_sem_ciclo BEFORE INSERT OR UPDATE ON public.tarefas_dependencias FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tarefas_dep_sem_ciclo();
DROP TRIGGER IF EXISTS trg_tarefas_etiqueta_regras ON public.tarefas_tarefa_etiquetas;
CREATE TRIGGER trg_tarefas_etiqueta_regras AFTER INSERT ON public.tarefas_tarefa_etiquetas FOR EACH ROW EXECUTE FUNCTION public.trg_fn_tarefas_etiqueta_regras();
DROP TRIGGER IF EXISTS trg_tarefas_apontamentos_touch ON public.tarefas_apontamentos;
CREATE TRIGGER trg_tarefas_apontamentos_touch BEFORE UPDATE ON public.tarefas_apontamentos FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_tarefas_capacidade_touch ON public.tarefas_capacidade;
CREATE TRIGGER trg_tarefas_capacidade_touch BEFORE UPDATE ON public.tarefas_capacidade FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_tarefas_recorrencias_upd ON public.tarefas_recorrencias;
CREATE TRIGGER trg_tarefas_recorrencias_upd BEFORE UPDATE ON public.tarefas_recorrencias FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_notif_status_projeto ON public.tarefas_projeto_status;
CREATE TRIGGER trg_notif_status_projeto AFTER INSERT ON public.tarefas_projeto_status FOR EACH ROW EXECUTE FUNCTION public.trg_fn_notif_status_projeto();
DROP TRIGGER IF EXISTS trg_notif_pref_upd ON public.notificacoes_preferencias;
CREATE TRIGGER trg_notif_pref_upd BEFORE UPDATE ON public.notificacoes_preferencias FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();
DROP TRIGGER IF EXISTS trg_radar_eventos_upd ON public.radar_eventos;
CREATE TRIGGER trg_radar_eventos_upd BEFORE UPDATE ON public.radar_eventos FOR EACH ROW EXECUTE FUNCTION public.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- SEÇÃO 6 — STORAGE: bucket privado + policies
-- As 3 policies amplas da origem ("Autenticados leem/enviam", "Remetente e
-- admin deletam") foram REMOVIDAS: davam acesso a qualquer autenticado,
-- ignorando a visibilidade da tarefa. Ficam só as 3 baseadas em
-- tarefas_anexo_path_visivel(). D4 aplicado no DELETE.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tarefas-anexos', 'tarefas-anexos', false, 26214400)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Ver anexos de tarefa" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tarefas-anexos' AND public.tarefas_anexo_path_visivel(name));
CREATE POLICY "Enviar anexos de tarefa" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tarefas-anexos' AND public.tarefas_anexo_path_visivel(name));
CREATE POLICY "Excluir anexos de tarefa" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tarefas-anexos' AND (owner = auth.uid() OR public.tarefas_is_admin(auth.uid())));

-- ---------------------------------------------------------------------------
-- SEÇÃO 7 — GRANTS
-- Nenhuma tabela do módulo é exposta ao papel anon.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _t text;
BEGIN
  FOR _t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (c.relname LIKE 'tarefas%' OR c.relname LIKE 'notificacoes%'
           OR c.relname LIKE 'radar_%' OR c.relname = 'historico_tarefas')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', _t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', _t);
  END LOOP;
END $$;


NOTIFY pgrst, 'reload schema';
