import { FunctionRegion } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export class ErroEdge extends Error {
  constructor(msg: string, readonly status: number | null) { super(msg); }
}

/**
 * SAFRAPAY-SP (22/11/2026): as edges do Safrapay rodam sempre em São Paulo (sa-east-1).
 * O Supabase escolhe a região mais próxima de quem chama; com IP americano o Akamai do
 * Safrapay devolve 403 "Access Denied" em /v2/merchant/auth.
 */
export function opcoesEdge(nome: string, body: unknown): { body: unknown; region?: FunctionRegion } {
  const opcoes: { body: unknown; region?: FunctionRegion } = { body };
  if (nome.startsWith("safrapay-")) opcoes.region = FunctionRegion.SaEast1;
  return opcoes;
}

export async function chamarEdge<T>(nome: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, opcoesEdge(nome, body));
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = data?.erro || error.message;
    const status = ctx?.status ?? null;
    if (ctx && typeof ctx.json === "function") {
      try {
        const resposta = typeof ctx.clone === "function" ? ctx.clone() : ctx;
        const j = await resposta.json();
        if (j?.erro || j?.error || j?.message) msg = String(j.erro || j.error || j.message);
      } catch { /* preserva mensagem recebida quando o corpo não é JSON */ }
    }
    throw new ErroEdge(msg, status);
  }
  if (data?.ok === false) throw new ErroEdge(String(data.erro ?? data.error ?? "Falha"), null);
  return data as T;
}
