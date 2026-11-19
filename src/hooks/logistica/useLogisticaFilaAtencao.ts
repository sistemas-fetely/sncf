import { useQuery } from "@tanstack/react-query";
import { exportarLista } from "@/lib/lista/useListaPaginada";

export type MotivoAtencao =
  | "entregue_sem_lastro"
  | "entrega_nao_registrada"
  | "problema_ativo"
  | "custodia_parada"
  | "sem_fonte_rastreio"
  | "sem_eta_em_transito"
  | "eta_vencido";

export interface FilaAtencaoRow {
  pedido_id: string;
  id_externo: string | null;
  cliente: string | null;
  valor_liquido: number | null;
  estagio: string | null;
  motivo: MotivoAtencao | string;
  severidade: number;
  diagnostico: string | null;
  ultima_ocorrencia_codigo: string | null;
  ultima_ocorrencia: string | null;
  ultima_ocorrencia_em: string | null;
  dias_sem_movimento: number | null;
  dias_desde_faturamento: number | null;
  transportadora: string | null;
  cidade: string | null;
  uf: string | null;
  exige_acao_nossa: boolean | null;
  cliente_apelido: string | null;
  transportadora_apelido: string | null;
}

/** Pedidos que precisam de olhar humano: view vw_logistica_fila_atencao. */
export function useLogisticaFilaAtencao() {
  return useQuery({
    queryKey: ["logistica", "fila-atencao", "vw_logistica_fila_atencao"],
    queryFn: async (): Promise<FilaAtencaoRow[]> => {
      // PARE: fn_lista também excede o tempo; não alterar filtros nem contadores.
      return exportarLista<FilaAtencaoRow>({ relacao: "vw_logistica_fila_atencao", ordem: [{ c: "severidade", dir: "asc" }, { c: "dias_desde_faturamento", dir: "desc" }] });
    },
  });
}
