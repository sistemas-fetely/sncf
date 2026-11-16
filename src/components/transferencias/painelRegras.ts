export interface FaseTransferencia {
  codigo: string;
  rotulo: string;
  ordem: number;
  estagios: string[];
  dias_alerta: number | null;
  ativo: boolean;
}

export interface TransferenciaAndamento {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  fase_codigo: string | null;
  fase_rotulo: string | null;
  fase_ordem: number | null;
  finalidade_rotulo: string | null;
  origem_codigo: string | null;
  destino_codigo: string | null;
  observacao_pedido: string | null;
  data_pedido: string | null;
  nf_numero: string | null;
  data_entrega_prevista: string | null;
  qtd_itens: number | null;
  qtd_total_pecas: number | null;
  valor_bruto: number | null;
  fase_desde: string | null;
  dias_na_fase: number | null;
  dias_alerta: number | null;
  atrasada: boolean | null;
}

export function correspondeNumero(numero: string | null, busca: string) {
  return (numero ?? "").toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase());
}

export function correspondeEstagio(estagio: string | null, filtro: string) {
  if (filtro === "todos") return true;
  if (filtro === "andamento") return estagio !== "entregue" && estagio !== "cancelado";
  return estagio === filtro;
}

export function ordenarAndamento(linhas: TransferenciaAndamento[]) {
  return [...linhas].sort((a, b) => (a.fase_ordem ?? Infinity) - (b.fase_ordem ?? Infinity) || (b.dias_na_fase ?? 0) - (a.dias_na_fase ?? 0));
}

export function aReceberNoDestino(t: { origem_registro: string | null; tipo_transferencia: string | null; sem_destino: boolean | null; estagio: string | null; id: string }, recebidos: ReadonlyMap<string, unknown>) {
  return t.origem_registro !== "ti" && t.tipo_transferencia !== "regularizacao" && t.sem_destino !== true &&
    ["em_transito", "em_transporte", "entregue"].includes(t.estagio ?? "") && !recebidos.has(t.id);
}