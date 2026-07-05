// Types compartilhados do módulo de Análise de Crédito.
// Espelham o schema do banco (sub-fase 1) e os outputs da IA (sub-fase 3.A).

export type EstagioAnalise = "entrada" | "analise" | "decisao";

export type StatusFinalAnalise =
  | "aprovado"
  | "aprovado_com_ressalva"
  | "reprovado"
  | "cancelado";

export type PerfilCredito =
  | "novo_entrada"
  | "novo_qualificado"
  | "recorrente_bom_pagador"
  | "premium"
  | "bandeira_vermelha";

export type NivelPrograma = "convive" | "anfitriao" | "embaixador" | "mestre";
export type CategoriaKa = "parceiro" | "familia" | null;

export type AcaoTransicao =
  | "digitado"
  | "encaminhado"
  | "aprovado"
  | "aprovado_com_ressalva"
  | "reprovado"
  | "devolvido"
  | "cancelado";

export type FonteBureau = "serasa" | "bvg" | "manual";

export type FormaPagamento = "boleto" | "pix" | "cartao";

export type DecisaoSugeridaIA =
  | "aprovar"
  | "aprovar_com_ressalva"
  | "reprovar"
  | "devolver_analise"
  | "devolver_entrada";

export type TipoMarco =
  | "bandeira_vermelha_subiu"
  | "bandeira_vermelha_baixou"
  | "nivel_programa_mudou"
  | "categoria_ka_mudou"
  | "perfil_credito_mudou"
  | "grupo_economico_vinculado"
  | "grupo_economico_desvinculado"
  | "cadastro_completado"
  | "analise_aprovada"
  | "analise_aprovada_com_ressalva"
  | "analise_reprovada"
  | "analise_cancelada";

export interface SugestaoIA {
  perfil_aplicado: PerfilCredito;
  limite_concedido: number;
  prazo_max_dias: number;
  formas_aceitas: FormaPagamento[];
  parecer_final: string;
  ressalva: string | null;
  validade_ate: string | null;
}

export interface AnaliseIaJson {
  resumo: string;
  pontos_atencao: string[];
  sugestao: SugestaoIA;
  decisao_sugerida: DecisaoSugeridaIA;
  justificativa: string;
  confianca: number;
  _modelo?: string;
}

export interface AnaliseListItem {
  id: string;
  pedido_id: string;
  parceiro_id: string;
  estagio_atual: EstagioAnalise;
  status_final: StatusFinalAnalise | null;
  criado_em: string;
  decidido_em: string | null;
  parceiro_cnpj: string | null;
  parceiro_razao: string | null;
  pedido_valor_liquido: number;
  pedido_condicao: string;
  pedido_id_externo: string;
  analise_ia_confianca: number | null;
  analise_ia_processada_em: string | null;
  foi_devolvida: boolean;
  pre_aprovado_regra_id?: string | null;
  pre_aprovacao_em?: string | null;
  pre_aprovacao_regra_nome?: string | null;
}

export interface PreAprovacaoPayload {
  regra_id: string;
  regra_nome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  condicao_sugerida: any;
  parecer_sugerido: string;
}

export interface AnaliseScore {
  id: string;
  analise_id: string;
  parceiro_id: string;
  fonte: FonteBureau;
  data_consulta: string;
  score_numerico: number | null;
  score_categorico: string | null;
  flag_pefin: boolean | null;
  flag_refin: boolean | null;
  flag_protestos: boolean | null;
  flag_falencia_rj: boolean | null;
  flag_acoes_judiciais: boolean | null;
  flag_cheque_devolvido: boolean | null;
  flag_divida_vencida: boolean | null;
  total_dividas: number | null;
  documento_storage_path: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados_extraidos_json: any;
  anexado_em: string;
  extraido_em: string | null;
}

export interface AnaliseTransicao {
  id: string;
  analise_id: string;
  usuario_id: string | null;
  acao: AcaoTransicao;
  estagio_origem: EstagioAnalise | null;
  estagio_destino: EstagioAnalise | null;
  motivo: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delta_ia: any;
  criado_em: string;
}

export interface KpiFinanceiro {
  parceiro_id: string;
  cnpj: string;
  razao_social: string;
  em_aberto: number;
  pago: number;
  maior_compra: number;
  ultima_compra_em: string | null;
  vencidos: number;
  a_vencer: number;
  atraso_medio_dias: number;
}

export interface KpiFinanceiroGrupo {
  grupo_economico_id: string;
  grupo_nome: string;
  em_aberto: number;
  pago: number;
  maior_compra: number;
  ultima_compra_em: string | null;
  vencidos: number;
  a_vencer: number;
  atraso_medio_dias: number | null;
  qtd_parceiros: number;
}

export interface ParceiroMarco {
  id: string;
  parceiro_id: string;
  tipo_marco: TipoMarco;
  valor_anterior: string | null;
  valor_novo: string | null;
  motivo: string | null;
  referencia_id: string | null;
  referencia_tipo: string | null;
  operador_id: string | null;
  operador_email: string | null;
  criado_em: string;
}

export interface SocioParceiro {
  id: string;
  parceiro_id: string;
  cpf_cnpj: string;
  nome: string;
  participacao_pct: number | null;
  qualificacao: string | null;
  data_entrada: string | null;
  desligado_em: string | null;
  fonte: string;
}

