export type EstadoNaoEntregue = { nao_entregue: boolean | null; recebido_em: string | null; nf_dev_status: string | null };

/** Botão "Não entregue ao cliente": só sem recebimento, sem NF de devolução e ainda não marcado. */
export function podeMarcarNaoEntregue(d: EstadoNaoEntregue): boolean {
  return d.nao_entregue !== true && !d.recebido_em && !d.nf_dev_status;
}

export const MOTIVO_NAO_ENTREGUE_MIN = 5;
export const motivoNaoEntregueValido = (t: string) => t.trim().length >= MOTIVO_NAO_ENTREGUE_MIN;

export const DESFECHO_ROTULO: Record<string, string> = {
  reenvio: "Reenvio ao cliente", reembolso: "Reembolso", haver: "Haver", troca: "Troca",
  abater_divida: "Abater dívida", sem_ressarcimento: "Sem ressarcimento (nada pago)", nenhum: "Sem decisão",
};
export const rotuloDesfecho = (d: string) => DESFECHO_ROTULO[d] ?? d;

const TITULO_ROTULO: Record<string, string> = { devolvido: "Título devolvido" };
const BOLETO_ROTULO: Record<string, string> = {
  baixa_solicitada: "Boleto em baixa — sai na próxima remessa ao Safra",
  baixa_remessa_gerada: "Baixa enviada ao Safra",
  baixado: "Boleto baixado",
};
export const rotuloStatusTitulo = (s: string | null) => (s ? TITULO_ROTULO[s] ?? s.replace(/_/g, " ") : "—");
export const rotuloStatusBoleto = (s: string | null) => (s ? BOLETO_ROTULO[s] ?? `Boleto ${s.replace(/_/g, " ")}` : null);
