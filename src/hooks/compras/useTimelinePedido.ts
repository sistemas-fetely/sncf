import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  EventoPedidoRow,
  ComentarioPedidoRow,
  TimelineItem,
} from "@/lib/compras/timeline-types";

export function useTimelinePedido(pedidoId: string | undefined) {
  const { user, roles } = useAuth();
  const isSuperAdmin = roles?.includes("super_admin") ?? false;

  return useQuery({
    queryKey: ["compras", "timeline-pedido", pedidoId],
    enabled: !!pedidoId && !!user,
    queryFn: async (): Promise<TimelineItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [eventosResp, comentariosResp] = await Promise.all([
        sb
          .from("pedidos_compra_eventos")
          .select("*")
          .eq("pedido_id", pedidoId!)
          .order("created_at", { ascending: true }),
        sb
          .from("comentarios_pedido")
          .select("*")
          .eq("pedido_id", pedidoId!)
          .order("created_at", { ascending: true }),
      ]);
      if (eventosResp.error) throw eventosResp.error;
      if (comentariosResp.error) throw comentariosResp.error;

      const eventos = (eventosResp.data || []) as unknown as EventoPedidoRow[];
      const comentarios = (comentariosResp.data || []) as unknown as ComentarioPedidoRow[];

      const userIds = Array.from(
        new Set([
          ...(eventos.map((e) => e.usuario_id).filter(Boolean) as string[]),
          ...comentarios.map((c) => c.autor_id),
        ]),
      );
      const nomeMap = new Map<string, string>();
      if (userIds.length) {
        const [profilesRes, clRes] = await Promise.all([
          supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
          supabase
            .from("colaboradores_clt")
            .select("user_id, nome_completo")
            .in("user_id", userIds),
        ]);
        for (const p of (profilesRes.data || []) as Array<{
          user_id: string;
          full_name: string | null;
        }>) {
          if (p.full_name) nomeMap.set(p.user_id, p.full_name);
        }
        for (const c of (clRes.data || []) as Array<{
          user_id: string | null;
          nome_completo: string | null;
        }>) {
          if (c.nome_completo && c.user_id) nomeMap.set(c.user_id, c.nome_completo);
        }
      }

      const items: TimelineItem[] = [];
      for (const e of eventos) {
        if (
          e.tipo === "comentario_adicionado" ||
          e.tipo === "comentario_editado" ||
          e.tipo === "comentario_excluido"
        )
          continue;
        items.push({
          kind: "evento",
          id: e.id,
          created_at: e.created_at,
          tipo: e.tipo,
          payload: e.payload || {},
          usuario_id: e.usuario_id,
          usuario_nome: e.usuario_id ? nomeMap.get(e.usuario_id) || "Usuário" : "Sistema",
        });
      }

      const agora = Date.now();
      for (const c of comentarios) {
        const ehAutor = c.autor_id === user!.id;
        const idadeMs = agora - new Date(c.created_at).getTime();
        const dentroJanela = idadeMs < 15 * 60 * 1000;
        const naoExcluido = !c.excluido_em;

        items.push({
          kind: "comentario",
          id: c.id,
          created_at: c.created_at,
          autor_id: c.autor_id,
          autor_nome: nomeMap.get(c.autor_id) || "Usuário",
          conteudo: c.conteudo,
          editado_em: c.editado_em,
          excluido_em: c.excluido_em,
          pode_editar: ehAutor && dentroJanela && naoExcluido,
          pode_excluir: (ehAutor && naoExcluido) || isSuperAdmin,
        });
      }

      items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      return items;
    },
  });
}
