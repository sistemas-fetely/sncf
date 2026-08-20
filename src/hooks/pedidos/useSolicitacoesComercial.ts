import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface SolicitacaoComercial {
  id: string;
  pedido_id: string;
  tipo: string;
  detalhe: string | null;
  status: string;
  criado_em: string;
  criado_por_nome: string | null;
  pedido_id_externo: string | null;
  pedido_estagio: string | null;
  cliente_razao: string | null;
}

export const SOLICITACAO_TIPO_ROTULO: Record<string, string> = {
  trocar_forma_pagamento: "Trocar forma de pagamento",
  novo_link_pagamento: "Novo link de pagamento",
  outro: "Outro",
};

/** Fila de solicitações abertas: mais antiga primeiro. */
export function useSolicitacoesAbertas() {
  return useQuery({
    queryKey: ["solicitacoes-abertas"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SolicitacaoComercial[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("solicitacao_comercial")
        .select("*")
        .eq("status", "aberta")
        .order("criado_em", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      const pedidoIds = [...new Set(rows.map((r) => r.pedido_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pedidos, error: pErr } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, estagio, parceiro_id, parceiros_comerciais(razao_social)")
        .in("id", pedidoIds);
      if (pErr) throw pErr;
      const pMap = new Map<string, Record<string, unknown>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedidos || []).forEach((p: any) => pMap.set(p.id, p));

      const userIds = [...new Set(rows.map((r) => r.criado_por).filter(Boolean))];
      const nomes = new Map<string, string>();
      if (userIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: perfis } = await (supabase as any)
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (perfis || []).forEach((x: any) => nomes.set(x.user_id, x.full_name));
      }

      return rows.map((r) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = pMap.get(r.pedido_id) as any;
        return {
          id: r.id,
          pedido_id: r.pedido_id,
          tipo: r.tipo,
          detalhe: r.detalhe ?? null,
          status: r.status,
          criado_em: r.criado_em,
          criado_por_nome: nomes.get(r.criado_por) ?? null,
          pedido_id_externo: p?.id_externo ?? null,
          pedido_estagio: p?.estagio ?? null,
          cliente_razao: p?.parceiros_comerciais?.razao_social ?? null,
        };
      });
    },
  });
}

export function useContagemSolicitacoes() {
  return useQuery({
    queryKey: ["solicitacoes-abertas-contagem"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("solicitacao_comercial")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberta");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["solicitacoes-abertas"] });
  qc.invalidateQueries({ queryKey: ["solicitacoes-abertas-contagem"] });
}

/** FAIL-LOUD: a mensagem do banco é a explicação; não a substituímos. */
export function useAbrirSolicitacao(pedidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tipo: string; detalhe: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("abrir_solicitacao_comercial", {
        p_pedido_id: pedidoId,
        p_tipo: input.tipo,
        p_detalhe: input.detalhe,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Solicitação aberta para o SOPS.");
      invalidar(qc);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });
}

export function useAtenderSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { solicitacaoId: string; nota?: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("atender_solicitacao_comercial", {
        p_solicitacao_id: input.solicitacaoId,
        p_nota: input.nota ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Solicitação marcada como atendida.");
      invalidar(qc);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });
}
