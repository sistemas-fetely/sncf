export type ChaveCusto = "cnpj" | "cartao_familia";
export type StatusCusto = "sugerido" | "confirmado" | "descartado";
export type FiltroCusto = "sugerido" | "confirmado" | "todos";
export interface MesCusto { realizado: number; pago_sem_despesa: number; valor_mes: number }
export interface ItemCustoObrigatorio {
  id: string; nome: string; chave_tipo: ChaveCusto; chave: string;
  status: StatusCusto; observacao: string | null;
  valor_esperado: number | null; mediana: number | null; esperado: number;
  por_mes: Record<string, MesCusto>;
}
export interface PainelCustoObrigatorio {
  gerado_em: string; meses: string[]; itens: ItemCustoObrigatorio[];
  total_confirmado: { esperado: number; por_mes: Record<string, number> };
  total_sugerido: { esperado: number; itens: number };
}
export type DecisoesCusto = Record<string, { item: ItemCustoObrigatorio; status: "confirmado" | "descartado" }>;
export function rotuloMesCusto(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(`${mes}-01T12:00:00Z`)).replace(".", "").replace(/^./, (c) => c.toUpperCase());
}
export function mesesCustoVisiveis(meses: string[], largura: number): string[] {
  return meses.slice(largura >= 1200 ? -6 : -4);
}
export function estadoCelulaCusto(mes: MesCusto | undefined, esperado: number, fechado: boolean) {
  const valor = mes?.valor_mes ?? 0;
  return {
    valor,
    atencao: esperado > 0 && valor > esperado * 1.2,
    esmaecida: valor === 0 && fechado,
    pagoSemDespesa: (mes?.realizado ?? 0) === 0 && (mes?.pago_sem_despesa ?? 0) > 0,
  };
}
export function filtroPadraoCusto(itens: ItemCustoObrigatorio[]): FiltroCusto {
  return itens.some((i) => i.status === "sugerido") ? "sugerido" : "confirmado";
}
export function filtrarCustos(itens: ItemCustoObrigatorio[], filtro: FiltroCusto, busca: string, decisoes: DecisoesCusto): ItemCustoObrigatorio[] {
  const todos = new Map(itens.map((i) => [i.id, i]));
  for (const [id, decisao] of Object.entries(decisoes)) {
    todos.set(id, { ...(todos.get(id) ?? decisao.item), status: decisao.status });
  }
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  return [...todos.values()].filter((i) =>
    (filtro === "todos" || i.status === filtro || !!decisoes[i.id]) && i.nome.toLocaleLowerCase("pt-BR").includes(q));
}
export function totaisCustos(itens: ItemCustoObrigatorio[], meses: string[]) {
  return {
    esperado: itens.reduce((s, i) => s + i.esperado, 0),
    por_mes: Object.fromEntries(meses.map((mes) => [mes, itens.reduce((s, i) => s + (i.por_mes[mes]?.valor_mes ?? 0), 0)])),
  };
}
