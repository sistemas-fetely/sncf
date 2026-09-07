import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessoTag {
  id: string;
  label: string;
}

export interface ProcessoUnificado {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  narrativa: string | null;
  diagrama_mermaid: string | null;
  natureza_valor: string;
  status_valor: string;
  versao_atual: number;
  versao_vigente_em: string | null;
  owner_user_id: string | null;
  owner_perfil_codigo: string | null;
  /** Até onde o processo vale: empresa | area | departamento (nulável). Vem de processos.abrangencia. */
  abrangencia: string | null;

  owner_nome: string | null;
  area_negocio_id: string | null;
  area_nome: string | null;
  template_sncf_id: string | null;
  sensivel: boolean;
  updated_at: string;
  created_at: string;
  tags_areas: ProcessoTag[];
  tags_departamentos: ProcessoTag[];
  tags_unidades: ProcessoTag[];
  tags_cargos: ProcessoTag[];
  tags_sistemas: ProcessoTag[];
  tags_tipos_colaborador: string[];
  total_consultas: number;
  consultas_30d: number;
  sugestoes_pendentes: number;
}

export interface FiltrosProcessos {
  area_id?: string;
  departamento_id?: string;
  unidade_id?: string;
  cargo_id?: string;
  sistema_id?: string;
  tipo_colaborador?: "clt" | "pj";
  owner_user_id?: string;
  status?: string;
  natureza?: string;
  /** empresa | area | departamento */
  abrangencia?: string;
  busca?: string;

}

export function useProcessos(filtros?: FiltrosProcessos) {
  return useQuery({
    queryKey: ["processos", filtros],
    queryFn: async (): Promise<ProcessoUnificado[]> => {
      let q = (supabase as any).from("processos_unificados").select("*");

      if (filtros?.status) q = q.eq("status_valor", filtros.status);
      if (filtros?.natureza) q = q.eq("natureza_valor", filtros.natureza);
      if (filtros?.owner_user_id) q = q.eq("owner_user_id", filtros.owner_user_id);
      if (filtros?.area_id) q = q.eq("area_negocio_id", filtros.area_id);

      if (filtros?.busca && filtros.busca.trim().length > 0) {
        const termo = filtros.busca.trim();
        q = q.or(
          `nome.ilike.%${termo}%,descricao.ilike.%${termo}%,narrativa.ilike.%${termo}%`,
        );
      }

      q = q.order("updated_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;

      let lista = (data || []) as ProcessoUnificado[];

      // A view não expõe abrangencia; lemos da tabela e casamos por id.
      if (lista.length > 0) {
        const { data: abr, error: erroAbr } = await (supabase as any)
          .from("processos")
          .select("id, abrangencia")
          .in("id", lista.map((p) => p.id));
        if (erroAbr) throw erroAbr;
        const mapa = new Map<string, string | null>(
          ((abr ?? []) as { id: string; abrangencia: string | null }[]).map((r) => [
            r.id,
            r.abrangencia,
          ]),
        );
        lista = lista.map((p) => ({ ...p, abrangencia: mapa.get(p.id) ?? null }));
      }

      if (filtros?.abrangencia) {
        lista = lista.filter((p) => p.abrangencia === filtros.abrangencia);
      }

      // Filtros por tag (em memória)
      if (filtros?.departamento_id) {

        lista = lista.filter((p) =>
          p.tags_departamentos.some((t) => t.id === filtros.departamento_id),
        );
      }
      if (filtros?.unidade_id) {
        lista = lista.filter((p) =>
          p.tags_unidades.some((t) => t.id === filtros.unidade_id),
        );
      }
      if (filtros?.cargo_id) {
        lista = lista.filter((p) =>
          p.tags_cargos.some((t) => t.id === filtros.cargo_id),
        );
      }
      if (filtros?.sistema_id) {
        lista = lista.filter((p) =>
          p.tags_sistemas.some((t) => t.id === filtros.sistema_id),
        );
      }
      if (filtros?.tipo_colaborador) {
        lista = lista.filter((p) =>
          p.tags_tipos_colaborador.includes(filtros.tipo_colaborador as string),
        );
      }

      return lista;
    },
    staleTime: 30 * 1000,
  });
}

export function useProcessoDetalhe(processoId: string | null) {
  return useQuery({
    queryKey: ["processo-detalhe", processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoUnificado | null> => {
      if (!processoId) return null;
      const { data, error } = await (supabase as any)
        .from("processos_unificados")
        .select("*")
        .eq("id", processoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      // A view não expõe abrangencia; lemos da tabela.
      const { data: linha, error: erroAbr } = await (supabase as any)
        .from("processos")
        .select("abrangencia")
        .eq("id", processoId)
        .maybeSingle();
      if (erroAbr) throw erroAbr;

      // Registrar consulta (LGPD) — fire and forget
      (supabase as any)
        .rpc("registrar_consulta_processo", { _processo_id: processoId })
        .then(
          () => {},
          (e: unknown) => console.warn("Falha ao registrar consulta:", e),
        );

      return { ...(data as ProcessoUnificado), abrangencia: linha?.abrangencia ?? null };

    },
    staleTime: 30 * 1000,
  });
}
