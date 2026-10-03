import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface FreteEstimado {
  valor_estimado: number;
  prazo_dias: number;
  tarifa_code: string;
  tda_risco: number;
  peso_cobrado: number;
  breakdown: {
    base: number;
    gris: number;
    pedagio: number;
    tas: number;
    adv?: number;
    icms?: number;
  };
  erro?: string;
}

export function useFreteEstimado(
  transportadoraId: string | null,
  cepDestino: string | null,
  pesoCobrado: number | null,
  valorMercantil: number | null = null
) {
  return useQuery({
    queryKey: ["frete-estimado", transportadoraId, cepDestino, pesoCobrado, valorMercantil],
    queryFn: async () => {
      if (!transportadoraId || !cepDestino || !pesoCobrado) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_frete_estimado", {
        p_transportadora_id: transportadoraId,
        p_cep_destino: cepDestino,
        p_peso_cobrado: pesoCobrado,
        p_valor_mercantil: valorMercantil ?? 0,
      });
      if (error) throw error;
      return data as FreteEstimado;
    },
    enabled: !!transportadoraId && !!cepDestino && !!pesoCobrado,
  });
}
