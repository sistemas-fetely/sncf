/**
 * MESA-SP-CAIXA-OBRIGATORIA (03/11/2026, SHP-1586): Correios exige a caixa usada —
 * do cadastro (`b2c_embalagem_caixa`) ou avulsa com medidas C × L × A. A trava real
 * é o banco (`fn_mesa_sp_embalar` / `fn_mesa_sp_corrigir_caixa`); este helper só
 * espelha a regra para habilitar o botão.
 */
export interface DimCaixa { comprimento_cm: number; largura_cm: number; altura_cm: number }
export interface DimCaixaTexto { c: string; l: string; a: string }

const n = (s: string) => Number(String(s ?? "").replace(",", ".").trim());

/** Medidas digitadas → dimensão válida (todas > 0 e ≤ 200 cm) ou null. */
export function dimAvulsa(t: DimCaixaTexto | null): DimCaixa | null {
  if (!t) return null;
  const c = n(t.c), l = n(t.l), a = n(t.a);
  if (![c, l, a].every((v) => Number.isFinite(v) && v > 0 && v <= 200)) return null;
  return { comprimento_cm: c, largura_cm: l, altura_cm: a };
}

/** Correios sem caixa do cadastro nem avulsa válida não pode concluir. Outros modais: caixa opcional. */
export function caixaOkParaModal(modal: string, caixaCodigo: string | null, dim: DimCaixa | null): boolean {
  if (modal !== "CORREIOS") return true;
  return !!caixaCodigo || !!dim;
}

/** Falha da edge de pré-postagem que pede a correção da embalagem. */
export function erroPedeCorrigirEmbalagem(msg: string | null | undefined): boolean {
  return !!msg && /embalagem sem caixa registrada|caixa ".*" da embalagem não encontrada/i.test(msg);
}

/** Último `mesa_embalado` em Correios sem caixa nem medidas. */
export function embalagemSemCaixa(meta: { modal?: string | null; caixa?: string | null; caixa_dim?: unknown } | null): boolean {
  if (!meta || meta.modal !== "CORREIOS") return false;
  return !meta.caixa && !meta.caixa_dim;
}
