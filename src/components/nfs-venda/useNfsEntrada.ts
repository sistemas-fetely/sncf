import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { carregarNfsEntrada, type NfEntrada } from "./nfsEntrada";

export function useNfsEntrada() {
  return useQuery({
    queryKey: ["nfs-entrada-devolucao"],
    queryFn: () => carregarNfsEntrada(async (de, ate) => {
      // The deployed view is ahead of the generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_nfs_entrada_devolucao").select("*").order("data_emissao", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      return (data ?? []) as unknown as NfEntrada[];
    }),
  });
}