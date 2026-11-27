// Planilha v2 — aba "Códigos e EAN" (controle do Flavio) + nascimento proposto pela aba Catálogo.
// Pure classification only: nothing here writes; the system never pairs code and EAN by itself, it only validates.
import { normalizarCodigo, vazio } from "./comparacao.ts";

export const ABA_CODIGOS = "Códigos e EAN";
export type SituacaoCartorio = "em uso" | "reservado" | "livre" | "morto";
export type Cartorio = { ean: string; cod_cadastro: string | null; dun: string | null; inner_qtd: number | null; situacao: SituacaoCartorio };
export type LinhaCodigos = { linha: number; cod: unknown; ean: unknown; inner: unknown };
export type LinhaCatalogoNova = { linha: number; cod: string; nome: string | null; origem: string | null };
export type PropostaCartorio = { tipo: "reservar" | "mudar_inner"; linha: number; ean: string; cod_cadastro: string; dun: string | null; inner_antes: number | null; inner_qtd: number | null };
export type PropostaNascimento = { linha: number; cod_cadastro: string; ean: string; dun: string | null; inner_qtd: number | null; nome_comercial: string | null; origem: string; reserva_na_planilha: boolean };
export type Recusa = { aba: "codigos" | "catalogo"; linha: number; cod_cadastro: string | null; ean: string | null; motivo: string };
export type ResultadoPropostas = { cartorio: PropostaCartorio[]; nascimentos: PropostaNascimento[]; recusas: Recusa[] };

export function normalizarEan(v: unknown): string | null {
  if (vazio(v)) return null;
  const d = String(typeof v === "number" ? Math.round(v) : v).trim().replace(/\D/g, "");
  if (!d) return null;
  return d.length === 12 ? "0" + d : d;
}
/** null = célula vazia (sem mudança); NaN = inválido. */
export function lerInner(v: unknown): number | null {
  if (vazio(v)) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isInteger(n) ? n : NaN;
}

export function classificarCodigos(linhas: LinhaCodigos[], cartorio: Map<string, Cartorio>) {
  const cartorio_: PropostaCartorio[] = [];
  const recusas: Recusa[] = [];
  const codDoCartorio = new Map<string, string>();
  for (const c of cartorio.values()) if (c.cod_cadastro) codDoCartorio.set(c.cod_cadastro, c.ean);
  const lidas = linhas.map(l => ({ linha: l.linha, cod: vazio(l.cod) ? null : normalizarCodigo(l.cod), ean: normalizarEan(l.ean), inner: lerInner(l.inner) })).filter(l => l.cod || l.ean || l.inner != null);
  const usos = new Map<string, number>();
  for (const l of lidas) if (l.cod) usos.set(l.cod, (usos.get(l.cod) ?? 0) + 1);
  const eanDoCod = new Map<string, string>();
  const recusaDoCod = new Map<string, string>();
  const recusar = (l: typeof lidas[number], motivo: string) => { recusas.push({ aba: "codigos", linha: l.linha, cod_cadastro: l.cod, ean: l.ean, motivo }); if (l.cod) recusaDoCod.set(l.cod, motivo); };
  for (const l of lidas) {
    if (!l.ean) { recusar(l, "Linha sem EAN."); continue; }
    const c = cartorio.get(l.ean);
    if (!c) { recusar(l, `EAN ${l.ean} não existe no cartório (EAN não se inventa).`); continue; }
    const codMudou = (l.cod ?? null) !== (c.cod_cadastro ?? null);
    const innerMudou = l.inner != null && l.inner !== c.inner_qtd;
    if (!codMudou && !innerMudou) { if (l.cod) eanDoCod.set(l.cod, l.ean); continue; }
    if (c.situacao === "morto") { recusar(l, `EAN ${l.ean} está morto e não pode ser usado.`); continue; }
    if (l.cod && (usos.get(l.cod) ?? 0) > 1) { recusar(l, `Código ${l.cod} aparece em mais de um EAN na aba.`); continue; }
    if (l.inner != null && (Number.isNaN(l.inner) || l.inner < 1)) { recusar(l, "Inner deve ser um número inteiro ≥ 1."); continue; }
    if (codMudou) {
      if (c.situacao === "em uso") { recusar(l, `EAN ${l.ean} já está em uso pelo código ${c.cod_cadastro}; o par de produto existente não se troca.`); continue; }
      if (c.situacao === "reservado") { recusar(l, `EAN ${l.ean} já está reservado para o código ${c.cod_cadastro}; trocar ou desfazer reserva não é feito pela planilha.`); continue; }
      if (!l.cod) continue;
      const outro = codDoCartorio.get(l.cod);
      if (outro && outro !== l.ean) { recusar(l, `Código ${l.cod} já existe no cartório no EAN ${outro}.`); continue; }
      cartorio_.push({ tipo: "reservar", linha: l.linha, ean: l.ean, cod_cadastro: l.cod, dun: c.dun, inner_antes: c.inner_qtd, inner_qtd: l.inner });
      eanDoCod.set(l.cod, l.ean);
      continue;
    }
    if (!l.cod) { recusar(l, "Inner em EAN sem código: reserve um código antes."); continue; }
    cartorio_.push({ tipo: "mudar_inner", linha: l.linha, ean: l.ean, cod_cadastro: l.cod, dun: c.dun, inner_antes: c.inner_qtd, inner_qtd: l.inner });
    eanDoCod.set(l.cod, l.ean);
  }
  return { cartorio: cartorio_, recusas, eanDoCod, recusaDoCod };
}

