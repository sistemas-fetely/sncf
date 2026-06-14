import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HaverDisponivel {
  haverId: string;
  saldo: number;
  dataExpiracao: string | null;
}

export function useHaverDisponivelCliente(parceiroId: string | undefined) {
  const q = useQuery({
    queryKey: ["haver-disponivel", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<HaverDisponivel | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("haver_cliente")
        .select("id, saldo, data_expiracao")
        .eq("parceiro_id", parceiroId)
        .in("status", ["disponivel", "parcial"])
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return null;
      return {
        haverId: row.id,
        saldo: Number(row.saldo || 0),
        dataExpiracao: row.data_expiracao ?? null,
      };
    },
  });
  return { ...(q.data ?? null) as HaverDisponivel | null extends never ? never : HaverDisponivel | null, haverId: q.data?.haverId, saldo: q.data?.saldo ?? 0, dataExpiracao: q.data?.dataExpiracao ?? null, isLoading: q.isLoading, data: q.data ?? null };
}
