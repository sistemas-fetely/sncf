export interface ItemGavetaDevolucao {
  sku: string;
  nome_comercial: string | null;
  qtd_saiu: number;
  qtd_ja_retornada: number;
  qtd_pendente: number;
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