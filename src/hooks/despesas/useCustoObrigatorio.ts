import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import type { ChaveCusto, PainelCustoObrigatorio, StatusCusto } from "@/lib/despesas/custoObrigatorio";

export const QK_CUSTO = ["custo-obrigatorio-painel"] as const;
export interface DefinirCusto { p_id: string; p_status: StatusCusto; p_valor_esperado: number | null; p_nome: string | null }
export interface IncluirCusto { p_chave_tipo: ChaveCusto; p_chave: string; p_nome: string; p_valor_esperado: number | null }
type ContratosRpc = {
  fn_custo_obrigatorio_painel: { args: undefined; resultado: PainelCustoObrigatorio };
  fn_custo_obrigatorio_definir: { args: DefinirCusto; resultado: unknown };
  fn_custo_obrigatorio_incluir: { args: IncluirCusto; resultado: unknown };
};
const rpc = supabase.rpc.bind(supabase) as unknown as <N extends keyof ContratosRpc>(nome: N, args?: ContratosRpc[N]["args"]) => PromiseLike<{ data: ContratosRpc[N]["resultado"] | null; error: { message: string } | null }>;

export function usePainelCustoObrigatorio() {
  return useQuery({ queryKey: QK_CUSTO, staleTime: 60_000, queryFn: async () => {
    const { data, error } = await rpc("fn_custo_obrigatorio_painel");
    if (error) throw error;
    if (!data) throw new Error("O painel de custo obrigatório não retornou dados.");
    return data;
  } });
}
export function useFamiliasCusto(ativo: boolean) {
  return useQuery({ queryKey: ["custo-obrigatorio-familias"], enabled: ativo, queryFn: async () => {
    const familias = new Set<string>();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("cartao_familia_dim" as never).select("familia").eq("ativo", true).order("familia").range(de, de + 999);
      if (error) throw error;
      const linhas = (data ?? []) as unknown as { familia: string | null }[];
      for (const linha of linhas) if (linha.familia) familias.add(linha.familia);
      if (linhas.length < 1000) return [...familias];
    }
  } });
}
export function useGravarCustoObrigatorio() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (acao: { tipo: "definir"; args: DefinirCusto } | { tipo: "incluir"; args: IncluirCusto }) => {
    const { data, error } = acao.tipo === "definir" ? await rpc("fn_custo_obrigatorio_definir", acao.args) : await rpc("fn_custo_obrigatorio_incluir", acao.args);
    if (error) throw error;
    if (data && typeof data === "object" && "ok" in data && data.ok === false) throw new Error(formatError(data));
    return data;
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: QK_CUSTO }); }, onError: (error) => { toast.error(formatError(error), { duration: Infinity }); } });
}
