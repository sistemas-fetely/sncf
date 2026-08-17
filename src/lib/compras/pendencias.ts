/**
 * Dimensão de tipos de trabalho pendente em Compras de Mercadoria.
 * Os números vêm prontos de vw_compras_pendencias — nada é calculado aqui.
 */
export interface PendenciaPedido {
  pedido_id: number;
  numero_pedido: string | null;
  codigos_sem_sku: number | null;
  nf_linhas_sem_custo: number | null;
  ficha_xpm_incompleta: number | null;
  skus_sem_peso: number | null;
  nfs_ligadas: number | null;
  rateios: number | null;
  movimentos: number | null;
  termos: number | null;
}

export type TipoPendencia = "codigos_sem_sku" | "nf_linhas_sem_custo" | "ficha_xpm_incompleta";

export interface TipoPendenciaMeta {
  tipo: TipoPendencia;
  rotulo: string;
  rotuloCurto: string;
  descricao: string;
}

export const TIPOS_PENDENCIA: TipoPendenciaMeta[] = [
  {
    tipo: "codigos_sem_sku",
    rotulo: "Código sem SKU",
    rotuloCurto: "Sem SKU",
    descricao: "Código do fornecedor ainda sem de-para para um SKU nosso.",
  },
  {
    tipo: "nf_linhas_sem_custo",
    rotulo: "NF sem custo",
    rotuloCurto: "NF sem custo",
    descricao: "Linha de nota fiscal sem custo alocado.",
  },
  {
    tipo: "ficha_xpm_incompleta",
    rotulo: "Ficha XPM incompleta",
    rotuloCurto: "Ficha XPM",
    descricao: "Item sem NCM, peso ou código de barras para declarar no XPM.",
  },
];

export function totalPendencia(p: PendenciaPedido, tipo: TipoPendencia): number {
  return Number(p[tipo] ?? 0);
}

export const SELECT_PENDENCIAS =
  "pedido_id, numero_pedido, codigos_sem_sku, nf_linhas_sem_custo, ficha_xpm_incompleta, skus_sem_peso, nfs_ligadas, rateios, movimentos, termos";
