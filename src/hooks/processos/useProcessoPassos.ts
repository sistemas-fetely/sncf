// Passos do processo, divergências e custo — via dupla processo ⇄ atribuição.
// Leitura: processo_passo, vw_processo_divergencia, vw_processo_custo.
// Escrita de passo: direto em processo_passo (tabela própria do módulo de processos).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessoPasso {
  id: string;
  processo_id: string;
  ordem: number;
  nome: string;
  descricao: string | null;
  atribuicao_id: string | null;
  condicional: boolean;
  ativo: boolean;
  created_at: string;
}

export interface DivergenciaProcesso {
  processo_id: string;
  processo_codigo: string | null;
  processo_nome: string | null;
  tipo: "passo_sem_atribuicao" | "atribuicao_sem_passo";
  passo_id: string | null;
  passo_ordem: number | null;
  item_nome: string | null;
  atribuicao_id: string | null;
  pessoa_nome: string | null;
  significado: string | null;
}

export interface CustoProcesso {
  processo_id: string;
  codigo: string | null;
  nome: string | null;
  passos: number | null;
  passos_com_dono: number | null;
  pessoas_envolvidas: number | null;
  minutos_dia: number | null;
  horas_dia: number | null;
}

export interface AtribuicaoParaPasso {
  atribuicao_id: string;
  nome: string | null;
  pessoa_nome: string | null;
  tempo_unitario_min: number | null;
}

const CHAVE = {
  passos: (id: string) => ["processo-passos", id],
  divergencia: (id: string) => ["processo-divergencia", id],
  custo: (id: string) => ["processo-custo", id],
};

export function useProcessoPassos(processoId: string) {
  return useQuery({
    queryKey: CHAVE.passos(processoId),
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoPasso[]> => {
      const { data, error } = await (supabase as any)
        .from("processo_passo")
        .select("id,processo_id,ordem,nome,descricao,atribuicao_id,condicional,ativo,created_at")
        .eq("processo_id", processoId)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProcessoPasso[];
    },
  });
}

export function useProcessoDivergencias(processoId: string) {
  return useQuery({
    queryKey: CHAVE.divergencia(processoId),
    enabled: !!processoId,
    queryFn: async (): Promise<DivergenciaProcesso[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_processo_divergencia")
        .select(
          "processo_id,processo_codigo,processo_nome,tipo,passo_id,passo_ordem,item_nome,atribuicao_id,pessoa_nome,significado",
        )
        .eq("processo_id", processoId);
      if (error) throw error;
      return (data ?? []) as DivergenciaProcesso[];
    },
  });
}

export function useProcessoCusto(processoId: string) {
  return useQuery({
    queryKey: CHAVE.custo(processoId),
    enabled: !!processoId,
    queryFn: async (): Promise<CustoProcesso | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_processo_custo")
        .select("processo_id,codigo,nome,passos,passos_com_dono,pessoas_envolvidas,minutos_dia,horas_dia")
        .eq("processo_id", processoId)
        .maybeSingle();
      if (error) throw error;
      return (data as CustoProcesso | null) ?? null;
    },
  });
}

/** Catálogo de atribuições para o combobox do passo. Fonte: vw_carga_atribuicao. */
export function useAtribuicoesParaPasso() {
  return useQuery({
    queryKey: ["atribuicoes-para-passo"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AtribuicaoParaPasso[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_carga_atribuicao")
        .select("atribuicao_id,nome,pessoa_nome,tempo_unitario_min")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AtribuicaoParaPasso[];
    },
  });
}

export interface PassoEntrada {
  id?: string | null;
  nome: string;
  descricao: string | null;
  atribuicao_id: string | null;
  condicional: boolean;
}

export function useSalvarPasso(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: PassoEntrada) => {
      const nome = entrada.nome.trim();
      if (!nome) throw new Error("Dê um nome ao passo.");
      const corpo = {
        nome,
        descricao: entrada.descricao?.trim() ? entrada.descricao.trim() : null,
        atribuicao_id: entrada.atribuicao_id,
        condicional: entrada.condicional,
      };

      if (entrada.id) {
        const { error } = await (supabase as any)
          .from("processo_passo")
          .update(corpo)
          .eq("id", entrada.id);
        if (error) throw error;
        return entrada.id;
      }

      // Nasce no fim da fila, com folga de 10 entre as ordens.
      const { data: ultimo, error: errUltimo } = await (supabase as any)
        .from("processo_passo")
        .select("ordem")
        .eq("processo_id", processoId)
        .eq("ativo", true)
        .order("ordem", { ascending: false })
        .limit(1);
      if (errUltimo) throw errUltimo;
      const proxima = ((ultimo?.[0]?.ordem as number | undefined) ?? 0) + 10;

      const { data, error } = await (supabase as any)
        .from("processo_passo")
        .insert({ ...corpo, processo_id: processoId, ordem: proxima, ativo: true })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => invalidar(qc, processoId),
  });
}

export function useRemoverPasso(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (passoId: string) => {
      const { error } = await (supabase as any)
        .from("processo_passo")
        .delete()
        .eq("id", passoId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc, processoId),
  });
}

/**
 * Reordenação em DUAS PASSADAS para não bater no índice único (processo_id, ordem):
 * 1ª passada joga todos os passos para ordens negativas (-1, -2, …), faixa onde
 * nenhum passo ativo vive; 2ª passada grava as ordens finais espaçadas de 10 em 10.
 * Assim nunca há colisão intermediária e sobra folga para inserções futuras.
 */
export function useReordenarPassos(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idsNaOrdem: string[]) => {
      for (let i = 0; i < idsNaOrdem.length; i++) {
        const { error } = await (supabase as any)
          .from("processo_passo")
          .update({ ordem: -(i + 1) })
          .eq("id", idsNaOrdem[i]);
        if (error) throw error;
      }
      for (let i = 0; i < idsNaOrdem.length; i++) {
        const { error } = await (supabase as any)
          .from("processo_passo")
          .update({ ordem: (i + 1) * 10 })
          .eq("id", idsNaOrdem[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidar(qc, processoId),
  });
}

function invalidar(qc: ReturnType<typeof useQueryClient>, processoId: string) {
  qc.invalidateQueries({ queryKey: CHAVE.passos(processoId) });
  qc.invalidateQueries({ queryKey: CHAVE.divergencia(processoId) });
  qc.invalidateQueries({ queryKey: CHAVE.custo(processoId) });
  qc.invalidateQueries({ queryKey: ["processo-atribuicoes", processoId] });
}
