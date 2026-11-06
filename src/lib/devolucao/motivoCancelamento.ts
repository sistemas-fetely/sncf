export function usaMotivosTransferencia(momento: { canal?: string; canal_devolucao?: string } | undefined) {
  return momento?.canal === "interno" || momento?.canal_devolucao === "interno";
}

export function textoMotivoCancelamento(interno: boolean, rotulo: string | undefined, observacao: string) {
  return interno ? [rotulo, observacao.trim()].filter(Boolean).join(" — ") : observacao.trim();
}