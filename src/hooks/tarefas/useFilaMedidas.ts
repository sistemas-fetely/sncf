// F2 — medição de filas: leitura de vw_fila_medida (somente filas instrumentadas).
// Fonte única para o selo "mede execução" (Mesa do Gestor) e o bloco de medida
// no Sheet da fila (Dash de Tarefas). Nada é escrito a partir desta leitura.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FilaMedida {
  chave: string;
  nome: string | null;
  exec_tabela: string | null;
  media_por_dia_corrido: number | null;
  media_por_dia_ativo: number | null;
  padrao: string | null; // diario | semanal | mensal | esporadico | sem_dado
  padrao_ref: string | null;
  dias_com_entrada: number | null;
  entradas_total: number | null;
  pico_dia_qtd: number | null;
  amostra_humana: number | null;
  lead_p50_min: number | null;
  lead_p80_min: number | null;
  lead_p95_min: number | null;
}

/** Minutos → "45min" / "2h" / "3 dias". Compartilhado pelos dois consumidores. */
export function fmtPrazoMedida(min: number | null | undefined): string {
  if (min == null) return "—";
  const n = Math.round(Number(min));
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n}min`;
  if (n < 60 * 24) return `${Math.round(n / 60)}h`;
  return `${(n / (60 * 24)).toFixed(1).replace(".", ",")} dias`;
}

export function useFilaMedidas() {
  return useQuery({
    queryKey: ["vw-fila-medida"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, FilaMedida>> => {
      // View nova: ainda não consta em types.ts — acesso via any, como no padrão do módulo.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_fila_medida").select("*");
      if (error) throw error;
      const mapa = new Map<string, FilaMedida>();
      for (const l of (data ?? []) as FilaMedida[]) {
        if (l.chave) mapa.set(l.chave, l);
      }
      return mapa;
    },
  });
}
