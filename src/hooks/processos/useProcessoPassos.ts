// Passos do processo, divergências e custo — via dupla processo ⇄ atribuição.
// Leitura: processo_passo, vw_processo_divergencia, vw_processo_custo.
// Escrita de passo: direto em processo_passo (tabela própria do módulo de processos).
// Escrita de ATRIBUIÇÃO: SEMPRE por fn_atribuicao_salvar — a regra de escopo do
// líder, dono obrigatório e tempo > 0 vive no banco e a mensagem de erro vem dela.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePessoasDoTime } from "@/hooks/tarefas/useTarefasDoTime";

/** Quem executa o passo: só 'time' consome tempo da equipe e pede atribuição. */
export type QuemExecuta = "time" | "requerente" | "externo";

export const QUEM_EXECUTA_OPCOES: { valor: QuemExecuta; rotulo: string; explicacao: string }[] = [
  {
    valor: "time",
    rotulo: "Time",
    explicacao: "Consome tempo da equipe e pede atribuição.",
  },
  {
    valor: "requerente",
    rotulo: "Requerente",
    explicacao: "Auto-serviço de quem pediu. Não custa tempo do time.",
  },
  {
    valor: "externo",
    rotulo: "Externo",
    explicacao: "Feito fora da Fetely. Não custa tempo do time.",
  },
];

export interface ProcessoPasso {
  id: string;
  processo_id: string;
  ordem: number;
  nome: string;
  descricao: string | null;
  atribuicao_id: string | null;
  condicional: boolean;
  quem_executa: QuemExecuta | null;
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
        .select(
          "id,processo_id,ordem,nome,descricao,atribuicao_id,condicional,quem_executa,ativo,created_at",
        )

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
  quem_executa?: QuemExecuta | null;
}

export function useSalvarPasso(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: PassoEntrada) => {
      const nome = entrada.nome.trim();
      if (!nome) throw new Error("Dê um nome ao passo.");
      const corpo: Record<string, unknown> = {
        nome,
        descricao: entrada.descricao?.trim() ? entrada.descricao.trim() : null,
        atribuicao_id: entrada.atribuicao_id,
        condicional: entrada.condicional,
      };
      if (entrada.quem_executa) corpo.quem_executa = entrada.quem_executa;


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

/** Troca só o quem_executa do passo. */
export function useQuemExecutaPasso(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ passoId, valor }: { passoId: string; valor: QuemExecuta }) => {
      const { error } = await (supabase as any)
        .from("processo_passo")
        .update({ quem_executa: valor })
        .eq("id", passoId);
      if (error) throw error;
    },
    onSuccess: () => invalidar(qc, processoId),
  });
}

export interface OpcaoPessoaAtribuicao {
  pessoa_id: string;
  usuario_id: string | null;
  nome: string;
  cargo: string | null;
}

/**
 * Pessoas que podem receber a atribuição: o time de quem está logado
 * (mesmo critério da Mesa do Gestor — tarefas_meu_time decide no banco).
 */
export function usePessoasParaAtribuicao() {
  const time = usePessoasDoTime();
  const pessoas = useQuery({
    queryKey: ["processo-passo-pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OpcaoPessoaAtribuicao[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_gestao_pessoa")
        .select("pessoa_id, usuario_id, nome, cargo")
        .order("nome");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? [])
        .filter((p: any) => p.pessoa_id && p.nome)
        .map((p: any) => ({
          pessoa_id: p.pessoa_id as string,
          usuario_id: (p.usuario_id ?? null) as string | null,
          nome: p.nome as string,
          cargo: p.cargo ?? null,
        })) as OpcaoPessoaAtribuicao[];
    },
  });

  const doTime = useMemo(() => {
    const ids = new Set(time.data?.ids ?? []);
    const todas = pessoas.data ?? [];
    if (ids.size === 0) return todas;
    const filtradas = todas.filter((p) => p.usuario_id && ids.has(p.usuario_id));
    return filtradas.length > 0 ? filtradas : todas;
  }, [pessoas.data, time.data]);

  return { ...pessoas, pessoas: doTime };
}

export interface AtribuicaoNovaParaPasso {
  passoId: string;
  nome: string;
  descricao: string | null;
  pessoa_id: string;
  tempo_unitario_min: number;
  fluxo_diario: number | null;
  processo_id: string;
}

/**
 * Cria a atribuição pela RPC e liga ao passo na MESMA ação.
 * FAIL-LOUD: qualquer exceção da RPC sobe com a mensagem em português dela.
 * A atribuição pertence à PESSOA — pode ser reaproveitada em passos de outros processos.
 */
export function useCriarAtribuicaoParaPasso(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: AtribuicaoNovaParaPasso) => {
      const { data, error } = await (supabase as any).rpc("fn_atribuicao_salvar", {
        _id: null,
        _nome: e.nome.trim(),
        _descricao: e.descricao?.trim() ? e.descricao.trim() : null,
        _pessoa_id: e.pessoa_id,
        _tempo_unitario_min: e.tempo_unitario_min,
        _fluxo_diario: e.fluxo_diario,
        _fonte_volume: "demanda_livre",
        _fila_id: null,
        _recorrencia_id: null,
        _departamento_id: null,
        _macro_processo_id: null,
        _processo_id: e.processo_id,
      });
      if (error) throw error;
      const atribuicaoId = data as string;
      if (!atribuicaoId) throw new Error("A atribuição não foi criada — nada foi ligado ao passo.");

      const { error: errLigar } = await (supabase as any)
        .from("processo_passo")
        .update({ atribuicao_id: atribuicaoId })
        .eq("id", e.passoId);
      if (errLigar) throw errLigar;
      return atribuicaoId;
    },
    onSuccess: () => {
      invalidar(qc, processoId);
      qc.invalidateQueries({ queryKey: ["atribuicoes-para-passo"] });
      qc.invalidateQueries({ queryKey: ["tarefas", "mesa", "atribuicoes"] });
    },
  });
}


function invalidar(qc: ReturnType<typeof useQueryClient>, processoId: string) {
  qc.invalidateQueries({ queryKey: CHAVE.passos(processoId) });
  qc.invalidateQueries({ queryKey: CHAVE.divergencia(processoId) });
  qc.invalidateQueries({ queryKey: CHAVE.custo(processoId) });
  qc.invalidateQueries({ queryKey: ["processo-atribuicoes", processoId] });
}
