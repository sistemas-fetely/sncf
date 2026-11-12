import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Views and RPCs already exist; generated types are not changed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any;
export type ClasseExtrato = { codigo: string; nome: string; descricao: string | null; ativo: boolean; classificavel_manual: boolean; permite_regra: boolean };
export type MovExtrato = {
  id: string; conta_bancaria_id: string; conta_nome?: string; data_transacao: string;
  descricao: string; valor: number; tipo: string; contraparte_nome: string | null;
  contraparte_documento: string | null; referencia_pedido: string | null;
  tipo_meio: string | null; dias_em_aberto: number; classe?: string | null;
  classe_definida_por?: string | null; classe_nota?: string | null;
};
export function useClassesExtrato(uso: "manual" | "regra" | "todas") {
  return useQuery<ClasseExtrato[]>({
    queryKey: ["extrato-classes", uso],
    queryFn: async () => {
      let q = sb.from("movimentacao_classe").select("codigo,nome,descricao,ativo,classificavel_manual,permite_regra").order("ordem");
      if (uso !== "todas") q = q.eq("ativo", true).eq(uso === "manual" ? "classificavel_manual" : "permite_regra", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useFilaExtrato(enabled = true) {
  return useQuery<MovExtrato[]>({
    queryKey: ["extrato-inbox", "fila"], enabled,
    queryFn: async () => {
      const linhas: MovExtrato[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await sb.from("vw_extrato_fila").select("*")
          .order("data_transacao", { ascending: false }).order("id")
          .range(inicio, inicio + 999);
        if (error) throw error;
        linhas.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      return linhas;
    },
  });
}
export async function invalidarExtrato(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["extrato-inbox"] }),
    qc.invalidateQueries({ queryKey: ["pares-transferencia"] }),
    qc.invalidateQueries({ queryKey: ["extrato-pares-count"] }),
  ]);
}