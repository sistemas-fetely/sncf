export interface ItemGavetaDevolucao {
  sku: string;
  nome_comercial: string | null;
  qtd_saiu: number;
  qtd_ja_retornada: number;
  qtd_pendente: number;
}

// Linha crua de vw_devolucao_itens → item da gaveta. A view traz TODOS os
// itens da devolução (inclusive pendente 0), ao contrário de
// vw_devolucao_retorno_pendente; nulos viram 0 para a tabela nunca quebrar.
export function mapearItensDevolucao(linhas: Array<{
  sku: string;
  nome_comercial: string | null;
  qtd_saiu: number | null;
  qtd_ja_retornada: number | null;
  qtd_pendente: number | null;
}>): ItemGavetaDevolucao[] {
  return linhas.map((l) => ({
    sku: l.sku,
    nome_comercial: l.nome_comercial,
    qtd_saiu: l.qtd_saiu ?? 0,
    qtd_ja_retornada: l.qtd_ja_retornada ?? 0,
    qtd_pendente: l.qtd_pendente ?? 0,
  }));
}

export function filtrarItensDevolucao<T extends ItemGavetaDevolucao>(itens: T[], busca: string, soPendentes: boolean): T[] {
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  return itens.filter((i) => (!soPendentes || i.qtd_pendente > 0) &&
    (!q || i.sku.toLocaleLowerCase("pt-BR").includes(q) || i.nome_comercial?.toLocaleLowerCase("pt-BR").includes(q)));
}

export function rotuloFinanceiroDevolucao(desfecho: string | null, ressarcida: boolean): string {
  if (desfecho === "sem_ressarcimento") return "Sem ressarcimento (nada pago)";
  return ressarcida ? "ressarcida" : "pendente";
}