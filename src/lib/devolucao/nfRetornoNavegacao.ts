export function abaNfRetornoPermitida(aba: string, podeVer: boolean, carregando: boolean): string {
  return aba === "nf-retorno" && !carregando && !podeVer ? "funil" : aba;
}

export function destinoFunilNfRetorno(id: string, numero: string | null): string {
  const params = new URLSearchParams({ aba: "funil", q: numero ?? "", detalhe: id, fin: "true" });
  return `/devolucoes?${params}`;
}
