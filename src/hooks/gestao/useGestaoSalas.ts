import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Sala de Gestão — salas e ciclo do rito.
 * Toda regra de visibilidade/permissão vive no banco (gestao_pode_*). Aqui só
 * perguntamos; nunca reimplementamos.
 */

export type Cadencia = "semanal" | "quinzenal" | "mensal" | "trimestral" | "sob_demanda";

export const CADENCIA_ROTULO: Record<string, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  sob_demanda: "Sob demanda",
};

export interface Sala {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  cadencia: string;
  dia_referencia: number | null;
  departamento_id: string | null;
  confidencial: boolean;
  dono_pessoa_id: string | null;
  ativo: boolean;
  ordem: number | null;
}

export interface SalaCiclo {
  sala_id: string | null;
  codigo: string | null;
  sala_nome: string | null;
  cadencia: string | null;
  confidencial: boolean | null;
  intervalo_dias: number | null;
  ultima_fechada: string | null;
  reuniao_aberta_id: string | null;
  reuniao_aberta_data: string | null;
}

export interface SalaMembro {
  sala_id: string;
  pessoa_id: string;
  papel: string;
}

export const KEY_GESTAO = ["gestao"] as const;

export function useSalas() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "salas"],
    queryFn: async (): Promise<Sala[]> => {
      const { data, error } = await supabase
        .from("gestao_sala")
        .select(
          "id,codigo,nome,descricao,cadencia,dia_referencia,departamento_id,confidencial,dono_pessoa_id,ativo,ordem",
        )
        .eq("ativo", true)
        .order("ordem", { ascending: true, nullsFirst: false })
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Sala[];
    },
  });
}

export function useSala(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "sala", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<Sala | null> => {
      const { data, error } = await supabase
        .from("gestao_sala")
        .select(
          "id,codigo,nome,descricao,cadencia,dia_referencia,departamento_id,confidencial,dono_pessoa_id,ativo,ordem",
        )
        .eq("id", salaId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Sala | null;
    },
  });
}

export function useSalasCiclo() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "salas-ciclo"],
    queryFn: async (): Promise<SalaCiclo[]> => {
      const { data, error } = await supabase
        .from("vw_gestao_sala_ciclo")
        .select(
          "sala_id,codigo,sala_nome,cadencia,confidencial,intervalo_dias,ultima_fechada,reuniao_aberta_id,reuniao_aberta_data",
        );
      if (error) throw error;
      return (data ?? []) as SalaCiclo[];
    },
  });
}

/** Membros de todas as salas visíveis — usado para contagem e para a lista de leitores. */
export function useMembrosSalas() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "membros"],
    queryFn: async (): Promise<SalaMembro[]> => {
      const { data, error } = await supabase
        .from("gestao_sala_membro")
        .select("sala_id,pessoa_id,papel");
      if (error) throw error;
      return (data ?? []) as SalaMembro[];
    },
  });
}

export function useMembrosDaSala(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "membros", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<SalaMembro[]> => {
      const { data, error } = await supabase
        .from("gestao_sala_membro")
        .select("sala_id,pessoa_id,papel")
        .eq("sala_id", salaId!);
      if (error) throw error;
      return (data ?? []) as SalaMembro[];
    },
  });
}

/** Escopo da sala: projetos aos quais ela pode pendurar tarefa/decisão/risco. */
export function useEscopoDaSala(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "escopo", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("gestao_sala_escopo")
        .select("projeto_id")
        .eq("sala_id", salaId!);
      if (error) throw error;
      return (data ?? []).map((l) => l.projeto_id as string).filter(Boolean);
    },
  });
}

export function usePodeCriarSala() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "pode-criar-sala"],
    queryFn: async (): Promise<boolean> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("gestao_pode_criar_sala", { _uid: uid });
      if (error) throw error;
      return !!data;
    },
  });
}

export function useEhFacilitador(salaId: string | null) {
  return useQuery({
    queryKey: [...KEY_GESTAO, "facilitador", salaId ?? "nenhuma"],
    enabled: !!salaId,
    queryFn: async (): Promise<boolean> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data, error } = await supabase.rpc("gestao_eh_facilitador", {
        _sala_id: salaId!,
        _uid: uid,
      });
      if (error) throw error;
      return !!data;
    },
  });
}

