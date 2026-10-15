import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

export interface TransportadoraPerfil {
  transportadora_id: string;
  modo_custo: "fatura_planilha" | "api_cte" | "lancamento_postagem" | "sem_custo";
  custo_fallback: "api_cte" | "lancamento_postagem" | null;
  modo_rastreio: "api" | "planilha" | "correios_api" | "sem_rastreio";
  tem_tabela_preco: boolean; tem_cotacao_api: boolean; importa_fatura: boolean; importa_rastreio: boolean;
  canais: string[]; ativo: boolean; observacao: string | null;
}
export const PERFIL_SEM_CADASTRO: Omit<TransportadoraPerfil, "transportadora_id"> = {
  modo_custo: "sem_custo", custo_fallback: null, modo_rastreio: "sem_rastreio",
  tem_tabela_preco: false, tem_cotacao_api: false, importa_fatura: false, importa_rastreio: false, canais: [], ativo: true, observacao: null,
};
export function useTransportadoraPerfis() {
  return useQuery({
    queryKey: ["logistica", "transportadora-perfil"],
    queryFn: async (): Promise<Record<string, TransportadoraPerfil>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("transportadora_perfil").select("*").eq("ativo", true);
      if (error) throw new Error(humanizeError(error.message));
      const mapa: Record<string, TransportadoraPerfil> = {};
      for (const r of (data ?? []) as TransportadoraPerfil[]) mapa[r.transportadora_id] = r;
      return mapa;
    },
    staleTime: 10 * 60 * 1000,
  });
}
export function usePerfilDe(transportadoraId: string | null | undefined): TransportadoraPerfil | null {
  const { data } = useTransportadoraPerfis();
  if (!transportadoraId || !data) return null;
  return data[transportadoraId] ?? { transportadora_id: transportadoraId, ...PERFIL_SEM_CADASTRO };
}
