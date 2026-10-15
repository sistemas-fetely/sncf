// Formatação compartilhada da Logística (pt-BR).
export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const brl = (v: number | null | undefined) => (v == null ? "—" : BRL.format(Number(v)));

function parse(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function ddmm(v: string | null | undefined) {
  const d = parse(v);
  return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}
export function dataBr(v: string | null | undefined) {
  const d = parse(v);
  return d ? d.toLocaleDateString("pt-BR") : "—";
}
export function ddmmHora(v: string | null | undefined) {
  const d = parse(v);
  return d
    ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";
}
export function isoDiasAtras(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const ROTULO_COMPOSICAO: Record<string, string> = {
  frete_peso: "Frete-peso", ad_valorem: "Ad valorem", gris: "GRIS", itr: "ITR", tde: "TDE", pedagio: "Pedágio",
  imposto: "Imposto", redespacho: "Redespacho", coleta: "Coleta", entrega: "Entrega", despacho: "Despacho",
  adicionais: "Adicionais", outros: "Outros", valor_unitario: "Valor unitário", desconto: "Desconto",
  custo_transportadora: "Custo transportadora", margem_intermediario: "Margem do agregador", contrato: "Contrato",
};
export const ROTULO_FONTE_REMESSA: Record<string, string> = {
  fatura: "Fatura", api: "API", postagem: "Postagem", estimativa: "Estimativa", sem_custo: "—",
};
