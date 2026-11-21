export const TAM_PAGINA = 50;
export const MAX_PAGINAS = 40;
export type Recebimento = Record<string, unknown>;
export type ResultadoSync = {
  ok: boolean;
  paginas: number;
  recebimentos: number;
  itens: number;
  mais_antigo: string | null;
  erros: string[];
};
export type OpcoesSync = { dias: number; ids?: number[] };
export type DependenciasSync = {
  get: (path: string) => Promise<unknown>;
  upsert: (items: Recebimento[]) => Promise<{ recebimentos: number; itens: number }>;
  agora?: Date;
};

export function dataRecebimento(value: unknown): number {
  if (typeof value !== "string" || !value) throw new Error("Recebimento XPM sem data válida.");
  // ZenLOG returns local timestamps, matching the RPC's America/Sao_Paulo cast.
  const iso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}-03:00`;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) throw new Error("Recebimento XPM com data inválida.");
  return timestamp;
}

function objeto(value: unknown, label: string): Recebimento {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`XPM: ${label} inválido.`);
  }
  return value as Recebimento;
}

export async function sincronizarRecebimentos(
  opcoes: OpcoesSync,
  deps: DependenciasSync,
): Promise<ResultadoSync> {
  const resultado: ResultadoSync = {
    ok: true, paginas: 0, recebimentos: 0, itens: 0, mais_antigo: null, erros: [],
  };
  let menorData = Infinity;
  const corte = (deps.agora ?? new Date()).getTime() - opcoes.dias * 86_400_000;

  const gravar = async (items: Recebimento[]) => {
    const datas = items.map((item) => dataRecebimento(item.data));
    const contagem = await deps.upsert(items);
    resultado.recebimentos += contagem.recebimentos;
    resultado.itens += contagem.itens;
    datas.forEach((data, index) => {
      if (data < menorData) {
        menorData = data;
        resultado.mais_antigo = String(items[index].data);
      }
    });
    return datas.some((data) => data < corte);
  };

  try {
    if (opcoes.ids !== undefined) {
      for (const id of opcoes.ids) {
        const item = objeto(await deps.get(`/api/services/app/Recebimento/Get?Id=${id}`), "result");
        resultado.paginas += 1;
        await gravar([item]);
      }
      return resultado;
    }

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
      const path = `/api/services/app/Recebimento/GetAll?MaxResultCount=50&SkipCount=${pagina * TAM_PAGINA}&Sorting=id%20desc`;
      const result = objeto(await deps.get(path), "result");
      resultado.paginas += 1;
      if (!Array.isArray(result.items)) throw new Error("XPM: result.items não é uma lista.");
      if (result.items.length === 0) return resultado;
      const items = result.items.map((item) => objeto(item, "recebimento"));
      // Persist the entire fetched page, including the boundary's older records.
      const passouCorte = await gravar(items);
      const acabou = items.length < TAM_PAGINA ||
        (typeof result.totalCount === "number" && (pagina + 1) * TAM_PAGINA >= result.totalCount);
      if (passouCorte || acabou) return resultado;
    }
    throw new Error("Limite de segurança de 40 páginas atingido antes do fim da lista ou do período.");
  } catch (error) {
    resultado.ok = false;
    resultado.erros.push(error instanceof Error ? error.message : String(error));
    return resultado;
  }
}