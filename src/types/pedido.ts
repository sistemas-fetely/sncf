// Estágios canônicos do pedido.
// Alinhado com check constraint em public.pedidos.estagio (F-1).
export type EstagioPedido =
  | "recebido"
  | "em_analise_credito"
  | "cobranca"
  | "aguardando_pagamento"
  | "pre_faturado"
  | "aguardando_estoque"
  | "em_separacao"
  | "faturado"
  | "em_transporte"
  | "entregue"
  | "cancelado"
  | "recuperacao_venda";

export type AreaPedido = "sops" | "credito" | "bling" | "sistema" | "nenhuma";

export type TipoPagamento = "a_prazo" | "a_vista";

export const ESTAGIO_LABELS: Record<EstagioPedido, string> = {
  recebido: "Recebido",
  em_analise_credito: "Em análise crédito",
  cobranca: "Cobrança",
  aguardando_pagamento: "Aguardando pagamento",
  pre_faturado: "Pré-faturamento",
  aguardando_estoque: "Aguardando estoque",
  em_separacao: "Em separação",
  faturado: "Faturado",
  em_transporte: "Em transporte",
  entregue: "Entregue",
  cancelado: "Cancelado",
  recuperacao_venda: "Recuperação de venda",
};

export const ESTAGIO_LABELS_CURTO: Record<EstagioPedido, string> = {
  recebido: "Recebido",
  em_analise_credito: "Em Análise",
  cobranca: "Cobrança",
  aguardando_pagamento: "Aguardando PG",
  pre_faturado: "Pré-Faturado",
  aguardando_estoque: "Ag. Estoque",
  em_separacao: "Em Separação",
  faturado: "Faturado",
  em_transporte: "Em Transporte",
  entregue: "Entregue",
  cancelado: "Cancelado",
  recuperacao_venda: "Recuperação",
};

export const AREA_LABELS: Record<AreaPedido, string> = {
  sops: "SOps",
  credito: "Crédito",
  bling: "Bling",
  sistema: "Sistema",
  nenhuma: "—",
};

export const PIPELINE_PRINCIPAL: readonly EstagioPedido[] = [
  "recebido",
  "em_analise_credito",
  "cobranca",
  "aguardando_pagamento",
  "pre_faturado",
  "aguardando_estoque",
  "em_separacao",
  "faturado",
  "em_transporte",
  "entregue",
] as const;

export const ESTAGIOS_TERMINAIS: readonly EstagioPedido[] = [
  "entregue",
  "cancelado",
] as const;

export const ESTAGIOS_RECUPERAVEIS: readonly EstagioPedido[] = [
  "recuperacao_venda",
] as const;

export const ESTAGIO_AREA: Record<EstagioPedido, AreaPedido> = {
  recebido: "sistema",
  em_analise_credito: "credito",
  cobranca: "sops",
  aguardando_pagamento: "sops",
  pre_faturado: "sops",
  aguardando_estoque: "sops",
  em_separacao: "bling",
  faturado: "bling",
  em_transporte: "bling",
  entregue: "nenhuma",
  cancelado: "nenhuma",
  recuperacao_venda: "sops",
};

export interface PedidoFilaItem {
  id: string;
  id_externo: string;
  estagio: EstagioPedido;
  area_atual: AreaPedido;
  proxima_acao: string | null;
  tipo_pagamento: TipoPagamento | null;
  recebido_via: string;
  origem: string | null;
  parceiro_id: string;
  parceiro_cnpj: string;
  parceiro_razao: string;
  nivel_programa: string;
  categoria_ka: string | null;
  bandeira_vermelha: boolean;
  vendedor: string | null;
  data_pedido: string;
  recebido_em: string;
  valor_bruto: number;
  valor_liquido: number;
  condicao_solicitada: string;
  forma_solicitada: string;
  prioridade_score: number;
  prioridade_motivo: string | null;
  faturado_em: string | null;
  cancelado_em: string | null;
  cancelado_motivo: string | null;
  idade_minutos: number;
  sla_estourado: boolean;
  analise_credito_id: string | null;
  marcacao: string | null;
  bling_id_destino?: string | null;
  atencao_nivel?: 'pausa' | 'aviso' | null;
  atencao_motivo?: string | null;
  atencao_por?: string | null;
  atencao_em?: string | null;
}