export interface AnaliseDetalheCompleto {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analise: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parceiro: any;
  socios: SocioParceiro[];
  scores: AnaliseScore[];
  transicoes: AnaliseTransicao[];
  kpisFinanceiros: KpiFinanceiro | null;
  kpisGrupo: KpiFinanceiroGrupo | null;
  analisesAnteriores: AnaliseListItem[];
  marcos: ParceiroMarco[];
}

export interface CriarAnalisePayload {
  cnpj: string;
  id_externo: string;
  data_pedido: string;
  valor_bruto: number;
  valor_liquido: number;
  condicao_solicitada: string;
  forma_solicitada: string;
  desconto_pct?: number;
  vendedor?: string;
  origem?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itens_json?: any;
  recebido_via?: "api" | "csv";
}

export interface TransicionarPayload {
  analise_id: string;
  acao: AcaoTransicao;
  estagio_destino?: EstagioAnalise;
  motivo?: string;
  perfil_aplicado?: PerfilCredito;
  limite_concedido?: number;
  prazo_max_dias?: number;
  formas_aceitas?: FormaPagamento[];
  parecer_final?: string;
  ressalva?: string;
  validade_ate?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delta_ia?: any;
}

// ──────────────────────────────────────────────────────────────────
// Cobrança (Fase 3 — proposta volátil + materialização)
// ──────────────────────────────────────────────────────────────────

export interface TituloProposto {
  ordem: number;
  numero_parcela: number;
  total_parcelas: number;
  eh_entrada: boolean;
  tipo_pagamento: "pix" | "cartao" | "boleto";
  valor_bruto: number;
  data_vencimento: string; // YYYY-MM-DD
  condicao_pagamento: string;
  link_pagamento?: string;
}

export interface PropostaCobranca {
  pedido_id: string;
  parceiro_id: string;
  pedido_id_externo: string;
  analise_credito_id: string;
  valor_total: number;
  tem_entrada: boolean;
  condicao_original: string;
  titulos_propostos: TituloProposto[];
}

export interface CobrancaFilaItem {
  pedido_id: string;
  id_externo: string;
  parceiro_nome: string;
  parceiro_cnpj: string;
  valor_liquido: number;
  estagio_atualizado_em: string;
  perfil_aplicado: PerfilCredito | null;
  condicao_solicitada: string;
}

// ──────────────────────────────────────────────────────────────────
// Aguardando pagamento (Fase 5 — marcação manual de entradas)
// ──────────────────────────────────────────────────────────────────

export interface PedidoAguardandoPagamento {
  pedido_id: string;
  id_externo: string;
  parceiro_nome: string;
  parceiro_cnpj: string;
  valor_liquido: number;
  estagio_atualizado_em: string;
  entradas_pendentes: number;
  entradas_total: number;
  dias_aguardando: number;
}

export interface TituloEntradaPedido {
  titulo_id: string;
  numero_titulo: string;
  numero_parcela: number;
  total_parcelas: number;
  tipo_pagamento: "pix" | "cartao" | "boleto";
  valor_bruto: number;
  data_vencimento_atual: string | null;
  status: string; // 'pendente' | 'pago' | ...
  data_pagamento: string | null;
}

// ──────────────────────────────────────────────────────────────────
// Regras de cadência (IA-B — pré-aprovação automática)
// ──────────────────────────────────────────────────────────────────

export interface RegraCadenciaCriterio {
  perfil_in?: string[];
  valor_max?: number;
  sem_bandeira?: boolean;
  titulos_pagos_no_prazo_min?: number;
}

export interface RegraCadencia {
  id: string;
  nome: string;
  descricao?: string;
  ativa: boolean;
  ordem: number;
  criterio: RegraCadenciaCriterio;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  condicao_default?: any;
  parecer_template?: string;
  criado_em: string;
  criado_por?: string;
}

// ──────────────────────────────────────────────────────────────────
// Remessa Safra
// ──────────────────────────────────────────────────────────────────

export type BoletoStatus =
  | "pendente"
  | "remessa_gerada"
  | "registrado"
  | "rejeitado"
  | "vencido"
  | "pago_manual"
  | "pago_banco"
  | "baixa_solicitada";

export type RemessaStatus =
  | "gerada"
  | "enviada"
  | "processada"
  | "com_rejeicoes";

export interface TituloBoletoPendente {
  titulo_id: string;
  numero_titulo: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_bruto: number;
  data_vencimento: string;
  boleto_status: BoletoStatus;
  boleto_codigo_rejeicao: string | null;
  remessa_safra_id: string | null;
  nosso_numero_safra: string | null;
  boleto_enviado_em: string | null;
  pedido_id: string;
  pedido_id_externo: string;
  parceiro_id: string;
  parceiro_nome: string;
  parceiro_cnpj: string;
  parceiro_email: string | null;
  cadastro_incompleto: boolean;
}

export interface RemessaSafra {
  id: string;
  nro_sequencial: number;
  gerado_em: string;
  qtd_titulos: number;
  valor_total: number;
  status: RemessaStatus;
  arquivo_nome: string;
  retorno_processado_em: string | null;
}

export interface ValidacaoRemessa {
  titulo_id: string;
  numero_titulo: string;
  parceiro_nome: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_bruto: number;
  data_vencimento: string;
  valido: boolean;
  motivo_bloqueio: string | null;
}

export interface ResultadoRetorno {
  confirmados: number;
  rejeitados: number;
  emails_enviados: number;
  detalhes_rejeicao: Array<{
    numero_titulo: string;
    parceiro_nome: string;
    codigo_rejeicao: string;
    motivo: string;
  }>;
}
