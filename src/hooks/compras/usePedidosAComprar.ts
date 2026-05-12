import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ComprarTab = "aguardando" | "em_compra" | "tudo";

export function usePedidosAComprar(tab: ComprarTab) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compras", "a-comprar", user?.id, tab],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("pedidos_compra")
        .select(`
          *,
          centros_custo:centro_custo_id (id, codigo, nome),
          linhas_investimento:linha_investimento_id (id, descricao),
          parceiros_comerciais:parceiro_preferencial_id (id, razao_social, nome_fantasia),
          pedidos_compra_itens (*),
          pedidos_compra_anexos (*)
        `)
        .order("enviado_em", { ascending: true });

      if (tab === "aguardando") query = query.eq("status", "aberto");
      else if (tab === "em_compra")
        query = query.eq("status", "em_compra").eq("comprador_id", user!.id);
      else query = query.in("status", ["aberto", "em_compra"]);

      const { data, error } = await query;
      if (error) throw error;
      const pedidos = data || [];

      // Resolver nomes dos solicitantes (profiles + colaboradores_clt)
      const ids = Array.from(new Set(pedidos.map((p) => p.solicitante_id).filter(Boolean)));
      const nomeMap = new Map<string, string>();
      if (ids.length) {
        const [profilesRes, clRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
          supabase.from("colaboradores_clt").select("user_id, nome_completo").in("user_id", ids),
        ]);
        for (const p of profilesRes.data || []) {
          if (p.full_name) nomeMap.set(p.user_id as string, p.full_name);
        }
        for (const c of clRes.data || []) {
          if (c.nome_completo && c.user_id) nomeMap.set(c.user_id, c.nome_completo);
        }
      }

      return pedidos.map((p) => ({
        ...p,
        solicitante_nome: nomeMap.get(p.solicitante_id as string) || "—",
      }));
    },
  });
}
