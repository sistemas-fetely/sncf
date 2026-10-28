import { exigirCodigoExterno } from "../produto-codigo.ts";
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
// FASE → SITUAÇÃO VIA DIMENSÃO (15/10/2026): a regra mora em produto_fase_destino
// (sistema, fase, valor, ativo). Fase sem linha = FAIL-LOUD, nunca inventar "I".
export type MapaFaseDestino = Map<string, string>;
export class FaseSemRegra extends Error {
  constructor(fase: unknown) {
    super(`fase sem regra em produto_fase_destino: ${txt(fase) || "(vazia)"}`);
    this.name = "FaseSemRegra";
  }
}
/** Carrega uma vez por execução. Erro de leitura lança. */
export async function carregarFaseDestino(sb: any, sistema = "Bling"): Promise<MapaFaseDestino> {
  const { data, error } = await sb.from("produto_fase_destino").select("fase, valor")
    .eq("sistema", sistema).eq("ativo", true);
  if (error) throw new Error(`produto_fase_destino: ${error.message}`);
  return new Map((data ?? []).map((r: any) => [txt(r.fase), txt(r.valor)]));
}
/** Valor de destino da fase; lança FaseSemRegra se não houver linha. */
export function situacaoPelaFase(mapa: MapaFaseDestino, fase: unknown): string {
  const v = mapa.get(txt(fase));
  if (!v) throw new FaseSemRegra(fase);
  return v;
}

/** Contexto do produto no SNCF: ficha de sncf_produtos + fase + inner do cartório. */
export type ContextoSncf = { ficha: any; fase: string | null; inner: number | null; faseDestino: MapaFaseDestino };

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
  fase: [{ tipo: "txt", sncf: (c) => situacaoPelaFase(c.faseDestino, c.fase), bling: (a) => a.situacao }],
  origem_fisc: [{ tipo: "txt", sncf: (c) => c.ficha.origem_fisc, bling: (a) => a.tributacao?.origem }],
  // SKU É SÓ INTERNO: o código no Bling é o codigo_externo (nunca cai no sku).
  sku: [{ tipo: "txt", sncf: (c) => exigirCodigoExterno(c.ficha.sku, c.ficha.codigo_externo).toUpperCase(), bling: (a) => txt(a.codigo).toUpperCase() || null }],
};

// GRUPO TRIBUTÁRIO (07/10/2026): deriva da origem fiscal. No GET v3 vem em
// tributacao.grupoProduto = { id } (0 = sem grupo); o nome sai de /grupos-produtos.
export const GRUPO_L1 = "L1 - Produto Nacional Importado";
export const GRUPO_L2 = "L2 - Produto Nacional";
export function grupoTributarioEsperado(origem: unknown): string | null {
  const o = txt(origem);
  if (["1", "2", "6", "7"].includes(o)) return GRUPO_L1;
  if (["0", "3", "4", "5", "8"].includes(o)) return GRUPO_L2;
  return null;
}
/** 20/10/2026: grupo tributário é campo próprio (sncf_produtos.grupo_tributario_bling); origem só como fallback. */
export function grupoTributarioDaFicha(grupoFicha: unknown, origem: unknown): string | null {
  return vazio(grupoFicha) ? grupoTributarioEsperado(origem) : txt(grupoFicha);
}
/** Lê /grupos-produtos do Bling (paginado): id → nome e nome (minúsculo) → id. */
export async function carregarGruposBling(client: any, pausaMs = 350) {
  const nomePorId = new Map<number, string>();
  const idPorNome = new Map<string, number>();
  for (let p = 1; p <= 20; p++) {
    if (p > 1) await new Promise((r) => setTimeout(r, pausaMs));
    const r = await client.get(`/grupos-produtos?pagina=${p}&limite=100`);
    const itens: any[] = r?.data ?? [];
    for (const g of itens) {
      const id = Number(g?.id), nome = txt(g?.nome);
      if (id > 0 && nome) { nomePorId.set(id, nome); idPorNome.set(nome.toLowerCase(), id); }
    }
    if (itens.length < 100) break;
  }
  return { nomePorId, idPorNome };
}
export const grupoIdDoCard = (atual: any): number | null => {
  const id = num(atual?.tributacao?.grupoProduto?.id);
  return id && id > 0 ? id : null;
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
