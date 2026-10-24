import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DetalheCard {
  achado_id: string | null;
  regra: string | null;
  detalhe: string | null;
  valor: number | string | null;
}

/** Um problema por pedido (achados da mesma causa já agrupados no banco). */
export interface CardAuditoria {
  card_id: string;
  pedido_id: string | null;
  titulo: string | null;
  o_que_fazer: string | null;
  explicacao: string | null;
  severidade: string | null;
  severidade_rotulo: string | null;
  severidade_peso: number | null;
  rota_acao: string | null;
  rotulo_acao: string | null;
  valor_impacto: number | null;
  primeira_vez_em: string | null;
  idade_dias: number | null;
  dono_user_id: string | null;
  dono_nome: string | null;
  situacao: string | null;
  reincidente: boolean | null;
  n_achados: number | null;
  achado_ids: string[] | null;
  detalhes: DetalheCard[] | null;
  pode_abrir_chamado: boolean | null;
  chamado_id: string | null;
}

export const chaveCardsPedido = (pedidoId: string | undefined) => ["auditoria-cards-pedido", pedidoId];

/** Cards vivos de auditoria de um pedido (vw_auditoria_card). FAIL-LOUD. */
export function useAchadosPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: chaveCardsPedido(pedidoId),
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CardAuditoria[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_auditoria_card")
        .select("*")
        .eq("pedido_id", pedidoId)
        .eq("aparece_no_pedido", true)
        .order("severidade_peso", { ascending: false })
        .order("primeira_vez_em", { ascending: true });
      if (error) throw error;
      const linhas = (data || []) as Omit<CardAuditoria, "dono_nome">[];

      const donos = [...new Set(linhas.map((l) => l.dono_user_id).filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (donos.length > 0) {
        const { data: perfis, error: e2 } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", donos);
        if (e2) throw e2;
        for (const p of perfis ?? []) if (p.user_id) nomes.set(p.user_id, p.full_name ?? "");
      }

      return linhas.map((l) => ({
        ...l,
        severidade_peso: l.severidade_peso === null ? null : Number(l.severidade_peso),
        idade_dias: l.idade_dias === null ? null : Number(l.idade_dias),
        valor_impacto: l.valor_impacto === null ? null : Number(l.valor_impacto),
        n_achados: l.n_achados === null ? null : Number(l.n_achados),
        detalhes: Array.isArray(l.detalhes) ? l.detalhes : null,
        dono_nome: l.dono_user_id ? nomes.get(l.dono_user_id) || null : null,
      }));
    },
  });
}
