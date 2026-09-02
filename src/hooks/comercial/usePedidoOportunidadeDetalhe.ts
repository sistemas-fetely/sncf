import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PedidoItemOportunidade {
  id: string;
  sku: string | null;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  subtotal: number | null;
  ordem: number | null;
}

export interface ObsComercial {
  id: string;
  descricao: string | null;
  criado_em: string | null;
}

/**
 * A-TELA-NUNCA-MENTE: aba Pagamento vazia esconde quatro situações diferentes.
 * Este diagnóstico é SÓ LEITURA: canal/condição do pedido + contagem leve das
 * linhas de `provisao_recebimento`.
 */
export interface DiagnosticoPagamento {
  canal: string | null;
  condicao_solicitada: string | null;
  id_externo: string | null;
  eh_split: boolean;
  linhas: number;
  linhasPortao: number;
  portaoPago: number;
}

export function useDiagnosticoPagamento(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["oportunidade-diagnostico-pagamento", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<DiagnosticoPagamento> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: pedido, error: errP } = await sb
        .from("pedidos")
        .select("canal, condicao_solicitada, id_externo, split_de_pedido_id")
        .eq("id", pedidoId)
        .single();
      if (errP) throw errP;

      const { data: linhas, error: errL } = await sb
        .from("provisao_recebimento")
        .select("id, eh_portao, pago_em")
        .eq("pedido_id", pedidoId);
      if (errL) throw errL;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lista = (linhas ?? []) as any[];
      const portao = lista.filter((l) => l.eh_portao);
      return {
        canal: pedido?.canal ?? null,
        condicao_solicitada: pedido?.condicao_solicitada ?? null,
        id_externo: pedido?.id_externo ?? null,
        eh_split:
          !!pedido?.split_de_pedido_id || String(pedido?.id_externo ?? "").includes("/"),
        linhas: lista.length,
        linhasPortao: portao.length,
        portaoPago: portao.filter((l) => l.pago_em).length,
      };
    },
  });
}

/** Itens do pedido (aba "Itens" do dialog de oportunidade). */
export function useItensPedidoOportunidade(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["oportunidade-itens", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<PedidoItemOportunidade[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_itens")
        .select("id, sku, descricao, quantidade, valor_unitario, subtotal, ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PedidoItemOportunidade[];
    },
  });
}

/** Observações comerciais do pedido (pedido_eventos, tipo_evento = 'msg_comercial'). */
export function useObsComerciaisPedido(pedidoId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["oportunidade-obs-comerciais", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<ObsComercial[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_eventos")
        .select("id, descricao, criado_em")
        .eq("pedido_id", pedidoId)
        .eq("tipo_evento", "msg_comercial")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ObsComercial[];
    },
  });
}

/**
 * Grava observação comercial. FAIL-LOUD: erro sobe e vira toast destrutivo.
 * 'msg_comercial' é validado no CHECK da tabela — não trocar o valor.
 */
export function useAdicionarObsComercial(pedidoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) => {
      if (!pedidoId) throw new Error("pedido_id obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_evento_pedido", {
        p_pedido_id: pedidoId,
        p_tipo_evento: "msg_comercial",
        p_descricao: texto.trim(),
        p_metadata: { origem: "oportunidades" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Observação registrada");
      qc.invalidateQueries({ queryKey: ["oportunidade-obs-comerciais", pedidoId] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível registrar a observação");
    },
  });
}