export interface PipelineItem {
  estagio: EstagioPedido;
  area_atual: AreaPedido;
  qtd: number;
  qtd_sla_estourado: number;
  soma_valor: number;
}

export type UrgenciaDeclarada = "normal" | "alta" | "critica";

export const URGENCIA_LABELS: Record<UrgenciaDeclarada, string> = {
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};

export interface ScoreBreakdown {
  idade: number;
  destrava: number;
  expira: number;
  valor: number;
  ka_mestre: number;
  urgencia: number;
}

export interface PedidoPriorizado {
  id: string;
  id_externo: string;
  parceiro_id: string;
  estagio: EstagioPedido;
  area_atual: AreaPedido;
  forma_solicitada: string | null;
  valor_liquido: number;
  urgencia_declarada: UrgenciaDeclarada;
  urgencia_observacao: string | null;
  recebido_em: string;
  estagio_atualizado_em: string | null;
  parceiro_razao_social: string | null;
  parceiro_cnpj: string | null;
  nivel_programa: string | null;
  categoria_ka: string | null;
  parceiro_cadastro_incompleto: boolean | null;
  score_total: number;
  score_breakdown: ScoreBreakdown;
}

export type StatusTitulo =
  | "aguardando_pagamento"
  | "aguardando_envio_bling"
  | "aguardando_emissao_nf"
  | "vigente"
  | "vigente_parcial"
  | "pago"
  | "pago_com_atraso"
  | "pago_judicial"
  | "vencido"
  | "vencido_suspenso"
  | "em_juridico"
  | "renegociado"
  | "baixado_por_perda"
  | "cancelado"
  | "cancelado_recuperacao";

export type TipoTituloPagamento = "boleto" | "pix" | "cartao" | "troca_mercadoria";

export const STATUS_TITULO_LABELS: Record<StatusTitulo, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_envio_bling: "Aguardando envio Bling",
  aguardando_emissao_nf: "Aguardando NF",
  vigente: "Vigente",
  vigente_parcial: "Vigente parcial",
  pago: "Pago",
  pago_com_atraso: "Pago com atraso",
  pago_judicial: "Pago (judicial)",
  vencido: "Vencido",
  vencido_suspenso: "Vencido suspenso",
  em_juridico: "Em jurídico",
  renegociado: "Renegociado",
  baixado_por_perda: "Baixado por perda",
  cancelado: "Cancelado",
  cancelado_recuperacao: "Cancelado (recuperação)",
};

export interface TituloAReceber {
  id: string;
  numero_titulo: string;
  conta_id: string;
  pedido_id: string;
  nf_id: string | null;
  analise_credito_id: string | null;
  valor_bruto: number;
  valor_desconto: number;
  valor_juros: number;
  valor_multa: number;
  valor_correcao: number;
  valor_atual: number;
  data_criacao: string;
  data_emissao_nf: string | null;
  data_vencimento_original: string;
  data_vencimento_atual: string;
  data_pagamento: string | null;
  numero_parcela: number;
  total_parcelas: number;
  tipo_pagamento: TipoTituloPagamento;
  eh_entrada: boolean;
  status: StatusTitulo;
  subestado_atraso: string;
  flag_bandeira_amarela: boolean;
}

export interface OrderMeta {
  cliente: string | undefined;
  nomeFantasia: string | undefined;
  cnpj: string | undefined;
  email: string | undefined;
  telefone: string | undefined;
  cep: string | undefined;
  logradouro: string | undefined;
  numero: string | undefined;
  complemento: string | undefined;
  bairro: string | undefined;
  municipio: string | undefined;
  uf: string | undefined;
}