export function classificarPropostas(linhasCodigos: LinhaCodigos[], cartorio: Map<string, Cartorio>, catalogoSemCadastro: LinhaCatalogoNova[]): ResultadoPropostas {
  const cod = classificarCodigos(linhasCodigos, cartorio);
  const porCodCartorio = new Map<string, Cartorio>();
  for (const c of cartorio.values()) if (c.cod_cadastro) porCodCartorio.set(c.cod_cadastro, c);
  const nascimentos: PropostaNascimento[] = [];
  const recusas = [...cod.recusas];
  for (const l of catalogoSemCadastro) {
    const recusar = (motivo: string, ean: string | null = null) => recusas.push({ aba: "catalogo", linha: l.linha, cod_cadastro: l.cod, ean, motivo });
    const motivoPar = cod.recusaDoCod.get(l.cod);
    if (motivoPar) { recusar(`Par recusado na aba Códigos e EAN: ${motivoPar}`); continue; }
    const reserva = cod.cartorio.find(p => p.tipo === "reservar" && p.cod_cadastro === l.cod);
    const ean = cod.eanDoCod.get(l.cod) ?? porCodCartorio.get(l.cod)?.ean ?? null;
    if (!ean) { recusar("Código sem EAN na aba Códigos e EAN."); continue; }
    const c = cartorio.get(ean);
    if (!reserva && c?.situacao === "em uso") { recusar(`Código ${l.cod} já está em uso no cartório.`, ean); continue; }
    if (!reserva && c?.situacao === "morto") { recusar(`EAN ${ean} está morto.`, ean); continue; }
    const mudanca = cod.cartorio.find(p => p.cod_cadastro === l.cod);
    const inner = mudanca?.inner_qtd ?? c?.inner_qtd ?? null;
    const origem = (l.origem ?? "").trim().toLocaleLowerCase("pt-BR") || "nacional";
    if (origem !== "nacional" && origem !== "importado") { recusar(`Origem produto inválida: ${l.origem}.`, ean); continue; }
    if (origem === "importado" && inner == null) { recusar("Produto importado exige inner na aba Códigos e EAN.", ean); continue; }
    nascimentos.push({ linha: l.linha, cod_cadastro: l.cod, ean, dun: c?.dun ?? null, inner_qtd: inner, nome_comercial: l.nome, origem, reserva_na_planilha: !!reserva });
  }
  return { cartorio: cod.cartorio, nascimentos, recusas };
}
