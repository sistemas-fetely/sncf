import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusRota } from "@/config/rotasRegistry";

export interface RotaConfig {
  prefixo: string;
  status: StatusRota;
  tela_slug: string | null;
  ordem: number;
}

/**
 * Lê o status de prontidão das rotas do banco (sncf_rotas_config via RPC).
 * Fonte ao vivo controlada pela tela /admin/visibilidade.
 * Se falhar, o RotaGate cai para o rotasRegistry.ts do código (fallback).
 */
export function useRotasConfig() {
  return useQuery({
    queryKey: ["rotas-config"],
    staleTime: 5 * 60 * 1000, // 5 min — status de rota muda raramente
    queryFn: async (): Promise<RotaConfig[]> => {
      const { data, error } = await (supabase as any).rpc("listar_rotas_config");
      if (error) throw error;
      return (data ?? []) as RotaConfig[];
    },
  });
}

/**
 * Resolve a regra de rota a partir da config do banco, por match de prefixo
 * mais longo (mesma lógica do resolverRegraRota do código).
 * Retorna null se nenhuma regra do banco casar (aí o gate usa o código).
 */
export function resolverRegraRotaBanco(
  pathname: string,
  rotas: RotaConfig[] | undefined
): RotaConfig | null {
  if (!rotas || rotas.length === 0) return null;
  let melhor: RotaConfig | null = null;
  for (const r of rotas) {
    const casa = pathname === r.prefixo || pathname.startsWith(r.prefixo + "/");
    if (casa && (!melhor || r.prefixo.length > melhor.prefixo.length)) {
      melhor = r;
    }
  }
  return melhor;
}
