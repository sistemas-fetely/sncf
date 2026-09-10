import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MinhaFilaSeveridade = "critica" | "alta" | "normal" | "baixa";
export type MeuPapel = "atende" | "responde";

export interface MinhaFila {
  fila_chave: string;
  fila_nome: string;
  cadeira: string;
  meu_papel: MeuPapel;
  severidade: MinhaFilaSeveridade;
  prazo_dias: number | null;
  rota: string | null;
  itens: number;
  tempo_unitario_min: number | null;
  tempo_declarado_em: string | null;
  tempo_declarado_por: string | null;
  precisa_declarar: boolean;
  minutos_fila: number;
}

function normalizarSeveridade(v: string | null): MinhaFilaSeveridade {
  if (v === "critica" || v === "alta" || v === "normal" || v === "baixa") return v;
  return "normal";
}

function normalizarPapel(v: string | null): MeuPapel {
  if (v === "atende" || v === "responde") return v;
  return "atende";
}

export function useMinhasFilas() {
  return useQuery({
    queryKey: ["tarefas", "minhas-filas"],
    queryFn: async (): Promise<MinhaFila[]> => {
      const { data, error } = await supabase.from("vw_minhas_filas").select("*");
      if (error) throw error;

      return (data ?? []).map((f): MinhaFila => ({
        fila_chave: f.fila_chave ?? "",
        fila_nome: f.fila_nome ?? "",
        cadeira: f.cadeira ?? "",
        meu_papel: normalizarPapel(f.meu_papel),
        severidade: normalizarSeveridade(f.severidade),
        prazo_dias: f.prazo_dias ?? null,
        rota: f.rota ?? null,
        itens: Number(f.itens ?? 0),
        tempo_unitario_min: f.tempo_unitario_min ?? null,
        tempo_declarado_em: f.tempo_declarado_em ?? null,
        tempo_declarado_por: f.tempo_declarado_por ?? null,
        precisa_declarar: !!f.precisa_declarar,
        minutos_fila: Number(f.minutos_fila ?? 0),
      }));
    },
  });
}

export function useDeclararTempoFila() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ filaChave, tempoMin }: { filaChave: string; tempoMin: number }) => {
      const { data, error } = await supabase.rpc("declarar_tempo_fila", {
        p_fila_chave: filaChave,
        p_tempo_min: tempoMin,
      });
      if (error) throw error;
      return data?.[0];
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tarefas", "minhas-filas"] });
    },
  });
}
