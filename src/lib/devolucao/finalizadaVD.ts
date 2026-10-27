/**
 * Devolução da Venda Direta (cancelamento sem NF) está FINALIZADA quando foi
 * recusada, ou concluída E o comprovante já foi enviado ao cliente.
 * Concluída sem comprovante enviado segue em andamento.
 */
export function finalizadaVD(d: { status: string; comprovante_enviado_em?: string | null }): boolean {
  if (d.status === "recusada") return true;
  return d.status === "concluida" && !!d.comprovante_enviado_em;
}

/** Concluída, mas o cliente ainda não recebeu o comprovante. */
export function aguardandoComprovanteVD(d: { status: string; comprovante_enviado_em?: string | null }): boolean {
  return d.status === "concluida" && !d.comprovante_enviado_em;
}
