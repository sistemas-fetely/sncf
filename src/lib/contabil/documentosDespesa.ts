// Status de um documento de despesa esperado na competência (mesma regra do manifesto do pacote):
// mensal = precisa de documento vigente do próprio mês; contrato_vigente = basta um vigente até o mês.
export type TipoDespesa = { id: string; nome: string; pasta: string; periodicidade: string; local: string | null; ativo: boolean };
export type DocDespesa = { id: string; competencia: string; tipo_id: string | null; pasta: string; storage_path: string; nome_arquivo: string; descricao: string | null };

export function statusDocumentoEsperado(t: Pick<TipoDespesa, "id" | "periodicidade">, docs: DocDespesa[], competencia: string) {
  const doTipo = docs.filter((d) => d.tipo_id === t.id && d.competencia <= competencia).sort((a, b) => b.competencia.localeCompare(a.competencia));
  const documento = t.periodicidade === "contrato_vigente" ? doTipo[0] ?? null : doTipo.find((d) => d.competencia === competencia) ?? null;
  return { enviado: !!documento, documento };
}

export const faltantesDespesa = (tipos: (TipoDespesa & { enviado: boolean })[]) => tipos.filter((t) => t.ativo && !t.enviado);
