// Conferência de uma NF do Bling contra um retorno de regularização
// (destinatário, valor com tolerância R$ 0,02 e itens código→quantidade).
// A API do Bling não devolve o documento referenciado, por isso a conferência é por esses campos.

export const semZeros = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
export const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ItemQtd = { codigo: string; quantidade: number };
const soma = (arr: ItemQtd[]) =>
  arr.reduce((m, i) => m.set(i.codigo, (m.get(i.codigo) ?? 0) + Number(i.quantidade)), new Map<string, number>());

/** Devolve null se a NF bate com o retorno; senão, a mensagem da divergência. */
export function divergenciaNfeRetorno(
  nf: any,
  esperado: { docDestinatario: string; valor: number; nfOrigemNumero: string; itens: Array<{ sku: string; quantidade: number }> },
): string | null {
  const nome = `A NF ${nf?.numero ?? "?"}`;
  if (Number(nf?.situacao) !== 1) return `${nome} não está pendente no Bling (situação ${nf?.situacao}).`;
  if (Number(nf?.tipo) !== 1) return `${nome} não é de saída.`;
  const docNf = digitos(nf?.contato?.numeroDocumento);
  if (docNf !== esperado.docDestinatario) return `${nome} é para o documento ${docNf || "(vazio)"}, o retorno espera ${esperado.docDestinatario}.`;
  const valorNf = Number(nf?.valorNota ?? 0);
  if (Math.abs(valorNf - esperado.valor) > 0.02) return `${nome} tem valor ${brl(valorNf)}, o retorno da NF ${esperado.nfOrigemNumero} é ${brl(esperado.valor)}.`;
  const qNf = soma((nf?.itens ?? []).map((i: ItemQtd) => ({ codigo: String(i.codigo ?? "").trim(), quantidade: Number(i.quantidade) })));
  const qRet = soma(esperado.itens.map((i) => ({ codigo: String(i.sku).trim(), quantidade: Number(i.quantidade) })));
  for (const [cod, q] of qRet) {
    const qn = qNf.get(cod);
    if (qn === undefined) return `${nome} não tem o item ${cod}, que o retorno espera com ${q}.`;
    if (Math.abs(qn - q) > 0.0001) return `${nome} tem o item ${cod} com ${qn}, o retorno espera ${q}.`;
  }
  for (const [cod, q] of qNf) if (!qRet.has(cod)) return `${nome} tem o item ${cod} com ${q}, que não faz parte do retorno.`;
  return null;
}
