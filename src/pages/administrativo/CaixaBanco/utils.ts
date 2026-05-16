/**
 * Utils compartilhados — Sistema de Qualidade Simplificado (2 ícones).
 * Redesign: 07/05/2026 — apenas NF/Recibo + Categoria.
 */

export type Lancamento = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  pago_em: string | null;
  pago_em_conta_id: string | null;
  conciliado_em: string | null;
  movimentacao_bancaria_id: string | null;
  status_conta_pagar: string;
  status_caixa: "em_aberto" | "pago" | "conciliado";
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  forma_pagamento_id: string | null;
  categoria_id: string | null;
  unidade: string | null;
  nf_numero: string | null;
  origem_view: "conta_pagar" | "cartao_lancamento";
  origem?: string | null;
  fatura_id: string | null;
  vinculada_cartao?: boolean | null;
  fatura_vencimento?: string | null;
  categoria_inconsistente?: boolean | null;
  inconsistencia_motivo?: string | null;
  categoria_sugerida_ia?: boolean | null;
  nf_stage_id?: string | null;
  data_enviada_para_pagamento: string | null;
  meio_pagamento_id: string | null;
  conta_pagar_id: string | null;
  conta_bancaria_nome: string | null;
};

export type ContaBancariaLite = {
  id: string;
  nome_exibicao: string;
  cor: string | null;
};

/**
 * Status visual = espelho do status decisório de Contas a Pagar.
 */
export function statusVisual(l: Lancamento): string {
  if (l.origem_view === "cartao_lancamento") {
    if (l.movimentacao_bancaria_id || l.status_caixa === "conciliado") return "enviado_para_pagamento";
    if (l.status_caixa === "pago") return "enviado_para_pagamento";
    return "enviado_para_pagamento";
  }
  return l.status_conta_pagar || "aberto";
}

export function isAtrasada(l: Lancamento): boolean {
  if (!l.data_vencimento) return false;
  const status = statusVisual(l);
  if (status === "enviado_para_pagamento" || status === "cancelado") return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(l.data_vencimento + "T00:00:00");
  return venc < hoje;
}

export function diasAtraso(l: Lancamento): number {
  if (!isAtrasada(l) || !l.data_vencimento) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(l.data_vencimento + "T00:00:00");
  const diff = Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

/**
 * ÍCONE 1 — NF/Recibo
 */
export function getQualidadeDocumento(
  m: { id: string },
  nfMap?: Map<string, string | null>,
): { cor: "verde" | "vermelho"; temDocumento: boolean; nfStageId: string | null; motivo: string } {
  const nfStageId = nfMap?.get(m.id) || null;
  const temDoc = nfStageId !== null;
  return temDoc
    ? { cor: "verde", temDocumento: true, nfStageId, motivo: "Documento vinculado" }
    : { cor: "vermelho", temDocumento: false, nfStageId: null, motivo: "Sem documento" };
}

/**
 * ÍCONE 2 — Categoria
 */
export function getQualidadeCategoria(m: {
  categoria_id: string | null;
}): { cor: "verde" | "vermelho"; temCategoria: boolean; motivo: string } {
  const temCat = m.categoria_id !== null;
  return temCat
    ? { cor: "verde", temCategoria: true, motivo: "Categoria definida" }
    : { cor: "vermelho", temCategoria: false, motivo: "Sem categoria" };
}

export function corClass(cor: "verde" | "vermelho"): string {
  return cor === "verde" ? "text-emerald-600" : "text-red-500";
}
