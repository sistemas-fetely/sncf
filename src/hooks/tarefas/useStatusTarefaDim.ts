import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dimensão de status de tarefa. A lista vem SEMPRE da tabela `tarefa_status_dim`:
 * status novo é linha nova no banco, nunca código no front. `e_aberto`,
 * `e_terminal` e `exige_motivo` mandam no comportamento da tela.
 */
export interface StatusTarefaDim {
  codigo: string;
  nome: string;
  descricao: string | null;
  e_aberto: boolean;
  conta_carga: boolean;
  e_terminal: boolean;
  exige_motivo: boolean;
  cor: string | null;
  ordem: number;
}

const CAMPOS =
  "codigo,nome,descricao,e_aberto,conta_carga,e_terminal,exige_motivo,cor,ordem" as const;

export const CHAVE_STATUS_DIM = ["tarefas", "status-dim"] as const;

async function buscar(): Promise<StatusTarefaDim[]> {
  const { data, error } = await supabase
    .from("tarefa_status_dim")
    .select(CAMPOS)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as StatusTarefaDim[];
}

export function useStatusTarefaDim() {
  return useQuery({
    queryKey: CHAVE_STATUS_DIM,
    staleTime: 10 * 60 * 1000,
    queryFn: buscar,
  });
}

/**
 * Cache de módulo para os filtros de status usados DENTRO de queryFn — o
 * `.in("status", ...)` precisa dos códigos antes de montar a consulta e não
 * pode depender de uma lista fixa no front.
 */
let promessa: Promise<StatusTarefaDim[]> | null = null;

export function carregarStatusDim(): Promise<StatusTarefaDim[]> {
  if (!promessa) {
    promessa = buscar().catch((e) => {
      promessa = null;
      throw e;
    });
  }
  return promessa;
}

/** códigos com e_aberto = true, na ordem da dimensão */
export async function codigosAbertos(): Promise<string[]> {
  return (await carregarStatusDim()).filter((s) => s.e_aberto).map((s) => s.codigo);
}

/** códigos com e_terminal = true, na ordem da dimensão */
export async function codigosTerminais(): Promise<string[]> {
  return (await carregarStatusDim()).filter((s) => s.e_terminal).map((s) => s.codigo);
}

export function rotuloStatus(dim: StatusTarefaDim[] | undefined, codigo: string): string {
  return dim?.find((s) => s.codigo === codigo)?.nome ?? codigo;
}
