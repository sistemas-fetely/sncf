import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ZenlogModoNf {
  modo: "manual" | "automatico";
  motivo: string | null;
  desde: string | null;
}

/** Modo de envio de NF a XPM: `integracoes_config.config` onde sistema = 'zenlog'. */
export function useZenlogModoNf() {
  return useQuery({
    queryKey: ["zenlog-modo-nf"],
    queryFn: async (): Promise<ZenlogModoNf> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("integracoes_config")
        .select("config")
        .eq("sistema", "zenlog")
        .maybeSingle();
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = (data?.config ?? {}) as Record<string, any>;
      return {
        modo: cfg.nf_envio_modo === "manual" ? "manual" : "automatico",
        motivo: cfg.nf_envio_modo_motivo ?? null,
        desde: cfg.nf_envio_modo_desde ?? null,
      };
    },
  });
}
