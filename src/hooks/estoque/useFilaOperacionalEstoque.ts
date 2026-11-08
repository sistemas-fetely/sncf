import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCentralEstoque } from "./useCentralEstoque";
import { useReposicaoSp } from "./useReposicaoSp";
import { montarFilaOperacional, type AlertaProduto } from "@/lib/estoque/filaOperacionalEstoque";

export function useFilaOperacionalEstoque() {
  const central = useCentralEstoque();
  const reposicao = useReposicaoSp();
  const alertas = useQuery({
    queryKey: ["estoque-alerta-produto"],
    queryFn: async () => {
      const linhas: AlertaProduto[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("vw_estoque_alerta_produto").select("*").order("sku").range(de, de + 999);
        if (error) throw error;
        linhas.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return linhas;
    },
  });
  const fila = useMemo(() => montarFilaOperacional(central.produtos, reposicao.data ?? [], alertas.data ?? []), [central.produtos, reposicao.data, alertas.data]);
  return { ...fila, alertas: alertas.data ?? [], isLoading: central.isLoading || reposicao.isLoading || alertas.isLoading,
    error: central.error ?? reposicao.error ?? alertas.error,
    refetch: async () => { await Promise.all([central.refetch(), reposicao.refetch(), alertas.refetch()]); } };
}