export interface NovaSala {
  codigo: string;
  nome: string;
  descricao: string | null;
  cadencia: string;
  confidencial: boolean;
}

export function useCriarSala() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: NovaSala): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("gestao_sala")
        .insert({ ...valores, criado_por: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      toast.success("Sala criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a sala: ${e.message}`),
  });
}

export type PapelMembro = "facilitador" | "membro" | "convidado";

export const PAPEL_ROTULO: Record<string, string> = {
  facilitador: "Facilitador",
  membro: "Membro",
  convidado: "Convidado",
};

function invalidarMembros(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [...KEY_GESTAO, "membros"] });
  // Trocar/remover facilitador muda quem pode fechar reunião.
  qc.invalidateQueries({ queryKey: [...KEY_GESTAO, "facilitador"] });
}

function invalidarEscopo(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [...KEY_GESTAO, "escopo"] });
  // A pauta automática só enxerga projetos do escopo.
  qc.invalidateQueries({ queryKey: [...KEY_GESTAO, "pauta"] });
  qc.invalidateQueries({ queryKey: [...KEY_GESTAO, "pauta-contagem"] });
}

export function useAdicionarMembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { salaId: string; pessoaId: string; papel: PapelMembro }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("gestao_sala_membro").insert({
        sala_id: v.salaId,
        pessoa_id: v.pessoaId,
        papel: v.papel,
        criado_por: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarMembros(qc);
      toast.success("Membro adicionado à sala");
    },
    onError: (e: Error) => toast.error(`Não foi possível adicionar o membro: ${e.message}`),
  });
}

export function useTrocarPapelMembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { salaId: string; pessoaId: string; papel: PapelMembro }) => {
      const { error } = await supabase
        .from("gestao_sala_membro")
        .update({ papel: v.papel })
        .eq("sala_id", v.salaId)
        .eq("pessoa_id", v.pessoaId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarMembros(qc);
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error(`Não foi possível trocar o papel: ${e.message}`),
  });
}

export function useRemoverMembro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { salaId: string; pessoaId: string }) => {
      const { error } = await supabase
        .from("gestao_sala_membro")
        .delete()
        .eq("sala_id", v.salaId)
        .eq("pessoa_id", v.pessoaId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarMembros(qc);
      toast.success("Membro removido da sala");
    },
    onError: (e: Error) => toast.error(`Não foi possível remover o membro: ${e.message}`),
  });
}

export function useAdicionarEscopo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { salaId: string; projetoId: string }) => {
      const { error } = await supabase
        .from("gestao_sala_escopo")
        .insert({ sala_id: v.salaId, projeto_id: v.projetoId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarEscopo(qc);
      toast.success("Projeto adicionado ao escopo da sala");
    },
    onError: (e: Error) => toast.error(`Não foi possível adicionar o projeto: ${e.message}`),
  });
}

export function useRemoverEscopo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { salaId: string; projetoId: string }) => {
      const { error } = await supabase
        .from("gestao_sala_escopo")
        .delete()
        .eq("sala_id", v.salaId)
        .eq("projeto_id", v.projetoId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidarEscopo(qc);
      toast.success("Projeto removido do escopo da sala");
    },
    onError: (e: Error) => toast.error(`Não foi possível remover o projeto: ${e.message}`),
  });
}

/** Contagem de itens da pauta automática por sala (vw_gestao_pauta). */
export function usePautaContagemPorSala() {
  return useQuery({
    queryKey: [...KEY_GESTAO, "pauta-contagem"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("vw_gestao_pauta").select("sala_id");
      if (error) throw error;
      const mapa: Record<string, number> = {};
      (data ?? []).forEach((l) => {
        const id = l.sala_id as string | null;
        if (!id) return;
        mapa[id] = (mapa[id] ?? 0) + 1;
      });
      return mapa;
    },
  });
}
