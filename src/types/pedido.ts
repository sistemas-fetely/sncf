export type EstagioPedido =
  | "recebido"
  | "em_analise_credito"
  | "em_cobranca" // legado — mantido até refator completo da UI/SQL
  | "em_cobranca_cartao"
  | "em_cobranca_pix"
  | "em_cobranca_boleto"
  | "pronto_pro_bling"
  | "em_separacao"
  | "faturado"
  | "em_transporte"
  | "entregue"
  | "cancelado";

export type AreaPedido = "sops" | "credito" | "bling" | "sistema" | "nenhuma";

export type TipoPagamento = "a_prazo" | "a_vista";

/**
 * As 3 trilhas de cobrança da Fase C.
 * Útil pra agrupar nas tabs e mini-pipeline.
 */
export const TRILHAS_COBRANCA: readonly EstagioPedido[] = [
  "em_cobranca_cartao",
  "em_cobranca_pix",
  "em_cobranca_boleto",
] as const;

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
}

export interface PipelineItem {
  estagio: EstagioPedido;
  area_atual: AreaPedido;
  qtd: number;
  qtd_sla_estourado: number;
  soma_valor: number;
}

export const ESTAGIO_LABELS: Record<EstagioPedido, string> = {
  recebido: "Recebido",
  em_analise_credito: "Em análise crédito",
  em_cobranca: "Em cobrança",
  em_cobranca_cartao: "Cobrança · Cartão",
  em_cobranca_pix: "Cobrança · PIX",
  em_cobranca_boleto: "Cobrança · Boleto",
  pronto_pro_bling: "Pronto pro Bling",
  em_separacao: "Em separação",
  faturado: "Faturado",
  em_transporte: "Em transporte",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const AREA_LABELS: Record<AreaPedido, string> = {
  sops: "SOps",
  credito: "Crédito",
  bling: "Bling",
  sistema: "Sistema",
  nenhuma: "—",
};

export const ESTAGIO_CORES: Record<EstagioPedido, string> = {
  recebido: "bg-slate-500",
  em_analise_credito: "bg-purple-500",
  em_cobranca: "bg-stone-400", // legado, tom dessaturado
  em_cobranca_cartao: "bg-blue-500",
  em_cobranca_pix: "bg-cyan-500",
  em_cobranca_boleto: "bg-amber-500",
  pronto_pro_bling: "bg-emerald-500",
  em_separacao: "bg-blue-700",
  faturado: "bg-teal-600",
  em_transporte: "bg-indigo-500",
  entregue: "bg-green-600",
  cancelado: "bg-red-500",
};

export const ESTAGIO_ORDEM: EstagioPedido[] = [
  "recebido",
  "em_analise_credito",
  "em_cobranca_cartao",
  "em_cobranca_pix",
  "em_cobranca_boleto",
  "em_cobranca", // legado — depois das 3 trilhas oficiais
  "pronto_pro_bling",
  "em_separacao",
  "faturado",
  "em_transporte",
  "entregue",
  "cancelado",
];
