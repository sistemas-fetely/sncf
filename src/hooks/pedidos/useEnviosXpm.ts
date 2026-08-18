import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EnvioXpm {
  id: string;
  operacao: string | null;
  tentativa_em: string | null;
  sucesso: boolean | null;
  resposta_status: number | null;
  expedicao_codigo_retornado: string | null;
  erro_msg: string | null;
}

/** Trilha de tentativas de envio a XPM (create e atribui_nf), do pedido. */
export function useEnviosXpm(pedido_id: string) {
  return useQuery({
    queryKey: ["envios-xpm", pedido_id],
    queryFn: async (): Promise<EnvioXpm[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("xpm_envios_log")
        .select("id, operacao, tentativa_em, sucesso, resposta_status, expedicao_codigo_retornado, erro_msg")
        .eq("pedido_id", pedido_id)
        .order("tentativa_em", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as EnvioXpm[];
    },
    enabled: !!pedido_id,
  });
}
