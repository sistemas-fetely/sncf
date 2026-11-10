import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";

export interface InstrucaoExpedicao {
  instrucao_expedicao: string | null;
  instrucao_expedicao_lida_em: string | null;
  instrucao_pendente: boolean;
}

export function instrucaoMudou(atual: string | null | undefined, novo: string): boolean {
  return (atual ?? "").trim() !== novo.trim();
}

/** The database owns acknowledgement/reset rules; the UI consumes its pending flag. */
export function bloqueiaAvancoInstrucao(pedido: Pick<InstrucaoExpedicao, "instrucao_pendente"> | null): boolean {
  return pedido?.instrucao_pendente === true;
}

// Local contract for existing RPCs not yet present in generated types.
const cliente = supabase as unknown as SupabaseClient;

export async function executarInstrucaoRpc(nome: "fn_pedido_definir_instrucao_expedicao" | "fn_mesa_sp_ler_instrucao", args: { p_pedido_id: string; p_texto?: string }) {
  const { data, error } = await cliente.rpc(nome, args);
  if (error) throw new Error(formatError(error));
  if (data?.ok !== true) throw new Error(data?.erro ?? data?.error ?? data?.mensagem ?? "O banco não confirmou a instrução para expedição.");
  return data as { ok: true; mudou?: boolean };
}

export async function definirInstrucaoExpedicao(pedidoId: string, texto: string) {
  return executarInstrucaoRpc("fn_pedido_definir_instrucao_expedicao", { p_pedido_id: pedidoId, p_texto: texto.trim() });
}