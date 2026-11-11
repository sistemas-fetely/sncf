import { expect } from "npm:expect@29";
const describe = (_n: string, f: () => void) => f();
const it = (n: string, f: () => Promise<void>) => Deno.test(n, f);
import { syncNfe, type DepsSyncNfe } from "./sync-nfe.ts";

function montar(opts: { erroPagina1?: boolean; totalPaginas?: number } = {}) {
  const lidas: number[] = [];
  const cursorGravado: number[] = [];
  const total = opts.totalPaginas ?? 20;
  let chamadas = 0;
  const client: any = {
    get: async (url: string) => {
      const p = Number(/pagina=(\d+)/.exec(url)![1]);
      lidas.push(p);
      if (opts.erroPagina1 && p === 1) throw new Error("Bling 500");
      return { data: p <= total ? [{ id: `${p}-a`, dataEmissao: "2026-11-11" }, { id: `${p}-b`, dataEmissao: "2026-11-10" }] : [] };
    },
  };
  const supabase: any = {
    from: () => ({ update: (v: any) => { cursorGravado.push(v.ultima_pagina); const q: any = { eq: () => q }; return q; } }),
  };
  const deps: DepsSyncNfe = {
    processar: async (_s, _c, nf, st) => { if (String(nf.id).endsWith("a")) st.criados++; },
    entradas: async () => ({ encontradas: 0, gravadas: 0, comReferencia: 0, comErro: 0 }),
    dormir: async () => {},
  };
  // uma pagina de cursor por execucao: tempo acaba depois do 1o update
  const timeUp = () => { chamadas++; return cursorGravado.length >= 1; };
  return { client, supabase, deps, timeUp, lidas, cursorGravado };
}

describe("syncNfe — cabeça antes do cursor", () => {
  it("cursor na página 8: lê a página 1 e depois a 9; cursor termina em 9", async () => {
    const m = montar();
    const r = await syncNfe(m.supabase, m.client, m.timeUp, { ultima_pagina: 8, ultima_data_corte: null }, m.deps);
    expect(m.lidas).toEqual([1, 9]);
    expect(m.cursorGravado).toEqual([9]);
    expect(r.cabecaPaginas).toBe(1);
    expect(r.proximaPagina).toBe(10);
  });

  it("cursor em 0: página 1 processada uma vez só", async () => {
    const m = montar();
    await syncNfe(m.supabase, m.client, m.timeUp, { ultima_pagina: 0, ultima_data_corte: null }, m.deps);
    expect(m.lidas.filter((p) => p === 1)).toHaveLength(1);
    expect(m.cursorGravado).toEqual([1]);
  });

  it("erro na cabeça não impede o laço do cursor", async () => {
    const m = montar({ erroPagina1: true });
    const r = await syncNfe(m.supabase, m.client, m.timeUp, { ultima_pagina: 8, ultima_data_corte: null }, m.deps);
    expect(m.lidas).toEqual([1, 9]);
    expect(m.cursorGravado).toEqual([9]);
    expect(r.ultimoErro).toContain("cabeca pagina 1");
  });

  it("página 1 inteira nova segue para a 2 (teto 2)", async () => {
    const m = montar();
    m.deps.processar = async (_s, _c, _nf, st) => { st.criados++; };
    await syncNfe(m.supabase, m.client, m.timeUp, { ultima_pagina: 8, ultima_data_corte: null }, m.deps);
    expect(m.lidas).toEqual([1, 2, 9]);
  });
});
