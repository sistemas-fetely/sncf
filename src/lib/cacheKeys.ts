import type { QueryClient } from "@tanstack/react-query";

/**
 * FONTE-ÚNICA DA INVALIDAÇÃO: quem grava numa tabela chama invalidarTabelas,
 * em vez de decorar quais das ~694 chaves dependem dela.
 * O padrão casa contra o PRIMEIRO elemento da queryKey.
 */
export const PADROES_POR_TABELA: Record<string, string[]> = {
  pedidos: ["pedido"],
  vinculos: ["vinculo"],
  pessoas: ["pessoa", "colaborador", "organograma", "custo-pessoas"],
  contas_pagar_receber: [
    "conta-pagar",
    "contas-pagar",
    "conta-receber",
    "contas-receber",
    "cpr",
    "titulo",
    "cobranca",
  ],
  parceiros_comerciais: ["parceiro", "cliente"],
  ged_documentos: ["ged", "pasta", "documento"],
  sncf_tarefas: ["tarefa"],
  cadastro_requisito: ["cadastro-pendencia", "meu-cadastro"],
};

/** Gravar na tabela da esquerda também torna velha a leitura das da direita. */
export const TABELAS_DEPENDENTES: Record<string, string[]> = {
  vinculos: ["pessoas", "cadastro_requisito"],
  pessoas: ["vinculos", "cadastro_requisito"],
  pedidos: ["contas_pagar_receber", "parceiros_comerciais"],
  contas_pagar_receber: ["pedidos"],
};

/**
 * Invalida toda chave cujo primeiro elemento contenha um dos padrões da tabela
 * (e das tabelas dependentes dela — uma volta só, sem recursão).
 * Tabela fora do registro: nada é invalidado e o console avisa. Silêncio aqui
 * seria a mesma doença que estamos consertando.
 */
export async function invalidarTabelas(qc: QueryClient, tabelas: string[]): Promise<void> {
  const alvo = new Set<string>();
  for (const t of tabelas) {
    alvo.add(t);
    for (const dep of TABELAS_DEPENDENTES[t] ?? []) alvo.add(dep);
  }

  const padroes: string[] = [];
  for (const t of alvo) {
    const p = PADROES_POR_TABELA[t];
    if (!p) {
      console.warn(`[cacheKeys] tabela sem padrões registrados: "${t}" — nada foi invalidado para ela.`);
      continue;
    }
    padroes.push(...p);
  }

  if (padroes.length === 0) return;

  await qc.invalidateQueries({
    predicate: (query) => {
      const raiz = query.queryKey?.[0];
      if (typeof raiz !== "string") return false;
      const chave = raiz.toLowerCase();
      return padroes.some((p) => chave.includes(p));
    },
  });
}
