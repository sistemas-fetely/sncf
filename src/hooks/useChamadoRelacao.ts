import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatError, rawMessage } from "@/lib/format-error";

/**
 * Vínculo do usuário logado com um chamado (fn_chamado_minha_relacao).
 * Não é permissão de catálogo — é relação com o chamado. Quem decide é o banco.
 */
export interface ChamadoRelacao {
  pode_mexer: boolean;
  eh_solicitante: boolean;
  pode_responder: boolean;
  pode_escalar: boolean;
}

export const chaveChamadoRelacao = (id: string | undefined) =>
  ["fn_chamado_minha_relacao", id] as const;

export async function buscarChamadoRelacao(id: string): Promise<ChamadoRelacao> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("fn_chamado_minha_relacao", {
    p_chamado_id: id,
  });
  if (error) throw error;
  const r = (data ?? {}) as Partial<ChamadoRelacao>;
  return {
    pode_mexer: r.pode_mexer === true,
    eh_solicitante: r.eh_solicitante === true,
    pode_responder: r.pode_responder === true,
    pode_escalar: r.pode_escalar === true,
  };
}

export function useChamadoRelacao(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chaveChamadoRelacao(id),
    enabled: !!id && enabled,
    queryFn: () => buscarChamadoRelacao(id!),
  });
}

/** Recusa do banco ("Sem permissão para … deste chamado.") aparece como veio. */
export function mensagemErroChamado(e: unknown): string {
  const raw = rawMessage(e);
  return raw.includes("Sem permissão") ? raw : formatError(e);
}
