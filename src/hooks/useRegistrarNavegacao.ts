import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Atalhos personalizados do Portal — as telas que a pessoa mais acessa.
 *
 * FONTE-ÚNICA-DE-NAVEGAÇÃO (22/08/2026): este arquivo tinha também um
 * `useRegistrarNavegacao`, que gravava em `navegacao_log` — um SEGUNDO rastreio
 * paralelo ao `useTrackPageVisit` (usuario_paginas_recentes). Duas tabelas
 * guardando a mesma coisa, ambas vazias. Consolidado: o rastreio agora é único
 * e vive no CasaLayout; a RPC `meus_atalhos_personalizados` foi repontada pra
 * `usuario_paginas_recentes`. A tabela `navegacao_log` ficou órfã — candidata a
 * DROP depois de um período de observação.
 */

export interface AtalhoPersonalizado {
  rota: string;
  titulo: string;
  acessos: number;
  ultimo_acesso: string;
}

export function useMeusAtalhos(limite: number = 4) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meus-atalhos", user?.id, limite],
    enabled: !!user,
    queryFn: async (): Promise<AtalhoPersonalizado[]> => {
      const { data, error } = await supabase.rpc("meus_atalhos_personalizados" as any, {
        _limite: limite,
      });
      if (error) throw error;
      return (data || []) as AtalhoPersonalizado[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
