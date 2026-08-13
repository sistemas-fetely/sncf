import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface DepUni {
  departamento: { id: string; nome: string } | null;
  unidade: { id: string; nome: string; codigo: string } | null;
}

export function useDepartamentoUnidadeUsuario() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compras", "dept-unidade", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DepUni> => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        "get_user_departamento_unidade",
        { p_user_id: user!.id },
      );
      if (error) throw error;
      const row = (data as Array<{ departamento_id: string | null; unidade_id: string | null }>)?.[0];
      if (!row) return { departamento: null, unidade: null };

      const [deptRes, uniRes] = await Promise.all([
        row.departamento_id
          ? supabase.from("departamentos").select("id, nome").eq("id", row.departamento_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as never),
        row.unidade_id
          ? supabase.from("unidades").select("id, nome, codigo").eq("id", row.unidade_id).single()
          : Promise.resolve({ data: null, error: null } as never),
      ]);

      return {
        departamento: deptRes.data ? { id: deptRes.data.id, nome: deptRes.data.nome } : null,
        unidade: uniRes.data
          ? { id: uniRes.data.id, nome: uniRes.data.nome, codigo: uniRes.data.codigo }
          : null,
      };
    },
  });
}
