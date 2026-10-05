// MONTAGEM DOS VALORES SNCF → BLING (05/10/2026, F5 passo 1).
// Fonte única da regra de conversão usada pela `corrigir-produto-bling` (correção)
// e pela `varrer-divergencia-bling` (detecção). Não duplicar estas regras.

export const TOL = 0.005;

export const vazio = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");
export const num = (v: unknown): number | null => {
  if (vazio(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
export const soDig = (v: unknown) => (vazio(v) ? null : String(v).replace(/\D/g, "") || null);
/** g → kg, 5 casas. */
export const pesoGParaKg = (pesoG: unknown): number | null => {
  const g = num(pesoG);
  return g === null ? null : Math.round((g / 1000) * 100000) / 100000;
};
/** ativo = A; demais = I. */
export const situacaoPelaFase = (fase: unknown) => (txt(fase) === "ativo" ? "A" : "I");

/** Contexto do produto no SNCF: ficha de sncf_produtos + fase + inner do cartório. */
export type ContextoSncf = { ficha: any; fase: string | null; inner: number | null };

export type Extrator = {
  tipo: "txt" | "num";
  sncf: (c: ContextoSncf) => unknown;
  bling: (atual: any) => unknown;
};

/** Um extrator por `produto_campo_destino.campo` (sistema Bling). */
export const EXTRATORES_BLING: Record<string, Extrator[]> = {
  nome_operacional: [{ tipo: "txt", sncf: (c) => c.ficha.nome_operacional, bling: (a) => a.nome }],
  preco_varejo: [{ tipo: "num", sncf: (c) => num(c.ficha.preco_varejo), bling: (a) => a.preco }],
  ean: [{ tipo: "txt", sncf: (c) => c.ficha.ean, bling: (a) => a.gtin }],
  peso_g: [
    { tipo: "num", sncf: (c) => pesoGParaKg(c.ficha.peso_g), bling: (a) => a.pesoLiquido },
    { tipo: "num", sncf: (c) => pesoGParaKg(c.ficha.peso_g), bling: (a) => a.pesoBruto },
  ],
  largura_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.largura_cm), bling: (a) => a.dimensoes?.largura }],
  altura_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.altura_cm), bling: (a) => a.dimensoes?.altura }],
  profundidade_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.profundidade_cm), bling: (a) => a.dimensoes?.profundidade }],
  dun: [{ tipo: "txt", sncf: (c) => c.ficha.dun, bling: (a) => a.gtinEmbalagem }],
  inner_qtd: [{ tipo: "num", sncf: (c) => c.inner, bling: (a) => a.itensPorCaixa }],
  ncm: [{ tipo: "txt", sncf: (c) => soDig(c.ficha.ncm), bling: (a) => soDig(a.tributacao?.ncm) }],
  cest: [{ tipo: "txt", sncf: (c) => soDig(c.ficha.cest), bling: (a) => soDig(a.tributacao?.cest) }],
  fase: [{ tipo: "txt", sncf: (c) => situacaoPelaFase(c.fase), bling: (a) => a.situacao }],
  origem_fisc: [{ tipo: "txt", sncf: (c) => c.ficha.origem_fisc, bling: (a) => a.tributacao?.origem }],
  sku: [{ tipo: "txt", sncf: (c) => txt(c.ficha.sku).toUpperCase() || null, bling: (a) => txt(a.codigo).toUpperCase() || null }],
};

/** Compara já normalizado (trim, vazio = null, números com tolerância). */
export function difere(tipo: "txt" | "num", sncf: unknown, bling: unknown): boolean {
  if (tipo === "num") {
    const a = num(sncf), b = num(bling);
    if (a === null && b === null) return false;
    if (a === null || b === null) return true;
    return Math.abs(a - b) > TOL;
  }
  const a = vazio(sncf) ? null : txt(sncf);
  const b = vazio(bling) ? null : txt(bling);
  return a !== b;
}
