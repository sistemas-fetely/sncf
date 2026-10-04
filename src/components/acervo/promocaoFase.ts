import { supabase } from "@/integrations/supabase/client";

/**
 * Chamada e leitura de erro das edges de produto (promover-fase-produto),
 * compartilhadas pelos lotes de fase. FAIL-LOUD: o corpo cru da função
 * volta no erro para ser nomeado por produto.
 */
export type CorpoFuncao = Record<string, unknown>;
export type ErroFuncao = { status: number; corpo: CorpoFuncao | null };

export async function chamarFuncao(nome: string, payload: Record<string, unknown>): Promise<CorpoFuncao> {
  const { data, error } = await supabase.functions.invoke(nome, { body: payload });
  if (error) {
    const resp = (error as { context?: unknown })?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: CorpoFuncao | null = null;
      try { corpo = await resp.json(); } catch { try { corpo = { erro: await resp.text() }; } catch { corpo = null; } }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }
  if (!data || data.ok !== true) throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  return data as CorpoFuncao;
}

export function motivoDaFalha(e: unknown): string {
  const err = e as ErroFuncao;
  const corpo = err?.corpo ?? {};
  if (err?.status === 409) return `saldo em estoque (${String(corpo.saldo_disponivel ?? "?")}) — marque "Seguir mesmo se houver saldo"`;
  if (err?.status === 422) return `ficha incompleta: ${(Array.isArray(corpo.campos_faltando) ? corpo.campos_faltando.map(String) : []).join(", ") || "campos não informados"}`;
  if (err?.status === 502) return `o FOP recusou: ${typeof corpo.fop_body === "string" ? corpo.fop_body : JSON.stringify(corpo.fop_body ?? corpo)}`;
  for (const k of ["mensagem", "erro", "message"]) {
    const v = (corpo as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return err?.status ? `${err.status}: ${v}` : v;
  }
  return `${err?.status || ""} ${JSON.stringify(corpo)}`.trim() || "Erro sem detalhe.";
}
