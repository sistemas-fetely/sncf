import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * PROBLEMA-NAO-RETROCEDE-ESTAGIO (11/09/2026): problema é marcação PARALELA.
 * O pedido continua no estágio dele e ganha uma linha em `pedido_problema`.
 * Nada aqui escreve direto em tabela: toda escrita passa pelas RPCs, que são
 * as donas das validações (descrição obrigatória, duplicidade de tipo aberto).
 */

export interface ProblemaTipo {
  codigo: string;
  rotulo: string;
  descricao: string | null;
  libera_refaturamento: boolean;
  cor: string | null;
  ordem: number | null;
}

export interface ProblemaLinha {
  id: string;
  pedido_id: string;
  tipo_codigo: string;
  tipo_rotulo: string | null;
  tipo_cor: string | null;
  libera_refaturamento: boolean | null;
  descricao: string | null;
  status: string;
  estagio_na_abertura: string | null;
  estagio: string | null;
  id_externo: string | null;
  cliente_nome_snapshot: string | null;
  valor_liquido: number | null;
  aberto_por_nome: string | null;
  aberto_em: string;
  dias_aberto: number | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resolucao: string | null;
}

/** Dimensão dos tipos — NUNCA hardcode a lista no componente. */
export function useProblemaTipos() {
  return useQuery({
    queryKey: ["pedido-problema-tipo"],
    queryFn: async (): Promise<ProblemaTipo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_problema_tipo")
        .select("codigo, rotulo, descricao, libera_refaturamento, cor, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProblemaTipo[];
    },
  });
}

/** Lista da aba: só problemas abertos, mais velho primeiro. */
export function useProblemasAbertos() {
  return useQuery({
    queryKey: ["vw_pedido_problema", "aberto"],
    queryFn: async (): Promise<ProblemaLinha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_problema")
        .select("*")
        .eq("status", "aberto")
        .order("dias_aberto", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProblemaLinha[];
    },
  });
}

/** Problemas abertos de UM pedido — usado no selo do topo do detalhe. */
export function useProblemasDoPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["vw_pedido_problema", "pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<ProblemaLinha[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_problema")
        .select("*")
        .eq("pedido_id", pedidoId)
        .eq("status", "aberto")
        .order("aberto_em", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProblemaLinha[];
    },
  });
}

/**
 * BOTÃO-SEGUE-O-PROBLEMA: a tela NÃO repete a regra de refaturamento.
 * A RPC é a fonte única — a edge function `enviar-pedido-bling` lê a mesma.
 */
export function useLiberaRefaturamento(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-libera-refaturamento", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<{ libera: boolean; porque: string | null }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_pedido_libera_refaturamento", {
        p_pedido_id: pedidoId,
      });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (data ?? {}) as any;
      return { libera: j.libera === true, porque: j.porque ?? null };
    },
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>, pedidoId: string) {
  qc.invalidateQueries({ queryKey: ["vw_pedido_problema"] });
  qc.invalidateQueries({ queryKey: ["pedido-libera-refaturamento", pedidoId] });
  qc.invalidateQueries({ queryKey: ["pedido", pedidoId] });
}

export function useAbrirProblema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pedidoId: string; tipo: string; descricao: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("abrir_problema_pedido", {
        p_pedido_id: vars.pedidoId,
        p_tipo: vars.tipo,
        p_descricao: vars.descricao,
      });
      // FAIL-LOUD: a mensagem do banco é explicativa — sobe como está.
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidar(qc, vars.pedidoId);
      toast.success("Problema declarado. O pedido continua no estágio atual.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResolverProblema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { problemaId: string; pedidoId: string; resolucao: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("resolver_problema_pedido", {
        p_problema_id: vars.problemaId,
        p_resolucao: vars.resolucao,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidar(qc, vars.pedidoId);
      toast.success("Problema resolvido. Sai da aba de problemas e segue no estágio.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
