/**
 * Modo contagem do Inventário: sessão de itens contados (puro e testável).
 * - `ordem`: SKUs na ordem da lista (último lido primeiro).
 * - `qtd`: texto do input por SKU. Chave ausente = não contado; "0" = contei zero.
 */
export interface SessaoContagem { ordem: string[]; qtd: Record<string, string> }

export const sessaoVazia = (): SessaoContagem => ({ ordem: [], qtd: {} });

const num = (v: string | undefined) => (v === undefined || v === "" || isNaN(Number(v)) ? 0 : Number(v));
const paraTopo = (ordem: string[], sku: string) => [sku, ...ordem.filter((s) => s !== sku)];

/** Leitura (delta > 0) soma e sobe ao topo. Desfazer (delta < 0) tira o item ao chegar a 0. */
export function somarLeitura(s: SessaoContagem, sku: string, delta: number): SessaoContagem {
  if (delta >= 0) {
    return { ordem: paraTopo(s.ordem, sku), qtd: { ...s.qtd, [sku]: String(num(s.qtd[sku]) + delta) } };
  }
  if (!(sku in s.qtd)) return s;
  const novo = num(s.qtd[sku]) + delta;
  if (novo <= 0) return removerItem(s, sku);
  return { ...s, qtd: { ...s.qtd, [sku]: String(novo) } };
}

/** Digitação no input: valor livre ("0" é válido); item novo entra no topo. */
export function definirQtd(s: SessaoContagem, sku: string, valor: string): SessaoContagem {
  const ordem = sku in s.qtd ? s.ordem : paraTopo(s.ordem, sku);
  return { ordem, qtd: { ...s.qtd, [sku]: valor } };
}

export function removerItem(s: SessaoContagem, sku: string): SessaoContagem {
  const qtd = { ...s.qtd };
  delete qtd[sku];
  return { ordem: s.ordem.filter((x) => x !== sku), qtd };
}

export function importarItens(s: SessaoContagem, itens: { sku: string; qtd: number }[], modo: "somar" | "substituir"): SessaoContagem {
  let r = modo === "substituir" ? sessaoVazia() : s;
  for (const i of itens) r = somarLeitura(r, i.sku, Math.max(0, i.qtd));
  return r;
}

export const numeroInvalido = (v: string) => v !== "" && (isNaN(Number(v)) || Number(v) < 0);

/** Itens válidos (preenchidos, ≥ 0) na ordem da lista. */
export function preenchidos(s: SessaoContagem): [string, number][] {
  return s.ordem.filter((k) => s.qtd[k] !== undefined && s.qtd[k] !== "" && !numeroInvalido(s.qtd[k])).map((k) => [k, Number(s.qtd[k])]);
}

export function resumoSessao(s: SessaoContagem, contabil: Map<string, number>) {
  let pecas = 0, sobras = 0, faltas = 0;
  const p = preenchidos(s);
  p.forEach(([sku, q]) => {
    pecas += q;
    const d = q - (contabil.get(sku) ?? 0);
    if (d > 0) sobras++; else if (d < 0) faltas++;
  });
  return { itens: p.length, pecas, sobras, faltas };
}

/** Itens do centro (contábil ≠ 0 ou físico) ainda fora da contagem. */
export function naoContados<T extends { sku: string }>(linhasCentro: T[], s: SessaoContagem): T[] {
  return linhasCentro.filter((l) => !(l.sku in s.qtd));
}

/** Total = os não contados entram com 0; parcial = só os contados. */
export function itensRegistro(s: SessaoContagem, naoContadosSkus: string[], modo: "total" | "parcial") {
  const itens = preenchidos(s).map(([sku, qtd]) => ({ sku, qtd, condicao: "sadio" }));
  if (modo === "total") {
    const ja = new Set(itens.map((i) => i.sku));
    naoContadosSkus.filter((k) => !ja.has(k)).forEach((sku) => itens.push({ sku, qtd: 0, condicao: "sadio" }));
  }
  return itens;
}

// ---------- sugestões por nome/código ----------
export interface ProdutoCatalogo { sku: string; cod_cadastro: string | null; nome_comercial: string | null; cor_nome: string | null; colecao: string | null }

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const temLetra = (t: string) => /[a-zA-ZÀ-ÿ]/.test(t);

export function sugerirProdutos(catalogo: ProdutoCatalogo[], texto: string, limite = 8): ProdutoCatalogo[] {
  if (!temLetra(texto)) return [];
  const termos = semAcento(texto).split(/\s+/).filter(Boolean);
  const r: ProdutoCatalogo[] = [];
  for (const p of catalogo) {
    const alvo = semAcento([p.cod_cadastro, p.sku, p.nome_comercial, p.cor_nome].filter(Boolean).join(" "));
    if (termos.every((t) => alvo.includes(t))) { r.push(p); if (r.length >= limite) break; }
  }
  return r;
}

// ---------- rascunho da sessão ----------
export const chaveRascunho = (centro: string, data: string) => `sncf.inventario.rascunho.${centro}.${data}`;

export function lerRascunho(texto: string | null): SessaoContagem {
  if (!texto) return sessaoVazia();
  try {
    const o = JSON.parse(texto);
    if (!o || !Array.isArray(o.ordem) || typeof o.qtd !== "object" || o.qtd === null) return sessaoVazia();
    const qtd: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.qtd)) if (typeof v === "string") qtd[k] = v;
    const ordem = (o.ordem as unknown[]).filter((k): k is string => typeof k === "string" && k in qtd);
    Object.keys(qtd).forEach((k) => { if (!ordem.includes(k)) ordem.push(k); });
    return { ordem, qtd };
  } catch { return sessaoVazia(); }
}
