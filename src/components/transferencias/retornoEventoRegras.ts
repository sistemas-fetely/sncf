export type DiferencaRetorno = { sku: string; enviado: number; recebido: number; diferenca: number; valor_unitario: number };
export function retornoPendente(r: { recebido_em: string | null; diferenca_status: string; nf_status: string | null }) {
  return !!r.recebido_em && (r.diferenca_status === "aberta" || r.nf_status !== "autorizada");
}
export function podeGerarRetorno(r: { recebido_em: string | null; nf_status: string | null }) {
  return !!r.recebido_em && (r.nf_status === null || r.nf_status === "erro");
}
export function itensRecebimentoRetorno(itens: { sku: string; enviado: number }[], valor: (sku: string) => number) {
  return itens.map((i) => {
    const recebido = valor(i.sku);
    if (!Number.isFinite(recebido) || recebido < 0 || recebido > i.enviado) throw new Error(`Contagem inválida de ${i.sku}: não pode ser maior que o enviado.`);
    return { sku: i.sku, recebido };
  });
}