import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

export interface CandidatoConsolidacao {
  pedido_id: string;
  id_externo: string;
  estagio: string;
  condicao_solicitada: string | null;
  valor_bruto: number;
  valor_frete: number;
  valor_liquido: number;
  itens: number;
  eh_split: boolean;
  venda_origem_id_externo: string | null;
  tem_recebivel_ativo: boolean;
  tem_titulo_pago: boolean;
  tem_titulo_no_banco: boolean;
  qtd_titulos_ativos: number;
  tem_remessa: boolean;
  tem_nf: boolean;
  recebivel_reversivel: boolean;
  motivo_bloqueio: string | null;
}

/**
 * Candidatos a serem absorvidos por este pedido. Fonte: vw_pedido_consolidavel.
 * Filtra mesmo parceiro + mesma natureza (guardas da RPC), exclui o proprio pedido,
 * pedidos sem itens, com NF ou com remessa viva — casos que a RPC recusaria.
 */
export function useCandidatosConsolidacao(
  pedidoId: string | undefined,
  parceiroId: string | undefined,
  naturezaId: string | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["candidatos-consolidacao", pedidoId, parceiroId, naturezaId],
    enabled: enabled && !!pedidoId && !!parceiroId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("vw_pedido_consolidavel")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .neq("pedido_id", pedidoId)
        .gt("itens", 0)
        .eq("tem_nf", false)
        .eq("tem_remessa", false);
      q = naturezaId ? q.eq("natureza_operacao_id", naturezaId) : q.is("natureza_operacao_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CandidatoConsolidacao[];
    },
  });
}

export interface ConsolidarInput {
  idManter: string;
  idDescartar: string;
  motivo: string;
  cancelarRecebivel: boolean;
}

export function useConsolidarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idManter, idDescartar, motivo, cancelarRecebivel }: ConsolidarInput) => {
      const { data, error } = await (supabase as any).rpc("consolidar_pedidos_operacional", {
        p_id_manter: idManter,
        p_id_descartar: idDescartar,
        p_motivo: motivo,
        p_cancelar_recebivel: cancelarRecebivel,
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        mantido: string;
        descartado: string;
        recebivel_cancelado: boolean;
        titulos_cancelados: number;
        titulos_cancelados_no_que_fica: number;
        titulos_cancelados_no_descartado: number;
        itens_migrados: number;
        liquido: number;
        proximo_passo: string;
        estagio_final: string;
      };
    },
    onSuccess: (res, vars) => {
      toast({
        title: `${res.descartado} consolidado em ${res.mantido}`,
        description: `${res.itens_migrados} item(ns) migrado(s) · novo líquido ${Number(res.liquido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${res.recebivel_cancelado ? ` · ${res.titulos_cancelados} título(s) cancelado(s) (${res.titulos_cancelados_no_que_fica} em ${res.mantido}, ${res.titulos_cancelados_no_descartado} em ${res.descartado})` : ""} · ${res.proximo_passo}`,
      });
      invalidarPedido(qc, vars.idManter);
      invalidarPedido(qc, vars.idDescartar);
    },
    onError: (e: any) => {
      toast({
        title: "Consolidação não realizada",
        description: e?.message ?? "Erro desconhecido",
        variant: "destructive",
      });
    },
  });
}
