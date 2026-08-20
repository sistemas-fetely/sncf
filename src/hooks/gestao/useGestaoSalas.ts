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
