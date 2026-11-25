import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useMinhasFilasHoje() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tarefas", "minhas-filas-hoje", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_minhas_filas_hoje").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}