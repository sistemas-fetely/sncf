// Mapa v2: Product- and fiscal-owned (operacoes) cells are written in the FOP; the SNCF only marks a cell
// after the FOP answers. Pure rules + an orchestrator with injected I/O (tested with a fake FOP).

export const LOTE_FOP = 500;
export const DONOS_FOP = ["produto", "operacoes"] as const;
export type DonoFop = typeof DONOS_FOP[number];

/** Groups cell ids by owner so fn_catalogo_resolver is called with the matching p_dono. */
export function agruparPorDono(ids: string[], celulas: CelulaFop[]): Map<DonoFop, string[]> {
  const dono = new Map(celulas.map(c => [c.id, c.dono as DonoFop]));
  const out = new Map<DonoFop, string[]>();
  for (const id of ids) { const d = dono.get(id)!; out.set(d, [...(out.get(d) ?? []), id]); }
  return out;
}

export type CelulaFop = {
  id: string; cod_cadastro: string; campo: string; dono: string; tipo: string; status: string;
  leitura_id: string; valor_planilha: unknown; valor_sistema: unknown;
};
export type ItemFop = { id: string; cod_cadastro: string; campo: string; valor_novo: unknown; valor_esperado: unknown };
export type ResultadoFop = { id: string; status: "aplicada" | "conflito" | "erro"; valor_atual?: unknown; erro?: string | null };
export type Classificacao = {
  aplicar: string[];   // tipo mudanca → fn_catalogo_resolver aplicar/planilha
  resolver: string[];  // tipo conflito escolhido "planilha" → fn_catalogo_resolver resolver/planilha
  pendentes: ResultadoFop[]; // conflito/erro → fn_catalogo_fop_registrar
};

/** Validates the cells the user asked to send and builds the FOP payload items. */
export function montarItens(celulas: CelulaFop[], ids: string[], leituraId: string): ItemFop[] {
  const porId = new Map(celulas.map(c => [c.id, c]));
  return ids.map(id => {
    const c = porId.get(id);
    if (!c) throw new Error(`Célula ${id} não encontrada.`);
    if (c.leitura_id !== leituraId) throw new Error(`Célula ${c.cod_cadastro}/${c.campo} não é da leitura atual.`);
    if (!DONOS_FOP.includes(c.dono as DonoFop)) throw new Error(`Célula ${c.cod_cadastro}/${c.campo} tem dono "${c.dono}", que não vai ao FOP.`);
    if (c.status !== "pendente" || !["mudanca", "conflito"].includes(c.tipo)) throw new Error(`Célula ${c.cod_cadastro}/${c.campo} não está pendente.`);
    // Conflict "planilha": the expected value is the FOP's current value, stored as valor_sistema.
    return { id: c.id, cod_cadastro: c.cod_cadastro, campo: c.campo, valor_novo: c.valor_planilha, valor_esperado: c.valor_sistema };
  });
}

export function lotes<T>(itens: T[], tamanho = LOTE_FOP): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

/** Maps the FOP answer onto cell outcomes. Cells the FOP did not answer stay pending with an error. */
export function classificarResultados(itens: ItemFop[], celulas: CelulaFop[], resposta: unknown): Classificacao {
  const lista = (resposta as { resultados?: unknown })?.resultados;
  if (!Array.isArray(lista)) throw new Error("Resposta do FOP sem lista de resultados.");
  const tipo = new Map(celulas.map(c => [c.id, c.tipo]));
  const porId = new Map<string, ResultadoFop>();
  for (const r of lista as ResultadoFop[]) if (r && typeof r.id === "string") porId.set(r.id, r);
  const out: Classificacao = { aplicar: [], resolver: [], pendentes: [] };
  for (const item of itens) {
    const r = porId.get(item.id);
    if (r?.status === "aplicada") (tipo.get(item.id) === "conflito" ? out.resolver : out.aplicar).push(item.id);
    else if (r?.status === "conflito") out.pendentes.push({ id: item.id, status: "conflito", valor_atual: r.valor_atual ?? null });
    else if (r?.status === "erro") out.pendentes.push({ id: item.id, status: "erro", erro: r.erro || "FOP recusou sem mensagem." });
    else out.pendentes.push({ id: item.id, status: "erro", erro: r ? `Status desconhecido do FOP: ${String(r.status)}` : "FOP não respondeu esta célula." });
  }
  return out;
}

export type Dependencias = {
  chamarFop: (corpo: { quem: { id: string; nome: string }; leitura_id: string; celulas: ItemFop[] }) => Promise<unknown>;
  concluir: (ids: string[], acao: "aplicar" | "resolver", dono: DonoFop) => Promise<void>;
  registrar: (pendentes: ResultadoFop[]) => Promise<void>;
};
export type Resumo = { aplicadas: number; conflitos: number; erros: number; lotes: number };

/**
 * Sends batches sequentially. A network/HTTP failure marks no cell applied, records the error on
 * each cell of that batch and throws; previous batches are already recorded and reported in the error.
 */
export async function aplicarNoFop(celulas: CelulaFop[], ids: string[], leituraId: string, quem: { id: string; nome: string }, deps: Dependencias): Promise<Resumo> {
  const itens = montarItens(celulas, ids, leituraId);
  const resumo: Resumo = { aplicadas: 0, conflitos: 0, erros: 0, lotes: 0 };
  for (const lote of lotes(itens)) {
    let c: Classificacao;
    try {
      c = classificarResultados(lote, celulas, await deps.chamarFop({ quem, leitura_id: leituraId, celulas: lote }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Transport failure: nothing is marked applied, but each cell of the batch keeps the error visible.
      await deps.registrar(lote.map(i => ({ id: i.id, status: "erro" as const, erro: `Falha ao falar com o FOP: ${msg}` })));
      const feito = resumo.lotes ? ` ${resumo.aplicadas} células já tinham sido aplicadas em lotes anteriores.` : "";
      throw new Error(`Falha ao falar com o FOP: ${msg}. Nenhuma célula deste lote foi aplicada; o erro ficou registrado nelas.${feito}`);
    }
    for (const [dono, l] of agruparPorDono(c.aplicar, celulas)) await deps.concluir(l, "aplicar", dono);
    for (const [dono, l] of agruparPorDono(c.resolver, celulas)) await deps.concluir(l, "resolver", dono);
    if (c.pendentes.length) await deps.registrar(c.pendentes);
    resumo.aplicadas += c.aplicar.length + c.resolver.length;
    resumo.conflitos += c.pendentes.filter(p => p.status === "conflito").length;
    resumo.erros += c.pendentes.filter(p => p.status === "erro").length;
    resumo.lotes++;
  }
  return resumo;
}
