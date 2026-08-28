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
  novo_link: "Gerar novo link de pagamento",
  outro: "Solicitação ao SOPS",
};

export type SolicitacaoStatus = "aberta" | "atendida" | "cancelada";

/**
 * Fila da Central de Mensagens por status.
 *
 * A AÇÃO MORA ONDE O OBJETO MORA: a fila é `solicitacao_comercial` (tem
 * ciclo de vida), nunca `pedido_eventos` (log imutável de timeline). Por
 * isso eventos informativos (comprovante de pagamento) não entram aqui.
 */
export function useSolicitacoesPorStatus(status: SolicitacaoStatus) {
  return useQuery({
    queryKey: ["solicitacoes-por-status", status],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SolicitacaoComercial[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("solicitacao_comercial")
        .select("*")
        .eq("status", status)
        .order("criado_em", { ascending: status === "aberta" });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await hidratar((data || []) as any[]);
    },
  });
}

/** Contagem por status para as pills de filtro. */
export function useContagemSolicitacoesPorStatus() {
  return useQuery({
    queryKey: ["solicitacoes-contagem-status"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<SolicitacaoStatus, number>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("solicitacao_comercial")
        .select("status");
      if (error) throw error;
      const acc: Record<SolicitacaoStatus, number> = { aberta: 0, atendida: 0, cancelada: 0 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data || []).forEach((r: any) => {
        if (r.status in acc) acc[r.status as SolicitacaoStatus] += 1;
      });
      return acc;
    },
  });
}

/** Enriquecimento comum: pedido, cliente e autor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hidratar(rows: any[]): Promise<SolicitacaoComercial[]> {
  if (rows.length === 0) return [];

  const pedidoIds = [...new Set(rows.map((r) => r.pedido_id).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pedidos, error: pErr } = await (supabase as any)
    .from("pedidos")
    .select("id, id_externo, estagio, parceiro_id, cliente_nome_snapshot")
    .in("id", pedidoIds);
  if (pErr) throw pErr;
  const pMap = new Map<string, Record<string, unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pedidos || []).forEach((p: any) => pMap.set(p.id, p));

  const parceiroIds = [
    ...new Set(
      (pedidos || [])
        .map((p: { parceiro_id: string | null }) => p.parceiro_id)
        .filter(Boolean),
    ),
  ];
  const razoes = new Map<string, string>();
  if (parceiroIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: parcs } = await (supabase as any)
      .from("parceiros_comerciais")
      .select("id, razao_social")
      .in("id", parceiroIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parcs || []).forEach((x: any) => razoes.set(x.id, x.razao_social));
  }

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
      cliente_razao: p?.parceiro_id
        ? razoes.get(p.parceiro_id) ?? p?.cliente_nome_snapshot ?? null
        : p?.cliente_nome_snapshot ?? null,
    };
  });
}


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
        .select("id, id_externo, estagio, parceiro_id")
        .in("id", pedidoIds);
      if (pErr) throw pErr;
      const pMap = new Map<string, Record<string, unknown>>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pedidos || []).forEach((p: any) => pMap.set(p.id, p));

      const parceiroIds = [
        ...new Set((pedidos || []).map((p: { parceiro_id: string | null }) => p.parceiro_id).filter(Boolean)),
      ];
      const razoes = new Map<string, string>();
      if (parceiroIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parcs } = await (supabase as any)
          .from("parceiros_comerciais")
          .select("id, razao_social")
          .in("id", parceiroIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (parcs || []).forEach((x: any) => razoes.set(x.id, x.razao_social));
      }

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
          cliente_razao: p?.parceiro_id ? razoes.get(p.parceiro_id) ?? null : null,
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
  qc.invalidateQueries({ queryKey: ["solicitacoes-por-status"] });
  qc.invalidateQueries({ queryKey: ["solicitacoes-contagem-status"] });
  qc.invalidateQueries({ queryKey: ["canal-cpo-page"] });
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

/**
 * Descarta a solicitação (status='cancelada'). Motivo é OBRIGATÓRIO — a função
 * do banco levanta exceção se vier vazio; não duplicamos a validação como
 * regra, apenas desabilitamos o botão na UI.
 * FAIL-LOUD: a mensagem do Postgres (ex.: 22023 "Solicitacao ja esta como ...")
 * vai crua para o toast.
 */
export function useDescartarSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { solicitacaoId: string; motivo: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("descartar_solicitacao_comercial", {
        p_solicitacao_id: input.solicitacaoId,
        p_motivo: input.motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Solicitação descartada.");
      invalidar(qc);
    },
    onError: (e: unknown) => {
      toast.error(formatError(e));
    },
  });
}

