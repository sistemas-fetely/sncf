-- 🔵 SNCF — BASELINE RETROATIVO / FOTO COMPLETA DO SCHEMA
-- Captura idempotente dos objetos que existiam no banco e NÃO estavam versionados no repo.
-- Smoke esperado: roda em produção como NO-OP (tudo já existe; statements idempotentes não alteram dados).
-- Doutrina PK-UNIQUE-NÃO-DROP aplicada: PK/UNIQUE via IF NOT EXISTS; FK/CHECK via DROP IF EXISTS + ADD.
-- Ordem: TABELAS -> FUNCOES -> VIEWS -> CONSTRAINTS -> INDEXES -> TRIGGERS.
-- Conteúdo: 52 tabelas, 199 funções, 13 views, 366 constraints, 216 indexes, 72 triggers.

BEGIN;

-- ========================= TABELAS (52) =========================
CREATE TABLE IF NOT EXISTS public.bling_envios_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  tentativa_em timestamp with time zone NOT NULL DEFAULT now(),
  enviado_por uuid,
  payload_enviado jsonb NOT NULL,
  resposta_status integer,
  resposta_body jsonb,
  bling_id_retornado bigint,
  sucesso boolean NOT NULL DEFAULT false,
  erro_msg text,
  duracao_ms integer
);
CREATE TABLE IF NOT EXISTS public.boleto_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ged_documento_id uuid NOT NULL,
  parceiro_id uuid,
  pasta_contrato_id uuid,
  contas_pagar_receber_id uuid,
  codigo_barras text,
  linha_digitavel text,
  valor numeric(15,2),
  vencimento date,
  pagador_cnpj text,
  pagador_nome text,
  beneficiario_cnpj text,
  beneficiario_nome text,
  status text NOT NULL DEFAULT 'aguardando_ancoragem'::text,
  metadados_parse jsonb,
  cpr_match_candidatos jsonb,
  ancorado_em timestamp with time zone,
  ancorado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por uuid
);
CREATE TABLE IF NOT EXISTS public.cartoes_credito (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  bandeira text,
  ultimos_digitos text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  limite numeric NOT NULL DEFAULT 0,
  conta_bancaria_id uuid,
  dia_fechamento integer,
  dia_vencimento integer
);
CREATE TABLE IF NOT EXISTS public.comentarios_pedido (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  autor_id uuid NOT NULL,
  conteudo text NOT NULL,
  editado_em timestamp with time zone,
  excluido_em timestamp with time zone,
  excluido_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.compras_registradas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  comprador_id uuid NOT NULL,
  plano_contas_id uuid,
  parceiro_id uuid NOT NULL,
  valor_total numeric(14,2) NOT NULL,
  data_compra date NOT NULL,
  parcelas_count integer NOT NULL DEFAULT 1,
  primeira_parcela_data date NOT NULL,
  intervalo_dias integer NOT NULL DEFAULT 30,
  meio_pagamento_id uuid,
  observacao text,
  parcela_grupo_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status compra_registrada_status_enum NOT NULL DEFAULT 'rascunho'::compra_registrada_status_enum,
  excluida_em timestamp with time zone,
  excluida_por uuid,
  excluida_motivo text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  parceiro_id_pedido_original uuid,
  periodicidade text NOT NULL DEFAULT 'dias'::text
);
CREATE TABLE IF NOT EXISTS public.compras_registradas_anexos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  compra_registrada_id uuid NOT NULL,
  tipo compra_anexo_tipo_enum NOT NULL,
  nome_original text NOT NULL,
  mime_type text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.compras_registradas_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  compra_registrada_id uuid NOT NULL,
  acao text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.compras_registradas_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  compra_registrada_id uuid NOT NULL,
  pedido_item_id uuid,
  quantidade_real numeric(14,4) NOT NULL,
  valor_unitario_real numeric(14,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo_linha text NOT NULL DEFAULT 'produto'::text,
  status_linha text NOT NULL DEFAULT 'comprada'::text,
  descricao_livre text,
  substitui_pedido_item_id uuid,
  valor_total_real numeric DEFAULT (quantidade_real * valor_unitario_real)
);
CREATE TABLE IF NOT EXISTS public.compromissos_parcelados (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  descricao_normalizada text,
  parceiro_id uuid,
  origem text NOT NULL,
  conta_bancaria_id uuid,
  valor_total numeric(15,2) NOT NULL,
  qtd_parcelas integer NOT NULL,
  valor_parcela numeric(15,2) NOT NULL,
  data_compra date NOT NULL,
  data_primeira_parcela date NOT NULL,
  status text NOT NULL DEFAULT 'ativo'::text,
  parcelas_pagas integer NOT NULL DEFAULT 0,
  parcelas_previstas integer NOT NULL DEFAULT 0,
  plano_contas_id uuid,
  fatura_origem_id uuid,
  nf_origem_id uuid,
  criado_por uuid,
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  centro_custo_id uuid
);
CREATE TABLE IF NOT EXISTS public.compromissos_recorrentes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  descricao_normalizada text,
  valor numeric(14,2) NOT NULL,
  periodicidade text NOT NULL,
  dia_vencimento integer NOT NULL,
  data_inicio date NOT NULL,
  data_fim date,
  parceiro_id uuid,
  plano_contas_id uuid,
  conta_bancaria_id uuid,
  centro_custo text,
  status text NOT NULL DEFAULT 'ativo'::text,
  observacao text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.contas_pagar_receber_audit_delete (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL,
  apagado_em timestamp with time zone NOT NULL DEFAULT now(),
  apagado_por uuid,
  motivo text,
  snapshot jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.evento_titulo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo_id uuid NOT NULL,
  tipo_evento text NOT NULL,
  ts timestamp with time zone NOT NULL DEFAULT now(),
  ator text NOT NULL DEFAULT 'sistema'::text,
  payload jsonb,
  origem text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.fatura_cartao_lancamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL,
  data_compra date NOT NULL,
  descricao text NOT NULL,
  descricao_normalizada text,
  valor numeric(15,2) NOT NULL,
  parcela_atual integer,
  parcela_total integer,
  tipo text NOT NULL DEFAULT 'compra'::text,
  natureza text NOT NULL DEFAULT 'NACIONAL'::text,
  moeda text,
  valor_original numeric(15,2),
  cotacao numeric(10,4),
  estabelecimento_descricao text,
  estabelecimento_local text,
  ramo_estabelecimento text,
  num_autorizacao text,
  cnpj_estabelecimento text,
  parceiro_id uuid,
  plano_contas_id uuid,
  status text NOT NULL DEFAULT 'pendente'::text,
  nf_vinculada_id uuid,
  compromisso_parcelado_id uuid,
  linha_original_csv text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  conta_pagar_id uuid,
  centro_custo_id uuid
);
CREATE TABLE IF NOT EXISTS public.faturas_cartao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid,
  periodo_inicio date,
  periodo_fim date,
  data_emissao date,
  data_vencimento date NOT NULL,
  numero_documento text,
  valor_total numeric(15,2) NOT NULL,
  valor_total_calculado numeric(15,2),
  valor_pagamento_anterior numeric(15,2),
  valor_saldo_atraso numeric(15,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'aberta'::text,
  conta_pagar_id uuid,
  pdf_storage_path text,
  pdf_nome_original text,
  fonte_importacao text,
  importacao_lote_id uuid,
  observacao text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  cartao_id uuid
);
CREATE TABLE IF NOT EXISTS public.ged_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ged_documento_vinculos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL,
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  observacao text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ged_documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pasta_id uuid,
  nome text NOT NULL,
  arquivo_original text NOT NULL,
  descricao text,
  tipo_documento text NOT NULL,
  parceiro_id uuid,
  tags text[] DEFAULT '{}'::text[],
  storage_path text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  resumo_ia text,
  classificacao_ia jsonb,
  confianca_ia text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  pasta_contrato_id uuid,
  nfs_stage_id uuid,
  status_classificacao text NOT NULL DEFAULT 'classificada'::text,
  lote_id uuid,
  vinculacao_proposta jsonb,
  hash_arquivo text,
  origem_porta text NOT NULL DEFAULT 'ged'::text,
  parceiro_resolucao_pendente boolean NOT NULL DEFAULT false,
  parceiro_resolucao_dispensada boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.ged_pastas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  parceiro_id uuid,
  ativa boolean NOT NULL DEFAULT true,
  cor text,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo text DEFAULT 'outro'::text,
  area text,
  responsavel_id uuid,
  status text DEFAULT 'ativo'::text,
  area_id uuid,
  parent_id uuid
);
CREATE TABLE IF NOT EXISTS public.grupo_acesso_permissoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grupo_acesso_id uuid NOT NULL,
  permissao_id uuid NOT NULL,
  pode_ver boolean DEFAULT true,
  pode_criar boolean DEFAULT false,
  pode_editar boolean DEFAULT false,
  pode_apagar boolean DEFAULT false,
  condicao_extra jsonb,
  criado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.grupo_acesso_usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  grupo_acesso_id uuid NOT NULL,
  user_id uuid NOT NULL,
  ativo_em timestamp with time zone DEFAULT now(),
  inativado_em timestamp with time zone,
  adicionado_por uuid,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.grupos_empresariais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  cnpj_raiz text,
  tipo_controle text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.grupos_parceiros_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parceiro_id uuid NOT NULL,
  grupo_anterior_id uuid,
  grupo_novo_id uuid,
  mudou_em timestamp with time zone NOT NULL DEFAULT now(),
  mudou_por uuid
);
CREATE TABLE IF NOT EXISTS public.itau_importacoes_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid,
  arquivo_nome text NOT NULL,
  periodo_inicio date,
  periodo_fim date,
  total_linhas integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente'::text,
  criado_por uuid,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.itau_pagamentos_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL,
  conta_bancaria_id uuid,
  cnpj_pagador text,
  tipo_pagamento text,
  numero_lote text,
  nome_favorecido text,
  cnpj_favorecido text,
  data_pagamento date,
  valor_pago numeric(15,2),
  status_banco text DEFAULT 'Efetuado'::text,
  dados_pagamento text,
  referencia_empresa text,
  parceiro_id uuid,
  conta_pagar_id uuid,
  movimentacao_id uuid,
  ofx_transacao_id uuid,
  status_conciliacao text NOT NULL DEFAULT 'pendente'::text,
  hash_unico text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meios_pagamento (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nfs_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fonte text NOT NULL DEFAULT 'pdf_nfe'::text,
  importacao_lote_id uuid,
  fornecedor_cnpj text,
  fornecedor_razao_social text,
  fornecedor_cliente text,
  parceiro_id uuid,
  nf_numero text,
  nf_chave_acesso text,
  nf_data_emissao date,
  nf_serie text,
  valor numeric(15,2) DEFAULT 0,
  descricao text,
  plano_contas_id uuid,
  data_vencimento date,
  itens jsonb,
  status text NOT NULL DEFAULT 'nao_vinculada'::text,
  match_score numeric,
  match_motivos text,
  conta_pagar_id uuid,
  motivo_descarte text,
  criada_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo_documento text NOT NULL DEFAULT 'nfe'::text,
  pais_emissor text NOT NULL DEFAULT 'BR'::text,
  moeda text NOT NULL DEFAULT 'BRL'::text,
  valor_origem numeric,
  taxa_conversao numeric,
  tem_xml_obrigatorio boolean NOT NULL DEFAULT true,
  resumo_pdf_pendente boolean NOT NULL DEFAULT false,
  resumo_pdf_gerado_em timestamp with time zone,
  resumo_pdf_storage_path text,
  numero_parcela integer,
  total_parcelas integer,
  numero_documento_referencia text,
  categoria_sugerida_ia boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.nfs_stage_documentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nfs_stage_id uuid NOT NULL,
  tipo text NOT NULL,
  storage_path text NOT NULL,
  arquivo_nome text,
  linha_digitavel text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  criado_por uuid,
  valor numeric,
  data_vencimento date,
  ged_documento_id uuid
);
CREATE TABLE IF NOT EXISTS public.nfs_stage_venda (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nf_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'aguardando_matching'::text,
  diff_jsonb jsonb,
  resolvido_por uuid,
  resolvido_em timestamp with time zone,
  resolvido_motivo text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ofx_importacoes_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid NOT NULL,
  arquivo_nome text,
  arquivo_storage_path text,
  periodo_inicio date,
  periodo_fim date,
  saldo_final numeric,
  total_transacoes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho'::text,
  criado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  persistido_em timestamp with time zone,
  persistido_por uuid
);
CREATE TABLE IF NOT EXISTS public.ofx_regras_automaticas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  pattern text NOT NULL,
  conta_bancaria_id uuid,
  conta_plano_id uuid,
  centro_custo_id uuid,
  descricao_override text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  acao text NOT NULL DEFAULT 'lancar'::text
);
CREATE TABLE IF NOT EXISTS public.ofx_transacoes_stage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  importacao_stage_id uuid NOT NULL,
  conta_bancaria_id uuid NOT NULL,
  data_transacao date NOT NULL,
  valor numeric NOT NULL,
  descricao text NOT NULL,
  tipo text,
  id_transacao_banco text,
  hash_unico text NOT NULL,
  saldo_pos_transacao numeric,
  status text NOT NULL DEFAULT 'pendente'::text,
  duplicada_de uuid,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.parceiros_comerciais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cnpj text,
  cpf text,
  razao_social text NOT NULL,
  nome_fantasia text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  uf text,
  telefone text,
  email text,
  tipo text DEFAULT 'pj'::text,
  plano_contas_id uuid,
  tags text[],
  ativo boolean DEFAULT true,
  observacao text,
  origem text DEFAULT 'manual'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tipos text[] DEFAULT ARRAY['fornecedor'::text],
  segmento text,
  bling_id text,
  dados_bancarios jsonb,
  grupo_id uuid,
  pix_chave text,
  pix_tipo text,
  tipo_pessoa text NOT NULL DEFAULT 'PJ'::text,
  rg text,
  data_nascimento date,
  canal_venda_id uuid,
  centro_custo_id uuid,
  forma_pagamento_padrao_id uuid,
  cadastro_incompleto boolean NOT NULL DEFAULT false,
  bandeira_vermelha boolean NOT NULL DEFAULT false,
  bandeira_vermelha_motivo text,
  bandeira_vermelha_por uuid,
  bandeira_vermelha_em timestamp with time zone,
  grupo_economico_id uuid,
  nivel_programa text NOT NULL DEFAULT 'convive'::text,
  categoria_ka text,
  perfil_credito text NOT NULL DEFAULT 'novo_entrada'::text,
  contexto_bureau jsonb,
  inscricao_estadual text,
  isento_ie boolean NOT NULL DEFAULT false,
  situacao_cadastral text,
  endereco_complemento text,
  endereco_entrega jsonb,
  contatos jsonb,
  regiao_atuacao text,
  canal_fop text,
  premissas jsonb
);
CREATE TABLE IF NOT EXISTS public.pasta_contrato_parcelas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'principal'::text,
  numero_parcela integer,
  total_parcelas integer,
  valor numeric NOT NULL,
  valor_real numeric,
  data_vencimento date NOT NULL,
  conta_pagar_id uuid,
  status text NOT NULL DEFAULT 'pendente'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pasta_contratos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pasta_id uuid NOT NULL,
  numero text NOT NULL,
  descricao text,
  data_assinatura date,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  valor_total numeric NOT NULL,
  valor_parcela numeric NOT NULL,
  ciclo_pagamento text NOT NULL,
  numero_parcelas integer,
  dia_vencimento integer,
  data_primeira_parcela date NOT NULL,
  meio_pagamento_id uuid,
  tem_setup boolean NOT NULL DEFAULT false,
  valor_setup numeric DEFAULT 0,
  parcelas_setup integer DEFAULT 1,
  data_primeira_parcela_setup date,
  reajuste_indice text DEFAULT 'nenhum'::text,
  reajuste_data date,
  renova_automaticamente boolean NOT NULL DEFAULT false,
  alerta_renovacao_dias integer NOT NULL DEFAULT 60,
  permite_valor_variavel boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'vigente'::text,
  resumo_ia text,
  clausulas_extraidas jsonb,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo_contrato_id uuid,
  linha_investimento_id uuid
);
CREATE TABLE IF NOT EXISTS public.pasta_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pasta_id uuid NOT NULL,
  contrato_id uuid,
  tipo_evento text NOT NULL,
  descricao text NOT NULL,
  valor_anterior numeric,
  valor_novo numeric,
  data_evento date NOT NULL DEFAULT (now())::date,
  metadata jsonb,
  criado_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedido_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  tipo_evento text NOT NULL,
  estagio_anterior text,
  estagio_novo text,
  area_anterior text,
  area_nova text,
  descricao text,
  metadata jsonb,
  operador_id uuid,
  automatico boolean NOT NULL DEFAULT false,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  sku text,
  descricao text NOT NULL,
  quantidade numeric(10,3) NOT NULL,
  valor_unitario numeric(12,4) NOT NULL,
  valor_unitario_tabela numeric(12,4),
  desconto_pct numeric(5,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) DEFAULT round(((quantidade * valor_unitario) * ((1)::numeric - (desconto_pct / (100)::numeric))), 2),
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedido_transicoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  ator uuid,
  acao text NOT NULL,
  estagio_origem text,
  estagio_destino text NOT NULL,
  motivo text,
  delta_jsonb jsonb,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  solicitante_id uuid NOT NULL,
  departamento_id uuid,
  unidade_id uuid,
  centro_custo_id uuid,
  linha_investimento_id uuid,
  parceiro_preferencial_id uuid,
  descricao_geral text,
  justificativa text,
  status pedido_compra_status_enum NOT NULL DEFAULT 'rascunho'::pedido_compra_status_enum,
  sub_estado pedido_compra_sub_estado_enum,
  comprador_id uuid,
  enviado_em timestamp with time zone,
  iniciado_em timestamp with time zone,
  finalizado_em timestamp with time zone,
  cancelamento_motivo text,
  cancelado_por uuid,
  cancelado_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  tipo text NOT NULL DEFAULT 'pontual'::text
);
CREATE TABLE IF NOT EXISTS public.pedidos_compra_anexos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  tipo pedido_compra_anexo_tipo_enum NOT NULL,
  nome_original text NOT NULL,
  mime_type text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedidos_compra_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pedidos_compra_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  descricao text NOT NULL,
  quantidade numeric(14,4) NOT NULL,
  valor_estimado_unitario numeric(14,2) NOT NULL,
  urls text[],
  especificacao_tecnica text,
  status pedido_compra_item_status_enum NOT NULL DEFAULT 'pendente'::pedido_compra_item_status_enum,
  cancelamento_motivo text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.permissoes_catalogo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  tipo text NOT NULL,
  pilar text NOT NULL,
  nome_exibicao text NOT NULL,
  descricao text,
  contem_dado_sensivel boolean DEFAULT false,
  categoria_sod text,
  feature_em_teste boolean DEFAULT false,
  ativo boolean DEFAULT true,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.planilha_fatura_vinculo (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  planilha_id uuid NOT NULL,
  fatura_id uuid NOT NULL,
  valor_vinculado numeric(15,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.regras_automaticas_ofx (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  padrao_descricao text NOT NULL,
  tipo_transacao text NOT NULL,
  valor_exato numeric(15,2),
  conta_bancaria_id uuid,
  categoria_id uuid NOT NULL,
  parceiro_id uuid,
  descricao_override text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  criado_por uuid
);
CREATE TABLE IF NOT EXISTS public.regras_cadencia_credito (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  ativa boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 100,
  criterio jsonb NOT NULL DEFAULT '{}'::jsonb,
  condicao_default jsonb,
  parecer_template text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  criado_por uuid,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid
);
CREATE TABLE IF NOT EXISTS public.remessas_contador (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  descricao text,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  enviada_em timestamp with time zone NOT NULL DEFAULT now(),
  enviada_por uuid,
  metodo text NOT NULL,
  destinatarios text[] NOT NULL DEFAULT '{}'::text[],
  link_signed text,
  link_expira_em timestamp with time zone,
  observacao text,
  qtd_documentos integer NOT NULL DEFAULT 0,
  qtd_contas integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.remessas_contador_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  remessa_id uuid NOT NULL,
  conta_id uuid NOT NULL,
  doc_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tipos_contrato (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.titulo_a_receber (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_titulo text NOT NULL,
  conta_id uuid NOT NULL,
  pedido_id uuid NOT NULL,
  nf_id uuid,
  analise_credito_id uuid,
  titulo_pai_id uuid,
  titulo_renegociado_origem_id uuid,
  valor_bruto numeric(12,2) NOT NULL,
  valor_desconto numeric(12,2) NOT NULL DEFAULT 0,
  valor_juros numeric(12,2) NOT NULL DEFAULT 0,
  valor_multa numeric(12,2) NOT NULL DEFAULT 0,
  valor_correcao numeric(12,2) NOT NULL DEFAULT 0,
  valor_atual numeric(12,2) DEFAULT ((((valor_bruto - valor_desconto) + valor_juros) + valor_multa) + valor_correcao),
  data_criacao timestamp with time zone NOT NULL DEFAULT now(),
  data_emissao_nf timestamp with time zone,
  data_vencimento_original date NOT NULL,
  data_vencimento_atual date NOT NULL,
  data_pagamento timestamp with time zone,
  numero_parcela smallint NOT NULL DEFAULT 1,
  total_parcelas smallint NOT NULL DEFAULT 1,
  tipo_pagamento text NOT NULL,
  eh_entrada boolean NOT NULL DEFAULT false,
  condicao_pagamento text,
  codigo_barras_boleto text,
  chave_pix text,
  autorizacao_cartao text,
  status text NOT NULL DEFAULT 'aguardando_envio_bling'::text,
  subestado_atraso text NOT NULL DEFAULT 'em_dia'::text,
  flag_bandeira_amarela boolean NOT NULL DEFAULT false,
  flag_grupo_economico_inadimplente boolean NOT NULL DEFAULT false,
  modalidade_renegociacao smallint,
  justificativa_renegociacao text,
  pausa_regua_automatica boolean NOT NULL DEFAULT false,
  data_proxima_acao_regua date,
  vip_relacionamento boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.user_colaborador_link (
  user_id uuid NOT NULL,
  colaborador_clt_id uuid,
  contrato_pj_id uuid,
  tipo_externo text,
  vinculado_em timestamp with time zone DEFAULT now(),
  vinculado_por uuid,
  inativado_em timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.user_preferencias_navegacao (
  user_id uuid NOT NULL,
  tema text NOT NULL DEFAULT 'light'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ========================= FUNCOES (199) =========================
CREATE OR REPLACE FUNCTION public._set_updated_at_grupos_empresariais()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._touch_regras_automaticas_ofx()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.analisar_pedido_vs_programa(p_pedido_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido record;
  v_nivel record;
  v_prazo_solicitado int;
  v_status text;
  v_motivo text;
  v_detalhes jsonb;
BEGIN
  SELECT p.id, p.condicao_solicitada, p.forma_solicitada, p.valor_liquido,
         p.parceiro_id, p.estagio,
         pc.nivel_programa, pc.razao_social, pc.bandeira_vermelha, pc.categoria_ka
  INTO v_pedido
  FROM public.pedidos p
  JOIN public.parceiros_comerciais pc ON pc.id = p.parceiro_id
  WHERE p.id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  SELECT * INTO v_nivel
  FROM public.programa_niveis_beneficios
  WHERE slug = COALESCE(
    CASE
      WHEN v_pedido.categoria_ka = 'parceiro' THEN 'ka_parceiro'
      WHEN v_pedido.categoria_ka = 'familia' THEN 'ka_familia'
      ELSE v_pedido.nivel_programa
    END,
    'convive'
  );

  IF NOT FOUND THEN
    UPDATE public.pedidos
    SET analise_pedido_status = 'erro',
        analise_pedido_motivo = 'Nível do cliente não cadastrado em programa_niveis_beneficios',
        analise_pedido_executada_em = now()
    WHERE id = p_pedido_id;
    RETURN json_build_object('status', 'erro', 'motivo', 'nivel_nao_cadastrado');
  END IF;

  IF v_pedido.bandeira_vermelha THEN
    UPDATE public.pedidos
    SET analise_pedido_status = 'desvio',
        analise_pedido_motivo = 'Cliente com bandeira vermelha — exige avaliação manual',
        analise_pedido_detalhes = jsonb_build_object(
          'razao', 'bandeira_vermelha',
          'nivel_efetivo', v_nivel.slug,
          'nivel_nome', v_nivel.nome
        ),
        analise_pedido_executada_em = now()
    WHERE id = p_pedido_id;

    INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
    VALUES (p_pedido_id, 'outro', 'Análise do pedido: desvio (bandeira vermelha)',
            jsonb_build_object('status', 'desvio', 'razao', 'bandeira_vermelha'), true);

    RETURN json_build_object('status', 'desvio', 'motivo', 'bandeira_vermelha');
  END IF;

  v_prazo_solicitado := COALESCE((
    SELECT MAX(n::int)
    FROM regexp_split_to_table(COALESCE(v_pedido.condicao_solicitada, ''), '\D+') AS n
    WHERE n ~ '^\d+$'
  ), 0);

  IF v_prazo_solicitado > v_nivel.prazo_padrao_dias THEN
    v_status := 'desvio';
    v_motivo := format('Prazo solicitado %s dias excede o máximo do nível %s (%s dias)',
                       v_prazo_solicitado, v_nivel.nome, v_nivel.prazo_padrao_dias);
  ELSE
    v_status := 'ok';
    v_motivo := format('Condição compatível com nível %s (prazo solicitado %s ≤ permitido %s dias)',
                       v_nivel.nome, v_prazo_solicitado, v_nivel.prazo_padrao_dias);
  END IF;

  v_detalhes := jsonb_build_object(
    'nivel_efetivo', v_nivel.slug,
    'nivel_nome', v_nivel.nome,
    'prazo_solicitado_dias', v_prazo_solicitado,
    'prazo_permitido_dias', v_nivel.prazo_padrao_dias,
    'cartao_sem_juros_max_parcelas', v_nivel.cartao_sem_juros_max_parcelas,
    'condicao_solicitada', v_pedido.condicao_solicitada,
    'forma_solicitada', v_pedido.forma_solicitada,
    'desconto_pct_aplicavel', v_nivel.desconto_pct
  );

  UPDATE public.pedidos
  SET analise_pedido_status = v_status,
      analise_pedido_motivo = v_motivo,
      analise_pedido_detalhes = v_detalhes,
      analise_pedido_executada_em = now()
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (pedido_id, tipo_evento, descricao, metadata, automatico)
  VALUES (p_pedido_id, 'outro',
          format('Análise do pedido: %s — %s', v_status, v_motivo),
          v_detalhes, true);

  RETURN json_build_object('status', v_status, 'motivo', v_motivo, 'detalhes', v_detalhes);
END;
$function$;
CREATE OR REPLACE FUNCTION public.ancorar_boleto_em_cpr(p_boleto_stage_id uuid, p_cpr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_ged_documento_id UUID;
  v_status_atual TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Valida estado do boleto
  SELECT ged_documento_id, status 
  INTO v_ged_documento_id, v_status_atual
  FROM public.boleto_stage
  WHERE id = p_boleto_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'boleto_stage % não encontrado', p_boleto_stage_id
      USING ERRCODE = '02000';
  END IF;

  IF v_status_atual NOT IN ('aguardando_ancoragem', 'ancorado_em_cpr_existente') THEN
    RAISE EXCEPTION 'Boleto não pode ser reancorado (status=%)', v_status_atual
      USING ERRCODE = '22023';
  END IF;

  -- Valida CPR alvo
  IF NOT EXISTS (SELECT 1 FROM public.contas_pagar_receber WHERE id = p_cpr_id) THEN
    RAISE EXCEPTION 'CPR % não encontrada', p_cpr_id USING ERRCODE = '02000';
  END IF;

  -- Atualiza boleto_stage com carimbo (Doutrina #111)
  UPDATE public.boleto_stage
  SET
    contas_pagar_receber_id = p_cpr_id,
    status = 'ancorado_em_cpr_existente',
    ancorado_em = now(),
    ancorado_por = v_user_id
  WHERE id = p_boleto_stage_id;

  -- Vincula GED a CPR (polimórfico)
  INSERT INTO public.ged_documento_vinculos
    (documento_id, entidade_tipo, entidade_id, observacao, criado_por)
  VALUES
    (v_ged_documento_id, 'cpr', p_cpr_id, 'Ancoragem manual', v_user_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'boleto_stage_id', p_boleto_stage_id,
    'contas_pagar_receber_id', p_cpr_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.apagar_conta_pagar(p_id uuid, p_apagar_grupo_inteiro boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta              RECORD;
  v_user_id            UUID := auth.uid();
  v_qtd_grupo          INT := 0;
  v_apagadas           INT := 0;
  v_nfs_desvinculadas  INT := 0;
  v_alvo               RECORD;
BEGIN
  SELECT * INTO v_conta
    FROM contas_pagar_receber
   WHERE id = p_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta não encontrada ou já apagada');
  END IF;

  IF v_conta.parcela_grupo_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_qtd_grupo
      FROM contas_pagar_receber
     WHERE parcela_grupo_id = v_conta.parcela_grupo_id
       AND deleted_at IS NULL;
  END IF;

  -- Tudo ou nada: se é grupo > 1 e usuário não confirmou, devolve aviso
  IF v_qtd_grupo > 1 AND NOT p_apagar_grupo_inteiro THEN
    RETURN jsonb_build_object(
      'ok', false,
      'precisa_confirmar_grupo', true,
      'qtd_parcelas_grupo', v_qtd_grupo,
      'erro', 'Esta conta faz parte de um grupo de ' || v_qtd_grupo || ' parcelas. Confirme se deseja apagar todas.'
    );
  END IF;

  FOR v_alvo IN
    SELECT *
      FROM contas_pagar_receber
     WHERE deleted_at IS NULL
       AND (
         id = p_id
         OR (p_apagar_grupo_inteiro 
             AND v_conta.parcela_grupo_id IS NOT NULL 
             AND parcela_grupo_id = v_conta.parcela_grupo_id)
       )
  LOOP
    IF v_alvo.status IN ('paga', 'cancelado') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'erro', 'Conta "' || v_alvo.descricao || '" tem status "' || v_alvo.status || '". Cancele em vez de apagar.'
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM fatura_cartao_lancamentos
       WHERE conta_pagar_id = v_alvo.id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'erro', 'Conta "' || v_alvo.descricao || '" tem lançamento(s) de cartão vinculado(s). Desvincule antes de apagar.'
      );
    END IF;

    IF v_alvo.movimentacao_bancaria_id IS NOT NULL OR v_alvo.conciliado_em IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'erro', 'Conta "' || v_alvo.descricao || '" está conciliada com movimentação bancária. Desconcilie antes de apagar.'
      );
    END IF;

    INSERT INTO contas_pagar_receber_audit_delete (conta_id, apagado_por, motivo, snapshot)
    VALUES (
      v_alvo.id,
      v_user_id,
      CASE WHEN p_apagar_grupo_inteiro THEN 'cascade_grupo' ELSE 'individual' END,
      to_jsonb(v_alvo)
    );

    UPDATE nfs_stage
       SET conta_pagar_id = NULL,
           status = 'nao_vinculada',
           updated_at = now()
     WHERE conta_pagar_id = v_alvo.id;
    GET DIAGNOSTICS v_nfs_desvinculadas = ROW_COUNT;

    IF v_alvo.compromisso_parcelado_id IS NOT NULL OR v_alvo.compromisso_recorrente_id IS NOT NULL THEN
      UPDATE contas_pagar_receber
         SET observacao = COALESCE(observacao || E'\n', '') 
                          || '[' || to_char(now(), 'DD/MM/YYYY HH24:MI') 
                          || '] Apagada — não regerar esta ocorrência.',
             updated_at = now()
       WHERE id = v_alvo.id;
    END IF;

    UPDATE contas_pagar_receber
       SET deleted_at = now(),
           deleted_por = v_user_id,
           updated_at = now()
     WHERE id = v_alvo.id;

    v_apagadas := v_apagadas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'apagadas', v_apagadas,
    'nfs_desvinculadas', v_nfs_desvinculadas,
    'cascade_grupo', p_apagar_grupo_inteiro,
    'qtd_parcelas_grupo', v_qtd_grupo
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.aplicar_ia_categoria_em_massa()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta RECORD;
  v_top RECORD;
  v_aplicadas int := 0;
  v_ambiguas int := 0;
  v_total int := 0;
BEGIN
  -- B-51 fix: plano_contas_id (renomeada em §3.2 - 18/05/2026)
  FOR v_conta IN
    SELECT id, descricao, parceiro_id, nf_cnpj_emitente
    FROM contas_pagar_receber
    WHERE plano_contas_id IS NULL
      AND status NOT IN ('cancelado')
  LOOP
    v_total := v_total + 1;

    SELECT categoria_id, score INTO v_top
    FROM sugerir_categoria_para_lancamento(
      v_conta.descricao,
      v_conta.nf_cnpj_emitente,
      v_conta.parceiro_id
    )
    ORDER BY score DESC
    LIMIT 1;

    IF v_top.categoria_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_top.score >= 90 THEN
      UPDATE contas_pagar_receber
      SET plano_contas_id = v_top.categoria_id,
          categoria_sugerida_ia = false,
          updated_at = now()
      WHERE id = v_conta.id;
      v_aplicadas := v_aplicadas + 1;
    ELSIF v_top.score >= 70 THEN
      UPDATE contas_pagar_receber
      SET categoria_sugerida_ia = true,
          updated_at = now()
      WHERE id = v_conta.id;
      v_ambiguas := v_ambiguas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'aplicadas', v_aplicadas,
    'ambiguas', v_ambiguas
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.aplicar_regras_automaticas_ofx(p_conta_bancaria_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx RECORD;
  v_regra RECORD;
  v_descricao TEXT;
  v_resp JSONB;
  v_aplicados_debito INT := 0;
  v_aplicados_credito INT := 0;
  v_erros INT := 0;
  v_avaliados INT := 0;
BEGIN
  IF p_conta_bancaria_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_bancaria_id obrigatório');
  END IF;

  FOR v_ofx IN
    SELECT id, conta_bancaria_id, data_transacao, valor, descricao, status
    FROM public.ofx_transacoes_stage
    WHERE conta_bancaria_id = p_conta_bancaria_id
      AND status = 'pendente'
    ORDER BY data_transacao ASC
  LOOP
    v_avaliados := v_avaliados + 1;

    -- Busca primeira regra ativa que casa (ordem determinística: created_at ASC)
    SELECT *
    INTO v_regra
    FROM public.regras_automaticas_ofx r
    WHERE r.ativa = true
      AND (r.conta_bancaria_id IS NULL OR r.conta_bancaria_id = v_ofx.conta_bancaria_id)
      AND v_ofx.descricao ILIKE '%' || r.padrao_descricao || '%'
      AND (
        r.tipo_transacao = 'ambos'
        OR (r.tipo_transacao = 'debito' AND v_ofx.valor < 0)
        OR (r.tipo_transacao = 'credito' AND v_ofx.valor > 0)
      )
      AND (r.valor_exato IS NULL OR r.valor_exato = ABS(v_ofx.valor))
    ORDER BY r.created_at ASC
    LIMIT 1;

    -- Sem regra aplicável → segue
    IF v_regra.id IS NULL THEN
      CONTINUE;
    END IF;

    v_descricao := COALESCE(v_regra.descricao_override, v_ofx.descricao);

    -- Reusa Fase 3: cria CPR + mov + propaga pg_em + concilia OFX
    BEGIN
      IF v_ofx.valor < 0 THEN
        v_resp := public.criar_cpr_e_vincular_stage_2_debito(
          p_ofx_id := v_ofx.id,
          p_descricao := v_descricao,
          p_categoria_id := v_regra.categoria_id,
          p_parceiro_id := v_regra.parceiro_id,
          p_user_id := p_user_id
        );
        IF (v_resp->>'ok')::BOOLEAN THEN
          v_aplicados_debito := v_aplicados_debito + 1;
        ELSE
          v_erros := v_erros + 1;
        END IF;
      ELSIF v_ofx.valor > 0 THEN
        v_resp := public.criar_cpr_receita_stage_2_credito(
          p_ofx_id := v_ofx.id,
          p_descricao := v_descricao,
          p_categoria_id := v_regra.categoria_id,
          p_parceiro_id := v_regra.parceiro_id,
          p_user_id := p_user_id
        );
        IF (v_resp->>'ok')::BOOLEAN THEN
          v_aplicados_credito := v_aplicados_credito + 1;
        ELSE
          v_erros := v_erros + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
      -- não interrompe o loop; próxima iteração
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'avaliados', v_avaliados,
    'aplicados_debito', v_aplicados_debito,
    'aplicados_credito', v_aplicados_credito,
    'aplicados_total', v_aplicados_debito + v_aplicados_credito,
    'erros', v_erros
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.aplicar_regras_categorizacao_stage(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nf              RECORD;
  v_regra           RECORD;
  v_descricao_busca TEXT;
  v_regra_origem    TEXT;
  v_plano_contas_id UUID;
  v_centro_custo_id UUID;
BEGIN
  SELECT * INTO v_nf FROM nfs_stage WHERE id = p_stage_id;
  IF v_nf.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'NF não encontrada');
  END IF;
  -- Preserva classificação humana
  IF v_nf.plano_contas_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'preservada_classificacao_humana');
  END IF;

  v_plano_contas_id := NULL;
  v_centro_custo_id := NULL;
  v_regra_origem    := NULL;

  -- ETAPA 1: regra por CNPJ do parceiro
  IF v_nf.fornecedor_cnpj IS NOT NULL THEN
    SELECT plano_contas_id, centro_custo_id INTO v_plano_contas_id, v_centro_custo_id
    FROM regras_categorizacao
    WHERE ativo = true
      AND cnpj_emitente IS NOT NULL
      AND cnpj_emitente = v_nf.fornecedor_cnpj
    ORDER BY prioridade ASC LIMIT 1;
    IF v_plano_contas_id IS NOT NULL THEN v_regra_origem := 'parceiro'; END IF;
  END IF;

  -- ETAPA 2: regra por NCM (prefixo)
  IF v_plano_contas_id IS NULL THEN
    DECLARE v_ncm_principal TEXT;
    BEGIN
      IF v_nf.itens IS NOT NULL AND jsonb_array_length(v_nf.itens) > 0 THEN
        v_ncm_principal := v_nf.itens->0->>'ncm';
      END IF;
      IF v_ncm_principal IS NOT NULL AND v_ncm_principal <> '' THEN
        SELECT plano_contas_id, centro_custo_id INTO v_plano_contas_id, v_centro_custo_id
        FROM regras_categorizacao
        WHERE ativo = true
          AND ncm_prefixo IS NOT NULL
          AND v_ncm_principal LIKE (ncm_prefixo || '%')
        ORDER BY prioridade ASC LIMIT 1;
        IF v_plano_contas_id IS NOT NULL THEN v_regra_origem := 'ncm'; END IF;
      END IF;
    END;
  END IF;

  -- ETAPA 3: regra por descrição contém
  IF v_plano_contas_id IS NULL THEN
    v_descricao_busca := lower(
      COALESCE(v_nf.fornecedor_razao_social, '') || ' ' ||
      COALESCE(v_nf.descricao, '') || ' ' ||
      COALESCE(v_nf.fornecedor_cliente, '')
    );
    IF length(trim(v_descricao_busca)) > 0 THEN
      SELECT plano_contas_id, centro_custo_id INTO v_plano_contas_id, v_centro_custo_id
      FROM regras_categorizacao
      WHERE ativo = true
        AND descricao_contem IS NOT NULL
        AND v_descricao_busca LIKE ('%' || lower(descricao_contem) || '%')
      ORDER BY prioridade ASC LIMIT 1;
      IF v_plano_contas_id IS NOT NULL THEN v_regra_origem := 'texto'; END IF;
    END IF;
  END IF;

  -- Se achou regra, atualiza nfs_stage
  IF v_plano_contas_id IS NOT NULL THEN
    UPDATE nfs_stage
    SET plano_contas_id = v_plano_contas_id,
        updated_at = now()
    WHERE id = p_stage_id;
    RETURN jsonb_build_object(
      'ok', true,
      'acao', 'classificada',
      'plano_contas_id', v_plano_contas_id,
      'origem', v_regra_origem,
      'centro_custo_id', v_centro_custo_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', 'sem_match');
END;
$function$;
CREATE OR REPLACE FUNCTION public.apontar_matches_conciliacao(p_conta_bancaria_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_itens JSONB;
  v_aguardando JSONB;
  v_lotes JSONB;
  v_ofx_orfao JSONB;
BEGIN

  -- ─── SEÇÃO 1: ITENS AVULSOS (planilhas com matches sugeridos) ────────────
  WITH lotes_verdadeiros AS (
    SELECT numero_lote
    FROM public.itau_pagamentos_stage
    WHERE conta_bancaria_id = p_conta_bancaria_id
      AND movimentacao_id IS NULL
      AND status_conciliacao NOT IN ('ignorado','conciliado','conciliado_manual')
      AND numero_lote IS NOT NULL AND numero_lote <> '-' AND numero_lote <> ''
    GROUP BY numero_lote HAVING COUNT(*) > 1
  ),
  movs_elegiveis AS (
    SELECT m.id AS mov_id, m.data_transacao, ABS(m.valor) AS valor_abs,
      m.conta_pagar_id, cpr.descricao AS cpr_descricao,
      COALESCE(pc.nome_fantasia, pc.razao_social, cpr.fornecedor_cliente) AS parceiro_nome,
      REGEXP_REPLACE(COALESCE(pc.cnpj,''),'[^0-9]','','g') AS parceiro_cnpj
    FROM public.movimentacoes_bancarias m
    LEFT JOIN public.contas_pagar_receber cpr ON cpr.id = m.conta_pagar_id
    LEFT JOIN public.parceiros_comerciais pc ON pc.id = cpr.parceiro_id
    WHERE m.tipo='debito' AND m.pg_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.itau_pagamentos_stage ps2 WHERE ps2.movimentacao_id = m.id)
  ),
  ofx_elegiveis AS (
    SELECT id AS ofx_id, data_transacao, descricao, ABS(valor) AS valor_abs
    FROM public.ofx_transacoes_stage
    WHERE status='pendente' AND valor<0 AND conta_bancaria_id = p_conta_bancaria_id
  ),
  planilhas_avulsas AS (
    SELECT ps.id AS pl_id, ps.nome_favorecido, ps.cnpj_favorecido,
      REGEXP_REPLACE(COALESCE(ps.cnpj_favorecido,''),'[^0-9]','','g') AS pl_cnpj,
      ps.data_pagamento AS pl_data, ps.valor_pago AS pl_valor,
      ps.numero_lote, ps.tipo_pagamento, ps.status_conciliacao,
      COALESCE((
        SELECT SUM(ABS(m2.valor)) FROM public.movimentacoes_bancarias m2
        WHERE m2.itau_planilha_id = ps.id
      ), 0) AS valor_ja_vinculado
    FROM public.itau_pagamentos_stage ps
    WHERE ps.conta_bancaria_id = p_conta_bancaria_id
      AND ps.status_conciliacao NOT IN ('ignorado','conciliado','conciliado_manual')
      AND ps.valor_pago IS NOT NULL AND ps.data_pagamento IS NOT NULL
      AND (ps.movimentacao_id IS NULL OR ps.status_conciliacao = 'parcialmente_conciliado')
      AND (ps.numero_lote IS NULL OR ps.numero_lote='-' OR ps.numero_lote=''
           OR ps.numero_lote NOT IN (SELECT numero_lote FROM lotes_verdadeiros))
  ),
  melhor_mov AS (
    SELECT DISTINCT ON (pa.pl_id) pa.pl_id, m.mov_id, m.data_transacao AS mov_data,
      m.valor_abs AS mov_valor, m.cpr_descricao, m.parceiro_nome, m.conta_pagar_id,
      CASE
        WHEN pa.pl_cnpj<>'' AND m.parceiro_cnpj=pa.pl_cnpj AND m.data_transacao=pa.pl_data AND m.valor_abs = pa.pl_valor THEN 1
        WHEN pa.pl_cnpj<>'' AND m.parceiro_cnpj=pa.pl_cnpj AND m.valor_abs = pa.pl_valor THEN 2
        WHEN m.data_transacao=pa.pl_data AND m.valor_abs = pa.pl_valor THEN 3
        ELSE 4
      END AS nivel
    FROM planilhas_avulsas pa
    JOIN movs_elegiveis m ON m.valor_abs = pa.pl_valor
    ORDER BY pa.pl_id,
      CASE
        WHEN pa.pl_cnpj<>'' AND m.parceiro_cnpj=pa.pl_cnpj AND m.data_transacao=pa.pl_data AND m.valor_abs = pa.pl_valor THEN 1
        WHEN pa.pl_cnpj<>'' AND m.parceiro_cnpj=pa.pl_cnpj AND m.valor_abs = pa.pl_valor THEN 2
        WHEN m.data_transacao=pa.pl_data AND m.valor_abs = pa.pl_valor THEN 3
        ELSE 4
      END ASC
  ),
  melhor_ofx AS (
    SELECT DISTINCT ON (pa.pl_id) pa.pl_id, o.ofx_id, o.data_transacao AS ofx_data,
      o.descricao AS ofx_descricao, o.valor_abs AS ofx_valor
    FROM planilhas_avulsas pa
    JOIN ofx_elegiveis o ON o.valor_abs = pa.pl_valor
    ORDER BY pa.pl_id, ABS(o.data_transacao - pa.pl_data) ASC, o.ofx_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'planilha_id',pa.pl_id,'nome_favorecido',pa.nome_favorecido,
      'cnpj_favorecido',pa.cnpj_favorecido,'valor_pago',pa.pl_valor,
      'data_pagamento',pa.pl_data,'tipo_pagamento',pa.tipo_pagamento,
      'valor_ja_vinculado',pa.valor_ja_vinculado,
      'faltam', pa.pl_valor - pa.valor_ja_vinculado,
      'mov_sugerida', CASE WHEN mm.mov_id IS NOT NULL THEN jsonb_build_object(
        'id',mm.mov_id,'nivel',mm.nivel,
        'nivel_descricao',CASE mm.nivel WHEN 1 THEN 'CNPJ + Data + Valor' WHEN 2 THEN 'CNPJ + Valor' WHEN 3 THEN 'Data + Valor' ELSE 'Apenas Valor' END,
        'descricao',mm.cpr_descricao,'parceiro_nome',mm.parceiro_nome,
        'valor',mm.mov_valor,'data_transacao',mm.mov_data,'conta_pagar_id',mm.conta_pagar_id
      ) ELSE NULL END,
      'ofx_sugerido', CASE WHEN mo.ofx_id IS NOT NULL THEN jsonb_build_object(
        'id',mo.ofx_id,'descricao',mo.ofx_descricao,'valor',mo.ofx_valor,'data_transacao',mo.ofx_data
      ) ELSE NULL END,
      'tipo', CASE
        WHEN pa.status_conciliacao = 'parcialmente_conciliado' THEN 'parcialmente_conciliado'
        WHEN mm.mov_id IS NOT NULL AND mo.ofx_id IS NOT NULL THEN 'completo'
        WHEN mm.mov_id IS NOT NULL THEN 'parcial'
        ELSE 'sem_mov'
      END
    )
    ORDER BY
      CASE
        WHEN pa.status_conciliacao = 'parcialmente_conciliado' THEN 0
        WHEN mm.mov_id IS NOT NULL AND mo.ofx_id IS NOT NULL THEN 1
        WHEN mm.mov_id IS NOT NULL THEN 2
        ELSE 3
      END,
      pa.pl_data DESC
  ), '[]'::jsonb) INTO v_itens
  FROM planilhas_avulsas pa
  LEFT JOIN melhor_mov mm ON mm.pl_id = pa.pl_id
  LEFT JOIN melhor_ofx mo ON mo.pl_id = pa.pl_id;

  -- ─── SEÇÃO 2: AGUARDANDO OFX (planilha já com mov, falta OFX) ────────────
  WITH ofx_elegiveis AS (
    SELECT id AS ofx_id, data_transacao, descricao, ABS(valor) AS valor_abs
    FROM public.ofx_transacoes_stage
    WHERE status='pendente' AND valor<0 AND conta_bancaria_id = p_conta_bancaria_id
  ),
  planilhas_aguardando AS (
    SELECT ps.id AS pl_id, ps.nome_favorecido, ps.cnpj_favorecido,
      ps.data_pagamento AS pl_data, ps.valor_pago AS pl_valor,
      ps.movimentacao_id, ps.tipo_pagamento,
      cpr.descricao AS cpr_descricao,
      COALESCE(pc.nome_fantasia, pc.razao_social, cpr.fornecedor_cliente) AS parceiro_nome
    FROM public.itau_pagamentos_stage ps
    LEFT JOIN public.movimentacoes_bancarias m ON m.id = ps.movimentacao_id
    LEFT JOIN public.contas_pagar_receber cpr ON cpr.id = m.conta_pagar_id
    LEFT JOIN public.parceiros_comerciais pc ON pc.id = cpr.parceiro_id
    WHERE ps.conta_bancaria_id = p_conta_bancaria_id
      AND ps.movimentacao_id IS NOT NULL
      AND ps.ofx_transacao_id IS NULL
      AND ps.status_conciliacao = 'aguardando_ofx'
  ),
  melhor_ofx_ag AS (
    SELECT DISTINCT ON (pa.pl_id) pa.pl_id, o.ofx_id, o.data_transacao AS ofx_data,
      o.descricao AS ofx_descricao, o.valor_abs AS ofx_valor
    FROM planilhas_aguardando pa
    JOIN ofx_elegiveis o ON o.valor_abs = pa.pl_valor
    ORDER BY pa.pl_id, ABS(o.data_transacao - pa.pl_data) ASC, o.ofx_id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'planilha_id',pa.pl_id,'nome_favorecido',pa.nome_favorecido,
      'cnpj_favorecido',pa.cnpj_favorecido,'valor_pago',pa.pl_valor,
      'data_pagamento',pa.pl_data,'tipo_pagamento',pa.tipo_pagamento,
      'movimentacao_id',pa.movimentacao_id,
      'cpr_descricao',pa.cpr_descricao,'parceiro_nome',pa.parceiro_nome,
      'ofx_sugerido', CASE WHEN mo.ofx_id IS NOT NULL THEN jsonb_build_object(
        'id',mo.ofx_id,'descricao',mo.ofx_descricao,'valor',mo.ofx_valor,'data_transacao',mo.ofx_data
      ) ELSE NULL END,
      'tipo', CASE
        WHEN mo.ofx_id IS NOT NULL THEN 'aguardando_ofx_com_match'
        ELSE 'aguardando_ofx_sem_match'
      END
    )
    ORDER BY CASE WHEN mo.ofx_id IS NOT NULL THEN 1 ELSE 2 END, pa.pl_data DESC
  ), '[]'::jsonb) INTO v_aguardando
  FROM planilhas_aguardando pa
  LEFT JOIN melhor_ofx_ag mo ON mo.pl_id = pa.pl_id;

  -- ─── SEÇÃO 3: LOTES (planilhas agrupadas por numero_lote) ────────────────
  WITH lotes_verdadeiros AS (
    SELECT numero_lote FROM public.itau_pagamentos_stage
    WHERE conta_bancaria_id = p_conta_bancaria_id
      AND movimentacao_id IS NULL
      AND status_conciliacao NOT IN ('ignorado','conciliado','conciliado_manual')
      AND numero_lote IS NOT NULL AND numero_lote <> '-' AND numero_lote <> ''
    GROUP BY numero_lote HAVING COUNT(*) > 1
  ),
  movs_elegiveis AS (
    SELECT m.id AS mov_id, m.data_transacao, ABS(m.valor) AS valor_abs,
      m.conta_pagar_id, cpr.descricao AS cpr_descricao,
      COALESCE(pc.nome_fantasia, pc.razao_social, cpr.fornecedor_cliente) AS parceiro_nome,
      REGEXP_REPLACE(COALESCE(pc.cnpj,''),'[^0-9]','','g') AS parceiro_cnpj
    FROM public.movimentacoes_bancarias m
    LEFT JOIN public.contas_pagar_receber cpr ON cpr.id = m.conta_pagar_id
    LEFT JOIN public.parceiros_comerciais pc ON pc.id = cpr.parceiro_id
    WHERE m.tipo='debito' AND m.pg_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.itau_pagamentos_stage ps2 WHERE ps2.movimentacao_id = m.id)
  ),
  ofx_elegiveis AS (
    SELECT id AS ofx_id, data_transacao, descricao, ABS(valor) AS valor_abs
    FROM public.ofx_transacoes_stage
    WHERE status='pendente' AND valor<0 AND conta_bancaria_id = p_conta_bancaria_id
  ),
  planilhas_lote AS (
    SELECT ps.id AS pl_id, ps.nome_favorecido, ps.cnpj_favorecido,
      REGEXP_REPLACE(COALESCE(ps.cnpj_favorecido,''),'[^0-9]','','g') AS pl_cnpj,
      ps.data_pagamento AS pl_data, ps.valor_pago AS pl_valor, ps.numero_lote
    FROM public.itau_pagamentos_stage ps
    WHERE ps.conta_bancaria_id = p_conta_bancaria_id
      AND ps.movimentacao_id IS NULL
      AND ps.status_conciliacao NOT IN ('ignorado','conciliado','conciliado_manual')
      AND ps.valor_pago IS NOT NULL AND ps.data_pagamento IS NOT NULL
      AND ps.numero_lote IN (SELECT numero_lote FROM lotes_verdadeiros)
  ),
  grupos AS (
    SELECT numero_lote, SUM(pl_valor) AS soma, COUNT(*) AS qtd
    FROM planilhas_lote GROUP BY numero_lote
  ),
  melhor_ofx_lote AS (
    SELECT DISTINCT ON (g.numero_lote) g.numero_lote, o.ofx_id,
      o.data_transacao AS ofx_data, o.descricao AS ofx_descricao, o.valor_abs AS ofx_valor
    FROM grupos g
    JOIN ofx_elegiveis o ON o.valor_abs = g.soma
    ORDER BY g.numero_lote, o.data_transacao DESC
  ),
  melhor_mov_lote AS (
    SELECT DISTINCT ON (pl.pl_id) pl.pl_id, pl.numero_lote, m.mov_id,
      m.data_transacao AS mov_data, m.valor_abs AS mov_valor,
      m.cpr_descricao, m.parceiro_nome, m.conta_pagar_id,
      CASE
        WHEN pl.pl_cnpj<>'' AND m.parceiro_cnpj=pl.pl_cnpj AND m.data_transacao=pl.pl_data AND m.valor_abs=pl.pl_valor THEN 1
        WHEN pl.pl_cnpj<>'' AND m.parceiro_cnpj=pl.pl_cnpj AND m.valor_abs=pl.pl_valor THEN 2
        WHEN m.data_transacao=pl.pl_data AND m.valor_abs=pl.pl_valor THEN 3
        ELSE 4
      END AS nivel
    FROM planilhas_lote pl
    JOIN movs_elegiveis m ON m.valor_abs = pl.pl_valor
    ORDER BY pl.pl_id,
      CASE
        WHEN pl.pl_cnpj<>'' AND m.parceiro_cnpj=pl.pl_cnpj AND m.data_transacao=pl.pl_data AND m.valor_abs=pl.pl_valor THEN 1
        WHEN pl.pl_cnpj<>'' AND m.parceiro_cnpj=pl.pl_cnpj AND m.valor_abs=pl.pl_valor THEN 2
        WHEN m.data_transacao=pl.pl_data AND m.valor_abs=pl.pl_valor THEN 3
        ELSE 4
      END ASC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'numero_lote',g.numero_lote,'soma',g.soma,'qtd_planilhas',g.qtd,
      'planilhas',(
        SELECT jsonb_agg(jsonb_build_object(
          'planilha_id',pl.pl_id,'nome_favorecido',pl.nome_favorecido,
          'cnpj_favorecido',pl.cnpj_favorecido,'valor_pago',pl.pl_valor,'data_pagamento',pl.pl_data,
          'mov_sugerida', CASE WHEN mml.mov_id IS NOT NULL THEN jsonb_build_object(
            'id',mml.mov_id,'nivel',mml.nivel,
            'nivel_descricao',CASE mml.nivel WHEN 1 THEN 'CNPJ + Data + Valor' WHEN 2 THEN 'CNPJ + Valor' WHEN 3 THEN 'Data + Valor' ELSE 'Apenas Valor' END,
            'descricao',mml.cpr_descricao,'parceiro_nome',mml.parceiro_nome,'conta_pagar_id',mml.conta_pagar_id
          ) ELSE NULL END
        ) ORDER BY pl.pl_data)
        FROM planilhas_lote pl
        LEFT JOIN melhor_mov_lote mml ON mml.pl_id=pl.pl_id
        WHERE pl.numero_lote=g.numero_lote
      ),
      'ofx_sugerido', CASE WHEN mol.ofx_id IS NOT NULL THEN jsonb_build_object(
        'id',mol.ofx_id,'descricao',mol.ofx_descricao,'valor',mol.ofx_valor,'data_transacao',mol.ofx_data
      ) ELSE NULL END,
      'tipo', CASE
        WHEN mol.ofx_id IS NOT NULL AND (
          SELECT COUNT(*) FROM melhor_mov_lote mml2
          JOIN planilhas_lote pl2 ON pl2.pl_id=mml2.pl_id
          WHERE pl2.numero_lote=g.numero_lote AND mml2.mov_id IS NOT NULL
        )=g.qtd THEN 'lote_completo'
        ELSE 'lote_parcial'
      END
    )
    ORDER BY CASE WHEN mol.ofx_id IS NOT NULL THEN 1 ELSE 2 END
  ), '[]'::jsonb) INTO v_lotes
  FROM grupos g
  LEFT JOIN melhor_ofx_lote mol ON mol.numero_lote=g.numero_lote;

  -- ─── SEÇÃO 4 (NOVA): OFX ÓRFÃO ──────────────────────────────────────────
  -- OFX pendente, débito, sem nenhuma planilha com valor compatível
  WITH ofx_orfao AS (
    SELECT o.id, o.data_transacao, o.descricao, ABS(o.valor) AS valor_abs
    FROM public.ofx_transacoes_stage o
    WHERE o.conta_bancaria_id = p_conta_bancaria_id
      AND o.status = 'pendente'
      AND o.valor < 0
      AND NOT EXISTS (
        SELECT 1 FROM public.itau_pagamentos_stage ps
        WHERE ps.conta_bancaria_id = p_conta_bancaria_id
          AND ps.status_conciliacao NOT IN ('ignorado','conciliado','conciliado_manual')
          AND ps.valor_pago = ABS(o.valor)
      )
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'ofx_id', o.id,
      'data_transacao', o.data_transacao,
      'descricao', o.descricao,
      'valor', o.valor_abs,
      'tipo', 'sem_planilha'
    )
    ORDER BY o.data_transacao DESC
  ), '[]'::jsonb) INTO v_ofx_orfao
  FROM ofx_orfao o;

  -- ─── RETURN final com 4 seções ───────────────────────────────────────────
  RETURN jsonb_build_object(
    'itens',          v_itens,
    'aguardando_ofx', v_aguardando,
    'lotes',          v_lotes,
    'ofx_orfao',      v_ofx_orfao
  );

END;
$function$;
CREATE OR REPLACE FUNCTION public.aprovar_cpr_em_cascata(p_cpr_id uuid, p_status_alvo text DEFAULT 'aprovado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_grupo_id UUID;
  v_parcelas_aprovadas INT;
  v_user_id UUID;
  v_agora TIMESTAMPTZ := now();
BEGIN
  -- Validar status alvo (Doutrina #95)
  IF p_status_alvo NOT IN ('aprovado', 'aguardando_pagamento', 'enviado_para_pagamento') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Status alvo inválido');
  END IF;

  v_user_id := auth.uid();

  SELECT parcela_grupo_id INTO v_grupo_id
  FROM public.contas_pagar_receber
  WHERE id = p_cpr_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'CPR não encontrada');
  END IF;

  IF v_grupo_id IS NOT NULL THEN
    -- Cascata: avança todas as parcelas em 'aberto' do mesmo grupo
    UPDATE public.contas_pagar_receber
    SET status = p_status_alvo,
        updated_at = v_agora,
        -- Carimbar aprovação se está virando aprovado OU enviado_para_pagamento
        aprovado_em = CASE
          WHEN p_status_alvo IN ('aprovado', 'enviado_para_pagamento')
               AND aprovado_em IS NULL THEN v_agora
          ELSE aprovado_em
        END,
        aprovado_por = CASE
          WHEN p_status_alvo IN ('aprovado', 'enviado_para_pagamento')
               AND aprovado_por IS NULL THEN v_user_id
          ELSE aprovado_por
        END,
        -- Carimbar envio se está virando enviado_para_pagamento — idempotente (C-61)
        enviado_pagamento_em = CASE
          WHEN p_status_alvo = 'enviado_para_pagamento'
               AND enviado_pagamento_em IS NULL THEN v_agora            -- ← C-61
          ELSE enviado_pagamento_em
        END,
        enviado_pagamento_por = CASE
          WHEN p_status_alvo = 'enviado_para_pagamento'
               AND enviado_pagamento_por IS NULL THEN v_user_id         -- ← C-61
          ELSE enviado_pagamento_por
        END
    WHERE parcela_grupo_id = v_grupo_id
      AND status = 'aberto';

    GET DIAGNOSTICS v_parcelas_aprovadas = ROW_COUNT;

  ELSE
    -- CPR avulsa: só essa
    UPDATE public.contas_pagar_receber
    SET status = p_status_alvo,
        updated_at = v_agora,
        aprovado_em = CASE
          WHEN p_status_alvo IN ('aprovado', 'enviado_para_pagamento')
               AND aprovado_em IS NULL THEN v_agora
          ELSE aprovado_em
        END,
        aprovado_por = CASE
          WHEN p_status_alvo IN ('aprovado', 'enviado_para_pagamento')
               AND aprovado_por IS NULL THEN v_user_id
          ELSE aprovado_por
        END,
        enviado_pagamento_em = CASE
          WHEN p_status_alvo = 'enviado_para_pagamento'
               AND enviado_pagamento_em IS NULL THEN v_agora            -- ← C-61
          ELSE enviado_pagamento_em
        END,
        enviado_pagamento_por = CASE
          WHEN p_status_alvo = 'enviado_para_pagamento'
               AND enviado_pagamento_por IS NULL THEN v_user_id         -- ← C-61
          ELSE enviado_pagamento_por
        END
    WHERE id = p_cpr_id
      AND status = 'aberto';

    GET DIAGNOSTICS v_parcelas_aprovadas = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'parcelas_aprovadas', v_parcelas_aprovadas,
    'status_alvo', p_status_alvo,
    'parcela_grupo_id', v_grupo_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.atualizar_conta_pagar_v2(p_id uuid, p_descricao text DEFAULT NULL::text, p_data_vencimento date DEFAULT NULL::date, p_conta_id uuid DEFAULT NULL::uuid, p_centro_custo text DEFAULT NULL::text, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_nf_numero text DEFAULT NULL::text, p_nf_serie text DEFAULT NULL::text, p_nf_chave_acesso text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status_atual text;
  v_user_id uuid;
BEGIN
  SELECT status INTO v_status_atual
  FROM contas_pagar_receber WHERE id = p_id;

  IF v_status_atual IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta não encontrada');
  END IF;

  IF v_status_atual IN ('paga', 'cancelado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Edição bloqueada: conta com status "' || v_status_atual || '" é read-only'
    );
  END IF;

  v_user_id := auth.uid();

  UPDATE contas_pagar_receber SET
    descricao           = COALESCE(p_descricao,        descricao),
    data_vencimento     = COALESCE(p_data_vencimento,  data_vencimento),
    plano_contas_id     = COALESCE(p_conta_id,         plano_contas_id),  -- era conta_id (§3.2)
    forma_pagamento_id  = COALESCE(p_forma_pagamento_id, forma_pagamento_id),
    observacao          = COALESCE(p_observacao,        observacao),
    nf_numero           = COALESCE(p_nf_numero,         nf_numero),
    nf_serie            = COALESCE(p_nf_serie,          nf_serie),
    nf_chave_acesso     = COALESCE(p_nf_chave_acesso,   nf_chave_acesso),
    editado_por         = v_user_id,
    editado_em          = now(),
    updated_at          = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'editado_em', now());
END;
$function$;
CREATE OR REPLACE FUNCTION public.atualizar_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.buscar_docs_pagamento(p_cpr_id uuid)
 RETURNS TABLE(tipo text, nome_arquivo text, storage_path text, bucket text, fonte text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(cpd.tipo, 'outro')::text AS tipo,
    COALESCE(cpd.nome_arquivo, 'documento')::text AS nome_arquivo,
    cpd.storage_path::text AS storage_path,
    COALESCE(
      (SELECT o.bucket_id::text FROM storage.objects o WHERE o.name = cpd.storage_path LIMIT 1),
      'financeiro-docs'
    ) AS bucket,
    'manual'::text AS fonte
  FROM contas_pagar_documentos cpd
  WHERE cpd.conta_pagar_id = p_cpr_id  -- H-02: era conta_id
    AND cpd.storage_path IS NOT NULL;

  RETURN QUERY
  SELECT
    'nf'::text AS tipo,
    COALESCE(sd.arquivo_nome, 'NF ' || COALESCE(ns.nf_numero, ns.id::text) || '.pdf')::text AS nome_arquivo,
    sd.storage_path::text AS storage_path,
    'nfs-stage'::text AS bucket,
    'nf_stage'::text AS fonte
  FROM nfs_stage ns
  JOIN nfs_stage_documentos sd ON sd.nfs_stage_id = ns.id
  WHERE ns.conta_pagar_id = p_cpr_id
    AND sd.storage_path IS NOT NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.buscar_nfs_stage_para_conta(p_conta_id uuid)
 RETURNS TABLE(nf_id uuid, nf_numero text, nf_chave_acesso text, fornecedor_razao_social text, fornecedor_cliente text, fornecedor_cnpj text, nf_data_emissao date, valor_total numeric, descricao text, categoria_id uuid, categoria_codigo text, categoria_nome text, score integer, motivos text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta RECORD;
  v_parceiro RECORD;
BEGIN
  SELECT
    cpr.id, cpr.valor, cpr.descricao, cpr.parceiro_id, cpr.fornecedor_cliente,
    cpr.data_compra, cpr.data_vencimento, cpr.nf_cnpj_emitente
  INTO v_conta
  FROM contas_pagar_receber cpr
  WHERE cpr.id = p_conta_id;

  IF v_conta.id IS NULL THEN RETURN; END IF;

  IF v_conta.parceiro_id IS NOT NULL THEN
    SELECT cnpj, razao_social, nome_fantasia INTO v_parceiro
    FROM parceiros_comerciais
    WHERE id = v_conta.parceiro_id;
  END IF;

  -- B-51 fix: nfs_stage.plano_contas_id (renomeada em §3.2);
  -- mantemos alias "categoria_id" no CTE pra preservar contrato externo
  RETURN QUERY
  WITH candidatos AS (
    SELECT
      nf.id,
      nf.nf_numero,
      nf.nf_chave_acesso,
      nf.fornecedor_razao_social,
      nf.fornecedor_cliente,
      nf.fornecedor_cnpj,
      nf.nf_data_emissao::date AS data_emissao,
      nf.valor AS valor_nf,
      nf.descricao,
      nf.plano_contas_id AS categoria_id,
      (CASE
        WHEN nf.valor IS NOT NULL AND v_conta.valor IS NOT NULL AND v_conta.valor > 0 THEN
          CASE
            WHEN nf.valor / v_conta.valor BETWEEN 1.99 AND 36.01
              AND ABS(ROUND(nf.valor / v_conta.valor) - (nf.valor / v_conta.valor)) <= 0.02
              AND ABS(nf.valor - (ROUND(nf.valor / v_conta.valor) * v_conta.valor)) <= 0.50
            THEN ROUND(nf.valor / v_conta.valor)::integer
            ELSE NULL
          END
        ELSE NULL
      END) AS num_parcelas_detectado,
      (CASE
        WHEN v_parceiro.cnpj IS NOT NULL
          AND nf.fornecedor_cnpj = regexp_replace(v_parceiro.cnpj, '[^\d]', '', 'g') THEN 50
        WHEN v_conta.nf_cnpj_emitente IS NOT NULL
          AND nf.fornecedor_cnpj = v_conta.nf_cnpj_emitente THEN 50
        ELSE 0
      END
      + CASE
        WHEN nf.valor IS NOT NULL AND v_conta.valor IS NOT NULL THEN
          CASE
            WHEN ABS(nf.valor - v_conta.valor) <= 0.01 THEN 30
            WHEN ABS(nf.valor - v_conta.valor) <= 5 THEN 15
            WHEN nf.valor / NULLIF(v_conta.valor, 0) BETWEEN 1.99 AND 36.01
              AND ABS(ROUND(nf.valor / NULLIF(v_conta.valor, 0)) - (nf.valor / NULLIF(v_conta.valor, 0))) <= 0.02
              AND ABS(nf.valor - (ROUND(nf.valor / NULLIF(v_conta.valor, 0)) * v_conta.valor)) <= 0.50
            THEN 25
            ELSE 0
          END
        ELSE 0
      END
      + CASE
        WHEN v_parceiro.razao_social IS NOT NULL
          AND nf.fornecedor_razao_social IS NOT NULL
          AND similarity(LOWER(v_parceiro.razao_social), LOWER(nf.fornecedor_razao_social)) >= 0.7
        THEN 20
        WHEN v_conta.fornecedor_cliente IS NOT NULL
          AND nf.fornecedor_razao_social IS NOT NULL
          AND similarity(LOWER(v_conta.fornecedor_cliente), LOWER(nf.fornecedor_razao_social)) >= 0.7
        THEN 20
        ELSE 0
      END
      + CASE
        WHEN v_parceiro.nome_fantasia IS NOT NULL
          AND nf.fornecedor_cliente IS NOT NULL
          AND similarity(LOWER(v_parceiro.nome_fantasia), LOWER(nf.fornecedor_cliente)) >= 0.6
        THEN 10
        ELSE 0
      END
      + CASE
        WHEN nf.nf_data_emissao IS NOT NULL THEN
          CASE
            WHEN ABS(nf.nf_data_emissao::date - COALESCE(v_conta.data_compra, v_conta.data_vencimento)) <= 7 THEN 10
            WHEN ABS(nf.nf_data_emissao::date - COALESCE(v_conta.data_compra, v_conta.data_vencimento)) <= 30 THEN 5
            ELSE 0
          END
        ELSE 0
      END)::integer AS sc,
      ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY[
        CASE WHEN v_parceiro.cnpj IS NOT NULL
          AND nf.fornecedor_cnpj = regexp_replace(v_parceiro.cnpj, '[^\d]', '', 'g')
          THEN 'CNPJ idêntico' END,
        CASE WHEN nf.valor IS NOT NULL AND v_conta.valor IS NOT NULL
          AND ABS(nf.valor - v_conta.valor) <= 0.01 THEN 'Valor exato' END,
        CASE WHEN nf.valor IS NOT NULL AND v_conta.valor IS NOT NULL
          AND ABS(nf.valor - v_conta.valor) > 0.01
          AND ABS(nf.valor - v_conta.valor) <= 5 THEN 'Valor próximo' END,
        CASE WHEN nf.valor IS NOT NULL AND v_conta.valor IS NOT NULL AND v_conta.valor > 0
          AND nf.valor / v_conta.valor BETWEEN 1.99 AND 36.01
          AND ABS(ROUND(nf.valor / v_conta.valor) - (nf.valor / v_conta.valor)) <= 0.02
          AND ABS(nf.valor - (ROUND(nf.valor / v_conta.valor) * v_conta.valor)) <= 0.50
          THEN 'Compatível com parcelamento (' || ROUND(nf.valor / v_conta.valor) || 'x)' END,
        CASE WHEN v_parceiro.razao_social IS NOT NULL
          AND nf.fornecedor_razao_social IS NOT NULL
          AND similarity(LOWER(v_parceiro.razao_social), LOWER(nf.fornecedor_razao_social)) >= 0.7
          THEN 'Razão social' END,
        CASE WHEN v_parceiro.nome_fantasia IS NOT NULL
          AND nf.fornecedor_cliente IS NOT NULL
          AND similarity(LOWER(v_parceiro.nome_fantasia), LOWER(nf.fornecedor_cliente)) >= 0.6
          THEN 'Nome fantasia' END,
        CASE WHEN nf.nf_data_emissao IS NOT NULL
          AND ABS(nf.nf_data_emissao::date - COALESCE(v_conta.data_compra, v_conta.data_vencimento)) <= 7
          THEN 'Data próxima' END
      ], NULL), ', ') AS mots
    FROM nfs_stage nf
    WHERE nf.status = 'nao_vinculada'
      AND nf.conta_pagar_id IS NULL
  )
  SELECT
    c.id, c.nf_numero, c.nf_chave_acesso, c.fornecedor_razao_social,
    c.fornecedor_cliente, c.fornecedor_cnpj, c.data_emissao, c.valor_nf,
    c.descricao, c.categoria_id, pc.codigo, pc.nome, c.sc, c.mots
  FROM candidatos c
  LEFT JOIN plano_contas pc ON pc.id = c.categoria_id
  WHERE c.sc >= 40
  ORDER BY c.sc DESC, c.data_emissao DESC NULLS LAST
  LIMIT 10;
END;
$function$;
CREATE OR REPLACE FUNCTION public.buscar_nfs_stage_v2(p_conta_id uuid)
 RETURNS TABLE(nf_id uuid, nf_numero text, fornecedor_razao_social text, fornecedor_cnpj text, valor_nf numeric, data_emissao date, score integer, motivos text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_valor numeric;
  v_conta_descricao text;
  v_conta_parceiro_id uuid;
  v_conta_data_compra date;
  v_conta_data_vencimento date;
  v_pcnpj text;
  v_descricao_limpa text;
  v_token text;
BEGIN
  -- Lê dados em VARIÁVEIS ESCALARES (evita bug RECORD em CTE)
  SELECT cpr.valor, cpr.descricao, cpr.parceiro_id, cpr.data_compra, cpr.data_vencimento
  INTO v_conta_valor, v_conta_descricao, v_conta_parceiro_id, v_conta_data_compra, v_conta_data_vencimento
  FROM contas_pagar_receber cpr
  WHERE cpr.id = p_conta_id;
  
  IF v_conta_valor IS NULL THEN RETURN; END IF;

  v_pcnpj := NULL;
  IF v_conta_parceiro_id IS NOT NULL THEN
    SELECT cnpj INTO v_pcnpj
    FROM parceiros_comerciais
    WHERE id = v_conta_parceiro_id;
  END IF;
  
  v_descricao_limpa := UPPER(v_conta_descricao);
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '^(PG |PPRO \*|MP\*|MLP\*)', '', 'i');
  IF v_descricao_limpa LIKE 'MERCADOLIVRE%*%' THEN
    v_descricao_limpa := SPLIT_PART(v_descricao_limpa, '*', 2);
  END IF;
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '\s*\d+/\d+|\(\d+/\d+\)|E\d+/\d+', '', 'g');
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '\s*(POMP|AV|CT|CTE|PAUL|MOR)[\-\s]*[A-Z]*$', '', 'g');
  v_descricao_limpa := TRIM(v_descricao_limpa);
  
  v_token := SPLIT_PART(v_descricao_limpa, ' ', 1);
  IF length(v_token) < 4 THEN v_token := v_descricao_limpa; END IF;

  RETURN QUERY
  SELECT 
    nf.id,
    nf.nf_numero,
    nf.fornecedor_razao_social,
    nf.fornecedor_cnpj,
    nf.valor,
    nf.nf_data_emissao::date,
    
    (
      GREATEST(
        ROUND(similarity(v_token, COALESCE(SPLIT_PART(UPPER(nf.fornecedor_razao_social), ' ', 1), '')) * 100),
        ROUND(similarity(v_token, COALESCE(UPPER(nf.fornecedor_cliente), '')) * 100),
        CASE WHEN length(v_token) >= 4 AND UPPER(nf.fornecedor_razao_social) LIKE '%' || v_token || '%' THEN 95 ELSE 0 END
      )::integer
      + CASE
          WHEN ABS(nf.valor - v_conta_valor) <= 0.01 THEN 30
          WHEN ABS(nf.valor - v_conta_valor) <= 5 THEN 15
          WHEN v_conta_valor > 0 AND nf.valor / v_conta_valor BETWEEN 1.99 AND 36.01
            AND ABS(ROUND(nf.valor / v_conta_valor) - (nf.valor / v_conta_valor)) <= 0.02
          THEN 25
          ELSE 0
        END
      + CASE
          WHEN nf.nf_data_emissao IS NOT NULL AND COALESCE(v_conta_data_compra, v_conta_data_vencimento) IS NOT NULL THEN
            CASE
              WHEN ABS(nf.nf_data_emissao::date - COALESCE(v_conta_data_compra, v_conta_data_vencimento)) <= 7 THEN 10
              WHEN ABS(nf.nf_data_emissao::date - COALESCE(v_conta_data_compra, v_conta_data_vencimento)) <= 30 THEN 5
              ELSE 0
            END
          ELSE 0
        END
      + CASE 
          WHEN v_pcnpj IS NOT NULL AND nf.fornecedor_cnpj = regexp_replace(v_pcnpj, '[^\d]', '', 'g')
          THEN 50
          ELSE 0
        END
    )::integer AS score_total,
    
    'tk=' || v_token || ' v=' || v_conta_valor::text AS motivos
    
  FROM nfs_stage nf
  WHERE nf.status = 'nao_vinculada'
    AND nf.conta_pagar_id IS NULL
    AND (
      similarity(v_token, COALESCE(SPLIT_PART(UPPER(nf.fornecedor_razao_social), ' ', 1), '')) >= 0.4
      OR similarity(v_token, COALESCE(UPPER(nf.fornecedor_cliente), '')) >= 0.4
      OR (length(v_token) >= 4 AND UPPER(nf.fornecedor_razao_social) LIKE '%' || v_token || '%')
    )
  ORDER BY score_total DESC NULLS LAST
  LIMIT 5;
END;
$function$;
CREATE OR REPLACE FUNCTION public.buscar_parceiro_por_cnpj_ou_nome(p_termo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_termo_limpo TEXT;
  v_cnpj_numeros TEXT;
  v_resultados jsonb;
BEGIN
  IF p_termo IS NULL OR length(trim(p_termo)) < 3 THEN
    RETURN '[]'::jsonb;
  END IF;

  v_termo_limpo := lower(trim(p_termo));
  v_cnpj_numeros := regexp_replace(p_termo, '[^0-9]', '', 'g');

  -- Busca por CNPJ (números) OU por razao_social/nome_fantasia
  SELECT COALESCE(jsonb_agg(linha ORDER BY prioridade DESC, razao_social), '[]'::jsonb)
  INTO v_resultados
  FROM (
    SELECT
      jsonb_build_object(
        'id', p.id,
        'razao_social', p.razao_social,
        'nome_fantasia', p.nome_fantasia,
        'cnpj', p.cnpj,
        'cpf', p.cpf,
        'tipo_pessoa', p.tipo_pessoa,
        'ativo', p.ativo,
        'cadastro_incompleto', p.cadastro_incompleto
      ) AS linha,
      p.razao_social,
      CASE
        -- Prioridade 3: match exato de CNPJ (números)
        WHEN length(v_cnpj_numeros) >= 11
             AND regexp_replace(COALESCE(p.cnpj, p.cpf, ''), '[^0-9]', '', 'g') = v_cnpj_numeros
          THEN 3
        -- Prioridade 2: razão social começa com o termo
        WHEN lower(p.razao_social) LIKE v_termo_limpo || '%' THEN 2
        -- Prioridade 1: contém o termo em razão social ou nome fantasia
        ELSE 1
      END AS prioridade
    FROM public.parceiros_comerciais p
    WHERE
      -- CNPJ ou CPF (números) contém o termo numérico
      (length(v_cnpj_numeros) >= 4 AND
        regexp_replace(COALESCE(p.cnpj, p.cpf, ''), '[^0-9]', '', 'g') LIKE '%' || v_cnpj_numeros || '%')
      OR
      -- Razão social ou nome fantasia contém o termo textual
      lower(p.razao_social) LIKE '%' || v_termo_limpo || '%'
      OR lower(COALESCE(p.nome_fantasia, '')) LIKE '%' || v_termo_limpo || '%'
    LIMIT 10
  ) sub;

  RETURN COALESCE(v_resultados, '[]'::jsonb);
END;
$function$;
CREATE OR REPLACE FUNCTION public.calcular_docs_status(p_conta_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta RECORD;
  v_tem_nf BOOLEAN := false;
  v_tem_comprovante BOOLEAN := false;
BEGIN
  SELECT cpr.nf_pdf_url, cpr.nf_xml_url, cpr.comprovante_url, cpr.docs_status, cpr.tipo
  INTO v_conta
  FROM contas_pagar_receber cpr
  WHERE cpr.id = p_conta_id;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_conta.docs_status = 'dispensado' THEN RETURN 'dispensado'; END IF;

  IF v_conta.nf_pdf_url IS NOT NULL OR v_conta.nf_xml_url IS NOT NULL THEN
    v_tem_nf := true;
  END IF;

  IF NOT v_tem_nf THEN
    SELECT EXISTS(
      SELECT 1 FROM contas_pagar_documentos
      WHERE conta_pagar_id = p_conta_id  -- H-02: era conta_id
        AND tipo IN ('nf', 'recibo', 'boleto')
    ) INTO v_tem_nf;
  END IF;

  IF v_conta.comprovante_url IS NOT NULL THEN
    v_tem_comprovante := true;
  END IF;

  IF NOT v_tem_comprovante THEN
    SELECT EXISTS(
      SELECT 1 FROM contas_pagar_documentos
      WHERE conta_pagar_id = p_conta_id  -- H-02: era conta_id
        AND tipo IN ('comprovante', 'ticket_cartao')
    ) INTO v_tem_comprovante;
  END IF;

  IF v_tem_nf AND v_tem_comprovante THEN RETURN 'ok';
  ELSIF v_tem_nf OR v_tem_comprovante THEN RETURN 'parcial';
  ELSE RETURN 'pendente';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_item_pedido(p_item_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_item RECORD;
  v_pedido RECORD;
  v_pedido_status_final pedido_compra_status_enum;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  IF NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas Comprador pode cancelar item (super_admin em V1)';
  END IF;
  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Motivo de cancelamento eh obrigatorio (minimo 3 caracteres)';
  END IF;
  
  SELECT * INTO v_item FROM public.pedidos_compra_itens WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item % nao encontrado', p_item_id; END IF;
  IF v_item.status != 'pendente' THEN
    RAISE EXCEPTION 'Item nao esta pendente (status: %)', v_item.status;
  END IF;
  
  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = v_item.pedido_id;
  IF v_pedido.status NOT IN ('em_compra', 'aberto') THEN
    RAISE EXCEPTION 'Pedido nao esta em estado que permite cancelar item (status: %)', v_pedido.status;
  END IF;
  
  UPDATE public.pedidos_compra_itens
     SET status = 'cancelado', cancelamento_motivo = TRIM(p_motivo)
   WHERE id = p_item_id;
  
  SELECT status INTO v_pedido_status_final FROM public.pedidos_compra WHERE id = v_item.pedido_id;
  
  PERFORM public.fn_log_evento_pedido(
    v_item.pedido_id, 'item_cancelado',
    jsonb_build_object(
      'item_id', p_item_id,
      'item_descricao', v_item.descricao,
      'motivo', TRIM(p_motivo)
    ),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'item_id', p_item_id, 'item_status', 'cancelado',
    'pedido_id', v_item.pedido_id, 'pedido_status', v_pedido_status_final
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_parcelas_futuras_recorrente(p_recorrente_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM contas_pagar_receber
  WHERE compromisso_recorrente_id = p_recorrente_id
    AND status = 'previsto'
    AND data_vencimento > CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_pedido(p_pedido_id uuid, p_motivo text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operador uuid;
  v_estagio_atual text;
BEGIN
  v_operador := auth.uid();

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento obrigatório (mínimo 5 caracteres)';
  END IF;

  SELECT estagio INTO v_estagio_atual FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  UPDATE public.pedidos
  SET
    estagio = 'cancelado',
    area_atual = 'nenhuma',
    proxima_acao = NULL,
    cancelado_em = now(),
    cancelado_motivo = p_motivo,
    cancelado_por = v_operador
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (
    pedido_id, tipo_evento, estagio_anterior, estagio_novo,
    descricao, operador_id, automatico
  ) VALUES (
    p_pedido_id, 'cancelado', v_estagio_atual, 'cancelado',
    p_motivo, v_operador, false
  );

  RETURN json_build_object('ok', true, 'pedido_id', p_pedido_id, 'estagio_anterior', v_estagio_atual);
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_pedido_inteiro_via_cpr(p_cpr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_grupo_id UUID;
  v_irmas_canceladas INT := 0;
  v_protegidas INT;
  v_cpr_id UUID;
BEGIN
  SELECT parcela_grupo_id INTO v_grupo_id
  FROM public.contas_pagar_receber
  WHERE id = p_cpr_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'CPR não encontrada');
  END IF;

  IF v_grupo_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'CPR não tem parcela_grupo_id — use cancelar_conta_pagar individualmente.'
    );
  END IF;

  SELECT COUNT(*) INTO v_protegidas
  FROM public.contas_pagar_receber
  WHERE parcela_grupo_id = v_grupo_id
    AND status IN ('paga', 'cancelado');

  FOR v_cpr_id IN
    SELECT id FROM public.contas_pagar_receber
    WHERE parcela_grupo_id = v_grupo_id
      AND status NOT IN ('paga', 'cancelado')
  LOOP
    PERFORM public.cancelar_conta_pagar(v_cpr_id);
    v_irmas_canceladas := v_irmas_canceladas + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'parcelas_canceladas', v_irmas_canceladas,
    'parcelas_protegidas', v_protegidas,
    'parcela_grupo_id', v_grupo_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.cancelar_pedido_pedido(p_pedido_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_pedido RECORD;
  v_compras_finalizadas INTEGER;
  v_itens_cancelados_qtde INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;

  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo de cancelamento eh obrigatorio (minimo 5 caracteres)';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id;
  END IF;

  IF v_pedido.solicitante_id != v_user_id AND NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissao para cancelar este pedido';
  END IF;

  IF v_pedido.status IN ('comprado', 'cancelado') THEN
    RAISE EXCEPTION 'Pedido em fase dura (%) nao pode ser cancelado', v_pedido.status;
  END IF;

  IF v_pedido.status = 'em_compra' AND NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Pedido em compra soh pode ser cancelado pelo Comprador (super_admin)';
  END IF;

  SELECT COUNT(*) INTO v_compras_finalizadas
    FROM public.compras_registradas
    WHERE pedido_id = p_pedido_id
      AND status = 'finalizada';

  IF v_compras_finalizadas > 0 THEN
    RAISE EXCEPTION 'Pedido tem % compra(s) registrada(s) finalizada(s). Exclua-as primeiro antes de cancelar o pedido.', v_compras_finalizadas;
  END IF;

  UPDATE public.pedidos_compra_itens
    SET status = 'cancelado',
        cancelamento_motivo = 'Pedido inteiro cancelado: ' || TRIM(p_motivo)
    WHERE pedido_id = p_pedido_id AND status = 'pendente';
  GET DIAGNOSTICS v_itens_cancelados_qtde = ROW_COUNT;

  UPDATE public.pedidos_compra
    SET status = 'cancelado',
        finalizado_em = now(),
        cancelado_em = now(),
        cancelado_por = v_user_id,
        cancelamento_motivo = TRIM(p_motivo)
    WHERE id = p_pedido_id;

  PERFORM public.fn_log_evento_pedido(
    p_pedido_id,
    'pedido_cancelado_total',
    jsonb_build_object(
      'motivo', TRIM(p_motivo),
      'itens_cancelados', v_itens_cancelados_qtde,
      'status_anterior', v_pedido.status
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'status', 'cancelado',
    'itens_cancelados', v_itens_cancelados_qtde,
    'cancelado_em', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.comentar_pedido(p_pedido_id uuid, p_conteudo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_pedido RECORD;
  v_comentario_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  
  IF p_conteudo IS NULL OR LENGTH(TRIM(p_conteudo)) = 0 THEN
    RAISE EXCEPTION 'Comentario nao pode estar vazio';
  END IF;
  IF LENGTH(p_conteudo) > 5000 THEN
    RAISE EXCEPTION 'Comentario excede 5000 caracteres';
  END IF;
  
  -- Verifica acesso ao pedido (autor precisa ser solicitante, comprador ou role autorizado)
  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = p_pedido_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id; END IF;
  
  IF v_pedido.solicitante_id != v_user_id
     AND v_pedido.comprador_id != v_user_id
     AND NOT has_role(v_user_id, 'super_admin'::app_role)
     AND NOT has_role(v_user_id, 'admin_rh'::app_role)
     AND NOT has_role(v_user_id, 'financeiro'::app_role) THEN
    RAISE EXCEPTION 'Sem permissao para comentar neste pedido';
  END IF;
  
  INSERT INTO public.comentarios_pedido (pedido_id, autor_id, conteudo)
  VALUES (p_pedido_id, v_user_id, TRIM(p_conteudo))
  RETURNING id INTO v_comentario_id;
  
  PERFORM public.fn_log_evento_pedido(
    p_pedido_id, 'comentario_adicionado',
    jsonb_build_object('comentario_id', v_comentario_id, 'preview', LEFT(TRIM(p_conteudo), 100)),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'comentario_id', v_comentario_id,
    'pedido_id', p_pedido_id,
    'autor_id', v_user_id,
    'created_at', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_em_lote_ofx(p_movimentacao_id uuid, p_conta_ids uuid[], p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, contas_conciliadas integer, valor_total numeric, erro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
  v_soma_contas NUMERIC;
  v_qtd_contas INTEGER;
  v_now TIMESTAMPTZ := now();
  v_conta_id UUID;
BEGIN
  -- Valida movimentação (precisa do valor E da data)
  SELECT id, valor, data_transacao
    INTO v_mov
    FROM movimentacoes_bancarias
   WHERE id = p_movimentacao_id;

  IF NOT FOUND THEN
    ok := false;
    erro := 'Movimentação não encontrada';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Valida e soma contas a pagar elegíveis
  SELECT COALESCE(SUM(valor), 0), COUNT(*)
    INTO v_soma_contas, v_qtd_contas
    FROM contas_pagar_receber
   WHERE id = ANY(p_conta_ids)
     AND tipo = 'pagar'
     AND movimentacao_bancaria_id IS NULL
     AND deleted_at IS NULL;

  IF v_qtd_contas = 0 THEN
    ok := false;
    erro := 'Nenhuma conta válida selecionada';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Tolerância de 1 centavo (arredondamento decimal)
  IF ABS(v_soma_contas - ABS(v_mov.valor)) > 0.01 THEN
    ok := false;
    erro := format(
      'Soma das contas (%s) não bate com valor da movimentação (%s)',
      v_soma_contas,
      ABS(v_mov.valor)
    );
    RETURN NEXT;
    RETURN;
  END IF;

  -- Marca movimentação como conciliada
  UPDATE movimentacoes_bancarias
     SET conciliado = true,
         conciliado_em = v_now,
         conciliado_por = p_user_id
   WHERE id = p_movimentacao_id;

  -- Vincula todas as contas + ALINHA comportamento com 1-pra-1:
  --   - status = 'paga'
  --   - data_pagamento = data da movimentação (se ainda não preenchida)
  --   - conciliado_em / conciliado_por
  UPDATE contas_pagar_receber
     SET movimentacao_bancaria_id = p_movimentacao_id,
         status = 'paga',
         data_pagamento = COALESCE(data_pagamento, v_mov.data_transacao::date),
         conciliado_em = v_now,
         conciliado_por = p_user_id,
         updated_at = v_now
   WHERE id = ANY(p_conta_ids)
     AND tipo = 'pagar'
     AND movimentacao_bancaria_id IS NULL
     AND deleted_at IS NULL;

  -- Recalcula status de fatura pra cada conta (caso seja de cartão)
  FOREACH v_conta_id IN ARRAY p_conta_ids
  LOOP
    PERFORM public.recalcular_status_fatura(v_conta_id);
  END LOOP;

  ok := true;
  contas_conciliadas := v_qtd_contas;
  valor_total := v_soma_contas;
  erro := NULL;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_lancamento(p_lancamento_id uuid, p_conta_pagar_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lancamento RECORD;
  v_conta RECORD;
  v_valor_antigo NUMERIC;
  v_movimentacao_atualizada BOOLEAN := false;
BEGIN
  SELECT * INTO v_lancamento FROM fatura_cartao_lancamentos WHERE id = p_lancamento_id;
  IF v_lancamento.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado');
  END IF;

  SELECT * INTO v_conta FROM contas_pagar_receber WHERE id = p_conta_pagar_id;
  IF v_conta.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta a pagar não encontrada');
  END IF;

  v_valor_antigo := v_conta.valor;

  -- 1) Sobrepõe valor da conta a pagar (fatura é a verdade do banco)
  UPDATE contas_pagar_receber
  SET valor = v_lancamento.valor,
      updated_at = now()
  WHERE id = p_conta_pagar_id;

  -- 2) Se conta já tem movimentação vinculada, atualiza valor lá também
  IF v_conta.movimentacao_bancaria_id IS NOT NULL THEN
    UPDATE movimentacoes_bancarias
    SET valor = v_lancamento.valor
    WHERE id = v_conta.movimentacao_bancaria_id;
    v_movimentacao_atualizada := true;
  END IF;

  -- 3) Vincula lançamento à conta
  UPDATE fatura_cartao_lancamentos
  SET status = 'conciliado',
      conta_pagar_id = p_conta_pagar_id,
      updated_at = now()
  WHERE id = p_lancamento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'lancamento_id', p_lancamento_id,
    'conta_pagar_id', p_conta_pagar_id,
    'conta_descricao', v_conta.descricao,
    'valor_antigo', v_valor_antigo,
    'valor_novo', v_lancamento.valor,
    'valor_alterado', (v_valor_antigo IS DISTINCT FROM v_lancamento.valor),
    'movimentacao_atualizada', v_movimentacao_atualizada
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_movimentacao_com_ofx(p_mov_id uuid, p_ofx_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE movimentacoes_bancarias SET
    conciliado        = true,
    conciliado_em     = now(),
    conciliado_por    = p_user_id,
    ofx_transacao_id  = p_ofx_id
  WHERE id = p_mov_id;

  UPDATE ofx_transacoes_stage SET
    status = 'conciliado'
  WHERE id = p_ofx_id;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_multiplas_contas_a_ofx(p_ofx_id uuid, p_contas_pagar_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx RECORD;
  v_movimentacao_id UUID;
  v_user_id UUID;
  v_soma_contas NUMERIC;
  v_valor_ofx_abs NUMERIC;
  v_qtd_contas INTEGER;
  v_conta_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_ofx FROM ofx_transacoes_stage WHERE id = p_ofx_id;
  IF v_ofx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX não encontrada');
  END IF;
  IF v_ofx.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX já processada');
  END IF;

  v_qtd_contas := array_length(p_contas_pagar_ids, 1);
  IF v_qtd_contas IS NULL OR v_qtd_contas = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhuma conta selecionada');
  END IF;

  SELECT SUM(valor) INTO v_soma_contas
  FROM contas_pagar_receber
  WHERE id = ANY(p_contas_pagar_ids)
    AND status IN ('aprovado', 'aguardando_pagamento')
    AND movimentacao_bancaria_id IS NULL;

  IF v_soma_contas IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhuma conta válida (todas já conciliadas?)');
  END IF;

  IF (
    SELECT COUNT(*) FROM contas_pagar_receber
    WHERE id = ANY(p_contas_pagar_ids)
      AND status IN ('aprovado', 'aguardando_pagamento')
      AND movimentacao_bancaria_id IS NULL
  ) <> v_qtd_contas THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Alguma conta selecionada não está mais disponível');
  END IF;

  v_valor_ofx_abs := ABS(v_ofx.valor);
  IF v_soma_contas <> v_valor_ofx_abs THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', format(
        'Soma não bate. OFX: R$ %s. Selecionadas: R$ %s. Diferença: R$ %s',
        v_valor_ofx_abs, v_soma_contas, v_soma_contas - v_valor_ofx_abs
      )
    );
  END IF;

  INSERT INTO movimentacoes_bancarias (
    conta_bancaria_id, data_transacao, valor, descricao, tipo,
    id_transacao_banco, hash_unico, saldo_pos_transacao,
    origem, conciliado, conciliado_em, conciliado_por
  ) VALUES (
    v_ofx.conta_bancaria_id, v_ofx.data_transacao, v_ofx.valor, v_ofx.descricao,
    public.normalizar_tipo_movimentacao(v_ofx.tipo, v_ofx.valor),
    v_ofx.id_transacao_banco, v_ofx.hash_unico, v_ofx.saldo_pos_transacao,
    'ofx', true, now(), v_user_id
  ) RETURNING id INTO v_movimentacao_id;

  FOREACH v_conta_id IN ARRAY p_contas_pagar_ids LOOP
    INSERT INTO movimentacao_conta_pagar_link (
      movimentacao_bancaria_id, conta_pagar_id, valor_alocado, created_by
    )
    SELECT v_movimentacao_id, v_conta_id, valor, v_user_id
    FROM contas_pagar_receber WHERE id = v_conta_id;

    UPDATE contas_pagar_receber
    SET
      movimentacao_bancaria_id = v_movimentacao_id,
      data_pagamento = COALESCE(data_pagamento, v_ofx.data_transacao),
      status = 'paga',
      conciliado_em = now(),
      conciliado_por = v_user_id,
      updated_at = now()
    WHERE id = v_conta_id;

    -- 🆕 Recalcula status da fatura por cada conta (uma OU mais podem ter fatura)
    PERFORM public.recalcular_status_fatura(v_conta_id);
  END LOOP;

  UPDATE ofx_transacoes_stage SET status = 'persistida' WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimentacao_id', v_movimentacao_id,
    'qtd_contas_conciliadas', v_qtd_contas,
    'valor_total', v_valor_ofx_abs,
    'novo_status', 'paga'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_semov_com_ofx(p_planilha_id uuid, p_ofx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pl_mov_atual   UUID;
  v_pl_valor       NUMERIC;
  v_pl_data        DATE;
  v_ofx_status     TEXT;
  v_ofx_conta_id   UUID;
  v_ofx_data       DATE;
  v_ofx_valor      NUMERIC;
  v_ofx_descricao  TEXT;
  v_nova_mov_id    UUID;
BEGIN
  SELECT movimentacao_id, valor_pago, data_pagamento
  INTO   v_pl_mov_atual, v_pl_valor, v_pl_data
  FROM   public.itau_pagamentos_stage
  WHERE  id = p_planilha_id;

  IF v_pl_mov_atual IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Planilha já vinculada');
  END IF;

  SELECT status, conta_bancaria_id, data_transacao, ABS(valor), descricao
  INTO   v_ofx_status, v_ofx_conta_id, v_ofx_data, v_ofx_valor, v_ofx_descricao
  FROM   public.ofx_transacoes_stage
  WHERE  id = p_ofx_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não encontrado');
  END IF;

  IF v_ofx_status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente');
  END IF;

  INSERT INTO public.movimentacoes_bancarias (
    conta_bancaria_id, descricao, valor, data_transacao, tipo,
    ofx_transacao_id, itau_planilha_id,
    pg_em, conciliado, conciliado_em, origem
  ) VALUES (
    v_ofx_conta_id, v_ofx_descricao, -v_ofx_valor, v_ofx_data, 'debito',
    p_ofx_id, p_planilha_id, v_ofx_data, true, NOW(), 'ofx'
  )
  RETURNING id INTO v_nova_mov_id;

  UPDATE public.itau_pagamentos_stage
  SET movimentacao_id = v_nova_mov_id,
      ofx_transacao_id = p_ofx_id,
      status_conciliacao = 'conciliado'
  WHERE id = p_planilha_id;

  UPDATE public.ofx_transacoes_stage
  SET status = 'conciliado'
  WHERE id = p_ofx_id;

  RETURN jsonb_build_object('ok', true, 'movimentacao_id', v_nova_mov_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_semov_fatura(p_planilha_id uuid, p_fatura_id uuid, p_ofx_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado  jsonb;
  v_ofx_status text;
BEGIN
  -- 1. Vincular planilha → fatura (RPC existente faz todas as validações)
  v_resultado := public.vincular_planilha_fatura(p_planilha_id, p_fatura_id);

  IF NOT (v_resultado->>'ok')::boolean THEN
    RETURN v_resultado;
  END IF;

  -- 2. Linkar OFX se fornecido
  IF p_ofx_id IS NOT NULL THEN
    SELECT status INTO v_ofx_status
    FROM public.ofx_transacoes_stage
    WHERE id = p_ofx_id;

    IF v_ofx_status = 'pendente' THEN
      UPDATE public.itau_pagamentos_stage
      SET ofx_transacao_id = p_ofx_id
      WHERE id = p_planilha_id;

      UPDATE public.ofx_transacoes_stage
      SET status = 'conciliado'
      WHERE id = p_ofx_id;
    END IF;
  END IF;

  RETURN v_resultado || jsonb_build_object('ofx_vinculado', p_ofx_id IS NOT NULL);
END;
$function$;
CREATE OR REPLACE FUNCTION public.conciliar_transacao_ofx(p_ofx_id uuid, p_conta_pagar_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx RECORD;
  v_conta RECORD;
  v_movimentacao_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_ofx FROM ofx_transacoes_stage WHERE id = p_ofx_id;
  IF v_ofx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX não encontrada');
  END IF;
  IF v_ofx.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX já processada (status: ' || v_ofx.status || ')');
  END IF;

  SELECT * INTO v_conta FROM contas_pagar_receber WHERE id = p_conta_pagar_id;
  IF v_conta.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta a pagar não encontrada');
  END IF;
  IF v_conta.movimentacao_bancaria_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta já tem movimentação vinculada');
  END IF;

  INSERT INTO movimentacoes_bancarias (
    conta_bancaria_id, data_transacao, valor, descricao, tipo,
    id_transacao_banco, hash_unico, saldo_pos_transacao,
    origem, conta_pagar_id,
    conciliado, conciliado_em, conciliado_por
  ) VALUES (
    v_ofx.conta_bancaria_id, v_ofx.data_transacao, v_ofx.valor, v_ofx.descricao,
    public.normalizar_tipo_movimentacao(v_ofx.tipo, v_ofx.valor),
    v_ofx.id_transacao_banco, v_ofx.hash_unico, v_ofx.saldo_pos_transacao,
    'ofx', p_conta_pagar_id,
    true, now(), v_user_id
  ) RETURNING id INTO v_movimentacao_id;

  UPDATE contas_pagar_receber
  SET
    movimentacao_bancaria_id = v_movimentacao_id,
    data_pagamento = COALESCE(data_pagamento, v_ofx.data_transacao),
    status = 'paga',
    conciliado_em = now(),
    conciliado_por = v_user_id,
    updated_at = now()
  WHERE id = p_conta_pagar_id;

  -- 🆕 Recalcula status da fatura (se a conta estiver vinculada a uma)
  PERFORM public.recalcular_status_fatura(p_conta_pagar_id);

  UPDATE ofx_transacoes_stage SET status = 'persistida' WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimentacao_id', v_movimentacao_id,
    'conta_descricao', v_conta.descricao,
    'valor', v_ofx.valor,
    'novo_status', 'paga'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.confirmar_itau_lote_auto(p_importacao_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pag        RECORD;
  v_resultado  JSON;
  v_confirmados INTEGER := 0;
  v_erros       INTEGER := 0;
BEGIN
  FOR v_pag IN
    SELECT * FROM itau_pagamentos_stage
    WHERE importacao_id = p_importacao_id
      AND status_conciliacao = 'conciliado_auto'
      AND conta_pagar_id IS NOT NULL
      AND movimentacao_id IS NULL
  LOOP
    SELECT gerar_movimentacao_de_conta(v_pag.conta_pagar_id) INTO v_resultado;

    IF (v_resultado->>'ok')::boolean THEN
      UPDATE itau_pagamentos_stage SET
        movimentacao_id = (
          SELECT id FROM movimentacoes_bancarias
          WHERE conta_pagar_id = v_pag.conta_pagar_id
          ORDER BY created_at DESC LIMIT 1
        ),
        status_conciliacao = 'conciliado_manual'
      WHERE id = v_pag.id;
      v_confirmados := v_confirmados + 1;
    ELSE
      v_erros := v_erros + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true, 'confirmados', v_confirmados, 'erros', v_erros);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.confirmar_itau_pagamento_unitario(p_pagamento_id uuid, p_conta_pagar_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE v_resultado JSON;
BEGIN
  UPDATE itau_pagamentos_stage SET conta_pagar_id = p_conta_pagar_id WHERE id = p_pagamento_id;

  SELECT gerar_movimentacao_de_conta(p_conta_pagar_id) INTO v_resultado;
  IF NOT (v_resultado->>'ok')::boolean THEN RETURN v_resultado; END IF;

  UPDATE itau_pagamentos_stage SET
    movimentacao_id = (
      SELECT id FROM movimentacoes_bancarias
      WHERE conta_pagar_id = p_conta_pagar_id
      ORDER BY created_at DESC LIMIT 1
    ),
    status_conciliacao = 'conciliado_manual'
  WHERE id = p_pagamento_id;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.confirmar_pre_aprovacao(p_analise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_analise record;
  v_operador uuid;
BEGIN
  v_operador := auth.uid();

  SELECT id, pedido_id, parceiro_id, status_final, pre_aprovado_regra_id,
         pre_aprovacao_payload, perfil_aplicado
  INTO v_analise
  FROM analises_credito WHERE id = p_analise_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Análise % não encontrada', p_analise_id USING ERRCODE = '02000';
  END IF;

  IF v_analise.status_final IS NOT NULL THEN
    RAISE EXCEPTION 'Análise já decidida (status: %)', v_analise.status_final
      USING ERRCODE = '22023';
  END IF;

  IF v_analise.pre_aprovado_regra_id IS NULL THEN
    RAISE EXCEPTION 'Análise não tem pré-aprovação automática pra confirmar'
      USING ERRCODE = '22023';
  END IF;

  -- Aplica decisão usando payload
  UPDATE analises_credito
  SET status_final = 'aprovado',
      decidido_por = v_operador,
      decidido_em = now(),
      estagio_atual = 'decisao',
      parecer_final = COALESCE(
        v_analise.pre_aprovacao_payload ->> 'parecer_sugerido',
        'Pré-aprovação confirmada'
      ),
      condicao_final_aprovada = v_analise.pre_aprovacao_payload -> 'condicao_sugerida'
  WHERE id = p_analise_id;

  -- Avança pedido pra credito_aprovado (cadeia Cobrança Fase 1 dispara o resto)
  PERFORM public.transicionar_pedido(
    v_analise.pedido_id,
    'credito_aprovado',
    'Crédito aprovado — partir pra cobrança',
    'Confirmação 1-clique de pré-aprovação automática'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'analise_id', p_analise_id,
    'pedido_id', v_analise.pedido_id,
    'regra_id', v_analise.pre_aprovado_regra_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.contar_boletos_pendentes_mesmo_parceiro(p_boleto_stage_id_referencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parceiro_id uuid;
  v_parceiro_nome text;
  v_qtd INTEGER;
  v_ids uuid[];
BEGIN
  SELECT b.parceiro_id, p.razao_social
  INTO v_parceiro_id, v_parceiro_nome
  FROM public.boleto_stage b
  LEFT JOIN public.parceiros_comerciais p ON p.id = b.parceiro_id
  WHERE b.id = p_boleto_stage_id_referencia;

  IF v_parceiro_id IS NULL THEN
    RETURN jsonb_build_object('qtd', 0, 'ids', '[]'::jsonb);
  END IF;

  SELECT array_agg(id ORDER BY vencimento), COUNT(*)
  INTO v_ids, v_qtd
  FROM public.boleto_stage
  WHERE parceiro_id = v_parceiro_id
    AND status = 'aguardando_ancoragem'
    AND id <> p_boleto_stage_id_referencia;

  RETURN jsonb_build_object(
    'qtd', COALESCE(v_qtd, 0),
    'ids', to_jsonb(COALESCE(v_ids, ARRAY[]::uuid[])),
    'parceiro_nome', v_parceiro_nome
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.contar_pendentes_mesmo_cnpj(p_ged_documento_id_referencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_ref TEXT;
  v_razao TEXT;
  v_qtd INTEGER;
BEGIN
  SELECT
    regexp_replace(COALESCE(classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g'),
    classificacao_ia->>'parceiro_razao_social'
  INTO v_cnpj_ref, v_razao
  FROM public.ged_documentos
  WHERE id = p_ged_documento_id_referencia;

  IF length(COALESCE(v_cnpj_ref, '')) < 11 THEN
    RETURN jsonb_build_object('qtd', 0);
  END IF;

  SELECT COUNT(*)
  INTO v_qtd
  FROM public.ged_documentos
  WHERE parceiro_resolucao_pendente = true
    AND id <> p_ged_documento_id_referencia
    AND regexp_replace(COALESCE(classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g') = v_cnpj_ref;

  RETURN jsonb_build_object(
    'qtd', v_qtd,
    'cnpj', v_cnpj_ref,
    'razao_social', v_razao
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.contas_para_match_ofx()
 RETURNS TABLE(id uuid, valor numeric, data_vencimento date, data_pagamento date, fornecedor_cliente text, parceiro_id uuid, parceiro_razao_social text, parceiro_cnpj text, nf_numero text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cpr.id,
    cpr.valor,
    cpr.data_vencimento,
    cpr.data_pagamento,
    cpr.fornecedor_cliente,
    cpr.parceiro_id,
    pc.razao_social,
    pc.cnpj,
    cpr.nf_numero,
    cpr.status
  FROM contas_pagar_receber cpr
  LEFT JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
  LEFT JOIN meios_pagamento mp      ON mp.id = cpr.meio_pagamento_id
  WHERE cpr.tipo = 'pagar'
    AND cpr.status IN ('finalizado', 'doc_pendente', 'aberto', 'aprovado')
    AND cpr.movimentacao_bancaria_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM faturas_cartao fc WHERE fc.conta_pagar_id = cpr.id
    )
    AND COALESCE(mp.codigo, '') <> 'fatura_cartao';
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_cpr_de_boleto(p_boleto_stage_id uuid, p_categoria_id uuid, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_descricao_extra text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_boleto RECORD;
  v_nova_cpr_id UUID;
  v_descricao TEXT;
  v_meio_pagamento_default UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_categoria_id IS NULL THEN
    RAISE EXCEPTION 'Categoria é obrigatória' USING ERRCODE = '22023';
  END IF;

  IF p_forma_pagamento_id IS NULL THEN
    RAISE EXCEPTION 'Forma de pagamento é obrigatória' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.plano_contas WHERE parent_id = p_categoria_id) THEN
    RAISE EXCEPTION 'Categoria é cabeçalho. Apenas categorias folha aceitam lançamentos (Doutrina #07.6).'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plano_contas WHERE id = p_categoria_id) THEN
    RAISE EXCEPTION 'Categoria % não encontrada', p_categoria_id USING ERRCODE = '02000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.formas_pagamento WHERE id = p_forma_pagamento_id) THEN
    RAISE EXCEPTION 'Forma de pagamento % não encontrada', p_forma_pagamento_id USING ERRCODE = '02000';
  END IF;

  SELECT b.*, g.nome AS ged_nome
  INTO v_boleto
  FROM public.boleto_stage b
  JOIN public.ged_documentos g ON g.id = b.ged_documento_id
  WHERE b.id = p_boleto_stage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'boleto_stage % não encontrado', p_boleto_stage_id USING ERRCODE = '02000';
  END IF;

  IF v_boleto.status <> 'aguardando_ancoragem' THEN
    RAISE EXCEPTION 'Boleto não está aguardando ancoragem (status: %)', v_boleto.status
      USING ERRCODE = '22023';
  END IF;

  IF v_boleto.valor IS NULL OR v_boleto.vencimento IS NULL THEN
    RAISE EXCEPTION 'Boleto sem valor ou vencimento' USING ERRCODE = '22023';
  END IF;

  IF v_boleto.parceiro_id IS NULL THEN
    RAISE EXCEPTION 'Boleto sem parceiro vinculado (Doutrina #118)' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_meio_pagamento_default
  FROM public.meios_pagamento
  WHERE ativo = true
  ORDER BY ordem NULLS LAST, nome
  LIMIT 1;

  IF v_meio_pagamento_default IS NULL THEN
    RAISE EXCEPTION 'Nenhum meio_pagamento ativo cadastrado' USING ERRCODE = '22023';
  END IF;

  v_descricao := COALESCE(
    NULLIF(trim(p_descricao_extra), ''),
    v_boleto.ged_nome,
    CONCAT('Boleto ', COALESCE(v_boleto.beneficiario_nome, 'sem beneficiário'))
  );

  -- B-51 fix: plano_contas_id (renomeada de conta_id em §3.2 - 18/05/2026)
  INSERT INTO public.contas_pagar_receber (
    tipo,
    status,
    origem,
    descricao,
    valor,
    data_vencimento,
    parceiro_id,
    pasta_contrato_id,
    plano_contas_id,
    forma_pagamento_id,
    meio_pagamento_id,
    criado_por
  ) VALUES (
    'pagar',
    'aberto',
    'boleto_stage',
    v_descricao,
    v_boleto.valor,
    v_boleto.vencimento,
    v_boleto.parceiro_id,
    v_boleto.pasta_contrato_id,
    p_categoria_id,
    p_forma_pagamento_id,
    v_meio_pagamento_default,
    v_user_id
  ) RETURNING id INTO v_nova_cpr_id;

  UPDATE public.boleto_stage
  SET contas_pagar_receber_id = v_nova_cpr_id,
      status = 'cpr_nova_criada',
      ancorado_em = now(),
      ancorado_por = v_user_id
  WHERE id = p_boleto_stage_id;

  INSERT INTO public.ged_documento_vinculos
    (documento_id, entidade_tipo, entidade_id, observacao, criado_por)
  VALUES
    (v_boleto.ged_documento_id, 'cpr', v_nova_cpr_id, 'CPR criada via boleto_stage', v_user_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'boleto_stage_id', p_boleto_stage_id,
    'cpr_id', v_nova_cpr_id,
    'valor', v_boleto.valor,
    'vencimento', v_boleto.vencimento,
    'descricao', v_descricao
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_cpr_de_boleto_em_lote(p_boleto_stage_ids uuid[], p_categoria_id uuid, p_forma_pagamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boleto_id uuid;
  v_resultado jsonb;
  v_cpr_id uuid;
  v_qtd_sucesso INTEGER := 0;
  v_qtd_falha INTEGER := 0;
  v_falhas jsonb := '[]'::jsonb;
  v_cpr_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF array_length(p_boleto_stage_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Array de boleto_stage_ids vazio' USING ERRCODE = '22023';
  END IF;

  IF p_categoria_id IS NULL OR p_forma_pagamento_id IS NULL THEN
    RAISE EXCEPTION 'Categoria e forma de pagamento são obrigatórias' USING ERRCODE = '22023';
  END IF;

  -- Itera reusando criar_cpr_de_boleto (toda a validação já está lá).
  -- O EXCEPTION WHEN OTHERS aqui é o uso LEGÍTIMO documentado na Doutrina #108:
  -- wrapper de lote isolando falha por item — sem ele, 1 boleto problemático
  -- abortaria a transação inteira e cancelaria os 5 que iam funcionar.
  -- Cada falha é capturada COM contexto completo (SQLERRM + boleto_id) e
  -- retornada ao operador, não engolida silenciosamente.
  FOREACH v_boleto_id IN ARRAY p_boleto_stage_ids LOOP
    BEGIN
      v_resultado := public.criar_cpr_de_boleto(
        v_boleto_id, p_categoria_id, p_forma_pagamento_id, NULL
      );
      v_cpr_id := (v_resultado->>'cpr_id')::uuid;
      v_cpr_ids := array_append(v_cpr_ids, v_cpr_id);
      v_qtd_sucesso := v_qtd_sucesso + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_qtd_falha := v_qtd_falha + 1;
        v_falhas := v_falhas || jsonb_build_object(
          'boleto_stage_id', v_boleto_id,
          'sqlstate', SQLSTATE,
          'erro', SQLERRM
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_qtd_falha = 0,
    'qtd_sucesso', v_qtd_sucesso,
    'qtd_falha', v_qtd_falha,
    'qtd_total', v_qtd_sucesso + v_qtd_falha,
    'cpr_ids', to_jsonb(v_cpr_ids),
    'falhas', v_falhas
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_despesa_agrupada(p_lancamento_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc_principal RECORD;
  v_fatura RECORD;
  v_user_id UUID;
  v_forma_pgto_id UUID;
  v_meio_pgto_id UUID;
  v_data_venc_base DATE;
  v_data_compra_min DATE;
  v_valor_total NUMERIC;
  v_descricao TEXT;
  v_qtd_lancs INTEGER;
  v_nova_conta_id UUID;
  v_lancamentos_descritivo TEXT;
BEGIN
  IF p_lancamento_ids IS NULL OR array_length(p_lancamento_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhum lancamento informado');
  END IF;

  IF array_length(p_lancamento_ids, 1) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Agrupamento requer ao menos 2 lancamentos');
  END IF;

  IF EXISTS (
    SELECT 1 FROM fatura_cartao_lancamentos
    WHERE id = ANY(p_lancamento_ids) AND conta_pagar_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Um ou mais lancamentos ja tem conta a pagar vinculada');
  END IF;

  IF (SELECT COUNT(DISTINCT fatura_id) FROM fatura_cartao_lancamentos
      WHERE id = ANY(p_lancamento_ids)) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lancamentos devem ser da mesma fatura');
  END IF;

  SELECT * INTO v_lanc_principal
  FROM fatura_cartao_lancamentos
  WHERE id = ANY(p_lancamento_ids)
  ORDER BY ABS(valor) DESC
  LIMIT 1;

  IF v_lanc_principal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lancamentos nao encontrados');
  END IF;

  SELECT SUM(valor), COUNT(*), MIN(data_compra)
  INTO v_valor_total, v_qtd_lancs, v_data_compra_min
  FROM fatura_cartao_lancamentos
  WHERE id = ANY(p_lancamento_ids);

  IF v_valor_total IS NULL OR v_valor_total = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro',
      'Valor agregado e zero - nao ha despesa real');
  END IF;

  SELECT string_agg(
    descricao || ' (' || to_char(valor, 'FM999G999G990D00') || ')',
    E'\n • '
    ORDER BY ABS(valor) DESC
  )
  INTO v_lancamentos_descritivo
  FROM fatura_cartao_lancamentos
  WHERE id = ANY(p_lancamento_ids);

  SELECT * INTO v_fatura FROM faturas_cartao WHERE id = v_lanc_principal.fatura_id;

  v_user_id := auth.uid();
  v_data_venc_base := COALESCE(v_fatura.data_vencimento, v_lanc_principal.data_compra);

  SELECT id INTO v_forma_pgto_id
  FROM formas_pagamento
  WHERE LOWER(nome) ~ '(cart.{0,3}o.*cr.{0,4}dit|crédit)'
  LIMIT 1;

  SELECT id INTO v_meio_pgto_id
  FROM meios_pagamento WHERE codigo = 'fatura_cartao' LIMIT 1;

  v_descricao := v_lanc_principal.descricao;

  -- B-51 fix: plano_contas_id (renomeada em §3.2 - 18/05/2026)
  -- Valor vem de v_lanc_principal.plano_contas_id (fatura_cartao_lancamentos
  -- tambem foi renomeada na mesma migration)
  INSERT INTO contas_pagar_receber (
    tipo,
    descricao,
    valor,
    data_vencimento,
    data_compra,
    nf_data_emissao,
    fornecedor_cliente,
    parceiro_id,
    fornecedor_id,
    plano_contas_id,
    centro_custo_id,
    status,
    origem,
    meio_pagamento_id,
    forma_pagamento_id,
    aprovado_em,
    aprovado_por,
    observacao,
    criado_por
  ) VALUES (
    'pagar',
    v_descricao,
    v_valor_total,
    v_data_venc_base,
    v_data_compra_min,
    v_lanc_principal.data_compra,
    (SELECT razao_social FROM parceiros_comerciais WHERE id = v_lanc_principal.parceiro_id),
    v_lanc_principal.parceiro_id,
    v_lanc_principal.parceiro_id,
    v_lanc_principal.plano_contas_id,
    NULL,
    'aprovado',
    'cartao',
    v_meio_pgto_id,
    v_forma_pgto_id,
    now(),
    v_user_id,
    'Conta agrupada de ' || v_qtd_lancs || ' lancamentos do cartao:' || E'\n • ' || v_lancamentos_descritivo,
    v_user_id
  ) RETURNING id INTO v_nova_conta_id;

  UPDATE fatura_cartao_lancamentos
  SET status = 'virou_despesa',
      conta_pagar_id = v_nova_conta_id,
      updated_at = now()
  WHERE id = ANY(p_lancamento_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'conta_pagar_id', v_nova_conta_id,
    'descricao', v_descricao,
    'valor_agregado', v_valor_total,
    'qtd_lancamentos', v_qtd_lancs,
    'lancamento_principal_id', v_lanc_principal.id,
    'forma_pagamento_aplicada', v_forma_pgto_id IS NOT NULL
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_despesa_de_lancamento_v2(p_lancamento_id uuid, p_total_parcelas integer DEFAULT 1, p_gerar_todas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc        RECORD;
  v_conta_orfa  RECORD;
  v_desc_base   text;
BEGIN
  SELECT * INTO v_lanc
    FROM fatura_cartao_lancamentos
   WHERE id = p_lancamento_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado');
  END IF;

  IF v_lanc.conta_pagar_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento já vinculado a uma conta');
  END IF;

  -- Normaliza descrição base do cartão removendo TODOS os padrões de parcela
  -- Ex: "PG *AFIXCODE SOLU 02/03" -> "PG *AFIXCODE SOLU"
  -- Ex: "PG *AFIXCODE SOLU 01/03 (2/3)" -> "PG *AFIXCODE SOLU"
  v_desc_base := TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      COALESCE(v_lanc.descricao, ''),
      '[\(\[]\s*\d+\s*[/\-]\s*\d+\s*[\)\]]',
      ' ',
      'g'
    ),
    '\d+\s*[/\-]\s*\d+',
    ' ',
    'g'
  ));
  v_desc_base := REGEXP_REPLACE(v_desc_base, '\s+', ' ', 'g');
  v_desc_base := TRIM(v_desc_base);

  -- ====================================================
  -- RECONCILIAÇÃO: parcela 2+ procura conta órfã do grupo
  -- ====================================================
  IF v_lanc.parcela_atual IS NOT NULL 
     AND v_lanc.parcela_atual > 1 
  THEN
    SELECT cpr.* INTO v_conta_orfa
      FROM contas_pagar_receber cpr
     WHERE cpr.parcela_grupo_id IS NOT NULL
       AND ABS(cpr.valor - v_lanc.valor) <= 0.01
       AND cpr.deleted_at IS NULL
       AND cpr.status NOT IN ('cancelado', 'paga')
       AND NOT EXISTS (
         SELECT 1 FROM fatura_cartao_lancamentos fcl2
          WHERE fcl2.conta_pagar_id = cpr.id
       )
       AND (
         (v_lanc.parceiro_id IS NOT NULL AND cpr.parceiro_id = v_lanc.parceiro_id)
         OR
         (v_lanc.cnpj_estabelecimento IS NOT NULL 
          AND cpr.nf_cnpj_emitente = v_lanc.cnpj_estabelecimento)
         OR
         -- fallback: descrição base bate (sem QUALQUER sufixo XX/YY ou (XX/YY))
         TRIM(REGEXP_REPLACE(
           REGEXP_REPLACE(
             COALESCE(cpr.descricao, ''),
             '[\(\[]\s*\d+\s*[/\-]\s*\d+\s*[\)\]]',
             ' ',
             'g'
           ),
           '\d+\s*[/\-]\s*\d+',
           ' ',
           'g'
         )) ILIKE '%' || v_desc_base || '%'
       )
     ORDER BY cpr.data_vencimento ASC, cpr.created_at ASC
     LIMIT 1;

    IF v_conta_orfa.id IS NOT NULL THEN
      UPDATE fatura_cartao_lancamentos
         SET conta_pagar_id = v_conta_orfa.id,
             status = 'virou_despesa',
             updated_at = now()
       WHERE id = p_lancamento_id;

      RETURN jsonb_build_object(
        'ok', true,
        'vinculou_existente', true,
        'conta_id', v_conta_orfa.id,
        'descricao', v_conta_orfa.descricao,
        'valor', v_conta_orfa.valor,
        'qtd_contas_criadas', 0,
        'mensagem', 'Vinculado à parcela existente do grupo (vencimento ' 
                    || to_char(v_conta_orfa.data_vencimento, 'DD/MM/YYYY') 
                    || ')'
      );
    END IF;
  END IF;

  -- Sem reconciliação possível → função original
  RETURN criar_despesa_de_lancamento(
    p_lancamento_id,
    p_total_parcelas,
    p_gerar_todas
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_despesa_direta_ofx(p_movimentacao_id uuid, p_categoria_id uuid, p_descricao text, p_parceiro_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, conta_pagar_id uuid, erro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
  v_nova_conta_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Carrega movimentação
  SELECT id, data_transacao, valor, descricao, conta_bancaria_id
  INTO v_mov
  FROM movimentacoes_bancarias
  WHERE id = p_movimentacao_id;

  IF NOT FOUND THEN
    ok := false;
    erro := 'Movimentação não encontrada';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Cria conta a pagar finalizada
  -- B-51 fix: plano_contas_id (renomeada de conta_id em §3.2 - 18/05/2026)
  INSERT INTO contas_pagar_receber (
    tipo,
    descricao,
    valor,
    data_vencimento,
    data_pagamento,
    pago_em,
    pago_em_conta_id,
    status,
    docs_status,
    plano_contas_id,
    parceiro_id,
    movimentacao_bancaria_id,
    conciliado_em,
    conciliado_por,
    pago_por,
    criado_por,
    origem,
    observacao
  ) VALUES (
    'pagar',
    p_descricao,
    ABS(v_mov.valor),
    v_mov.data_transacao,
    v_mov.data_transacao,
    v_now,
    v_mov.conta_bancaria_id,
    'finalizado',
    'dispensado',
    p_categoria_id,
    p_parceiro_id,
    p_movimentacao_id,
    v_now,
    p_user_id,
    p_user_id,
    p_user_id,
    'despesa_direta_ofx',
    'Criada via conciliação OFX como despesa direta. Sem NF prévia.'
  ) RETURNING id INTO v_nova_conta_id;

  -- Marca movimentação como conciliada
  UPDATE movimentacoes_bancarias
  SET conciliado = true,
      conta_pagar_id = v_nova_conta_id,
      conciliado_em = v_now,
      conciliado_por = p_user_id
  WHERE id = p_movimentacao_id;

  ok := true;
  conta_pagar_id := v_nova_conta_id;
  erro := NULL;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.criar_pedido_compra(p_centro_custo_id uuid DEFAULT NULL::uuid, p_linha_investimento_id uuid DEFAULT NULL::uuid, p_parceiro_preferencial_id uuid DEFAULT NULL::uuid, p_descricao_geral text DEFAULT NULL::text, p_justificativa text DEFAULT NULL::text, p_itens jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_dept_unidade RECORD;
  v_pedido_id UUID;
  v_item JSONB;
  v_ordem INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;
  
  SELECT * INTO v_dept_unidade
    FROM public.get_user_departamento_unidade(v_user_id);
  
  INSERT INTO public.pedidos_compra (
    solicitante_id, departamento_id, unidade_id,
    centro_custo_id, linha_investimento_id, parceiro_preferencial_id,
    descricao_geral, justificativa, status
  ) VALUES (
    v_user_id, v_dept_unidade.departamento_id, v_dept_unidade.unidade_id,
    p_centro_custo_id, p_linha_investimento_id, p_parceiro_preferencial_id,
    p_descricao_geral, p_justificativa, 'rascunho'
  )
  RETURNING id INTO v_pedido_id;
  
  IF jsonb_array_length(p_itens) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
      v_ordem := v_ordem + 1;
      INSERT INTO public.pedidos_compra_itens (
        pedido_id, descricao, quantidade, valor_estimado_unitario,
        urls, especificacao_tecnica, ordem
      ) VALUES (
        v_pedido_id, v_item->>'descricao',
        COALESCE((v_item->>'quantidade')::NUMERIC, 1),
        COALESCE((v_item->>'valor_estimado_unitario')::NUMERIC, 0),
        CASE WHEN v_item->'urls' IS NULL THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(v_item->'urls')) END,
        v_item->>'especificacao_tecnica',
        v_ordem
      );
    END LOOP;
  END IF;
  
  -- Evento timeline
  PERFORM public.fn_log_evento_pedido(
    v_pedido_id,
    'pedido_criado',
    jsonb_build_object('itens_criados', v_ordem),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'pedido_id', v_pedido_id,
    'status', 'rascunho',
    'itens_criados', v_ordem
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.debug_kalunga()
 RETURNS TABLE(step text, valor text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_conta RECORD;
  v_pcnpj text;
  v_descricao_limpa text;
  v_token text;
BEGIN
  SELECT cpr.id, cpr.valor, cpr.descricao, cpr.parceiro_id
  INTO v_conta
  FROM contas_pagar_receber cpr
  WHERE cpr.id = '5b4dfc68-ac21-435f-aea3-8d9d0408da64';

  RETURN QUERY SELECT 'conta.id'::text, v_conta.id::text;
  RETURN QUERY SELECT 'conta.parceiro_id'::text, v_conta.parceiro_id::text;
  
  v_pcnpj := NULL;
  IF v_conta.parceiro_id IS NOT NULL THEN
    SELECT cnpj INTO v_pcnpj FROM parceiros_comerciais WHERE id = v_conta.parceiro_id;
  END IF;
  
  RETURN QUERY SELECT 'parceiro_cnpj_lido'::text, COALESCE(v_pcnpj, '<NULL>')::text;
  
  v_descricao_limpa := UPPER(v_conta.descricao);
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '^(PG |PPRO \*|MP\*|MLP\*)', '', 'i');
  IF v_descricao_limpa LIKE 'MERCADOLIVRE%*%' THEN
    v_descricao_limpa := SPLIT_PART(v_descricao_limpa, '*', 2);
  END IF;
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '\s*\d+/\d+|\(\d+/\d+\)|E\d+/\d+', '', 'g');
  v_descricao_limpa := regexp_replace(v_descricao_limpa, '\s*(POMP|AV|CT|CTE|PAUL|MOR)[\-\s]*[A-Z]*$', '', 'g');
  v_descricao_limpa := TRIM(v_descricao_limpa);
  
  RETURN QUERY SELECT 'descricao_limpa'::text, v_descricao_limpa;
  
  v_token := SPLIT_PART(v_descricao_limpa, ' ', 1);
  IF length(v_token) < 4 THEN
    v_token := v_descricao_limpa;
  END IF;
  
  RETURN QUERY SELECT 'token'::text, v_token;
  
  -- Roda o cálculo final pra cada NF Kalunga
  RETURN QUERY 
  SELECT 
    'NF: ' || nf.fornecedor_razao_social || ' (CNPJ ' || COALESCE(nf.fornecedor_cnpj, 'NULL') || ')',
    format('sim_text=%s, valor=%s, cnpj=%s, total=%s',
      GREATEST(
        ROUND(similarity(v_token, COALESCE(SPLIT_PART(UPPER(nf.fornecedor_razao_social), ' ', 1), '')) * 100),
        CASE WHEN UPPER(nf.fornecedor_razao_social) LIKE '%' || v_token || '%' AND length(v_token) >= 4 THEN 95 ELSE 0 END
      )::text,
      CASE WHEN ABS(nf.valor - v_conta.valor) <= 0.01 THEN '30' ELSE '0' END,
      CASE WHEN v_pcnpj IS NOT NULL AND nf.fornecedor_cnpj = regexp_replace(v_pcnpj, '[^\d]', '', 'g') THEN '50' ELSE '0' END,
      (
        GREATEST(
          ROUND(similarity(v_token, COALESCE(SPLIT_PART(UPPER(nf.fornecedor_razao_social), ' ', 1), '')) * 100),
          CASE WHEN UPPER(nf.fornecedor_razao_social) LIKE '%' || v_token || '%' AND length(v_token) >= 4 THEN 95 ELSE 0 END
        )
        + CASE WHEN ABS(nf.valor - v_conta.valor) <= 0.01 THEN 30 ELSE 0 END
        + CASE WHEN v_pcnpj IS NOT NULL AND nf.fornecedor_cnpj = regexp_replace(v_pcnpj, '[^\d]', '', 'g') THEN 50 ELSE 0 END
      )::text
    )
  FROM nfs_stage nf
  WHERE nf.fornecedor_razao_social ILIKE '%kalunga%'
    AND nf.status = 'nao_vinculada'
    AND nf.conta_pagar_id IS NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.descartar_ofx_stage(p_importacao_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imp RECORD;
BEGIN
  SELECT * INTO v_imp FROM ofx_importacoes_stage WHERE id = p_importacao_stage_id;
  IF v_imp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Importação não encontrada');
  END IF;

  IF v_imp.status = 'persistido' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Importação já persistida — não pode descartar');
  END IF;

  -- Apaga importação (CASCADE apaga transações)
  DELETE FROM ofx_importacoes_stage WHERE id = p_importacao_stage_id;

  RETURN jsonb_build_object(
    'ok', true,
    'arquivo_storage_path', v_imp.arquivo_storage_path
    -- Caller pode usar este path pra apagar do storage
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.desconciliar_movimentacao(p_mov_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE v_ofx_id UUID;
BEGIN
  SELECT ofx_transacao_id INTO v_ofx_id
  FROM movimentacoes_bancarias WHERE id = p_mov_id;

  UPDATE movimentacoes_bancarias SET
    conciliado       = false,
    conciliado_em    = NULL,
    conciliado_por   = NULL,
    ofx_transacao_id = NULL
  WHERE id = p_mov_id;

  IF v_ofx_id IS NOT NULL THEN
    UPDATE ofx_transacoes_stage SET status = 'pendente'
    WHERE id = v_ofx_id;
  END IF;

  RETURN json_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.desfazer_remessa(p_remessa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_metodo       TEXT;
  v_qtd_liberada INT;
  v_user_role    TEXT;
BEGIN
  -- Permissão: só super_admin
  SELECT role::TEXT INTO v_user_role
  FROM public.user_roles
  WHERE user_id = auth.uid() AND role::TEXT = 'super_admin'
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Sem permissão (apenas super_admin)');
  END IF;

  -- Busca remessa
  SELECT metodo INTO v_metodo
  FROM public.remessas_contador
  WHERE id = p_remessa_id;

  IF v_metodo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Remessa não encontrada');
  END IF;

  -- Bloqueio: remessas via sistema (link signed) não podem ser desfeitas
  -- (link pode ter sido aberto/baixado pelo contador)
  IF v_metodo = 'sistema' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Remessa via sistema não pode ser desfeita (link pode ter sido aberto pelo destinatário). Crie nova remessa de retificação se necessário.'
    );
  END IF;

  -- Conta itens antes de deletar
  SELECT COUNT(*) INTO v_qtd_liberada
  FROM public.remessas_contador_itens
  WHERE remessa_id = p_remessa_id;

  -- Deleta remessa (cascade nos itens)
  DELETE FROM public.remessas_contador WHERE id = p_remessa_id;

  RETURN jsonb_build_object(
    'ok', true,
    'qtd_contas_liberadas', v_qtd_liberada
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.detectar_duplicatas_nf(p_chaves text[], p_cnpj_numero jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(chave_ou_par text, fonte text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Chaves de acesso (único — sem ambiguidade de tipo)
  IF p_chaves IS NOT NULL AND array_length(p_chaves, 1) > 0 THEN
    RETURN QUERY
      SELECT DISTINCT ns.nf_chave_acesso, 'stage'::text
      FROM nfs_stage ns
      WHERE ns.nf_chave_acesso = ANY(p_chaves)
        AND ns.status NOT IN ('descartada','duplicata');
    RETURN QUERY
      SELECT DISTINCT cpr.nf_chave_acesso, 'contas_pagar'::text
      FROM contas_pagar_receber cpr
      WHERE cpr.nf_chave_acesso = ANY(p_chaves);
  END IF;

  -- Pares CNPJ+numero+tipo — só é duplicata se mesmo tipo de documento
  IF p_cnpj_numero IS NOT NULL AND jsonb_array_length(p_cnpj_numero) > 0 THEN
    RETURN QUERY
      SELECT DISTINCT (ns.fornecedor_cnpj || '|' || ns.nf_numero), 'stage'::text
      FROM nfs_stage ns, jsonb_array_elements(p_cnpj_numero) AS par
      WHERE ns.fornecedor_cnpj = (par->>'cnpj')
        AND ns.nf_numero = (par->>'numero')
        AND ns.status NOT IN ('descartada','duplicata')
        AND ns.tipo_documento = (par->>'tipo_documento');  -- 🆕 mesmo tipo = duplicata
    RETURN QUERY
      SELECT DISTINCT (cpr.nf_cnpj_emitente || '|' || cpr.nf_numero), 'contas_pagar'::text
      FROM contas_pagar_receber cpr, jsonb_array_elements(p_cnpj_numero) AS par
      WHERE cpr.nf_cnpj_emitente = (par->>'cnpj')
        AND cpr.nf_numero = (par->>'numero');
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.detectar_pares_provaveis_nf(p_score_minimo integer DEFAULT 80)
 RETURNS TABLE(id_a uuid, id_b uuid, score integer, motivo_match text, a_fornecedor text, a_numero text, a_data date, a_valor numeric, a_tipo text, a_status text, a_categoria_id uuid, b_fornecedor text, b_numero text, b_data date, b_valor numeric, b_tipo text, b_status text, b_categoria_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- B-51 fix: nfs_stage.plano_contas_id (renomeada em §3.2);
  -- alias "categoria_id" mantido pra preservar contrato externo
  RETURN QUERY
  WITH ativas AS (
    SELECT
      ns.id,
      ns.fornecedor_razao_social,
      ns.fornecedor_cnpj,
      ns.nf_numero,
      normalizar_numero_nf(ns.nf_numero) AS numero_norm,
      ns.nf_data_emissao,
      ns.valor,
      ns.status,
      ns.plano_contas_id AS categoria_id,
      CASE
        WHEN ns.arquivo_storage_path IS NOT NULL
          AND (ns.xml_storage_path IS NOT NULL
               OR (ns.itens IS NOT NULL AND jsonb_array_length(ns.itens) > 0))
        THEN 'completo'
        WHEN ns.arquivo_storage_path IS NOT NULL THEN 'pdf'
        WHEN ns.xml_storage_path IS NOT NULL
          OR (ns.itens IS NOT NULL AND jsonb_array_length(ns.itens) > 0) THEN 'xml'
        ELSE 'sem_documentos'
      END AS tipo
    FROM nfs_stage ns
    WHERE ns.status NOT IN ('descartada', 'duplicata', 'importada')
  ),
  pares AS (
    SELECT
      LEAST(a.id, b.id) AS id_a,
      GREATEST(a.id, b.id) AS id_b,
      CASE WHEN a.fornecedor_cnpj IS NOT NULL
        AND a.fornecedor_cnpj = b.fornecedor_cnpj THEN 30 ELSE 0 END AS s_cnpj,
      CASE WHEN abs(COALESCE(a.valor, 0) - COALESCE(b.valor, 0)) < 0.01
        AND COALESCE(a.valor, 0) > 0 THEN 30 ELSE 0 END AS s_valor,
      CASE
        WHEN a.nf_data_emissao IS NOT NULL AND a.nf_data_emissao = b.nf_data_emissao THEN 20
        WHEN a.nf_data_emissao IS NOT NULL AND b.nf_data_emissao IS NOT NULL
          AND abs(a.nf_data_emissao - b.nf_data_emissao) <= 3 THEN 10
        ELSE 0
      END AS s_data,
      CASE WHEN a.numero_norm IS NOT NULL
        AND a.numero_norm = b.numero_norm AND a.numero_norm <> '' THEN 20 ELSE 0 END AS s_numero,
      CASE WHEN a.fornecedor_razao_social IS NOT NULL AND b.fornecedor_razao_social IS NOT NULL
        THEN ROUND(similarity(a.fornecedor_razao_social, b.fornecedor_razao_social) * 20)::INTEGER
        ELSE 0 END AS s_nome,
      CASE WHEN (a.tipo = 'pdf' AND b.tipo = 'xml')
        OR (a.tipo = 'xml' AND b.tipo = 'pdf') THEN 10 ELSE 0 END AS s_complementar,
      a.id AS a_id, a.fornecedor_razao_social AS a_fornecedor,
      a.nf_numero AS a_numero, a.nf_data_emissao AS a_data,
      a.valor AS a_valor, a.tipo AS a_tipo, a.status AS a_status,
      a.categoria_id AS a_categoria_id,
      b.id AS b_id, b.fornecedor_razao_social AS b_fornecedor,
      b.nf_numero AS b_numero, b.nf_data_emissao AS b_data,
      b.valor AS b_valor, b.tipo AS b_tipo, b.status AS b_status,
      b.categoria_id AS b_categoria_id,
      CASE
        WHEN a.numero_norm IS NOT NULL AND a.numero_norm <> ''
          AND b.numero_norm IS NOT NULL AND b.numero_norm <> ''
          AND a.numero_norm <> b.numero_norm
        THEN true
        ELSE false
      END AS numeros_divergem
    FROM ativas a
    JOIN ativas b ON a.id < b.id
    WHERE (
      a.fornecedor_cnpj = b.fornecedor_cnpj
      OR abs(COALESCE(a.valor, 0) - COALESCE(b.valor, 0)) < 0.01
    )
  ),
  com_score AS (
    SELECT *,
      LEAST(100, ROUND(((s_cnpj + s_valor + s_data + s_numero + s_nome + s_complementar)
                        * 100.0) / 130))::INTEGER AS score_norm,
      CONCAT_WS(' • ',
        CASE WHEN s_cnpj > 0 THEN 'CNPJ' END,
        CASE WHEN s_valor > 0 THEN 'valor' END,
        CASE WHEN s_data = 20 THEN 'data' WHEN s_data = 10 THEN 'data próxima' END,
        CASE WHEN s_numero > 0 THEN 'número' END,
        CASE WHEN s_nome >= 12 THEN 'nome' END,
        CASE WHEN s_complementar > 0 THEN 'PDF+XML' END
      ) AS motivo
    FROM pares
  )
  SELECT
    cs.id_a, cs.id_b, cs.score_norm, cs.motivo,
    cs.a_fornecedor, cs.a_numero, cs.a_data, cs.a_valor,
    cs.a_tipo, cs.a_status, cs.a_categoria_id,
    cs.b_fornecedor, cs.b_numero, cs.b_data, cs.b_valor,
    cs.b_tipo, cs.b_status, cs.b_categoria_id
  FROM com_score cs
  WHERE cs.score_norm >= p_score_minimo
    AND NOT cs.numeros_divergem
    AND NOT EXISTS (
      SELECT 1 FROM nf_stage_pares_verificados v
      WHERE v.id_a = cs.id_a AND v.id_b = cs.id_b
    )
  ORDER BY cs.score_norm DESC, cs.a_fornecedor;
END;
$function$;
CREATE OR REPLACE FUNCTION public.diagnostico_match_mov_sem_cnpj()
 RETURNS TABLE(mov_id uuid, mov_descricao text, mov_valor numeric, mov_data_compra date, token_extraido text, nf_id uuid, nf_razao_social text, nf_valor numeric, nf_data_emissao date, similaridade_texto integer, match_valor text, match_data text, score_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- B-51 fix: plano_contas_id (renomeada em §3.2)
  RETURN QUERY
  WITH mov_sem_categoria AS (
    SELECT
      cpr.id,
      cpr.descricao,
      cpr.valor,
      cpr.data_compra,
      UPPER(TRIM(
        regexp_replace(
          regexp_replace(
            regexp_replace(cpr.descricao, '^(PG |PPRO \*|TICKET |COMPRA )', '', 'i'),
            '\d+/\d+|\(\d+/\d+\)', '', 'g'
          ),
          '[^A-Za-zÀ-ú\s\*]', '', 'g'
        )
      )) AS token
    FROM contas_pagar_receber cpr
    WHERE cpr.plano_contas_id IS NULL
      AND cpr.nf_cnpj_emitente IS NULL
      AND cpr.parceiro_id IS NULL
      AND cpr.status NOT IN ('cancelado')
      AND cpr.descricao IS NOT NULL
      AND cpr.valor > 0
      AND cpr.data_compra IS NOT NULL
  ),
  candidatos AS (
    SELECT
      m.id AS mov_id,
      m.descricao AS mov_desc,
      m.valor AS mov_v,
      m.data_compra AS mov_dt,
      m.token,
      nf.id AS nf_id,
      nf.fornecedor_razao_social AS nf_razao,
      nf.valor AS nf_v,
      nf.nf_data_emissao::date AS nf_dt,
      GREATEST(
        ROUND(similarity(m.token, COALESCE(UPPER(nf.fornecedor_razao_social), '')) * 100),
        ROUND(similarity(m.token, COALESCE(UPPER(nf.fornecedor_cliente), '')) * 100)
      )::integer AS sim,
      CASE
        WHEN ABS(nf.valor - m.valor) <= 0.01 THEN 'exato'
        WHEN ABS(nf.valor - m.valor) <= 5 THEN 'próximo'
        WHEN m.valor > 0 AND nf.valor / m.valor BETWEEN 1.99 AND 36.01
          AND ABS(ROUND(nf.valor / m.valor) - (nf.valor / m.valor)) <= 0.02
          AND ABS(nf.valor - (ROUND(nf.valor / m.valor) * m.valor)) <= 0.50
        THEN 'parcelado_' || ROUND(nf.valor / m.valor)::text || 'x'
        ELSE 'incompatível'
      END AS valor_match,
      CASE
        WHEN nf.nf_data_emissao IS NULL OR m.data_compra IS NULL THEN 'sem_data'
        WHEN ABS(nf.nf_data_emissao::date - m.data_compra) <= 7 THEN 'próxima_7d'
        WHEN ABS(nf.nf_data_emissao::date - m.data_compra) <= 30 THEN 'próxima_30d'
        ELSE 'distante'
      END AS data_match
    FROM mov_sem_categoria m
    CROSS JOIN nfs_stage nf
    WHERE nf.status = 'nao_vinculada'
      AND nf.conta_pagar_id IS NULL
      AND length(m.token) >= 4
      AND (
        similarity(m.token, COALESCE(UPPER(nf.fornecedor_razao_social), '')) >= 0.4
        OR similarity(m.token, COALESCE(UPPER(nf.fornecedor_cliente), '')) >= 0.4
      )
  ),
  pontuado AS (
    SELECT *,
      sim
      + CASE valor_match
          WHEN 'exato' THEN 30
          WHEN 'próximo' THEN 20
          WHEN 'incompatível' THEN -20
          WHEN 'sem_data' THEN 0
          ELSE 25
        END
      + CASE data_match
          WHEN 'próxima_7d' THEN 15
          WHEN 'próxima_30d' THEN 5
          WHEN 'distante' THEN -10
          ELSE 0
        END AS score
    FROM candidatos
  )
  SELECT
    p.mov_id, p.mov_desc, p.mov_v, p.mov_dt, p.token,
    p.nf_id, p.nf_razao, p.nf_v, p.nf_dt,
    p.sim, p.valor_match, p.data_match, p.score
  FROM pontuado p
  WHERE p.score >= 50
  ORDER BY p.mov_id, p.score DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.disparar_enriquecimento_parceiro(p_parceiro_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  v_url := public.get_vault_secret('SUPABASE_URL');
  v_key := public.get_vault_secret('SUPABASE_SERVICE_ROLE_KEY');

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Vault secrets ausentes — pulando enriquecimento de %', p_parceiro_id;
    RETURN NULL;
  END IF;

  SELECT extensions.http_post(
    url := v_url || '/functions/v1/enriquecer-parceiro-cnpj',
    body := jsonb_build_object('parceiro_id', p_parceiro_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.documentos_pendentes_agrupados(p_periodo_inicio date DEFAULT NULL::date, p_periodo_fim date DEFAULT NULL::date, p_status text DEFAULT NULL::text)
 RETURNS TABLE(parceiro_id uuid, parceiro_razao_social text, total_contas integer, total_valor numeric, contas_pendente integer, contas_parcial integer, mais_antigo_dias integer, contas_json jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      cpr.id,
      cpr.parceiro_id,
      COALESCE(pc.razao_social, cpr.fornecedor_cliente, 'Sem fornecedor') AS razao_social,
      cpr.descricao,
      cpr.valor,
      cpr.data_vencimento,
      cpr.data_pagamento,
      cpr.status AS status_conta,
      cpr.docs_status,
      cpr.nf_numero,
      EXTRACT(DAY FROM (CURRENT_DATE - cpr.data_vencimento::date))::int AS dias
    FROM contas_pagar_receber cpr
    LEFT JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
    WHERE cpr.tipo = 'pagar'
      AND cpr.status NOT IN ('cancelado')
      AND COALESCE(cpr.docs_status, 'pendente') IN ('pendente', 'parcial')
      AND (p_periodo_inicio IS NULL OR cpr.data_vencimento >= p_periodo_inicio)
      AND (p_periodo_fim IS NULL OR cpr.data_vencimento <= p_periodo_fim)
      AND (p_status IS NULL OR COALESCE(cpr.docs_status, 'pendente') = p_status)
  )
  SELECT
    base.parceiro_id,
    base.razao_social,
    COUNT(*)::int AS total_contas,
    SUM(base.valor) AS total_valor,
    COUNT(*) FILTER (WHERE COALESCE(base.docs_status, 'pendente') = 'pendente')::int AS contas_pendente,
    COUNT(*) FILTER (WHERE base.docs_status = 'parcial')::int AS contas_parcial,
    MAX(base.dias)::int AS mais_antigo_dias,
    jsonb_agg(
      jsonb_build_object(
        'id', base.id,
        'descricao', base.descricao,
        'valor', base.valor,
        'data_vencimento', base.data_vencimento,
        'data_pagamento', base.data_pagamento,
        'status_conta', base.status_conta,
        'docs_status', COALESCE(base.docs_status, 'pendente'),
        'nf_numero', base.nf_numero,
        'dias', base.dias
      )
      ORDER BY base.data_vencimento ASC
    ) AS contas_json
  FROM base
  GROUP BY base.parceiro_id, base.razao_social
  ORDER BY total_valor DESC NULLS LAST;
END;
$function$;
CREATE OR REPLACE FUNCTION public.editar_comentario_pedido(p_comentario_id uuid, p_conteudo_novo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_comentario RECORD;
  v_idade_minutos NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  
  IF p_conteudo_novo IS NULL OR LENGTH(TRIM(p_conteudo_novo)) = 0 THEN
    RAISE EXCEPTION 'Conteudo nao pode estar vazio';
  END IF;
  IF LENGTH(p_conteudo_novo) > 5000 THEN
    RAISE EXCEPTION 'Conteudo excede 5000 caracteres';
  END IF;
  
  SELECT * INTO v_comentario FROM public.comentarios_pedido WHERE id = p_comentario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario % nao encontrado', p_comentario_id; END IF;
  
  IF v_comentario.excluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Comentario foi excluido e nao pode ser editado';
  END IF;
  
  -- Apenas autor pode editar
  IF v_comentario.autor_id != v_user_id THEN
    RAISE EXCEPTION 'Apenas o autor pode editar o comentario';
  END IF;
  
  -- Limite 15 min apos criacao
  v_idade_minutos := EXTRACT(EPOCH FROM (now() - v_comentario.created_at)) / 60;
  IF v_idade_minutos > 15 THEN
    RAISE EXCEPTION 'Janela de edicao expirou (15 minutos apos criacao)';
  END IF;
  
  UPDATE public.comentarios_pedido
     SET conteudo = TRIM(p_conteudo_novo),
         editado_em = now()
   WHERE id = p_comentario_id;
  
  PERFORM public.fn_log_evento_pedido(
    v_comentario.pedido_id, 'comentario_editado',
    jsonb_build_object('comentario_id', p_comentario_id),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'comentario_id', p_comentario_id,
    'editado_em', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.enriquecer_fatura_cartao(p_fatura_id uuid)
 RETURNS TABLE(total_processados integer, enriquecidos integer, ja_enriquecidos integer, ambiguos integer, sem_match integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc RECORD;
  v_resultado RECORD;
  v_total INTEGER := 0;
  v_enriq INTEGER := 0;
  v_ja INTEGER := 0;
  v_amb INTEGER := 0;
  v_nada INTEGER := 0;
BEGIN
  FOR v_lanc IN
    SELECT fcl.id
    FROM fatura_cartao_lancamentos fcl
    WHERE fcl.fatura_id = p_fatura_id
  LOOP
    v_total := v_total + 1;
    SELECT * INTO v_resultado FROM enriquecer_lancamento_cartao(v_lanc.id);

    IF v_resultado.out_fonte = 'ja_enriquecido' THEN
      v_ja := v_ja + 1;
    ELSIF v_resultado.out_fonte IN ('regra_categorizacao', 'match_parceiro') THEN
      v_enriq := v_enriq + 1;
    ELSIF v_resultado.out_fonte = 'ambiguo' THEN
      v_amb := v_amb + 1;
    ELSE
      v_nada := v_nada + 1;
    END IF;
  END LOOP;

  total_processados := v_total;
  enriquecidos := v_enriq;
  ja_enriquecidos := v_ja;
  ambiguos := v_amb;
  sem_match := v_nada;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.enriquecer_lancamento_cartao(p_lancamento_id uuid)
 RETURNS TABLE(out_parceiro_id uuid, out_cnpj text, out_fonte text, out_score integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_lanc_id UUID;
  v_lanc_descricao TEXT;
  v_lanc_parceiro UUID;
  v_lanc_cnpj TEXT;
  v_descricao_norm TEXT;
  v_token TEXT;
  v_regra RECORD;
  v_parceiro RECORD;
  v_score INTEGER;
  v_count_match INTEGER;
  v_cnpj_resolvido TEXT;
BEGIN
  -- Carrega lançamento (vars locais com prefixo v_ pra evitar ambiguidade)
  SELECT fcl.id, fcl.descricao, fcl.parceiro_id, fcl.cnpj_estabelecimento
  INTO v_lanc_id, v_lanc_descricao, v_lanc_parceiro, v_lanc_cnpj
  FROM fatura_cartao_lancamentos fcl
  WHERE fcl.id = p_lancamento_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Já tem parceiro_id? não mexe
  IF v_lanc_parceiro IS NOT NULL THEN
    out_parceiro_id := v_lanc_parceiro;
    out_cnpj := v_lanc_cnpj;
    out_fonte := 'ja_enriquecido';
    out_score := 100;
    RETURN NEXT;
    RETURN;
  END IF;

  v_descricao_norm := normalizar_descricao_cartao(v_lanc_descricao);

  -- ============================================================
  -- CAMADA 1+2: Buscar em regras_categorizacao
  -- ============================================================
  FOR v_regra IN
    SELECT r.id AS regra_id,
           r.parceiro_id AS r_parceiro_id,
           r.cnpj_emitente AS r_cnpj,
           r.token_principal,
           r.descricao_contem,
           r.confianca,
           r.vezes_aplicada
    FROM regras_categorizacao r
    WHERE r.ativo = true
      AND r.parceiro_id IS NOT NULL
      AND (
        (r.token_principal IS NOT NULL AND v_descricao_norm LIKE '%' || lower(unaccent(r.token_principal)) || '%')
        OR
        (r.descricao_contem IS NOT NULL AND v_descricao_norm LIKE '%' || lower(unaccent(r.descricao_contem)) || '%')
      )
    ORDER BY r.confianca DESC, r.vezes_aplicada DESC,
             length(coalesce(r.token_principal, r.descricao_contem, '')) DESC
    LIMIT 1
  LOOP
    v_score := LEAST(100, (v_regra.confianca * 80)::int + LEAST(20, v_regra.vezes_aplicada));

    IF v_score >= 80 THEN
      -- Resolve CNPJ
      IF v_regra.r_cnpj IS NOT NULL THEN
        v_cnpj_resolvido := v_regra.r_cnpj;
      ELSE
        SELECT pc.cnpj INTO v_cnpj_resolvido
        FROM parceiros_comerciais pc
        WHERE pc.id = v_regra.r_parceiro_id;
      END IF;

      -- Atualiza o lançamento
      UPDATE fatura_cartao_lancamentos fcl
      SET parceiro_id = v_regra.r_parceiro_id,
          cnpj_estabelecimento = COALESCE(v_cnpj_resolvido, fcl.cnpj_estabelecimento),
          updated_at = now()
      WHERE fcl.id = p_lancamento_id;

      -- Incrementa uso da regra
      UPDATE regras_categorizacao r
      SET vezes_aplicada = vezes_aplicada + 1,
          ultima_aplicacao_em = now()
      WHERE r.id = v_regra.regra_id;

      out_parceiro_id := v_regra.r_parceiro_id;
      out_cnpj := v_cnpj_resolvido;
      out_fonte := 'regra_categorizacao';
      out_score := v_score;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  -- ============================================================
  -- CAMADA 1 (fallback): Buscar parceiros por nome
  -- ============================================================
  WITH tokens AS (
    SELECT unnest(string_to_array(v_descricao_norm, ' ')) AS tok
  ),
  tokens_filtrados AS (
    SELECT tok FROM tokens
    WHERE length(tok) >= 4
      AND tok NOT IN ('diversos', 'turismo', 'entretenim', 'alimentacao',
                       'compras', 'servicos', 'comercio', 'loja',
                       'pagamento', 'transferencia')
      AND tok !~ '^\d+$'
  )
  SELECT tok INTO v_token
  FROM tokens_filtrados
  ORDER BY length(tok) DESC
  LIMIT 1;

  IF v_token IS NULL THEN
    out_parceiro_id := NULL; out_cnpj := NULL;
    out_fonte := 'nenhuma'; out_score := 0;
    RETURN NEXT; RETURN;
  END IF;

  -- Conta quantos parceiros casam
  SELECT COUNT(*) INTO v_count_match
  FROM parceiros_comerciais pc
  WHERE pc.ativo = true
    AND (
      lower(unaccent(pc.razao_social)) LIKE '%' || v_token || '%'
      OR (pc.nome_fantasia IS NOT NULL AND lower(unaccent(pc.nome_fantasia)) LIKE '%' || v_token || '%')
    );

  IF v_count_match = 0 THEN
    out_parceiro_id := NULL; out_cnpj := NULL;
    out_fonte := 'nenhuma'; out_score := 0;
    RETURN NEXT; RETURN;
  END IF;

  IF v_count_match > 1 THEN
    out_parceiro_id := NULL; out_cnpj := NULL;
    out_fonte := 'ambiguo'; out_score := 50;
    RETURN NEXT; RETURN;
  END IF;

  -- Match único
  SELECT pc.id, pc.cnpj INTO v_parceiro
  FROM parceiros_comerciais pc
  WHERE pc.ativo = true
    AND (
      lower(unaccent(pc.razao_social)) LIKE '%' || v_token || '%'
      OR (pc.nome_fantasia IS NOT NULL AND lower(unaccent(pc.nome_fantasia)) LIKE '%' || v_token || '%')
    )
  LIMIT 1;

  v_score := LEAST(95, 60 + length(v_token) * 4);

  IF v_score >= 80 THEN
    -- Atualiza lançamento
    UPDATE fatura_cartao_lancamentos fcl
    SET parceiro_id = v_parceiro.id,
        cnpj_estabelecimento = COALESCE(v_parceiro.cnpj, fcl.cnpj_estabelecimento),
        updated_at = now()
    WHERE fcl.id = p_lancamento_id;

    -- B-51 fix: plano_contas_id (renomeada em §3.2 - 18/05/2026)
    -- Cria regra automatica; valor vem de fatura_cartao_lancamentos.plano_contas_id
    -- (tabela tambem foi renomeada na mesma migration)
    INSERT INTO regras_categorizacao (
      plano_contas_id,
      parceiro_id,
      cnpj_emitente,
      token_principal,
      descricao_contem,
      escopo_origem,
      confianca,
      aprendida_automaticamente,
      ativo,
      criado_por
    )
    SELECT
      COALESCE(
        (SELECT fcl2.plano_contas_id FROM fatura_cartao_lancamentos fcl2 WHERE fcl2.id = p_lancamento_id),
        (SELECT pc2.id FROM plano_contas pc2 WHERE pc2.codigo = '05.99' LIMIT 1),
        (SELECT pc3.id FROM plano_contas pc3 LIMIT 1)
      ),
      v_parceiro.id,
      v_parceiro.cnpj,
      v_token,
      v_token,
      'cartao',
      0.7,
      true,
      true,
      NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM regras_categorizacao r
      WHERE r.token_principal = v_token
        AND r.parceiro_id = v_parceiro.id
        AND r.ativo = true
    );

    out_parceiro_id := v_parceiro.id;
    out_cnpj := v_parceiro.cnpj;
    out_fonte := 'match_parceiro';
    out_score := v_score;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Não atingiu score mínimo
  out_parceiro_id := NULL; out_cnpj := NULL;
  out_fonte := 'nenhuma'; out_score := v_score;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.enriquecer_parceiro_com_bancarios(p_parceiro_id uuid, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parceiro RECORD;
  v_dados_atuais JSONB;
  v_dados_novos JSONB;
  v_mudancas JSONB := '[]'::jsonb;
  v_campo TEXT;
  v_valor_antes TEXT;
  v_valor_novo TEXT;
BEGIN
  -- Carrega parceiro
  SELECT * INTO v_parceiro FROM parceiros_comerciais WHERE id = p_parceiro_id;
  IF v_parceiro.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Parceiro não encontrado');
  END IF;

  v_dados_atuais := COALESCE(v_parceiro.dados_bancarios, '{}'::jsonb);
  v_dados_novos := v_dados_atuais;

  -- Merge inteligente: para cada campo válido em p_dados, atualiza
  -- Só sobrescreve se valor novo é diferente E não é vazio/null
  FOR v_campo IN SELECT jsonb_object_keys(p_dados)
  LOOP
    v_valor_novo := p_dados->>v_campo;

    -- Pula valores vazios/nulos
    IF v_valor_novo IS NULL OR length(trim(v_valor_novo)) = 0 THEN
      CONTINUE;
    END IF;

    v_valor_antes := v_dados_atuais->>v_campo;

    -- Atualiza se diferente
    IF v_valor_antes IS DISTINCT FROM v_valor_novo THEN
      v_dados_novos := v_dados_novos || jsonb_build_object(v_campo, v_valor_novo);

      v_mudancas := v_mudancas || jsonb_build_object(
        'campo', v_campo,
        'antes', v_valor_antes,
        'depois', v_valor_novo
      );
    END IF;
  END LOOP;

  -- Atualiza só se houve mudança
  IF jsonb_array_length(v_mudancas) > 0 THEN
    UPDATE parceiros_comerciais
    SET dados_bancarios = v_dados_novos,
        updated_at = now()
    WHERE id = p_parceiro_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'parceiro_id', p_parceiro_id,
    'dados_atuais', v_dados_novos,
    'mudancas', v_mudancas,
    'qtd_campos_atualizados', jsonb_array_length(v_mudancas)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.enriquecer_todos_lancamentos_cartao()
 RETURNS TABLE(total_processados integer, enriquecidos integer, ambiguos integer, sem_match integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc RECORD;
  v_resultado RECORD;
  v_total INTEGER := 0;
  v_enriq INTEGER := 0;
  v_amb INTEGER := 0;
  v_nada INTEGER := 0;
BEGIN
  FOR v_lanc IN
    SELECT fcl.id
    FROM fatura_cartao_lancamentos fcl
    WHERE fcl.parceiro_id IS NULL
  LOOP
    v_total := v_total + 1;
    SELECT * INTO v_resultado FROM enriquecer_lancamento_cartao(v_lanc.id);

    IF v_resultado.out_fonte IN ('regra_categorizacao', 'match_parceiro') THEN
      v_enriq := v_enriq + 1;
    ELSIF v_resultado.out_fonte = 'ambiguo' THEN
      v_amb := v_amb + 1;
    ELSE
      v_nada := v_nada + 1;
    END IF;
  END LOOP;

  total_processados := v_total;
  enriquecidos := v_enriq;
  ambiguos := v_amb;
  sem_match := v_nada;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.enviar_email_apos_aprovacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  job_id BIGINT;
  v_url TEXT := 'https://vaxzorhqzvsnkutrlvfr.supabase.co/functions/v1/enviar-email-conta-aprovada';
  v_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZheHpvcmhxenZzbmt1dHJsdmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDM5MzEsImV4cCI6MjA5MTE3OTkzMX0.swcTnDGewlzfN_a2EIHOcy59T55Xs1rmmH8B_1rmi7s';
BEGIN
  IF NEW.status = 'aprovado'
     AND (OLD.status IS NULL OR OLD.status != 'aprovado')
     AND NEW.email_enviado_em IS NULL THEN

    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object('contaId', NEW.id)
    ) INTO job_id;

    RAISE NOTICE 'Email job criado: %', job_id;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.enviar_pedido_compra(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_pedido RECORD;
  v_itens_invalidos INTEGER;
  v_itens_total INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado';
  END IF;
  
  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id; END IF;
  IF v_pedido.solicitante_id != v_user_id THEN
    RAISE EXCEPTION 'Apenas o Solicitante pode enviar o pedido';
  END IF;
  IF v_pedido.status != 'rascunho' THEN
    RAISE EXCEPTION 'Pedido soh pode ser enviado a partir de RASCUNHO (atual: %)', v_pedido.status;
  END IF;
  IF v_pedido.descricao_geral IS NULL OR LENGTH(TRIM(v_pedido.descricao_geral)) = 0 THEN
    RAISE EXCEPTION 'Descricao geral e obrigatoria';
  END IF;
  IF v_pedido.justificativa IS NULL OR LENGTH(TRIM(v_pedido.justificativa)) = 0 THEN
    RAISE EXCEPTION 'Justificativa e obrigatoria';
  END IF;
  IF v_pedido.centro_custo_id IS NULL THEN
    RAISE EXCEPTION 'Centro de custo e obrigatorio';
  END IF;
  
  SELECT COUNT(*) INTO v_itens_total FROM public.pedidos_compra_itens WHERE pedido_id = p_pedido_id;
  IF v_itens_total = 0 THEN RAISE EXCEPTION 'Pedido precisa ter pelo menos 1 item'; END IF;
  
  SELECT COUNT(*) INTO v_itens_invalidos
    FROM public.pedidos_compra_itens
   WHERE pedido_id = p_pedido_id
     AND (descricao IS NULL OR LENGTH(TRIM(descricao)) = 0
          OR quantidade <= 0 OR valor_estimado_unitario <= 0);
  IF v_itens_invalidos > 0 THEN
    RAISE EXCEPTION '% itens com dados invalidos (descricao, quantidade ou valor)', v_itens_invalidos;
  END IF;
  
  UPDATE public.pedidos_compra SET status = 'aberto', enviado_em = now() WHERE id = p_pedido_id;
  
  PERFORM public.fn_log_evento_pedido(
    p_pedido_id, 'pedido_enviado',
    jsonb_build_object('itens_total', v_itens_total),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id, 'status', 'aberto',
    'enviado_em', now(), 'itens_total', v_itens_total
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.excluir_comentario_pedido(p_comentario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_comentario RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  
  SELECT * INTO v_comentario FROM public.comentarios_pedido WHERE id = p_comentario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comentario % nao encontrado', p_comentario_id; END IF;
  
  IF v_comentario.excluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Comentario jah esta excluido';
  END IF;
  
  -- Autor (qualquer hora) OU super_admin
  IF v_comentario.autor_id != v_user_id
     AND NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissao para excluir este comentario';
  END IF;
  
  UPDATE public.comentarios_pedido
     SET excluido_em = now(),
         excluido_por = v_user_id
   WHERE id = p_comentario_id;
  
  PERFORM public.fn_log_evento_pedido(
    v_comentario.pedido_id, 'comentario_excluido',
    jsonb_build_object(
      'comentario_id', p_comentario_id,
      'autor_original', v_comentario.autor_id
    ),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'comentario_id', p_comentario_id,
    'excluido_em', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.excluir_compra_registrada(p_compra_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_compra RECORD;
  v_cprs_com_movimentacao INTEGER;
  v_cprs_canceladas INTEGER := 0;
  v_itens_reabertos INTEGER := 0;
  v_pedido_status_atual pedido_compra_status_enum;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  IF NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas Comprador/super_admin pode excluir compra';
  END IF;
  IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo de exclusao eh obrigatorio (minimo 5 caracteres)';
  END IF;
  
  SELECT * INTO v_compra FROM public.compras_registradas WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra % nao encontrada', p_compra_id; END IF;
  IF v_compra.status = 'excluida' THEN RAISE EXCEPTION 'Compra jah esta excluida'; END IF;
  
  SELECT COUNT(*) INTO v_cprs_com_movimentacao
    FROM public.contas_pagar_receber
   WHERE compra_registrada_id = p_compra_id
     AND movimentacao_bancaria_id IS NOT NULL;
  
  IF v_cprs_com_movimentacao > 0 THEN
    RAISE EXCEPTION 'Compra nao pode ser excluida: % CPR(s) jah tem movimentacao bancaria registrada', v_cprs_com_movimentacao;
  END IF;
  
  UPDATE public.compras_registradas
     SET status = 'excluida', excluida_em = now(),
         excluida_por = v_user_id, excluida_motivo = TRIM(p_motivo)
   WHERE id = p_compra_id;
  
  UPDATE public.contas_pagar_receber
     SET status = 'cancelado',
         observacao = COALESCE(observacao, '') || E'\n[Cancelada por exclusao da compra registrada: ' || p_motivo || ']'
   WHERE compra_registrada_id = p_compra_id
     AND status NOT IN ('pago', 'cancelado');
  
  GET DIAGNOSTICS v_cprs_canceladas = ROW_COUNT;
  
  UPDATE public.pedidos_compra_itens
     SET status = 'pendente'
   WHERE id IN (
     SELECT pedido_item_id FROM public.compras_registradas_itens
      WHERE compra_registrada_id = p_compra_id
   )
   AND status = 'comprado';
  
  GET DIAGNOSTICS v_itens_reabertos = ROW_COUNT;
  
  IF v_compra.pedido_id IS NOT NULL THEN
    UPDATE public.pedidos_compra
       SET status = 'em_compra',
           finalizado_em = NULL, cancelado_em = NULL, cancelamento_motivo = NULL
     WHERE id = v_compra.pedido_id
       AND status IN ('comprado', 'cancelado')
       AND comprador_id IS NOT NULL;
  END IF;
  
  SELECT status INTO v_pedido_status_atual FROM public.pedidos_compra WHERE id = v_compra.pedido_id;
  
  -- Audit + evento timeline
  INSERT INTO public.compras_registradas_audit_log (compra_registrada_id, acao, payload, usuario_id)
  VALUES (
    p_compra_id, 'COMPRA_EXCLUIDA',
    jsonb_build_object(
      'motivo', p_motivo,
      'cprs_canceladas', v_cprs_canceladas,
      'itens_reabertos', v_itens_reabertos,
      'pedido_status_atual', v_pedido_status_atual
    ),
    v_user_id
  );
  
  PERFORM public.fn_log_evento_pedido(
    v_compra.pedido_id, 'compra_excluida',
    jsonb_build_object(
      'compra_id', p_compra_id,
      'motivo', p_motivo,
      'cprs_canceladas', v_cprs_canceladas,
      'itens_reabertos', v_itens_reabertos
    ),
    v_user_id
  );
  
  RETURN jsonb_build_object(
    'compra_id', p_compra_id, 'status', 'excluida',
    'cprs_canceladas', v_cprs_canceladas,
    'itens_reabertos', v_itens_reabertos,
    'pedido_status', v_pedido_status_atual
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.excluir_parceiro_seguro(p_parceiro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_refs INTEGER := 0;
  v_pasta_id UUID;
  v_docs INTEGER := 0;
  v_resultado TEXT;
  v_razao_social TEXT;
BEGIN
  -- Captura razao_social para retorno (e valida que existe)
  SELECT razao_social INTO v_razao_social
  FROM parceiros_comerciais
  WHERE id = p_parceiro_id;

  IF v_razao_social IS NULL THEN
    RAISE EXCEPTION 'Parceiro % nao encontrado', p_parceiro_id;
  END IF;

  -- Conta refs em todas as 15 FKs
  SELECT
    (SELECT COUNT(*) FROM compras_registradas       WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM compromissos_parcelados   WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM compromissos_recorrentes  WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM contas_pagar_receber      WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM contratos_pj              WHERE parceiro_comercial_id = p_parceiro_id) +
    (SELECT COUNT(*) FROM fatura_cartao_lancamentos WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM ged_documentos            WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM grupos_parceiros_log      WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM itau_pagamentos_stage     WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM nfs_stage                 WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM pedidos_compra            WHERE parceiro_preferencial_id = p_parceiro_id) +
    (SELECT COUNT(*) FROM pedidos_venda             WHERE parceiro_id           = p_parceiro_id) +
    (SELECT COUNT(*) FROM regras_categorizacao      WHERE fornecedor_id = p_parceiro_id OR parceiro_id = p_parceiro_id)
  INTO v_refs;

  -- Conta documentos da pasta ativa
  SELECT id INTO v_pasta_id
  FROM ged_pastas
  WHERE parceiro_id = p_parceiro_id AND ativa = TRUE
  LIMIT 1;

  IF v_pasta_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_docs FROM ged_documentos WHERE pasta_id = v_pasta_id;
  END IF;

  -- Decisao
  IF v_refs > 0 OR v_docs > 0 THEN
    -- Tem historico: inativa
    UPDATE parceiros_comerciais SET ativo = FALSE WHERE id = p_parceiro_id;
    v_resultado := 'inativado';
  ELSE
    -- Sem historico: deleta pasta vazia + parceiro
    IF v_pasta_id IS NOT NULL THEN
      DELETE FROM ged_pastas WHERE id = v_pasta_id;
    END IF;
    DELETE FROM parceiros_comerciais WHERE id = p_parceiro_id;
    v_resultado := 'excluido';
  END IF;

  RETURN jsonb_build_object(
    'resultado',     v_resultado,
    'razao_social',  v_razao_social,
    'refs_count',    v_refs,
    'docs_count',    v_docs,
    'parceiro_id',   p_parceiro_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.executar_pagamento(p_cpr_id uuid, p_dados_pagamento jsonb, p_forma_pagamento_id uuid, p_numero_parcela integer DEFAULT 1, p_observacao text DEFAULT NULL::text, p_email_destinatario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
DECLARE 
  v_cpr RECORD; 
  v_status_anterior TEXT; 
  v_bola_redonda BOOLEAN; 
  v_o_que_falta TEXT[]; 
  v_pendencia BOOLEAN; 
  v_enriq_resultado JSONB; 
  v_enriq_qtd INT := 0; 
  v_observacao_final TEXT; 
BEGIN
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN 
    RETURN jsonb_build_object('ok', false, 'erro', 'Apenas super_admin pode executar pagamento em V1'); 
  END IF;

  SELECT id, status, parceiro_id, valor, forma_pagamento_id, numero_parcela 
    INTO v_cpr 
    FROM public.contas_pagar_receber 
    WHERE id = p_cpr_id; 
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('ok', false, 'erro', 'CPR nao encontrada'); 
  END IF; 
  v_status_anterior := v_cpr.status;

  IF v_status_anterior NOT IN ('aberto', 'aprovado') THEN 
    RETURN jsonb_build_object(
      'ok', false, 
      'erro', 'Status atual nao permite executar pagamento', 
      'status_atual', v_status_anterior, 
      'permitidos', ARRAY['aberto', 'aprovado']
    ); 
  END IF;

  IF p_dados_pagamento IS NULL THEN 
    p_dados_pagamento := '{}'::jsonb; 
  END IF;

  UPDATE public.contas_pagar_receber 
    SET forma_pagamento_id = p_forma_pagamento_id 
    WHERE id = p_cpr_id;

  SELECT bola_redonda, o_que_falta 
    INTO v_bola_redonda, v_o_que_falta 
    FROM public.v_cpr_bola_redonda 
    WHERE cpr_id = p_cpr_id; 
  v_pendencia := NOT COALESCE(v_bola_redonda, FALSE);

  -- Doutrina #95: status terminal é 'enviado_para_pagamento'
  UPDATE public.contas_pagar_receber 
    SET status = 'enviado_para_pagamento', 
        dados_pagamento_fornecedor = p_dados_pagamento, 
        numero_parcela = COALESCE(p_numero_parcela, numero_parcela, 1), 
        enviado_pagamento_em = now(), 
        enviado_pagamento_por = auth.uid(), 
        observacao_pagamento = p_observacao, 
        pagamento_com_pendencia = v_pendencia, 
        pendencias_no_envio = CASE WHEN v_pendencia THEN v_o_que_falta ELSE NULL END, 
        updated_at = now() 
    WHERE id = p_cpr_id;

  v_observacao_final := COALESCE(p_observacao, ''); 
  IF p_email_destinatario IS NOT NULL THEN 
    v_observacao_final := CASE 
      WHEN v_observacao_final = '' THEN 'Enviado para: ' || p_email_destinatario 
      ELSE v_observacao_final || ' | Enviado para: ' || p_email_destinatario 
    END; 
  END IF;

  INSERT INTO public.contas_pagar_historico (
    conta_id, status_anterior, status_novo, observacao, usuario_id
  ) VALUES (
    p_cpr_id, v_status_anterior, 'enviado_para_pagamento', v_observacao_final, auth.uid()
  );

  IF v_cpr.parceiro_id IS NOT NULL AND ( 
    (p_dados_pagamento ->> 'banco') IS NOT NULL AND (p_dados_pagamento ->> 'banco') <> '' 
    OR (p_dados_pagamento ->> 'agencia') IS NOT NULL AND (p_dados_pagamento ->> 'agencia') <> '' 
    OR (p_dados_pagamento ->> 'conta') IS NOT NULL AND (p_dados_pagamento ->> 'conta') <> '' 
    OR (p_dados_pagamento ->> 'pix') IS NOT NULL AND (p_dados_pagamento ->> 'pix') <> '' 
  ) THEN 
    BEGIN 
      v_enriq_resultado := public.enriquecer_parceiro_com_bancarios(
        v_cpr.parceiro_id, 
        jsonb_build_object(
          'banco', p_dados_pagamento ->> 'banco', 
          'agencia', p_dados_pagamento ->> 'agencia', 
          'conta', p_dados_pagamento ->> 'conta', 
          'pix', p_dados_pagamento ->> 'pix'
        )
      ); 
      v_enriq_qtd := COALESCE((v_enriq_resultado ->> 'qtd_campos_atualizados')::int, 0); 
    EXCEPTION WHEN OTHERS THEN 
      v_enriq_resultado := jsonb_build_object('erro', SQLERRM); 
      v_enriq_qtd := 0; 
    END; 
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 
    'cpr_id', p_cpr_id, 
    'status_anterior', v_status_anterior, 
    'novo_status', 'enviado_para_pagamento', 
    'bola_redonda', COALESCE(v_bola_redonda, FALSE), 
    'pagamento_com_pendencia', v_pendencia, 
    'pendencias', COALESCE(v_o_que_falta, ARRAY[]::TEXT[]), 
    'enriquecimento_parceiro', jsonb_build_object(
      'tentado', v_cpr.parceiro_id IS NOT NULL, 
      'qtd_campos_atualizados', v_enriq_qtd
    )
  ); 
END; 
$function$;
CREATE OR REPLACE FUNCTION public.exportar_pacote_documentos(p_periodo_inicio date, p_periodo_fim date)
 RETURNS TABLE(conta_id uuid, parceiro_razao_social text, conta_descricao text, conta_valor numeric, conta_data_pagamento date, doc_id uuid, doc_tipo text, doc_nome_arquivo text, doc_storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cpr.id AS conta_id,
    COALESCE(pc.razao_social, cpr.fornecedor_cliente, 'Sem fornecedor') AS parceiro_razao_social,
    cpr.descricao AS conta_descricao,
    cpr.valor AS conta_valor,
    cpr.data_pagamento AS conta_data_pagamento,
    cpd.id AS doc_id,
    cpd.tipo AS doc_tipo,
    cpd.nome_arquivo AS doc_nome_arquivo,
    cpd.storage_path AS doc_storage_path
  FROM contas_pagar_receber cpr
  LEFT JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
  INNER JOIN contas_pagar_documentos cpd ON cpd.conta_pagar_id = cpr.id  -- H-02: era conta_id
  WHERE cpr.tipo = 'pagar'
    AND cpr.data_pagamento BETWEEN p_periodo_inicio AND p_periodo_fim
  ORDER BY parceiro_razao_social ASC, cpr.data_pagamento ASC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.extrair_token_principal(p_descricao text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_descricao_norm TEXT;
  v_token TEXT;
BEGIN
  v_descricao_norm := lower(unaccent(coalesce(p_descricao, '')));
  -- remove marcadores de parcela "01/10"
  v_descricao_norm := regexp_replace(v_descricao_norm, '\s+\d{1,2}/\d{1,2}\s*', ' ', 'g');
  -- colapsa espaços
  v_descricao_norm := regexp_replace(v_descricao_norm, '\s+', ' ', 'g');
  -- remove prefixos comuns ()) MP* PG* PPRO )))
  v_descricao_norm := regexp_replace(v_descricao_norm, '^[\)\(\*\s]+', '', 'g');
  v_descricao_norm := regexp_replace(v_descricao_norm, '\s*(mp\*|pg\*|ppro\*|mlp\*)\s*', ' ', 'g');

  -- Pega o token mais longo, descartando ruído
  WITH tokens AS (
    SELECT unnest(string_to_array(v_descricao_norm, ' ')) AS tok
  ),
  filtrados AS (
    SELECT tok
    FROM tokens
    WHERE length(tok) >= 5
      AND tok NOT IN (
        'diversos', 'turismo', 'entretenim', 'alimentacao', 'compras',
        'servicos', 'comercio', 'pagamento', 'transferencia', 'paulo',
        'vestuario', 'limeira', 'viana', 'andre', 'santo', 'cidade'
      )
      AND tok !~ '^\d+$'
  )
  SELECT tok INTO v_token FROM filtrados
  ORDER BY length(tok) DESC LIMIT 1;

  RETURN v_token;
END;
$function$;
CREATE OR REPLACE FUNCTION public.finalizar_conciliacao_v2(p_itau_pag_id uuid, p_movimentacao_id uuid, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pag        RECORD;
  v_mov        RECORD;
  v_lote_ids   uuid[];
  v_lote_cprs  uuid[];
  v_soma_lote  NUMERIC;
  v_agrup_id   uuid;
BEGIN
  -- 1. Carregar item da planilha
  SELECT * INTO v_pag
    FROM itau_pagamentos_stage
   WHERE id = p_itau_pag_id;

  IF v_pag.id IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'Item da planilha não encontrado');
  END IF;

  IF v_pag.conta_pagar_id IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'Stage 1 não concluído — vincule uma CPR primeiro');
  END IF;

  -- 2. Carregar movimentação bancária
  SELECT * INTO v_mov
    FROM movimentacoes_bancarias
   WHERE id = p_movimentacao_id;

  IF v_mov.id IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'Movimentação bancária não encontrada');
  END IF;

  -- 3. Verificar se é LOTE
  IF v_pag.numero_lote IS NOT NULL AND v_pag.numero_lote <> '-' THEN

    -- Pegar todos os IDs e CPRs do lote
    SELECT
      ARRAY_AGG(id),
      ARRAY_AGG(conta_pagar_id),
      SUM(valor_pago)
    INTO v_lote_ids, v_lote_cprs, v_soma_lote
    FROM itau_pagamentos_stage
    WHERE importacao_id = v_pag.importacao_id
      AND numero_lote   = v_pag.numero_lote;

    -- Criar conciliacao_agrupada (1 mov : N CPRs)
    INSERT INTO conciliacoes_agrupadas (
      movimentacao_id, soma_esperada, soma_real, criado_por
    ) VALUES (
      p_movimentacao_id, v_soma_lote, ABS(v_mov.valor), p_usuario_id
    )
    RETURNING id INTO v_agrup_id;

    -- Inserir itens do agrupamento
    INSERT INTO conciliacoes_agrupadas_itens (agrupamento_id, conta_pagar_id)
    SELECT v_agrup_id, unnest(v_lote_cprs);

    -- Marcar cada CPR do lote como paga via movimentação existente
    UPDATE contas_pagar_receber
       SET status                = 'paga',
           movimentacao_bancaria_id = p_movimentacao_id,
           data_pagamento        = v_mov.data_transacao,
           pago_em_conta_id      = v_mov.conta_bancaria_id
     WHERE id = ANY(v_lote_cprs)
       AND movimentacao_bancaria_id IS NULL;  -- idempotente

    -- Marcar todos os itens do lote como conciliados
    UPDATE itau_pagamentos_stage
       SET movimentacao_id      = p_movimentacao_id,
           status_conciliacao   = 'conciliado'
     WHERE id = ANY(v_lote_ids);

  ELSE
    -- 1:1 — individual

    -- Marcar CPR como paga via movimentação existente
    -- (setar movimentacao_bancaria_id ANTES de mudar status
    --  para evitar que trigger crie mov duplicada)
    UPDATE contas_pagar_receber
       SET movimentacao_bancaria_id = p_movimentacao_id,
           status                   = 'paga',
           data_pagamento           = v_mov.data_transacao,
           pago_em_conta_id         = v_mov.conta_bancaria_id
     WHERE id = p_itau_pag_id;

    -- Vincular movimentação à CPR
    UPDATE movimentacoes_bancarias
       SET conta_pagar_id = v_pag.conta_pagar_id,
           conciliado     = true,
           conciliado_em  = now(),
           conciliado_por = p_usuario_id
     WHERE id = p_movimentacao_id;

    -- Atualizar item da planilha
    UPDATE itau_pagamentos_stage
       SET movimentacao_id    = p_movimentacao_id,
           status_conciliacao = 'conciliado'
     WHERE id = p_itau_pag_id;

  END IF;

  RETURN json_build_object(
    'ok',              true,
    'eh_lote',         (v_pag.numero_lote IS NOT NULL AND v_pag.numero_lote <> '-'),
    'conta_pagar_id',  v_pag.conta_pagar_id,
    'movimentacao_id', p_movimentacao_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_alocar_trilha_pedido(p_pedido_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forma text;
  v_destino text;
  v_proxima_acao text;
  v_area text;
BEGIN
  SELECT lower(trim(p.forma_solicitada)) INTO v_forma
  FROM public.pedidos p WHERE p.id = p_pedido_id;

  -- Regra de alocação:
  -- PIX/cartão = à vista, sem análise (não há crédito a avaliar)
  -- Boleto = TODO boleto passa por análise, sem exceção (cravado 30/05)
  v_destino := CASE
    WHEN v_forma IN ('cartao', 'pix') THEN 'credito_aprovado'
    WHEN v_forma = 'boleto' THEN 'em_analise_credito'
    ELSE NULL
  END;

  IF v_destino IS NULL THEN
    RETURN NULL;
  END IF;

  v_proxima_acao := CASE
    WHEN v_destino = 'credito_aprovado' AND v_forma IN ('cartao', 'pix')
      THEN 'Aguardando pagamento de entrada (' || v_forma || ')'
    WHEN v_destino = 'em_analise_credito'
      THEN 'Análise de crédito antes de prosseguir'
  END;

  v_area := CASE
    WHEN v_destino = 'em_analise_credito' THEN 'credito'
    ELSE 'sops'
  END;

  UPDATE public.pedidos
  SET estagio = v_destino,
      area_atual = v_area,
      proxima_acao = v_proxima_acao
  WHERE id = p_pedido_id;

  RETURN v_destino;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_aplicar_cadencia_credito(p_analise_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_analise record;
  v_pedido record;
  v_parceiro record;
  v_regra record;
  v_match boolean;
  v_perfis text[];
  v_titulos_pagos int;
BEGIN
  -- 1. Carrega contexto
  SELECT id, pedido_id, parceiro_id, status_final, perfil_aplicado
  INTO v_analise FROM analises_credito WHERE id = p_analise_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Análise já decidida: não interfere
  IF v_analise.status_final IS NOT NULL THEN RETURN NULL; END IF;

  SELECT id, valor_liquido, forma_solicitada, condicao_solicitada
  INTO v_pedido FROM pedidos WHERE id = v_analise.pedido_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id, perfil_credito, bandeira_vermelha
  INTO v_parceiro FROM parceiros_comerciais WHERE id = v_analise.parceiro_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Conta títulos pagos no prazo (status=pago AND data_pagamento <= vencimento_atual)
  SELECT COUNT(*)::int INTO v_titulos_pagos
  FROM titulo_a_receber t
  JOIN pedidos pe ON pe.id = t.pedido_id
  WHERE pe.parceiro_id = v_parceiro.id
    AND t.status = 'pago'
    AND t.data_pagamento::date <= t.data_vencimento_atual;

  -- 2. Itera regras ativas em ordem
  FOR v_regra IN
    SELECT id, nome, criterio, condicao_default, parecer_template
    FROM regras_cadencia_credito
    WHERE ativa = true
    ORDER BY ordem ASC, criado_em DESC
  LOOP
    v_match := true;

    -- Critério perfil_in
    IF v_regra.criterio ? 'perfil_in' THEN
      v_perfis := ARRAY(SELECT jsonb_array_elements_text(v_regra.criterio -> 'perfil_in'));
      IF NOT (v_parceiro.perfil_credito = ANY(v_perfis)) THEN
        v_match := false;
      END IF;
    END IF;

    -- Critério valor_max
    IF v_match AND v_regra.criterio ? 'valor_max' THEN
      IF v_pedido.valor_liquido > (v_regra.criterio ->> 'valor_max')::numeric THEN
        v_match := false;
      END IF;
    END IF;

    -- Critério sem_bandeira
    IF v_match AND v_regra.criterio ? 'sem_bandeira'
       AND (v_regra.criterio ->> 'sem_bandeira')::boolean = true THEN
      IF v_parceiro.bandeira_vermelha = true THEN
        v_match := false;
      END IF;
    END IF;

    -- Critério titulos_pagos_no_prazo_min
    IF v_match AND v_regra.criterio ? 'titulos_pagos_no_prazo_min' THEN
      IF v_titulos_pagos < (v_regra.criterio ->> 'titulos_pagos_no_prazo_min')::int THEN
        v_match := false;
      END IF;
    END IF;

    -- 3. Match: marca pré-aprovação e sai
    IF v_match THEN
      UPDATE analises_credito
      SET pre_aprovado_regra_id = v_regra.id,
          pre_aprovacao_em = now(),
          pre_aprovacao_payload = jsonb_build_object(
            'regra_id', v_regra.id,
            'regra_nome', v_regra.nome,
            'condicao_sugerida', COALESCE(
              v_regra.condicao_default,
              -- Fallback: gera condição a partir da solicitada do pedido
              public.fn_parse_condicao(
                v_pedido.condicao_solicitada,
                v_pedido.valor_liquido,
                CURRENT_DATE
              )
            ),
            'parecer_sugerido', COALESCE(
              v_regra.parecer_template,
              'Pré-aprovado pela regra "' || v_regra.nome || '" — ' ||
              'perfil ' || COALESCE(v_parceiro.perfil_credito, 'indefinido') ||
              ', ' || v_titulos_pagos || ' título(s) pago(s) no prazo.'
            )
          )
      WHERE id = p_analise_id;

      RETURN v_regra.id;
    END IF;
  END LOOP;

  -- Nenhuma regra match
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_atualizar_status_fatura_cartao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fatura_id uuid;
  v_qtd_total int;
  v_qtd_pendentes int;
  v_novo_status text;
BEGIN
  -- Identifica a fatura afetada (NEW pra INSERT/UPDATE, OLD pra DELETE)
  IF TG_OP = 'DELETE' THEN
    v_fatura_id := OLD.fatura_id;
  ELSE
    v_fatura_id := NEW.fatura_id;
  END IF;

  IF v_fatura_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Conta lançamentos e pendentes da fatura
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'pendente')
  INTO v_qtd_total, v_qtd_pendentes
  FROM fatura_cartao_lancamentos
  WHERE fatura_id = v_fatura_id;

  -- Decide novo status: paga só se há lançamentos E nenhum pendente
  v_novo_status := CASE
    WHEN v_qtd_total > 0 AND v_qtd_pendentes = 0 THEN 'paga'
    ELSE 'aberta'
  END;

  -- Atualiza só se mudou e a fatura não está em status terminal
  -- (cancelada = arquivada; conciliada = já foi além de paga via reconciliação bancária)
  UPDATE faturas_cartao
  SET status = v_novo_status, updated_at = now()
  WHERE id = v_fatura_id
    AND status <> v_novo_status
    AND status NOT IN ('cancelada', 'conciliada');

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cpr_doc_para_ged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_parceiro_id UUID; v_pasta_id UUID;
  TIPOS_NOBRES TEXT[] := ARRAY['nf', 'boleto', 'contrato', 'orcamento', 'proposta'];
BEGIN
  IF NOT (NEW.tipo = ANY(TIPOS_NOBRES)) THEN RETURN NEW; END IF;
  SELECT parceiro_id INTO v_parceiro_id
  FROM public.contas_pagar_receber WHERE id = NEW.conta_pagar_id;   -- §3.5
  IF v_parceiro_id IS NULL THEN RETURN NEW; END IF;
  v_pasta_id := public.fn_obter_ou_criar_pasta_parceiro(v_parceiro_id);
  INSERT INTO public.ged_documentos (
    pasta_id, parceiro_id, nome, arquivo_original,
    tipo_documento, storage_path, tamanho_bytes
  ) VALUES (
    v_pasta_id, v_parceiro_id, NEW.nome_arquivo, NEW.nome_arquivo,
    NEW.tipo, NEW.storage_path, NEW.tamanho_bytes
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cpr_enviada_para_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_mov_id UUID;
  v_meio_code TEXT;
  v_deve_gerar BOOLEAN := false;
BEGIN
  -- Caso 1 (antigo): status virou enviado_para_pagamento e pago_em_conta_id já preenchido
  IF NEW.status = 'enviado_para_pagamento'
     AND (OLD.status IS DISTINCT FROM 'enviado_para_pagamento')
     AND NEW.movimentacao_bancaria_id IS NULL
     AND NEW.pago_em_conta_id IS NOT NULL THEN
    v_deve_gerar := true;
  END IF;

  -- Caso 2 (NOVO): pago_em_conta_id mudou de NULL→valor (vindo da conciliação)
  --                e CPR já está em status que aceita movimentação
  IF NEW.pago_em_conta_id IS NOT NULL
     AND OLD.pago_em_conta_id IS NULL
     AND NEW.movimentacao_bancaria_id IS NULL
     AND NEW.status IN ('enviado_para_pagamento', 'pago', 'conciliado') THEN
    v_deve_gerar := true;
  END IF;

  IF v_deve_gerar THEN
    -- Cartão: NUNCA gera movimentação automática (fatura paga depois gera)
    SELECT mp.codigo INTO v_meio_code
      FROM public.meios_pagamento mp
     WHERE mp.id = NEW.meio_pagamento_id;

    IF v_meio_code = 'fatura_cartao' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.movimentacoes_bancarias (
      conta_bancaria_id, data_transacao, descricao, valor, tipo,
      conta_pagar_id, plano_contas_id, origem, pg_em, conciliado, cartao_id
    ) VALUES (
      NEW.pago_em_conta_id, COALESCE(NEW.data_pagamento, CURRENT_DATE),
      NEW.descricao, -ABS(NEW.valor), 'debito', NEW.id, NEW.plano_contas_id,
      NEW.origem, NULL, false, NEW.cartao_id
    ) RETURNING id INTO v_mov_id;

    NEW.movimentacao_bancaria_id := v_mov_id;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cpr_set_meio_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.meio_pagamento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.forma_pagamento_id IS NOT NULL THEN
    SELECT meio_default_id
      INTO NEW.meio_pagamento_id
      FROM public.formas_pagamento
     WHERE id = NEW.forma_pagamento_id;
  END IF;

  IF NEW.meio_pagamento_id IS NULL THEN
    SELECT id INTO NEW.meio_pagamento_id
      FROM public.meios_pagamento
     WHERE codigo = 'a_vista';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_criar_analise_desde_pedido(p_pedido_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_analise_id uuid;
  v_parceiro_id uuid;
BEGIN
  -- Idempotência: já existe análise pra esse pedido?
  SELECT id INTO v_analise_id
  FROM analises_credito
  WHERE pedido_id = p_pedido_id;

  IF v_analise_id IS NOT NULL THEN
    RETURN v_analise_id;
  END IF;

  SELECT parceiro_id INTO v_parceiro_id FROM pedidos WHERE id = p_pedido_id;

  IF v_parceiro_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado ou sem parceiro_id', p_pedido_id;
  END IF;

  INSERT INTO analises_credito (pedido_id, parceiro_id, estagio_atual)
  VALUES (p_pedido_id, v_parceiro_id, 'entrada')
  RETURNING id INTO v_analise_id;

  INSERT INTO analise_credito_transicoes (analise_id, acao, estagio_destino, motivo)
  VALUES (v_analise_id, 'digitado', 'entrada',
          'Pedido encaminhado pra análise via Casa dos Pedidos');

  RETURN v_analise_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_criar_pasta_para_parceiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_area_id UUID;
BEGIN
  SELECT id INTO v_area_id
  FROM public.ged_areas
  WHERE codigo = 'parceiro'
  LIMIT 1;

  INSERT INTO public.ged_pastas (
    nome,
    parceiro_id,
    tipo,
    area_id,
    status,
    ativa
  )
  SELECT
    NEW.razao_social,
    NEW.id,
    NULL,           -- tipo só é preenchido quando aparecer operação específica
    v_area_id,
    'ativo',
    TRUE
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.ged_pastas
    WHERE parceiro_id = NEW.id
  );

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_cron_rolling_contratos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato    public.pasta_contratos%ROWTYPE;
  v_pasta       public.ged_pastas%ROWTYPE;
  v_ultima_data date;
  v_alvo        date;
  v_prox_data   date;
  v_intervalo   interval;
  v_meio_id     uuid;
  v_cpr_id      uuid;
  v_parcela_id  uuid;
  v_num_parcela int;
  v_count       int := 0;
  v_descricao   text;
BEGIN
  v_alvo := (CURRENT_DATE + INTERVAL '3 months')::date;

  FOR v_contrato IN
    SELECT * FROM public.pasta_contratos
    WHERE COALESCE(status, 'ativo') = 'ativo'
      AND COALESCE(valor_parcela, 0) > 0
      AND data_primeira_parcela IS NOT NULL
      AND numero_parcelas IS NULL
      AND (vigencia_fim IS NULL OR vigencia_fim > CURRENT_DATE)
  LOOP
    SELECT * INTO v_pasta FROM public.ged_pastas WHERE id = v_contrato.pasta_id;

    v_intervalo := CASE LOWER(COALESCE(v_contrato.ciclo_pagamento, 'mensal'))
      WHEN 'mensal'     THEN INTERVAL '1 month'
      WHEN 'bimestral'  THEN INTERVAL '2 months'
      WHEN 'trimestral' THEN INTERVAL '3 months'
      WHEN 'semestral'  THEN INTERVAL '6 months'
      WHEN 'anual'      THEN INTERVAL '12 months'
      ELSE INTERVAL '1 month'
    END;

    -- Última data de parcela principal existente
    SELECT MAX(data_vencimento) INTO v_ultima_data
    FROM public.pasta_contrato_parcelas
    WHERE contrato_id = v_contrato.id
      AND origem = 'principal';

    IF v_ultima_data IS NULL THEN
      v_prox_data := v_contrato.data_primeira_parcela;
    ELSE
      v_prox_data := (v_ultima_data + v_intervalo)::date;
    END IF;

    -- Se já está coberto até o alvo, não faz nada
    CONTINUE WHEN v_prox_data > v_alvo;

    -- Meio de pagamento
    SELECT id INTO v_meio_id
    FROM public.meios_pagamento
    WHERE codigo = 'recorrente' AND ativo = true
    LIMIT 1;

    IF v_meio_id IS NULL THEN
      SELECT id INTO v_meio_id
      FROM public.meios_pagamento
      WHERE ativo = true ORDER BY ordem LIMIT 1;
    END IF;

    -- Número base
    SELECT COALESCE(MAX(numero_parcela), 0) INTO v_num_parcela
    FROM public.pasta_contrato_parcelas
    WHERE contrato_id = v_contrato.id AND origem = 'principal';

    -- Estende até o alvo
    WHILE v_prox_data <= v_alvo LOOP
      v_num_parcela := v_num_parcela + 1;
      v_descricao := 'Contrato ' || v_contrato.numero || ' — ' ||
                     TO_CHAR(v_prox_data, 'MM/YYYY');

      INSERT INTO public.pasta_contrato_parcelas (
        contrato_id, origem, numero_parcela, total_parcelas,
        data_vencimento, valor, status
      )
      VALUES (
        v_contrato.id, 'principal', v_num_parcela, NULL,
        v_prox_data, v_contrato.valor_parcela, 'pendente'
      )
      RETURNING id INTO v_parcela_id;

      INSERT INTO public.contas_pagar_receber (
        descricao, valor, data_vencimento, status, tipo, origem,
        parceiro_id, meio_pagamento_id, forma_pagamento_id,
        pasta_contrato_id, pasta_contrato_parcela_id,
        numero_parcela, nf_aplicavel, aprovado_em
      )
      VALUES (
        v_descricao, v_contrato.valor_parcela, v_prox_data,
        'aprovado', 'despesa', 'contrato',
        v_pasta.parceiro_id, v_meio_id, v_contrato.meio_pagamento_id,
        v_contrato.id, v_parcela_id,
        v_num_parcela, true, NOW()
      )
      RETURNING id INTO v_cpr_id;

      UPDATE public.pasta_contrato_parcelas
      SET conta_pagar_id = v_cpr_id
      WHERE id = v_parcela_id;

      v_count := v_count + 1;
      v_prox_data := (v_prox_data + v_intervalo)::date;
    END LOOP;

  END LOOP;

  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_detectar_inconsistencia_categoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_categoria_nf uuid; v_codigo_atual text; v_codigo_nf text; v_nome_nf text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF OLD.plano_contas_id IS NOT DISTINCT FROM NEW.plano_contas_id THEN RETURN NEW; END IF;  -- §3.2
  SELECT plano_contas_id INTO v_categoria_nf                                                  -- §3.2
  FROM nfs_stage
  WHERE conta_pagar_id = NEW.id AND plano_contas_id IS NOT NULL LIMIT 1;
  IF v_categoria_nf IS NULL THEN
    UPDATE movimentacoes_bancarias
    SET categoria_inconsistente = false, inconsistencia_motivo = NULL
    WHERE conta_pagar_id = NEW.id AND categoria_inconsistente = true;
    RETURN NEW;
  END IF;
  IF NEW.plano_contas_id IS DISTINCT FROM v_categoria_nf THEN                                -- §3.2
    SELECT codigo INTO v_codigo_atual FROM plano_contas WHERE id = NEW.plano_contas_id;       -- §3.2
    SELECT codigo, nome INTO v_codigo_nf, v_nome_nf FROM plano_contas WHERE id = v_categoria_nf;
    UPDATE movimentacoes_bancarias
    SET categoria_inconsistente = true,
        inconsistencia_motivo = format(
          'Conta editada para "%s" mas NF está em "%s %s". Edite na NF pra resolver.',
          COALESCE(v_codigo_atual, '—'), COALESCE(v_codigo_nf, '—'), COALESCE(v_nome_nf, '—')
        )
    WHERE conta_pagar_id = NEW.id;
  ELSE
    UPDATE movimentacoes_bancarias
    SET categoria_inconsistente = false, inconsistencia_motivo = NULL
    WHERE conta_pagar_id = NEW.id AND categoria_inconsistente = true;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_ged_pasta_check_no_loop()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pasta_id UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Pasta não pode ser pai de si mesma';
  END IF;
  
  v_pasta_id := NEW.parent_id;
  WHILE v_pasta_id IS NOT NULL LOOP
    IF v_pasta_id = NEW.id THEN
      RAISE EXCEPTION 'Loop de hierarquia detectado em pasta %', NEW.id;
    END IF;
    SELECT parent_id INTO v_pasta_id 
      FROM public.ged_pastas 
      WHERE id = v_pasta_id;
  END LOOP;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_gerar_mov_ao_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só dispara se: virou paga + ainda não tem mov
  IF NEW.status = 'paga' 
     AND OLD.status IS DISTINCT FROM 'paga'
     AND NEW.movimentacao_bancaria_id IS NULL THEN
    
    PERFORM gerar_movimentacao_de_conta(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_gerar_numero_titulo(p_parcela integer)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_seq bigint;
  v_ano text;
BEGIN
  v_seq := nextval('public.seq_titulo_numero');
  v_ano := to_char(now(), 'YYYY');
  RETURN 'TIT-' || v_ano || '-' || lpad(v_seq::text, 5, '0') || '-' || lpad(p_parcela::text, 2, '0');
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_gerar_titulos_em_pre_faturamento(p_pedido_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido record;
  v_analise record;
  v_condicao jsonb;
  v_entrada jsonb;
  v_parcelas jsonb;
  v_parcela jsonb;
  v_tem_entrada boolean;
  v_total smallint;
  v_num smallint := 1;
  v_qtd integer := 0;
  v_idx integer;
  v_valor numeric(12,2);
  v_tipo text;
  v_data_venc date;
  v_dias integer;
  v_condicao_str text;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF v_pedido.id IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  -- Idempotência
  IF EXISTS (SELECT 1 FROM public.titulo_a_receber WHERE pedido_id = p_pedido_id) THEN
    RETURN 0;
  END IF;

  -- FIX da sessão F-3: criado_em (não created_at) — Doutrina NOME REAL DE COLUNA
  SELECT * INTO v_analise FROM public.analises_credito
  WHERE pedido_id = p_pedido_id
    AND status_final IN ('aprovado', 'aprovado_com_ressalva')
  ORDER BY decidido_em DESC NULLS LAST, criado_em DESC LIMIT 1;

  IF v_analise.id IS NULL THEN
    RAISE EXCEPTION 'Pedido % sem análise aprovada — não pode gerar títulos', p_pedido_id;
  END IF;

  v_condicao := v_analise.condicao_final_aprovada;
  IF v_condicao IS NULL THEN
    RAISE EXCEPTION 'Análise % sem condicao_final_aprovada', v_analise.id;
  END IF;

  v_tem_entrada := COALESCE((v_condicao->>'tem_entrada')::boolean, false);
  v_entrada := v_condicao->'entrada';
  v_parcelas := COALESCE(v_condicao->'parcelas_a_prazo', '[]'::jsonb);
  v_condicao_str := COALESCE(v_condicao->>'condicao_original', v_pedido.condicao_solicitada);

  v_total := (CASE
    WHEN v_tem_entrada AND v_entrada IS NOT NULL AND v_entrada::text != 'null' THEN 1
    ELSE 0
  END) + jsonb_array_length(v_parcelas);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Condição final inválida — sem entrada nem parcelas';
  END IF;

  -- Título de ENTRADA
  IF v_tem_entrada AND v_entrada IS NOT NULL AND v_entrada::text != 'null' THEN
    v_valor := (v_entrada->>'valor')::numeric;
    v_tipo := COALESCE(v_entrada->>'tipo', v_pedido.forma_solicitada);
    v_dias := COALESCE((v_entrada->>'dias')::integer, 0);
    v_data_venc := v_pedido.data_pedido + (v_dias || ' days')::interval;

    INSERT INTO public.titulo_a_receber (
      numero_titulo, conta_id, pedido_id, analise_credito_id,
      valor_bruto, data_vencimento_original, data_vencimento_atual,
      numero_parcela, total_parcelas, tipo_pagamento, eh_entrada,
      condicao_pagamento, status, created_by
    ) VALUES (
      public.fn_gerar_numero_titulo(v_num),
      v_pedido.parceiro_id, p_pedido_id, v_analise.id,
      v_valor, v_data_venc, v_data_venc,
      v_num, v_total, v_tipo, true,
      v_condicao_str, 'aguardando_pagamento', auth.uid()
    );
    v_qtd := v_qtd + 1;
    v_num := v_num + 1;
  END IF;

  -- Títulos a PRAZO
  FOR v_idx IN 0..(jsonb_array_length(v_parcelas) - 1) LOOP
    v_parcela := v_parcelas->v_idx;
    v_valor := (v_parcela->>'valor')::numeric;
    v_dias := (v_parcela->>'dias')::integer;
    v_data_venc := COALESCE(
      NULLIF(v_parcela->>'vencimento', '')::date,
      v_pedido.data_pedido + (v_dias || ' days')::interval
    );

    INSERT INTO public.titulo_a_receber (
      numero_titulo, conta_id, pedido_id, analise_credito_id,
      valor_bruto, data_vencimento_original, data_vencimento_atual,
      numero_parcela, total_parcelas, tipo_pagamento, eh_entrada,
      condicao_pagamento, status, created_by
    ) VALUES (
      public.fn_gerar_numero_titulo(v_num),
      v_pedido.parceiro_id, p_pedido_id, v_analise.id,
      v_valor, v_data_venc, v_data_venc,
      v_num, v_total, 'boleto', false,
      v_condicao_str, 'aguardando_envio_bling', auth.uid()
    );
    v_qtd := v_qtd + 1;
    v_num := v_num + 1;
  END LOOP;

  -- Evento CRIADO em cada título
  INSERT INTO public.evento_titulo (titulo_id, tipo_evento, payload, origem)
  SELECT id, 'CRIADO',
         jsonb_build_object('pedido_id', p_pedido_id, 'analise_id', v_analise.id),
         'SNCF'
  FROM public.titulo_a_receber WHERE pedido_id = p_pedido_id;

  RETURN v_qtd;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_grupo_propagar_vinculo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.cnpj_raiz IS NOT NULL
     AND NEW.cnpj_raiz <> ''
     AND NEW.ativo = TRUE THEN

    UPDATE parceiros_comerciais
    SET grupo_id = NEW.id
    WHERE grupo_id IS NULL
      AND cnpj IS NOT NULL
      AND cnpj <> ''
      AND SUBSTRING(REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') FROM 1 FOR 8) = NEW.cnpj_raiz;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_ia_sugerir_categoria_no_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_top RECORD;
BEGIN
  IF NEW.plano_contas_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.descricao IS NULL OR length(NEW.descricao) < 4 THEN RETURN NEW; END IF;
  SELECT categoria_id, score INTO v_top
  FROM sugerir_categoria_para_lancamento(
    p_descricao := NEW.descricao,
    p_cnpj := NEW.nf_cnpj_emitente,
    p_parceiro_id := NEW.parceiro_id
  )
  ORDER BY score DESC LIMIT 1;
  IF v_top.categoria_id IS NULL OR v_top.score < 70 THEN RETURN NEW; END IF;
  IF v_top.score >= 90 THEN
    UPDATE contas_pagar_receber
    SET plano_contas_id = v_top.categoria_id,
        categoria_sugerida_ia = true,
        categoria_confirmada = false,
        updated_at = now()
    WHERE id = NEW.id;
  ELSE
    UPDATE contas_pagar_receber
    SET categoria_sugerida_ia = true, updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_ia_sugerir_nf_no_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd_matches integer;
  v_grupo_id uuid;
  v_conta_unica uuid;
BEGIN
  -- Só age se NF tem valor e não está vinculada
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN RETURN NEW; END IF;
  IF NEW.conta_pagar_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Conta quantos GRUPOS de parcelas + contas avulsas têm soma igual ao valor da NF
  SELECT COUNT(*) INTO v_qtd_matches
  FROM (
    SELECT parcela_grupo_id
    FROM contas_pagar_receber
    WHERE parcela_grupo_id IS NOT NULL
      AND status NOT IN ('cancelado')
      AND NOT EXISTS (
        SELECT 1 FROM nfs_stage nf2 
        WHERE nf2.conta_pagar_id = contas_pagar_receber.id
      )
    GROUP BY parcela_grupo_id
    HAVING ABS(SUM(valor) - NEW.valor) <= 0.01
    
    UNION ALL
    
    SELECT NULL
    FROM contas_pagar_receber
    WHERE parcela_grupo_id IS NULL
      AND status NOT IN ('cancelado')
      AND ABS(valor - NEW.valor) <= 0.01
      AND NOT EXISTS (
        SELECT 1 FROM nfs_stage nf2 
        WHERE nf2.conta_pagar_id = contas_pagar_receber.id
      )
  ) sub;

  -- ÓBVIO: 1 match único → vincula automático
  IF v_qtd_matches = 1 THEN
    -- Pega o ID (grupo ou avulsa)
    SELECT cpr.id INTO v_conta_unica
    FROM contas_pagar_receber cpr
    LEFT JOIN (
      SELECT parcela_grupo_id, SUM(valor) AS soma
      FROM contas_pagar_receber
      WHERE parcela_grupo_id IS NOT NULL
        AND status NOT IN ('cancelado')
      GROUP BY parcela_grupo_id
    ) g ON g.parcela_grupo_id = cpr.parcela_grupo_id
    WHERE cpr.status NOT IN ('cancelado')
      AND NOT EXISTS (
        SELECT 1 FROM nfs_stage nf2 
        WHERE nf2.conta_pagar_id = cpr.id
      )
      AND (
        ABS(cpr.valor - NEW.valor) <= 0.01  -- avulsa
        OR ABS(COALESCE(g.soma, 0) - NEW.valor) <= 0.01  -- grupo
      )
    ORDER BY cpr.parcela_grupo_id NULLS LAST, cpr.data_vencimento
    LIMIT 1;
    
    IF v_conta_unica IS NOT NULL THEN
      PERFORM vincular_nf_a_conta(NEW.id, v_conta_unica);
    END IF;
    
  -- AMBÍGUO: marca todas as contas/grupos compatíveis com flag
  ELSIF v_qtd_matches > 1 THEN
    -- Avulsas
    UPDATE contas_pagar_receber
    SET tem_sugestao_nf = true, updated_at = now()
    WHERE parcela_grupo_id IS NULL
      AND status NOT IN ('cancelado')
      AND ABS(valor - NEW.valor) <= 0.01
      AND NOT EXISTS (
        SELECT 1 FROM nfs_stage nf2 
        WHERE nf2.conta_pagar_id = contas_pagar_receber.id
      );
    
    -- Grupos: marca todas as parcelas
    UPDATE contas_pagar_receber
    SET tem_sugestao_nf = true, updated_at = now()
    WHERE parcela_grupo_id IN (
      SELECT parcela_grupo_id
      FROM contas_pagar_receber
      WHERE parcela_grupo_id IS NOT NULL
        AND status NOT IN ('cancelado')
      GROUP BY parcela_grupo_id
      HAVING ABS(SUM(valor) - NEW.valor) <= 0.01
    );
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_log_evento_pedido(p_pedido_id uuid, p_tipo text, p_payload jsonb DEFAULT '{}'::jsonb, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_evento_id UUID;
BEGIN
  INSERT INTO public.pedidos_compra_eventos (pedido_id, tipo, payload, usuario_id)
  VALUES (p_pedido_id, p_tipo, p_payload, COALESCE(p_usuario_id, auth.uid()))
  RETURNING id INTO v_evento_id;
  RETURN v_evento_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_nf_propagar_para_tudo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_pagar_id uuid;
  v_grupo_id uuid;
BEGIN
  IF NEW.plano_contas_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.plano_contas_id IS NOT DISTINCT FROM NEW.plano_contas_id THEN
    RETURN NEW;
  END IF;
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_conta_pagar_id := NEW.conta_pagar_id;
  SELECT parcela_grupo_id INTO v_grupo_id
  FROM contas_pagar_receber WHERE id = v_conta_pagar_id;
  -- 1) Conta a Pagar: SOBRESCREVE
  UPDATE contas_pagar_receber
  SET plano_contas_id = NEW.plano_contas_id,
      updated_at = now()
  WHERE id = v_conta_pagar_id;
  -- 2) Irmãs do parcela_grupo: SOBRESCREVE
  IF v_grupo_id IS NOT NULL THEN
    UPDATE contas_pagar_receber
    SET plano_contas_id = NEW.plano_contas_id,
        updated_at = now()
    WHERE parcela_grupo_id = v_grupo_id
      AND id != v_conta_pagar_id
      AND status NOT IN ('cancelado');
  END IF;
  -- 3) Lançamentos cartão: SOBRESCREVE
  UPDATE fatura_cartao_lancamentos
  SET plano_contas_id = NEW.plano_contas_id,
      updated_at = now()
  WHERE conta_pagar_id = v_conta_pagar_id;
  -- 4) Movimentações: SOBRESCREVE + LIMPA inconsistência (SEM updated_at)
  UPDATE movimentacoes_bancarias
  SET plano_contas_id = NEW.plano_contas_id,
      categoria_inconsistente = false,
      inconsistencia_motivo = NULL
  WHERE conta_pagar_id = v_conta_pagar_id;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_nf_stage_criar_documento_e_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pasta_id UUID;
  v_storage TEXT;
  v_arquivo TEXT;
  v_cpr_id UUID;
BEGIN
  -- 1) DOCUMENTO NO GED ────────────────────────────────────────────────

  IF NEW.parceiro_id IS NOT NULL THEN
    SELECT id INTO v_pasta_id
    FROM public.ged_pastas
    WHERE parceiro_id = NEW.parceiro_id AND ativa = TRUE
    LIMIT 1;

    -- Pega o documento mais recente do nfs_stage_documentos
    SELECT storage_path, arquivo_nome
    INTO v_storage, v_arquivo
    FROM public.nfs_stage_documentos
    WHERE nfs_stage_id = NEW.id
    ORDER BY criado_em DESC
    LIMIT 1;

    IF v_pasta_id IS NOT NULL AND v_storage IS NOT NULL THEN
      -- Idempotência: só cria se ainda não existe
      IF NOT EXISTS (
        SELECT 1 FROM public.ged_documentos WHERE nfs_stage_id = NEW.id
      ) THEN
        INSERT INTO public.ged_documentos (
          nome,
          arquivo_original,
          storage_path,
          tipo_documento,
          pasta_id,
          parceiro_id,
          nfs_stage_id,
          descricao
        ) VALUES (
          CASE
            WHEN NEW.nf_numero IS NOT NULL THEN 'NF ' || NEW.nf_numero
            ELSE 'NF importada'
          END,
          COALESCE(v_arquivo, 'nf-' || NEW.id::text),
          v_storage,
          'nf',
          v_pasta_id,
          NEW.parceiro_id,
          NEW.id,
          NEW.descricao
        );
      END IF;
    END IF;
  END IF;

  -- 2) AUTO-MATCH COM CPR (Sub-frente 4) ───────────────────────────────
  -- V1 — simples primeiro (Doutrina #11):
  -- Match se: mesmo parceiro + valor exato + vencimento ±3 dias

  IF NEW.conta_pagar_id IS NULL
     AND NEW.parceiro_id IS NOT NULL
     AND NEW.valor IS NOT NULL
     AND NEW.valor > 0 THEN

    SELECT cpr.id INTO v_cpr_id
    FROM public.contas_pagar_receber cpr
    WHERE cpr.parceiro_id = NEW.parceiro_id
      AND cpr.valor = NEW.valor
      AND cpr.status NOT IN ('paga', 'cancelado', 'realizada', 'conciliada')
      AND (
        NEW.data_vencimento IS NULL
        OR cpr.data_vencimento BETWEEN NEW.data_vencimento - INTERVAL '3 days'
                                   AND NEW.data_vencimento + INTERVAL '3 days'
      )
      -- Não pode estar amarrada a outra NF stage
      AND NOT EXISTS (
        SELECT 1 FROM public.nfs_stage ns2
        WHERE ns2.conta_pagar_id = cpr.id AND ns2.id <> NEW.id
      )
    ORDER BY ABS(EXTRACT(EPOCH FROM (
      COALESCE(cpr.data_vencimento::TIMESTAMP, NOW())
      - COALESCE(NEW.data_vencimento::TIMESTAMP, NOW())
    )))
    LIMIT 1;

    IF v_cpr_id IS NOT NULL THEN
      UPDATE public.nfs_stage
      SET conta_pagar_id = v_cpr_id,
          status = 'vinculada',
          match_score = 100,
          match_motivos = 'auto-match V1: parceiro+valor+venc±3d'
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_nf_stage_resolver_parceiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_limpo TEXT;
  v_parceiro_id UUID;
  v_cnpj_formatado TEXT;
  v_razao_final TEXT;
BEGIN
  -- Já tem parceiro? Mantém.
  IF NEW.parceiro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- NF sem CNPJ? Não dá pra resolver. Deixa parceiro_id = NULL.
  v_cnpj_limpo := regexp_replace(COALESCE(NEW.fornecedor_cnpj, ''), '[^0-9]', '', 'g');
  IF v_cnpj_limpo = '' OR length(v_cnpj_limpo) <> 14 THEN
    RETURN NEW;
  END IF;

  -- Busca parceiro existente pelo CNPJ (comparação só com dígitos)
  SELECT id INTO v_parceiro_id
  FROM public.parceiros_comerciais
  WHERE regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g') = v_cnpj_limpo
  LIMIT 1;

  -- Existe? Vincula.
  IF v_parceiro_id IS NOT NULL THEN
    NEW.parceiro_id := v_parceiro_id;
    RETURN NEW;
  END IF;

  -- Não existe — cria parceiro mínimo com flag cadastro_incompleto
  v_cnpj_formatado :=
    substr(v_cnpj_limpo, 1, 2) || '.' ||
    substr(v_cnpj_limpo, 3, 3) || '.' ||
    substr(v_cnpj_limpo, 6, 3) || '/' ||
    substr(v_cnpj_limpo, 9, 4) || '-' ||
    substr(v_cnpj_limpo, 13, 2);

  v_razao_final := COALESCE(
    NULLIF(trim(NEW.fornecedor_razao_social), ''),
    'CNPJ ' || v_cnpj_formatado
  );

  INSERT INTO public.parceiros_comerciais (
    razao_social,
    tipo_pessoa,
    cnpj,
    origem,
    cadastro_incompleto,
    tipos,
    ativo
  ) VALUES (
    v_razao_final,
    'PJ',
    v_cnpj_limpo,
    'nf_import',
    TRUE,
    ARRAY['fornecedor']::text[],
    TRUE
  )
  RETURNING id INTO v_parceiro_id;
  -- (Pasta nasce automática via trigger Sub-frente 1)

  NEW.parceiro_id := v_parceiro_id;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_obter_ou_criar_pasta_parceiro(p_parceiro_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pasta_id UUID;
  v_parceiro_nome TEXT;
BEGIN
  -- Busca pasta já existente
  SELECT id INTO v_pasta_id
  FROM public.ged_pastas
  WHERE parceiro_id = p_parceiro_id
  LIMIT 1;

  IF v_pasta_id IS NOT NULL THEN
    RETURN v_pasta_id;
  END IF;

  -- Cria a pasta se não existe
  SELECT COALESCE(nome_fantasia, razao_social, 'Parceiro')
  INTO v_parceiro_nome
  FROM public.parceiros_comerciais
  WHERE id = p_parceiro_id;

  INSERT INTO public.ged_pastas (parceiro_id, nome, tipo)
  VALUES (p_parceiro_id, v_parceiro_nome, 'parceiro')
  RETURNING id INTO v_pasta_id;

  RETURN v_pasta_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_parceiro_after_insert_enriquecer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só enriquece CNPJ válido (14 dígitos) com cadastro incompleto
  IF NEW.cnpj IS NOT NULL
     AND length(NEW.cnpj) = 14
     AND COALESCE(NEW.cadastro_incompleto, true)
  THEN
    BEGIN
      PERFORM public.disparar_enriquecimento_parceiro(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Não bloqueia INSERT se enriquecimento falhar
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_parceiro_classificacao_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id uuid;
BEGIN
  IF NEW.nivel_programa IS DISTINCT FROM OLD.nivel_programa
     OR NEW.categoria_ka IS DISTINCT FROM OLD.categoria_ka
     OR NEW.bandeira_vermelha IS DISTINCT FROM OLD.bandeira_vermelha
  THEN
    FOR v_pedido_id IN
      SELECT id FROM public.pedidos
      WHERE parceiro_id = NEW.id
        AND estagio NOT IN ('faturado', 'entregue', 'cancelado')
    LOOP
      BEGIN
        PERFORM public.analisar_pedido_vs_programa(v_pedido_id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_parceiro_resolver_grupo_e_completude()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_radical TEXT;
BEGIN
  -- R1: auto-vincular grupo pelo radical do CNPJ.
  -- Atua APENAS se: NEW.grupo_id IS NULL E (INSERT ou OLD.grupo_id ja era NULL).
  -- Isso preserva qualquer override manual do humano.
  IF NEW.cnpj IS NOT NULL
     AND NEW.cnpj <> ''
     AND NEW.grupo_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.grupo_id IS NULL) THEN

    v_radical := SUBSTRING(REGEXP_REPLACE(NEW.cnpj, '[^0-9]', '', 'g') FROM 1 FOR 8);

    IF LENGTH(v_radical) = 8 THEN
      SELECT id INTO NEW.grupo_id
      FROM grupos_empresariais
      WHERE cnpj_raiz = v_radical
        AND ativo = TRUE
      LIMIT 1;
    END IF;
  END IF;

  -- R3: cadastro_incompleto = falta identificacao primaria.
  -- PJ brasileiro: precisa CNPJ. PJ estrangeiro: precisa tag 'estrangeiro'.
  -- PF: precisa CPF.
  IF NEW.tipo_pessoa = 'PJ'
     AND (NEW.cnpj IS NULL OR NEW.cnpj = '')
     AND (NEW.cpf IS NULL OR NEW.cpf = '')
     AND NOT ('estrangeiro' = ANY(COALESCE(NEW.tags, ARRAY[]::text[]))) THEN
    NEW.cadastro_incompleto := TRUE;
  ELSIF NEW.tipo_pessoa = 'PF'
        AND (NEW.cpf IS NULL OR NEW.cpf = '') THEN
    NEW.cadastro_incompleto := TRUE;
  ELSE
    NEW.cadastro_incompleto := FALSE;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_parse_condicao(p_condicao_solicitada text, p_valor_liquido numeric, p_data_referencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_cond_norm text;
  v_partes text[];
  v_total_parcelas int;
  v_valor_base numeric;
  v_valor_atual numeric;
  v_parcelas jsonb := '[]'::jsonb;
  v_dias int;
  v_venc date;
  i int;
BEGIN
  IF p_valor_liquido IS NULL OR p_valor_liquido <= 0 THEN
    RAISE EXCEPTION 'fn_parse_condicao: p_valor_liquido deve ser > 0, recebido: %', p_valor_liquido;
  END IF;

  v_cond_norm := LOWER(TRIM(COALESCE(p_condicao_solicitada, '')));
  v_cond_norm := TRANSLATE(v_cond_norm, 'àáâãäçéèêë', 'aaaaaceeee');

  -- Caso 1: à vista (vazio, "a_vista", "a vista", "avista", "0")
  IF v_cond_norm = '' OR v_cond_norm IN ('a_vista', 'a vista', 'avista', '0') THEN
    RETURN jsonb_build_object(
      'tem_entrada', true,
      'entrada', jsonb_build_object('valor', p_valor_liquido, 'tipo', 'pix', 'dias', 0),
      'parcelas_a_prazo', '[]'::jsonb,
      'condicao_original', COALESCE(p_condicao_solicitada, ''),
      'parseada_por', 'automatico_default',
      'parseada_em', NOW()
    );
  END IF;

  -- Caso 2: dias (ex: "30", "30/60/90", "42")
  v_partes := string_to_array(v_cond_norm, '/');
  v_total_parcelas := array_length(v_partes, 1);

  FOR i IN 1..v_total_parcelas LOOP
    IF v_partes[i] !~ '^\d+$' THEN
      RAISE EXCEPTION 'fn_parse_condicao: condição "%" não reconhecida. Esperado "a_vista", "30", "30/60/90" ou similar.', p_condicao_solicitada;
    END IF;
  END LOOP;

  v_valor_base := ROUND(p_valor_liquido / v_total_parcelas, 2);

  FOR i IN 1..v_total_parcelas LOOP
    v_dias := v_partes[i]::int;
    v_venc := CASE WHEN p_data_referencia IS NOT NULL THEN p_data_referencia + v_dias ELSE NULL END;

    IF i = v_total_parcelas THEN
      v_valor_atual := p_valor_liquido - (v_valor_base * (v_total_parcelas - 1));
    ELSE
      v_valor_atual := v_valor_base;
    END IF;

    v_parcelas := v_parcelas || jsonb_build_object(
      'numero', i,
      'dias', v_dias,
      'valor', v_valor_atual,
      'tipo', 'boleto',
      'vencimento', v_venc
    );
  END LOOP;

  RETURN jsonb_build_object(
    'tem_entrada', false,
    'entrada', NULL,
    'parcelas_a_prazo', v_parcelas,
    'condicao_original', p_condicao_solicitada,
    'parseada_por', 'automatico_default',
    'parseada_em', NOW()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_pedido_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parceiro record;
BEGIN
  -- 1. Alocar trilha
  BEGIN
    PERFORM public.fn_alocar_trilha_pedido(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- FAIL-LOUD: registra evento em vez de silenciar
    INSERT INTO public.pedido_eventos (
      pedido_id, tipo_evento, descricao, metadata, automatico
    ) VALUES (
      NEW.id,
      'erro_automacao',
      format('Falha na alocação de trilha: %s', SQLERRM),
      jsonb_build_object(
        'erro_origem', 'fn_alocar_trilha_pedido',
        'sqlstate', SQLSTATE,
        'sqlerrm', SQLERRM
      ),
      true
    );
  END;

  -- 2. Análise local vs programa
  BEGIN
    PERFORM public.analisar_pedido_vs_programa(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Mantém o UPDATE em colunas (compatibilidade) + adiciona evento
    UPDATE public.pedidos
    SET analise_pedido_status = 'erro',
        analise_pedido_motivo = format('Erro na análise automática: %s', SQLERRM),
        analise_pedido_executada_em = now()
    WHERE id = NEW.id;

    INSERT INTO public.pedido_eventos (
      pedido_id, tipo_evento, descricao, metadata, automatico
    ) VALUES (
      NEW.id,
      'erro_automacao',
      format('Falha na análise vs programa: %s', SQLERRM),
      jsonb_build_object(
        'erro_origem', 'analisar_pedido_vs_programa',
        'sqlstate', SQLSTATE,
        'sqlerrm', SQLERRM
      ),
      true
    );
  END;

  -- 3. Enriquecimento async se cadastro incompleto
  SELECT cnpj, cadastro_incompleto INTO v_parceiro
  FROM public.parceiros_comerciais WHERE id = NEW.parceiro_id;

  IF v_parceiro.cnpj IS NOT NULL
     AND length(v_parceiro.cnpj) = 14
     AND COALESCE(v_parceiro.cadastro_incompleto, true) THEN
    BEGIN
      PERFORM public.disparar_enriquecimento_parceiro(NEW.parceiro_id);
    EXCEPTION WHEN OTHERS THEN
      -- FAIL-LOUD: registra evento em vez de silenciar
      INSERT INTO public.pedido_eventos (
        pedido_id, tipo_evento, descricao, metadata, automatico
      ) VALUES (
        NEW.id,
        'erro_automacao',
        format('Falha ao disparar enriquecimento de parceiro: %s', SQLERRM),
        jsonb_build_object(
          'erro_origem', 'disparar_enriquecimento_parceiro',
          'parceiro_id', NEW.parceiro_id,
          'sqlstate', SQLSTATE,
          'sqlerrm', SQLERRM
        ),
        true
      );
    END;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_pedido_doc_para_ged()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_parceiro_id UUID;
  v_pasta_id UUID;
  -- Tipos que vão pro GED: documentos com valor permanente pro parceiro
  TIPOS_NOBRES TEXT[] := ARRAY['cotacao', 'orcamento', 'proposta'];
BEGIN
  IF NOT (NEW.tipo::TEXT = ANY(TIPOS_NOBRES)) THEN
    RETURN NEW;
  END IF;

  SELECT parceiro_id INTO v_parceiro_id
  FROM public.pedidos_compra
  WHERE id = NEW.pedido_id;

  IF v_parceiro_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_pasta_id := public.fn_obter_ou_criar_pasta_parceiro(v_parceiro_id);

  INSERT INTO public.ged_documentos (
    pasta_id, parceiro_id, nome, arquivo_original,
    tipo_documento, storage_path, tamanho_bytes, mime_type
  ) VALUES (
    v_pasta_id, v_parceiro_id,
    NEW.nome_original, NEW.nome_original,
    NEW.tipo::TEXT, NEW.storage_path, NEW.tamanho_bytes, NEW.mime_type
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_popular_data_compra_de_compromisso()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- 1ª tentativa: copiar do compromisso parcelado
  IF NEW.data_compra IS NULL AND NEW.compromisso_parcelado_id IS NOT NULL THEN
    SELECT data_compra INTO NEW.data_compra
    FROM compromissos_parcelados
    WHERE id = NEW.compromisso_parcelado_id;
  END IF;

  -- 2ª tentativa: copiar de uma parcela irmã do mesmo parcela_grupo_id
  IF NEW.data_compra IS NULL AND NEW.parcela_grupo_id IS NOT NULL THEN
    SELECT data_compra INTO NEW.data_compra
    FROM contas_pagar_receber
    WHERE parcela_grupo_id = NEW.parcela_grupo_id
      AND data_compra IS NOT NULL
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_propagar_categoria_cartao_para_conta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_pagar_id uuid;
  v_grupo_id uuid;
BEGIN
  -- Só dispara se plano_contas_id MUDOU pra um valor real
  IF NEW.plano_contas_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.plano_contas_id IS NOT DISTINCT FROM NEW.plano_contas_id THEN
    RETURN NEW;
  END IF;
  -- Sem conta_pagar vinculada, não há pra onde propagar
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Pega conta_pagar e grupo de parcelas (se houver)
  SELECT id, parcela_grupo_id INTO v_conta_pagar_id, v_grupo_id
  FROM contas_pagar_receber WHERE id = NEW.conta_pagar_id;
  -- Caso 1: preenche a conta_pagar vinculada (se vazia)
  UPDATE contas_pagar_receber
  SET plano_contas_id = NEW.plano_contas_id,
      updated_at = now()
  WHERE id = v_conta_pagar_id
    AND plano_contas_id IS NULL;
  -- Caso 2: propaga pras irmãs do mesmo parcela_grupo_id (se vazias)
  IF v_grupo_id IS NOT NULL THEN
    UPDATE contas_pagar_receber
    SET plano_contas_id = NEW.plano_contas_id,
        updated_at = now()
    WHERE parcela_grupo_id = v_grupo_id
      AND plano_contas_id IS NULL
      AND id != v_conta_pagar_id
      AND status NOT IN ('cancelado');
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_propagar_categoria_conta_para_cartao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.plano_contas_id IS NULL THEN RETURN NEW; END IF;                                    -- §3.2
  IF OLD.plano_contas_id IS NOT DISTINCT FROM NEW.plano_contas_id THEN RETURN NEW; END IF;  -- §3.2
  UPDATE fatura_cartao_lancamentos
  SET plano_contas_id = NEW.plano_contas_id, updated_at = now()                             -- §3.2
  WHERE conta_pagar_id = NEW.id AND plano_contas_id IS NULL;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_propagar_categoria_para_irmas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só age se plano_contas_id MUDOU pra um valor real
  IF NEW.plano_contas_id IS NULL OR NEW.plano_contas_id = OLD.plano_contas_id THEN
    RETURN NEW;
  END IF;
  IF NEW.fornecedor_cnpj IS NULL THEN
    RETURN NEW;
  END IF;
  -- Atualiza todas as outras NFs SEM plano_contas_id com mesmo CNPJ
  UPDATE nfs_stage
  SET plano_contas_id = NEW.plano_contas_id,
      updated_at = now()
  WHERE fornecedor_cnpj = NEW.fornecedor_cnpj
    AND plano_contas_id IS NULL
    AND status != 'descartada'
    AND id != NEW.id;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_propagar_categoria_por_cnpj()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Se a NF já vem com plano_contas_id, não mexe
  IF NEW.plano_contas_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Sem CNPJ, não propaga
  IF NEW.fornecedor_cnpj IS NULL THEN
    RETURN NEW;
  END IF;
  -- Procura plano_contas_id em outras NFs do mesmo CNPJ
  SELECT plano_contas_id INTO NEW.plano_contas_id
  FROM nfs_stage
  WHERE fornecedor_cnpj = NEW.fornecedor_cnpj
    AND plano_contas_id IS NOT NULL
    AND status != 'descartada'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_propagar_dimensoes_cpr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.plano_contas_id IS NOT DISTINCT FROM OLD.plano_contas_id          -- §3.2
     AND NEW.centro_custo_id IS NOT DISTINCT FROM OLD.centro_custo_id
     AND NEW.linha_investimento_id IS NOT DISTINCT FROM OLD.linha_investimento_id THEN
    RETURN NEW;
  END IF;
  IF NEW.pasta_contrato_id IS NOT NULL THEN
    UPDATE public.contas_pagar_receber
    SET plano_contas_id = NEW.plano_contas_id,                              -- §3.2
        centro_custo_id = NEW.centro_custo_id,
        linha_investimento_id = NEW.linha_investimento_id,
        updated_at = now()
    WHERE pasta_contrato_id = NEW.pasta_contrato_id
      AND id != NEW.id AND status IN ('aberto', 'aguardando_pagamento');
  ELSIF NEW.parcela_grupo_id IS NOT NULL THEN
    UPDATE public.contas_pagar_receber
    SET plano_contas_id = NEW.plano_contas_id,                              -- §3.2
        centro_custo_id = NEW.centro_custo_id,
        linha_investimento_id = NEW.linha_investimento_id,
        updated_at = now()
    WHERE parcela_grupo_id = NEW.parcela_grupo_id
      AND id != NEW.id AND status IN ('aberto', 'aguardando_pagamento');
  END IF;
  IF NEW.parceiro_id IS NOT NULL THEN
    UPDATE public.parceiros_comerciais
    SET plano_contas_id = COALESCE(NEW.plano_contas_id, plano_contas_id),  -- §3.2
        centro_custo_id = COALESCE(NEW.centro_custo_id, centro_custo_id),
        updated_at = now()
    WHERE id = NEW.parceiro_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_proteger_mov_duplicada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id    UUID;
  v_existing_data  DATE;
  v_existing_valor NUMERIC;
BEGIN
  -- Se NEW.conta_pagar_id é NULL, não há o que validar
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Procurar OUTRA movimentação apontando pra mesma CPR
  SELECT id, data_transacao, valor
    INTO v_existing_id, v_existing_data, v_existing_valor
    FROM public.movimentacoes_bancarias
   WHERE conta_pagar_id = NEW.conta_pagar_id
     AND id <> NEW.id   -- não bloqueia UPDATE da própria mov
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'CPR já possui movimentação vinculada (id=%, data=%, valor=R$ %). '
      'Desvincule a movimentação anterior antes de vincular uma nova.',
      v_existing_id, v_existing_data, v_existing_valor
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_recalcular_tags_doc_cpr(p_cpr_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tem_doc BOOLEAN;
  v_comprovante TEXT;
  v_tags_atuais JSONB;
  v_tags_novas JSONB;
BEGIN
  SELECT tags, comprovante_url INTO v_tags_atuais, v_comprovante
  FROM contas_pagar_receber WHERE id = p_cpr_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_tem_doc := EXISTS (
    SELECT 1 FROM nfs_stage
    WHERE conta_pagar_id = p_cpr_id AND status <> 'descartada'
  ) OR (v_comprovante IS NOT NULL AND length(trim(v_comprovante)) > 0);

  v_tags_atuais := COALESCE(v_tags_atuais, '[]'::jsonb);
  v_tags_novas := v_tags_atuais - 'doc_pendente';
  IF NOT v_tem_doc THEN
    v_tags_novas := v_tags_novas || '["doc_pendente"]'::jsonb;
  END IF;

  IF v_tags_novas <> v_tags_atuais THEN
    UPDATE contas_pagar_receber SET tags = v_tags_novas WHERE id = p_cpr_id;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_recalcular_total_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compra_id uuid;
BEGIN
  v_compra_id := COALESCE(NEW.compra_registrada_id, OLD.compra_registrada_id);

  UPDATE public.compras_registradas
  SET valor_total = GREATEST(0::numeric, COALESCE((
    SELECT SUM(
      CASE
        WHEN tipo_linha = 'desconto' THEN -valor_total_real
        ELSE valor_total_real
      END
    )
    FROM public.compras_registradas_itens
    WHERE compra_registrada_id = v_compra_id
      AND status_linha = 'comprada'
  ), 0))
  WHERE id = v_compra_id;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_recalcular_vinculo_nf_cpr(p_cpr_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parcela_grupo_id UUID;
  v_nf_aplicavel BOOLEAN;
  v_valor_cpr NUMERIC;
  v_soma_valores NUMERIC;
  v_soma_nfs NUMERIC;
  v_completo BOOLEAN;
BEGIN
  SELECT parcela_grupo_id, COALESCE(nf_aplicavel, TRUE), valor
    INTO v_parcela_grupo_id, v_nf_aplicavel, v_valor_cpr
  FROM contas_pagar_receber
  WHERE id = p_cpr_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Caso A: nf_aplicavel = FALSE → completo direto
  IF v_nf_aplicavel = FALSE THEN
    UPDATE contas_pagar_receber
       SET vinculo_nf_completo = TRUE, valor_nf_vinculado = 0
     WHERE id = p_cpr_id;
    RETURN;
  END IF;

  -- Caso B: CPR avulsa → cálculo isolado
  IF v_parcela_grupo_id IS NULL THEN
    SELECT COALESCE(SUM(valor), 0) INTO v_soma_nfs
    FROM nfs_stage
    WHERE conta_pagar_id = p_cpr_id
      AND status <> 'descartada';

    v_completo := (v_soma_nfs >= v_valor_cpr);

    UPDATE contas_pagar_receber
       SET vinculo_nf_completo = v_completo, valor_nf_vinculado = v_soma_nfs
     WHERE id = p_cpr_id;
    RETURN;
  END IF;

  -- Caso C: CPR em grupo → cálculo compartilhado
  SELECT COALESCE(SUM(valor), 0) INTO v_soma_valores
  FROM contas_pagar_receber
  WHERE parcela_grupo_id = v_parcela_grupo_id
    AND status <> 'cancelado';

  SELECT COALESCE(SUM(ns.valor), 0) INTO v_soma_nfs
  FROM nfs_stage ns
  WHERE ns.status <> 'descartada'
    AND ns.conta_pagar_id IN (
      SELECT id FROM contas_pagar_receber
      WHERE parcela_grupo_id = v_parcela_grupo_id
    );

  v_completo := (v_soma_nfs >= v_soma_valores);

  UPDATE contas_pagar_receber
     SET vinculo_nf_completo = v_completo, valor_nf_vinculado = v_soma_nfs
   WHERE parcela_grupo_id = v_parcela_grupo_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_registrar_historico_origem_conta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origem_label text;
  v_observacao text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_origem_label := CASE NEW.origem
    WHEN 'manual'         THEN 'Cadastro manual'
    WHEN 'cartao'         THEN 'Fatura de cartão'
    WHEN 'cartao_credito' THEN 'Fatura de cartão'
    WHEN 'ofx'            THEN 'Importação OFX'
    WHEN 'ofx_avulso'     THEN 'OFX (lançamento avulso)'
    WHEN 'nf'             THEN 'Nota Fiscal'
    WHEN 'nf_qive'        THEN 'NF importada do Qive'
    WHEN 'nf_xml'         THEN 'NF importada via XML'
    WHEN 'recorrente'     THEN 'Compromisso recorrente'
    WHEN 'parcelado'      THEN 'Compromisso parcelado'
    WHEN 'bling'          THEN 'Sincronização Bling'
    WHEN 'consolidada'    THEN 'Conta consolidada (cartão)'
    ELSE COALESCE(NEW.origem, 'Origem não identificada')
  END;

  v_observacao := 'Origem: ' || v_origem_label;

  IF NEW.origem = 'nf' OR NEW.origem LIKE 'nf_%' THEN
    IF NEW.nf_numero IS NOT NULL THEN
      v_observacao := v_observacao || ' (NF nº ' || NEW.nf_numero;
      IF NEW.nf_serie IS NOT NULL THEN
        v_observacao := v_observacao || ' / série ' || NEW.nf_serie;
      END IF;
      v_observacao := v_observacao || ')';
    END IF;
  ELSIF NEW.origem = 'cartao' OR NEW.origem = 'cartao_credito' THEN
    v_observacao := v_observacao || ' (lançamento de fatura)';
  ELSIF NEW.origem = 'recorrente' AND NEW.compromisso_recorrente_id IS NOT NULL THEN
    v_observacao := v_observacao || ' (auto-gerado)';
  ELSIF NEW.origem = 'parcelado' AND NEW.numero_parcela IS NOT NULL THEN
    v_observacao := v_observacao || ' (parcela ' || NEW.numero_parcela::text
                    || '/' || COALESCE(NEW.total_parcelas::text, NEW.parcelas::text, '?') || ')';
  END IF;

  INSERT INTO public.contas_pagar_historico (
    conta_id, status_anterior, status_novo, observacao, usuario_id, created_at
  ) VALUES (
    NEW.id, NULL, NEW.status, v_observacao, NEW.criado_por, COALESCE(NEW.created_at, now())
  );

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_sync_pj_para_parceiro_comercial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parceiro_id    UUID;
  v_dados_bancarios JSONB;
BEGIN
  v_dados_bancarios := jsonb_strip_nulls(jsonb_build_object(
    'banco_codigo', NEW.banco_codigo,
    'banco_nome',   NEW.banco_nome,
    'agencia',      NEW.agencia,
    'conta',        NEW.conta,
    'tipo_conta',   NEW.tipo_conta
  ));

  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_parceiro_id
      FROM public.parceiros_comerciais
     WHERE cnpj = NEW.cnpj
     LIMIT 1;

    IF v_parceiro_id IS NOT NULL THEN
      UPDATE public.parceiros_comerciais
         SET tipos = ARRAY(
               SELECT DISTINCT unnest(
                 COALESCE(tipos, ARRAY[]::text[]) || ARRAY['prestador_pj']
               )
             ),
             dados_bancarios = COALESCE(dados_bancarios, NULLIF(v_dados_bancarios, '{}'::jsonb)),
             pix_chave       = COALESCE(pix_chave, NEW.chave_pix),
             updated_at      = now()
       WHERE id = v_parceiro_id;
    ELSE
      INSERT INTO public.parceiros_comerciais (
        razao_social, nome_fantasia, cnpj, cpf, tipo_pessoa,
        email, telefone,
        logradouro, numero, bairro, cidade, uf, cep,
        pix_chave, dados_bancarios,
        tipos, ativo, origem
      ) VALUES (
        NEW.razao_social, NEW.nome_fantasia, NEW.cnpj, NEW.cpf,
        CASE WHEN NEW.cnpj IS NOT NULL AND NEW.cnpj <> '' THEN 'PJ' ELSE 'PF' END,
        NEW.email_corporativo, COALESCE(NEW.telefone_corporativo, NEW.contato_telefone),
        NEW.logradouro, NEW.numero, NEW.bairro, NEW.cidade, NEW.uf, NEW.cep,
        NEW.chave_pix, NULLIF(v_dados_bancarios, '{}'::jsonb),
        ARRAY['prestador_pj'],
        (NEW.status = 'ativo'),
        'sync_contratos_pj'
      )
      RETURNING id INTO v_parceiro_id;
    END IF;

    UPDATE public.contratos_pj
       SET parceiro_comercial_id = v_parceiro_id
     WHERE id = NEW.id
       AND parceiro_comercial_id IS NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.parceiro_comercial_id IS NOT NULL
       AND NEW.parceiro_comercial_id IS NOT DISTINCT FROM OLD.parceiro_comercial_id
       AND (
            NEW.razao_social         IS DISTINCT FROM OLD.razao_social
         OR NEW.nome_fantasia        IS DISTINCT FROM OLD.nome_fantasia
         OR NEW.email_corporativo    IS DISTINCT FROM OLD.email_corporativo
         OR NEW.telefone_corporativo IS DISTINCT FROM OLD.telefone_corporativo
         OR NEW.contato_telefone     IS DISTINCT FROM OLD.contato_telefone
         OR NEW.banco_codigo         IS DISTINCT FROM OLD.banco_codigo
         OR NEW.banco_nome           IS DISTINCT FROM OLD.banco_nome
         OR NEW.agencia              IS DISTINCT FROM OLD.agencia
         OR NEW.conta                IS DISTINCT FROM OLD.conta
         OR NEW.tipo_conta           IS DISTINCT FROM OLD.tipo_conta
         OR NEW.chave_pix            IS DISTINCT FROM OLD.chave_pix
         OR NEW.logradouro           IS DISTINCT FROM OLD.logradouro
         OR NEW.numero               IS DISTINCT FROM OLD.numero
         OR NEW.bairro               IS DISTINCT FROM OLD.bairro
         OR NEW.cidade               IS DISTINCT FROM OLD.cidade
         OR NEW.uf                   IS DISTINCT FROM OLD.uf
         OR NEW.cep                  IS DISTINCT FROM OLD.cep
         OR NEW.status               IS DISTINCT FROM OLD.status
       )
    THEN
      UPDATE public.parceiros_comerciais p SET
        razao_social    = NEW.razao_social,
        nome_fantasia   = COALESCE(NEW.nome_fantasia, p.nome_fantasia),
        email           = COALESCE(NEW.email_corporativo, p.email),
        telefone        = COALESCE(NEW.telefone_corporativo, NEW.contato_telefone, p.telefone),
        logradouro      = COALESCE(NEW.logradouro, p.logradouro),
        numero          = COALESCE(NEW.numero, p.numero),
        bairro          = COALESCE(NEW.bairro, p.bairro),
        cidade          = COALESCE(NEW.cidade, p.cidade),
        uf              = COALESCE(NEW.uf, p.uf),
        cep             = COALESCE(NEW.cep, p.cep),
        pix_chave       = NEW.chave_pix,
        dados_bancarios = NULLIF(v_dados_bancarios, '{}'::jsonb),
        ativo           = (NEW.status = 'ativo'),
        updated_at      = now()
      WHERE p.id = NEW.parceiro_comercial_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_tg_analise_aplicar_cadencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Não aplica se análise nasceu já decidida (caso PIX/cartão via pular_analise)
  IF NEW.status_final IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.fn_aplicar_cadencia_credito(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- FAIL-LOUD (em vez de NULL silencioso) — registra erro mas não bloqueia INSERT
    INSERT INTO pedido_eventos (
      pedido_id, tipo_evento, descricao, metadata, automatico
    ) VALUES (
      NEW.pedido_id, 'erro_automacao',
      'Falha ao aplicar cadência de crédito na análise ' || NEW.id,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'sqlerrm', SQLERRM,
        'erro_origem', 'fn_aplicar_cadencia_credito'
      ),
      true
    );
  END;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_tg_pedido_avanca_para_cobranca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Avança automaticamente: credito_aprovado → cobranca
  -- Cobre os 2 caminhos:
  --   • PIX/cartão via fn_tg_pedido_pular_analise (refatorada acima)
  --   • Boleto aprovado por Joseph no módulo Crédito (UPDATE manual)
  UPDATE public.pedidos
  SET estagio = 'cobranca',
      area_atual = 'sops',
      estagio_atualizado_em = NOW(),
      proxima_acao = 'SOps revisar e aceitar proposta de cobrança'
  WHERE id = NEW.id;

  -- Registra evento na timeline
  INSERT INTO public.pedido_eventos (
    pedido_id, tipo_evento, estagio_anterior, estagio_novo,
    area_anterior, area_nova, descricao, automatico
  ) VALUES (
    NEW.id, 'mudou_estagio', 'credito_aprovado', 'cobranca',
    NEW.area_atual, 'sops',
    'Avanço automático pós-aprovação de crédito',
    true
  );

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_tg_pedido_para_analise_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estagio = 'em_analise_credito'
     AND (TG_OP = 'INSERT' OR OLD.estagio IS DISTINCT FROM 'em_analise_credito') THEN
    PERFORM public.fn_criar_analise_desde_pedido(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_tg_pedido_pular_analise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_perfil text;
  v_condicao jsonb;
BEGIN
  -- Não roda se análise já existe (módulo Crédito que decidiu)
  IF EXISTS (SELECT 1 FROM analises_credito WHERE pedido_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Lê perfil pra registrar contexto
  SELECT perfil_credito INTO v_perfil
  FROM parceiros_comerciais
  WHERE id = NEW.parceiro_id;

  -- Parse das condições (datas de vencimento das parcelas)
  v_condicao := fn_parse_condicao(
    NEW.condicao_solicitada,
    NEW.valor_liquido,
    NEW.data_pedido::date
  );

  -- Cria análise virtual aprovada (pra registrar histórico)
  INSERT INTO analises_credito (
    pedido_id, parceiro_id, estagio_atual, status_final, perfil_aplicado,
    decidido_por, decidido_em, parecer_final, condicao_final_aprovada
  ) VALUES (
    NEW.id, NEW.parceiro_id, 'decisao', 'aprovado', v_perfil,
    auth.uid(), NOW(),
    'Aprovação direta — perfil ' || COALESCE(v_perfil, 'indefinido')
      || ' dispensa análise.',
    v_condicao
  );

  -- MUDANÇA: avança pra credito_aprovado (não mais pra pre_faturado)
  -- A trigger nova fn_tg_pedido_avanca_para_cobranca pega daqui e avança
  -- automaticamente pra cobranca.
  UPDATE pedidos
  SET estagio = 'credito_aprovado',
      estagio_atualizado_em = NOW(),
      area_atual = 'sops',
      proxima_acao = 'Materializar proposta de cobrança'
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_tg_titulo_pago_avanca_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pedido record;
  v_entradas_pendentes int;
BEGIN
  -- 1. Só age se foi entrada e está pago
  IF NEW.eh_entrada IS NOT TRUE OR NEW.status <> 'pago' THEN
    RETURN NEW;
  END IF;

  -- 2. Lê pedido — só age se estiver em aguardando_pagamento
  SELECT id, estagio, area_atual
  INTO v_pedido
  FROM pedidos WHERE id = NEW.pedido_id;

  IF NOT FOUND OR v_pedido.estagio <> 'aguardando_pagamento' THEN
    RETURN NEW;
  END IF;

  -- 3. Conta entradas do pedido ainda não pagas
  SELECT COUNT(*)
  INTO v_entradas_pendentes
  FROM titulo_a_receber
  WHERE pedido_id = NEW.pedido_id
    AND eh_entrada = true
    AND status <> 'pago';

  -- 4. Se zerou — avança via transicionar_pedido (registra evento na timeline)
  IF v_entradas_pendentes = 0 THEN
    PERFORM public.transicionar_pedido(
      NEW.pedido_id,
      'pre_faturado',
      'Aguardando envio ao Bling',
      'Avanço automático — entrada paga'
    );
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_transicao_pedido_compra_apos_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido_id UUID;
  v_total_itens INTEGER;
  v_itens_decididos INTEGER;
  v_itens_comprados INTEGER;
  v_itens_cancelados INTEGER;
  v_pedido_status pedido_compra_status_enum;
  v_novo_status pedido_compra_status_enum;
BEGIN
  v_pedido_id := COALESCE(NEW.pedido_id, OLD.pedido_id);
  
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  
  SELECT status INTO v_pedido_status FROM public.pedidos_compra WHERE id = v_pedido_id;
  IF v_pedido_status NOT IN ('em_compra', 'aberto') THEN RETURN NEW; END IF;
  
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status != 'pendente'),
         COUNT(*) FILTER (WHERE status = 'comprado'),
         COUNT(*) FILTER (WHERE status = 'cancelado')
    INTO v_total_itens, v_itens_decididos, v_itens_comprados, v_itens_cancelados
    FROM public.pedidos_compra_itens WHERE pedido_id = v_pedido_id;
  
  IF v_itens_decididos = v_total_itens AND v_total_itens > 0 THEN
    IF v_itens_cancelados = v_total_itens THEN
      v_novo_status := 'cancelado';
      UPDATE public.pedidos_compra
         SET status = 'cancelado', finalizado_em = COALESCE(finalizado_em, now()),
             cancelado_em = COALESCE(cancelado_em, now()),
             cancelamento_motivo = COALESCE(cancelamento_motivo, 'Todos os itens foram cancelados')
       WHERE id = v_pedido_id AND status != 'cancelado';
    ELSE
      v_novo_status := 'comprado';
      UPDATE public.pedidos_compra
         SET status = 'comprado', finalizado_em = COALESCE(finalizado_em, now())
       WHERE id = v_pedido_id AND status != 'comprado';
    END IF;
    
    -- Registrar evento de finalizacao
    PERFORM public.fn_log_evento_pedido(
      v_pedido_id,
      CASE WHEN v_novo_status = 'comprado' THEN 'pedido_finalizado_comprado' ELSE 'pedido_finalizado_cancelado' END,
      jsonb_build_object(
        'itens_comprados', v_itens_comprados,
        'itens_cancelados', v_itens_cancelados,
        'total_itens', v_total_itens
      ),
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_transicionar_pedido(p_pedido_id uuid, p_estagio_destino text, p_acao text, p_motivo text DEFAULT NULL::text, p_delta jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estagio_origem text;
  v_transicao_id uuid;
BEGIN
  -- Pega estágio atual
  SELECT estagio INTO v_estagio_origem
  FROM public.pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF v_estagio_origem IS NULL THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id;
  END IF;

  IF v_estagio_origem = p_estagio_destino THEN
    -- noop: já está no estágio destino
    RETURN NULL;
  END IF;

  -- Atualiza pedido
  UPDATE public.pedidos
  SET 
    estagio = p_estagio_destino,
    estagio_atualizado_em = now(),
    estagio_atualizado_por = auth.uid(),
    cancelado_em = CASE WHEN p_estagio_destino = 'cancelado' THEN now() ELSE cancelado_em END,
    cancelado_motivo = CASE WHEN p_estagio_destino = 'cancelado' THEN COALESCE(p_motivo, cancelado_motivo) ELSE cancelado_motivo END,
    faturado_em = CASE WHEN p_estagio_destino = 'faturado' AND faturado_em IS NULL THEN now() ELSE faturado_em END
  WHERE id = p_pedido_id;

  -- Registra transição
  INSERT INTO public.pedido_transicoes (
    pedido_id, ator, acao, estagio_origem, estagio_destino, motivo, delta_jsonb
  ) VALUES (
    p_pedido_id, auth.uid(), p_acao, v_estagio_origem, p_estagio_destino, p_motivo, p_delta
  )
  RETURNING id INTO v_transicao_id;

  RETURN v_transicao_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_analise_aprovada_avanca_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só dispara quando status_final muda PRA aprovado/aprovado_com_ressalva
  IF NEW.status_final IS DISTINCT FROM OLD.status_final 
     AND NEW.status_final IN ('aprovado','aprovado_com_ressalva') THEN
    
    -- Bloqueia se condicao_final_aprovada não foi preenchida
    IF NEW.condicao_final_aprovada IS NULL THEN
      RAISE EXCEPTION 'Análise % não pode ser aprovada sem condicao_final_aprovada preenchida', NEW.id;
    END IF;

    -- Transição 1: → credito_aprovado
    PERFORM public.fn_transicionar_pedido(
      NEW.pedido_id,
      'credito_aprovado',
      'analise_aprovada',
      'Análise ' || NEW.id::text || ' aprovada',
      jsonb_build_object('analise_id', NEW.id, 'status_final', NEW.status_final)
    );

    -- Transição 2: → pre_faturado (vai disparar trg_pedido_pre_faturado)
    PERFORM public.fn_transicionar_pedido(
      NEW.pedido_id,
      'pre_faturado',
      'avanca_para_pre_faturamento',
      NULL,
      jsonb_build_object('analise_id', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_cpr_recalc_nf()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_recalcular_vinculo_nf_cpr(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.nf_aplicavel IS DISTINCT FROM OLD.nf_aplicavel
       OR NEW.valor IS DISTINCT FROM OLD.valor THEN
      PERFORM fn_recalcular_vinculo_nf_cpr(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_nf_emitida_avanca_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido record;
  v_data_faturamento timestamp with time zone;
BEGIN
  -- Guards rápidos
  IF NEW.pedido_venda_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.situacao NOT IN ('emitida', 'autorizada') THEN
    RETURN NEW;
  END IF;

  -- Lê estado atual do pedido
  SELECT id, estagio INTO v_pedido
  FROM public.pedidos
  WHERE id = NEW.pedido_venda_id;

  -- Pedido sumiu (FK ON DELETE SET NULL deveria ter limpado, mas defensivo)
  IF v_pedido.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência: pedido já avançou
  IF v_pedido.estagio = 'faturado' THEN
    RETURN NEW;
  END IF;

  -- Pedido em estágio inesperado (não pre_faturado, não faturado)
  -- FAIL-LOUD: registra evento de aviso, não bloqueia TX da NF
  IF v_pedido.estagio != 'pre_faturado' THEN
    BEGIN
      INSERT INTO public.pedido_eventos (
        pedido_id, tipo_evento, descricao, metadata, automatico
      ) VALUES (
        NEW.pedido_venda_id,
        'erro_automacao',
        format('NF emitida (Bling %s, nº %s) tentou avançar pedido em estágio "%s" — esperado pre_faturado',
               NEW.bling_id, NEW.numero, v_pedido.estagio),
        jsonb_build_object(
          'erro_origem', 'fn_trg_nf_emitida_avanca_pedido',
          'nf_id', NEW.id,
          'nf_bling_id', NEW.bling_id,
          'nf_numero', NEW.numero,
          'estagio_pedido', v_pedido.estagio,
          'estagio_esperado', 'pre_faturado'
        ),
        true
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- nem o aviso pode bloquear o INSERT da NF
    END;
    RETURN NEW;
  END IF;

  -- Caminho feliz: pedido em pre_faturado → faturado
  v_data_faturamento := COALESCE(NEW.data_emissao::timestamptz, now());

  BEGIN
    -- UPDATE direto (transicionar_pedido depende de auth.uid() que é NULL
    -- em contexto de sync; SECURITY DEFINER aqui faz o papel)
    UPDATE public.pedidos
    SET estagio = 'faturado',
        area_atual = 'bling',
        faturado_em = v_data_faturamento,
        proxima_acao = NULL,
        estagio_atualizado_em = now()
    WHERE id = NEW.pedido_venda_id;

    -- Evento de transição de estágio
    INSERT INTO public.pedido_eventos (
      pedido_id, tipo_evento,
      estagio_anterior, estagio_novo,
      area_anterior, area_nova,
      descricao, metadata, automatico
    ) VALUES (
      NEW.pedido_venda_id, 'mudou_estagio',
      'pre_faturado', 'faturado',
      'sops', 'bling',
      format('NF %s-%s emitida em %s — pedido avançado pra faturado automaticamente',
             COALESCE(NEW.serie, '?'), COALESCE(NEW.numero, '?'),
             COALESCE(NEW.data_emissao::text, 'data desconhecida')),
      jsonb_build_object(
        'origem', 'trigger_nf_emitida',
        'nf_id', NEW.id,
        'nf_bling_id', NEW.bling_id,
        'nf_numero', NEW.numero,
        'nf_serie', NEW.serie,
        'nf_chave_acesso', NEW.chave_acesso,
        'data_emissao', NEW.data_emissao,
        'valor_nota', NEW.valor_nota
      ),
      true
    );

    -- Evento dedicado 'faturado'
    INSERT INTO public.pedido_eventos (
      pedido_id, tipo_evento,
      descricao, metadata, automatico
    ) VALUES (
      NEW.pedido_venda_id, 'faturado',
      format('NF %s-%s emitida — R$ %s',
             COALESCE(NEW.serie, '?'), COALESCE(NEW.numero, '?'),
             COALESCE(NEW.valor_nota::text, '?')),
      jsonb_build_object(
        'nf_id', NEW.id,
        'nf_bling_id', NEW.bling_id,
        'nf_numero', NEW.numero,
        'nf_serie', NEW.serie,
        'nf_chave_acesso', NEW.chave_acesso,
        'valor_nota', NEW.valor_nota,
        'pdf_url', NEW.pdf_url,
        'xml_url', NEW.xml_url
      ),
      true
    );

  EXCEPTION WHEN OTHERS THEN
    -- FAIL-LOUD: erro aqui registra evento mas não bloqueia TX da NF
    BEGIN
      INSERT INTO public.pedido_eventos (
        pedido_id, tipo_evento, descricao, metadata, automatico
      ) VALUES (
        NEW.pedido_venda_id,
        'erro_automacao',
        format('Falha ao avançar pedido pra faturado por NF: %s', SQLERRM),
        jsonb_build_object(
          'erro_origem', 'fn_trg_nf_emitida_avanca_pedido',
          'sqlstate', SQLSTATE,
          'sqlerrm', SQLERRM,
          'nf_id', NEW.id,
          'nf_bling_id', NEW.bling_id
        ),
        true
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_nfs_stage_propagar_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.conta_pagar_id IS NOT NULL THEN
      PERFORM fn_recalcular_tags_doc_cpr(NEW.conta_pagar_id);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.conta_pagar_id IS DISTINCT FROM OLD.conta_pagar_id THEN
      IF OLD.conta_pagar_id IS NOT NULL THEN
        PERFORM fn_recalcular_tags_doc_cpr(OLD.conta_pagar_id);
      END IF;
      IF NEW.conta_pagar_id IS NOT NULL THEN
        PERFORM fn_recalcular_tags_doc_cpr(NEW.conta_pagar_id);
      END IF;
    ELSIF NEW.conta_pagar_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM fn_recalcular_tags_doc_cpr(NEW.conta_pagar_id);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.conta_pagar_id IS NOT NULL THEN
      PERFORM fn_recalcular_tags_doc_cpr(OLD.conta_pagar_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_nfs_stage_recalc_cpr()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.conta_pagar_id IS NOT NULL THEN
      PERFORM fn_recalcular_vinculo_nf_cpr(NEW.conta_pagar_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- vínculo mudou (de CPR A pra CPR B, ou de NULL pra X, ou de X pra NULL)
    IF NEW.conta_pagar_id IS DISTINCT FROM OLD.conta_pagar_id THEN
      IF OLD.conta_pagar_id IS NOT NULL THEN
        PERFORM fn_recalcular_vinculo_nf_cpr(OLD.conta_pagar_id);
      END IF;
      IF NEW.conta_pagar_id IS NOT NULL THEN
        PERFORM fn_recalcular_vinculo_nf_cpr(NEW.conta_pagar_id);
      END IF;
    -- valor ou status mudou em NF ainda vinculada
    ELSIF NEW.conta_pagar_id IS NOT NULL AND (
      NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.status IS DISTINCT FROM OLD.status
    ) THEN
      PERFORM fn_recalcular_vinculo_nf_cpr(NEW.conta_pagar_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.conta_pagar_id IS NOT NULL THEN
      PERFORM fn_recalcular_vinculo_nf_cpr(OLD.conta_pagar_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_nfs_stage_recalc_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM recalcular_status_nf_stage(NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_pedido_pre_faturado_gera_titulos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qtd integer;
BEGIN
  IF NEW.estagio = 'pre_faturado'
     AND OLD.estagio IS DISTINCT FROM NEW.estagio THEN
    v_qtd := public.fn_gerar_titulos_em_pre_faturamento(NEW.id);
    RAISE NOTICE 'Pedido % entrou em pre_faturado — gerados % títulos', NEW.id, v_qtd;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_trg_titulo_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_user_preferencias_navegacao_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_validar_conta_real_mov()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tipo TEXT;
BEGIN
  IF NEW.conta_bancaria_id IS NOT NULL THEN
    SELECT tipo INTO v_tipo
      FROM public.contas_bancarias
     WHERE id = NEW.conta_bancaria_id;

    IF v_tipo NOT IN ('corrente', 'poupanca', 'investimento') THEN
      RAISE EXCEPTION 'conta_bancaria_id em movimentações deve apontar pra conta real. Recebido tipo: %', v_tipo;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_validar_pago_em_conta_real()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_tipo TEXT;
BEGIN
  IF NEW.pago_em_conta_id IS NOT NULL THEN
    SELECT tipo INTO v_tipo
      FROM public.contas_bancarias
     WHERE id = NEW.pago_em_conta_id;

    IF v_tipo NOT IN ('corrente', 'poupanca', 'investimento') THEN
      RAISE EXCEPTION 'pago_em_conta_id deve apontar pra conta real (corrente/poupanca/investimento). Cartões vão em cartao_id. Recebido tipo: %', v_tipo;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_de_conta(p_conta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta RECORD;
  v_mov_id uuid;
  v_data_mov date;
  v_valor numeric;
  v_categoria_nf uuid;
  v_codigo_atual text;
  v_codigo_nf text;
  v_nome_nf text;
  v_inconsistente boolean := false;
  v_motivo text := NULL;
BEGIN
  SELECT cpr.id, cpr.descricao, cpr.valor, cpr.status, cpr.tipo,
         cpr.data_pagamento, cpr.data_vencimento, cpr.pago_em_conta_id,
         cpr.forma_pagamento_id,
         cpr.plano_contas_id AS categoria_id,
         cpr.centro_custo_id, cpr.parceiro_id, cpr.movimentacao_bancaria_id,
         cpr.fornecedor_cliente, cpr.compromisso_parcelado_id,
         cpr.compromisso_recorrente_id
  INTO v_conta
  FROM contas_pagar_receber cpr
  WHERE cpr.id = p_conta_id;

  IF v_conta.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta nao encontrada');
  END IF;

  IF v_conta.movimentacao_bancaria_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true,
      'movimentacao_id', v_conta.movimentacao_bancaria_id, 'ja_existia', true);
  END IF;

  IF v_conta.pago_em_conta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'erro', 'Conta a pagar sem conta bancaria definida (pago_em_conta_id)');
  END IF;

  v_data_mov := COALESCE(v_conta.data_pagamento, v_conta.data_vencimento, CURRENT_DATE);
  v_valor := CASE WHEN v_conta.tipo = 'receber' THEN ABS(v_conta.valor)
                  ELSE -ABS(v_conta.valor) END;

  -- B-51 fix: nfs_stage.plano_contas_id (renomeada em §3.2)
  SELECT plano_contas_id INTO v_categoria_nf
  FROM nfs_stage
  WHERE conta_pagar_id = p_conta_id
    AND plano_contas_id IS NOT NULL
  LIMIT 1;

  IF v_categoria_nf IS NOT NULL AND v_conta.categoria_id IS DISTINCT FROM v_categoria_nf THEN
    SELECT codigo INTO v_codigo_atual
    FROM plano_contas WHERE id = v_conta.categoria_id;

    SELECT codigo, nome INTO v_codigo_nf, v_nome_nf
    FROM plano_contas WHERE id = v_categoria_nf;

    v_inconsistente := true;
    v_motivo := format('Conta paga com categoria "%s" mas NF está em "%s %s". Edite na NF pra resolver.',
      COALESCE(v_codigo_atual, '—'),
      COALESCE(v_codigo_nf, '—'),
      COALESCE(v_nome_nf, '—'));
  END IF;

  INSERT INTO movimentacoes_bancarias (
    conta_bancaria_id, conta_pagar_id, descricao, valor, data_transacao,
    plano_contas_id, centro_custo_id, tipo, tipo_pagamento, origem,
    conciliado, categoria_inconsistente, inconsistencia_motivo
  ) VALUES (
    v_conta.pago_em_conta_id, v_conta.id, v_conta.descricao, v_valor, v_data_mov,
    v_conta.categoria_id, v_conta.centro_custo_id,
    CASE WHEN v_conta.tipo = 'receber' THEN 'credito' ELSE 'debito' END,
    'pagamento', 'conta_pagar',
    false, v_inconsistente, v_motivo
  ) RETURNING id INTO v_mov_id;

  UPDATE contas_pagar_receber
  SET movimentacao_bancaria_id = v_mov_id, updated_at = now()
  WHERE id = p_conta_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimentacao_id', v_mov_id,
    'ja_existia', false,
    'inconsistente', v_inconsistente
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_parcelas_contrato_inicial(p_contrato_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v record;
  v_pasta record;
  v_data date;
  v_limite date;
  v_intervalo interval;
  v_num int := 1;
  v_parcela_id uuid;
  v_cpr_id uuid;
  v_descricao_base text;
BEGIN
  SELECT * INTO v FROM pasta_contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_pasta FROM ged_pastas WHERE id = v.pasta_id;
  v_descricao_base := COALESCE(v.descricao, v_pasta.nome, v.numero);

  -- Limite = último dia do mês atual (não hoje)
  v_limite := LEAST(
    (date_trunc('month', CURRENT_DATE) + interval '2 month' - interval '1 day')::date,
    COALESCE(v.vigencia_fim::date, (date_trunc('month', CURRENT_DATE) + interval '2 month')::date)
  );

  v_intervalo := CASE v.ciclo_pagamento
    WHEN 'mensal'     THEN interval '1 month'
    WHEN 'trimestral' THEN interval '3 months'
    WHEN 'anual'      THEN interval '1 year'
    ELSE NULL
  END;

  IF v.ciclo_pagamento = 'unico' THEN
    INSERT INTO pasta_contrato_parcelas (contrato_id, numero_parcela, total_parcelas, data_vencimento, valor, status, origem)
    VALUES (p_contrato_id, 1, 1, v.data_primeira_parcela::date, v.valor_parcela, 'pendente', 'principal')
    RETURNING id INTO v_parcela_id;
    IF v_parcela_id IS NOT NULL THEN
      INSERT INTO contas_pagar_receber (tipo, descricao, valor, data_vencimento, parceiro_id, forma_pagamento_id, origem, pasta_contrato_parcela_id, status)
      VALUES ('pagar', v_descricao_base, v.valor_parcela, v.data_primeira_parcela::date, v_pasta.parceiro_id, v.meio_pagamento_id, 'contrato', v_parcela_id, 'aberto')
      RETURNING id INTO v_cpr_id;
      UPDATE pasta_contrato_parcelas SET conta_pagar_id = v_cpr_id WHERE id = v_parcela_id;
    END IF;
    RETURN;
  END IF;

  IF v.ciclo_pagamento = 'parcelado' THEN
    FOR i IN 1..COALESCE(v.numero_parcelas, 1) LOOP
      v_data := v.data_primeira_parcela::date + (interval '1 month' * (i - 1));
      INSERT INTO pasta_contrato_parcelas (contrato_id, numero_parcela, total_parcelas, data_vencimento, valor, status, origem)
      VALUES (p_contrato_id, i, v.numero_parcelas, v_data, v.valor_parcela, 'pendente', 'principal')
      RETURNING id INTO v_parcela_id;
      IF v_parcela_id IS NOT NULL THEN
        INSERT INTO contas_pagar_receber (tipo, descricao, valor, data_vencimento, parceiro_id, forma_pagamento_id, origem, pasta_contrato_parcela_id, status)
        VALUES ('pagar', v_descricao_base || ' (' || i || '/' || v.numero_parcelas || ')', v.valor_parcela, v_data, v_pasta.parceiro_id, v.meio_pagamento_id, 'contrato', v_parcela_id, 'aberto')
        RETURNING id INTO v_cpr_id;
        UPDATE pasta_contrato_parcelas SET conta_pagar_id = v_cpr_id WHERE id = v_parcela_id;
      END IF;
    END LOOP;
    RETURN;
  END IF;

  -- RECORRENTE
  v_data := v.data_primeira_parcela::date;
  LOOP
    EXIT WHEN v_data > v_limite;

    IF NOT EXISTS (
      SELECT 1 FROM pasta_contrato_parcelas
      WHERE contrato_id = p_contrato_id AND origem = 'principal' AND data_vencimento = v_data
    ) THEN
      INSERT INTO pasta_contrato_parcelas (contrato_id, numero_parcela, data_vencimento, valor, status, origem)
      VALUES (p_contrato_id, v_num, v_data, v.valor_parcela, 'pendente', 'principal')
      RETURNING id INTO v_parcela_id;
      IF v_parcela_id IS NOT NULL THEN
        INSERT INTO contas_pagar_receber (tipo, descricao, valor, data_vencimento, parceiro_id, forma_pagamento_id, origem, pasta_contrato_parcela_id, status)
        VALUES ('pagar', v_descricao_base, v.valor_parcela, v_data, v_pasta.parceiro_id, v.meio_pagamento_id, 'contrato', v_parcela_id, 'aberto')
        RETURNING id INTO v_cpr_id;
        UPDATE pasta_contrato_parcelas SET conta_pagar_id = v_cpr_id WHERE id = v_parcela_id;
      END IF;
    END IF;

    v_num  := v_num + 1;
    v_data := v_data + v_intervalo;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_parcelas_previstas(p_compromisso_id uuid, p_parcela_inicial integer DEFAULT 1, p_parcela_final integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compromisso RECORD;
  v_parcela INT;
  v_data DATE;
  v_qtd_criadas INT := 0;
BEGIN
  -- Buscar dados do compromisso
  SELECT * INTO v_compromisso
  FROM public.compromissos_parcelados
  WHERE id = p_compromisso_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso % não encontrado', p_compromisso_id;
  END IF;

  -- Definir parcela final
  IF p_parcela_final IS NULL THEN
    p_parcela_final := v_compromisso.qtd_parcelas;
  END IF;

  -- Loop pra criar parcelas
  FOR v_parcela IN p_parcela_inicial..p_parcela_final LOOP
    -- Calcular data da parcela: primeira_parcela + (parcela - 1) meses
    v_data := v_compromisso.data_primeira_parcela + ((v_parcela - 1) * INTERVAL '1 month');

    -- B-51 fix: plano_contas_id (renomeada em §3.2 - 18/05/2026; valor de
    -- compromissos_parcelados.plano_contas_id, tambem renomeado)
    INSERT INTO public.contas_pagar_receber (
      tipo,
      descricao,
      valor,
      data_vencimento,
      fornecedor_cliente,
      status,
      origem,
      compromisso_parcelado_id,
      numero_parcela,
      total_parcelas,
      plano_contas_id,
      parceiro_id
    ) VALUES (
      'pagar',
      v_compromisso.descricao || ' (' || v_parcela || '/' || v_compromisso.qtd_parcelas || ')',
      v_compromisso.valor_parcela,
      v_data,
      'Compromisso parcelado',
      'previsto',
      'compromisso_parcelado',
      p_compromisso_id,
      v_parcela,
      v_compromisso.qtd_parcelas,
      v_compromisso.plano_contas_id,
      v_compromisso.parceiro_id
    );

    v_qtd_criadas := v_qtd_criadas + 1;
  END LOOP;

  -- Atualizar contagem no compromisso
  UPDATE public.compromissos_parcelados
  SET parcelas_previstas = parcelas_previstas + v_qtd_criadas,
      updated_at = now()
  WHERE id = p_compromisso_id;

  RETURN v_qtd_criadas;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_parcelas_recorrentes(p_recorrente_id uuid, p_meses_a_frente integer DEFAULT 12)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_data_atual DATE;
  v_data_limite DATE;
  v_count INTEGER := 0;
  v_existe INTEGER;
  v_incremento INTEGER;
BEGIN
  SELECT * INTO v_rec FROM compromissos_recorrentes WHERE id = p_recorrente_id;

  IF NOT FOUND OR v_rec.status != 'ativo' THEN
    RETURN 0;
  END IF;

  v_incremento := CASE v_rec.periodicidade
    WHEN 'mensal' THEN 1
    WHEN 'trimestral' THEN 3
    WHEN 'anual' THEN 12
    ELSE 1
  END;

  v_data_atual := GREATEST(v_rec.data_inicio, CURRENT_DATE);
  v_data_atual := make_date(
    EXTRACT(YEAR FROM v_data_atual)::int,
    EXTRACT(MONTH FROM v_data_atual)::int,
    LEAST(
      v_rec.dia_vencimento,
      EXTRACT(DAY FROM (date_trunc('month', v_data_atual) + interval '1 month' - interval '1 day'))::int
    )
  );

  IF v_data_atual < CURRENT_DATE THEN
    v_data_atual := v_data_atual + (v_incremento || ' months')::interval;
  END IF;

  v_data_limite := CURRENT_DATE + (p_meses_a_frente || ' months')::interval;
  IF v_rec.data_fim IS NOT NULL AND v_rec.data_fim < v_data_limite THEN
    v_data_limite := v_rec.data_fim;
  END IF;

  WHILE v_data_atual <= v_data_limite LOOP
    SELECT COUNT(*) INTO v_existe
    FROM contas_pagar_receber
    WHERE compromisso_recorrente_id = p_recorrente_id
      AND data_vencimento = v_data_atual;

    IF v_existe = 0 THEN
      -- B-51 fix (§3.2 - 18/05/2026):
      --   * coluna `conta_id` em CPR foi renomeada para `plano_contas_id`
      --   * `compromissos_recorrentes.categoria_id` foi renomeada para `plano_contas_id`
      --   * `centro_custo` (text) foi dropada de CPR em 06/05/2026; CPR agora
      --     so tem `centro_custo_id` (uuid). v_rec.centro_custo continua text
      --     mas nao ha mapeamento text->uuid implementado — operador completa
      --     o centro_custo_id na CPR gerada depois (D-1)
      INSERT INTO contas_pagar_receber (
        descricao,
        valor,
        data_vencimento,
        status,
        tipo,
        plano_contas_id,
        parceiro_id,
        compromisso_recorrente_id,
        origem,
        observacao
      ) VALUES (
        v_rec.descricao,
        v_rec.valor,
        v_data_atual,
        'previsto',
        'pagar',
        v_rec.plano_contas_id,
        v_rec.parceiro_id,
        p_recorrente_id,
        'recorrente',
        v_rec.observacao
      );
      v_count := v_count + 1;
    END IF;

    v_data_atual := v_data_atual + (v_incremento || ' months')::interval;
  END LOOP;

  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gerar_proximas_parcelas_pasta()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_contrato_id uuid;
  v_count int := 0;
BEGIN
  FOR v_contrato_id IN
    SELECT id FROM public.pasta_contratos
    WHERE COALESCE(status, 'ativo') = 'ativo'
      AND COALESCE(valor_parcela, 0) > 0
      AND data_primeira_parcela IS NOT NULL
      AND (
        (numero_parcelas IS NULL AND vigencia_fim IS NULL)
        OR COALESCE(renova_automaticamente, false) = true
      )
  LOOP
    PERFORM public.gerar_parcelas_pasta_contrato(v_contrato_id);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_user_departamento_unidade(p_user_id uuid)
 RETURNS TABLE(departamento_id uuid, unidade_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link RECORD;
BEGIN
  SELECT colaborador_clt_id, contrato_pj_id
    INTO v_link
    FROM public.user_colaborador_link
   WHERE user_id = p_user_id
     AND inativado_em IS NULL
   LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN; -- usuário sem vínculo, retorna vazio
  END IF;
  
  -- Tenta CLT primeiro
  IF v_link.colaborador_clt_id IS NOT NULL THEN
    RETURN QUERY
      SELECT c.departamento_id, c.unidade_id
        FROM public.colaboradores_clt c
       WHERE c.id = v_link.colaborador_clt_id;
    RETURN;
  END IF;
  
  -- Cai pra PJ se não houver CLT
  IF v_link.contrato_pj_id IS NOT NULL THEN
    RETURN QUERY
      SELECT pj.departamento_id, pj.unidade_id
        FROM public.contratos_pj pj
       WHERE pj.id = v_link.contrato_pj_id;
    RETURN;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vault', 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN v_secret;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ia_listar_ambiguos()
 RETURNS TABLE(tipo text, conta_id uuid, parcela_grupo_id uuid, descricao text, valor_referencia numeric, qtd_parcelas integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Branch 1: Categoria pendente (1 linha por conta)
SELECT 'categoria'::text AS tipo,
       cpr.id AS conta_id,
       cpr.parcela_grupo_id,
       cpr.descricao,
       cpr.valor AS valor_referencia,
       1::integer AS qtd_parcelas
FROM contas_pagar_receber cpr
WHERE cpr.tipo = 'pagar'                                                            -- ← C-59: filtro adicionado (branch 1)
  AND cpr.categoria_sugerida_ia = true
  -- removida: AND cpr.conta_id IS NULL  (coluna não existe, bug histórico)
  AND cpr.status NOT IN ('cancelado')

UNION ALL

-- Branch 2: NF pendente (1 linha por grupo OU por conta avulsa)
SELECT 'nf'::text AS tipo,
       grp.conta_id_repr AS conta_id,
       grp.parcela_grupo_id,
       grp.descricao,
       grp.valor_referencia,
       grp.qtd_parcelas
FROM (
  -- Branch 2.a: Avulsas (sem grupo)
  SELECT cpr.id AS conta_id_repr,
         NULL::uuid AS parcela_grupo_id,
         cpr.descricao,
         cpr.valor AS valor_referencia,
         1 AS qtd_parcelas
  FROM contas_pagar_receber cpr
  WHERE cpr.tipo = 'pagar'                                                          -- ← C-59: filtro adicionado (branch 2.a)
    AND cpr.tem_sugestao_nf = true
    AND cpr.parcela_grupo_id IS NULL
    AND cpr.status NOT IN ('cancelado')
    AND NOT EXISTS (SELECT 1 FROM nfs_stage nf WHERE nf.conta_pagar_id = cpr.id)

  UNION ALL

  -- Branch 2.b: Grupos (1 linha por grupo)
  SELECT (SELECT cpr2.id FROM contas_pagar_receber cpr2
          WHERE cpr2.parcela_grupo_id = g.parcela_grupo_id
            AND cpr2.status NOT IN ('cancelado')
          ORDER BY cpr2.data_vencimento
          LIMIT 1) AS conta_id_repr,
         g.parcela_grupo_id,
         (SELECT cpr3.descricao FROM contas_pagar_receber cpr3
          WHERE cpr3.parcela_grupo_id = g.parcela_grupo_id
          LIMIT 1) AS descricao,
         g.soma AS valor_referencia,
         g.qtd::integer AS qtd_parcelas
  FROM (
    SELECT cpr.parcela_grupo_id,
           SUM(cpr.valor) AS soma,
           COUNT(*) AS qtd
    FROM contas_pagar_receber cpr
    WHERE cpr.tipo = 'pagar'                                                        -- ← C-59: filtro adicionado (branch 2.b)
      AND cpr.tem_sugestao_nf = true
      AND cpr.parcela_grupo_id IS NOT NULL
      AND cpr.status NOT IN ('cancelado')
      AND NOT EXISTS (SELECT 1 FROM nfs_stage nf WHERE nf.conta_pagar_id = cpr.id)
    GROUP BY cpr.parcela_grupo_id
  ) g
) grp;
$function$;
CREATE OR REPLACE FUNCTION public.ia_listar_nfs_candidatas(p_conta_id uuid)
 RETURNS TABLE(nf_id uuid, fornecedor_razao_social text, fornecedor_cnpj text, nf_numero text, nf_serie text, nf_chave_acesso text, arquivo_nome text, itens jsonb, valor_nf numeric, data_emissao date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_valor_ref numeric;
  v_grupo uuid;
BEGIN
  SELECT cpr.parcela_grupo_id,
    CASE 
      WHEN cpr.parcela_grupo_id IS NOT NULL THEN
        (SELECT SUM(valor) FROM contas_pagar_receber c2 
         WHERE c2.parcela_grupo_id = cpr.parcela_grupo_id 
           AND c2.status NOT IN ('cancelado'))
      ELSE cpr.valor
    END
  INTO v_grupo, v_valor_ref
  FROM contas_pagar_receber cpr
  WHERE cpr.id = p_conta_id;
  
  RETURN QUERY
  SELECT 
    nf.id, nf.fornecedor_razao_social, nf.fornecedor_cnpj,
    nf.nf_numero, nf.nf_serie, nf.nf_chave_acesso, nf.arquivo_nome,
    nf.itens, nf.valor, nf.nf_data_emissao::date
  FROM nfs_stage nf
  WHERE nf.status = 'nao_vinculada'
    AND nf.conta_pagar_id IS NULL
    AND ABS(nf.valor - v_valor_ref) <= 0.01
  ORDER BY nf.nf_data_emissao DESC NULLS LAST, nf.nf_numero;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ignorar_lancamento(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE fatura_cartao_lancamentos
  SET status = 'ignorado',
      updated_at = now()
  WHERE id = p_lancamento_id
    AND status = 'pendente';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não está pendente');
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', 'ignorado');
END;
$function$;
CREATE OR REPLACE FUNCTION public.iniciar_compra_pedido(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_pedido RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;
  IF NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas Comprador pode iniciar compra (super_admin em V1)';
  END IF;
  
  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id; END IF;
  IF v_pedido.status != 'aberto' THEN
    RAISE EXCEPTION 'Pedido soh pode ser iniciado a partir de ABERTO (atual: %)', v_pedido.status;
  END IF;
  IF v_pedido.comprador_id IS NOT NULL AND v_pedido.comprador_id != v_user_id THEN
    RAISE EXCEPTION 'Pedido jah foi pego por outro Comprador';
  END IF;
  
  UPDATE public.pedidos_compra
     SET status = 'em_compra', comprador_id = v_user_id, iniciado_em = now()
   WHERE id = p_pedido_id;
  
  PERFORM public.fn_log_evento_pedido(p_pedido_id, 'pedido_pego', '{}'::jsonb, v_user_id);
  
  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id, 'status', 'em_compra',
    'comprador_id', v_user_id, 'iniciado_em', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.lancar_ofx_como_movimentacao(p_ofx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx RECORD;
  v_movimentacao_id UUID;
  v_conta_pagar_id UUID;
  v_user_id UUID;
  v_tipo_cpr TEXT;
  v_valor_abs NUMERIC;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_ofx FROM ofx_transacoes_stage WHERE id = p_ofx_id;
  IF v_ofx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX não encontrada');
  END IF;
  IF v_ofx.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Transação OFX já processada');
  END IF;

  IF v_ofx.valor < 0 THEN
    v_tipo_cpr := 'pagar';
  ELSE
    v_tipo_cpr := 'receber';
  END IF;
  v_valor_abs := ABS(v_ofx.valor);

  INSERT INTO contas_pagar_receber (
    tipo, descricao, valor,
    data_vencimento, data_pagamento,
    status, origem,
    criado_por, created_at, updated_at
  ) VALUES (
    v_tipo_cpr,
    v_ofx.descricao,
    v_valor_abs,
    v_ofx.data_transacao,
    v_ofx.data_transacao,
    'paga',
    'ofx_avulso',
    v_user_id, now(), now()
  ) RETURNING id INTO v_conta_pagar_id;

  INSERT INTO movimentacoes_bancarias (
    conta_bancaria_id, data_transacao, valor, descricao, tipo,
    id_transacao_banco, hash_unico, saldo_pos_transacao,
    origem, conta_pagar_id,
    conciliado, conciliado_em, conciliado_por
  ) VALUES (
    v_ofx.conta_bancaria_id, v_ofx.data_transacao, v_ofx.valor, v_ofx.descricao,
    public.normalizar_tipo_movimentacao(v_ofx.tipo, v_ofx.valor),
    v_ofx.id_transacao_banco, v_ofx.hash_unico, v_ofx.saldo_pos_transacao,
    'ofx', v_conta_pagar_id,
    true, now(), v_user_id
  ) RETURNING id INTO v_movimentacao_id;

  UPDATE contas_pagar_receber
  SET
    movimentacao_bancaria_id = v_movimentacao_id,
    conciliado_em = now(),
    conciliado_por = v_user_id
  WHERE id = v_conta_pagar_id;

  -- 🆕 No-op pra contas avulsas (sem vínculo), mas mantém padrão consistente
  PERFORM public.recalcular_status_fatura(v_conta_pagar_id);

  UPDATE ofx_transacoes_stage SET status = 'persistida' WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimentacao_id', v_movimentacao_id,
    'conta_pagar_id', v_conta_pagar_id,
    'descricao', v_ofx.descricao,
    'valor', v_ofx.valor,
    'tipo', v_tipo_cpr,
    'novo_status', 'paga'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.limpar_rascunhos_antigos()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.rascunhos_importacao
  WHERE created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.listar_faturas_disponiveis_para_planilha(p_planilha_id uuid)
 RETURNS TABLE(fatura_id uuid, cartao_nome text, data_vencimento date, valor_total numeric, qtd_lancamentos bigint, ja_vinculada boolean, parceiros text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    fc.id, cc.nome, fc.data_vencimento,
    COALESCE(SUM(ABS(cpr.valor)), 0),
    COUNT(fcl.id),
    EXISTS(SELECT 1 FROM public.planilha_fatura_vinculo pfv
           WHERE pfv.planilha_id = p_planilha_id AND pfv.fatura_id = fc.id),
    STRING_AGG(DISTINCT COALESCE(cpr.fornecedor_cliente, cpr.descricao, '—'), ' · '
               ORDER BY COALESCE(cpr.fornecedor_cliente, cpr.descricao, '—'))
  FROM public.faturas_cartao fc
  JOIN public.cartoes_credito cc ON cc.id = fc.cartao_id
  LEFT JOIN public.fatura_cartao_lancamentos fcl ON fcl.fatura_id = fc.id
  LEFT JOIN public.contas_pagar_receber cpr ON cpr.id = fcl.conta_pagar_id
  GROUP BY fc.id, cc.nome, fc.data_vencimento
  HAVING COALESCE(SUM(ABS(cpr.valor)), 0) > 0
  ORDER BY fc.data_vencimento DESC;
$function$;
CREATE OR REPLACE FUNCTION public.listar_movimentacoes_elegiveis()
 RETURNS TABLE(id uuid, descricao text, valor numeric, data_transacao date, conta_pagar_id uuid, cpr_descricao text, fornecedor_cliente text, forma_pagamento_nome text, fatura_vencimento date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    m.id,
    COALESCE(cpr.descricao, m.descricao),
    ABS(m.valor),
    m.data_transacao,
    m.conta_pagar_id,
    cpr.descricao,
    cpr.fornecedor_cliente,
    fp.nome,
    (SELECT fc.data_vencimento FROM fatura_cartao_lancamentos fcl
     JOIN faturas_cartao fc ON fc.id = fcl.fatura_id
     WHERE fcl.conta_pagar_id = cpr.id LIMIT 1)
  FROM public.movimentacoes_bancarias m
  LEFT JOIN public.contas_pagar_receber cpr ON cpr.id = m.conta_pagar_id
  LEFT JOIN public.formas_pagamento fp ON fp.id = cpr.forma_pagamento_id
  WHERE m.tipo = 'debito' AND m.pg_em IS NULL
  ORDER BY m.data_transacao DESC;
$function$;
CREATE OR REPLACE FUNCTION public.log_mudanca_grupo_parceiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- só loga mudança real (NULL → uuid, uuid → NULL, uuid → outro uuid)
  IF (NEW.grupo_id IS DISTINCT FROM OLD.grupo_id) THEN
    INSERT INTO public.grupos_parceiros_log (
      parceiro_id, grupo_anterior_id, grupo_novo_id, mudou_por
    ) VALUES (
      NEW.id, OLD.grupo_id, NEW.grupo_id, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_compra_como_realizada(p_compra_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compra            RECORD;
  v_cpr               RECORD;
  v_user_id           UUID;
  v_count_atualizadas INT := 0;
  v_count_bloqueadas  INT := 0;
  v_valor_total       NUMERIC := 0;
  v_cprs_ids          UUID[] := ARRAY[]::UUID[];
  v_observacao_final  TEXT;
BEGIN
  -- 1) Autorizacao (V1: super_admin, igual executar_pagamento)
  IF NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Apenas super_admin pode marcar compra como realizada em V1');
  END IF;

  v_user_id := auth.uid();

  -- 2) Existe a compra?
  SELECT id, pedido_compra_id INTO v_compra
    FROM public.compras_registradas
   WHERE id = p_compra_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Compra registrada nao encontrada');
  END IF;

  v_observacao_final := COALESCE(p_observacao, 'Marcado como realizada (pagamento ja feito fora do sistema)');

  -- 3) Itera pelas CPRs da compra, atualiza as elegiveis
  FOR v_cpr IN
    SELECT id, status, valor
      FROM public.contas_pagar_receber
     WHERE compra_registrada_id = p_compra_id
  LOOP
    IF v_cpr.status IN ('rascunho', 'aberto', 'aprovado', 'aguardando_pagamento') THEN
      -- Update do status
      UPDATE public.contas_pagar_receber
         SET status     = 'realizada',
             updated_at = now()
       WHERE id = v_cpr.id;

      -- Historico (mesmo padrao do executar_pagamento)
      INSERT INTO public.contas_pagar_historico (
        conta_id, status_anterior, status_novo, observacao, usuario_id
      ) VALUES (
        v_cpr.id, v_cpr.status, 'realizada', v_observacao_final, v_user_id
      );

      v_count_atualizadas := v_count_atualizadas + 1;
      v_valor_total       := v_valor_total + COALESCE(v_cpr.valor, 0);
      v_cprs_ids          := v_cprs_ids || v_cpr.id;
    ELSE
      v_count_bloqueadas := v_count_bloqueadas + 1;
    END IF;
  END LOOP;

  -- 4) Retorno
  RETURN jsonb_build_object(
    'ok', true,
    'compra_id', p_compra_id,
    'pedido_compra_id', v_compra.pedido_compra_id,
    'cprs_atualizadas', v_count_atualizadas,
    'cprs_bloqueadas', v_count_bloqueadas,
    'cprs_ids', v_cprs_ids,
    'valor_total_realizado', v_valor_total
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_documento_classificado(p_ged_documento_id uuid, p_resultado_ia jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_tipo TEXT;
  v_nome_atual TEXT;
  v_tags_atuais TEXT[];
  v_parceiro_cnpj_ia TEXT;
  v_parceiro_match UUID;
  v_parceiro_inferido BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_tipo := COALESCE(p_resultado_ia->>'tipo_documento', 'outro');

  SELECT nome, tags INTO v_nome_atual, v_tags_atuais
  FROM public.ged_documentos
  WHERE id = p_ged_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ged_documento_id % não encontrado', p_ged_documento_id 
      USING ERRCODE = '02000';
  END IF;

  -- NOVO: tenta match automático de parceiro por CNPJ
  v_parceiro_cnpj_ia := regexp_replace(
    COALESCE(p_resultado_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g'
  );

  IF length(v_parceiro_cnpj_ia) >= 11 THEN
    SELECT id INTO v_parceiro_match
    FROM public.parceiros_comerciais
    WHERE regexp_replace(COALESCE(cnpj, cpf, ''), '[^0-9]', '', 'g') = v_parceiro_cnpj_ia
    LIMIT 1;
  END IF;

  -- IA inferiu parceiro? (razão social não-vazia)
  v_parceiro_inferido := COALESCE(p_resultado_ia->>'parceiro_razao_social', '') <> '';

  UPDATE public.ged_documentos
  SET
    tipo_documento = v_tipo,
    classificacao_ia = p_resultado_ia,
    confianca_ia = p_resultado_ia->>'confianca',
    resumo_ia = p_resultado_ia->>'resumo',
    nome = CASE
      WHEN v_nome_atual IS NULL OR v_nome_atual = (
        SELECT arquivo_original FROM public.ged_documentos WHERE id = p_ged_documento_id
      ) THEN COALESCE(p_resultado_ia->>'nome_sugerido', v_nome_atual)
      ELSE v_nome_atual
    END,
    tags = CASE
      WHEN v_tags_atuais IS NULL OR array_length(v_tags_atuais, 1) IS NULL
        THEN ARRAY(SELECT jsonb_array_elements_text(p_resultado_ia->'tags_sugeridas'))
      ELSE v_tags_atuais
    END,
    status_classificacao = 'classificada',
    -- NOVO: resolução automática se houve match, senão marca pendente (Doutrina #118)
    parceiro_id = COALESCE(parceiro_id, v_parceiro_match),
    parceiro_resolucao_pendente = (
      v_parceiro_inferido 
      AND COALESCE(parceiro_id, v_parceiro_match) IS NULL
      AND parceiro_resolucao_dispensada = false
    ),
    updated_at = now()
  WHERE id = p_ged_documento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_ged_documento_id,
    'tipo', v_tipo,
    'confianca', p_resultado_ia->>'confianca',
    'parceiro_match_automatico', v_parceiro_match IS NOT NULL,
    'parceiro_resolucao_pendente', v_parceiro_inferido AND v_parceiro_match IS NULL
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_pares_diferentes(p_id_a uuid, p_id_b uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, erro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id_a UUID := LEAST(p_id_a, p_id_b);
  v_id_b UUID := GREATEST(p_id_a, p_id_b);
BEGIN
  INSERT INTO nf_stage_pares_verificados (id_a, id_b, decisao, user_id)
  VALUES (v_id_a, v_id_b, 'diferentes', p_user_id)
  ON CONFLICT (id_a, id_b) DO UPDATE SET decisao = 'diferentes', user_id = p_user_id;

  ok := true;
  erro := NULL;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_remessa_manual_em_lote(p_descricao text, p_periodo_inicio date, p_periodo_fim date, p_destinatarios text[] DEFAULT '{}'::text[], p_observacao text DEFAULT NULL::text, p_conta_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remessa_id UUID;
  v_qtd_contas INT := 0;
  v_qtd_docs INT := 0;
  v_user_id UUID := auth.uid();
BEGIN
  IF array_length(p_conta_ids, 1) IS NULL OR array_length(p_conta_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Nenhuma conta selecionada');
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Período inválido');
  END IF;
  IF p_periodo_fim < p_periodo_inicio THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Período fim anterior ao início');
  END IF;

  INSERT INTO public.remessas_contador (
    descricao, periodo_inicio, periodo_fim, enviada_em, enviada_por, metodo,
    destinatarios, observacao, qtd_documentos, qtd_contas
  ) VALUES (
    COALESCE(NULLIF(TRIM(p_descricao), ''), 'Marcação em lote ' || to_char(now(), 'DD/MM/YYYY HH24:MI')),
    p_periodo_inicio, p_periodo_fim, now(), v_user_id, 'manual_download',
    COALESCE(p_destinatarios, '{}'::TEXT[]), p_observacao, 0, 0
  ) RETURNING id INTO v_remessa_id;

  WITH ins AS (
    INSERT INTO public.remessas_contador_itens (remessa_id, conta_id, doc_ids)
    SELECT
      v_remessa_id,
      c.id,
      COALESCE(
        (SELECT array_agg(d.id)
         FROM public.contas_pagar_documentos d
         WHERE d.conta_pagar_id = c.id),  -- H-02: era conta_id
        '{}'::UUID[]
      )
    FROM public.contas_pagar_receber c
    WHERE c.id = ANY(p_conta_ids)
      AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.remessas_contador_itens i
        WHERE i.remessa_id = v_remessa_id AND i.conta_id = c.id
      )
    ON CONFLICT (remessa_id, conta_id) DO NOTHING
    RETURNING doc_ids
  )
  SELECT COUNT(*)::INT, COALESCE(SUM(array_length(doc_ids, 1)), 0)::INT
  INTO v_qtd_contas, v_qtd_docs
  FROM ins;

  UPDATE public.remessas_contador
  SET qtd_contas = v_qtd_contas, qtd_documentos = v_qtd_docs
  WHERE id = v_remessa_id;

  RETURN jsonb_build_object(
    'ok', true,
    'remessa_id', v_remessa_id,
    'qtd_contas', v_qtd_contas,
    'qtd_documentos', v_qtd_docs
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_titulo_pago(p_titulo_id uuid, p_data_pagamento timestamp with time zone DEFAULT now(), p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_titulo record;
  v_operador uuid;
  v_linhas_titulo int;
  v_linhas_cpr int;
BEGIN
  v_operador := auth.uid();

  -- 1. Lê título com lock (FOR UPDATE evita race)
  SELECT id, conta_id, pedido_id, eh_entrada, status, numero_titulo
  INTO v_titulo
  FROM titulo_a_receber WHERE id = p_titulo_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Título % não encontrado', p_titulo_id USING ERRCODE = '02000';
  END IF;

  -- 2. Idempotência — já pago, retorna info sem alterar
  IF v_titulo.status = 'pago' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotente', true,
      'titulo_id', p_titulo_id,
      'numero_titulo', v_titulo.numero_titulo,
      'mensagem', 'Título já estava pago'
    );
  END IF;

  -- 3. Atualiza título
  UPDATE titulo_a_receber
  SET status = 'pago',
      data_pagamento = p_data_pagamento,
      updated_at = NOW()
  WHERE id = p_titulo_id
    AND status <> 'pago';
  GET DIAGNOSTICS v_linhas_titulo = ROW_COUNT;

  -- 4. Cascata simples: CPR vinculado vira 'pago' (não propaga a outras CPRs do grupo)
  UPDATE contas_pagar_receber
  SET status = 'pago',
      pago_em = p_data_pagamento,
      observacao_pagamento_manual = COALESCE(p_observacao, observacao_pagamento_manual),
      pago_por = v_operador,
      updated_at = NOW()
  WHERE id = v_titulo.conta_id
    AND status NOT IN ('pago', 'conciliado', 'cancelado');
  GET DIAGNOSTICS v_linhas_cpr = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'titulo_id', p_titulo_id,
    'numero_titulo', v_titulo.numero_titulo,
    'pedido_id', v_titulo.pedido_id,
    'eh_entrada', v_titulo.eh_entrada,
    'cpr_id', v_titulo.conta_id,
    'cpr_atualizado', v_linhas_cpr > 0,
    'data_pagamento', p_data_pagamento
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.materializar_cobranca(p_pedido_id uuid, p_titulos_editados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pedido record;
  v_analise_id uuid;
  v_titulo jsonb;
  v_titulo_count int;
  v_tem_entrada boolean := false;
  v_parcela_grupo uuid := gen_random_uuid();
  v_cpr_id uuid;
  v_titulo_id uuid;
  v_titulos_criados jsonb := '[]'::jsonb;
  v_proximo_estagio text;
  v_operador uuid;
  v_numero_titulo text;
BEGIN
  v_operador := auth.uid();

  -- 1. Valida pedido
  SELECT id, parceiro_id, id_externo, estagio, area_atual
  INTO v_pedido
  FROM pedidos WHERE id = p_pedido_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id USING ERRCODE = '02000';
  END IF;

  IF v_pedido.estagio <> 'cobranca' THEN
    RAISE EXCEPTION 'Pedido % não está em cobranca (estágio atual: %)',
      p_pedido_id, v_pedido.estagio USING ERRCODE = '22023';
  END IF;

  -- 2. Resgata análise vinculada
  SELECT id INTO v_analise_id
  FROM analises_credito
  WHERE pedido_id = p_pedido_id AND status_final = 'aprovado'
  ORDER BY decidido_em DESC NULLS LAST
  LIMIT 1;

  IF v_analise_id IS NULL THEN
    RAISE EXCEPTION 'Pedido % sem análise aprovada', p_pedido_id USING ERRCODE = '22023';
  END IF;

  -- 3. Valida payload
  v_titulo_count := jsonb_array_length(COALESCE(p_titulos_editados, '[]'::jsonb));
  IF v_titulo_count = 0 THEN
    RAISE EXCEPTION 'Array de títulos vazio — proposta precisa de pelo menos 1 título'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Pra cada título: cria CPR + titulo_a_receber
  FOR v_titulo IN SELECT jsonb_array_elements(p_titulos_editados)
  LOOP
    -- 4a. Cria CPR (meio_pagamento_id é auto-preenchido por trigger)
    INSERT INTO contas_pagar_receber (
      tipo, status, origem,
      parceiro_id,
      descricao, valor, data_vencimento,
      parcela_atual, total_parcelas, parcela_grupo_id,
      criado_por
    ) VALUES (
      'receber', 'aberto', 'pedido_venda',
      v_pedido.parceiro_id,
      'Pedido ' || COALESCE(v_pedido.id_externo, p_pedido_id::text)
        || ' - parcela ' || (v_titulo ->> 'numero_parcela')
        || '/' || (v_titulo ->> 'total_parcelas'),
      (v_titulo ->> 'valor_bruto')::numeric,
      (v_titulo ->> 'data_vencimento')::date,
      (v_titulo ->> 'numero_parcela')::int,
      (v_titulo ->> 'total_parcelas')::int,
      v_parcela_grupo,
      v_operador
    ) RETURNING id INTO v_cpr_id;

    -- 4b. Cria titulo_a_receber
    v_numero_titulo := public.fn_gerar_numero_titulo();

    INSERT INTO titulo_a_receber (
      numero_titulo,
      conta_id, pedido_id, analise_credito_id,
      numero_parcela, total_parcelas, eh_entrada,
      valor_bruto,
      tipo_pagamento, condicao_pagamento,
      data_vencimento_original, data_vencimento_atual,
      status,
      created_by
    ) VALUES (
      v_numero_titulo,
      v_cpr_id, p_pedido_id, v_analise_id,
      (v_titulo ->> 'numero_parcela')::int,
      (v_titulo ->> 'total_parcelas')::int,
      COALESCE((v_titulo ->> 'eh_entrada')::boolean, false),
      (v_titulo ->> 'valor_bruto')::numeric,
      COALESCE(v_titulo ->> 'tipo_pagamento', 'boleto'),
      v_titulo ->> 'condicao_pagamento',
      (v_titulo ->> 'data_vencimento')::date,
      (v_titulo ->> 'data_vencimento')::date,
      'aguardando_envio_bling',
      v_operador
    ) RETURNING id INTO v_titulo_id;

    v_titulos_criados := v_titulos_criados || jsonb_build_object(
      'titulo_id', v_titulo_id,
      'cpr_id', v_cpr_id,
      'numero_titulo', v_numero_titulo,
      'eh_entrada', COALESCE((v_titulo ->> 'eh_entrada')::boolean, false)
    );

    IF COALESCE((v_titulo ->> 'eh_entrada')::boolean, false) THEN
      v_tem_entrada := true;
    END IF;
  END LOOP;

  -- 5. Decide próximo estágio
  v_proximo_estagio := CASE
    WHEN v_tem_entrada THEN 'aguardando_pagamento'
    ELSE 'pre_faturado'
  END;

  -- 6. Avança pedido (via transicionar_pedido pra registrar evento)
  PERFORM public.transicionar_pedido(
    p_pedido_id,
    v_proximo_estagio,
    CASE WHEN v_tem_entrada
         THEN 'Aguardando confirmação do pagamento da entrada'
         ELSE 'Pré-faturamento'
    END,
    'Materialização de cobrança — ' || v_titulo_count || ' título(s) criado(s)'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'pedido_id', p_pedido_id,
    'titulos_criados', v_titulos_criados,
    'parcela_grupo_id', v_parcela_grupo,
    'tem_entrada', v_tem_entrada,
    'proximo_estagio', v_proximo_estagio
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.merge_contas_duplicadas(p_id_manter uuid, p_id_descartar uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manter RECORD;
  v_descartar RECORD;
  v_docs_migrados INTEGER := 0;
  v_itens_migrados INTEGER := 0;
BEGIN
  SELECT * INTO v_manter FROM contas_pagar_receber WHERE id = p_id_manter;
  SELECT * INTO v_descartar FROM contas_pagar_receber WHERE id = p_id_descartar;

  IF v_manter.id IS NULL OR v_descartar.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Conta não existe');
  END IF;

  IF v_manter.status NOT IN ('aberto') OR v_descartar.status NOT IN ('aberto') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Status inválido para merge');
  END IF;

  UPDATE contas_pagar_receber
  SET nf_pdf_url = COALESCE(nf_pdf_url, v_descartar.nf_pdf_url),
      nf_xml_url = COALESCE(nf_xml_url, v_descartar.nf_xml_url),
      comprovante_url = COALESCE(comprovante_url, v_descartar.comprovante_url),
      nf_chave_acesso = COALESCE(nf_chave_acesso, v_descartar.nf_chave_acesso),
      nf_numero = COALESCE(nf_numero, v_descartar.nf_numero),
      nf_data_emissao = COALESCE(nf_data_emissao, v_descartar.nf_data_emissao),
      nf_serie = COALESCE(nf_serie, v_descartar.nf_serie),
      nf_cnpj_emitente = COALESCE(nf_cnpj_emitente, v_descartar.nf_cnpj_emitente),
      parceiro_id = COALESCE(parceiro_id, v_descartar.parceiro_id),
      plano_contas_id = COALESCE(plano_contas_id, v_descartar.plano_contas_id),
      updated_at = now()
  WHERE id = p_id_manter;

  -- H-02 aplicado: cpd usa conta_pagar_id
  UPDATE contas_pagar_documentos
  SET conta_pagar_id = p_id_manter
  WHERE conta_pagar_id = p_id_descartar;
  GET DIAGNOSTICS v_docs_migrados = ROW_COUNT;

  UPDATE contas_pagar_itens
  SET conta_pagar_id = p_id_manter
  WHERE conta_pagar_id = p_id_descartar;
  GET DIAGNOSTICS v_itens_migrados = ROW_COUNT;

  UPDATE contas_pagar_receber
  SET status = 'cancelado',
      descricao = descricao || ' [duplicata mesclada em ' || p_id_manter::text || ']',
      updated_at = now()
  WHERE id = p_id_descartar;

  RETURN jsonb_build_object(
    'ok', true,
    'mantida', p_id_manter,
    'descartada', p_id_descartar,
    'docs_migrados', v_docs_migrados,
    'itens_migrados', v_itens_migrados
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.mesclar_pares_nf(p_id_manter uuid, p_id_descartar uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, id_resultante uuid, erro text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manter RECORD;
  v_descartar RECORD;
  v_id_a UUID;
  v_id_b UUID;
BEGIN
  -- Carrega os 2 registros
  SELECT * INTO v_manter FROM nfs_stage WHERE id = p_id_manter;
  SELECT * INTO v_descartar FROM nfs_stage WHERE id = p_id_descartar;

  IF v_manter.id IS NULL OR v_descartar.id IS NULL THEN
    ok := false; id_resultante := NULL;
    erro := 'Um dos registros não existe';
    RETURN NEXT; RETURN;
  END IF;

  IF v_manter.status IN ('importada', 'descartada', 'duplicata')
     OR v_descartar.status IN ('importada', 'descartada', 'duplicata') THEN
    ok := false; id_resultante := NULL;
    erro := 'Registro com status inválido pra merge';
    RETURN NEXT; RETURN;
  END IF;

  -- Enriquece o que mantem com dados do que descarta (sem sobrescrever)
  -- B-51 fix: plano_contas_id (renomeada em §3.2 - 18/05/2026)
  UPDATE nfs_stage
  SET arquivo_storage_path = COALESCE(arquivo_storage_path, v_descartar.arquivo_storage_path),
      arquivo_nome = COALESCE(arquivo_nome, v_descartar.arquivo_nome),
      xml_storage_path = COALESCE(xml_storage_path, v_descartar.xml_storage_path),
      nf_chave_acesso = COALESCE(nf_chave_acesso, v_descartar.nf_chave_acesso),
      nf_numero = COALESCE(nf_numero, v_descartar.nf_numero),
      nf_data_emissao = COALESCE(nf_data_emissao, v_descartar.nf_data_emissao),
      nf_serie = COALESCE(nf_serie, v_descartar.nf_serie),
      fornecedor_cnpj = COALESCE(fornecedor_cnpj, v_descartar.fornecedor_cnpj),
      fornecedor_razao_social = COALESCE(fornecedor_razao_social, v_descartar.fornecedor_razao_social),
      fornecedor_cliente = COALESCE(fornecedor_cliente, v_descartar.fornecedor_cliente),
      parceiro_id = COALESCE(parceiro_id, v_descartar.parceiro_id),
      plano_contas_id = COALESCE(plano_contas_id, v_descartar.plano_contas_id),
      descricao = COALESCE(descricao, v_descartar.descricao),
      itens = COALESCE(itens, v_descartar.itens),
      -- Status: se manter = 'pendente' e descartar tinha categoria, agora e 'classificada'
      status = CASE
        WHEN v_manter.plano_contas_id IS NULL AND v_descartar.plano_contas_id IS NOT NULL
          THEN 'classificada'
        ELSE v_manter.status
      END,
      updated_at = now()
  WHERE id = p_id_manter;

  -- Marca o outro como descartado
  UPDATE nfs_stage
  SET status = 'descartada',
      motivo_descarte = 'mesclado_em_' || p_id_manter::text,
      arquivo_storage_path = NULL,
      xml_storage_path = NULL,
      updated_at = now()
  WHERE id = p_id_descartar;

  -- Registra decisão (par canônico: a < b)
  v_id_a := LEAST(p_id_manter, p_id_descartar);
  v_id_b := GREATEST(p_id_manter, p_id_descartar);

  INSERT INTO nf_stage_pares_verificados (id_a, id_b, decisao, user_id, motivo)
  VALUES (v_id_a, v_id_b, 'mesclados', p_user_id, 'mantido=' || p_id_manter::text)
  ON CONFLICT (id_a, id_b) DO UPDATE
    SET decisao = 'mesclados', user_id = p_user_id;

  ok := true;
  id_resultante := p_id_manter;
  erro := NULL;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.normalizar_descricao_cartao(p_descricao text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  -- lowercase + remove acentos + remove parcelas "01/10" + colapsa espaços
  RETURN regexp_replace(
    regexp_replace(
      lower(unaccent(coalesce(p_descricao, ''))),
      '\s+\d{1,2}/\d{1,2}\s*', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.normalizar_numero_nf(p_numero text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT LTRIM(REGEXP_REPLACE(COALESCE(p_numero, ''), '[^0-9]', '', 'g'), '0')
$function$;
CREATE OR REPLACE FUNCTION public.normalizar_tipo_movimentacao(p_tipo_ofx text, p_valor numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$ 
BEGIN 
  -- Caminho 1: tipo OFX em inglês → traduz
  IF UPPER(COALESCE(p_tipo_ofx, '')) IN ('DEBIT', 'DEB') THEN 
    RETURN 'debito'; 
  END IF; 
  IF UPPER(COALESCE(p_tipo_ofx, '')) IN ('CREDIT', 'CRED') THEN 
    RETURN 'credito'; 
  END IF; 
  
  -- Caminho 2: já está em português → mantém
  IF LOWER(COALESCE(p_tipo_ofx, '')) IN ('debito', 'credito') THEN 
    RETURN LOWER(p_tipo_ofx); 
  END IF; 
  
  -- Caminho 3: fallback por sinal do valor
  IF p_valor < 0 THEN 
    RETURN 'debito'; 
  ELSE 
    RETURN 'credito'; 
  END IF; 
END; 
$function$;
CREATE OR REPLACE FUNCTION public.obter_destinatario_pagamento(p_cpr_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cpr     RECORD;
  v_result  JSONB;
BEGIN
  SELECT id, parceiro_id, reembolsa_user_id
    INTO v_cpr
    FROM public.contas_pagar_receber
   WHERE id = p_cpr_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_cpr.reembolsa_user_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'tipo',            'colaborador_clt',
      'destinatario_id', clt.id,
      'nome',            clt.nome_completo,
      'cnpj_cpf',        clt.cpf,
      'pix', CASE WHEN clt.chave_pix IS NOT NULL AND clt.chave_pix <> ''
                  THEN jsonb_build_object('chave', clt.chave_pix, 'tipo', NULL)
                  ELSE NULL END,
      'banco', CASE WHEN clt.banco_codigo IS NOT NULL AND clt.banco_codigo <> ''
                    THEN jsonb_build_object(
                      'codigo',     clt.banco_codigo,
                      'nome',       clt.banco_nome,
                      'agencia',    clt.agencia,
                      'conta',      clt.conta,
                      'tipo_conta', clt.tipo_conta
                    )
                    ELSE NULL END
    )
    INTO v_result
    FROM public.colaboradores_clt clt
   WHERE clt.user_id = v_cpr.reembolsa_user_id
   LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;

    SELECT jsonb_build_object(
      'tipo',            'colaborador_pj',
      'destinatario_id', pj.id,
      'nome',            COALESCE(pj.nome_fantasia, pj.razao_social),
      'cnpj_cpf',        COALESCE(pj.cnpj, pj.cpf),
      'pix', CASE WHEN pj.chave_pix IS NOT NULL AND pj.chave_pix <> ''
                  THEN jsonb_build_object('chave', pj.chave_pix, 'tipo', NULL)
                  ELSE NULL END,
      'banco', CASE WHEN pj.banco_codigo IS NOT NULL AND pj.banco_codigo <> ''
                    THEN jsonb_build_object(
                      'codigo',     pj.banco_codigo,
                      'nome',       pj.banco_nome,
                      'agencia',    pj.agencia,
                      'conta',      pj.conta,
                      'tipo_conta', pj.tipo_conta
                    )
                    ELSE NULL END
    )
    INTO v_result
    FROM public.contratos_pj pj
   WHERE pj.user_id = v_cpr.reembolsa_user_id
   LIMIT 1;

    RETURN v_result;
  END IF;

  IF v_cpr.parceiro_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'tipo',            'parceiro',
      'destinatario_id', pc.id,
      'nome',            COALESCE(pc.nome_fantasia, pc.razao_social),
      'cnpj_cpf',        COALESCE(pc.cnpj, pc.cpf),
      'pix', CASE WHEN pc.pix_chave IS NOT NULL AND pc.pix_chave <> ''
                  THEN jsonb_build_object('chave', pc.pix_chave, 'tipo', pc.pix_tipo)
                  ELSE NULL END,
      'banco', CASE WHEN (pc.dados_bancarios ->> 'banco_codigo') IS NOT NULL
                     AND (pc.dados_bancarios ->> 'banco_codigo') <> ''
                    THEN jsonb_build_object(
                      'codigo',     pc.dados_bancarios ->> 'banco_codigo',
                      'nome',       pc.dados_bancarios ->> 'banco_nome',
                      'agencia',    pc.dados_bancarios ->> 'agencia',
                      'conta',      pc.dados_bancarios ->> 'conta',
                      'tipo_conta', pc.dados_bancarios ->> 'tipo_conta'
                    )
                    ELSE NULL END
    )
    INTO v_result
    FROM public.parceiros_comerciais pc
   WHERE pc.id = v_cpr.parceiro_id;

    RETURN v_result;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.pagar_fatura_cartao(p_fatura_id uuid, p_data_pagamento date DEFAULT CURRENT_DATE, p_conta_bancaria_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fatura RECORD;
  v_conta_id UUID;
BEGIN
  SELECT * INTO v_fatura
  FROM public.faturas_cartao
  WHERE id = p_fatura_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Fatura não encontrada');
  END IF;

  IF v_fatura.status = 'paga' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Fatura já está paga');
  END IF;

  -- Conta bancária: usa a informada OU a da própria fatura (conta do cartão)
  v_conta_id := COALESCE(p_conta_bancaria_id, v_fatura.conta_bancaria_id);

  -- 1. Marcar fatura como paga
  UPDATE public.faturas_cartao
  SET status = 'paga', updated_at = now()
  WHERE id = p_fatura_id;

  -- 2. Gerar 1 movimentação bancária (saída) pelo valor total da fatura
  INSERT INTO public.movimentacoes_bancarias (
    conta_bancaria_id,
    descricao,
    valor,
    data_transacao,
    tipo,
    origem
  ) VALUES (
    v_conta_id,
    'Pagamento fatura cartão - ' || to_char(v_fatura.data_vencimento, 'MM/YYYY'),
    -abs(v_fatura.valor_total),   -- negativo = saída de caixa
    p_data_pagamento,
    'saida',
    'fatura_cartao'
  );

  -- CPRs NÃO são marcadas aqui (já foram marcadas ao vincular)

  RETURN jsonb_build_object(
    'ok', true,
    'fatura_id', p_fatura_id,
    'valor_movimentacao', v_fatura.valor_total,
    'conta_bancaria_id', v_conta_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.persistir_ofx_stage(p_importacao_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_imp RECORD;
  v_persistidas INTEGER := 0;
  v_duplicadas INTEGER := 0;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_imp FROM ofx_importacoes_stage WHERE id = p_importacao_stage_id;
  IF v_imp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Importação não encontrada');
  END IF;

  IF v_imp.status <> 'rascunho' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'Importação já foi processada (status: ' || v_imp.status || ')'
    );
  END IF;

  -- Insere transações pendentes em movimentacoes_bancarias
  -- ON CONFLICT em hash_unico evita duplicata silenciosamente
  WITH inseridas AS (
    INSERT INTO movimentacoes_bancarias (
      conta_bancaria_id,
      data_transacao,
      valor,
      descricao,
      tipo,
      id_transacao_banco,
      hash_unico,
      saldo_pos_transacao,
      origem,
      conciliado
    )
    SELECT
      t.conta_bancaria_id,
      t.data_transacao,
      t.valor,
      t.descricao,
      t.tipo,
      t.id_transacao_banco,
      t.hash_unico,
      t.saldo_pos_transacao,
      'ofx_stage',
      false
    FROM ofx_transacoes_stage t
    WHERE t.importacao_stage_id = p_importacao_stage_id
      AND t.status = 'pendente'
    ON CONFLICT (hash_unico) DO NOTHING
    RETURNING id, hash_unico
  )
  -- Marca como persistida no stage as que foram inseridas
  UPDATE ofx_transacoes_stage t
  SET status = 'persistida'
  FROM inseridas i
  WHERE t.hash_unico = i.hash_unico
    AND t.importacao_stage_id = p_importacao_stage_id;

  -- Conta persistidas
  SELECT COUNT(*) INTO v_persistidas
  FROM ofx_transacoes_stage
  WHERE importacao_stage_id = p_importacao_stage_id
    AND status = 'persistida';

  -- Marca duplicadas (status pendente que não virou — hash já existia)
  UPDATE ofx_transacoes_stage t
  SET 
    status = 'duplicada',
    duplicada_de = (SELECT id FROM movimentacoes_bancarias WHERE hash_unico = t.hash_unico LIMIT 1)
  WHERE t.importacao_stage_id = p_importacao_stage_id
    AND t.status = 'pendente';

  GET DIAGNOSTICS v_duplicadas = ROW_COUNT;

  -- Atualiza importação
  UPDATE ofx_importacoes_stage
  SET 
    status = 'persistido',
    persistido_em = now(),
    persistido_por = v_user_id
  WHERE id = p_importacao_stage_id;

  -- Atualiza saldo da conta (se importação tiver saldo final)
  IF v_imp.saldo_final IS NOT NULL THEN
    UPDATE contas_bancarias
    SET 
      saldo_atual = v_imp.saldo_final,
      saldo_atualizado_em = now()
    WHERE id = v_imp.conta_bancaria_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'importacao_id', p_importacao_stage_id,
    'persistidas', v_persistidas,
    'duplicadas', v_duplicadas
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.pipeline_enriquecer_cartao()
 RETURNS TABLE(parceiros_criados integer, total_processados integer, enriquecidos integer, ambiguos integer, sem_match integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado RECORD;
BEGIN
  -- Engine PASSIVA: só casa com parceiros existentes.
  -- Cartão não cadastra parceiro. Quem qualifica fornecedor é a NF.
  SELECT * INTO v_resultado FROM enriquecer_todos_lancamentos_cartao();

  parceiros_criados := 0;  -- sempre zero — pipeline não cria mais
  total_processados := v_resultado.total_processados;
  enriquecidos := v_resultado.enriquecidos;
  ambiguos := v_resultado.ambiguos;
  sem_match := v_resultado.sem_match;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.processar_itau_pagamentos(p_importacao_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pag RECORD;
  v_parceiro_id UUID;
  v_fatura_cpr_id UUID;
  v_cprs_exatas UUID[];
  v_cprs_proximas UUID[];
  v_count_exatas INTEGER;
  v_count_proximas INTEGER;
  v_tolerancia NUMERIC;
  v_auto INTEGER := 0;
  v_operador INTEGER := 0;
  v_sem_cpr INTEGER := 0;
  v_sem_parceiro INTEGER := 0;
  v_sem_cnpj INTEGER := 0;
BEGIN
  FOR v_pag IN
    SELECT * FROM itau_pagamentos_stage
    WHERE importacao_id = p_importacao_id
      AND status_conciliacao = 'pendente'
  LOOP

    -- 0. Sem CNPJ
    IF v_pag.cnpj_favorecido IS NULL
       OR TRIM(v_pag.cnpj_favorecido) IN ('', '-') THEN
      UPDATE itau_pagamentos_stage SET status_conciliacao = 'sem_cnpj' WHERE id = v_pag.id;
      v_sem_cnpj := v_sem_cnpj + 1;
      CONTINUE;
    END IF;

    -- 1. Match de parceiro por CNPJ
    SELECT id INTO v_parceiro_id
      FROM parceiros_comerciais
     WHERE REGEXP_REPLACE(cnpj, '[^0-9]', '', 'g') =
           REGEXP_REPLACE(v_pag.cnpj_favorecido, '[^0-9]', '', 'g')
     LIMIT 1;

    -- 1b. Sem parceiro → tenta fatura de cartão
    IF v_parceiro_id IS NULL THEN
      v_fatura_cpr_id := NULL;
      v_tolerancia := GREATEST(v_pag.valor_pago * 0.02, 0.50);

      SELECT fc.conta_pagar_id INTO v_fatura_cpr_id
        FROM faturas_cartao fc
       WHERE fc.conta_bancaria_id = v_pag.conta_bancaria_id
         AND fc.conta_pagar_id IS NOT NULL
         AND ABS(fc.valor_total - v_pag.valor_pago) <= v_tolerancia
         AND (v_pag.data_pagamento IS NULL OR ABS(fc.data_vencimento - v_pag.data_pagamento::date) <= 15)
       ORDER BY ABS(fc.valor_total - v_pag.valor_pago) ASC
       LIMIT 1;

      IF v_fatura_cpr_id IS NOT NULL THEN
        -- Fatura de cartão encontrada → Stage 1 automático, aguarda Stage 2
        UPDATE itau_pagamentos_stage
           SET conta_pagar_id     = v_fatura_cpr_id,
               status_conciliacao = 'aguardando_ofx'
         WHERE id = v_pag.id;
        v_auto := v_auto + 1;
        CONTINUE;
      END IF;

      UPDATE itau_pagamentos_stage SET status_conciliacao = 'sem_parceiro' WHERE id = v_pag.id;
      v_sem_parceiro := v_sem_parceiro + 1;
      CONTINUE;
    END IF;

    UPDATE itau_pagamentos_stage SET parceiro_id = v_parceiro_id WHERE id = v_pag.id;

    v_tolerancia := GREATEST(v_pag.valor_pago * 0.02, 0.01);

    SELECT ARRAY_AGG(id) INTO v_cprs_exatas
      FROM contas_pagar_receber
     WHERE parceiro_id = v_parceiro_id
       AND ABS(valor - v_pag.valor_pago) <= 0.01
       AND status IN ('aberto', 'aprovado', 'aguardando_pagamento')
       AND movimentacao_bancaria_id IS NULL;

    v_count_exatas := COALESCE(ARRAY_LENGTH(v_cprs_exatas, 1), 0);

    IF v_count_exatas = 0 THEN
      SELECT ARRAY_AGG(id) INTO v_cprs_proximas
        FROM contas_pagar_receber
       WHERE parceiro_id = v_parceiro_id
         AND ABS(valor - v_pag.valor_pago) <= v_tolerancia
         AND ABS(valor - v_pag.valor_pago) > 0.01
         AND status IN ('aberto', 'aprovado', 'aguardando_pagamento')
         AND movimentacao_bancaria_id IS NULL;
      v_count_proximas := COALESCE(ARRAY_LENGTH(v_cprs_proximas, 1), 0);
    ELSE
      v_count_proximas := 0;
    END IF;

    IF v_count_exatas = 1 THEN
      -- Match exato único → Stage 1 automático, aguarda Stage 2
      UPDATE itau_pagamentos_stage
         SET conta_pagar_id     = v_cprs_exatas[1],
             status_conciliacao = 'aguardando_ofx'
       WHERE id = v_pag.id;
      v_auto := v_auto + 1;

    ELSIF v_count_exatas > 1 OR v_count_proximas >= 1 THEN
      UPDATE itau_pagamentos_stage SET status_conciliacao = 'aguardando_operador' WHERE id = v_pag.id;
      v_operador := v_operador + 1;

    ELSE
      UPDATE itau_pagamentos_stage SET status_conciliacao = 'sem_cpr' WHERE id = v_pag.id;
      v_sem_cpr := v_sem_cpr + 1;
    END IF;

  END LOOP;

  UPDATE itau_importacoes_stage SET status = 'processado' WHERE id = p_importacao_id;

  RETURN json_build_object(
    'ok', true,
    'aguardando_ofx',      v_auto,
    'aguardando_operador', v_operador,
    'sem_cpr',             v_sem_cpr,
    'sem_parceiro',        v_sem_parceiro,
    'sem_cnpj',            v_sem_cnpj
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('ok', false, 'erro', SQLERRM);
END;
$function$;
CREATE OR REPLACE FUNCTION public.propor_cobranca(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_pedido record;
  v_analise record;
  v_condicao jsonb;
  v_entrada jsonb;
  v_parcelas jsonb;
  v_total_parcelas int;
  v_proposta jsonb := '[]'::jsonb;
  v_ordem int := 0;
  v_parcela jsonb;
  v_dias int;
  v_data_pedido date;
  v_total_geral int;
BEGIN
  -- 1. Pedido
  SELECT id, parceiro_id, id_externo, data_pedido, valor_liquido, estagio
  INTO v_pedido
  FROM pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_pedido_id USING ERRCODE = '02000';
  END IF;

  -- 2. Análise (deve existir já — pedido em cobranca passou por crédito aprovado)
  SELECT id, condicao_final_aprovada
  INTO v_analise
  FROM analises_credito
  WHERE pedido_id = p_pedido_id
    AND status_final = 'aprovado'
  ORDER BY decidido_em DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não tem análise aprovada — não pode propor cobrança',
      p_pedido_id USING ERRCODE = '22023';
  END IF;

  v_condicao := v_analise.condicao_final_aprovada;
  v_entrada := v_condicao -> 'entrada';
  v_parcelas := COALESCE(v_condicao -> 'parcelas_a_prazo', '[]'::jsonb);
  v_total_parcelas := jsonb_array_length(v_parcelas);
  v_data_pedido := v_pedido.data_pedido;

  -- 3. Calcula total geral de parcelas (entrada conta como 1 se houver)
  v_total_geral := v_total_parcelas
    + CASE WHEN v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb
           THEN 1 ELSE 0 END;
  IF v_total_geral = 0 THEN
    v_total_geral := 1;  -- defensivo — não deveria ocorrer
  END IF;

  -- 4. Monta título de entrada (se houver)
  IF v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb THEN
    v_ordem := v_ordem + 1;
    v_dias := COALESCE((v_entrada ->> 'dias')::int, 0);
    v_proposta := v_proposta || jsonb_build_object(
      'ordem', v_ordem,
      'numero_parcela', v_ordem,
      'total_parcelas', v_total_geral,
      'eh_entrada', true,
      'tipo_pagamento', COALESCE(v_entrada ->> 'tipo', 'pix'),
      'valor_bruto', (v_entrada -> 'valor')::numeric,
      'data_vencimento', (v_data_pedido + v_dias)::text,
      'condicao_pagamento', 'Entrada (' || v_dias || ' dia(s))'
    );
  END IF;

  -- 5. Monta títulos das parcelas a prazo
  FOR v_parcela IN SELECT jsonb_array_elements(v_parcelas)
  LOOP
    v_ordem := v_ordem + 1;
    v_dias := COALESCE((v_parcela ->> 'dias')::int, 0);
    v_proposta := v_proposta || jsonb_build_object(
      'ordem', v_ordem,
      'numero_parcela', v_ordem,
      'total_parcelas', v_total_geral,
      'eh_entrada', false,
      'tipo_pagamento', COALESCE(v_parcela ->> 'tipo', 'boleto'),
      'valor_bruto', (v_parcela -> 'valor')::numeric,
      'data_vencimento', COALESCE(
        v_parcela ->> 'vencimento',
        (v_data_pedido + v_dias)::text
      ),
      'condicao_pagamento', v_dias || ' dias'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'pedido_id', v_pedido.id,
    'parceiro_id', v_pedido.parceiro_id,
    'pedido_id_externo', v_pedido.id_externo,
    'analise_credito_id', v_analise.id,
    'valor_total', v_pedido.valor_liquido,
    'tem_entrada', v_entrada IS NOT NULL AND v_entrada <> 'null'::jsonb,
    'condicao_original', v_condicao ->> 'condicao_original',
    'titulos_propostos', v_proposta
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.qualidade_dado_contas(p_conta_ids uuid[])
 RETURNS TABLE(conta_id uuid, nivel text, motivos text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH dados AS (
  SELECT
    cpr.id,
    cpr.plano_contas_id AS categoria_fk,
    cpr.nf_numero,
    cpr.parceiro_id,
    cpr.valor,
    cpr.data_vencimento,
    EXISTS (
      SELECT 1 FROM contas_pagar_documentos cpd
      WHERE cpd.conta_pagar_id = cpr.id  -- H-02: era conta_id
    ) AS tem_documento,
    EXISTS (
      SELECT 1
      FROM contas_pagar_receber outras
      WHERE outras.id <> cpr.id
        AND outras.parceiro_id = cpr.parceiro_id
        AND outras.parceiro_id IS NOT NULL
        AND outras.valor = cpr.valor
        AND outras.data_vencimento = cpr.data_vencimento
        AND outras.status NOT IN ('cancelado')
    ) AS tem_duplicado_provavel
  FROM contas_pagar_receber cpr
  WHERE cpr.id = ANY(p_conta_ids)
)
SELECT
  d.id AS conta_id,
  CASE
    WHEN d.categoria_fk IS NULL OR (d.nf_numero IS NULL AND NOT d.tem_documento) THEN 'vermelho'
    WHEN d.tem_duplicado_provavel THEN 'amarelo'
    ELSE 'verde'
  END AS nivel,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN d.categoria_fk IS NULL THEN 'sem_categoria' END,
    CASE WHEN d.nf_numero IS NULL AND NOT d.tem_documento THEN 'sem_nf_documento' END,
    CASE WHEN d.tem_duplicado_provavel THEN 'duplicado_provavel' END
  ], NULL) AS motivos
FROM dados d;
$function$;
CREATE OR REPLACE FUNCTION public.reaplicar_regras_stage_em_lote(p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(stage_id uuid, acao text, categoria_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nf RECORD;
  v_resultado JSONB;
BEGIN
  -- B-51 fix: nfs_stage.plano_contas_id (renomeada em §3.2);
  -- "categoria_id" mantido como alias de retorno e chave JSONB
  FOR v_nf IN
    SELECT id FROM nfs_stage
    WHERE (p_ids IS NULL OR id = ANY(p_ids))
      AND plano_contas_id IS NULL
      AND status NOT IN ('descartada', 'duplicata')
  LOOP
    v_resultado := aplicar_regras_categorizacao_stage(v_nf.id);
    stage_id := v_nf.id;
    acao := v_resultado->>'acao';
    categoria_id := (v_resultado->>'categoria_id')::uuid;
    RETURN NEXT;
  END LOOP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.reativar_lancamento(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE fatura_cartao_lancamentos
  SET status = 'pendente',
      conta_pagar_id = NULL,
      updated_at = now()
  WHERE id = p_lancamento_id
    AND status IN ('ignorado', 'conciliado', 'virou_despesa');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Lançamento não pode ser reativado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', 'reativado');
END;
$function$;
CREATE OR REPLACE FUNCTION public.recalcular_status_fatura(p_conta_pagar_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fatura_id UUID;
  v_total_lancamentos INTEGER;
  v_lancamentos_pagos INTEGER;
  v_status_atual TEXT;
BEGIN
  SELECT fatura_id INTO v_fatura_id
  FROM fatura_cartao_lancamentos
  WHERE conta_pagar_id = p_conta_pagar_id
  LIMIT 1;

  IF v_fatura_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status INTO v_status_atual
  FROM faturas_cartao
  WHERE id = v_fatura_id;

  IF v_status_atual IN ('cancelada', 'conciliada') THEN
    RETURN;
  END IF;

  WITH counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM contas_pagar_receber cpr
          WHERE cpr.id = fcl.conta_pagar_id
            AND cpr.status = 'paga'
        )
      ) AS pagos
    FROM fatura_cartao_lancamentos fcl
    WHERE fcl.fatura_id = v_fatura_id
      AND COALESCE(fcl.status, 'pendente') <> 'ignorado'
  )
  SELECT total, pagos
  INTO v_total_lancamentos, v_lancamentos_pagos
  FROM counts;

  IF v_total_lancamentos = 0 THEN
    RETURN;
  END IF;

  IF v_lancamentos_pagos = v_total_lancamentos THEN
    UPDATE faturas_cartao
    SET status = 'paga', updated_at = now()
    WHERE id = v_fatura_id AND status <> 'paga';
  ELSE
    UPDATE faturas_cartao
    SET status = 'aberta', updated_at = now()
    WHERE id = v_fatura_id AND status = 'paga';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.receber_pedido_externo(p_cnpj text, p_id_externo text, p_data_pedido date, p_valor_bruto numeric, p_valor_liquido numeric, p_condicao_solicitada text, p_forma_solicitada text, p_desconto_pct numeric DEFAULT NULL::numeric, p_vendedor text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_itens_json jsonb DEFAULT NULL::jsonb, p_recebido_via text DEFAULT 'api'::text, p_razao_social text DEFAULT NULL::text, p_nome_fantasia text DEFAULT NULL::text, p_inscricao_estadual text DEFAULT NULL::text, p_isento_ie boolean DEFAULT NULL::boolean, p_situacao_cadastral text DEFAULT NULL::text, p_cep text DEFAULT NULL::text, p_logradouro text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_complemento text DEFAULT NULL::text, p_bairro text DEFAULT NULL::text, p_cidade text DEFAULT NULL::text, p_uf text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_endereco_entrega jsonb DEFAULT NULL::jsonb, p_contatos jsonb DEFAULT NULL::jsonb, p_segmento text DEFAULT NULL::text, p_regiao_atuacao text DEFAULT NULL::text, p_canal_fop text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_observacao text DEFAULT NULL::text, p_premissas jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_limpo text;
  v_parceiro_id uuid;
  v_pedido_id uuid;
  v_pedido_existente_id uuid;
  v_estagio text;
  v_area text;
  v_analise_id uuid;
  v_cadastro_incompleto boolean;
BEGIN
  -- 1. Validação CNPJ (FAIL-LOUD)
  v_cnpj_limpo := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  IF length(v_cnpj_limpo) != 14 THEN
    RAISE EXCEPTION 'CNPJ inválido: deve ter 14 dígitos (recebido: %)', p_cnpj
      USING ERRCODE = '22023';
  END IF;

  -- 2. Validação valores (FAIL-LOUD)
  IF p_valor_bruto <= 0 OR p_valor_liquido <= 0 THEN
    RAISE EXCEPTION 'Valores devem ser positivos (bruto=%, liquido=%)',
      p_valor_bruto, p_valor_liquido
      USING ERRCODE = '22023';
  END IF;

  -- 3. Idempotência por id_externo (BLINDAGEM 2 PONTAS)
  SELECT id, parceiro_id, estagio, area_atual
  INTO v_pedido_existente_id, v_parceiro_id, v_estagio, v_area
  FROM pedidos WHERE id_externo = p_id_externo;

  IF v_pedido_existente_id IS NOT NULL THEN
    SELECT id INTO v_analise_id
    FROM analises_credito WHERE pedido_id = v_pedido_existente_id;

    RETURN json_build_object(
      'pedido_id', v_pedido_existente_id,
      'parceiro_id', v_parceiro_id,
      'status', 'ja_existe',
      'estagio_inicial', v_estagio,
      'area_inicial', v_area,
      'analise_id', v_analise_id
    );
  END IF;

  -- 4. Busca parceiro por CNPJ
  SELECT id INTO v_parceiro_id
  FROM parceiros_comerciais WHERE cnpj = v_cnpj_limpo;

  -- 4a. Parceiro NÃO existe: INSERT com todos os campos do payload
  IF v_parceiro_id IS NULL THEN
    -- Critério cadastro_incompleto: campos críticos faltando?
    v_cadastro_incompleto := (
      p_razao_social IS NULL
      OR p_cidade IS NULL
      OR p_uf IS NULL
    );

    INSERT INTO parceiros_comerciais (
      cnpj,
      razao_social,
      nome_fantasia,
      inscricao_estadual,
      isento_ie,
      situacao_cadastral,
      cep,
      logradouro,
      numero,
      endereco_complemento,
      bairro,
      cidade,
      uf,
      telefone,
      email,
      endereco_entrega,
      contatos,
      segmento,
      regiao_atuacao,
      canal_fop,
      tags,
      observacao,
      premissas,
      cadastro_incompleto,
      origem
    ) VALUES (
      v_cnpj_limpo,
      COALESCE(p_razao_social, 'A enriquecer via BrasilAPI'),
      p_nome_fantasia,
      p_inscricao_estadual,
      COALESCE(p_isento_ie, false),
      p_situacao_cadastral,
      p_cep,
      p_logradouro,
      p_numero,
      p_complemento,
      p_bairro,
      p_cidade,
      p_uf,
      p_telefone,
      p_email,
      p_endereco_entrega,
      p_contatos,
      p_segmento,
      p_regiao_atuacao,
      p_canal_fop,
      p_tags,
      p_observacao,
      p_premissas,
      v_cadastro_incompleto,
      COALESCE(p_origem, 'fop')
    ) RETURNING id INTO v_parceiro_id;

  -- 4b. Parceiro EXISTE: UPDATE com COALESCE (preserva SNCF, preenche NULLs)
  ELSE
    UPDATE parceiros_comerciais SET
      razao_social         = COALESCE(razao_social, p_razao_social),
      nome_fantasia        = COALESCE(nome_fantasia, p_nome_fantasia),
      inscricao_estadual   = COALESCE(inscricao_estadual, p_inscricao_estadual),
      situacao_cadastral   = COALESCE(situacao_cadastral, p_situacao_cadastral),
      cep                  = COALESCE(cep, p_cep),
      logradouro           = COALESCE(logradouro, p_logradouro),
      numero               = COALESCE(numero, p_numero),
      endereco_complemento = COALESCE(endereco_complemento, p_complemento),
      bairro               = COALESCE(bairro, p_bairro),
      cidade               = COALESCE(cidade, p_cidade),
      uf                   = COALESCE(uf, p_uf),
      telefone             = COALESCE(telefone, p_telefone),
      email                = COALESCE(email, p_email),
      endereco_entrega     = COALESCE(endereco_entrega, p_endereco_entrega),
      contatos             = COALESCE(contatos, p_contatos),
      segmento             = COALESCE(segmento, p_segmento),
      regiao_atuacao       = COALESCE(regiao_atuacao, p_regiao_atuacao),
      canal_fop            = COALESCE(canal_fop, p_canal_fop),
      tags                 = COALESCE(tags, p_tags),
      observacao           = COALESCE(observacao, p_observacao),
      premissas            = COALESCE(premissas, p_premissas),
      -- isento_ie é boolean — só atualiza se SNCF está com default false E payload veio
      -- (NULL no UPDATE preservaria false; explicitar pra evitar surpresa)
      updated_at           = now()
    WHERE id = v_parceiro_id;
    -- NOTA: cadastro_incompleto NÃO é mexido aqui — preserva estado atual.
    -- Se SNCF tem cadastro_incompleto=true e payload completou os campos,
    -- ainda assim mantém true (enriquecimento poderá rodar e completar).
  END IF;

  -- 5. INSERT pedido. Cadeia de triggers AFTER INSERT roda na mesma TX
  INSERT INTO pedidos (
    id_externo, parceiro_id, data_pedido,
    valor_bruto, valor_liquido, desconto_pct,
    condicao_solicitada, forma_solicitada,
    vendedor, origem, itens_json, recebido_via
  ) VALUES (
    p_id_externo, v_parceiro_id, p_data_pedido,
    p_valor_bruto, p_valor_liquido, p_desconto_pct,
    p_condicao_solicitada, p_forma_solicitada,
    p_vendedor, p_origem, p_itens_json, p_recebido_via
  ) RETURNING id INTO v_pedido_id;

  -- 6. Lê estado final (triggers já rodaram)
  SELECT estagio, area_atual INTO v_estagio, v_area
  FROM pedidos WHERE id = v_pedido_id;

  SELECT id INTO v_analise_id
  FROM analises_credito WHERE pedido_id = v_pedido_id;

  RETURN json_build_object(
    'pedido_id', v_pedido_id,
    'parceiro_id', v_parceiro_id,
    'status', 'criada',
    'estagio_inicial', v_estagio,
    'area_inicial', v_area,
    'analise_id', v_analise_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.refletir_movimentacao_em_conta_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só age se tem vínculo reverso (movimentação ligada a uma conta)
  IF NEW.conta_pagar_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se a movimentação foi conciliada, é sinal forte que pagamento finalizou.
  -- Mantém status='aguardando_pagamento' em contas_pagar (já está lá),
  -- mas atualiza data_pagamento e movimentacao_bancaria_id se ainda vazios.
  -- (Doutrina: status compartilhado, não duplicado — UI lê via view consolidada)

  IF NEW.conciliado = true AND (OLD.conciliado IS NULL OR OLD.conciliado = false) THEN
    UPDATE contas_pagar_receber
    SET
      movimentacao_bancaria_id = COALESCE(movimentacao_bancaria_id, NEW.id),
      data_pagamento = COALESCE(data_pagamento, NEW.data_transacao),
      conciliado_em = COALESCE(conciliado_em, now()),
      updated_at = now()
    WHERE id = NEW.conta_pagar_id;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_classificacao(p_descricao text, p_cnpj text, p_parceiro_id uuid, p_categoria_id uuid, p_origem text DEFAULT 'manual'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_token TEXT;
  v_regra_existente UUID;
  v_regra_id UUID;
BEGIN
  IF p_categoria_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_token := public.extrair_token_principal(p_descricao);

  -- Estrategia: cria/atualiza a regra mais ESPECIFICA disponivel.
  -- Ordem de especificidade: parceiro > cnpj > token

  -- 1. Se tem parceiro_id, busca/cria regra por parceiro
  IF p_parceiro_id IS NOT NULL THEN
    SELECT id INTO v_regra_existente
    FROM public.regras_categorizacao
    WHERE parceiro_id = p_parceiro_id AND ativo = true
    LIMIT 1;

    IF v_regra_existente IS NOT NULL THEN
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      UPDATE public.regras_categorizacao
      SET vezes_aplicada = vezes_aplicada + 1,
          confianca = LEAST(100, confianca + 5),
          plano_contas_id = p_categoria_id,
          ultima_aplicacao_em = now()
      WHERE id = v_regra_existente
      RETURNING id INTO v_regra_id;
    ELSE
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      INSERT INTO public.regras_categorizacao (
        parceiro_id, plano_contas_id, escopo_origem, confianca,
        vezes_aplicada, aprendida_automaticamente, criada_por,
        ultima_aplicacao_em, prioridade, token_principal, ativo
      ) VALUES (
        p_parceiro_id, p_categoria_id, 'todos', 60,
        1, true, p_user_id,
        now(), 100, v_token, true
      ) RETURNING id INTO v_regra_id;
    END IF;
    RETURN v_regra_id;
  END IF;

  -- 2. Se tem CNPJ, busca/cria regra por CNPJ
  IF p_cnpj IS NOT NULL AND p_cnpj != '' THEN
    SELECT id INTO v_regra_existente
    FROM public.regras_categorizacao
    WHERE cnpj_emitente = p_cnpj AND parceiro_id IS NULL AND ativo = true
    LIMIT 1;

    IF v_regra_existente IS NOT NULL THEN
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      UPDATE public.regras_categorizacao
      SET vezes_aplicada = vezes_aplicada + 1,
          confianca = LEAST(100, confianca + 5),
          plano_contas_id = p_categoria_id,
          ultima_aplicacao_em = now()
      WHERE id = v_regra_existente
      RETURNING id INTO v_regra_id;
    ELSE
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      INSERT INTO public.regras_categorizacao (
        cnpj_emitente, plano_contas_id, escopo_origem, confianca,
        vezes_aplicada, aprendida_automaticamente, criada_por,
        ultima_aplicacao_em, prioridade, token_principal, ativo
      ) VALUES (
        p_cnpj, p_categoria_id, 'todos', 55,
        1, true, p_user_id,
        now(), 200, v_token, true
      ) RETURNING id INTO v_regra_id;
    END IF;
    RETURN v_regra_id;
  END IF;

  -- 3. Fallback: por TOKEN principal
  IF v_token IS NOT NULL THEN
    SELECT id INTO v_regra_existente
    FROM public.regras_categorizacao
    WHERE token_principal = v_token
      AND parceiro_id IS NULL
      AND cnpj_emitente IS NULL
      AND ativo = true
    LIMIT 1;

    IF v_regra_existente IS NOT NULL THEN
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      UPDATE public.regras_categorizacao
      SET vezes_aplicada = vezes_aplicada + 1,
          confianca = LEAST(100, confianca + 3),
          plano_contas_id = p_categoria_id,
          ultima_aplicacao_em = now()
      WHERE id = v_regra_existente
      RETURNING id INTO v_regra_id;
    ELSE
      -- B-51 fix: plano_contas_id (renomeada em §3.2)
      INSERT INTO public.regras_categorizacao (
        token_principal, plano_contas_id, escopo_origem, confianca,
        vezes_aplicada, aprendida_automaticamente, criada_por,
        ultima_aplicacao_em, prioridade, ativo
      ) VALUES (
        v_token, p_categoria_id, 'todos', 45,
        1, true, p_user_id,
        now(), 300, true
      ) RETURNING id INTO v_regra_id;
    END IF;
    RETURN v_regra_id;
  END IF;

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_compra_pedido(p_pedido_id uuid, p_status_alvo text, p_linhas jsonb, p_parceiro_id uuid, p_meio_pagamento_id uuid, p_data_compra date, p_parcelas_count integer DEFAULT 1, p_primeira_parcela_data date DEFAULT NULL::date, p_intervalo_dias integer DEFAULT 30, p_periodicidade text DEFAULT 'dias'::text, p_conta_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_compra_id uuid DEFAULT NULL::uuid, p_parceiro_id_pedido_original uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_pedido RECORD;
  v_compra_id uuid;
  v_parcela_grupo_id uuid;
  v_primeira_data date;
  v_linha jsonb;
  v_tipo_linha text;
  v_status_linha text;
  v_pedido_item_id uuid;
  v_substitui_pedido_item_id uuid;
  v_descricao_livre text;
  v_qtde_real numeric;
  v_valor_unit_real numeric;
  v_pedido_item_status text;
  v_pedido_item_pedido_id uuid;
  v_subtotal_estimado numeric;
  v_linhas_count integer := 0;
  v_pendentes_sem_decisao integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario nao autenticado'; END IF;

  IF NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas Comprador pode registrar compra (super_admin em V1)';
  END IF;

  IF p_status_alvo NOT IN ('rascunho', 'finalizada') THEN
    RAISE EXCEPTION 'p_status_alvo invalido: %. Use rascunho ou finalizada', p_status_alvo;
  END IF;

  IF p_periodicidade NOT IN ('meses', 'dias') THEN
    RAISE EXCEPTION 'Periodicidade invalida. Use meses ou dias';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos_compra WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido % nao encontrado', p_pedido_id; END IF;

  IF v_pedido.status != 'em_compra' THEN
    RAISE EXCEPTION 'Pedido precisa estar em EM_COMPRA (atual: %)', v_pedido.status;
  END IF;
  IF v_pedido.comprador_id != v_user_id THEN
    RAISE EXCEPTION 'Pedido foi pego por outro Comprador, nao por voce';
  END IF;

  IF p_parceiro_id IS NULL THEN RAISE EXCEPTION 'Parceiro (fornecedor) e obrigatorio'; END IF;
  IF p_meio_pagamento_id IS NULL THEN RAISE EXCEPTION 'Meio de pagamento e obrigatorio'; END IF;
  IF p_data_compra IS NULL THEN RAISE EXCEPTION 'Data da compra e obrigatoria'; END IF;
  IF p_parcelas_count < 1 OR p_parcelas_count > 60 THEN
    RAISE EXCEPTION 'Numero de parcelas invalido (1-60)';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.plano_contas WHERE id = p_conta_id
  ) THEN
    RAISE EXCEPTION 'Categoria informada nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parceiros_comerciais WHERE id = p_parceiro_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Parceiro informado nao existe ou esta inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.formas_pagamento WHERE id = p_meio_pagamento_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Meio de pagamento informado nao existe ou esta inativo';
  END IF;

  IF jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'Compra precisa ter pelo menos 1 linha';
  END IF;

  v_primeira_data := COALESCE(p_primeira_parcela_data, p_data_compra);

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo_linha := COALESCE(v_linha->>'tipo_linha', 'produto');
    v_status_linha := COALESCE(v_linha->>'status_linha', 'comprada');
    v_pedido_item_id := NULLIF(v_linha->>'pedido_item_id', '')::uuid;
    v_substitui_pedido_item_id := NULLIF(v_linha->>'substitui_pedido_item_id', '')::uuid;
    v_descricao_livre := v_linha->>'descricao_livre';
    v_qtde_real := COALESCE((v_linha->>'quantidade_real')::numeric, 0);
    v_valor_unit_real := COALESCE((v_linha->>'valor_unitario_real')::numeric, 0);

    IF v_tipo_linha NOT IN ('produto','frete','servico','extra','desconto') THEN
      RAISE EXCEPTION 'tipo_linha invalido: %', v_tipo_linha;
    END IF;
    IF v_status_linha NOT IN ('comprada','nao_comprada','substituida') THEN
      RAISE EXCEPTION 'status_linha invalido: %', v_status_linha;
    END IF;

    IF v_tipo_linha = 'desconto' THEN
      IF v_pedido_item_id IS NOT NULL OR v_substitui_pedido_item_id IS NOT NULL THEN
        RAISE EXCEPTION 'Linha de desconto nao pode ter pedido_item_id ou substitui_pedido_item_id';
      END IF;
      IF COALESCE(trim(v_descricao_livre), '') = '' THEN
        RAISE EXCEPTION 'Linha de desconto precisa de descricao (motivo)';
      END IF;
      IF v_qtde_real != 1 THEN RAISE EXCEPTION 'Linha de desconto precisa quantidade = 1'; END IF;
      IF v_status_linha != 'comprada' THEN
        RAISE EXCEPTION 'Linha de desconto sempre tem status_linha = comprada';
      END IF;
    END IF;

    IF v_pedido_item_id IS NOT NULL THEN
      SELECT pedido_id, status, (quantidade * valor_estimado_unitario)
      INTO v_pedido_item_pedido_id, v_pedido_item_status, v_subtotal_estimado
      FROM public.pedidos_compra_itens WHERE id = v_pedido_item_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'pedido_item_id % nao encontrado', v_pedido_item_id;
      END IF;
      IF v_pedido_item_pedido_id != p_pedido_id THEN
        RAISE EXCEPTION 'pedido_item_id % nao pertence ao pedido informado', v_pedido_item_id;
      END IF;
    END IF;

    IF v_substitui_pedido_item_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.pedidos_compra_itens
        WHERE id = v_substitui_pedido_item_id AND pedido_id = p_pedido_id
      ) THEN
        RAISE EXCEPTION 'substitui_pedido_item_id % nao pertence ao pedido', v_substitui_pedido_item_id;
      END IF;
    END IF;

    IF p_status_alvo = 'finalizada' THEN
      IF v_status_linha = 'comprada' THEN
        IF v_tipo_linha IN ('produto','servico') AND v_qtde_real <= 0 THEN
          RAISE EXCEPTION 'Linha comprada de produto/servico precisa quantidade > 0';
        END IF;
        IF v_valor_unit_real <= 0 THEN
          RAISE EXCEPTION 'Linha comprada precisa valor unitario > 0';
        END IF;
      END IF;
      IF v_tipo_linha = 'produto'
         AND v_pedido_item_id IS NULL
         AND v_substitui_pedido_item_id IS NULL
         AND COALESCE(trim(v_descricao_livre), '') = '' THEN
        RAISE EXCEPTION 'Linha de produto novo precisa de descricao livre';
      END IF;
    END IF;

    v_linhas_count := v_linhas_count + 1;
  END LOOP;

  IF p_status_alvo = 'finalizada' THEN
    SELECT COUNT(*) INTO v_pendentes_sem_decisao
    FROM public.pedidos_compra_itens p
    WHERE p.pedido_id = p_pedido_id
      AND p.status = 'pendente'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_linhas) elem
        WHERE NULLIF(elem->>'pedido_item_id','')::uuid = p.id
           OR NULLIF(elem->>'substitui_pedido_item_id','')::uuid = p.id
      );
    IF v_pendentes_sem_decisao > 0 THEN
      RAISE EXCEPTION '% itens do pedido sem decisao. Marque comprado, nao comprado ou substituido antes de finalizar.', v_pendentes_sem_decisao;
    END IF;
  END IF;

  IF p_compra_id IS NULL THEN
    v_parcela_grupo_id := gen_random_uuid();
    -- Onda E: era conta_id, agora plano_contas_id
    INSERT INTO public.compras_registradas (
      pedido_id, comprador_id, plano_contas_id, parceiro_id,
      parceiro_id_pedido_original, valor_total, data_compra, parcelas_count,
      primeira_parcela_data, intervalo_dias, periodicidade, meio_pagamento_id,
      observacao, parcela_grupo_id, status
    ) VALUES (
      p_pedido_id, v_user_id, p_conta_id, p_parceiro_id,
      COALESCE(p_parceiro_id_pedido_original, v_pedido.parceiro_preferencial_id, p_parceiro_id),
      0, p_data_compra, p_parcelas_count, v_primeira_data, p_intervalo_dias,
      p_periodicidade, p_meio_pagamento_id, p_observacao, v_parcela_grupo_id, 'rascunho'
    ) RETURNING id INTO v_compra_id;
  ELSE
    SELECT id, parcela_grupo_id INTO v_compra_id, v_parcela_grupo_id
    FROM public.compras_registradas
    WHERE id = p_compra_id AND status = 'rascunho'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Compra % nao encontrada ou nao e rascunho (nao pode ser editada)', p_compra_id;
    END IF;

    -- Onda E: era conta_id, agora plano_contas_id
    UPDATE public.compras_registradas
    SET plano_contas_id = p_conta_id,
        parceiro_id = p_parceiro_id,
        parceiro_id_pedido_original = COALESCE(p_parceiro_id_pedido_original, parceiro_id_pedido_original),
        data_compra = p_data_compra,
        parcelas_count = p_parcelas_count,
        primeira_parcela_data = v_primeira_data,
        intervalo_dias = p_intervalo_dias,
        periodicidade = p_periodicidade,
        meio_pagamento_id = p_meio_pagamento_id,
        observacao = p_observacao
    WHERE id = v_compra_id;

    DELETE FROM public.compras_registradas_itens WHERE compra_registrada_id = v_compra_id;
  END IF;

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    INSERT INTO public.compras_registradas_itens (
      compra_registrada_id, tipo_linha, status_linha, pedido_item_id,
      substitui_pedido_item_id, descricao_livre, quantidade_real, valor_unitario_real
    ) VALUES (
      v_compra_id,
      COALESCE(v_linha->>'tipo_linha', 'produto'),
      COALESCE(v_linha->>'status_linha', 'comprada'),
      NULLIF(v_linha->>'pedido_item_id','')::uuid,
      NULLIF(v_linha->>'substitui_pedido_item_id','')::uuid,
      v_linha->>'descricao_livre',
      COALESCE((v_linha->>'quantidade_real')::numeric, 0),
      COALESCE((v_linha->>'valor_unitario_real')::numeric, 0)
    );
  END LOOP;

  IF p_status_alvo = 'finalizada' THEN
    UPDATE public.compras_registradas
    SET status = 'finalizada'
    WHERE id = v_compra_id AND status = 'rascunho';
  END IF;

  INSERT INTO public.compras_registradas_audit_log (
    compra_registrada_id, acao, payload, usuario_id
  ) VALUES (
    v_compra_id,
    CASE WHEN p_status_alvo = 'finalizada' THEN 'COMPRA_FINALIZADA_VIA_RPC' ELSE 'RASCUNHO_SALVO' END,
    jsonb_build_object(
      'pedido_id', p_pedido_id,
      'linhas_count', v_linhas_count,
      'parcelas', p_parcelas_count,
      'periodicidade', p_periodicidade,
      'p_status_alvo', p_status_alvo
    ),
    v_user_id
  );

  RETURN jsonb_build_object(
    'compra_id', v_compra_id,
    'pedido_id', p_pedido_id,
    'parcela_grupo_id', v_parcela_grupo_id,
    'status', (SELECT status FROM public.compras_registradas WHERE id = v_compra_id),
    'valor_total', (SELECT valor_total FROM public.compras_registradas WHERE id = v_compra_id),
    'cprs_geradas', (
      SELECT COUNT(*) FROM public.contas_pagar_receber WHERE compra_registrada_id = v_compra_id
    )
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_correcao_regra(p_regra_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.regras_categorizacao
  SET vezes_corrigida = vezes_corrigida + 1,
      confianca = GREATEST(0, confianca - 10)
  WHERE id = p_regra_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_documento_intake(p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_hash TEXT := p_dados->>'hash_arquivo';
  v_existente_id UUID;
  v_novo_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Dedup: se já existe arquivo com mesmo hash subido pelo mesmo user, retorna existente
  IF v_hash IS NOT NULL THEN
    SELECT id INTO v_existente_id
    FROM public.ged_documentos
    WHERE hash_arquivo = v_hash
      AND criado_por = v_user_id
    LIMIT 1;

    IF v_existente_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'id', v_existente_id,
        'ja_existe', true,
        'mensagem', 'Arquivo já estava no Repositório (dedup por hash).'
      );
    END IF;
  END IF;

  -- Insert novo
  INSERT INTO public.ged_documentos (
    arquivo_original, storage_path, mime_type, tamanho_bytes,
    nome, tipo_documento,
    hash_arquivo, lote_id, origem_porta, status_classificacao,
    parceiro_id, pasta_contrato_id, pasta_id,
    criado_por
  )
  VALUES (
    p_dados->>'arquivo_original',
    p_dados->>'storage_path',
    p_dados->>'mime_type',
    (p_dados->>'tamanho_bytes')::bigint,
    COALESCE(p_dados->>'nome', p_dados->>'arquivo_original'),
    'outro',  -- provisório, será atualizado em marcar_documento_classificado
    v_hash,
    NULLIF(p_dados->>'lote_id', '')::uuid,
    COALESCE(p_dados->>'origem_porta', 'repositorio'),
    'aguardando',
    NULLIF(p_dados->>'parceiro_id', '')::uuid,
    NULLIF(p_dados->>'pasta_contrato_id', '')::uuid,
    NULLIF(p_dados->>'pasta_id', '')::uuid,
    v_user_id
  )
  RETURNING id INTO v_novo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_novo_id,
    'ja_existe', false
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_evento_pedido(p_pedido_id uuid, p_tipo_evento text, p_descricao text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operador uuid;
  v_id uuid;
BEGIN
  v_operador := auth.uid();

  INSERT INTO public.pedido_eventos (
    pedido_id, tipo_evento, descricao, metadata, operador_id, automatico
  ) VALUES (
    p_pedido_id, p_tipo_evento, p_descricao, p_metadata, v_operador, false
  ) RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'evento_id', v_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_historico_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Só registra se status mudou
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO contas_pagar_historico (
      conta_id,
      status_anterior,
      status_novo,
      created_by
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.registrar_operacao_pedido(p_pedido_id uuid, p_tipo_evento text, p_descricao text, p_metadata jsonb DEFAULT NULL::jsonb, p_proxima_acao text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_operador uuid;
  v_evento_id uuid;
BEGIN
  v_operador := auth.uid();

  INSERT INTO public.pedido_eventos (
    pedido_id, tipo_evento, descricao, metadata, operador_id, automatico
  ) VALUES (
    p_pedido_id, p_tipo_evento, p_descricao, p_metadata, v_operador, false
  ) RETURNING id INTO v_evento_id;

  IF p_proxima_acao IS NOT NULL THEN
    UPDATE public.pedidos
    SET proxima_acao = p_proxima_acao
    WHERE id = p_pedido_id;
  END IF;

  RETURN json_build_object('ok', true, 'evento_id', v_evento_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.resolver_parceiro_do_documento(p_ged_documento_id uuid, p_decisao text, p_parceiro_id uuid DEFAULT NULL::uuid, p_dados_novo_parceiro jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_ged RECORD;
  v_novo_parceiro_id UUID;
  v_cnpj_limpo TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Carrega ged_documento
  SELECT * INTO v_ged FROM public.ged_documentos WHERE id = p_ged_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ged_documento % não encontrado', p_ged_documento_id
      USING ERRCODE = '02000';
  END IF;

  -- Roteia por decisão
  IF p_decisao = 'vincular_existente' THEN
    IF p_parceiro_id IS NULL THEN
      RAISE EXCEPTION 'parceiro_id obrigatório para decisao=vincular_existente'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.parceiros_comerciais WHERE id = p_parceiro_id) THEN
      RAISE EXCEPTION 'Parceiro % não encontrado', p_parceiro_id USING ERRCODE = '02000';
    END IF;

    UPDATE public.ged_documentos
    SET
      parceiro_id = p_parceiro_id,
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = false,
      updated_at = now()
    WHERE id = p_ged_documento_id;

    RETURN jsonb_build_object(
      'ok', true,
      'decisao', 'vincular_existente',
      'parceiro_id', p_parceiro_id
    );

  ELSIF p_decisao = 'criar_novo' THEN
    IF p_dados_novo_parceiro IS NULL THEN
      RAISE EXCEPTION 'dados_novo_parceiro obrigatório para decisao=criar_novo'
        USING ERRCODE = '22023';
    END IF;

    IF COALESCE(p_dados_novo_parceiro->>'razao_social', '') = '' THEN
      RAISE EXCEPTION 'razao_social obrigatória para criar parceiro novo'
        USING ERRCODE = '22023';
    END IF;

    v_cnpj_limpo := NULLIF(regexp_replace(
      COALESCE(p_dados_novo_parceiro->>'cnpj', ''), '[^0-9]', '', 'g'
    ), '');

    -- Tenta dedup por CNPJ antes de criar
    IF v_cnpj_limpo IS NOT NULL AND length(v_cnpj_limpo) >= 11 THEN
      SELECT id INTO v_novo_parceiro_id
      FROM public.parceiros_comerciais
      WHERE regexp_replace(COALESCE(cnpj, cpf, ''), '[^0-9]', '', 'g') = v_cnpj_limpo
      LIMIT 1;

      IF v_novo_parceiro_id IS NOT NULL THEN
        -- Já existe sob mesmo CNPJ — vincula ao existente em vez de criar duplicata
        UPDATE public.ged_documentos
        SET
          parceiro_id = v_novo_parceiro_id,
          parceiro_resolucao_pendente = false,
          parceiro_resolucao_dispensada = false,
          updated_at = now()
        WHERE id = p_ged_documento_id;

        RETURN jsonb_build_object(
          'ok', true,
          'decisao', 'vincular_existente',
          'parceiro_id', v_novo_parceiro_id,
          'mensagem', 'Parceiro com mesmo CNPJ já existia — vinculado ao existente.'
        );
      END IF;
    END IF;

    -- Cria parceiro novo (cadastro incompleto, operador completa depois)
    INSERT INTO public.parceiros_comerciais (
      razao_social,
      nome_fantasia,
      cnpj,
      cpf,
      tipo_pessoa,
      tipo,
      ativo,
      cadastro_incompleto,
      origem
    )
    VALUES (
      p_dados_novo_parceiro->>'razao_social',
      NULLIF(p_dados_novo_parceiro->>'nome_fantasia', ''),
      CASE WHEN length(COALESCE(v_cnpj_limpo, '')) = 14 THEN v_cnpj_limpo ELSE NULL END,
      CASE WHEN length(COALESCE(v_cnpj_limpo, '')) = 11 THEN v_cnpj_limpo ELSE NULL END,
      CASE 
        WHEN length(COALESCE(v_cnpj_limpo, '')) = 14 THEN 'PJ'
        WHEN length(COALESCE(v_cnpj_limpo, '')) = 11 THEN 'PF'
        ELSE COALESCE(p_dados_novo_parceiro->>'tipo_pessoa', 'PJ')
      END,
      COALESCE(p_dados_novo_parceiro->>'tipo', 'fornecedor'),
      true,
      true,  -- cadastro_incompleto: operador completa depois com endereço, etc
      'stage_universal'
    )
    RETURNING id INTO v_novo_parceiro_id;

    UPDATE public.ged_documentos
    SET
      parceiro_id = v_novo_parceiro_id,
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = false,
      updated_at = now()
    WHERE id = p_ged_documento_id;

    RETURN jsonb_build_object(
      'ok', true,
      'decisao', 'criar_novo',
      'parceiro_id', v_novo_parceiro_id,
      'cadastro_incompleto', true
    );

  ELSIF p_decisao = 'dispensar' THEN
    UPDATE public.ged_documentos
    SET
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = true,
      updated_at = now()
    WHERE id = p_ged_documento_id;

    RETURN jsonb_build_object(
      'ok', true,
      'decisao', 'dispensar'
    );

  ELSE
    RAISE EXCEPTION 'decisao inválida: %. Valores aceitos: vincular_existente, criar_novo, dispensar', p_decisao
      USING ERRCODE = '22023';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.resolver_parceiro_em_lote(p_cnpj_ia text, p_decisao text, p_parceiro_id uuid DEFAULT NULL::uuid, p_dados_novo_parceiro jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_cnpj_limpo TEXT;
  v_novo_parceiro_id UUID;
  v_qtd_afetada INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  v_cnpj_limpo := regexp_replace(COALESCE(p_cnpj_ia, ''), '[^0-9]', '', 'g');

  IF length(v_cnpj_limpo) < 11 THEN
    RAISE EXCEPTION 'CNPJ inválido para operação em lote' USING ERRCODE = '22023';
  END IF;

  IF p_decisao = 'vincular_existente' THEN
    IF p_parceiro_id IS NULL THEN
      RAISE EXCEPTION 'parceiro_id obrigatório' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.parceiros_comerciais WHERE id = p_parceiro_id) THEN
      RAISE EXCEPTION 'Parceiro % não encontrado', p_parceiro_id USING ERRCODE = '02000';
    END IF;

    UPDATE public.ged_documentos
    SET
      parceiro_id = p_parceiro_id,
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = false,
      updated_at = now()
    WHERE parceiro_resolucao_pendente = true
      AND regexp_replace(COALESCE(classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g') = v_cnpj_limpo;

    GET DIAGNOSTICS v_qtd_afetada = ROW_COUNT;

    RETURN jsonb_build_object('ok', true, 'decisao', 'vincular_existente', 'qtd_afetada', v_qtd_afetada);

  ELSIF p_decisao = 'criar_novo' THEN
    IF p_dados_novo_parceiro IS NULL THEN
      RAISE EXCEPTION 'dados_novo_parceiro obrigatório' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(p_dados_novo_parceiro->>'razao_social', '') = '' THEN
      RAISE EXCEPTION 'razao_social obrigatória' USING ERRCODE = '22023';
    END IF;

    -- Dedup: tenta encontrar parceiro existente com mesmo CNPJ antes de criar
    SELECT id INTO v_novo_parceiro_id
    FROM public.parceiros_comerciais
    WHERE regexp_replace(COALESCE(cnpj, cpf, ''), '[^0-9]', '', 'g') = v_cnpj_limpo
    LIMIT 1;

    IF v_novo_parceiro_id IS NULL THEN
      -- Cria novo (cadastro incompleto)
      INSERT INTO public.parceiros_comerciais (
        razao_social, nome_fantasia, cnpj, cpf, tipo_pessoa, tipo,
        ativo, cadastro_incompleto, origem
      )
      VALUES (
        p_dados_novo_parceiro->>'razao_social',
        NULLIF(p_dados_novo_parceiro->>'nome_fantasia', ''),
        CASE WHEN length(v_cnpj_limpo) = 14 THEN v_cnpj_limpo ELSE NULL END,
        CASE WHEN length(v_cnpj_limpo) = 11 THEN v_cnpj_limpo ELSE NULL END,
        CASE 
          WHEN length(v_cnpj_limpo) = 14 THEN 'PJ'
          WHEN length(v_cnpj_limpo) = 11 THEN 'PF'
          ELSE 'PJ'
        END,
        'fornecedor',
        true,
        true,
        'stage_universal'
      )
      RETURNING id INTO v_novo_parceiro_id;
    END IF;

    -- Vincula em lote a todos os pendentes do CNPJ
    UPDATE public.ged_documentos
    SET
      parceiro_id = v_novo_parceiro_id,
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = false,
      updated_at = now()
    WHERE parceiro_resolucao_pendente = true
      AND regexp_replace(COALESCE(classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g') = v_cnpj_limpo;

    GET DIAGNOSTICS v_qtd_afetada = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'decisao', 'criar_novo',
      'parceiro_id', v_novo_parceiro_id,
      'qtd_afetada', v_qtd_afetada
    );

  ELSIF p_decisao = 'dispensar' THEN
    UPDATE public.ged_documentos
    SET
      parceiro_resolucao_pendente = false,
      parceiro_resolucao_dispensada = true,
      updated_at = now()
    WHERE parceiro_resolucao_pendente = true
      AND regexp_replace(COALESCE(classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g') = v_cnpj_limpo;

    GET DIAGNOSTICS v_qtd_afetada = ROW_COUNT;

    RETURN jsonb_build_object('ok', true, 'decisao', 'dispensar', 'qtd_afetada', v_qtd_afetada);

  ELSE
    RAISE EXCEPTION 'decisao inválida: %', p_decisao USING ERRCODE = '22023';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rotear_documento_para_boleto(p_ged_documento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_ged RECORD;
  v_boleto_existente RECORD;
  v_ia jsonb;
  v_valor NUMERIC;
  v_vencimento DATE;
  v_parceiro_id UUID;
  v_parceiro_cnpj TEXT;
  v_pasta_contrato_id UUID;
  v_boleto_id UUID;
  v_candidatos jsonb := '[]'::jsonb;
  v_qtd_candidatos INT;
  v_unico_cpr_id UUID;
  v_cpr_descricao TEXT;
  v_cpr_valor NUMERIC;
  v_cpr_vencimento DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ged FROM public.ged_documentos WHERE id = p_ged_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ged_documento_id % não encontrado', p_ged_documento_id USING ERRCODE = '02000';
  END IF;

  IF v_ged.tipo_documento <> 'boleto' THEN
    RAISE EXCEPTION 'Documento % não é boleto (tipo=%)', p_ged_documento_id, v_ged.tipo_documento USING ERRCODE = '22023';
  END IF;

  -- Doutrina #118
  IF v_ged.parceiro_resolucao_pendente = true 
     AND v_ged.parceiro_resolucao_dispensada = false THEN
    RAISE EXCEPTION 'Resolução de parceiro pendente. Resolva o parceiro antes de rotear (Doutrina #118).'
      USING ERRCODE = '22023';
  END IF;

  -- IDEMPOTÊNCIA: se já existe boleto_stage, retorna o existente sem criar duplicata
  SELECT * INTO v_boleto_existente
  FROM public.boleto_stage
  WHERE ged_documento_id = p_ged_documento_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_boleto_existente.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ja_roteado', true,
      'boleto_stage_id', v_boleto_existente.id,
      'status_ancoragem', v_boleto_existente.status,
      'mensagem', CASE v_boleto_existente.status
        WHEN 'aguardando_ancoragem' THEN 'Boleto já criado anteriormente. Continue a ancoragem.'
        WHEN 'ancorado_em_cpr_existente' THEN 'Boleto já ancorado em CPR existente.'
        WHEN 'cpr_nova_criada' THEN 'Boleto já gerou CPR nova.'
        ELSE 'Boleto em estado: ' || v_boleto_existente.status
      END,
      'qtd_candidatos', CASE 
        WHEN v_boleto_existente.cpr_match_candidatos IS NULL THEN 0
        ELSE jsonb_array_length(v_boleto_existente.cpr_match_candidatos)
      END,
      'candidatos', COALESCE(v_boleto_existente.cpr_match_candidatos, '[]'::jsonb),
      'cpr_id', v_boleto_existente.contas_pagar_receber_id
    );
  END IF;

  -- A partir daqui, cria novo boleto_stage (fluxo original)
  v_ia := COALESCE(v_ged.classificacao_ia, '{}'::jsonb);
  v_valor := NULLIF(v_ia->>'valor', '')::numeric;
  v_vencimento := NULLIF(v_ia->>'data_vencimento', '')::date;
  v_parceiro_cnpj := regexp_replace(COALESCE(v_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g');

  v_parceiro_id := v_ged.parceiro_id;
  v_pasta_contrato_id := v_ged.pasta_contrato_id;

  INSERT INTO public.boleto_stage (
    ged_documento_id, parceiro_id, pasta_contrato_id,
    valor, vencimento, beneficiario_cnpj, beneficiario_nome,
    metadados_parse, status, criado_por
  )
  VALUES (
    p_ged_documento_id, v_parceiro_id, v_pasta_contrato_id,
    v_valor, v_vencimento, v_parceiro_cnpj,
    v_ia->>'parceiro_razao_social',
    v_ia, 'aguardando_ancoragem', v_user_id
  )
  RETURNING id INTO v_boleto_id;

  -- Match #115
  IF v_parceiro_id IS NOT NULL AND v_valor IS NOT NULL AND v_vencimento IS NOT NULL THEN
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'cpr_id', cpr.id,
        'descricao', cpr.descricao,
        'valor', cpr.valor,
        'data_vencimento', cpr.data_vencimento,
        'status', cpr.status,
        'score', 100
      )), '[]'::jsonb)
    INTO v_candidatos
    FROM public.contas_pagar_receber cpr
    WHERE cpr.parceiro_id = v_parceiro_id
      AND ABS(cpr.valor - v_valor) <= 1.00
      AND ABS(cpr.data_vencimento - v_vencimento) <= 5
      AND cpr.status IN ('aberto', 'aprovado', 'aguardando_pagamento', 'doc_pendente')
      AND cpr.data_pagamento IS NULL;
  END IF;

  v_qtd_candidatos := jsonb_array_length(v_candidatos);

  IF v_qtd_candidatos = 1 THEN
    v_unico_cpr_id := (v_candidatos->0->>'cpr_id')::uuid;
    v_cpr_descricao := v_candidatos->0->>'descricao';
    v_cpr_valor := NULLIF(v_candidatos->0->>'valor', '')::numeric;
    v_cpr_vencimento := NULLIF(v_candidatos->0->>'data_vencimento', '')::date;

    UPDATE public.boleto_stage
    SET contas_pagar_receber_id = v_unico_cpr_id,
        status = 'ancorado_em_cpr_existente',
        ancorado_em = now(), ancorado_por = v_user_id
    WHERE id = v_boleto_id;

    INSERT INTO public.ged_documento_vinculos
      (documento_id, entidade_tipo, entidade_id, observacao, criado_por)
    VALUES (p_ged_documento_id, 'cpr', v_unico_cpr_id, 'Ancoragem automática F1.2', v_user_id)
    ON CONFLICT DO NOTHING;

  ELSIF v_qtd_candidatos > 1 THEN
    UPDATE public.boleto_stage
    SET cpr_match_candidatos = v_candidatos
    WHERE id = v_boleto_id;
  END IF;

  UPDATE public.ged_documentos
  SET status_classificacao = 'roteada', updated_at = now()
  WHERE id = p_ged_documento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ja_roteado', false,
    'boleto_stage_id', v_boleto_id,
    'qtd_candidatos', v_qtd_candidatos,
    'candidatos', v_candidatos,
    'status_ancoragem', CASE
      WHEN v_qtd_candidatos = 1 THEN 'ancorado_automatico'
      WHEN v_qtd_candidatos > 1 THEN 'aguardando_escolha_operador'
      ELSE 'sem_candidatos'
    END,
    'cpr_id', v_unico_cpr_id,
    'cpr_descricao', v_cpr_descricao,
    'cpr_valor', v_cpr_valor,
    'cpr_vencimento', v_cpr_vencimento
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at_compromissos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at_faturas_cartao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at_nfs_stage()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_user_tema(p_tema text)
 RETURNS user_preferencias_navegacao
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_result public.user_preferencias_navegacao;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_user_tema: usuário não autenticado';
  END IF;

  IF p_tema NOT IN ('light', 'dark') THEN
    RAISE EXCEPTION 'set_user_tema: tema inválido (%) — valores aceitos: light, dark', p_tema;
  END IF;

  INSERT INTO public.user_preferencias_navegacao (user_id, tema)
  VALUES (v_user_id, p_tema)
  ON CONFLICT (user_id) DO UPDATE
    SET tema = EXCLUDED.tema
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sincronizar_tags_documentos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tem_documento BOOLEAN;
  v_tags_atuais JSONB;
  v_tags_novas JSONB;
BEGIN
  v_tem_documento := EXISTS (
    SELECT 1 FROM nfs_stage
    WHERE conta_pagar_id = NEW.id AND status <> 'descartada'
  ) OR (NEW.comprovante_url IS NOT NULL AND length(trim(NEW.comprovante_url)) > 0);

  v_tags_atuais := COALESCE(NEW.tags, '[]'::jsonb);
  v_tags_novas := v_tags_atuais - 'doc_pendente';
  IF NOT v_tem_documento THEN
    v_tags_novas := v_tags_novas || '["doc_pendente"]'::jsonb;
  END IF;
  IF v_tags_novas <> v_tags_atuais THEN
    NEW.tags := v_tags_novas;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sugerir_categoria(p_descricao text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text, p_parceiro_id uuid DEFAULT NULL::uuid, p_ncm text DEFAULT NULL::text, p_origem text DEFAULT 'todos'::text)
 RETURNS TABLE(regra_id uuid, categoria_id uuid, centro_custo text, confianca integer, tipo_match text, motivo text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  v_token := public.extrair_token_principal(p_descricao);

  -- B-51 fix: regras_categorizacao.plano_contas_id (renomeada em §3.2);
  -- mapeamento posicional pro RETURNS TABLE preserva "categoria_id" pro chamador
  RETURN QUERY
  WITH candidatas AS (
    SELECT r.id, r.plano_contas_id, r.centro_custo, r.confianca,
           'parceiro'::TEXT AS tipo_match,
           'Parceiro com regra cadastrada'::TEXT AS motivo,
           1 AS prioridade_match
    FROM public.regras_categorizacao r
    WHERE r.ativo = true
      AND r.parceiro_id IS NOT NULL
      AND p_parceiro_id IS NOT NULL
      AND r.parceiro_id = p_parceiro_id
      AND (r.escopo_origem = 'todos' OR r.escopo_origem = p_origem)

    UNION ALL

    SELECT r.id, r.plano_contas_id, r.centro_custo, r.confianca,
           'cnpj'::TEXT,
           ('CNPJ ' || r.cnpj_emitente || ' já classificado ' || r.vezes_aplicada || 'x')::TEXT,
           2
    FROM public.regras_categorizacao r
    WHERE r.ativo = true
      AND r.cnpj_emitente IS NOT NULL
      AND p_cnpj IS NOT NULL
      AND r.cnpj_emitente = p_cnpj
      AND (r.escopo_origem = 'todos' OR r.escopo_origem = p_origem)

    UNION ALL

    SELECT r.id, r.plano_contas_id, r.centro_custo, r.confianca,
           'ncm'::TEXT,
           ('NCM ' || r.ncm_prefixo)::TEXT,
           3
    FROM public.regras_categorizacao r
    WHERE r.ativo = true
      AND r.ncm_prefixo IS NOT NULL
      AND p_ncm IS NOT NULL
      AND p_ncm LIKE r.ncm_prefixo || '%'
      AND (r.escopo_origem = 'todos' OR r.escopo_origem = p_origem)

    UNION ALL

    SELECT r.id, r.plano_contas_id, r.centro_custo, r.confianca,
           'token'::TEXT,
           ('Estabelecimento "' || upper(r.token_principal) || '" já classificado ' || r.vezes_aplicada || 'x')::TEXT,
           4
    FROM public.regras_categorizacao r
    WHERE r.ativo = true
      AND r.token_principal IS NOT NULL
      AND v_token IS NOT NULL
      AND r.token_principal = v_token
      AND (r.escopo_origem = 'todos' OR r.escopo_origem = p_origem)

    UNION ALL

    SELECT r.id, r.plano_contas_id, r.centro_custo, r.confianca,
           'descricao'::TEXT,
           ('Descrição contém "' || r.descricao_contem || '"')::TEXT,
           5
    FROM public.regras_categorizacao r
    WHERE r.ativo = true
      AND r.descricao_contem IS NOT NULL
      AND p_descricao IS NOT NULL
      AND lower(p_descricao) LIKE '%' || lower(r.descricao_contem) || '%'
      AND (r.escopo_origem = 'todos' OR r.escopo_origem = p_origem)
  )
  SELECT c.id, c.plano_contas_id, c.centro_custo, c.confianca, c.tipo_match, c.motivo
  FROM candidatas c
  ORDER BY c.prioridade_match ASC, c.confianca DESC
  LIMIT 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sugerir_categoria_para_lancamento(p_descricao text, p_cnpj text, p_parceiro_id uuid, p_conta_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria_id uuid, categoria_codigo text, categoria_nome text, score integer, motivo text, amostra_descricao text, amostra_count integer, similares jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token text; v_grupo uuid; v_desc_base text;
BEGIN
  v_token := extrair_token_principal(p_descricao);
  v_desc_base := TRIM(REGEXP_REPLACE(
    COALESCE(p_descricao, ''),
    '\s*[\(\[]?\s*\d+\s*[/de]+\s*\d+\s*[\)\]]?\s*$', '', 'gi'
  ));
  IF p_conta_id IS NOT NULL THEN
    SELECT parcela_grupo_id INTO v_grupo FROM contas_pagar_receber WHERE id = p_conta_id;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.plano_contas_id AS plano_conta_id,          -- §3.2
      c.id AS row_id,
      c.descricao,
      TRIM(REGEXP_REPLACE(
        COALESCE(c.descricao, ''),
        '\s*[\(\[]?\s*\d+\s*[/de]+\s*\d+\s*[\)\]]?\s*$', '', 'gi'
      )) AS desc_base,
      c.valor, c.data_vencimento, c.nf_cnpj_emitente,
      COALESCE(p.nome_fantasia, p.razao_social) AS parceiro_nome,
      pc.codigo AS cat_codigo, pc.nome AS cat_nome,
      CASE
        WHEN p_parceiro_id IS NOT NULL AND c.parceiro_id = p_parceiro_id THEN 95
        WHEN p_cnpj IS NOT NULL AND c.nf_cnpj_emitente = p_cnpj THEN 90
        WHEN v_token IS NOT NULL AND extrair_token_principal(c.descricao) = v_token THEN 80
        WHEN similarity(c.descricao, COALESCE(p_descricao,'')) > 0.4
          THEN (similarity(c.descricao, COALESCE(p_descricao,'')) * 100)::int
        ELSE 0
      END AS match_score,
      CASE
        WHEN p_parceiro_id IS NOT NULL AND c.parceiro_id = p_parceiro_id THEN 'Mesmo parceiro'
        WHEN p_cnpj IS NOT NULL AND c.nf_cnpj_emitente = p_cnpj THEN 'Mesmo CNPJ'
        WHEN v_token IS NOT NULL AND extrair_token_principal(c.descricao) = v_token THEN 'Mesmo token'
        ELSE 'Descrição similar'
      END AS match_motivo
    FROM contas_pagar_receber c
    LEFT JOIN parceiros_comerciais p ON p.id = c.parceiro_id
    LEFT JOIN plano_contas pc ON pc.id = c.plano_contas_id   -- §3.2
    WHERE c.plano_contas_id IS NOT NULL                       -- §3.2
      AND (v_grupo IS NULL OR c.parcela_grupo_id IS DISTINCT FROM v_grupo)
      AND (p_conta_id IS NULL OR c.id <> p_conta_id)
      AND NOT (
        TRIM(REGEXP_REPLACE(
          COALESCE(c.descricao, ''),
          '\s*[\(\[]?\s*\d+\s*[/de]+\s*\d+\s*[\)\]]?\s*$', '', 'gi'
        )) = v_desc_base
      )
  ),
  base_filtrada AS (SELECT * FROM base WHERE match_score > 0),
  agg AS (
    SELECT
      plano_conta_id, cat_codigo, cat_nome,
      MAX(match_score)::int AS score,
      MAX(match_motivo) AS motivo,
      COUNT(*)::int AS amostra_count,
      (array_agg(descricao ORDER BY match_score DESC, data_vencimento DESC))[1] AS amostra_descricao,
      jsonb_agg(
        jsonb_build_object(
          'conta_id', row_id, 'descricao', descricao, 'valor', valor,
          'data_vencimento', data_vencimento, 'parceiro_nome', parceiro_nome,
          'cnpj', nf_cnpj_emitente, 'categoria_codigo', cat_codigo,
          'categoria_nome', cat_nome, 'match_score', match_score, 'match_motivo', match_motivo
        ) ORDER BY match_score DESC, data_vencimento DESC
      ) AS similares_full
    FROM base_filtrada
    GROUP BY plano_conta_id, cat_codigo, cat_nome
  )
  SELECT
    a.plano_conta_id AS categoria_id,
    a.cat_codigo AS categoria_codigo,
    a.cat_nome AS categoria_nome,
    a.score, a.motivo, a.amostra_descricao, a.amostra_count,
    COALESCE(
      (SELECT jsonb_agg(item) FROM (SELECT item FROM jsonb_array_elements(a.similares_full) item LIMIT 5) s),
      '[]'::jsonb
    ) AS similares
  FROM agg a
  ORDER BY a.score DESC, a.amostra_count DESC
  LIMIT 5;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sugerir_matches_lancamento(p_lancamento_id uuid)
 RETURNS TABLE(conta_pagar_id uuid, descricao text, valor numeric, data_vencimento date, fornecedor_cliente text, status text, score integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc RECORD;
  v_token text;
BEGIN
  SELECT fcl.id, fcl.descricao, fcl.valor, fcl.data_compra, fcl.cnpj_estabelecimento
    INTO v_lanc
  FROM fatura_cartao_lancamentos fcl
  WHERE fcl.id = p_lancamento_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_token := extrair_token_principal(v_lanc.descricao);

  RETURN QUERY
  SELECT c.id,
         c.descricao,
         c.valor,
         c.data_vencimento::date,
         c.fornecedor_cliente,
         c.status,
         GREATEST(
           CASE WHEN ABS(c.valor - v_lanc.valor) <= 0.05 THEN 50 ELSE 0 END
           + CASE
               WHEN v_token IS NOT NULL AND extrair_token_principal(c.descricao) = v_token THEN 30
               WHEN similarity(c.descricao, COALESCE(v_lanc.descricao,'')) > 0.4
                    THEN (similarity(c.descricao, COALESCE(v_lanc.descricao,'')) * 30)::int
               ELSE 0
             END
           + CASE WHEN ABS(c.data_vencimento - v_lanc.data_compra) <= 15 THEN 20 ELSE 0 END,
           0
         )::int AS score
  FROM contas_pagar_receber c
  WHERE c.tipo = 'pagar'                                                            -- ← C-60: filtro adicionado
    AND c.conciliado_em IS NULL
    AND c.movimentacao_bancaria_id IS NULL
    AND c.status NOT IN ('cancelado')
    AND NOT EXISTS (
      SELECT 1 FROM fatura_cartao_lancamentos fcl2
      WHERE fcl2.conta_pagar_id = c.id
        AND fcl2.status = 'conciliado'
    )
    AND (
      ABS(c.valor - v_lanc.valor) <= 0.05
      OR (v_token IS NOT NULL AND extrair_token_principal(c.descricao) = v_token)
      OR similarity(c.descricao, COALESCE(v_lanc.descricao,'')) > 0.4
    )
  ORDER BY score DESC, c.data_vencimento DESC
  LIMIT 10;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sugerir_matches_ofx(p_ofx_id uuid)
 RETURNS TABLE(conta_pagar_id uuid, descricao text, valor numeric, data_vencimento date, fornecedor_cliente text, status text, score integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx RECORD;
  v_valor_abs NUMERIC;
BEGIN
  SELECT * INTO v_ofx FROM ofx_transacoes_stage WHERE id = p_ofx_id;
  IF v_ofx.id IS NULL THEN RETURN; END IF;

  v_valor_abs := ABS(v_ofx.valor);

  RETURN QUERY
  SELECT
    cp.id,
    cp.descricao,
    cp.valor,
    cp.data_vencimento,
    cp.fornecedor_cliente,
    cp.status,
    (
      -- Valor exato
      CASE WHEN cp.valor = v_valor_abs THEN 50 ELSE 0 END
      -- Valor aproximado (R$ 0,50)
      + CASE WHEN cp.valor <> v_valor_abs AND ABS(cp.valor - v_valor_abs) <= 0.50 THEN 40 ELSE 0 END
      -- Valor próximo (R$ 5)
      + CASE WHEN ABS(cp.valor - v_valor_abs) > 0.50 AND ABS(cp.valor - v_valor_abs) <= 5 THEN 20 ELSE 0 END
      -- Janela de data (3 dias)
      + CASE WHEN ABS(cp.data_vencimento - v_ofx.data_transacao) <= 3 THEN 20
              WHEN ABS(cp.data_vencimento - v_ofx.data_transacao) <= 15 THEN 10
              ELSE 0 END
    )::INTEGER AS score
  FROM contas_pagar_receber cp
  WHERE cp.status IN ('aprovado', 'aguardando_pagamento')
    AND cp.movimentacao_bancaria_id IS NULL
    AND ABS(cp.valor - v_valor_abs) <= 5  -- filtro inicial: dentro de R$ 5
  ORDER BY score DESC, ABS(cp.data_vencimento - v_ofx.data_transacao) ASC
  LIMIT 5;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tentar_match_parceiro_retroativo()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_pendentes_antes INTEGER;
  v_resolvidos INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_total_pendentes_antes
  FROM public.ged_documentos
  WHERE parceiro_resolucao_pendente = true;

  -- UPDATE em massa: docs pendentes cujo CNPJ inferido tem match exato em parceiros_comerciais
  WITH matches_efetuados AS (
    UPDATE public.ged_documentos g
    SET
      parceiro_id = p.id,
      parceiro_resolucao_pendente = false,
      updated_at = now()
    FROM public.parceiros_comerciais p
    WHERE g.parceiro_resolucao_pendente = true
      AND g.parceiro_id IS NULL
      AND length(regexp_replace(COALESCE(g.classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g')) >= 11
      AND regexp_replace(COALESCE(g.classificacao_ia->>'parceiro_cnpj', ''), '[^0-9]', '', 'g')
          = regexp_replace(COALESCE(p.cnpj, p.cpf, ''), '[^0-9]', '', 'g')
    RETURNING g.id
  )
  SELECT COUNT(*) INTO v_resolvidos FROM matches_efetuados;

  RETURN jsonb_build_object(
    'ok', true,
    'total_pendentes_antes', v_total_pendentes_antes,
    'resolvidos_automaticamente', v_resolvidos,
    'restantes_pendentes', v_total_pendentes_antes - v_resolvidos
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.tg_ged_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.tg_nfs_stage_recalc_proprio_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Quando muda o conta_pagar_id da NF (anexa/desanexa), recalcula status
  IF TG_OP = 'UPDATE' AND NEW.conta_pagar_id IS DISTINCT FROM OLD.conta_pagar_id THEN
    PERFORM recalcular_status_nf_stage(NEW.id);
  ELSIF TG_OP = 'INSERT' AND NEW.conta_pagar_id IS NOT NULL THEN
    PERFORM recalcular_status_nf_stage(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_config_financeiro_externo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.transicionar_pedido(p_pedido_id uuid, p_para_estagio text, p_proxima_acao text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido record;
  v_area_nova text;
  v_operador uuid;
BEGIN
  v_operador := auth.uid();

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_pedido_id;
  END IF;

  IF v_pedido.estagio IN ('faturado', 'entregue', 'cancelado')
     AND p_para_estagio <> 'cancelado' THEN
    RAISE EXCEPTION 'Pedido em estado final (%) não pode mais transicionar',
      v_pedido.estagio;
  END IF;

  v_area_nova := CASE p_para_estagio
    WHEN 'recebido'             THEN 'sops'
    WHEN 'em_analise_credito'   THEN 'credito'
    WHEN 'credito_aprovado'     THEN 'sops'
    WHEN 'cobranca'             THEN 'sops'  -- NOVO (tela mora em Crédito)
    WHEN 'aguardando_pagamento' THEN 'sops'  -- NOVO (tela mora em Crédito)
    WHEN 'pre_faturado'         THEN 'sops'
    WHEN 'em_separacao'         THEN 'bling'
    WHEN 'faturado'             THEN 'bling'
    WHEN 'em_transporte'        THEN 'bling'
    WHEN 'entregue'             THEN 'nenhuma'
    WHEN 'cancelado'            THEN 'nenhuma'
    WHEN 'recuperacao_venda'    THEN 'sops'
    ELSE 'sops'
  END;

  UPDATE public.pedidos
  SET estagio = p_para_estagio,
      area_atual = v_area_nova,
      proxima_acao = p_proxima_acao,
      triado_em = CASE
        WHEN p_para_estagio <> 'recebido' AND triado_em IS NULL THEN now()
        ELSE triado_em END,
      pre_faturado_em = CASE
        WHEN p_para_estagio = 'pre_faturado' THEN now()
        ELSE pre_faturado_em END,
      faturado_em = CASE
        WHEN p_para_estagio = 'faturado' THEN now()
        ELSE faturado_em END,
      entregue_em = CASE
        WHEN p_para_estagio = 'entregue' THEN now()
        ELSE entregue_em END
  WHERE id = p_pedido_id;

  INSERT INTO public.pedido_eventos (
    pedido_id, tipo_evento, estagio_anterior, estagio_novo,
    area_anterior, area_nova, descricao, operador_id, automatico
  ) VALUES (
    p_pedido_id, 'mudou_estagio', v_pedido.estagio, p_para_estagio,
    v_pedido.area_atual, v_area_nova, p_motivo, v_operador, false
  );

  RETURN json_build_object(
    'ok', true,
    'pedido_id', p_pedido_id,
    'estagio_anterior', v_pedido.estagio,
    'estagio_novo', p_para_estagio,
    'area_nova', v_area_nova
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_aplicar_regras_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só aplica se plano_contas_id está vazio (não sobrescreve classificação manual)
  IF NEW.plano_contas_id IS NULL THEN
    PERFORM aplicar_regras_categorizacao_stage(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_recalc_docs_status_anexo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM atualizar_docs_status(OLD.conta_pagar_id);   -- §3.5
    RETURN OLD;
  ELSE
    PERFORM atualizar_docs_status(NEW.conta_pagar_id);   -- §3.5
    RETURN NEW;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trg_recalc_docs_status_conta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só dispara se algum dos campos mudou (evita loop)
  IF (NEW.nf_pdf_url IS DISTINCT FROM OLD.nf_pdf_url)
     OR (NEW.nf_xml_url IS DISTINCT FROM OLD.nf_xml_url)
     OR (NEW.comprovante_url IS DISTINCT FROM OLD.comprovante_url) THEN
    NEW.docs_status := calcular_docs_status(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.trigger_compromissos_recorrentes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.usuario_pode(p_user_id uuid, p_permissao_slug text, p_acao text DEFAULT 'ver'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pode boolean := false;
BEGIN
  -- Super admin sempre pode
  IF has_role(p_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Permissão tipo TELA: só checa pode_ver (ignora ação)
  -- Permissão tipo FICHA/PROCESSO: checa coluna pode_<acao>
  SELECT EXISTS (
    SELECT 1
    FROM grupo_acesso_usuarios gau
    INNER JOIN grupo_acesso_permissoes gap ON gap.grupo_acesso_id = gau.grupo_acesso_id
    INNER JOIN permissoes_catalogo p ON p.id = gap.permissao_id
    WHERE gau.user_id = p_user_id
      AND gau.inativado_em IS NULL
      AND p.slug = p_permissao_slug
      AND p.ativo = true
      AND CASE
        WHEN p_acao = 'ver' THEN gap.pode_ver
        WHEN p_acao = 'criar' THEN gap.pode_criar
        WHEN p_acao = 'editar' THEN gap.pode_editar
        WHEN p_acao = 'apagar' THEN gap.pode_apagar
        ELSE false
      END
  ) INTO v_pode;

  RETURN v_pode;
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_conciliacao(p_planilha_id uuid, p_movimentacao_id uuid, p_ofx_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pl_mov_atual UUID;
  v_mov_pg_em    DATE;
  v_mov_cpr_id   UUID;
  v_mov_vinc     UUID;
  v_ofx_status   TEXT;
  v_ofx_conta_id UUID;
  v_ofx_data     DATE;
  v_ofx_valor    NUMERIC;
  v_pl_valor     NUMERIC;
  v_stages       INT := 0;
BEGIN
  SELECT movimentacao_id INTO v_pl_mov_atual
  FROM public.itau_pagamentos_stage WHERE id = p_planilha_id;

  IF v_pl_mov_atual IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Planilha já vinculada');
  END IF;

  SELECT pg_em, conta_pagar_id INTO v_mov_pg_em, v_mov_cpr_id
  FROM public.movimentacoes_bancarias WHERE id = p_movimentacao_id;

  IF v_mov_pg_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Movimentação já conciliada');
  END IF;

  SELECT id INTO v_mov_vinc
  FROM public.itau_pagamentos_stage
  WHERE movimentacao_id = p_movimentacao_id AND id <> p_planilha_id LIMIT 1;

  IF v_mov_vinc IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Movimentação já vinculada a outra planilha');
  END IF;

  -- Stage 1
  UPDATE public.itau_pagamentos_stage
  SET movimentacao_id    = p_movimentacao_id,
      conta_pagar_id     = COALESCE(conta_pagar_id, v_mov_cpr_id),
      status_conciliacao = CASE WHEN p_ofx_id IS NOT NULL THEN 'conciliado' ELSE 'aguardando_ofx' END
  WHERE id = p_planilha_id;

  UPDATE public.movimentacoes_bancarias
  SET itau_planilha_id = p_planilha_id
  WHERE id = p_movimentacao_id;

  v_stages := 1;

  IF p_ofx_id IS NOT NULL THEN
    SELECT status, conta_bancaria_id, data_transacao, ABS(valor)
    INTO v_ofx_status, v_ofx_conta_id, v_ofx_data, v_ofx_valor
    FROM public.ofx_transacoes_stage WHERE id = p_ofx_id;

    IF v_ofx_status <> 'pendente' THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente');
    END IF;

    -- Stage 2: preenche TODAS as movimentações vinculadas a esta planilha
    UPDATE public.itau_pagamentos_stage
    SET ofx_transacao_id = p_ofx_id WHERE id = p_planilha_id;

    UPDATE public.movimentacoes_bancarias
    SET pg_em             = v_ofx_data,
        conta_bancaria_id = v_ofx_conta_id,
        conciliado        = true,
        conciliado_em     = NOW(),
        ofx_transacao_id  = p_ofx_id
    WHERE itau_planilha_id = p_planilha_id;

    UPDATE public.ofx_transacoes_stage SET status = 'conciliado' WHERE id = p_ofx_id;

    v_stages := 2;
  END IF;

  RETURN jsonb_build_object('ok', true, 'stages_completados', v_stages);
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_documento_polimorfico(p_ged_documento_id uuid, p_entidade_tipo text, p_entidade_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_vinculo_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_entidade_tipo IS NULL OR p_entidade_id IS NULL THEN
    RAISE EXCEPTION 'entidade_tipo e entidade_id obrigatórios' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ged_documentos WHERE id = p_ged_documento_id) THEN
    RAISE EXCEPTION 'ged_documento % não encontrado', p_ged_documento_id
      USING ERRCODE = '02000';
  END IF;

  INSERT INTO public.ged_documento_vinculos
    (documento_id, entidade_tipo, entidade_id, observacao, criado_por)
  VALUES
    (p_ged_documento_id, p_entidade_tipo, p_entidade_id, p_observacao, v_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_vinculo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'vinculo_id', v_vinculo_id,
    'documento_id', p_ged_documento_id,
    'entidade_tipo', p_entidade_tipo,
    'entidade_id', p_entidade_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_lote_conciliacao(p_planilha_ids uuid[], p_movimentacao_ids uuid[], p_ofx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n              INT;
  v_ofx_status     TEXT;
  v_ofx_conta_id   UUID;
  v_ofx_data       DATE;
  v_ofx_valor      NUMERIC;
  v_soma_planilhas NUMERIC;
  v_qtd_validas    INT;
  i                INT;
  v_pl_id          UUID;
  v_mov_id         UUID;
  v_mov_cpr_id     UUID;
BEGIN
  v_n := COALESCE(array_length(p_planilha_ids, 1), 0);

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhuma planilha enviada');
  END IF;

  IF array_length(p_movimentacao_ids, 1) <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Arrays planilhas e movimentações com tamanhos diferentes');
  END IF;

  -- Guard OFX
  SELECT status, conta_bancaria_id, data_transacao, ABS(valor)
  INTO v_ofx_status, v_ofx_conta_id, v_ofx_data, v_ofx_valor
  FROM public.ofx_transacoes_stage WHERE id = p_ofx_id;

  IF v_ofx_conta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não encontrado');
  END IF;

  IF v_ofx_status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente');
  END IF;

  -- Guard planilhas elegíveis + soma
  SELECT COUNT(*), COALESCE(SUM(valor_pago), 0)
  INTO v_qtd_validas, v_soma_planilhas
  FROM public.itau_pagamentos_stage
  WHERE id = ANY(p_planilha_ids)
    AND movimentacao_id IS NULL
    AND ofx_transacao_id IS NULL;

  IF v_qtd_validas <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      'Planilhas inelegíveis: enviadas=' || v_n || ', válidas=' || v_qtd_validas);
  END IF;

  IF v_soma_planilhas <> v_ofx_valor THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      'Soma planilhas (' || v_soma_planilhas || ') ≠ valor OFX (' || v_ofx_valor || ')');
  END IF;

  -- STEPS: processa cada par (planilha_i, movimentacao_i)
  FOR i IN 1..v_n LOOP
    v_pl_id  := p_planilha_ids[i];
    v_mov_id := p_movimentacao_ids[i];

    SELECT conta_pagar_id INTO v_mov_cpr_id
    FROM public.movimentacoes_bancarias WHERE id = v_mov_id;

    -- Stage 1
    UPDATE public.itau_pagamentos_stage
    SET movimentacao_id    = v_mov_id,
        conta_pagar_id     = COALESCE(conta_pagar_id, v_mov_cpr_id),
        ofx_transacao_id   = p_ofx_id,
        status_conciliacao = 'conciliado'
    WHERE id = v_pl_id;

    -- Stage 2: movimentação recebe pg_em + conta
    UPDATE public.movimentacoes_bancarias
    SET pg_em             = v_ofx_data,
        conta_bancaria_id = v_ofx_conta_id,
        conciliado        = true,
        conciliado_em     = NOW(),
        ofx_transacao_id  = p_ofx_id
    WHERE id = v_mov_id;
  END LOOP;

  -- OFX conciliado (uma vez)
  UPDATE public.ofx_transacoes_stage SET status = 'conciliado' WHERE id = p_ofx_id;

  RETURN jsonb_build_object(
    'ok',                 true,
    'planilhas_vinculadas', v_n,
    'pg_em_aplicado',     v_ofx_data,
    'conta_aplicada',     v_ofx_conta_id
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_nf_a_parceiro(p_nf_stage_id uuid, p_parceiro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nf RECORD;
  v_parceiro_antes RECORD;
  v_mudancas JSONB := '[]'::jsonb;
  v_cascata_count INTEGER := 0;
  v_nome_antes TEXT;
  v_cnpj_antes TEXT;
BEGIN
  -- Carrega NF do Stage
  SELECT * INTO v_nf FROM nfs_stage WHERE id = p_nf_stage_id;
  IF v_nf.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'NF não encontrada');
  END IF;

  -- Carrega parceiro
  SELECT * INTO v_parceiro_antes FROM parceiros_comerciais WHERE id = p_parceiro_id;
  IF v_parceiro_antes.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Parceiro não encontrado');
  END IF;

  v_nome_antes := v_parceiro_antes.razao_social;
  v_cnpj_antes := v_parceiro_antes.cnpj;

  -- =====================================================
  -- 1) Atualiza parceiro com dados da NF (DOUTRINA: Stage absoluto)
  -- =====================================================

  -- Razão social: NF vence se diferente
  IF v_nf.fornecedor_razao_social IS NOT NULL
     AND length(trim(v_nf.fornecedor_razao_social)) > 0
     AND v_parceiro_antes.razao_social <> v_nf.fornecedor_razao_social THEN
    UPDATE parceiros_comerciais
    SET razao_social = v_nf.fornecedor_razao_social,
        updated_at = now()
    WHERE id = p_parceiro_id;

    v_mudancas := v_mudancas || jsonb_build_object(
      'campo', 'razao_social',
      'antes', v_nome_antes,
      'depois', v_nf.fornecedor_razao_social
    );
  END IF;

  -- CNPJ: NF vence se NF tem e parceiro está NULL ou diferente
  IF v_nf.fornecedor_cnpj IS NOT NULL
     AND length(trim(v_nf.fornecedor_cnpj)) > 0
     AND (v_parceiro_antes.cnpj IS NULL OR v_parceiro_antes.cnpj <> v_nf.fornecedor_cnpj) THEN
    UPDATE parceiros_comerciais
    SET cnpj = v_nf.fornecedor_cnpj,
        updated_at = now()
    WHERE id = p_parceiro_id;

    v_mudancas := v_mudancas || jsonb_build_object(
      'campo', 'cnpj',
      'antes', v_cnpj_antes,
      'depois', v_nf.fornecedor_cnpj
    );
  END IF;

  -- =====================================================
  -- 2) Vincula a NF ao parceiro (parceiro_id na NF do Stage)
  -- =====================================================
  UPDATE nfs_stage
  SET parceiro_id = p_parceiro_id,
      updated_at = now()
  WHERE id = p_nf_stage_id
    AND (parceiro_id IS NULL OR parceiro_id <> p_parceiro_id);

  -- =====================================================
  -- 3) CASCATA: outras NFs com mesmo fornecedor_razao_social
  --    sem parceiro_id ganham o vínculo automaticamente
  -- =====================================================
  IF v_nf.fornecedor_razao_social IS NOT NULL THEN
    WITH atualizacao AS (
      UPDATE nfs_stage
      SET parceiro_id = p_parceiro_id,
          updated_at = now()
      WHERE id <> p_nf_stage_id
        AND parceiro_id IS NULL
        AND fornecedor_razao_social = v_nf.fornecedor_razao_social
        AND status NOT IN ('descartada', 'duplicata')
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cascata_count FROM atualizacao;
  END IF;

  -- =====================================================
  -- Retorno
  -- =====================================================
  RETURN jsonb_build_object(
    'ok', true,
    'nf_vinculada', p_nf_stage_id,
    'parceiro_id', p_parceiro_id,
    'mudancas_parceiro', v_mudancas,
    'cascata_outras_nfs', v_cascata_count,
    'parceiro_nome_atual', COALESCE(v_nf.fornecedor_razao_social, v_parceiro_antes.razao_social)
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_planilha_fatura(p_planilha_id uuid, p_fatura_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pl_valor        NUMERIC;
  v_pl_status       TEXT;
  v_fatura_valor    NUMERIC;
  v_ja_vinculada    BOOLEAN;
  v_soma_vinculada  NUMERIC;
  v_novo_status     TEXT;
BEGIN
  SELECT valor_pago, status_conciliacao INTO v_pl_valor, v_pl_status
  FROM public.itau_pagamentos_stage WHERE id = p_planilha_id;

  IF v_pl_valor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Planilha não encontrada');
  END IF;

  IF v_pl_status = 'conciliado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Planilha já totalmente conciliada');
  END IF;

  SELECT COALESCE(SUM(ABS(cpr.valor)), 0) INTO v_fatura_valor
  FROM public.fatura_cartao_lancamentos fcl
  JOIN public.contas_pagar_receber cpr ON cpr.id = fcl.conta_pagar_id
  WHERE fcl.fatura_id = p_fatura_id;

  IF v_fatura_valor = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Fatura sem lançamentos');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.planilha_fatura_vinculo
    WHERE planilha_id = p_planilha_id AND fatura_id = p_fatura_id
  ) INTO v_ja_vinculada;

  IF v_ja_vinculada THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Fatura já vinculada a esta planilha');
  END IF;

  SELECT COALESCE(SUM(valor_vinculado), 0) INTO v_soma_vinculada
  FROM public.planilha_fatura_vinculo WHERE planilha_id = p_planilha_id;

  IF v_soma_vinculada + v_fatura_valor > v_pl_valor THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      'Soma excederia o valor da planilha (' || (v_soma_vinculada + v_fatura_valor) || ' > ' || v_pl_valor || ')');
  END IF;

  INSERT INTO public.planilha_fatura_vinculo (planilha_id, fatura_id, valor_vinculado)
  VALUES (p_planilha_id, p_fatura_id, v_fatura_valor);

  v_soma_vinculada := v_soma_vinculada + v_fatura_valor;
  v_novo_status := CASE WHEN v_soma_vinculada = v_pl_valor THEN 'conciliado' ELSE 'parcialmente_conciliado' END;

  UPDATE public.itau_pagamentos_stage SET status_conciliacao = v_novo_status WHERE id = p_planilha_id;

  RETURN jsonb_build_object('ok', true, 'status_novo', v_novo_status,
    'vinculado', v_fatura_valor, 'total_vinculado', v_soma_vinculada, 'faltam', v_pl_valor - v_soma_vinculada);
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_planilha_multiplas_movs(p_planilha_id uuid, p_movimentacao_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pl_valor    NUMERIC;
  v_soma_movs   NUMERIC;
  v_n           INT;
  v_novo_status TEXT;
BEGIN
  SELECT valor_pago INTO v_pl_valor
  FROM public.itau_pagamentos_stage WHERE id = p_planilha_id;

  IF v_pl_valor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Planilha não encontrada');
  END IF;

  v_n := COALESCE(array_length(p_movimentacao_ids, 1), 0);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhuma movimentação enviada');
  END IF;

  SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_movs
  FROM public.movimentacoes_bancarias
  WHERE id = ANY(p_movimentacao_ids) AND pg_em IS NULL;

  IF v_soma_movs > v_pl_valor THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      'Soma (' || v_soma_movs || ') excede planilha (' || v_pl_valor || ')');
  END IF;

  -- Vincula movimentações à planilha
  UPDATE public.movimentacoes_bancarias
  SET itau_planilha_id = p_planilha_id
  WHERE id = ANY(p_movimentacao_ids);

  -- Status: parcial ou conciliado
  v_novo_status := CASE
    WHEN v_soma_movs = v_pl_valor THEN 'conciliado'
    ELSE 'parcialmente_conciliado'
  END;

  UPDATE public.itau_pagamentos_stage
  SET movimentacao_id    = p_movimentacao_ids[1],
      status_conciliacao = v_novo_status
  WHERE id = p_planilha_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status_novo', v_novo_status,
    'vinculadas', v_n,
    'total_vinculado', v_soma_movs,
    'faltam', v_pl_valor - v_soma_movs
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.vincular_stage_2(p_ofx_id uuid, p_planilha_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ofx_valor_abs NUMERIC;
  v_ofx_conta_id UUID;
  v_ofx_status TEXT;
  v_ofx_data DATE;
  v_qtd_pl_validas INTEGER;
  v_qtd_pl_enviadas INTEGER;
  v_soma_planilhas NUMERIC;
  v_qtd_movs_invalidas INTEGER;
  v_movs_atualizadas INTEGER;
BEGIN
  v_qtd_pl_enviadas := COALESCE(array_length(p_planilha_ids, 1), 0);

  IF v_qtd_pl_enviadas = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Nenhuma planilha enviada');
  END IF;

  SELECT ABS(valor), conta_bancaria_id, status, data_transacao
  INTO v_ofx_valor_abs, v_ofx_conta_id, v_ofx_status, v_ofx_data
  FROM public.ofx_transacoes_stage WHERE id = p_ofx_id;

  IF v_ofx_conta_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não encontrado');
  END IF;

  IF v_ofx_status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'OFX não está pendente');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(valor_pago), 0)
  INTO v_qtd_pl_validas, v_soma_planilhas
  FROM public.itau_pagamentos_stage
  WHERE id = ANY(p_planilha_ids)
    AND movimentacao_id IS NOT NULL
    AND ofx_transacao_id IS NULL;

  IF v_qtd_pl_validas <> v_qtd_pl_enviadas THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Uma ou mais planilhas não elegíveis');
  END IF;

  IF v_soma_planilhas <> v_ofx_valor_abs THEN
    RETURN jsonb_build_object('ok', false, 'motivo',
      'Soma das planilhas (' || v_soma_planilhas || ') não bate com OFX (' || v_ofx_valor_abs || ')');
  END IF;

  SELECT COUNT(*) INTO v_qtd_movs_invalidas
  FROM public.movimentacoes_bancarias m
  WHERE m.id IN (
    SELECT movimentacao_id FROM public.itau_pagamentos_stage WHERE id = ANY(p_planilha_ids)
  ) AND m.pg_em IS NOT NULL;

  IF v_qtd_movs_invalidas > 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Movimentação já conciliada');
  END IF;

  -- STEP 1: planilhas vinculadas ao OFX
  UPDATE public.itau_pagamentos_stage
  SET ofx_transacao_id = p_ofx_id, status_conciliacao = 'conciliado'
  WHERE id = ANY(p_planilha_ids);

  -- STEP 2: OFX conciliado
  UPDATE public.ofx_transacoes_stage SET status = 'conciliado' WHERE id = p_ofx_id;

  -- STEP 3: movimentações ganham pg_em + conta_bancaria_id do OFX
  UPDATE public.movimentacoes_bancarias
  SET pg_em = v_ofx_data,
      conta_bancaria_id = v_ofx_conta_id,
      conciliado = true,
      conciliado_em = NOW(),
      ofx_transacao_id = p_ofx_id
  WHERE id IN (
    SELECT movimentacao_id FROM public.itau_pagamentos_stage
    WHERE id = ANY(p_planilha_ids)
  );

  GET DIAGNOSTICS v_movs_atualizadas = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'movs_atualizadas', v_movs_atualizadas,
    'pg_em_aplicado', v_ofx_data,
    'conta_bancaria_id_aplicado', v_ofx_conta_id
  );
END;
$function$;

-- ========================= VIEWS (13) =========================
CREATE OR REPLACE VIEW public.contas_pagar AS 
 SELECT cpr.id,
    cpr.tipo,
    cpr.descricao,
    cpr.valor,
    cpr.data_vencimento,
    cpr.data_pagamento,
    cpr.valor_pago,
    cpr.status,
    cpr.plano_contas_id AS conta_id,
    cpr.centro_custo_id,
    cpr.unidade_id,
    cpr.canal_venda_id,
    cpr.fornecedor_cliente,
    cpr.fornecedor_id,
    cpr.parceiro_id,
    cpr.forma_pagamento_id,
    cpr.meio_pagamento_id,
    mp.codigo = 'fatura_cartao'::text AS eh_cartao,
    mp.codigo AS meio_codigo,
    cpr.origem,
    cpr.bling_id,
    cpr.aprovado_em,
    cpr.aprovado_por,
    cpr.enviado_pagamento_em,
    cpr.enviado_pagamento_por,
    cpr.email_pagamento_enviado,
    cpr.observacao_pagamento,
    cpr.dados_bancarios_fornecedor,
    cpr.dados_pagamento_fornecedor,
    cpr.categoria_sugerida_ia,
    cpr.categoria_confirmada,
    cpr.dados_enriquecidos_qive,
    cpr.nf_chave_acesso,
    cpr.nf_numero,
    cpr.nf_serie,
    cpr.nf_data_emissao,
    cpr.nf_cnpj_emitente,
    cpr.nf_natureza_operacao,
    cpr.nf_cfop,
    cpr.nf_ncm,
    cpr.nf_valor_produtos,
    cpr.nf_valor_impostos,
    cpr.nf_pdf_url,
    cpr.nf_xml_url,
    cpr.comprovante_url,
    cpr.docs_status,
    cpr.parcelas,
    cpr.parcela_atual,
    cpr.parcela_grupo_id,
    cpr.sla_aprovacao_dias,
    cpr.sla_pagamento_dias,
    cpr.tarefa_id,
    cpr.observacao,
    cpr.criado_por,
    cpr.created_at,
    cpr.updated_at,
    cpr.pago_em_conta_id,
    cpr.pago_em,
    cpr.pago_por,
    cpr.observacao_pagamento_manual,
    cpr.conciliado_em,
    cpr.conciliado_por,
    cpr.movimentacao_bancaria_id,
    cpr.compromisso_parcelado_id,
    cpr.numero_parcela,
    cpr.total_parcelas,
    cpr.compromisso_recorrente_id,
    cpr.tags,
    cpr.data_compra,
    cpr.editado_por,
    cpr.editado_em
   FROM contas_pagar_receber cpr
     JOIN meios_pagamento mp ON mp.id = cpr.meio_pagamento_id;
CREATE OR REPLACE VIEW public.contas_pagar_receber_ativas AS 
 SELECT cpr.id,
    cpr.tipo,
    cpr.descricao,
    cpr.valor,
    cpr.data_vencimento,
    cpr.data_pagamento,
    cpr.valor_pago,
    cpr.status,
    cpr.plano_contas_id AS conta_id,
    cpr.centro_custo_id,
    cpr.unidade_id,
    cpr.canal_venda_id,
    cpr.fornecedor_cliente,
    cpr.fornecedor_id,
    cpr.parceiro_id,
    cpr.forma_pagamento_id,
    cpr.meio_pagamento_id,
    mp.codigo = 'fatura_cartao'::text AS eh_cartao,
    mp.codigo AS meio_codigo,
    cpr.origem,
    cpr.bling_id,
    cpr.aprovado_em,
    cpr.aprovado_por,
    cpr.enviado_pagamento_em,
    cpr.enviado_pagamento_por,
    cpr.email_pagamento_enviado,
    cpr.observacao_pagamento,
    cpr.dados_bancarios_fornecedor,
    cpr.dados_pagamento_fornecedor,
    cpr.categoria_sugerida_ia,
    cpr.categoria_confirmada,
    cpr.dados_enriquecidos_qive,
    cpr.nf_chave_acesso,
    cpr.nf_numero,
    cpr.nf_serie,
    cpr.nf_data_emissao,
    cpr.nf_cnpj_emitente,
    cpr.nf_natureza_operacao,
    cpr.nf_cfop,
    cpr.nf_ncm,
    cpr.nf_valor_produtos,
    cpr.nf_valor_impostos,
    cpr.nf_pdf_url,
    cpr.nf_xml_url,
    cpr.comprovante_url,
    cpr.docs_status,
    cpr.parcelas,
    cpr.parcela_atual,
    cpr.parcela_grupo_id,
    cpr.sla_aprovacao_dias,
    cpr.sla_pagamento_dias,
    cpr.tarefa_id,
    cpr.observacao,
    cpr.criado_por,
    cpr.created_at,
    cpr.updated_at,
    cpr.pago_em_conta_id,
    cpr.pago_em,
    cpr.pago_por,
    cpr.observacao_pagamento_manual,
    cpr.conciliado_em,
    cpr.conciliado_por,
    cpr.movimentacao_bancaria_id,
    cpr.compromisso_parcelado_id,
    cpr.numero_parcela,
    cpr.total_parcelas,
    cpr.compromisso_recorrente_id,
    cpr.tags,
    cpr.data_compra,
    cpr.editado_por,
    cpr.editado_em,
    cpr.valor_original_item,
    cpr.tem_sugestao_nf,
    cpr.deleted_at,
    cpr.deleted_por
   FROM contas_pagar_receber cpr
     JOIN meios_pagamento mp ON mp.id = cpr.meio_pagamento_id
  WHERE cpr.deleted_at IS NULL;
CREATE OR REPLACE VIEW public.v_cpr_bola_redonda AS 
 WITH destinatario AS (
         SELECT cpr.id AS cpr_id,
            cpr.forma_pagamento_id,
            cpr.parceiro_id,
            cpr.reembolsa_user_id,
            cpr.plano_contas_id AS conta_id,
            cpr.centro_custo_id,
            cpr.pago_em_conta_id,
            cpr.valor,
            cpr.data_vencimento,
            fp.codigo AS forma_codigo,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.cpf
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.cnpj
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE COALESCE(pc.cnpj, pc.cpf)
                END AS cnpj_cpf,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.chave_pix
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.chave_pix
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE pc.pix_chave
                END AS pix_chave,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.banco_codigo
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.banco_codigo
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE pc.dados_bancarios ->> 'banco_codigo'::text
                END AS banco_codigo,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.agencia
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.agencia
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE pc.dados_bancarios ->> 'agencia'::text
                END AS agencia,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.conta
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.conta
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE pc.dados_bancarios ->> 'conta'::text
                END AS conta,
                CASE
                    WHEN cpr.reembolsa_user_id IS NOT NULL THEN COALESCE(( SELECT clt.tipo_conta
                       FROM colaboradores_clt clt
                      WHERE clt.user_id = cpr.reembolsa_user_id
                     LIMIT 1), ( SELECT pj.tipo_conta
                       FROM contratos_pj pj
                      WHERE pj.user_id = cpr.reembolsa_user_id
                     LIMIT 1))
                    ELSE pc.dados_bancarios ->> 'tipo_conta'::text
                END AS tipo_conta
           FROM contas_pagar_receber cpr
             LEFT JOIN formas_pagamento fp ON fp.id = cpr.forma_pagamento_id
             LEFT JOIN parceiros_comerciais pc ON pc.id = cpr.parceiro_id
        ), destinatario_ok AS (
         SELECT d_1.cpr_id,
            d_1.forma_pagamento_id,
            d_1.parceiro_id,
            d_1.reembolsa_user_id,
            d_1.conta_id,
            d_1.centro_custo_id,
            d_1.pago_em_conta_id,
            d_1.valor,
            d_1.data_vencimento,
            d_1.forma_codigo,
            d_1.cnpj_cpf,
            d_1.pix_chave,
            d_1.banco_codigo,
            d_1.agencia,
            d_1.conta,
            d_1.tipo_conta,
                CASE
                    WHEN d_1.forma_codigo IS NULL THEN false
                    WHEN d_1.forma_codigo = 'pix'::text THEN d_1.pix_chave IS NOT NULL AND d_1.pix_chave <> ''::text
                    WHEN d_1.forma_codigo = 'transferencia'::text THEN d_1.banco_codigo IS NOT NULL AND d_1.banco_codigo <> ''::text AND d_1.agencia IS NOT NULL AND d_1.agencia <> ''::text AND d_1.conta IS NOT NULL AND d_1.conta <> ''::text AND d_1.tipo_conta IS NOT NULL AND d_1.tipo_conta <> ''::text AND d_1.cnpj_cpf IS NOT NULL AND d_1.cnpj_cpf <> ''::text
                    WHEN d_1.forma_codigo = 'boleto'::text THEN d_1.cnpj_cpf IS NOT NULL AND d_1.cnpj_cpf <> ''::text
                    WHEN d_1.forma_codigo = ANY (ARRAY['cartao_credito'::text, 'cartao_debito'::text, 'dinheiro'::text, 'debito_automatico'::text, 'cheque'::text, 'sem_pagamento'::text, 'outro'::text]) THEN true
                    ELSE false
                END AS destinatario_completo,
            d_1.forma_codigo IS NOT NULL AND NOT (d_1.forma_codigo = ANY (ARRAY['cartao_credito'::text, 'sem_pagamento'::text, 'outro'::text])) AS exige_conta_origem
           FROM destinatario d_1
        )
 SELECT cpr_id,
    forma_codigo,
    conta_id IS NOT NULL AND centro_custo_id IS NOT NULL AND valor IS NOT NULL AND valor > 0::numeric AND data_vencimento IS NOT NULL AND destinatario_completo AND (NOT exige_conta_origem OR pago_em_conta_id IS NOT NULL) AS bola_redonda,
    array_remove(ARRAY[
        CASE
            WHEN conta_id IS NULL THEN 'categoria'::text
            ELSE NULL::text
        END,
        CASE
            WHEN centro_custo_id IS NULL THEN 'centro_custo'::text
            ELSE NULL::text
        END,
        CASE
            WHEN exige_conta_origem AND pago_em_conta_id IS NULL THEN 'conta_origem'::text
            ELSE NULL::text
        END,
        CASE
            WHEN valor IS NULL OR valor <= 0::numeric THEN 'valor'::text
            ELSE NULL::text
        END,
        CASE
            WHEN data_vencimento IS NULL THEN 'vencimento'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo IS NULL THEN 'forma_pagamento'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo = 'pix'::text AND (pix_chave IS NULL OR pix_chave = ''::text) THEN 'pix_chave'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo = 'transferencia'::text AND (banco_codigo IS NULL OR banco_codigo = ''::text) THEN 'banco_codigo'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo = 'transferencia'::text AND (agencia IS NULL OR agencia = ''::text) THEN 'agencia'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo = 'transferencia'::text AND (conta IS NULL OR conta = ''::text) THEN 'conta'::text
            ELSE NULL::text
        END,
        CASE
            WHEN forma_codigo = 'transferencia'::text AND (tipo_conta IS NULL OR tipo_conta = ''::text) THEN 'tipo_conta'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (forma_codigo = ANY (ARRAY['transferencia'::text, 'boleto'::text])) AND (cnpj_cpf IS NULL OR cnpj_cpf = ''::text) THEN 'cnpj_cpf'::text
            ELSE NULL::text
        END], NULL::text) AS o_que_falta
   FROM destinatario_ok d;
CREATE OR REPLACE VIEW public.v_pedidos_fila AS 
 SELECT p.id,
    p.id_externo,
    p.estagio,
        CASE
            WHEN p.estagio = 'recebido'::text THEN 'sistema'::text
            WHEN p.estagio = 'em_analise_credito'::text THEN 'credito'::text
            WHEN p.estagio = ANY (ARRAY['credito_aprovado'::text, 'pre_faturado'::text, 'recuperacao_venda'::text]) THEN 'sops'::text
            WHEN p.estagio = ANY (ARRAY['em_separacao'::text, 'faturado'::text, 'em_transporte'::text]) THEN 'bling'::text
            WHEN p.estagio = ANY (ARRAY['entregue'::text, 'cancelado'::text]) THEN 'nenhuma'::text
            ELSE 'nenhuma'::text
        END AS area_atual,
    COALESCE(p.proxima_acao,
        CASE p.estagio
            WHEN 'recebido'::text THEN 'Iniciar análise de crédito'::text
            WHEN 'em_analise_credito'::text THEN 'Aguardando decisão do Crédito'::text
            WHEN 'credito_aprovado'::text THEN 'Aguardando geração de títulos'::text
            WHEN 'pre_faturado'::text THEN 'Pronto pra enviar ao Bling'::text
            WHEN 'em_separacao'::text THEN 'Bling separando'::text
            WHEN 'faturado'::text THEN 'NF emitida'::text
            WHEN 'em_transporte'::text THEN 'Em entrega'::text
            ELSE NULL::text
        END) AS proxima_acao,
        CASE
            WHEN ac.condicao_final_aprovada IS NULL THEN NULL::text
            WHEN (ac.condicao_final_aprovada -> 'entrada'::text) IS NOT NULL AND (ac.condicao_final_aprovada -> 'entrada'::text) <> 'null'::jsonb AND (((ac.condicao_final_aprovada -> 'entrada'::text) ->> 'pct'::text)::numeric) >= 100::numeric THEN 'a_vista'::text
            ELSE 'a_prazo'::text
        END AS tipo_pagamento,
    p.recebido_via,
    p.origem,
    p.parceiro_id,
    pc.cnpj AS parceiro_cnpj,
    pc.razao_social AS parceiro_razao,
    pc.nivel_programa,
    pc.categoria_ka,
    pc.bandeira_vermelha,
    p.vendedor,
    p.data_pedido::text AS data_pedido,
    p.recebido_em::text AS recebido_em,
    p.valor_bruto,
    p.valor_liquido,
    p.condicao_solicitada,
    p.forma_solicitada,
    0::numeric AS prioridade_score,
    NULL::text AS prioridade_motivo,
    p.faturado_em::text AS faturado_em,
    p.cancelado_em::text AS cancelado_em,
    p.cancelado_motivo,
    EXTRACT(epoch FROM now() - p.recebido_em) / 60::numeric AS idade_minutos,
    false AS sla_estourado,
    ac.id AS analise_credito_id
   FROM pedidos p
     JOIN parceiros_comerciais pc ON pc.id = p.parceiro_id
     LEFT JOIN LATERAL ( SELECT analises_credito.id,
            analises_credito.condicao_final_aprovada,
            analises_credito.status_final,
            pc.created_at
           FROM analises_credito
          WHERE analises_credito.pedido_id = p.id
          ORDER BY pc.created_at DESC
         LIMIT 1) ac ON true;
CREATE OR REPLACE VIEW public.v_pedidos_pipeline AS 
 SELECT estagio,
    area_atual,
    count(*) AS qtd,
    count(*) FILTER (WHERE (estagio <> ALL (ARRAY['faturado'::text, 'entregue'::text, 'cancelado'::text])) AND (now() - recebido_em) > '24:00:00'::interval) AS qtd_sla_estourado,
    sum(valor_liquido) AS soma_valor
   FROM pedidos
  GROUP BY estagio, area_atual;
CREATE OR REPLACE VIEW public.vw_documentos_envio_estados AS 
 SELECT c.id AS conta_id,
    c.descricao,
    c.valor,
    c.data_vencimento,
    c.data_pagamento,
    c.status AS status_conta,
    c.nf_numero,
    c.nf_aplicavel,
    c.nf_aplicavel_motivo,
    c.parceiro_id,
    c.fornecedor_cliente,
    ns_principal.id AS nf_stage_id,
        CASE
            WHEN ri.remessa_id IS NOT NULL THEN 'enviado'::text
            WHEN c.nf_aplicavel = true AND NOT fn_tem_nf_anexada(c.id) THEN 'cobrar'::text
            ELSE 'pronto'::text
        END AS estado_envio,
    fn_tem_nf_anexada(c.id) AS tem_nf_anexada,
    ri.remessa_id AS ultima_remessa_id,
    r.enviada_em AS ultima_remessa_em,
        CASE
            WHEN c.status = 'cancelado'::text AND ri.remessa_id IS NOT NULL THEN true
            ELSE false
        END AS cancelada_apos_envio,
        CASE
            WHEN fn_tem_nf_anexada(c.id) AND c.nf_aplicavel = true THEN 'ok'::text
            WHEN c.nf_aplicavel = false THEN 'ok'::text
            ELSE 'pendente'::text
        END AS docs_status,
    GREATEST(0, CURRENT_DATE - COALESCE(c.data_pagamento, c.created_at::date)) AS dias_aguardando,
    COALESCE(pc.razao_social, c.fornecedor_cliente) AS parceiro_razao_social,
    pc.cnpj AS parceiro_cnpj,
    pc.nome_fantasia AS parceiro_nome_fantasia
   FROM contas_pagar_receber c
     LEFT JOIN LATERAL ( SELECT nfs_stage.id
           FROM nfs_stage
          WHERE nfs_stage.conta_pagar_id = c.id AND nfs_stage.status <> 'descartada'::text
          ORDER BY nfs_stage.nf_data_emissao DESC NULLS LAST, nfs_stage.id
         LIMIT 1) ns_principal ON true
     LEFT JOIN remessas_contador_itens ri ON ri.conta_id = c.id
     LEFT JOIN remessas_contador r ON r.id = ri.remessa_id
     LEFT JOIN parceiros_comerciais pc ON pc.id = c.parceiro_id
  WHERE c.status = ANY (ARRAY['paga'::text, 'aguardando_pagamento'::text]);
CREATE OR REPLACE VIEW public.vw_exposicao_por_grupo AS 
 SELECT ge.id AS grupo_id,
    ge.nome AS grupo_nome,
    ge.tipo_controle,
    ge.ativo AS grupo_ativo,
    count(DISTINCT pc.id) FILTER (WHERE pc.ativo = true) AS qtd_parceiros_ativos,
    count(DISTINCT pc.id) AS qtd_parceiros_total,
    count(DISTINCT cpr.id) FILTER (WHERE cpr.created_at >= (now() - '1 year'::interval)) AS qtd_contas_12m,
    COALESCE(sum(cpr.valor) FILTER (WHERE cpr.created_at >= (now() - '1 year'::interval) AND cpr.tipo = 'pagar'::text), 0::numeric) AS total_pagar_12m,
    COALESCE(sum(cpr.valor) FILTER (WHERE cpr.created_at >= (now() - '1 year'::interval) AND cpr.tipo = 'receber'::text), 0::numeric) AS total_receber_12m
   FROM grupos_empresariais ge
     LEFT JOIN parceiros_comerciais pc ON pc.grupo_id = ge.id
     LEFT JOIN contas_pagar_receber cpr ON cpr.parceiro_id = pc.id
  GROUP BY ge.id, ge.nome, ge.tipo_controle, ge.ativo;
CREATE OR REPLACE VIEW public.vw_faturas_cartao_resumo AS 
 SELECT f.id,
    f.cartao_id,
    f.data_vencimento,
    f.data_emissao,
    f.periodo_inicio,
    f.periodo_fim,
    f.valor_total,
    f.status,
    f.observacao,
    f.created_at,
    f.numero_documento,
    f.fonte_importacao,
    f.pdf_storage_path,
    f.pdf_nome_original,
    count(l.id) AS qtd_lancamentos,
    sum(
        CASE
            WHEN l.status = ANY (ARRAY['conciliado'::text, 'virou_despesa'::text]) THEN l.valor
            ELSE 0::numeric
        END) AS valor_conciliado,
    count(*) FILTER (WHERE l.status = ANY (ARRAY['conciliado'::text, 'virou_despesa'::text])) AS qtd_conciliados,
    sum(
        CASE
            WHEN l.status = 'pendente'::text THEN l.valor
            ELSE 0::numeric
        END) AS valor_pendente,
    count(*) FILTER (WHERE l.status = 'pendente'::text) AS qtd_pendentes,
    sum(
        CASE
            WHEN l.status = 'ignorado'::text THEN l.valor
            ELSE 0::numeric
        END) AS valor_ignorado,
    count(*) FILTER (WHERE l.status = 'ignorado'::text) AS qtd_ignorados
   FROM faturas_cartao f
     LEFT JOIN fatura_cartao_lancamentos l ON l.fatura_id = f.id
  GROUP BY f.id;
CREATE OR REPLACE VIEW public.vw_fluxo_caixa_futuro AS 
 SELECT date_trunc('month'::text, data_vencimento::timestamp with time zone)::date AS mes_referencia,
    count(*) AS qtd_parcelas,
    sum(valor) AS valor_total,
    count(DISTINCT compromisso_parcelado_id) AS qtd_compromissos
   FROM contas_pagar_receber cpr
  WHERE status = 'previsto'::text AND compromisso_parcelado_id IS NOT NULL AND data_vencimento >= CURRENT_DATE
  GROUP BY (date_trunc('month'::text, data_vencimento::timestamp with time zone))
  ORDER BY (date_trunc('month'::text, data_vencimento::timestamp with time zone)::date);
CREATE OR REPLACE VIEW public.vw_ged_documentos_soltos AS 
 SELECT count(*) AS total,
    COALESCE(sum(tamanho_bytes), 0::numeric) AS tamanho_total_bytes
   FROM ged_documentos
  WHERE pasta_id IS NULL;
CREATE OR REPLACE VIEW public.vw_pastas_kpis AS 
 SELECT p.id,
    p.nome,
    p.descricao,
    p.parceiro_id,
    p.tipo,
    p.area,
    p.responsavel_id,
    p.status,
    p.cor,
    p.ativa,
    p.created_at,
    p.updated_at,
    par.razao_social AS parceiro_nome,
    COALESCE(d_agg.total_documentos, 0::bigint) AS total_documentos,
    COALESCE(d_agg.tamanho_total_bytes, 0::numeric) AS tamanho_total_bytes,
    d_agg.ultimo_upload,
    COALESCE(c_agg.total_contratos, 0::bigint) AS total_contratos,
    COALESCE(c_agg.contratos_vigentes, 0::bigint) AS contratos_vigentes,
    COALESCE(c_agg.valor_mensal_estimado, 0::numeric) AS valor_mensal_estimado,
    c_agg.proximo_vencimento_contrato,
    p.parent_id
   FROM ged_pastas p
     LEFT JOIN parceiros_comerciais par ON par.id = p.parceiro_id
     LEFT JOIN ( SELECT ged_documentos.pasta_id,
            count(*) AS total_documentos,
            sum(ged_documentos.tamanho_bytes) AS tamanho_total_bytes,
            max(ged_documentos.created_at) AS ultimo_upload
           FROM ged_documentos
          WHERE ged_documentos.pasta_id IS NOT NULL
          GROUP BY ged_documentos.pasta_id) d_agg ON d_agg.pasta_id = p.id
     LEFT JOIN ( SELECT pasta_contratos.pasta_id,
            count(*) AS total_contratos,
            count(*) FILTER (WHERE pasta_contratos.status = 'vigente'::text) AS contratos_vigentes,
            sum(
                CASE
                    WHEN pasta_contratos.status <> 'vigente'::text THEN 0::numeric
                    WHEN pasta_contratos.ciclo_pagamento = 'mensal'::text THEN pasta_contratos.valor_parcela
                    WHEN pasta_contratos.ciclo_pagamento = 'trimestral'::text THEN pasta_contratos.valor_parcela / 3::numeric
                    WHEN pasta_contratos.ciclo_pagamento = 'anual'::text THEN pasta_contratos.valor_parcela / 12::numeric
                    WHEN pasta_contratos.ciclo_pagamento = 'parcelado'::text THEN
                    CASE
                        WHEN pasta_contratos.vigencia_fim IS NOT NULL AND pasta_contratos.vigencia_fim > pasta_contratos.vigencia_inicio THEN pasta_contratos.valor_total / GREATEST(1::numeric, round((pasta_contratos.vigencia_fim - pasta_contratos.vigencia_inicio)::numeric / 30.4))
                        ELSE pasta_contratos.valor_parcela
                    END
                    WHEN pasta_contratos.ciclo_pagamento = 'unico'::text THEN
                    CASE
                        WHEN pasta_contratos.vigencia_fim IS NOT NULL AND pasta_contratos.vigencia_fim > pasta_contratos.vigencia_inicio THEN pasta_contratos.valor_total / GREATEST(1::numeric, round((pasta_contratos.vigencia_fim - pasta_contratos.vigencia_inicio)::numeric / 30.4))
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END) AS valor_mensal_estimado,
            min(pasta_contratos.vigencia_fim) FILTER (WHERE pasta_contratos.status = 'vigente'::text AND pasta_contratos.vigencia_fim IS NOT NULL) AS proximo_vencimento_contrato
           FROM pasta_contratos
          GROUP BY pasta_contratos.pasta_id) c_agg ON c_agg.pasta_id = p.id
  WHERE p.ativa = true;
CREATE OR REPLACE VIEW public.vw_ged_pastas_kpis AS 
 SELECT id,
    nome,
    descricao,
    parceiro_id,
    tipo,
    area,
    responsavel_id,
    status,
    cor,
    ativa,
    created_at,
    updated_at,
    parceiro_nome,
    total_documentos,
    tamanho_total_bytes,
    ultimo_upload,
    total_contratos,
    contratos_vigentes,
    valor_mensal_estimado,
    proximo_vencimento_contrato,
    parent_id
   FROM vw_pastas_kpis;
CREATE OR REPLACE VIEW public.vw_lancamentos_caixa_banco AS 
 SELECT m.id,
    COALESCE(cpr.descricao, m.descricao) AS descricao,
    abs(m.valor)::numeric(15,2) AS valor,
    cpr.data_vencimento,
    cpr.data_pagamento,
    m.pg_em AS pago_em,
    m.data_transacao AS data_enviada_para_pagamento,
    m.conta_bancaria_id AS pago_em_conta_id,
    cb.nome_exibicao AS conta_bancaria_nome,
    m.conciliado_em,
    m.conciliado_por,
    m.id AS movimentacao_bancaria_id,
    cpr.id AS conta_pagar_id,
    m.created_at,
    COALESCE(cpr.status, 'enviado_para_pagamento'::text) AS status_conta_pagar,
    m.tipo,
    cpr.unidade_id,
    NULL::text AS observacao_pagamento_manual,
    COALESCE(cpr.fornecedor_cliente, m.descricao) AS fornecedor_cliente,
    cpr.parceiro_id,
    cpr.forma_pagamento_id,
    cpr.meio_pagamento_id,
    COALESCE(m.plano_contas_id, cpr.plano_contas_id) AS plano_contas_id,
    cpr.nf_numero,
        CASE
            WHEN m.pg_em IS NOT NULL OR m.conciliado THEN 'conciliado'::text
            ELSE 'pago'::text
        END AS status_caixa,
        CASE
            WHEN cpr.id IS NOT NULL THEN 'conta_pagar'::text
            ELSE 'movimentacao_avulsa'::text
        END AS origem_view,
    COALESCE(cpr.origem = 'cartao'::text, false) AS vinculada_cartao,
    ( SELECT fc.data_vencimento::text AS data_vencimento
           FROM fatura_cartao_lancamentos fcl
             JOIN faturas_cartao fc ON fc.id = fcl.fatura_id
          WHERE fcl.conta_pagar_id = cpr.id
         LIMIT 1) AS fatura_vencimento,
    ( SELECT fcl.fatura_id
           FROM fatura_cartao_lancamentos fcl
          WHERE fcl.conta_pagar_id = cpr.id
         LIMIT 1) AS fatura_id,
    COALESCE(m.cartao_id, cpr.cartao_id) AS cartao_id,
        CASE
            WHEN cc.id IS NOT NULL THEN cc.nome || COALESCE(' ····'::text || cc.ultimos_digitos, ''::text)
            ELSE NULL::text
        END AS cartao_nome
   FROM movimentacoes_bancarias m
     LEFT JOIN contas_pagar_receber cpr ON cpr.id = m.conta_pagar_id
     LEFT JOIN contas_bancarias cb ON cb.id = m.conta_bancaria_id
     LEFT JOIN cartoes_credito cc ON cc.id = COALESCE(m.cartao_id, cpr.cartao_id)
  WHERE m.itau_planilha_id IS NULL OR m.conta_pagar_id IS NOT NULL
UNION ALL
 SELECT cpr.id,
    cpr.descricao,
    cpr.valor,
    cpr.data_vencimento,
    cpr.data_pagamento,
    pag_fat.data_pagamento AS pago_em,
    cpr.enviado_pagamento_em::date AS data_enviada_para_pagamento,
    COALESCE(pag_fat.conta_bancaria_id, cpr.pago_em_conta_id) AS pago_em_conta_id,
    COALESCE(pag_fat.conta_bancaria_nome, cb2.nome_exibicao) AS conta_bancaria_nome,
    cpr.conciliado_em,
    NULL::uuid AS conciliado_por,
    cpr.movimentacao_bancaria_id,
    cpr.id AS conta_pagar_id,
    cpr.created_at,
    cpr.status AS status_conta_pagar,
    cpr.tipo,
    cpr.unidade_id,
    NULL::text AS observacao_pagamento_manual,
    cpr.fornecedor_cliente,
    cpr.parceiro_id,
    cpr.forma_pagamento_id,
    cpr.meio_pagamento_id,
    cpr.plano_contas_id,
    cpr.nf_numero,
        CASE
            WHEN pag_fat.planilha_id IS NOT NULL THEN 'conciliado'::text
            ELSE 'em_aberto'::text
        END AS status_caixa,
    'conta_pagar'::text AS origem_view,
    cpr.origem = 'cartao'::text AS vinculada_cartao,
    ( SELECT fc.data_vencimento::text AS data_vencimento
           FROM fatura_cartao_lancamentos fcl
             JOIN faturas_cartao fc ON fc.id = fcl.fatura_id
          WHERE fcl.conta_pagar_id = cpr.id
         LIMIT 1) AS fatura_vencimento,
    ( SELECT fcl.fatura_id
           FROM fatura_cartao_lancamentos fcl
          WHERE fcl.conta_pagar_id = cpr.id
         LIMIT 1) AS fatura_id,
    cpr.cartao_id,
        CASE
            WHEN cc2.id IS NOT NULL THEN cc2.nome || COALESCE(' ····'::text || cc2.ultimos_digitos, ''::text)
            ELSE NULL::text
        END AS cartao_nome
   FROM contas_pagar_receber cpr
     LEFT JOIN contas_bancarias cb2 ON cb2.id = cpr.pago_em_conta_id
     LEFT JOIN cartoes_credito cc2 ON cc2.id = cpr.cartao_id
     LEFT JOIN LATERAL ( SELECT ps.id AS planilha_id,
            ps.data_pagamento,
            ps.conta_bancaria_id,
            cb_fat.nome_exibicao AS conta_bancaria_nome
           FROM planilha_fatura_vinculo pfv
             JOIN fatura_cartao_lancamentos fcl ON fcl.fatura_id = pfv.fatura_id
             JOIN itau_pagamentos_stage ps ON ps.id = pfv.planilha_id
             LEFT JOIN contas_bancarias cb_fat ON cb_fat.id = ps.conta_bancaria_id
          WHERE fcl.conta_pagar_id = cpr.id AND ps.status_conciliacao = 'conciliado'::text
          ORDER BY ps.data_pagamento DESC NULLS LAST
         LIMIT 1) pag_fat ON true
  WHERE cpr.status <> 'cancelado'::text AND cpr.deleted_at IS NULL AND cpr.movimentacao_bancaria_id IS NULL;

-- ========================= CONSTRAINTS (366) =========================
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_analise_anterior_id_fkey;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_analise_anterior_id_fkey FOREIGN KEY (analise_anterior_id) REFERENCES analises_credito(id);
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_decidido_por_fkey;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES auth.users(id);
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_estagio_atual_check;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_estagio_atual_check CHECK ((estagio_atual = ANY (ARRAY['entrada'::text, 'analise'::text, 'decisao'::text])));
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_parceiro_id_fkey;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_pedido_id_fkey;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_perfil_aplicado_check;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_perfil_aplicado_check CHECK (((perfil_aplicado IS NULL) OR (perfil_aplicado = ANY (ARRAY['novo_entrada'::text, 'novo_qualificado'::text, 'recorrente_bom_pagador'::text, 'premium'::text, 'bandeira_vermelha'::text]))));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='analises_credito_pkey' AND conrelid='public.analises_credito'::regclass) THEN
    ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_pre_aprovado_regra_id_fkey;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_pre_aprovado_regra_id_fkey FOREIGN KEY (pre_aprovado_regra_id) REFERENCES regras_cadencia_credito(id) ON DELETE SET NULL;
ALTER TABLE public.analises_credito DROP CONSTRAINT IF EXISTS analises_credito_status_final_check;
ALTER TABLE public.analises_credito ADD CONSTRAINT analises_credito_status_final_check CHECK (((status_final IS NULL) OR (status_final = ANY (ARRAY['aprovado'::text, 'aprovado_com_ressalva'::text, 'reprovado'::text, 'cancelado'::text]))));
ALTER TABLE public.bling_envios_log DROP CONSTRAINT IF EXISTS bling_envios_log_enviado_por_fkey;
ALTER TABLE public.bling_envios_log ADD CONSTRAINT bling_envios_log_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES auth.users(id);
ALTER TABLE public.bling_envios_log DROP CONSTRAINT IF EXISTS bling_envios_log_pedido_id_fkey;
ALTER TABLE public.bling_envios_log ADD CONSTRAINT bling_envios_log_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bling_envios_log_pkey' AND conrelid='public.bling_envios_log'::regclass) THEN
    ALTER TABLE public.bling_envios_log ADD CONSTRAINT bling_envios_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_ancorado_por_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_ancorado_por_fkey FOREIGN KEY (ancorado_por) REFERENCES auth.users(id);
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_contas_pagar_receber_id_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_contas_pagar_receber_id_fkey FOREIGN KEY (contas_pagar_receber_id) REFERENCES contas_pagar_receber(id) ON DELETE SET NULL;
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_criado_por_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_ged_documento_id_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_ged_documento_id_fkey FOREIGN KEY (ged_documento_id) REFERENCES ged_documentos(id) ON DELETE CASCADE;
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_parceiro_id_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE SET NULL;
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_pasta_contrato_id_fkey;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_pasta_contrato_id_fkey FOREIGN KEY (pasta_contrato_id) REFERENCES pasta_contratos(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='boleto_stage_pkey' AND conrelid='public.boleto_stage'::regclass) THEN
    ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.boleto_stage DROP CONSTRAINT IF EXISTS boleto_stage_status_check;
ALTER TABLE public.boleto_stage ADD CONSTRAINT boleto_stage_status_check CHECK ((status = ANY (ARRAY['aguardando_ancoragem'::text, 'ancorado_em_cpr_existente'::text, 'cpr_nova_criada'::text, 'descartado'::text])));
ALTER TABLE public.cartoes_credito DROP CONSTRAINT IF EXISTS cartoes_credito_conta_bancaria_id_fkey;
ALTER TABLE public.cartoes_credito ADD CONSTRAINT cartoes_credito_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.cartoes_credito DROP CONSTRAINT IF EXISTS cartoes_credito_dia_fechamento_check;
ALTER TABLE public.cartoes_credito ADD CONSTRAINT cartoes_credito_dia_fechamento_check CHECK (((dia_fechamento >= 1) AND (dia_fechamento <= 31)));
ALTER TABLE public.cartoes_credito DROP CONSTRAINT IF EXISTS cartoes_credito_dia_vencimento_check;
ALTER TABLE public.cartoes_credito ADD CONSTRAINT cartoes_credito_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 31)));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cartoes_credito_pkey' AND conrelid='public.cartoes_credito'::regclass) THEN
    ALTER TABLE public.cartoes_credito ADD CONSTRAINT cartoes_credito_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.comentarios_pedido DROP CONSTRAINT IF EXISTS comentarios_pedido_autor_id_fkey;
ALTER TABLE public.comentarios_pedido ADD CONSTRAINT comentarios_pedido_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES auth.users(id);
ALTER TABLE public.comentarios_pedido DROP CONSTRAINT IF EXISTS comentarios_pedido_conteudo_check;
ALTER TABLE public.comentarios_pedido ADD CONSTRAINT comentarios_pedido_conteudo_check CHECK ((length(TRIM(BOTH FROM conteudo)) > 0));
ALTER TABLE public.comentarios_pedido DROP CONSTRAINT IF EXISTS comentarios_pedido_excluido_por_fkey;
ALTER TABLE public.comentarios_pedido ADD CONSTRAINT comentarios_pedido_excluido_por_fkey FOREIGN KEY (excluido_por) REFERENCES auth.users(id);
ALTER TABLE public.comentarios_pedido DROP CONSTRAINT IF EXISTS comentarios_pedido_pedido_id_fkey;
ALTER TABLE public.comentarios_pedido ADD CONSTRAINT comentarios_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comentarios_pedido_pkey' AND conrelid='public.comentarios_pedido'::regclass) THEN
    ALTER TABLE public.comentarios_pedido ADD CONSTRAINT comentarios_pedido_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_comprador_id_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_comprador_id_fkey FOREIGN KEY (comprador_id) REFERENCES auth.users(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_conta_id_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_conta_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_excluida_por_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_excluida_por_fkey FOREIGN KEY (excluida_por) REFERENCES auth.users(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_excluida_tem_motivo;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_excluida_tem_motivo CHECK (((status <> 'excluida'::compra_registrada_status_enum) OR ((excluida_motivo IS NOT NULL) AND (length(excluida_motivo) >= 5))));
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_intervalo_dias_check;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_intervalo_dias_check CHECK (((intervalo_dias > 0) AND (intervalo_dias <= 365)));
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_meio_pagamento_id_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_meio_pagamento_id_fkey FOREIGN KEY (meio_pagamento_id) REFERENCES formas_pagamento(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_parceiro_id_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_parceiro_id_pedido_original_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_parceiro_id_pedido_original_fkey FOREIGN KEY (parceiro_id_pedido_original) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_parcelas_count_check;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_parcelas_count_check CHECK (((parcelas_count >= 1) AND (parcelas_count <= 60)));
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_pedido_id_fkey;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE RESTRICT;
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_periodicidade_check;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_periodicidade_check CHECK ((periodicidade = ANY (ARRAY['meses'::text, 'dias'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_pkey' AND conrelid='public.compras_registradas'::regclass) THEN
    ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compras_registradas DROP CONSTRAINT IF EXISTS compras_registradas_valor_total_check;
ALTER TABLE public.compras_registradas ADD CONSTRAINT compras_registradas_valor_total_check CHECK ((valor_total >= (0)::numeric));
ALTER TABLE public.compras_registradas_anexos DROP CONSTRAINT IF EXISTS compras_registradas_anexos_compra_registrada_id_fkey;
ALTER TABLE public.compras_registradas_anexos ADD CONSTRAINT compras_registradas_anexos_compra_registrada_id_fkey FOREIGN KEY (compra_registrada_id) REFERENCES compras_registradas(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_anexos_pkey' AND conrelid='public.compras_registradas_anexos'::regclass) THEN
    ALTER TABLE public.compras_registradas_anexos ADD CONSTRAINT compras_registradas_anexos_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_anexos_storage_path_key' AND conrelid='public.compras_registradas_anexos'::regclass) THEN
    ALTER TABLE public.compras_registradas_anexos ADD CONSTRAINT compras_registradas_anexos_storage_path_key UNIQUE (storage_path);
  END IF;
END $$;
ALTER TABLE public.compras_registradas_anexos DROP CONSTRAINT IF EXISTS compras_registradas_anexos_tamanho_bytes_check;
ALTER TABLE public.compras_registradas_anexos ADD CONSTRAINT compras_registradas_anexos_tamanho_bytes_check CHECK (((tamanho_bytes > 0) AND (tamanho_bytes <= 26214400)));
ALTER TABLE public.compras_registradas_anexos DROP CONSTRAINT IF EXISTS compras_registradas_anexos_uploaded_by_fkey;
ALTER TABLE public.compras_registradas_anexos ADD CONSTRAINT compras_registradas_anexos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.compras_registradas_audit_log DROP CONSTRAINT IF EXISTS compras_registradas_audit_log_compra_registrada_id_fkey;
ALTER TABLE public.compras_registradas_audit_log ADD CONSTRAINT compras_registradas_audit_log_compra_registrada_id_fkey FOREIGN KEY (compra_registrada_id) REFERENCES compras_registradas(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_audit_log_pkey' AND conrelid='public.compras_registradas_audit_log'::regclass) THEN
    ALTER TABLE public.compras_registradas_audit_log ADD CONSTRAINT compras_registradas_audit_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compras_registradas_audit_log DROP CONSTRAINT IF EXISTS compras_registradas_audit_log_usuario_id_fkey;
ALTER TABLE public.compras_registradas_audit_log ADD CONSTRAINT compras_registradas_audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_compra_registrada_id_fkey;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_compra_registrada_id_fkey FOREIGN KEY (compra_registrada_id) REFERENCES compras_registradas(id) ON DELETE CASCADE;
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_pedido_item_id_fkey;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_pedido_item_id_fkey FOREIGN KEY (pedido_item_id) REFERENCES pedidos_compra_itens(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_itens_pkey' AND conrelid='public.compras_registradas_itens'::regclass) THEN
    ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_quantidade_real_check;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_quantidade_real_check CHECK ((quantidade_real > (0)::numeric));
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_status_linha_check;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_status_linha_check CHECK ((status_linha = ANY (ARRAY['comprada'::text, 'nao_comprada'::text, 'substituida'::text])));
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_substitui_pedido_item_id_fkey;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_substitui_pedido_item_id_fkey FOREIGN KEY (substitui_pedido_item_id) REFERENCES pedidos_compra_itens(id);
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_tipo_linha_check;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_tipo_linha_check CHECK ((tipo_linha = ANY (ARRAY['produto'::text, 'frete'::text, 'servico'::text, 'extra'::text, 'desconto'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compras_registradas_itens_unique_active' AND conrelid='public.compras_registradas_itens'::regclass) THEN
    ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_unique_active UNIQUE (pedido_item_id, compra_registrada_id);
  END IF;
END $$;
ALTER TABLE public.compras_registradas_itens DROP CONSTRAINT IF EXISTS compras_registradas_itens_valor_unitario_real_check;
ALTER TABLE public.compras_registradas_itens ADD CONSTRAINT compras_registradas_itens_valor_unitario_real_check CHECK ((valor_unitario_real > (0)::numeric));
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_centro_custo_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_conta_bancaria_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id);
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_criado_por_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_fatura_origem_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_fatura_origem_id_fkey FOREIGN KEY (fatura_origem_id) REFERENCES faturas_cartao(id);
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_nf_origem_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_nf_origem_id_fkey FOREIGN KEY (nf_origem_id) REFERENCES contas_pagar_receber(id);
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_origem_check;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_origem_check CHECK ((origem = ANY (ARRAY['cartao'::text, 'manual'::text, 'outro'::text])));
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_parceiro_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compromissos_parcelados_pkey' AND conrelid='public.compromissos_parcelados'::regclass) THEN
    ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_plano_contas_id_fkey;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id);
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_qtd_parcelas_check;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_qtd_parcelas_check CHECK ((qtd_parcelas > 0));
ALTER TABLE public.compromissos_parcelados DROP CONSTRAINT IF EXISTS compromissos_parcelados_status_check;
ALTER TABLE public.compromissos_parcelados ADD CONSTRAINT compromissos_parcelados_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'quitado'::text, 'cancelado'::text])));
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_conta_bancaria_id_fkey;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_criado_por_fkey;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_dia_vencimento_check;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 31)));
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_parceiro_id_fkey;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE SET NULL;
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_periodicidade_check;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_periodicidade_check CHECK ((periodicidade = ANY (ARRAY['mensal'::text, 'trimestral'::text, 'anual'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compromissos_recorrentes_pkey' AND conrelid='public.compromissos_recorrentes'::regclass) THEN
    ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_plano_contas_id_fkey;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id) ON DELETE SET NULL;
ALTER TABLE public.compromissos_recorrentes DROP CONSTRAINT IF EXISTS compromissos_recorrentes_status_check;
ALTER TABLE public.compromissos_recorrentes ADD CONSTRAINT compromissos_recorrentes_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'pausado'::text, 'encerrado'::text])));
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_aprovado_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_canal_venda_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_canal_venda_id_fkey FOREIGN KEY (canal_venda_id) REFERENCES canais_venda(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_cartao_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES cartoes_credito(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_centro_custo_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_compra_registrada_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_compra_registrada_id_fkey FOREIGN KEY (compra_registrada_id) REFERENCES compras_registradas(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_compromisso_parcelado_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_compromisso_parcelado_id_fkey FOREIGN KEY (compromisso_parcelado_id) REFERENCES compromissos_parcelados(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_compromisso_recorrente_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_compromisso_recorrente_id_fkey FOREIGN KEY (compromisso_recorrente_id) REFERENCES compromissos_recorrentes(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_conciliado_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_conciliado_por_fkey FOREIGN KEY (conciliado_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_criado_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_editado_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_editado_por_fkey FOREIGN KEY (editado_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_enviado_pagamento_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_enviado_pagamento_por_fkey FOREIGN KEY (enviado_pagamento_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_forma_pagamento_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_forma_pagamento_id_fkey FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_linha_investimento_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_linha_investimento_id_fkey FOREIGN KEY (linha_investimento_id) REFERENCES linhas_investimento(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_meio_pagamento_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_meio_pagamento_id_fkey FOREIGN KEY (meio_pagamento_id) REFERENCES meios_pagamento(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_movimentacao_bancaria_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_movimentacao_bancaria_id_fkey FOREIGN KEY (movimentacao_bancaria_id) REFERENCES movimentacoes_bancarias(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_nfs_stage_documento_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_nfs_stage_documento_id_fkey FOREIGN KEY (nfs_stage_documento_id) REFERENCES nfs_stage_documentos(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_origem_check;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'csv_qive'::text, 'xml_nfe'::text, 'pdf_nfe'::text, 'nf_pj_interno'::text, 'api_bling'::text, 'csv'::text, 'recorrente'::text, 'extrato'::text, 'nf_import'::text, 'boleto_stage'::text, 'contrato'::text, 'fatura_cartao'::text, 'pedido_compra'::text, 'pedido_venda'::text])));
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_pago_em_conta_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pago_em_conta_id_fkey FOREIGN KEY (pago_em_conta_id) REFERENCES contas_bancarias(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_pago_por_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pago_por_fkey FOREIGN KEY (pago_por) REFERENCES auth.users(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_parceiro_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_pasta_contrato_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pasta_contrato_id_fkey FOREIGN KEY (pasta_contrato_id) REFERENCES pasta_contratos(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_pasta_contrato_parcela_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pasta_contrato_parcela_id_fkey FOREIGN KEY (pasta_contrato_parcela_id) REFERENCES pasta_contrato_parcelas(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_pedido_compra_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pedido_compra_id_fkey FOREIGN KEY (pedido_compra_id) REFERENCES pedidos_compra(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contas_pagar_receber_pkey' AND conrelid='public.contas_pagar_receber'::regclass) THEN
    ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_plano_contas_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id);
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_reembolsa_user_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_reembolsa_user_id_fkey FOREIGN KEY (reembolsa_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_status_check;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'aprovado'::text, 'enviado_para_pagamento'::text, 'pago'::text, 'conciliado'::text, 'cancelado'::text, 'doc_pendente'::text])));
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_tipo_check;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_tipo_check CHECK ((tipo = ANY (ARRAY['pagar'::text, 'receber'::text])));
ALTER TABLE public.contas_pagar_receber DROP CONSTRAINT IF EXISTS contas_pagar_receber_unidade_id_fkey;
ALTER TABLE public.contas_pagar_receber ADD CONSTRAINT contas_pagar_receber_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contas_pagar_receber_audit_delete_pkey' AND conrelid='public.contas_pagar_receber_audit_delete'::regclass) THEN
    ALTER TABLE public.contas_pagar_receber_audit_delete ADD CONSTRAINT contas_pagar_receber_audit_delete_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.evento_titulo DROP CONSTRAINT IF EXISTS evento_titulo_origem_check;
ALTER TABLE public.evento_titulo ADD CONSTRAINT evento_titulo_origem_check CHECK ((origem = ANY (ARRAY['SNCF'::text, 'BLING'::text, 'MANUAL'::text, 'CONCILIACAO'::text, 'JURIDICO'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='evento_titulo_pkey' AND conrelid='public.evento_titulo'::regclass) THEN
    ALTER TABLE public.evento_titulo ADD CONSTRAINT evento_titulo_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.evento_titulo DROP CONSTRAINT IF EXISTS evento_titulo_titulo_id_fkey;
ALTER TABLE public.evento_titulo ADD CONSTRAINT evento_titulo_titulo_id_fkey FOREIGN KEY (titulo_id) REFERENCES titulo_a_receber(id) ON DELETE CASCADE;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_centro_custo_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_conta_pagar_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_conta_pagar_id_fkey FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar_receber(id) ON DELETE SET NULL;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_fatura_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES faturas_cartao(id) ON DELETE CASCADE;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_natureza_check;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_natureza_check CHECK ((natureza = ANY (ARRAY['NACIONAL'::text, 'INTERNACIONAL'::text])));
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_nf_vinculada_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_nf_vinculada_id_fkey FOREIGN KEY (nf_vinculada_id) REFERENCES contas_pagar_receber(id);
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_parceiro_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fatura_cartao_lancamentos_pkey' AND conrelid='public.fatura_cartao_lancamentos'::regclass) THEN
    ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_plano_contas_id_fkey;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id) ON DELETE SET NULL;
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_status_check;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'conciliado'::text, 'virou_despesa'::text, 'ignorado'::text])));
ALTER TABLE public.fatura_cartao_lancamentos DROP CONSTRAINT IF EXISTS fatura_cartao_lancamentos_tipo_check;
ALTER TABLE public.fatura_cartao_lancamentos ADD CONSTRAINT fatura_cartao_lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['compra'::text, 'estorno'::text, 'iof'::text, 'encargo'::text, 'pagamento'::text, 'taxa'::text, 'outro'::text])));
ALTER TABLE public.faturas_cartao DROP CONSTRAINT IF EXISTS faturas_cartao_cartao_id_fkey;
ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_cartao_id_fkey FOREIGN KEY (cartao_id) REFERENCES cartoes_credito(id) ON DELETE SET NULL;
ALTER TABLE public.faturas_cartao DROP CONSTRAINT IF EXISTS faturas_cartao_conta_bancaria_id_fkey;
ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id);
ALTER TABLE public.faturas_cartao DROP CONSTRAINT IF EXISTS faturas_cartao_conta_pagar_id_fkey;
ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_conta_pagar_id_fkey FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar_receber(id);
ALTER TABLE public.faturas_cartao DROP CONSTRAINT IF EXISTS faturas_cartao_criado_por_fkey;
ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='faturas_cartao_pkey' AND conrelid='public.faturas_cartao'::regclass) THEN
    ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.faturas_cartao DROP CONSTRAINT IF EXISTS faturas_cartao_status_check;
ALTER TABLE public.faturas_cartao ADD CONSTRAINT faturas_cartao_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'paga'::text, 'conciliada'::text, 'cancelada'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uniq_fatura_cartao_vencimento' AND conrelid='public.faturas_cartao'::regclass) THEN
    ALTER TABLE public.faturas_cartao ADD CONSTRAINT uniq_fatura_cartao_vencimento UNIQUE (conta_bancaria_id, data_vencimento);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_areas_codigo_key' AND conrelid='public.ged_areas'::regclass) THEN
    ALTER TABLE public.ged_areas ADD CONSTRAINT ged_areas_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_areas_pkey' AND conrelid='public.ged_areas'::regclass) THEN
    ALTER TABLE public.ged_areas ADD CONSTRAINT ged_areas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ged_documento_vinculos DROP CONSTRAINT IF EXISTS ged_documento_vinculos_criado_por_fkey;
ALTER TABLE public.ged_documento_vinculos ADD CONSTRAINT ged_documento_vinculos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_documento_vinculos_documento_id_entidade_tipo_entidade__key' AND conrelid='public.ged_documento_vinculos'::regclass) THEN
    ALTER TABLE public.ged_documento_vinculos ADD CONSTRAINT ged_documento_vinculos_documento_id_entidade_tipo_entidade__key UNIQUE (documento_id, entidade_tipo, entidade_id);
  END IF;
END $$;
ALTER TABLE public.ged_documento_vinculos DROP CONSTRAINT IF EXISTS ged_documento_vinculos_documento_id_fkey;
ALTER TABLE public.ged_documento_vinculos ADD CONSTRAINT ged_documento_vinculos_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES ged_documentos(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_documento_vinculos_pkey' AND conrelid='public.ged_documento_vinculos'::regclass) THEN
    ALTER TABLE public.ged_documento_vinculos ADD CONSTRAINT ged_documento_vinculos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_confianca_ia_check;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_confianca_ia_check CHECK (((confianca_ia = ANY (ARRAY['alta'::text, 'baixa'::text])) OR (confianca_ia IS NULL)));
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_criado_por_fkey;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_nfs_stage_id_fkey;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_nfs_stage_id_fkey FOREIGN KEY (nfs_stage_id) REFERENCES nfs_stage(id) ON DELETE SET NULL;
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_parceiro_id_fkey;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_pasta_contrato_id_fkey;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_pasta_contrato_id_fkey FOREIGN KEY (pasta_contrato_id) REFERENCES pasta_contratos(id) ON DELETE SET NULL;
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_pasta_id_fkey;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_pasta_id_fkey FOREIGN KEY (pasta_id) REFERENCES ged_pastas(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_documentos_pkey' AND conrelid='public.ged_documentos'::regclass) THEN
    ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ged_documentos DROP CONSTRAINT IF EXISTS ged_documentos_status_classificacao_check;
ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_status_classificacao_check CHECK ((status_classificacao = ANY (ARRAY['aguardando'::text, 'classificada'::text, 'roteada'::text, 'descartada'::text, 'erro'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_documentos_storage_path_key' AND conrelid='public.ged_documentos'::regclass) THEN
    ALTER TABLE public.ged_documentos ADD CONSTRAINT ged_documentos_storage_path_key UNIQUE (storage_path);
  END IF;
END $$;
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_area_id_fkey;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_area_id_fkey FOREIGN KEY (area_id) REFERENCES ged_areas(id);
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_criado_por_fkey;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_parceiro_id_fkey;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_parent_id_fkey;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ged_pastas(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ged_pastas_pkey' AND conrelid='public.ged_pastas'::regclass) THEN
    ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_responsavel_id_fkey;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES auth.users(id);
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_status_check;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'encerrado'::text, 'arquivado'::text])));
ALTER TABLE public.ged_pastas DROP CONSTRAINT IF EXISTS ged_pastas_tipo_check;
ALTER TABLE public.ged_pastas ADD CONSTRAINT ged_pastas_tipo_check CHECK ((tipo = ANY (ARRAY['aluguel'::text, 'saas'::text, 'servico'::text, 'compra'::text, 'evento'::text, 'outro'::text])));
ALTER TABLE public.grupo_acesso_permissoes DROP CONSTRAINT IF EXISTS grupo_acesso_permissoes_criado_por_fkey;
ALTER TABLE public.grupo_acesso_permissoes ADD CONSTRAINT grupo_acesso_permissoes_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.grupo_acesso_permissoes DROP CONSTRAINT IF EXISTS grupo_acesso_permissoes_grupo_acesso_id_fkey;
ALTER TABLE public.grupo_acesso_permissoes ADD CONSTRAINT grupo_acesso_permissoes_grupo_acesso_id_fkey FOREIGN KEY (grupo_acesso_id) REFERENCES grupos_acesso(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupo_acesso_permissoes_grupo_acesso_id_permissao_id_key' AND conrelid='public.grupo_acesso_permissoes'::regclass) THEN
    ALTER TABLE public.grupo_acesso_permissoes ADD CONSTRAINT grupo_acesso_permissoes_grupo_acesso_id_permissao_id_key UNIQUE (grupo_acesso_id, permissao_id);
  END IF;
END $$;
ALTER TABLE public.grupo_acesso_permissoes DROP CONSTRAINT IF EXISTS grupo_acesso_permissoes_permissao_id_fkey;
ALTER TABLE public.grupo_acesso_permissoes ADD CONSTRAINT grupo_acesso_permissoes_permissao_id_fkey FOREIGN KEY (permissao_id) REFERENCES permissoes_catalogo(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupo_acesso_permissoes_pkey' AND conrelid='public.grupo_acesso_permissoes'::regclass) THEN
    ALTER TABLE public.grupo_acesso_permissoes ADD CONSTRAINT grupo_acesso_permissoes_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.grupo_acesso_usuarios DROP CONSTRAINT IF EXISTS grupo_acesso_usuarios_adicionado_por_fkey;
ALTER TABLE public.grupo_acesso_usuarios ADD CONSTRAINT grupo_acesso_usuarios_adicionado_por_fkey FOREIGN KEY (adicionado_por) REFERENCES auth.users(id);
ALTER TABLE public.grupo_acesso_usuarios DROP CONSTRAINT IF EXISTS grupo_acesso_usuarios_grupo_acesso_id_fkey;
ALTER TABLE public.grupo_acesso_usuarios ADD CONSTRAINT grupo_acesso_usuarios_grupo_acesso_id_fkey FOREIGN KEY (grupo_acesso_id) REFERENCES grupos_acesso(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupo_acesso_usuarios_grupo_acesso_id_user_id_key' AND conrelid='public.grupo_acesso_usuarios'::regclass) THEN
    ALTER TABLE public.grupo_acesso_usuarios ADD CONSTRAINT grupo_acesso_usuarios_grupo_acesso_id_user_id_key UNIQUE (grupo_acesso_id, user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupo_acesso_usuarios_pkey' AND conrelid='public.grupo_acesso_usuarios'::regclass) THEN
    ALTER TABLE public.grupo_acesso_usuarios ADD CONSTRAINT grupo_acesso_usuarios_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.grupo_acesso_usuarios DROP CONSTRAINT IF EXISTS grupo_acesso_usuarios_user_id_fkey;
ALTER TABLE public.grupo_acesso_usuarios ADD CONSTRAINT grupo_acesso_usuarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupos_empresariais_nome_key' AND conrelid='public.grupos_empresariais'::regclass) THEN
    ALTER TABLE public.grupos_empresariais ADD CONSTRAINT grupos_empresariais_nome_key UNIQUE (nome);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupos_empresariais_pkey' AND conrelid='public.grupos_empresariais'::regclass) THEN
    ALTER TABLE public.grupos_empresariais ADD CONSTRAINT grupos_empresariais_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.grupos_empresariais DROP CONSTRAINT IF EXISTS grupos_empresariais_tipo_controle_check;
ALTER TABLE public.grupos_empresariais ADD CONSTRAINT grupos_empresariais_tipo_controle_check CHECK (((tipo_controle IS NULL) OR (tipo_controle = ANY (ARRAY['holding_formal'::text, 'mesmo_dono'::text, 'controle_indireto'::text, 'agrupamento_operacional'::text, 'outro'::text]))));
ALTER TABLE public.grupos_parceiros_log DROP CONSTRAINT IF EXISTS grupos_parceiros_log_grupo_anterior_id_fkey;
ALTER TABLE public.grupos_parceiros_log ADD CONSTRAINT grupos_parceiros_log_grupo_anterior_id_fkey FOREIGN KEY (grupo_anterior_id) REFERENCES grupos_empresariais(id) ON DELETE SET NULL;
ALTER TABLE public.grupos_parceiros_log DROP CONSTRAINT IF EXISTS grupos_parceiros_log_grupo_novo_id_fkey;
ALTER TABLE public.grupos_parceiros_log ADD CONSTRAINT grupos_parceiros_log_grupo_novo_id_fkey FOREIGN KEY (grupo_novo_id) REFERENCES grupos_empresariais(id) ON DELETE SET NULL;
ALTER TABLE public.grupos_parceiros_log DROP CONSTRAINT IF EXISTS grupos_parceiros_log_mudou_por_fkey;
ALTER TABLE public.grupos_parceiros_log ADD CONSTRAINT grupos_parceiros_log_mudou_por_fkey FOREIGN KEY (mudou_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.grupos_parceiros_log DROP CONSTRAINT IF EXISTS grupos_parceiros_log_parceiro_id_fkey;
ALTER TABLE public.grupos_parceiros_log ADD CONSTRAINT grupos_parceiros_log_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grupos_parceiros_log_pkey' AND conrelid='public.grupos_parceiros_log'::regclass) THEN
    ALTER TABLE public.grupos_parceiros_log ADD CONSTRAINT grupos_parceiros_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.itau_importacoes_stage DROP CONSTRAINT IF EXISTS itau_importacoes_stage_conta_bancaria_id_fkey;
ALTER TABLE public.itau_importacoes_stage ADD CONSTRAINT itau_importacoes_stage_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.itau_importacoes_stage DROP CONSTRAINT IF EXISTS itau_importacoes_stage_criado_por_fkey;
ALTER TABLE public.itau_importacoes_stage ADD CONSTRAINT itau_importacoes_stage_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='itau_importacoes_stage_pkey' AND conrelid='public.itau_importacoes_stage'::regclass) THEN
    ALTER TABLE public.itau_importacoes_stage ADD CONSTRAINT itau_importacoes_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_conta_bancaria_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_conta_pagar_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_conta_pagar_id_fkey FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar_receber(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='itau_pagamentos_stage_hash_unico_key' AND conrelid='public.itau_pagamentos_stage'::regclass) THEN
    ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_hash_unico_key UNIQUE (hash_unico);
  END IF;
END $$;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_importacao_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES itau_importacoes_stage(id) ON DELETE CASCADE;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_movimentacao_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_movimentacao_id_fkey FOREIGN KEY (movimentacao_id) REFERENCES movimentacoes_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_ofx_transacao_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_ofx_transacao_id_fkey FOREIGN KEY (ofx_transacao_id) REFERENCES ofx_transacoes_stage(id) ON DELETE SET NULL;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_parceiro_id_fkey;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='itau_pagamentos_stage_pkey' AND conrelid='public.itau_pagamentos_stage'::regclass) THEN
    ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.itau_pagamentos_stage DROP CONSTRAINT IF EXISTS itau_pagamentos_stage_status_conciliacao_check;
ALTER TABLE public.itau_pagamentos_stage ADD CONSTRAINT itau_pagamentos_stage_status_conciliacao_check CHECK ((status_conciliacao = ANY (ARRAY['pendente'::text, 'aguardando_ofx'::text, 'conciliado'::text, 'conciliado_manual'::text, 'ignorado'::text, 'parcialmente_conciliado'::text, 'sem_cnpj'::text, 'sem_cpr'::text, 'sem_parceiro'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meios_pagamento_codigo_key' AND conrelid='public.meios_pagamento'::regclass) THEN
    ALTER TABLE public.meios_pagamento ADD CONSTRAINT meios_pagamento_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meios_pagamento_pkey' AND conrelid='public.meios_pagamento'::regclass) THEN
    ALTER TABLE public.meios_pagamento ADD CONSTRAINT meios_pagamento_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_emitidas_bling_id_key' AND conrelid='public.nfs_emitidas'::regclass) THEN
    ALTER TABLE public.nfs_emitidas ADD CONSTRAINT nfs_emitidas_bling_id_key UNIQUE (bling_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_emitidas_chave_acesso_key' AND conrelid='public.nfs_emitidas'::regclass) THEN
    ALTER TABLE public.nfs_emitidas ADD CONSTRAINT nfs_emitidas_chave_acesso_key UNIQUE (chave_acesso);
  END IF;
END $$;
ALTER TABLE public.nfs_emitidas DROP CONSTRAINT IF EXISTS nfs_emitidas_parceiro_id_fkey;
ALTER TABLE public.nfs_emitidas ADD CONSTRAINT nfs_emitidas_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE SET NULL;
ALTER TABLE public.nfs_emitidas DROP CONSTRAINT IF EXISTS nfs_emitidas_pedido_venda_id_fkey;
ALTER TABLE public.nfs_emitidas ADD CONSTRAINT nfs_emitidas_pedido_venda_id_fkey FOREIGN KEY (pedido_venda_id) REFERENCES pedidos(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_emitidas_pkey' AND conrelid='public.nfs_emitidas'::regclass) THEN
    ALTER TABLE public.nfs_emitidas ADD CONSTRAINT nfs_emitidas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_conta_pagar_id_fkey;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_conta_pagar_id_fkey FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar_receber(id);
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_conversao_coerencia;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_conversao_coerencia CHECK ((((valor_origem IS NULL) AND (taxa_conversao IS NULL)) OR ((valor_origem IS NOT NULL) AND (taxa_conversao IS NOT NULL) AND (moeda <> 'BRL'::text))));
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_criada_por_fkey;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_criada_por_fkey FOREIGN KEY (criada_por) REFERENCES auth.users(id);
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_moeda_check;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_moeda_check CHECK ((moeda ~ '^[A-Z]{3}$'::text));
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_pais_emissor_check;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_pais_emissor_check CHECK ((pais_emissor ~ '^[A-Z]{2}$'::text));
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_parceiro_id_fkey;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_stage_pkey' AND conrelid='public.nfs_stage'::regclass) THEN
    ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_plano_contas_id_fkey;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id) ON DELETE SET NULL;
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_status_check;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_status_check CHECK ((status = ANY (ARRAY['nao_vinculada'::text, 'vinculada'::text])));
ALTER TABLE public.nfs_stage DROP CONSTRAINT IF EXISTS nfs_stage_tipo_documento_check;
ALTER TABLE public.nfs_stage ADD CONSTRAINT nfs_stage_tipo_documento_check CHECK ((tipo_documento = ANY (ARRAY['nfe'::text, 'nfse'::text, 'recibo'::text, 'boleto'::text])));
ALTER TABLE public.nfs_stage_documentos DROP CONSTRAINT IF EXISTS nfs_stage_documentos_criado_por_fkey;
ALTER TABLE public.nfs_stage_documentos ADD CONSTRAINT nfs_stage_documentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.nfs_stage_documentos DROP CONSTRAINT IF EXISTS nfs_stage_documentos_ged_documento_id_fkey;
ALTER TABLE public.nfs_stage_documentos ADD CONSTRAINT nfs_stage_documentos_ged_documento_id_fkey FOREIGN KEY (ged_documento_id) REFERENCES ged_documentos(id) ON DELETE SET NULL;
ALTER TABLE public.nfs_stage_documentos DROP CONSTRAINT IF EXISTS nfs_stage_documentos_nfs_stage_id_fkey;
ALTER TABLE public.nfs_stage_documentos ADD CONSTRAINT nfs_stage_documentos_nfs_stage_id_fkey FOREIGN KEY (nfs_stage_id) REFERENCES nfs_stage(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_stage_documentos_pkey' AND conrelid='public.nfs_stage_documentos'::regclass) THEN
    ALTER TABLE public.nfs_stage_documentos ADD CONSTRAINT nfs_stage_documentos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.nfs_stage_documentos DROP CONSTRAINT IF EXISTS nfs_stage_documentos_tipo_check;
ALTER TABLE public.nfs_stage_documentos ADD CONSTRAINT nfs_stage_documentos_tipo_check CHECK ((tipo = ANY (ARRAY['xml'::text, 'pdf_danfe'::text, 'pdf_boleto'::text])));
ALTER TABLE public.nfs_stage_venda DROP CONSTRAINT IF EXISTS nfs_stage_venda_nf_id_fkey;
ALTER TABLE public.nfs_stage_venda ADD CONSTRAINT nfs_stage_venda_nf_id_fkey FOREIGN KEY (nf_id) REFERENCES nfs_emitidas(id);
ALTER TABLE public.nfs_stage_venda DROP CONSTRAINT IF EXISTS nfs_stage_venda_pedido_id_fkey;
ALTER TABLE public.nfs_stage_venda ADD CONSTRAINT nfs_stage_venda_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='nfs_stage_venda_pkey' AND conrelid='public.nfs_stage_venda'::regclass) THEN
    ALTER TABLE public.nfs_stage_venda ADD CONSTRAINT nfs_stage_venda_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.nfs_stage_venda DROP CONSTRAINT IF EXISTS nfs_stage_venda_resolvido_por_fkey;
ALTER TABLE public.nfs_stage_venda ADD CONSTRAINT nfs_stage_venda_resolvido_por_fkey FOREIGN KEY (resolvido_por) REFERENCES auth.users(id);
ALTER TABLE public.nfs_stage_venda DROP CONSTRAINT IF EXISTS nfs_stage_venda_status_check;
ALTER TABLE public.nfs_stage_venda ADD CONSTRAINT nfs_stage_venda_status_check CHECK ((status = ANY (ARRAY['aguardando_matching'::text, 'vinculada'::text, 'divergencia'::text, 'aceita_com_diff'::text, 'rejeitada'::text])));
ALTER TABLE public.ofx_importacoes_stage DROP CONSTRAINT IF EXISTS ofx_importacoes_stage_conta_bancaria_id_fkey;
ALTER TABLE public.ofx_importacoes_stage ADD CONSTRAINT ofx_importacoes_stage_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ofx_importacoes_stage_pkey' AND conrelid='public.ofx_importacoes_stage'::regclass) THEN
    ALTER TABLE public.ofx_importacoes_stage ADD CONSTRAINT ofx_importacoes_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ofx_importacoes_stage DROP CONSTRAINT IF EXISTS ofx_importacoes_stage_status_check;
ALTER TABLE public.ofx_importacoes_stage ADD CONSTRAINT ofx_importacoes_stage_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'persistido'::text, 'descartado'::text])));
ALTER TABLE public.ofx_regras_automaticas DROP CONSTRAINT IF EXISTS chk_lancar_requer_conta_plano;
ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT chk_lancar_requer_conta_plano CHECK (((acao = 'ignorar'::text) OR (conta_plano_id IS NOT NULL)));
ALTER TABLE public.ofx_regras_automaticas DROP CONSTRAINT IF EXISTS ofx_regras_automaticas_acao_check;
ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT ofx_regras_automaticas_acao_check CHECK ((acao = ANY (ARRAY['lancar'::text, 'ignorar'::text])));
ALTER TABLE public.ofx_regras_automaticas DROP CONSTRAINT IF EXISTS ofx_regras_automaticas_centro_custo_id_fkey;
ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT ofx_regras_automaticas_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE public.ofx_regras_automaticas DROP CONSTRAINT IF EXISTS ofx_regras_automaticas_conta_bancaria_id_fkey;
ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT ofx_regras_automaticas_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE SET NULL;
ALTER TABLE public.ofx_regras_automaticas DROP CONSTRAINT IF EXISTS ofx_regras_automaticas_conta_plano_id_fkey;
ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT ofx_regras_automaticas_conta_plano_id_fkey FOREIGN KEY (conta_plano_id) REFERENCES plano_contas(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ofx_regras_automaticas_pkey' AND conrelid='public.ofx_regras_automaticas'::regclass) THEN
    ALTER TABLE public.ofx_regras_automaticas ADD CONSTRAINT ofx_regras_automaticas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ofx_transacoes_stage DROP CONSTRAINT IF EXISTS ofx_transacoes_stage_conta_bancaria_id_fkey;
ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE CASCADE;
ALTER TABLE public.ofx_transacoes_stage DROP CONSTRAINT IF EXISTS ofx_transacoes_stage_duplicada_de_fkey;
ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_duplicada_de_fkey FOREIGN KEY (duplicada_de) REFERENCES movimentacoes_bancarias(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ofx_transacoes_stage_hash_unico_key' AND conrelid='public.ofx_transacoes_stage'::regclass) THEN
    ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_hash_unico_key UNIQUE (hash_unico);
  END IF;
END $$;
ALTER TABLE public.ofx_transacoes_stage DROP CONSTRAINT IF EXISTS ofx_transacoes_stage_importacao_stage_id_fkey;
ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_importacao_stage_id_fkey FOREIGN KEY (importacao_stage_id) REFERENCES ofx_importacoes_stage(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ofx_transacoes_stage_pkey' AND conrelid='public.ofx_transacoes_stage'::regclass) THEN
    ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.ofx_transacoes_stage DROP CONSTRAINT IF EXISTS ofx_transacoes_stage_status_check;
ALTER TABLE public.ofx_transacoes_stage ADD CONSTRAINT ofx_transacoes_stage_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'persistida'::text, 'duplicada'::text, 'descartada'::text, 'conciliado'::text, 'ignorado'::text])));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS fornecedores_categoria_padrao_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT fornecedores_categoria_padrao_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fornecedores_cnpj_key' AND conrelid='public.parceiros_comerciais'::regclass) THEN
    ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT fornecedores_cnpj_key UNIQUE (cnpj);
  END IF;
END $$;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS fornecedores_origem_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT fornecedores_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'nf_import'::text, 'qive'::text, 'nf_pj_interno'::text, 'bling'::text, 'sync_contratos_pj'::text, 'sync_contratos_pj_backfill'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fornecedores_pkey' AND conrelid='public.parceiros_comerciais'::regclass) THEN
    ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT fornecedores_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS fornecedores_tipo_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT fornecedores_tipo_check CHECK ((tipo = ANY (ARRAY['pj'::text, 'pf'::text])));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_bandeira_vermelha_por_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_bandeira_vermelha_por_fkey FOREIGN KEY (bandeira_vermelha_por) REFERENCES auth.users(id);
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_canal_venda_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_canal_venda_id_fkey FOREIGN KEY (canal_venda_id) REFERENCES canais_venda(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_categoria_ka_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_categoria_ka_check CHECK (((categoria_ka IS NULL) OR (categoria_ka = ANY (ARRAY['parceiro'::text, 'familia'::text]))));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_centro_custo_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_forma_pagamento_padrao_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_forma_pagamento_padrao_id_fkey FOREIGN KEY (forma_pagamento_padrao_id) REFERENCES formas_pagamento(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_grupo_economico_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_grupo_economico_id_fkey FOREIGN KEY (grupo_economico_id) REFERENCES grupos_economicos(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_grupo_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES grupos_empresariais(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_nivel_programa_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_nivel_programa_check CHECK ((nivel_programa = ANY (ARRAY['convive'::text, 'anfitriao'::text, 'embaixador'::text, 'mestre'::text])));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_origem_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'nf_import'::text, 'qive'::text, 'nf_pj_interno'::text, 'bling'::text, 'people_pj'::text, 'sync_contratos_pj_backfill'::text, 'sync_contratos_pj'::text])));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_perfil_credito_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_perfil_credito_check CHECK ((perfil_credito = ANY (ARRAY['novo_entrada'::text, 'novo_qualificado'::text, 'recorrente_bom_pagador'::text, 'premium'::text, 'bandeira_vermelha'::text])));
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_plano_contas_id_fkey;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_plano_contas_id_fkey FOREIGN KEY (plano_contas_id) REFERENCES plano_contas(id) ON DELETE SET NULL;
ALTER TABLE public.parceiros_comerciais DROP CONSTRAINT IF EXISTS parceiros_comerciais_tipo_pessoa_check;
ALTER TABLE public.parceiros_comerciais ADD CONSTRAINT parceiros_comerciais_tipo_pessoa_check CHECK ((tipo_pessoa = ANY (ARRAY['PF'::text, 'PJ'::text])));
ALTER TABLE public.pasta_contrato_parcelas DROP CONSTRAINT IF EXISTS pasta_contrato_parcelas_conta_pagar_id_fkey;
ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_conta_pagar_id_fkey FOREIGN KEY (conta_pagar_id) REFERENCES contas_pagar_receber(id);
ALTER TABLE public.pasta_contrato_parcelas DROP CONSTRAINT IF EXISTS pasta_contrato_parcelas_contrato_id_fkey;
ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES pasta_contratos(id) ON DELETE CASCADE;
ALTER TABLE public.pasta_contrato_parcelas DROP CONSTRAINT IF EXISTS pasta_contrato_parcelas_origem_check;
ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_origem_check CHECK ((origem = ANY (ARRAY['principal'::text, 'setup'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pasta_contrato_parcelas_pkey' AND conrelid='public.pasta_contrato_parcelas'::regclass) THEN
    ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pasta_contrato_parcelas DROP CONSTRAINT IF EXISTS pasta_contrato_parcelas_status_check;
ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'paga'::text, 'atrasada'::text, 'cancelada'::text])));
ALTER TABLE public.pasta_contrato_parcelas DROP CONSTRAINT IF EXISTS pasta_contrato_parcelas_valor_check;
ALTER TABLE public.pasta_contrato_parcelas ADD CONSTRAINT pasta_contrato_parcelas_valor_check CHECK ((valor >= (0)::numeric));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_ciclo_pagamento_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_ciclo_pagamento_check CHECK ((ciclo_pagamento = ANY (ARRAY['unico'::text, 'parcelado'::text, 'mensal'::text, 'trimestral'::text, 'anual'::text])));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_criado_por_fkey;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_dia_vencimento_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28)));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_linha_investimento_id_fkey;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_linha_investimento_id_fkey FOREIGN KEY (linha_investimento_id) REFERENCES linhas_investimento(id);
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_meio_pagamento_id_fkey;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_meio_pagamento_id_fkey FOREIGN KEY (meio_pagamento_id) REFERENCES formas_pagamento(id);
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_pasta_id_fkey;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_pasta_id_fkey FOREIGN KEY (pasta_id) REFERENCES ged_pastas(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pasta_contratos_pkey' AND conrelid='public.pasta_contratos'::regclass) THEN
    ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_reajuste_indice_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_reajuste_indice_check CHECK ((reajuste_indice = ANY (ARRAY['igpm'::text, 'ipca'::text, 'prefixado'::text, 'nenhum'::text])));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_status_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_status_check CHECK ((status = ANY (ARRAY['vigente'::text, 'encerrado'::text, 'futuro'::text, 'suspenso'::text, 'rascunho'::text])));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_tipo_contrato_id_fkey;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_tipo_contrato_id_fkey FOREIGN KEY (tipo_contrato_id) REFERENCES tipos_contrato(id) ON DELETE SET NULL;
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_valor_parcela_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_valor_parcela_check CHECK ((valor_parcela >= (0)::numeric));
ALTER TABLE public.pasta_contratos DROP CONSTRAINT IF EXISTS pasta_contratos_valor_total_check;
ALTER TABLE public.pasta_contratos ADD CONSTRAINT pasta_contratos_valor_total_check CHECK ((valor_total >= (0)::numeric));
ALTER TABLE public.pasta_historico DROP CONSTRAINT IF EXISTS pasta_historico_contrato_id_fkey;
ALTER TABLE public.pasta_historico ADD CONSTRAINT pasta_historico_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES pasta_contratos(id) ON DELETE SET NULL;
ALTER TABLE public.pasta_historico DROP CONSTRAINT IF EXISTS pasta_historico_criado_por_fkey;
ALTER TABLE public.pasta_historico ADD CONSTRAINT pasta_historico_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
ALTER TABLE public.pasta_historico DROP CONSTRAINT IF EXISTS pasta_historico_pasta_id_fkey;
ALTER TABLE public.pasta_historico ADD CONSTRAINT pasta_historico_pasta_id_fkey FOREIGN KEY (pasta_id) REFERENCES ged_pastas(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pasta_historico_pkey' AND conrelid='public.pasta_historico'::regclass) THEN
    ALTER TABLE public.pasta_historico ADD CONSTRAINT pasta_historico_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pasta_historico DROP CONSTRAINT IF EXISTS pasta_historico_tipo_evento_check;
ALTER TABLE public.pasta_historico ADD CONSTRAINT pasta_historico_tipo_evento_check CHECK ((tipo_evento = ANY (ARRAY['criacao_pasta'::text, 'novo_contrato'::text, 'reajuste'::text, 'mudanca_valor'::text, 'upgrade_plano'::text, 'downgrade_plano'::text, 'mudanca_status'::text, 'documento_adicionado'::text, 'aditivo'::text, 'renovacao'::text, 'encerramento'::text, 'outro'::text])));
ALTER TABLE public.pedido_eventos DROP CONSTRAINT IF EXISTS pedido_eventos_operador_id_fkey;
ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_operador_id_fkey FOREIGN KEY (operador_id) REFERENCES auth.users(id);
ALTER TABLE public.pedido_eventos DROP CONSTRAINT IF EXISTS pedido_eventos_pedido_id_fkey;
ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_eventos_pkey' AND conrelid='public.pedido_eventos'::regclass) THEN
    ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedido_eventos DROP CONSTRAINT IF EXISTS pedido_eventos_tipo_evento_check;
ALTER TABLE public.pedido_eventos ADD CONSTRAINT pedido_eventos_tipo_evento_check CHECK ((tipo_evento = ANY (ARRAY['recebido'::text, 'triado'::text, 'mudou_estagio'::text, 'mudou_area'::text, 'alterado'::text, 'cancelado'::text, 'anotacao'::text, 'alerta_disparado'::text, 'pagamento_solicitado'::text, 'pagamento_confirmado'::text, 'exportado_bling'::text, 'faturado'::text, 'outro'::text, 'link_cartao_enviado'::text, 'pix_enviado'::text, 'boleto_emitido'::text, 'link_cartao_atualizado'::text, 'pix_atualizado'::text, 'boleto_atualizado'::text, 'erro_automacao'::text])));
ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS pedido_itens_pedido_id_fkey;
ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_itens_pkey' AND conrelid='public.pedido_itens'::regclass) THEN
    ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS pedido_itens_quantidade_check;
ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_quantidade_check CHECK ((quantidade > (0)::numeric));
ALTER TABLE public.pedido_itens DROP CONSTRAINT IF EXISTS pedido_itens_valor_unitario_check;
ALTER TABLE public.pedido_itens ADD CONSTRAINT pedido_itens_valor_unitario_check CHECK ((valor_unitario >= (0)::numeric));
ALTER TABLE public.pedido_transicoes DROP CONSTRAINT IF EXISTS pedido_transicoes_ator_fkey;
ALTER TABLE public.pedido_transicoes ADD CONSTRAINT pedido_transicoes_ator_fkey FOREIGN KEY (ator) REFERENCES auth.users(id);
ALTER TABLE public.pedido_transicoes DROP CONSTRAINT IF EXISTS pedido_transicoes_pedido_id_fkey;
ALTER TABLE public.pedido_transicoes ADD CONSTRAINT pedido_transicoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedido_transicoes_pkey' AND conrelid='public.pedido_transicoes'::regclass) THEN
    ALTER TABLE public.pedido_transicoes ADD CONSTRAINT pedido_transicoes_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_analise_pedido_status_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_analise_pedido_status_check CHECK (((analise_pedido_status IS NULL) OR (analise_pedido_status = ANY (ARRAY['ok'::text, 'desvio'::text, 'erro'::text]))));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_area_atual_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_area_atual_check CHECK ((area_atual = ANY (ARRAY['sops'::text, 'credito'::text, 'bling'::text, 'sistema'::text, 'nenhuma'::text])));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_bling_enviado_por_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_bling_enviado_por_fkey FOREIGN KEY (bling_enviado_por) REFERENCES auth.users(id);
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_cancelado_por_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES auth.users(id);
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estagio_atualizado_por_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estagio_atualizado_por_fkey FOREIGN KEY (estagio_atualizado_por) REFERENCES auth.users(id);
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estagio_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estagio_check CHECK ((estagio = ANY (ARRAY['recebido'::text, 'em_analise_credito'::text, 'credito_aprovado'::text, 'cobranca'::text, 'aguardando_pagamento'::text, 'pre_faturado'::text, 'em_separacao'::text, 'faturado'::text, 'em_transporte'::text, 'entregue'::text, 'cancelado'::text, 'recuperacao_venda'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_id_externo_key' AND conrelid='public.pedidos'::regclass) THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_id_externo_key UNIQUE (id_externo);
  END IF;
END $$;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_origem_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_origem_check CHECK (((origem IS NULL) OR (origem = ANY (ARRAY['feira'::text, 'ecommerce'::text, 'vendedor'::text, 'fop'::text, 'outro'::text]))));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_parceiro_id_fkey;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_pkey' AND conrelid='public.pedidos'::regclass) THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_recebido_via_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_recebido_via_check CHECK ((recebido_via = ANY (ARRAY['api'::text, 'csv'::text, 'manual'::text, 'integracao_fop'::text, 'shopify'::text, 'marketplace'::text])));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_tipo_pagamento_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_tipo_pagamento_check CHECK (((tipo_pagamento IS NULL) OR (tipo_pagamento = ANY (ARRAY['a_prazo'::text, 'a_vista'::text]))));
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_urgencia_declarada_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_urgencia_declarada_check CHECK ((urgencia_declarada = ANY (ARRAY['normal'::text, 'alta'::text, 'critica'::text])));
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_cancelado_por_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES auth.users(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_cancelado_tem_motivo;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_cancelado_tem_motivo CHECK (((status <> 'cancelado'::pedido_compra_status_enum) OR ((cancelamento_motivo IS NOT NULL) AND (length(cancelamento_motivo) >= 5))));
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_centro_custo_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_centro_custo_id_fkey FOREIGN KEY (centro_custo_id) REFERENCES centros_custo(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_comprador_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_comprador_id_fkey FOREIGN KEY (comprador_id) REFERENCES auth.users(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_departamento_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES parametros(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_linha_investimento_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_linha_investimento_id_fkey FOREIGN KEY (linha_investimento_id) REFERENCES linhas_investimento(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_parceiro_preferencial_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_parceiro_preferencial_id_fkey FOREIGN KEY (parceiro_preferencial_id) REFERENCES parceiros_comerciais(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_compra_pkey' AND conrelid='public.pedidos_compra'::regclass) THEN
    ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_solicitante_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES auth.users(id);
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_sub_estado_only_em_compra;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_sub_estado_only_em_compra CHECK (((sub_estado IS NULL) OR (status = 'em_compra'::pedido_compra_status_enum)));
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_tipo_check;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_tipo_check CHECK ((tipo = ANY (ARRAY['pontual'::text, 'reembolso'::text, 'parcelado'::text, 'recorrente'::text, 'guarda_chuva'::text])));
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_unidade_id_fkey;
ALTER TABLE public.pedidos_compra ADD CONSTRAINT pedidos_compra_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES unidades(id);
ALTER TABLE public.pedidos_compra_anexos DROP CONSTRAINT IF EXISTS pedidos_compra_anexos_pedido_id_fkey;
ALTER TABLE public.pedidos_compra_anexos ADD CONSTRAINT pedidos_compra_anexos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_compra_anexos_pkey' AND conrelid='public.pedidos_compra_anexos'::regclass) THEN
    ALTER TABLE public.pedidos_compra_anexos ADD CONSTRAINT pedidos_compra_anexos_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_compra_anexos_storage_path_key' AND conrelid='public.pedidos_compra_anexos'::regclass) THEN
    ALTER TABLE public.pedidos_compra_anexos ADD CONSTRAINT pedidos_compra_anexos_storage_path_key UNIQUE (storage_path);
  END IF;
END $$;
ALTER TABLE public.pedidos_compra_anexos DROP CONSTRAINT IF EXISTS pedidos_compra_anexos_tamanho_bytes_check;
ALTER TABLE public.pedidos_compra_anexos ADD CONSTRAINT pedidos_compra_anexos_tamanho_bytes_check CHECK (((tamanho_bytes > 0) AND (tamanho_bytes <= 26214400)));
ALTER TABLE public.pedidos_compra_anexos DROP CONSTRAINT IF EXISTS pedidos_compra_anexos_uploaded_by_fkey;
ALTER TABLE public.pedidos_compra_anexos ADD CONSTRAINT pedidos_compra_anexos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.pedidos_compra_eventos DROP CONSTRAINT IF EXISTS pedidos_compra_eventos_pedido_id_fkey;
ALTER TABLE public.pedidos_compra_eventos ADD CONSTRAINT pedidos_compra_eventos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_compra_eventos_pkey' AND conrelid='public.pedidos_compra_eventos'::regclass) THEN
    ALTER TABLE public.pedidos_compra_eventos ADD CONSTRAINT pedidos_compra_eventos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedidos_compra_eventos DROP CONSTRAINT IF EXISTS pedidos_compra_eventos_tipo_check;
ALTER TABLE public.pedidos_compra_eventos ADD CONSTRAINT pedidos_compra_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['pedido_criado'::text, 'pedido_enviado'::text, 'pedido_pego'::text, 'item_cancelado'::text, 'compra_registrada'::text, 'compra_excluida'::text, 'pedido_finalizado_comprado'::text, 'pedido_finalizado_cancelado'::text, 'pedido_cancelado_total'::text, 'comentario_adicionado'::text, 'comentario_editado'::text, 'comentario_excluido'::text, 'cpr_para_aguardando_pagamento'::text, 'cpr_paga'::text, 'cpr_cancelada'::text, 'cpr_email_enviado'::text])));
ALTER TABLE public.pedidos_compra_eventos DROP CONSTRAINT IF EXISTS pedidos_compra_eventos_usuario_id_fkey;
ALTER TABLE public.pedidos_compra_eventos ADD CONSTRAINT pedidos_compra_eventos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id);
ALTER TABLE public.pedidos_compra_itens DROP CONSTRAINT IF EXISTS pedidos_compra_itens_cancelado_tem_motivo;
ALTER TABLE public.pedidos_compra_itens ADD CONSTRAINT pedidos_compra_itens_cancelado_tem_motivo CHECK (((status <> 'cancelado'::pedido_compra_item_status_enum) OR ((cancelamento_motivo IS NOT NULL) AND (length(cancelamento_motivo) >= 3))));
ALTER TABLE public.pedidos_compra_itens DROP CONSTRAINT IF EXISTS pedidos_compra_itens_pedido_id_fkey;
ALTER TABLE public.pedidos_compra_itens ADD CONSTRAINT pedidos_compra_itens_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pedidos_compra_itens_pkey' AND conrelid='public.pedidos_compra_itens'::regclass) THEN
    ALTER TABLE public.pedidos_compra_itens ADD CONSTRAINT pedidos_compra_itens_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.pedidos_compra_itens DROP CONSTRAINT IF EXISTS pedidos_compra_itens_quantidade_check;
ALTER TABLE public.pedidos_compra_itens ADD CONSTRAINT pedidos_compra_itens_quantidade_check CHECK ((quantidade > (0)::numeric));
ALTER TABLE public.pedidos_compra_itens DROP CONSTRAINT IF EXISTS pedidos_compra_itens_valor_estimado_unitario_check;
ALTER TABLE public.pedidos_compra_itens ADD CONSTRAINT pedidos_compra_itens_valor_estimado_unitario_check CHECK ((valor_estimado_unitario > (0)::numeric));
ALTER TABLE public.permissoes_catalogo DROP CONSTRAINT IF EXISTS permissoes_catalogo_categoria_sod_check;
ALTER TABLE public.permissoes_catalogo ADD CONSTRAINT permissoes_catalogo_categoria_sod_check CHECK (((categoria_sod IS NULL) OR (categoria_sod = ANY (ARRAY['cadastro'::text, 'aprovacao'::text, 'execucao'::text]))));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='permissoes_catalogo_pkey' AND conrelid='public.permissoes_catalogo'::regclass) THEN
    ALTER TABLE public.permissoes_catalogo ADD CONSTRAINT permissoes_catalogo_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='permissoes_catalogo_slug_key' AND conrelid='public.permissoes_catalogo'::regclass) THEN
    ALTER TABLE public.permissoes_catalogo ADD CONSTRAINT permissoes_catalogo_slug_key UNIQUE (slug);
  END IF;
END $$;
ALTER TABLE public.permissoes_catalogo DROP CONSTRAINT IF EXISTS permissoes_catalogo_tipo_check;
ALTER TABLE public.permissoes_catalogo ADD CONSTRAINT permissoes_catalogo_tipo_check CHECK ((tipo = ANY (ARRAY['tela'::text, 'ficha'::text, 'processo'::text])));
ALTER TABLE public.planilha_fatura_vinculo DROP CONSTRAINT IF EXISTS planilha_fatura_vinculo_fatura_id_fkey;
ALTER TABLE public.planilha_fatura_vinculo ADD CONSTRAINT planilha_fatura_vinculo_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES faturas_cartao(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='planilha_fatura_vinculo_pkey' AND conrelid='public.planilha_fatura_vinculo'::regclass) THEN
    ALTER TABLE public.planilha_fatura_vinculo ADD CONSTRAINT planilha_fatura_vinculo_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='planilha_fatura_vinculo_planilha_id_fatura_id_key' AND conrelid='public.planilha_fatura_vinculo'::regclass) THEN
    ALTER TABLE public.planilha_fatura_vinculo ADD CONSTRAINT planilha_fatura_vinculo_planilha_id_fatura_id_key UNIQUE (planilha_id, fatura_id);
  END IF;
END $$;
ALTER TABLE public.planilha_fatura_vinculo DROP CONSTRAINT IF EXISTS planilha_fatura_vinculo_planilha_id_fkey;
ALTER TABLE public.planilha_fatura_vinculo ADD CONSTRAINT planilha_fatura_vinculo_planilha_id_fkey FOREIGN KEY (planilha_id) REFERENCES itau_pagamentos_stage(id) ON DELETE CASCADE;
ALTER TABLE public.regras_automaticas_ofx DROP CONSTRAINT IF EXISTS regras_automaticas_ofx_categoria_id_fkey;
ALTER TABLE public.regras_automaticas_ofx ADD CONSTRAINT regras_automaticas_ofx_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES plano_contas(id) ON DELETE RESTRICT;
ALTER TABLE public.regras_automaticas_ofx DROP CONSTRAINT IF EXISTS regras_automaticas_ofx_conta_bancaria_id_fkey;
ALTER TABLE public.regras_automaticas_ofx ADD CONSTRAINT regras_automaticas_ofx_conta_bancaria_id_fkey FOREIGN KEY (conta_bancaria_id) REFERENCES contas_bancarias(id) ON DELETE CASCADE;
ALTER TABLE public.regras_automaticas_ofx DROP CONSTRAINT IF EXISTS regras_automaticas_ofx_parceiro_id_fkey;
ALTER TABLE public.regras_automaticas_ofx ADD CONSTRAINT regras_automaticas_ofx_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiros_comerciais(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='regras_automaticas_ofx_pkey' AND conrelid='public.regras_automaticas_ofx'::regclass) THEN
    ALTER TABLE public.regras_automaticas_ofx ADD CONSTRAINT regras_automaticas_ofx_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.regras_automaticas_ofx DROP CONSTRAINT IF EXISTS regras_automaticas_ofx_tipo_transacao_check;
ALTER TABLE public.regras_automaticas_ofx ADD CONSTRAINT regras_automaticas_ofx_tipo_transacao_check CHECK ((tipo_transacao = ANY (ARRAY['debito'::text, 'credito'::text, 'ambos'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='regras_cadencia_credito_pkey' AND conrelid='public.regras_cadencia_credito'::regclass) THEN
    ALTER TABLE public.regras_cadencia_credito ADD CONSTRAINT regras_cadencia_credito_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.remessas_contador DROP CONSTRAINT IF EXISTS periodo_valido;
ALTER TABLE public.remessas_contador ADD CONSTRAINT periodo_valido CHECK ((periodo_fim >= periodo_inicio));
ALTER TABLE public.remessas_contador DROP CONSTRAINT IF EXISTS remessas_contador_enviada_por_fkey;
ALTER TABLE public.remessas_contador ADD CONSTRAINT remessas_contador_enviada_por_fkey FOREIGN KEY (enviada_por) REFERENCES auth.users(id);
ALTER TABLE public.remessas_contador DROP CONSTRAINT IF EXISTS remessas_contador_metodo_check;
ALTER TABLE public.remessas_contador ADD CONSTRAINT remessas_contador_metodo_check CHECK ((metodo = ANY (ARRAY['sistema'::text, 'manual_download'::text])));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='remessas_contador_pkey' AND conrelid='public.remessas_contador'::regclass) THEN
    ALTER TABLE public.remessas_contador ADD CONSTRAINT remessas_contador_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.remessas_contador_itens DROP CONSTRAINT IF EXISTS remessas_contador_itens_conta_id_fkey;
ALTER TABLE public.remessas_contador_itens ADD CONSTRAINT remessas_contador_itens_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES contas_pagar_receber(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='remessas_contador_itens_pkey' AND conrelid='public.remessas_contador_itens'::regclass) THEN
    ALTER TABLE public.remessas_contador_itens ADD CONSTRAINT remessas_contador_itens_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='remessas_contador_itens_remessa_id_conta_id_key' AND conrelid='public.remessas_contador_itens'::regclass) THEN
    ALTER TABLE public.remessas_contador_itens ADD CONSTRAINT remessas_contador_itens_remessa_id_conta_id_key UNIQUE (remessa_id, conta_id);
  END IF;
END $$;
ALTER TABLE public.remessas_contador_itens DROP CONSTRAINT IF EXISTS remessas_contador_itens_remessa_id_fkey;
ALTER TABLE public.remessas_contador_itens ADD CONSTRAINT remessas_contador_itens_remessa_id_fkey FOREIGN KEY (remessa_id) REFERENCES remessas_contador(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tipos_contrato_codigo_key' AND conrelid='public.tipos_contrato'::regclass) THEN
    ALTER TABLE public.tipos_contrato ADD CONSTRAINT tipos_contrato_codigo_key UNIQUE (codigo);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tipos_contrato_pkey' AND conrelid='public.tipos_contrato'::regclass) THEN
    ALTER TABLE public.tipos_contrato ADD CONSTRAINT tipos_contrato_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_analise_credito_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_analise_credito_id_fkey FOREIGN KEY (analise_credito_id) REFERENCES analises_credito(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_conta_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES parceiros_comerciais(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_created_by_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_modalidade_renegociacao_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_modalidade_renegociacao_check CHECK (((modalidade_renegociacao IS NULL) OR ((modalidade_renegociacao >= 1) AND (modalidade_renegociacao <= 6))));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_nf_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_nf_id_fkey FOREIGN KEY (nf_id) REFERENCES nfs_emitidas(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_numero_parcela_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_numero_parcela_check CHECK ((numero_parcela > 0));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='titulo_a_receber_numero_titulo_key' AND conrelid='public.titulo_a_receber'::regclass) THEN
    ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_numero_titulo_key UNIQUE (numero_titulo);
  END IF;
END $$;
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_pedido_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='titulo_a_receber_pkey' AND conrelid='public.titulo_a_receber'::regclass) THEN
    ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_status_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_status_check CHECK ((status = ANY (ARRAY['aguardando_pagamento'::text, 'aguardando_envio_bling'::text, 'aguardando_emissao_nf'::text, 'vigente'::text, 'vigente_parcial'::text, 'pago'::text, 'pago_com_atraso'::text, 'pago_judicial'::text, 'vencido'::text, 'vencido_suspenso'::text, 'em_juridico'::text, 'renegociado'::text, 'baixado_por_perda'::text, 'cancelado'::text, 'cancelado_recuperacao'::text])));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_subestado_atraso_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_subestado_atraso_check CHECK ((subestado_atraso = ANY (ARRAY['em_dia'::text, 'atraso_d1_d5'::text, 'atraso_d6_d15'::text, 'atraso_d16_d30'::text, 'suspenso'::text, 'juridico'::text])));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_tipo_pagamento_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_tipo_pagamento_check CHECK ((tipo_pagamento = ANY (ARRAY['boleto'::text, 'pix'::text, 'cartao'::text, 'troca_mercadoria'::text])));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_titulo_pai_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_titulo_pai_id_fkey FOREIGN KEY (titulo_pai_id) REFERENCES titulo_a_receber(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_titulo_renegociado_origem_id_fkey;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_titulo_renegociado_origem_id_fkey FOREIGN KEY (titulo_renegociado_origem_id) REFERENCES titulo_a_receber(id);
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_total_parcelas_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_total_parcelas_check CHECK ((total_parcelas > 0));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_valor_bruto_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_valor_bruto_check CHECK ((valor_bruto > (0)::numeric));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_valor_correcao_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_valor_correcao_check CHECK ((valor_correcao >= (0)::numeric));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_valor_desconto_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_valor_desconto_check CHECK ((valor_desconto >= (0)::numeric));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_valor_juros_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_valor_juros_check CHECK ((valor_juros >= (0)::numeric));
ALTER TABLE public.titulo_a_receber DROP CONSTRAINT IF EXISTS titulo_a_receber_valor_multa_check;
ALTER TABLE public.titulo_a_receber ADD CONSTRAINT titulo_a_receber_valor_multa_check CHECK ((valor_multa >= (0)::numeric));
ALTER TABLE public.user_colaborador_link DROP CONSTRAINT IF EXISTS chk_pelo_menos_um_vinculo;
ALTER TABLE public.user_colaborador_link ADD CONSTRAINT chk_pelo_menos_um_vinculo CHECK (((colaborador_clt_id IS NOT NULL) OR (contrato_pj_id IS NOT NULL) OR (tipo_externo IS NOT NULL)));
ALTER TABLE public.user_colaborador_link DROP CONSTRAINT IF EXISTS user_colaborador_link_colaborador_clt_id_fkey;
ALTER TABLE public.user_colaborador_link ADD CONSTRAINT user_colaborador_link_colaborador_clt_id_fkey FOREIGN KEY (colaborador_clt_id) REFERENCES colaboradores_clt(id);
ALTER TABLE public.user_colaborador_link DROP CONSTRAINT IF EXISTS user_colaborador_link_contrato_pj_id_fkey;
ALTER TABLE public.user_colaborador_link ADD CONSTRAINT user_colaborador_link_contrato_pj_id_fkey FOREIGN KEY (contrato_pj_id) REFERENCES contratos_pj(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_colaborador_link_pkey' AND conrelid='public.user_colaborador_link'::regclass) THEN
    ALTER TABLE public.user_colaborador_link ADD CONSTRAINT user_colaborador_link_pkey PRIMARY KEY (user_id);
  END IF;
END $$;
ALTER TABLE public.user_colaborador_link DROP CONSTRAINT IF EXISTS user_colaborador_link_user_id_fkey;
ALTER TABLE public.user_colaborador_link ADD CONSTRAINT user_colaborador_link_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_colaborador_link DROP CONSTRAINT IF EXISTS user_colaborador_link_vinculado_por_fkey;
ALTER TABLE public.user_colaborador_link ADD CONSTRAINT user_colaborador_link_vinculado_por_fkey FOREIGN KEY (vinculado_por) REFERENCES auth.users(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_preferencias_navegacao_pkey' AND conrelid='public.user_preferencias_navegacao'::regclass) THEN
    ALTER TABLE public.user_preferencias_navegacao ADD CONSTRAINT user_preferencias_navegacao_pkey PRIMARY KEY (user_id);
  END IF;
END $$;
ALTER TABLE public.user_preferencias_navegacao DROP CONSTRAINT IF EXISTS user_preferencias_navegacao_tema_check;
ALTER TABLE public.user_preferencias_navegacao ADD CONSTRAINT user_preferencias_navegacao_tema_check CHECK ((tema = ANY (ARRAY['light'::text, 'dark'::text])));
ALTER TABLE public.user_preferencias_navegacao DROP CONSTRAINT IF EXISTS user_preferencias_navegacao_user_id_fkey;
ALTER TABLE public.user_preferencias_navegacao ADD CONSTRAINT user_preferencias_navegacao_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ========================= INDEXES (216) =========================
CREATE UNIQUE INDEX IF NOT EXISTS grupos_empresariais_cnpj_raiz_unique ON public.grupos_empresariais USING btree (cnpj_raiz) WHERE ((cnpj_raiz IS NOT NULL) AND (cnpj_raiz <> ''::text));
CREATE INDEX IF NOT EXISTS idx_analises_anterior ON public.analises_credito USING btree (analise_anterior_id);
CREATE INDEX IF NOT EXISTS idx_analises_estagio ON public.analises_credito USING btree (estagio_atual) WHERE (status_final IS NULL);
CREATE INDEX IF NOT EXISTS idx_analises_parceiro ON public.analises_credito USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_analises_pre_aprovadas ON public.analises_credito USING btree (pre_aprovacao_em DESC) WHERE ((pre_aprovado_regra_id IS NOT NULL) AND (status_final IS NULL));
CREATE INDEX IF NOT EXISTS idx_analises_validade ON public.analises_credito USING btree (validade_ate) WHERE (status_final = ANY (ARRAY['aprovado'::text, 'aprovado_com_ressalva'::text]));
CREATE INDEX IF NOT EXISTS idx_audit_delete_apagado_em ON public.contas_pagar_receber_audit_delete USING btree (apagado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_delete_conta_id ON public.contas_pagar_receber_audit_delete USING btree (conta_id);
CREATE INDEX IF NOT EXISTS idx_bling_envios_log_pedido ON public.bling_envios_log USING btree (pedido_id, tentativa_em DESC);
CREATE INDEX IF NOT EXISTS idx_bling_envios_log_sucesso_recente ON public.bling_envios_log USING btree (sucesso, tentativa_em DESC);
CREATE INDEX IF NOT EXISTS idx_boleto_stage_cpr_id ON public.boleto_stage USING btree (contas_pagar_receber_id) WHERE (contas_pagar_receber_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_boleto_stage_ged_documento_id ON public.boleto_stage USING btree (ged_documento_id);
CREATE INDEX IF NOT EXISTS idx_boleto_stage_match ON public.boleto_stage USING btree (parceiro_id, valor, vencimento) WHERE ((status = 'aguardando_ancoragem'::text) AND (parceiro_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_boleto_stage_parceiro_id ON public.boleto_stage USING btree (parceiro_id) WHERE (parceiro_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_boleto_stage_pasta_contrato_id ON public.boleto_stage USING btree (pasta_contrato_id) WHERE (pasta_contrato_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_boleto_stage_status ON public.boleto_stage USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cartoes_credito_conta_bancaria_id ON public.cartoes_credito USING btree (conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_pedido_autor ON public.comentarios_pedido USING btree (autor_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_pedido_created ON public.comentarios_pedido USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comentarios_pedido_pedido ON public.comentarios_pedido USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_comp_rec_categoria ON public.compromissos_recorrentes USING btree (plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_comp_rec_status ON public.compromissos_recorrentes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_compras_itens_substitui ON public.compras_registradas_itens USING btree (substitui_pedido_item_id) WHERE (substitui_pedido_item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compras_itens_tipo_linha ON public.compras_registradas_itens USING btree (tipo_linha) WHERE (status_linha = 'comprada'::text);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_anexos_compra ON public.compras_registradas_anexos USING btree (compra_registrada_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_anexos_tipo ON public.compras_registradas_anexos USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_audit_compra ON public.compras_registradas_audit_log USING btree (compra_registrada_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_audit_created ON public.compras_registradas_audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_comprador ON public.compras_registradas USING btree (comprador_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_conta ON public.compras_registradas USING btree (plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_itens_compra ON public.compras_registradas_itens USING btree (compra_registrada_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_itens_pedido_item ON public.compras_registradas_itens USING btree (pedido_item_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_parceiro ON public.compras_registradas USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_parcela_grupo ON public.compras_registradas USING btree (parcela_grupo_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_pedido ON public.compras_registradas USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_compras_registradas_status ON public.compras_registradas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_compromissos_descricao_norm ON public.compromissos_parcelados USING btree (descricao_normalizada);
CREATE INDEX IF NOT EXISTS idx_compromissos_parceiro ON public.compromissos_parcelados USING btree (parceiro_id) WHERE (parceiro_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compromissos_parcelados_centro_custo_id ON public.compromissos_parcelados USING btree (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_compromissos_status ON public.compromissos_parcelados USING btree (status) WHERE (status = 'ativo'::text);
CREATE INDEX IF NOT EXISTS idx_config_financeiro_externo_propositos ON public.config_financeiro_externo USING gin (propositos);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_compromisso ON public.contas_pagar_receber USING btree (compromisso_parcelado_id) WHERE (compromisso_parcelado_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_nf_aplicavel ON public.contas_pagar_receber USING btree (nf_aplicavel) WHERE (nf_aplicavel = true);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_previstas ON public.contas_pagar_receber USING btree (status, data_vencimento) WHERE (status = 'previsto'::text);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_receber_comp_recorrente ON public.contas_pagar_receber USING btree (compromisso_recorrente_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_receber_deleted_at ON public.contas_pagar_receber USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_cpd_conta ON public.contas_pagar_documentos USING btree (conta_pagar_id);
CREATE INDEX IF NOT EXISTS idx_cpd_tipo ON public.contas_pagar_documentos USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_cpgr_canal_venda ON public.contas_pagar_receber USING btree (canal_venda_id) WHERE (canal_venda_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpgr_centro_custo ON public.contas_pagar_receber USING btree (centro_custo_id) WHERE (centro_custo_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpgr_unidade ON public.contas_pagar_receber USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpi_conta ON public.contas_pagar_itens USING btree (conta_pagar_id);
CREATE INDEX IF NOT EXISTS idx_cpi_plano ON public.contas_pagar_itens USING btree (plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_cpr_cartao_id ON public.contas_pagar_receber USING btree (cartao_id);
CREATE INDEX IF NOT EXISTS idx_cpr_centro_custo ON public.contas_pagar_receber USING btree (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_cpr_compra_registrada ON public.contas_pagar_receber USING btree (compra_registrada_id) WHERE (compra_registrada_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_conta ON public.contas_pagar_receber USING btree (plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_cpr_data_compra ON public.contas_pagar_receber USING btree (data_compra) WHERE (data_compra IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_duplicado_check ON public.contas_pagar_receber USING btree (parceiro_id, valor, data_vencimento, status) WHERE ((parceiro_id IS NOT NULL) AND (status <> 'cancelado'::text));
CREATE INDEX IF NOT EXISTS idx_cpr_linha_investimento ON public.contas_pagar_receber USING btree (linha_investimento_id) WHERE (linha_investimento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_nf_chave ON public.contas_pagar_receber USING btree (nf_chave_acesso) WHERE (nf_chave_acesso IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_nfs_stage_documento_id ON public.contas_pagar_receber USING btree (nfs_stage_documento_id) WHERE (nfs_stage_documento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_origem ON public.contas_pagar_receber USING btree (origem);
CREATE INDEX IF NOT EXISTS idx_cpr_pago_em_conta ON public.contas_pagar_receber USING btree (pago_em_conta_id) WHERE (pago_em_conta_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_parceiro ON public.contas_pagar_receber USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_cpr_pasta_contrato ON public.contas_pagar_receber USING btree (pasta_contrato_id);
CREATE INDEX IF NOT EXISTS idx_cpr_pasta_parcela ON public.contas_pagar_receber USING btree (pasta_contrato_parcela_id) WHERE (pasta_contrato_parcela_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_pedido_compra ON public.contas_pagar_receber USING btree (pedido_compra_id) WHERE (pedido_compra_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_reembolsa_user_id ON public.contas_pagar_receber USING btree (reembolsa_user_id) WHERE (reembolsa_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cpr_status ON public.contas_pagar_receber USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cpr_status_caixa ON public.contas_pagar_receber USING btree (tipo, status) WHERE ((tipo = 'pagar'::text) AND (status = ANY (ARRAY['finalizado'::text, 'doc_pendente'::text])));
CREATE INDEX IF NOT EXISTS idx_cpr_tipo ON public.contas_pagar_receber USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_cpr_vencimento ON public.contas_pagar_receber USING btree (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_evento_titulo_tipo ON public.evento_titulo USING btree (tipo_evento);
CREATE INDEX IF NOT EXISTS idx_evento_titulo_titulo ON public.evento_titulo USING btree (titulo_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_evento_titulo_ts ON public.evento_titulo USING btree (ts DESC);
CREATE INDEX IF NOT EXISTS idx_fatura_cartao_lancamentos_centro_custo_id ON public.fatura_cartao_lancamentos USING btree (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_fatura_lancamento_conta_pagar ON public.fatura_cartao_lancamentos USING btree (conta_pagar_id) WHERE (conta_pagar_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_conta_bancaria ON public.faturas_cartao USING btree (conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_status ON public.faturas_cartao USING btree (status) WHERE (status = ANY (ARRAY['aberta'::text, 'paga'::text]));
CREATE INDEX IF NOT EXISTS idx_faturas_cartao_vencimento ON public.faturas_cartao USING btree (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_ged_doc_busca ON public.ged_documentos USING gin (to_tsvector('portuguese'::regconfig, ((((COALESCE(nome, ''::text) || ' '::text) || COALESCE(descricao, ''::text)) || ' '::text) || COALESCE(resumo_ia, ''::text))));
CREATE INDEX IF NOT EXISTS idx_ged_doc_parceiro ON public.ged_documentos USING btree (parceiro_id) WHERE (parceiro_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ged_doc_pasta ON public.ged_documentos USING btree (pasta_id);
CREATE INDEX IF NOT EXISTS idx_ged_doc_pasta_contrato ON public.ged_documentos USING btree (pasta_contrato_id) WHERE (pasta_contrato_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ged_doc_tags ON public.ged_documentos USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_ged_doc_tipo ON public.ged_documentos USING btree (tipo_documento);
CREATE INDEX IF NOT EXISTS idx_ged_documentos_hash_arquivo ON public.ged_documentos USING btree (hash_arquivo) WHERE (hash_arquivo IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ged_documentos_lote_id ON public.ged_documentos USING btree (lote_id) WHERE (lote_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ged_documentos_nfs_stage_id ON public.ged_documentos USING btree (nfs_stage_id);
CREATE INDEX IF NOT EXISTS idx_ged_documentos_resolucao_pendente ON public.ged_documentos USING btree (parceiro_resolucao_pendente) WHERE (parceiro_resolucao_pendente = true);
CREATE INDEX IF NOT EXISTS idx_ged_documentos_status_classificacao ON public.ged_documentos USING btree (status_classificacao);
CREATE INDEX IF NOT EXISTS idx_ged_pastas_area_id ON public.ged_pastas USING btree (area_id);
CREATE INDEX IF NOT EXISTS idx_ged_pastas_ativa ON public.ged_pastas USING btree (ativa) WHERE (ativa = true);
CREATE INDEX IF NOT EXISTS idx_ged_pastas_parceiro ON public.ged_pastas USING btree (parceiro_id) WHERE (parceiro_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ged_pastas_parent_id ON public.ged_pastas USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_ged_vinculo_doc ON public.ged_documento_vinculos USING btree (documento_id);
CREATE INDEX IF NOT EXISTS idx_ged_vinculo_entidade ON public.ged_documento_vinculos USING btree (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_grupo_acesso_permissoes_grupo ON public.grupo_acesso_permissoes USING btree (grupo_acesso_id);
CREATE INDEX IF NOT EXISTS idx_grupo_acesso_permissoes_perm ON public.grupo_acesso_permissoes USING btree (permissao_id);
CREATE INDEX IF NOT EXISTS idx_grupo_acesso_usuarios_grupo ON public.grupo_acesso_usuarios USING btree (grupo_acesso_id);
CREATE INDEX IF NOT EXISTS idx_grupo_acesso_usuarios_user ON public.grupo_acesso_usuarios USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_grupos_log_mudou_em ON public.grupos_parceiros_log USING btree (mudou_em DESC);
CREATE INDEX IF NOT EXISTS idx_grupos_log_parceiro ON public.grupos_parceiros_log USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_itau_pag_cnpj ON public.itau_pagamentos_stage USING btree (cnpj_favorecido);
CREATE INDEX IF NOT EXISTS idx_itau_pag_importacao ON public.itau_pagamentos_stage USING btree (importacao_id);
CREATE INDEX IF NOT EXISTS idx_itau_pag_lote ON public.itau_pagamentos_stage USING btree (numero_lote) WHERE ((numero_lote IS NOT NULL) AND (numero_lote <> '-'::text));
CREATE INDEX IF NOT EXISTS idx_itau_pag_status ON public.itau_pagamentos_stage USING btree (status_conciliacao);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao_compromisso ON public.fatura_cartao_lancamentos USING btree (compromisso_parcelado_id) WHERE (compromisso_parcelado_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao_fatura ON public.fatura_cartao_lancamentos USING btree (fatura_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao_parceiro ON public.fatura_cartao_lancamentos USING btree (parceiro_id) WHERE (parceiro_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lancamentos_cartao_status ON public.fatura_cartao_lancamentos USING btree (status) WHERE (status = ANY (ARRAY['pendente'::text, 'classificado'::text]));
CREATE INDEX IF NOT EXISTS idx_mov_bancarias_ofx_transacao_id ON public.movimentacoes_bancarias USING btree (ofx_transacao_id);
CREATE INDEX IF NOT EXISTS idx_mov_cartao_id ON public.movimentacoes_bancarias USING btree (cartao_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_bancarias_data ON public.movimentacoes_bancarias USING btree (conta_bancaria_id, data_transacao DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_bancarias_fitid ON public.movimentacoes_bancarias USING btree (conta_bancaria_id, id_transacao_banco) WHERE (id_transacao_banco IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_bancarias_nao_conciliado ON public.movimentacoes_bancarias USING btree (conta_bancaria_id, data_transacao DESC) WHERE ((conciliado = false) OR (conciliado IS NULL));
CREATE INDEX IF NOT EXISTS idx_nfs_emitidas_data_emissao ON public.nfs_emitidas USING btree (data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_nfs_emitidas_parceiro ON public.nfs_emitidas USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_nfs_emitidas_pedido_venda ON public.nfs_emitidas USING btree (pedido_venda_id) WHERE (pedido_venda_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_chave ON public.nfs_stage USING btree (nf_chave_acesso) WHERE (nf_chave_acesso IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_cnpj_numero ON public.nfs_stage USING btree (fornecedor_cnpj, nf_numero) WHERE ((fornecedor_cnpj IS NOT NULL) AND (nf_numero IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_nfs_stage_documentos_ged_documento_id ON public.nfs_stage_documentos USING btree (ged_documento_id) WHERE (ged_documento_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_documentos_stage ON public.nfs_stage_documentos USING btree (nfs_stage_id);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_lote ON public.nfs_stage USING btree (importacao_lote_id);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_resumo_pendente ON public.nfs_stage USING btree (resumo_pdf_pendente) WHERE (resumo_pdf_pendente = true);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_status ON public.nfs_stage USING btree (status) WHERE (status = ANY (ARRAY['pendente'::text, 'classificada'::text]));
CREATE INDEX IF NOT EXISTS idx_nfs_stage_sugerida_ia ON public.nfs_stage USING btree (categoria_sugerida_ia) WHERE (categoria_sugerida_ia = true);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_venda_aberto ON public.nfs_stage_venda USING btree (created_at DESC) WHERE (status = ANY (ARRAY['aguardando_matching'::text, 'divergencia'::text]));
CREATE INDEX IF NOT EXISTS idx_nfs_stage_venda_pedido ON public.nfs_stage_venda USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_nfs_stage_venda_status ON public.nfs_stage_venda USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ofx_imp_stage_conta ON public.ofx_importacoes_stage USING btree (conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_ofx_imp_stage_status ON public.ofx_importacoes_stage USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ofx_regras_ativo ON public.ofx_regras_automaticas USING btree (ativo) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_ofx_tx_stage_hash ON public.ofx_transacoes_stage USING btree (hash_unico);
CREATE INDEX IF NOT EXISTS idx_ofx_tx_stage_imp ON public.ofx_transacoes_stage USING btree (importacao_stage_id);
CREATE INDEX IF NOT EXISTS idx_ofx_tx_stage_status ON public.ofx_transacoes_stage USING btree (status);
CREATE INDEX IF NOT EXISTS idx_parceiros_bandeira_vermelha ON public.parceiros_comerciais USING btree (bandeira_vermelha) WHERE (bandeira_vermelha = true);
CREATE INDEX IF NOT EXISTS idx_parceiros_bling ON public.parceiros_comerciais USING btree (bling_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_canal_venda ON public.parceiros_comerciais USING btree (canal_venda_id) WHERE (canal_venda_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_parceiros_centro_custo ON public.parceiros_comerciais USING btree (centro_custo_id) WHERE (centro_custo_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_parceiros_cnpj ON public.parceiros_comerciais USING btree (cnpj);
CREATE INDEX IF NOT EXISTS idx_parceiros_cpf ON public.parceiros_comerciais USING btree (cpf) WHERE (cpf IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_parceiros_forma_pagamento_padrao ON public.parceiros_comerciais USING btree (forma_pagamento_padrao_id) WHERE (forma_pagamento_padrao_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_parceiros_grupo ON public.parceiros_comerciais USING btree (grupo_id) WHERE (grupo_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_parceiros_grupo_economico ON public.parceiros_comerciais USING btree (grupo_economico_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_perfil_credito ON public.parceiros_comerciais USING btree (perfil_credito);
CREATE INDEX IF NOT EXISTS idx_parceiros_razao ON public.parceiros_comerciais USING btree (razao_social);
CREATE INDEX IF NOT EXISTS idx_parceiros_tipos ON public.parceiros_comerciais USING gin (tipos);
CREATE INDEX IF NOT EXISTS idx_pasta_contratos_linha_investimento_id ON public.pasta_contratos USING btree (linha_investimento_id);
CREATE INDEX IF NOT EXISTS idx_pasta_contratos_pasta ON public.pasta_contratos USING btree (pasta_id);
CREATE INDEX IF NOT EXISTS idx_pasta_contratos_status ON public.pasta_contratos USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pasta_contratos_tipo_contrato_id ON public.pasta_contratos USING btree (tipo_contrato_id);
CREATE INDEX IF NOT EXISTS idx_pasta_contratos_vigencia_fim ON public.pasta_contratos USING btree (vigencia_fim) WHERE (vigencia_fim IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pasta_hist_contrato ON public.pasta_historico USING btree (contrato_id) WHERE (contrato_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pasta_hist_pasta ON public.pasta_historico USING btree (pasta_id, data_evento DESC);
CREATE INDEX IF NOT EXISTS idx_pcp_contrato ON public.pasta_contrato_parcelas USING btree (contrato_id);
CREATE INDEX IF NOT EXISTS idx_pcp_status ON public.pasta_contrato_parcelas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pcp_vencimento ON public.pasta_contrato_parcelas USING btree (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido ON public.pedido_eventos USING btree (pedido_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_eventos_tipo ON public.pedido_eventos USING btree (tipo_evento);
CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido ON public.pedido_itens USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_transicoes_acao ON public.pedido_transicoes USING btree (acao);
CREATE INDEX IF NOT EXISTS idx_pedido_transicoes_pedido ON public.pedido_transicoes USING btree (pedido_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_analise_status ON public.pedidos USING btree (analise_pedido_status) WHERE (estagio <> ALL (ARRAY['faturado'::text, 'entregue'::text, 'cancelado'::text]));
CREATE INDEX IF NOT EXISTS idx_pedidos_area_atual ON public.pedidos USING btree (area_atual) WHERE (area_atual <> 'nenhuma'::text);
CREATE INDEX IF NOT EXISTS idx_pedidos_ativos ON public.pedidos USING btree (estagio) WHERE (estagio <> ALL (ARRAY['entregue'::text, 'cancelado'::text, 'recuperacao_venda'::text]));
CREATE INDEX IF NOT EXISTS idx_pedidos_bling_id_destino ON public.pedidos USING btree (bling_id_destino) WHERE (bling_id_destino IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_anexos_pedido ON public.pedidos_compra_anexos USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_anexos_tipo ON public.pedidos_compra_anexos USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_centro_custo ON public.pedidos_compra USING btree (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_comprador ON public.pedidos_compra USING btree (comprador_id) WHERE (comprador_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_created_at ON public.pedidos_compra USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_eventos_created ON public.pedidos_compra_eventos USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_eventos_pedido ON public.pedidos_compra_eventos USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_eventos_tipo ON public.pedidos_compra_eventos USING btree (tipo);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_itens_pedido ON public.pedidos_compra_itens USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_itens_status ON public.pedidos_compra_itens USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_solicitante ON public.pedidos_compra USING btree (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_status ON public.pedidos_compra USING btree (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_credito_data ON public.pedidos USING btree (data_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_credito_parceiro ON public.pedidos USING btree (parceiro_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estagio ON public.pedidos USING btree (estagio) WHERE (estagio <> ALL (ARRAY['faturado'::text, 'entregue'::text, 'cancelado'::text]));
CREATE INDEX IF NOT EXISTS idx_pedidos_prioridade ON public.pedidos USING btree (prioridade_score DESC) WHERE (estagio <> ALL (ARRAY['faturado'::text, 'entregue'::text, 'cancelado'::text]));
CREATE INDEX IF NOT EXISTS idx_pedidos_recebido_em ON public.pedidos USING btree (recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_permissoes_catalogo_pilar ON public.permissoes_catalogo USING btree (pilar) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_permissoes_catalogo_slug ON public.permissoes_catalogo USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_regras_cadencia_ativas_ordem ON public.regras_cadencia_credito USING btree (ordem, criado_em DESC) WHERE (ativa = true);
CREATE INDEX IF NOT EXISTS idx_regras_cnpj_emitente ON public.regras_categorizacao USING btree (cnpj_emitente) WHERE ((cnpj_emitente IS NOT NULL) AND (ativo = true));
CREATE INDEX IF NOT EXISTS idx_regras_confianca ON public.regras_categorizacao USING btree (confianca DESC) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_regras_descricao_contem ON public.regras_categorizacao USING btree (descricao_contem) WHERE ((descricao_contem IS NOT NULL) AND (ativo = true));
CREATE INDEX IF NOT EXISTS idx_regras_escopo ON public.regras_categorizacao USING btree (escopo_origem) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_regras_ofx_ativa_conta ON public.regras_automaticas_ofx USING btree (ativa, conta_bancaria_id) WHERE (ativa = true);
CREATE INDEX IF NOT EXISTS idx_regras_ofx_created ON public.regras_automaticas_ofx USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_regras_parceiro ON public.regras_categorizacao USING btree (parceiro_id) WHERE ((parceiro_id IS NOT NULL) AND (ativo = true));
CREATE INDEX IF NOT EXISTS idx_regras_token ON public.regras_categorizacao USING btree (token_principal) WHERE ((token_principal IS NOT NULL) AND (ativo = true));
CREATE INDEX IF NOT EXISTS idx_remessas_enviada_em ON public.remessas_contador USING btree (enviada_em DESC);
CREATE INDEX IF NOT EXISTS idx_remessas_itens_conta ON public.remessas_contador_itens USING btree (conta_id);
CREATE INDEX IF NOT EXISTS idx_remessas_itens_remessa ON public.remessas_contador_itens USING btree (remessa_id);
CREATE INDEX IF NOT EXISTS idx_remessas_periodo ON public.remessas_contador USING btree (periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_titulo_aguardando_pgto ON public.titulo_a_receber USING btree (conta_id, status) WHERE (status = 'aguardando_pagamento'::text);
CREATE INDEX IF NOT EXISTS idx_titulo_conta ON public.titulo_a_receber USING btree (conta_id);
CREATE INDEX IF NOT EXISTS idx_titulo_entrada ON public.titulo_a_receber USING btree (pedido_id) WHERE (eh_entrada = true);
CREATE INDEX IF NOT EXISTS idx_titulo_nf ON public.titulo_a_receber USING btree (nf_id) WHERE (nf_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_titulo_pedido ON public.titulo_a_receber USING btree (pedido_id);
CREATE INDEX IF NOT EXISTS idx_titulo_status ON public.titulo_a_receber USING btree (status);
CREATE INDEX IF NOT EXISTS idx_titulo_vencimento ON public.titulo_a_receber USING btree (data_vencimento_atual) WHERE (status = ANY (ARRAY['vigente'::text, 'vigente_parcial'::text, 'vencido'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS parceiros_comerciais_cnpj_unique ON public.parceiros_comerciais USING btree (cnpj) WHERE ((cnpj IS NOT NULL) AND (cnpj <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cpr_fatura_cartao ON public.contas_pagar_receber USING btree (descricao, valor, data_vencimento) WHERE ((origem = 'fatura_cartao'::text) AND (status <> 'cancelado'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cpr_parceiro_cnpj_num_valor ON public.contas_pagar_receber USING btree (parceiro_id, nf_cnpj_emitente, normalizar_numero_nf(nf_numero), valor) WHERE ((nf_chave_acesso IS NULL) AND (parceiro_id IS NOT NULL) AND (nf_cnpj_emitente IS NOT NULL) AND (nf_numero IS NOT NULL) AND (status <> 'cancelado'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nfs_stage_chave_ativa ON public.nfs_stage USING btree (nf_chave_acesso) WHERE ((nf_chave_acesso IS NOT NULL) AND (status <> ALL (ARRAY['descartada'::text, 'duplicata'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nfs_stage_cnpj_numero_ativa ON public.nfs_stage USING btree (fornecedor_cnpj, nf_numero) WHERE ((nf_chave_acesso IS NULL) AND (fornecedor_cnpj IS NOT NULL) AND (nf_numero IS NOT NULL) AND (status <> ALL (ARRAY['descartada'::text, 'duplicata'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ged_pastas_parceiro_raiz_ativa ON public.ged_pastas USING btree (parceiro_id) WHERE ((ativa = true) AND (parent_id IS NULL) AND (parceiro_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_itau_pagamentos_movimentacao_unica ON public.itau_pagamentos_stage USING btree (movimentacao_id) WHERE (movimentacao_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nfs_stage_documentos_tipo ON public.nfs_stage_documentos USING btree (nfs_stage_id, tipo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recibo_estrangeiro ON public.nfs_stage USING btree (fornecedor_razao_social, nf_numero, valor) WHERE ((tipo_documento = 'recibo'::text) AND (fornecedor_cnpj IS NULL) AND (nf_chave_acesso IS NULL));

-- ========================= TRIGGERS (72) =========================
DROP TRIGGER IF EXISTS comentarios_pedido_set_updated_at ON public.comentarios_pedido;
CREATE TRIGGER comentarios_pedido_set_updated_at BEFORE UPDATE ON comentarios_pedido FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS compras_registradas_set_updated_at ON public.compras_registradas;
CREATE TRIGGER compras_registradas_set_updated_at BEFORE UPDATE ON compras_registradas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS pedidos_compra_itens_transicao_pedido ON public.pedidos_compra_itens;
CREATE TRIGGER pedidos_compra_itens_transicao_pedido AFTER UPDATE OF status ON pedidos_compra_itens FOR EACH ROW EXECUTE FUNCTION fn_transicao_pedido_compra_apos_item();
DROP TRIGGER IF EXISTS pedidos_compra_set_updated_at ON public.pedidos_compra;
CREATE TRIGGER pedidos_compra_set_updated_at BEFORE UPDATE ON pedidos_compra FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS recalc_docs_status_anexo ON public.contas_pagar_documentos;
CREATE TRIGGER recalc_docs_status_anexo AFTER INSERT OR DELETE OR UPDATE ON contas_pagar_documentos FOR EACH ROW EXECUTE FUNCTION trg_recalc_docs_status_anexo();
DROP TRIGGER IF EXISTS recalc_docs_status_conta ON public.contas_pagar_receber;
CREATE TRIGGER recalc_docs_status_conta BEFORE UPDATE ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION trg_recalc_docs_status_conta();
DROP TRIGGER IF EXISTS tr_pedido_para_analise_credito ON public.pedidos;
CREATE TRIGGER tr_pedido_para_analise_credito AFTER INSERT OR UPDATE OF estagio ON pedidos FOR EACH ROW EXECUTE FUNCTION fn_tg_pedido_para_analise_credito();
DROP TRIGGER IF EXISTS tr_pedido_pular_analise ON public.pedidos;
CREATE TRIGGER tr_pedido_pular_analise AFTER UPDATE OF estagio ON pedidos FOR EACH ROW WHEN (new.estagio = 'credito_aprovado'::text AND old.estagio = 'recebido'::text) EXECUTE FUNCTION fn_tg_pedido_pular_analise();
DROP TRIGGER IF EXISTS trg_analise_aplicar_cadencia ON public.analises_credito;
CREATE TRIGGER trg_analise_aplicar_cadencia AFTER INSERT ON analises_credito FOR EACH ROW EXECUTE FUNCTION fn_tg_analise_aplicar_cadencia();
DROP TRIGGER IF EXISTS trg_analise_aprovada_avanca_pedido ON public.analises_credito;
CREATE TRIGGER trg_analise_aprovada_avanca_pedido AFTER UPDATE OF status_final ON analises_credito FOR EACH ROW EXECUTE FUNCTION fn_trg_analise_aprovada_avanca_pedido();
DROP TRIGGER IF EXISTS trg_aplicar_regras_stage_insert ON public.nfs_stage;
CREATE TRIGGER trg_aplicar_regras_stage_insert AFTER INSERT ON nfs_stage FOR EACH ROW EXECUTE FUNCTION trg_aplicar_regras_stage();
DROP TRIGGER IF EXISTS trg_aprender_classificacao_stage ON public.nfs_stage;
CREATE TRIGGER trg_aprender_classificacao_stage AFTER UPDATE OF plano_contas_id ON nfs_stage FOR EACH ROW EXECUTE FUNCTION trg_aprender_classificacao_stage();
DROP TRIGGER IF EXISTS trg_boleto_stage_updated_at ON public.boleto_stage;
CREATE TRIGGER trg_boleto_stage_updated_at BEFORE UPDATE ON boleto_stage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_compra_finalizada_propagar ON public.compras_registradas;
CREATE TRIGGER trg_compra_finalizada_propagar AFTER UPDATE OF status ON compras_registradas FOR EACH ROW EXECUTE FUNCTION fn_compra_finalizada_propagar();
DROP TRIGGER IF EXISTS trg_compromissos_recorrentes_updated_at ON public.compromissos_recorrentes;
CREATE TRIGGER trg_compromissos_recorrentes_updated_at BEFORE UPDATE ON compromissos_recorrentes FOR EACH ROW EXECUTE FUNCTION trigger_compromissos_recorrentes_updated_at();
DROP TRIGGER IF EXISTS trg_cpr_doc_para_ged ON public.contas_pagar_documentos;
CREATE TRIGGER trg_cpr_doc_para_ged AFTER INSERT ON contas_pagar_documentos FOR EACH ROW EXECUTE FUNCTION fn_cpr_doc_para_ged();
DROP TRIGGER IF EXISTS trg_cpr_enviada_para_pagamento ON public.contas_pagar_receber;
CREATE TRIGGER trg_cpr_enviada_para_pagamento BEFORE UPDATE ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_cpr_enviada_para_pagamento();
DROP TRIGGER IF EXISTS trg_cpr_recalc_nf ON public.contas_pagar_receber;
CREATE TRIGGER trg_cpr_recalc_nf AFTER INSERT OR UPDATE ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_trg_cpr_recalc_nf();
DROP TRIGGER IF EXISTS trg_cpr_set_meio_default ON public.contas_pagar_receber;
CREATE TRIGGER trg_cpr_set_meio_default BEFORE INSERT OR UPDATE OF forma_pagamento_id ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_cpr_set_meio_default();
DROP TRIGGER IF EXISTS trg_criar_pasta_para_parceiro ON public.parceiros_comerciais;
CREATE TRIGGER trg_criar_pasta_para_parceiro AFTER INSERT ON parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION fn_criar_pasta_para_parceiro();
DROP TRIGGER IF EXISTS trg_detectar_inconsistencia_categoria ON public.contas_pagar_receber;
CREATE TRIGGER trg_detectar_inconsistencia_categoria AFTER UPDATE OF plano_contas_id ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_detectar_inconsistencia_categoria();
DROP TRIGGER IF EXISTS trg_docs_status ON public.contas_pagar_documentos;
CREATE TRIGGER trg_docs_status AFTER INSERT OR DELETE OR UPDATE ON contas_pagar_documentos FOR EACH ROW EXECUTE FUNCTION atualizar_docs_status();
DROP TRIGGER IF EXISTS trg_ged_documentos_updated_at ON public.ged_documentos;
CREATE TRIGGER trg_ged_documentos_updated_at BEFORE UPDATE ON ged_documentos FOR EACH ROW EXECUTE FUNCTION tg_ged_updated_at();
DROP TRIGGER IF EXISTS trg_ged_pasta_check_no_loop ON public.ged_pastas;
CREATE TRIGGER trg_ged_pasta_check_no_loop BEFORE INSERT OR UPDATE OF parent_id ON ged_pastas FOR EACH ROW EXECUTE FUNCTION fn_ged_pasta_check_no_loop();
DROP TRIGGER IF EXISTS trg_ged_pastas_updated_at ON public.ged_pastas;
CREATE TRIGGER trg_ged_pastas_updated_at BEFORE UPDATE ON ged_pastas FOR EACH ROW EXECUTE FUNCTION tg_ged_updated_at();
DROP TRIGGER IF EXISTS trg_gerar_mov_ao_pagar ON public.contas_pagar_receber;
CREATE TRIGGER trg_gerar_mov_ao_pagar AFTER UPDATE OF status ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_gerar_mov_ao_pagar();
DROP TRIGGER IF EXISTS trg_grupo_propagar_vinculo ON public.grupos_empresariais;
CREATE TRIGGER trg_grupo_propagar_vinculo AFTER INSERT OR UPDATE OF cnpj_raiz, ativo ON grupos_empresariais FOR EACH ROW EXECUTE FUNCTION fn_grupo_propagar_vinculo();
DROP TRIGGER IF EXISTS trg_grupos_empresariais_updated_at ON public.grupos_empresariais;
CREATE TRIGGER trg_grupos_empresariais_updated_at BEFORE UPDATE ON grupos_empresariais FOR EACH ROW EXECUTE FUNCTION _set_updated_at_grupos_empresariais();
DROP TRIGGER IF EXISTS trg_historico_origem_criacao ON public.contas_pagar_receber;
CREATE TRIGGER trg_historico_origem_criacao AFTER INSERT ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_registrar_historico_origem_conta();
DROP TRIGGER IF EXISTS trg_ia_sugerir_categoria ON public.contas_pagar_receber;
CREATE TRIGGER trg_ia_sugerir_categoria AFTER INSERT ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_ia_sugerir_categoria_no_insert();
DROP TRIGGER IF EXISTS trg_ia_sugerir_nf ON public.nfs_stage;
CREATE TRIGGER trg_ia_sugerir_nf AFTER INSERT ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_ia_sugerir_nf_no_insert();
DROP TRIGGER IF EXISTS trg_log_mudanca_grupo ON public.parceiros_comerciais;
CREATE TRIGGER trg_log_mudanca_grupo AFTER UPDATE OF grupo_id ON parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION log_mudanca_grupo_parceiro();
DROP TRIGGER IF EXISTS trg_nf_emitida_avanca_pedido ON public.nfs_emitidas;
CREATE TRIGGER trg_nf_emitida_avanca_pedido AFTER INSERT OR UPDATE OF situacao, pedido_venda_id ON nfs_emitidas FOR EACH ROW EXECUTE FUNCTION fn_trg_nf_emitida_avanca_pedido();
DROP TRIGGER IF EXISTS trg_nf_stage_criar_documento_e_match ON public.nfs_stage;
CREATE TRIGGER trg_nf_stage_criar_documento_e_match AFTER INSERT ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_nf_stage_criar_documento_e_match();
DROP TRIGGER IF EXISTS trg_nf_stage_resolver_parceiro ON public.nfs_stage;
CREATE TRIGGER trg_nf_stage_resolver_parceiro BEFORE INSERT ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_nf_stage_resolver_parceiro();
DROP TRIGGER IF EXISTS trg_nf_verdade_absoluta ON public.nfs_stage;
CREATE TRIGGER trg_nf_verdade_absoluta AFTER UPDATE OF plano_contas_id ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_nf_propagar_para_tudo();
DROP TRIGGER IF EXISTS trg_nfs_stage_doc_resumo_pendente ON public.nfs_stage_documentos;
CREATE TRIGGER trg_nfs_stage_doc_resumo_pendente AFTER INSERT ON nfs_stage_documentos FOR EACH ROW EXECUTE FUNCTION trg_marcar_resumo_nfe_pendente();
DROP TRIGGER IF EXISTS trg_nfs_stage_propagar_tags ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_propagar_tags AFTER INSERT OR DELETE OR UPDATE ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_trg_nfs_stage_propagar_tags();
DROP TRIGGER IF EXISTS trg_nfs_stage_recalc_cpr ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_recalc_cpr AFTER INSERT OR DELETE OR UPDATE ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_trg_nfs_stage_recalc_cpr();
DROP TRIGGER IF EXISTS trg_nfs_stage_recalc_proprio_status ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_recalc_proprio_status AFTER INSERT OR UPDATE OF conta_pagar_id ON nfs_stage FOR EACH ROW EXECUTE FUNCTION tg_nfs_stage_recalc_proprio_status();
DROP TRIGGER IF EXISTS trg_nfs_stage_recalc_status ON public.nfs_stage;
CREATE TRIGGER trg_nfs_stage_recalc_status AFTER INSERT OR DELETE OR UPDATE OF conta_pagar_id ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_trg_nfs_stage_recalc_status();
DROP TRIGGER IF EXISTS trg_parceiro_after_insert_enriquecer ON public.parceiros_comerciais;
CREATE TRIGGER trg_parceiro_after_insert_enriquecer AFTER INSERT ON parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION fn_parceiro_after_insert_enriquecer();
DROP TRIGGER IF EXISTS trg_parceiro_classificacao_changed ON public.parceiros_comerciais;
CREATE TRIGGER trg_parceiro_classificacao_changed AFTER UPDATE ON parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION fn_parceiro_classificacao_changed();
DROP TRIGGER IF EXISTS trg_parceiro_resolver_grupo_e_completude ON public.parceiros_comerciais;
CREATE TRIGGER trg_parceiro_resolver_grupo_e_completude BEFORE INSERT OR UPDATE OF cnpj, cpf, grupo_id, tags, tipo_pessoa ON parceiros_comerciais FOR EACH ROW EXECUTE FUNCTION fn_parceiro_resolver_grupo_e_completude();
DROP TRIGGER IF EXISTS trg_pasta_contratos_updated_at ON public.pasta_contratos;
CREATE TRIGGER trg_pasta_contratos_updated_at BEFORE UPDATE ON pasta_contratos FOR EACH ROW EXECUTE FUNCTION tg_ged_updated_at();
DROP TRIGGER IF EXISTS trg_pedido_after_insert ON public.pedidos;
CREATE TRIGGER trg_pedido_after_insert AFTER INSERT ON pedidos FOR EACH ROW EXECUTE FUNCTION fn_pedido_after_insert();
DROP TRIGGER IF EXISTS trg_pedido_avanca_para_cobranca ON public.pedidos;
CREATE TRIGGER trg_pedido_avanca_para_cobranca AFTER UPDATE OF estagio ON pedidos FOR EACH ROW WHEN (new.estagio = 'credito_aprovado'::text AND old.estagio IS DISTINCT FROM new.estagio) EXECUTE FUNCTION fn_tg_pedido_avanca_para_cobranca();
DROP TRIGGER IF EXISTS trg_pedido_doc_para_ged ON public.pedidos_compra_anexos;
CREATE TRIGGER trg_pedido_doc_para_ged AFTER INSERT ON pedidos_compra_anexos FOR EACH ROW EXECUTE FUNCTION fn_pedido_doc_para_ged();
DROP TRIGGER IF EXISTS trg_pedido_pre_faturado_gera_titulos ON public.pedidos;
CREATE TRIGGER trg_pedido_pre_faturado_gera_titulos AFTER UPDATE OF estagio ON pedidos FOR EACH ROW EXECUTE FUNCTION fn_trg_pedido_pre_faturado_gera_titulos();
DROP TRIGGER IF EXISTS trg_popular_data_compra ON public.contas_pagar_receber;
CREATE TRIGGER trg_popular_data_compra BEFORE INSERT ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_popular_data_compra_de_compromisso();
DROP TRIGGER IF EXISTS trg_propagar_cat_cartao_conta ON public.fatura_cartao_lancamentos;
CREATE TRIGGER trg_propagar_cat_cartao_conta AFTER UPDATE OF plano_contas_id ON fatura_cartao_lancamentos FOR EACH ROW EXECUTE FUNCTION fn_propagar_categoria_cartao_para_conta();
DROP TRIGGER IF EXISTS trg_propagar_cat_conta_cartao ON public.contas_pagar_receber;
CREATE TRIGGER trg_propagar_cat_conta_cartao AFTER UPDATE OF plano_contas_id ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_propagar_categoria_conta_para_cartao();
DROP TRIGGER IF EXISTS trg_propagar_categoria_cnpj ON public.nfs_stage;
CREATE TRIGGER trg_propagar_categoria_cnpj BEFORE INSERT ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_propagar_categoria_por_cnpj();
DROP TRIGGER IF EXISTS trg_propagar_dimensoes_cpr ON public.contas_pagar_receber;
CREATE TRIGGER trg_propagar_dimensoes_cpr AFTER UPDATE OF plano_contas_id, centro_custo_id, linha_investimento_id ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_propagar_dimensoes_cpr();
DROP TRIGGER IF EXISTS trg_propagar_irmas ON public.nfs_stage;
CREATE TRIGGER trg_propagar_irmas AFTER UPDATE OF plano_contas_id ON nfs_stage FOR EACH ROW EXECUTE FUNCTION fn_propagar_categoria_para_irmas();
DROP TRIGGER IF EXISTS trg_proteger_mov_duplicada ON public.movimentacoes_bancarias;
CREATE TRIGGER trg_proteger_mov_duplicada BEFORE INSERT OR UPDATE OF conta_pagar_id ON movimentacoes_bancarias FOR EACH ROW EXECUTE FUNCTION fn_proteger_mov_duplicada();
DROP TRIGGER IF EXISTS trg_recalc_total_compra ON public.compras_registradas_itens;
CREATE TRIGGER trg_recalc_total_compra AFTER INSERT OR DELETE OR UPDATE ON compras_registradas_itens FOR EACH ROW EXECUTE FUNCTION fn_recalcular_total_compra();
DROP TRIGGER IF EXISTS trg_refletir_movimentacao_em_conta_pagar ON public.movimentacoes_bancarias;
CREATE TRIGGER trg_refletir_movimentacao_em_conta_pagar AFTER UPDATE OF conciliado ON movimentacoes_bancarias FOR EACH ROW EXECUTE FUNCTION refletir_movimentacao_em_conta_pagar();
DROP TRIGGER IF EXISTS trg_set_updated_at_compromissos ON public.compromissos_parcelados;
CREATE TRIGGER trg_set_updated_at_compromissos BEFORE UPDATE ON compromissos_parcelados FOR EACH ROW EXECUTE FUNCTION set_updated_at_compromissos();
DROP TRIGGER IF EXISTS trg_set_updated_at_faturas_cartao ON public.faturas_cartao;
CREATE TRIGGER trg_set_updated_at_faturas_cartao BEFORE UPDATE ON faturas_cartao FOR EACH ROW EXECUTE FUNCTION set_updated_at_faturas_cartao();
DROP TRIGGER IF EXISTS trg_set_updated_at_lancamentos_cartao ON public.fatura_cartao_lancamentos;
CREATE TRIGGER trg_set_updated_at_lancamentos_cartao BEFORE UPDATE ON fatura_cartao_lancamentos FOR EACH ROW EXECUTE FUNCTION set_updated_at_faturas_cartao();
DROP TRIGGER IF EXISTS trg_set_updated_at_nfs_stage ON public.nfs_stage;
CREATE TRIGGER trg_set_updated_at_nfs_stage BEFORE UPDATE ON nfs_stage FOR EACH ROW EXECUTE FUNCTION set_updated_at_nfs_stage();
DROP TRIGGER IF EXISTS trg_sincronizar_tags_documentos ON public.contas_pagar_receber;
CREATE TRIGGER trg_sincronizar_tags_documentos BEFORE INSERT OR UPDATE OF comprovante_url ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION sincronizar_tags_documentos();
DROP TRIGGER IF EXISTS trg_status_fatura_cartao ON public.fatura_cartao_lancamentos;
CREATE TRIGGER trg_status_fatura_cartao AFTER INSERT OR DELETE OR UPDATE ON fatura_cartao_lancamentos FOR EACH ROW EXECUTE FUNCTION fn_atualizar_status_fatura_cartao();
DROP TRIGGER IF EXISTS trg_sync_pj_para_parceiro_comercial ON public.contratos_pj;
CREATE TRIGGER trg_sync_pj_para_parceiro_comercial AFTER INSERT OR UPDATE ON contratos_pj FOR EACH ROW EXECUTE FUNCTION fn_sync_pj_para_parceiro_comercial();
DROP TRIGGER IF EXISTS trg_titulo_pago_avanca_pedido ON public.titulo_a_receber;
CREATE TRIGGER trg_titulo_pago_avanca_pedido AFTER UPDATE OF status ON titulo_a_receber FOR EACH ROW WHEN (new.status = 'pago'::text AND old.status IS DISTINCT FROM new.status AND new.eh_entrada = true) EXECUTE FUNCTION fn_tg_titulo_pago_avanca_pedido();
DROP TRIGGER IF EXISTS trg_titulo_updated_at ON public.titulo_a_receber;
CREATE TRIGGER trg_titulo_updated_at BEFORE UPDATE ON titulo_a_receber FOR EACH ROW EXECUTE FUNCTION fn_trg_titulo_updated_at();
DROP TRIGGER IF EXISTS trg_touch_config_financeiro_externo ON public.config_financeiro_externo;
CREATE TRIGGER trg_touch_config_financeiro_externo BEFORE UPDATE ON config_financeiro_externo FOR EACH ROW EXECUTE FUNCTION touch_config_financeiro_externo();
DROP TRIGGER IF EXISTS trg_touch_regras_automaticas_ofx ON public.regras_automaticas_ofx;
CREATE TRIGGER trg_touch_regras_automaticas_ofx BEFORE UPDATE ON regras_automaticas_ofx FOR EACH ROW EXECUTE FUNCTION _touch_regras_automaticas_ofx();
DROP TRIGGER IF EXISTS trg_user_preferencias_navegacao_updated_at ON public.user_preferencias_navegacao;
CREATE TRIGGER trg_user_preferencias_navegacao_updated_at BEFORE UPDATE ON user_preferencias_navegacao FOR EACH ROW EXECUTE FUNCTION fn_user_preferencias_navegacao_updated_at();
DROP TRIGGER IF EXISTS trg_validar_conta_real_mov ON public.movimentacoes_bancarias;
CREATE TRIGGER trg_validar_conta_real_mov BEFORE INSERT OR UPDATE OF conta_bancaria_id ON movimentacoes_bancarias FOR EACH ROW EXECUTE FUNCTION fn_validar_conta_real_mov();
DROP TRIGGER IF EXISTS trg_validar_pago_em_conta_real_cpr ON public.contas_pagar_receber;
CREATE TRIGGER trg_validar_pago_em_conta_real_cpr BEFORE INSERT OR UPDATE OF pago_em_conta_id ON contas_pagar_receber FOR EACH ROW EXECUTE FUNCTION fn_validar_pago_em_conta_real();

COMMIT;