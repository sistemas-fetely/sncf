/** UMA-ORDENACAO-SO: preset de negócio e clique no cabeçalho são o MESMO estado. */
export type PresetOrdenacao = "cronologico" | "risco" | "entrada_paga";
export type ColunaOrdenavel =
  | "risco" | "pedido" | "valor" | "estoque" | "cobranca" | "estagio" | "entrega" | "na_fase";
export type Ordenacao =
  | { tipo: "preset"; preset: PresetOrdenacao }
  | { tipo: "coluna"; coluna: ColunaOrdenavel; dir: "asc" | "desc" };

const PRESET_PADRAO: PresetOrdenacao = "risco";
export const ORDENACAO_PADRAO: Ordenacao = { tipo: "preset", preset: PRESET_PADRAO };
const PRESETS: PresetOrdenacao[] = ["cronologico", "risco", "entrada_paga"];
const COLUNAS: ColunaOrdenavel[] = ["risco", "pedido", "valor", "estoque", "cobranca", "estagio", "entrega", "na_fase"];

/** "preset:risco" | "coluna:valor:desc". O padrão vira "" (fora da URL). */
export function ordenacaoParaTexto(o: Ordenacao): string {
  if (o.tipo === "preset") return o.preset === PRESET_PADRAO ? "" : `preset:${o.preset}`;
  return `coluna:${o.coluna}:${o.dir}`;
}

/** Texto inválido → padrão. */
export function textoParaOrdenacao(t: string | null | undefined): Ordenacao {
  const [tipo, a, b] = (t ?? "").split(":");
  if (tipo === "preset" && PRESETS.includes(a as PresetOrdenacao)) return { tipo: "preset", preset: a as PresetOrdenacao };
  if (tipo === "coluna" && COLUNAS.includes(a as ColunaOrdenavel) && (b === "asc" || b === "desc"))
    return { tipo: "coluna", coluna: a as ColunaOrdenavel, dir: b };
  return ORDENACAO_PADRAO;
}
