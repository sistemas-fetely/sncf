import { grupoIdDoCard, situacaoPelaFase, grupoTributarioDaFicha, FaseSemRegra, type MapaFaseDestino } from "../_shared/bling/montar-valores-produto.ts";
import { alinharOrigemCard } from "../_shared/bling/origem-card.ts";
export type Campo = { campo: string; origem: string; destino: string; tipo: "numero" | "texto" | "digitos" | "grupo" | "origem"; divisor?: number; tolerancia?: number; sobrescreve?: boolean };
export type Diferenca = { campo: string; destino: string; valor_sncf: unknown; valor_bling: unknown };
export type Grupos = { nomePorId: Map<number, string>; idPorNome: Map<string, number> };
export type Contexto = { grupos?: Grupos };
const DESTINOS = new Set(["nome", "preco", "situacao", "pesoBruto", "pesoLiquido", "dimensoes.altura", "dimensoes.largura", "dimensoes.profundidade", "dimensoes.unidadeMedida", "gtin", "gtinEmbalagem", "tributacao.ncm", "tributacao.cest", "tributacao.grupoProduto", "tributacao.origem", "marca", "itensPorCaixa"]);

// produto_campo_destino.campo (sistema Bling) → campo(s) do motor. O BANCO decide quais entram (ativo + na_correcao)
// e quais vão no envio em massa (sobrescreve). Exceções fixas documentadas:
//  - unidadeMedida: vai sempre junto com as dimensões (=1, cm).
//  - origem fiscal (tributacao.origem): comparada e enviada sempre, como na varredura (alinharOrigemCard).
//  - sku: identidade do card (confirmarCodigo), nunca enviado.
export const MOTOR_POR_CAMPO: Record<string, Campo[]> = {
  peso_g: [{ campo: "pesoBruto", origem: "peso_g", destino: "pesoBruto", tipo: "numero", divisor: 1000 }, { campo: "pesoLiquido", origem: "peso_g", destino: "pesoLiquido", tipo: "numero", divisor: 1000 }],
  altura_cm: [{ campo: "altura", origem: "altura_cm", destino: "dimensoes.altura", tipo: "numero" }],
  largura_cm: [{ campo: "largura", origem: "largura_cm", destino: "dimensoes.largura", tipo: "numero" }],
  profundidade_cm: [{ campo: "profundidade", origem: "profundidade_cm", destino: "dimensoes.profundidade", tipo: "numero" }],
  ean: [{ campo: "gtin", origem: "ean", destino: "gtin", tipo: "texto" }],
  dun: [{ campo: "gtinEmbalagem", origem: "dun", destino: "gtinEmbalagem", tipo: "texto" }],
  inner_qtd: [{ campo: "itensPorCaixa", origem: "inner_qtd", destino: "itensPorCaixa", tipo: "numero" }],
  ncm: [{ campo: "ncm", origem: "ncm", destino: "tributacao.ncm", tipo: "digitos" }],
  cest: [{ campo: "cest", origem: "cest", destino: "tributacao.cest", tipo: "digitos" }],
  marca: [{ campo: "marca", origem: "marca", destino: "marca", tipo: "texto" }],
  nome_operacional: [{ campo: "nome", origem: "nome_operacional", destino: "nome", tipo: "texto" }],
  preco_varejo: [{ campo: "preco", origem: "preco_varejo", destino: "preco", tipo: "numero", tolerancia: 0.005 }],
  fase: [{ campo: "situacao", origem: "situacao_esperada", destino: "situacao", tipo: "texto" }],
  grupo_tributario: [{ campo: "grupoTributario", origem: "grupo_esperado", destino: "tributacao.grupoProduto", tipo: "grupo" }],
};
export const ORIGEM_FISCAL: Campo = { campo: "origem", origem: "origem_fisc", destino: "tributacao.origem", tipo: "origem", sobrescreve: true };
const FORA_DO_MOTOR = new Set(["sku", "origem_fisc"]);
export const ROTULOS: Record<string, string> = { nome: "Nome", preco: "Preço", situacao: "Situação do card", grupoTributario: "Grupo tributário", origem: "Origem fiscal", pesoBruto: "Peso bruto (kg)", pesoLiquido: "Peso líquido (kg)", altura: "Altura", largura: "Largura", profundidade: "Profundidade", unidadeMedida: "Unidade das medidas", gtin: "GTIN", gtinEmbalagem: "DUN (GTIN da caixa)", ncm: "NCM", cest: "CEST", marca: "Marca", itensPorCaixa: "Itens por caixa" };

