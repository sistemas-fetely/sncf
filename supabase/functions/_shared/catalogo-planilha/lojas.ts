// Lojas do produto (produto_loja × loja_dim), alimentadas pela planilha v2 (decisão Flavio 28/11/2026).
// Colunas loja_* comparam Sim/Não da planilha com produto_loja.vende; o mapeamento coluna→loja vem de loja_dim.slug_planilha.
import { compararCelula } from "./comparacao.ts";

export type LojaDim = { slug: string; nome: string; ordem: number; slug_planilha: string; papel_canal?: string | null };

const SIM = new Set(["sim", "s", "x", "true"]);
const NAO = new Set(["não", "nao", "n", "false"]);

/** "true" | "false" | null (vazio = sem mudança); qualquer outra grafia é erro. */
export function normalizarSimNao(v: unknown): "true" | "false" | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const t = String(v).trim().toLocaleLowerCase("pt-BR");
  if (!t) return null;
  if (SIM.has(t)) return "true";
  if (NAO.has(t)) return "false";
  throw new Error(`Valor de loja inválido: ${String(v).trim()} (use Sim ou Não).`);
}

/** Célula de loja na comparação de 3 vias; base ausente = valor atual do sistema (nunca acusa onde a planilha já concorda). */
export function analisarCelulaLoja(base: unknown, planilha: unknown, sistema: unknown) {
  try {
    const valor_sistema = normalizarSimNao(sistema);
    const valor_base = base === undefined ? valor_sistema : normalizarSimNao(base);
    const valor_planilha = normalizarSimNao(planilha);
    return { valor_base, valor_planilha, valor_sistema, tipo: compararCelula(valor_base, valor_planilha, valor_sistema), erro: null as string | null };
  } catch (e) {
    return { valor_base: base ?? null, valor_planilha: planilha ?? null, valor_sistema: sistema ?? null, tipo: "erro" as const, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Canal de venda derivado das lojas (espelha fn_canal_de_papeis no banco). */
export function canalDerivado(vende: Record<string, boolean>, lojas: Pick<LojaDim, "slug" | "papel_canal">[]): "ambos" | "b2b" | "b2c" | null {
  const papel = (p: string) => lojas.some(l => l.papel_canal === p && vende[l.slug] === true);
  const b2b = papel("b2b"), b2c = papel("b2c");
  return b2b && b2c ? "ambos" : b2b ? "b2b" : b2c ? "b2c" : null;
}

export const simNaoTexto = (v: unknown) => v === true || v === "true" ? "Sim" : v === false || v === "false" ? "Não" : null;
