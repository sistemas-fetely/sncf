import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { KEY_FILA } from "@/hooks/tarefas/useFilaProcessos";
import { KEY_PROCESSO_TAREFA, type ProcessoTarefa } from "./useProcessoTarefas";

export type DecisaoProcesso = "reenviar" | "cancelar";
export type DesfechoProcesso = "haver" | "troca" | "reembolso";

export interface ProcessoDecisaoPrevia {
  ok: boolean;
  erro?: string;
  aberta: boolean;
  caso: string | null;
  pedido: string | null;
  momento: string | null;
  pode_cancelar: boolean;
  pendencias: string[];
  o_que_acontece: string;
  financeiro: {
    titulos_abertos: number;
    valor_aberto: number;
    boletos_a_baixar: number;
    titulos_pagos: number;
    valor_pago: number;
    titulos_elegiveis: number;
  };
}

interface ResultadoDecisao {
  ok: boolean;
  erro?: string;
  decisao: DecisaoProcesso;
  devolucao?: string;
}

export interface EntradaDecisao {
  tarefaId: string;
  decisao: DecisaoProcesso;
  motivo: string;
  desfecho: DesfechoProcesso | null;
}

export function tarefaPermiteDecisao(aberta: boolean | null, processo: ProcessoTarefa | undefined) {
  return aberta === true && processo?.aberta === true && processo.passo_codigo === "decidir_desfecho"
    && (processo.caso_tipo === "rastreio" || processo.caso_tipo === "rastreio_nf");
}

export function podeConfirmarDecisao(
  previa: ProcessoDecisaoPrevia | undefined,
  decisao: DecisaoProcesso | "",
  motivo: string,
  desfecho: DesfechoProcesso | "",
  enviando = false,
) {
  if (enviando || !previa?.ok || !previa.aberta || motivo.trim().length < 5) return false;
  if (decisao === "reenviar") return true;
  return decisao === "cancelar" && previa.pode_cancelar
    && (desfecho === "haver" || desfecho === "troca" || desfecho === "reembolso");
}

/** A prévia só existe enquanto a janela está aberta; não reutilizar uma decisão financeira antiga. */
export function useProcessoDecisaoPrevia(tarefaId: string, aberto: boolean) {
  return useQuery({
    queryKey: ["processos", "devolucao-decisao-previa", tarefaId],
    enabled: aberto && !!tarefaId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<ProcessoDecisaoPrevia> => {
      const { data, error } = await supabase.rpc("processo_devolucao_decisao_previa" as never, { p_tarefa_id: tarefaId } as never);
      if (error) throw error;
      const previa = data as unknown as ProcessoDecisaoPrevia | null;
      if (!previa?.ok) throw new Error(previa?.erro || "Não foi possível carregar a prévia da decisão.");
      return previa;
    },
  });
}

/** Apenas a RPC decide os efeitos no pedido, nos títulos e nos boletos. */
export function useProcessoDecidir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: EntradaDecisao): Promise<ResultadoDecisao> => {
      if (entrada.motivo.trim().length < 5) throw new Error("O motivo deve ter no mínimo 5 caracteres.");
      if (entrada.decisao === "cancelar" && !["haver", "troca", "reembolso"].includes(entrada.desfecho ?? "")) {
        throw new Error("Escolha o desfecho do cancelamento.");
      }
      const { data, error } = await supabase.rpc("processo_devolucao_decidir" as never, {
        p_tarefa_id: entrada.tarefaId,
        p_decisao: entrada.decisao,
        p_motivo: entrada.motivo.trim(),
        p_desfecho: entrada.decisao === "cancelar" ? entrada.desfecho : null,
      } as never);
      if (error) throw error;
      const resultado = data as unknown as ResultadoDecisao | null;
      if (!resultado?.ok) throw new Error(resultado?.erro || "Não foi possível registrar a decisão.");
      return resultado;
    },
    onSuccess: async (resultado, entrada) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: KEY_FILA }),
        qc.invalidateQueries({ queryKey: KEY_PROCESSO_TAREFA }),
      ]);
      toast.success(entrada.decisao === "reenviar"
        ? "Decisão registrada: reenviar"
        : `Pedido cancelado · devolução ${resultado.devolucao} aberta`);
    },
    onError: (error) => toast.error(formatError(error)),
  });
}