export type LinhaCampoDestino = { campo: string; sobrescreve: boolean | null };
export function camposDoBanco(linhas: LinhaCampoDestino[]): { campos: Campo[]; avisos: string[] } {
  const porCampo = new Map<string, Campo>(); const avisos: string[] = [];
  for (const l of linhas) {
    if (FORA_DO_MOTOR.has(l.campo)) continue;
    const motor = MOTOR_POR_CAMPO[l.campo];
    if (!motor) { avisos.push(`produto_campo_destino.${l.campo} não tem campo no motor Bling; ignorado.`); continue; }
    for (const m of motor) { const prev = porCampo.get(m.campo); porCampo.set(m.campo, { ...m, sobrescreve: !!prev?.sobrescreve || !!l.sobrescreve }); }
  }
  return { campos: [...porCampo.values(), ORIGEM_FISCAL], avisos };
}
/** Campos do motor liberados para envio em massa (sobrescreve). unidadeMedida acompanha as dimensões. */
export function camposEmMassa(campos: Campo[]): Set<string> {
  const s = new Set(campos.filter((c) => c.sobrescreve).map((c) => c.campo));
  if (["altura", "largura", "profundidade"].some((c) => s.has(c))) s.add("unidadeMedida");
  return s;
}

/** Deriva na fonte os valores calculados: situação pela fase e grupo tributário. Fase sem regra vira aviso, nunca valor inventado. */
export function enriquecerFonte(fonte: Record<string, any>, faseDestino: MapaFaseDestino): Record<string, any> & { avisos: string[] } {
  const avisos: string[] = [];
  let situacao_esperada: string | null = null;
  try { situacao_esperada = situacaoPelaFase(faseDestino, fonte.fase); }
  catch (e) { if (e instanceof FaseSemRegra) avisos.push(`Situação do card não comparada: ${e.message}`); else throw e; }
  return { ...fonte, situacao_esperada, grupo_esperado: grupoTributarioDaFicha(fonte.grupo_tributario_bling, fonte.origem_fisc), avisos };
}

