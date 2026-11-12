// Shared pure package paths and entry-invoice counters.
export function pastaEntrada(tipo: string | null): string {
  return `03_nfs_entrada/${tipo && ["nfe", "cte", "nfse"].includes(tipo) ? tipo : "outros"}`;
}
export function pastaDocumento(pasta: string, conta: string | null | undefined): string {
  if (pasta !== "pagamentos") return `05_despesas/${pasta}`;
  if (!conta) throw new Error("Relatório de pagamentos sem conta bancária do tipo");
  return `04_bancos/${conta}/pagamentos`;
}
export type ResumoTipoEntrada = { notas: number; com_xml: number; com_pdf: number };
export function resumoEntradas(rows: { tipo_documento: string | null; xml_storage_path: string | null; resumo_pdf_storage_path: string | null }[]) {
  const out: Record<string, ResumoTipoEntrada> = Object.fromEntries(["nfe", "cte", "nfse", "outros"].map(t => [t, { notas: 0, com_xml: 0, com_pdf: 0 }]));
  for (const n of rows) { const t = pastaEntrada(n.tipo_documento).split("/")[1]; out[t].notas++; if (n.xml_storage_path) out[t].com_xml++; if (n.resumo_pdf_storage_path) out[t].com_pdf++; }
  return out;
}
