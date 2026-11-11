import { cobradoTransp, formatarDesvioCotacao, type DocumentoComFatura } from "./documentoFrete";
import { BRL } from "./formato";

export interface DocumentoCusto extends DocumentoComFatura {
  frete_cotacao: number | null; frete_cliente: number | null;
  natureza: string | null; desvio_cotacao_alerta: boolean | null;
}
const centavos = (v: number | null) => Math.round((v ?? 0) * 100);
export function totaisCustoFrete(documentos: readonly DocumentoCusto[]) {
  return {
    cotacao: documentos.reduce((s, d) => s + centavos(d.frete_cotacao), 0) / 100,
    cliente: documentos.reduce((s, d) => s + centavos(d.frete_cliente), 0) / 100,
    cobrado: documentos.reduce((s, d) => s + centavos(cobradoTransp(d)), 0) / 100,
  };
}
export const acimaDoTeto = (d: Pick<DocumentoCusto, "desvio_cotacao_alerta">) => d.desvio_cotacao_alerta === true;
export function analisarCustoFrete(documentos: readonly DocumentoCusto[]) {
  const totais = totaisCustoFrete(documentos);
  const comparaveis = documentos.filter(d => d.frete_cotacao != null && d.frete_cotacao > 0);
  const justo = totaisCustoFrete(comparaveis);
  const extras = documentos.filter(d => d.natureza !== "Normal");
  const delta = comparaveis.length ? (centavos(justo.cobrado) - centavos(justo.cotacao)) / 100 : null;
  const resultado = (centavos(totais.cliente) - centavos(totais.cobrado)) / 100;
  return { ...totais, documentos: documentos.length,
    comCotacao: documentos.filter(d => d.frete_cotacao != null).length,
    delta, deltaPct: delta == null ? null : delta / justo.cotacao * 100,
    pedidos: documentos.filter(d => d.frete_cliente != null).length,
    gratis: documentos.filter(d => d.frete_cliente === 0).length,
    resultado, custoExtra: totaisCustoFrete(extras).cobrado, extras: extras.length,
    alertaDelta: delta != null && delta > 0, alertaResultado: resultado < 0,
  };
}
export function brlComSinal(valor: number | null): string {
  if (valor == null) return "—";
  const arredondado = centavos(valor) / 100;
  return `${arredondado > 0 ? "+" : arredondado < 0 ? "−" : ""}${BRL.format(Math.abs(arredondado))}`;
}
export const percentualComSinal = (valor: number | null) => formatarDesvioCotacao(valor) ?? "—";