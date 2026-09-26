import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TipoEventoMes = "aniversario" | "tempo_casa";

export interface EventoDoMes {
  /** Chave única para React keys */
  key: string;
  /** ID da pessoa */
  pessoa_id: string | null;
  nome: string;
  foto_url: string | null;
  departamento: string | null;
  tipo_evento: TipoEventoMes;
  /** Dia do mês (1-31) */
  dia: number;
  /** Label curto (ex: "🎂 hoje!", "dia 12") */
  label_destaque: string;
  eh_hoje: boolean;
  eh_voce: boolean;
  subtitulo: string;
}

/**
 * Aniversariantes do mês via RPC fn_aniversariantes (nunca traz ano de nascimento).
 * Respeita opt-out (mural_preferencias_usuario) no banco. FAIL-LOUD: erro da RPC propaga.
 */
export function useAniversariantesDoMes(p_mes?: number) {
  const mes = p_mes ?? new Date().getMonth() + 1;
  return useQuery({
    queryKey: ["aniversariantes-mes", mes],
    queryFn: async (): Promise<EventoDoMes[]> => {
      const { data, error } = await (supabase as any).rpc("fn_aniversariantes", { p_mes: mes });
      if (error) throw new Error(error.message);
      const eventos: EventoDoMes[] = ((data ?? []) as any[]).map((r) => ({
        key: `aniv-${r.pessoa_id}`,
        pessoa_id: r.pessoa_id ?? null,
        nome: r.nome ?? "",
        foto_url: r.foto_url ?? null,
        departamento: null,
        tipo_evento: "aniversario",
        dia: Number(r.dia),
        label_destaque: r.eh_hoje ? "🎂 hoje!" : `dia ${r.dia}`,
        eh_hoje: !!r.eh_hoje,
        eh_voce: !!r.eh_voce,
        subtitulo: "aniversário",
      }));
      eventos.sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome));
      return eventos;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
