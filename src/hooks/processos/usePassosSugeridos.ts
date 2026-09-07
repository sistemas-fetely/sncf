// Sugestões de passo geradas pela IA a partir da narrativa.
// Doutrina: validado antes de alterar — a IA só escreve em processo_passo_sugerido.
// Só o aceite humano cria a linha em processo_passo.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PassoSugerido {
  id: string;
  processo_id: string;
  ordem: number;
  nome: string;
  descricao: string | null;
  trecho_origem: string | null;
  status: "pendente" | "aceito" | "rejeitado";
  gerado_em: string;
  modelo: string | null;
}

const CHAVE = (processoId: string) => ["processo-passos-sugeridos", processoId];

export function usePassosSugeridos(processoId: string) {
  return useQuery({
    queryKey: CHAVE(processoId),
    enabled: !!processoId,
    queryFn: async (): Promise<PassoSugerido[]> => {
      const { data, error } = await (supabase as any)
        .from("processo_passo_sugerido")
        .select("id,processo_id,ordem,nome,descricao,trecho_origem,status,gerado_em,modelo")
        .eq("processo_id", processoId)
        .eq("status", "pendente")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PassoSugerido[];
    },
  });
}

export function useGerarPassosSugeridos(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ total: number; modelo: string }> => {
      const { data, error } = await supabase.functions.invoke("sugerir-passos-processo", {
        body: { processo_id: processoId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return { total: (data as any).total ?? 0, modelo: (data as any).modelo ?? "" };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE(processoId) });
    },
  });
}

/** Aceitar = criar o passo de verdade e marcar a sugestão. Ordem nasce no fim da fila, de 10 em 10. */
export function useAceitarPassoSugerido(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sugestoes: PassoSugerido[]) => {
      if (sugestoes.length === 0) return 0;

      const { data: ultimo, error: erroUltimo } = await (supabase as any)
        .from("processo_passo")
        .select("ordem")
        .eq("processo_id", processoId)
        .eq("ativo", true)
        .order("ordem", { ascending: false })
        .limit(1);
      if (erroUltimo) throw erroUltimo;

      let proxima = ((ultimo?.[0]?.ordem as number | undefined) ?? 0) + 10;

      const linhas = [...sugestoes]
        .sort((a, b) => a.ordem - b.ordem)
        .map((s) => {
          const linha = {
            processo_id: processoId,
            ordem: proxima,
            nome: s.nome,
            descricao: s.descricao,
            atribuicao_id: null,
            condicional: false,
            ativo: true,
          };
          proxima += 10;
          return linha;
        });

      const { error: erroInsert } = await (supabase as any).from("processo_passo").insert(linhas);
      if (erroInsert) throw erroInsert;

      const { data: sessao } = await supabase.auth.getUser();
      const { error: erroStatus } = await (supabase as any)
        .from("processo_passo_sugerido")
        .update({
          status: "aceito",
          avaliado_por: sessao?.user?.id ?? null,
          avaliado_em: new Date().toISOString(),
        })
        .in(
          "id",
          sugestoes.map((s) => s.id),
        );
      if (erroStatus) throw erroStatus;

      return linhas.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE(processoId) });
      qc.invalidateQueries({ queryKey: ["processo-passos", processoId] });
      qc.invalidateQueries({ queryKey: ["processo-divergencia", processoId] });
      qc.invalidateQueries({ queryKey: ["processo-custo", processoId] });
    },
  });
}

export function useRejeitarPassoSugerido(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sugestaoId: string) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("processo_passo_sugerido")
        .update({
          status: "rejeitado",
          avaliado_por: sessao?.user?.id ?? null,
          avaliado_em: new Date().toISOString(),
        })
        .eq("id", sugestaoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE(processoId) }),
  });
}
