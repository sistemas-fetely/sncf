import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Cargo {
  id: string;
  nome: string;
  nivel: string;
  departamento: string | null;
  tipo_contrato: string;
  is_clevel: boolean;
  protege_salario: boolean;
  faixa_clt_f1_min: number | null;
  faixa_clt_f1_max: number | null;
  faixa_clt_f2_min: number | null;
  faixa_clt_f2_max: number | null;
  faixa_clt_f3_min: number | null;
  faixa_clt_f3_max: number | null;
  faixa_clt_f4_min: number | null;
  faixa_clt_f4_max: number | null;
  faixa_clt_f5_min: number | null;
  faixa_clt_f5_max: number | null;
  faixa_pj_f1_min: number | null;
  faixa_pj_f1_max: number | null;
  faixa_pj_f2_min: number | null;
  faixa_pj_f2_max: number | null;
  faixa_pj_f3_min: number | null;
  faixa_pj_f3_max: number | null;
  faixa_pj_f4_min: number | null;
  faixa_pj_f4_max: number | null;
  faixa_pj_f5_min: number | null;
  faixa_pj_f5_max: number | null;
  ativo: boolean;
  missao: string | null;
  responsabilidades: string[];
  skills_obrigatorias: string[];
  skills_desejadas: string[];
  ferramentas: string[];
}

const FAIXA_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;

// FAIXA-SALARIAL-MORA-EM-TABELA-PROPRIA (21/08/2026): cargos é lida por anon
// (candidatura pública), então faixas e protege_salario vivem em
// cargos_faixas_salariais (RLS restrita) e são mescladas aqui por cargo_id.
// Para quem não tem permissão na tabela de faixas, o select volta vazio (RLS)
// e os campos saem null/false — sem vazar dado salarial.
export async function mesclarFaixasSalariais<T extends { id: string }>(cargos: T[]): Promise<T[]> {
  if (cargos.length === 0) return cargos;
  const { data: faixas, error } = await supabase
    .from("cargos_faixas_salariais")
    .select("*")
    .in("cargo_id", cargos.map((c) => c.id));
  if (error) throw error;
  const porCargo = new Map((faixas ?? []).map((f) => [f.cargo_id, f]));
  return cargos.map((c) => {
    const f = porCargo.get(c.id);
    const merged: Record<string, unknown> = { ...c, protege_salario: f?.protege_salario ?? false };
    for (const k of FAIXA_KEYS) {
      merged[`faixa_clt_${k}_min`] = f?.[`faixa_clt_${k}_min`] ?? null;
      merged[`faixa_clt_${k}_max`] = f?.[`faixa_clt_${k}_max`] ?? null;
      merged[`faixa_pj_${k}_min`] = f?.[`faixa_pj_${k}_min`] ?? null;
      merged[`faixa_pj_${k}_max`] = f?.[`faixa_pj_${k}_max`] ?? null;
    }
    return merged as T;
  });
}

export function useCargos(filtroTipo?: "clt" | "pj" | "ambos") {
  return useQuery({
    queryKey: ["cargos", filtroTipo],
    queryFn: async () => {
      let query = supabase
        .from("cargos")
        .select("*")
        .eq("ativo", true)
        .order("nome");

      if (filtroTipo && filtroTipo !== "ambos") {
        query = query.in("tipo_contrato", [filtroTipo, "ambos"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (await mesclarFaixasSalariais(data)) as Cargo[];
    },
  });
}

export function useAllCargos() {
  return useQuery({
    queryKey: ["cargos", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (await mesclarFaixasSalariais(data)) as Cargo[];
    },
  });
}

export function useCargoById(id: string | null) {
  return useQuery({
    queryKey: ["cargo", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("cargos")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      const [completo] = await mesclarFaixasSalariais([data]);
      return completo as Cargo;
    },
    enabled: !!id,
  });
}
