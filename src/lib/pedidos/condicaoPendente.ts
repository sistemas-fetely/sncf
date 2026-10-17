/**
 * CONDICAO-E-VINCULO — regras puras da pendência de condição de pagamento.
 * O banco decide (rotear_pedido / fn_sugerir_condicao); aqui só o critério de
 * exibição e as prévias ilustrativas do formulário.
 */

export const MOTIVOS_CONDICAO_PENDENTE = ["condicao_nao_mapeada", "condicao_nao_reconhecida"] as const;

export const EVENTO_DESTACAR_CONDICAO = "pedido:destacar-condicao-pendente";

export function ehMotivoCondicaoPendente(motivo?: string | null): boolean {
  return !!motivo && (MOTIVOS_CONDICAO_PENDENTE as readonly string[]).includes(motivo);
}

export interface PedidoCondicaoBase {
  estagio?: string | null;
  recebido_via?: string | null;
  canal?: string | null;
  condicao_pagamento_id?: string | null;
}

/** Mesmo critério no detalhe e na fila. */
export function temCondicaoPendente(p: PedidoCondicaoBase, geraTituloReceber: boolean): boolean {
  return (
    p.estagio === "recebido" &&
    p.recebido_via === "api" &&
    (p.canal ?? "").toUpperCase() !== "B2C" &&
    !p.condicao_pagamento_id &&
    geraTituloReceber
  );
}

/** Prazos válidos: inteiros 0–365, estritamente crescentes, ao menos um. */
export function validarDias(dias: number[]): string | null {
  if (dias.length === 0) return "Informe ao menos um prazo.";
  for (const d of dias) {
    if (!Number.isInteger(d) || d < 0 || d > 365) return "Cada prazo deve estar entre 0 e 365 dias.";
  }
  for (let i = 1; i < dias.length; i++) {
    if (dias[i] <= dias[i - 1]) return "Os prazos devem ser crescentes.";
  }
  return null;
}

export function rotuloProposto(forma: "boleto" | "cartao", dias: number[]): string {
  const nome = forma === "boleto" ? "Boleto" : "Cartão";
  const n = dias.length;
  return `${nome} ${dias.join("/")} (${n} parcela${n === 1 ? "" : "s"})`;
}

/** Divide em centavos; o resíduo vai para a última parcela. Datas = hoje + dias. */
export function previaParcelas(valor: number, dias: number[], hoje: Date = new Date()) {
  const n = dias.length;
  if (n === 0) return [];
  const totalCent = Math.round(valor * 100);
  const base = Math.floor(totalCent / n);
  return dias.map((d, i) => {
    const data = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + d);
    const cent = i === n - 1 ? totalCent - base * (n - 1) : base;
    return { valor: cent / 100, data };
  });
}
