import { lerTudo } from "./dados";
import { representantesDoLote } from "./extratoMensal";

/** Representantes do lote de PAGAMENTO da competência (mesma regra do lote impresso e dos PDFs separados). */
export async function listarRepresentantesDoLote(competencia: string): Promise<{ id: string; nome: string }[]> {
  const [ex, cart, comp] = await Promise.all([
    lerTudo("comissao_extrato", undefined, { col: "id" }, "id,vendedor_id,competencia,detalhe"),
    lerTudo("vw_comissao_detalhe", q => q.in("situacao_parcela", ["a_vencer", "vencida", "paga_aguarda_liberacao", "liberada"])),
    lerTudo("vw_comissao_complemento_pendente"),
  ]);
  const ids = representantesDoLote(ex, cart, comp, competencia);
  const nomes = new Map<string, string>();
  for (const id of ids) nomes.set(id, "");
  if (ids.length) {
    const representantes = await lerTudo("vw_representante_financeiro", q => q.in("vendedor_id", ids), undefined, "vendedor_id,representante");
    for (const l of representantes) nomes.set(l.vendedor_id, l.representante ?? "");
  }
  return [...nomes].map(([id, nome]) => ({ id, nome: nome || "Sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