export function ler(obj: Record<string, any>, path: string): unknown { return path.split(".").reduce((o, k) => o?.[k], obj); }
export function valor(v: unknown, c: Campo): unknown {
  if (v == null || String(v).trim() === "" || Number(v) === 0) return null;
  if (c.tipo === "numero") { const n = Number(v); return Number.isFinite(n) && n > 0 ? n / (c.divisor ?? 1) : null; }
  return c.tipo === "digitos" ? String(v).replace(/\D/g, "") || null : String(v).trim();
}
const nomeGrupo = (bling: Record<string, any>, ctx: Contexto) => {
  if (!ctx.grupos) throw new Error("Grupos tributários do Bling não carregados.");
  const id = grupoIdDoCard(bling); return id == null ? null : ctx.grupos.nomePorId.get(id) ?? `#${id}`;
};
export function comparar(fonte: Record<string, any>, bling: Record<string, any>, campos: Campo[], ctx: Contexto = {}): Diferenca[] {
  const diferencas = campos.flatMap((c): Diferenca[] => {
    if (!DESTINOS.has(c.destino)) throw new Error(`Campo fora do motor: ${c.destino}`);
    if (c.tipo === "origem") {
      const r = alinharOrigemCard(fonte.origem_fisc, bling);
      return r.tipo === "divergencia" ? [{ campo: c.campo, destino: c.destino, valor_sncf: Number(r.para), valor_bling: r.de }] : [];
    }
    if (c.tipo === "grupo") {
      const esperado = fonte.grupo_esperado == null || String(fonte.grupo_esperado).trim() === "" ? null : String(fonte.grupo_esperado).trim();
      if (!esperado) return [];
      const atual = nomeGrupo(bling, ctx);
      return atual != null && atual.trim().toLowerCase() === esperado.toLowerCase() ? [] : [{ campo: c.campo, destino: c.destino, valor_sncf: esperado, valor_bling: atual }];
    }
    if (c.destino === "itensPorCaixa") {
      if (c.origem !== "inner_qtd") throw new Error("itensPorCaixa exige origem inner_qtd; múltiplo comercial nunca pode ser enviado.");
      if (fonte.inner_confirmado !== true) return [];
    }
    const sncf = valor(fonte[c.origem], c); if (sncf == null) return [];
    const bruto = ler(bling, c.destino) ?? null;
    const atual = c.tipo === "numero" ? Number(bruto) : c.tipo === "digitos" ? String(bruto ?? "").replace(/\D/g, "") : String(bruto ?? "").trim();
    const igual = c.tipo === "numero" ? Math.abs(Number(sncf) - Number(atual)) <= (c.tolerancia ?? 0.001) + Number.EPSILON : sncf === atual;
    return igual ? [] : [{ campo: c.campo, destino: c.destino, valor_sncf: sncf, valor_bling: bruto }];
  });
  const temDimensao = campos.some((c) => c.destino.startsWith("dimensoes.") && c.destino !== "dimensoes.unidadeMedida" && valor(fonte[c.origem], c) != null);
  if (temDimensao && Number(bling.dimensoes?.unidadeMedida) !== 1) {
    diferencas.push({ campo: "unidadeMedida", destino: "dimensoes.unidadeMedida", valor_sncf: 1, valor_bling: bling.dimensoes?.unidadeMedida ?? null });
  }
  return diferencas;
}
export type FiltroAplicacao = { skus?: string[]; campos?: string[] };
export function dentroDoFiltro(item: { sku: string; campo: string }, filtro: FiltroAplicacao): boolean {
  return (filtro.skus === undefined || filtro.skus.includes(item.sku)) && (filtro.campos === undefined || filtro.campos.includes(item.campo));
}
export function confirmarCodigo(atual: Record<string, any> | null, codigo: string, id: unknown): void {
  if (!atual?.id || String(atual.id) !== String(id) || String(atual.codigo ?? "") !== codigo) throw new Error(`Vínculo Bling mudou: esperado ${codigo} (${id}); refaça a comparação.`);
}
/** Monta o PATCH só dos itens pedidos. Com `atual`, o bloco tributacao parte do GET atual e troca só o pedido. */
export function montarPatch(itens: Diferenca[], fonte: Record<string, any> = {}, ctx: Contexto = {}, atual?: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const i of itens) {
    if (!DESTINOS.has(i.destino)) throw new Error(`Campo fora do motor: ${i.destino}`);
    if (i.destino === "tributacao.grupoProduto") {
      if (!ctx.grupos) throw new Error("Grupos tributários do Bling não carregados.");
      const id = ctx.grupos.idPorNome.get(String(i.valor_sncf).trim().toLowerCase());
      if (!id) throw new Error(`Grupo tributário "${i.valor_sncf}" não existe no Bling.`);
      patch.tributacao ??= {}; patch.tributacao.grupoProduto = { id }; continue;
    }
    if (i.destino === "tributacao.origem") { patch.tributacao ??= {}; patch.tributacao.origem = Number(i.valor_sncf); continue; }
    if (i.valor_sncf == null || String(i.valor_sncf).trim() === "" || Number(i.valor_sncf) === 0) continue;
    const [grupo, campo] = i.destino.split(".");
    if (campo) { patch[grupo] ??= {}; patch[grupo][campo] = i.valor_sncf; }
    else patch[grupo] = i.valor_sncf;
  }
  if (patch.dimensoes) {
    const dimensoes: Record<string, number> = { unidadeMedida: 1 };
    for (const campo of ["altura", "largura", "profundidade"]) {
      const medida = Number(fonte[`${campo}_cm`]);
      if (!Number.isFinite(medida) || medida <= 0) throw new Error(`Dimensão SNCF inválida: ${campo}_cm; nenhum PATCH seguro pode ser montado.`);
      dimensoes[campo] = medida;
    }
    patch.dimensoes = dimensoes;
  }
  if (patch.tributacao && atual?.tributacao) patch.tributacao = { ...atual.tributacao, ...patch.tributacao };
  return patch;
}
/** Após o PATCH: ncm, cest, origem e grupo não podem mudar sem terem sido pedidos. */
export function fiscaisPreservados(antes: Record<string, any>, depois: Record<string, any>, pedidos: string[]): void {
  const chaves: [string, (a: any) => unknown][] = [["ncm", (a) => a?.tributacao?.ncm ?? null], ["cest", (a) => a?.tributacao?.cest ?? null], ["origem", (a) => a?.tributacao?.origem ?? null], ["grupoTributario", (a) => grupoIdDoCard(a)]];
  const mudou = chaves.filter(([c, f]) => !pedidos.includes(c) && String(f(antes) ?? "") !== String(f(depois) ?? "")).map(([c]) => c);
  if (mudou.length) throw new Error(`Bling alterou campo fiscal não pedido: ${mudou.join(", ")}.`);
}
export function exigirEscrita(config: { escrita_habilitada: boolean }) { if (!config.escrita_habilitada) throw new Error("Envio ao Bling desligado na configuração. Nenhum produto foi enviado."); }
