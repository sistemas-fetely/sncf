import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

export interface CasoAndamento {
  casoId?: string | null;
  pedidoId?: string | null;
  devolucaoId?: string | null;
  tarefaId?: string | null;
}
export interface ProcessoAndamento {
  id: string; caso_tipo: string; caso_id: string | null; caso_ref: string | null;
  pedido_id: string | null; devolucao_id: string | null; tarefa_id: string | null;
  passo_nome: string | null; autor_user_id: string | null; autor_nome: string | null;
  texto: string; retomar_em: string | null; criado_em: string; retomar_ativo: boolean;
}
export const KEY_ANDAMENTO = ["processos", "andamento"] as const;
export const hojeAndamento = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function podeRegistrarAndamento(texto: string, data: string, hoje = hojeAndamento()) {
  return texto.trim().length >= 3 && (!data || (/^\d{4}-\d{2}-\d{2}$/.test(data) && data >= hoje));
}
export function filtroAndamento(caso: CasoAndamento) {
  return [["caso_id", caso.casoId], ["pedido_id", caso.pedidoId], ["devolucao_id", caso.devolucaoId]]
    .filter(([, id]) => !!id).map(([campo, id]) => `${campo}.eq.${id}`).join(",");
}
export function useAndamentoCaso(caso: CasoAndamento) {
  const filtro = filtroAndamento(caso);
  return useQuery({
    queryKey: [...KEY_ANDAMENTO, filtro], enabled: !!filtro,
    queryFn: async (): Promise<ProcessoAndamento[]> => {
      const linhas: ProcessoAndamento[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("vw_processo_andamento" as never).select("*")
          .or(filtro).order("criado_em", { ascending: false }).order("id", { ascending: false }).range(inicio, inicio + 499);
        if (error) throw error;
        const pagina = (data ?? []) as unknown as ProcessoAndamento[];
        linhas.push(...pagina);
        if (pagina.length < 500) return linhas;
      }
    },
  });
}
export function useRegistrarAndamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caso, texto, retomarEm }: { caso: CasoAndamento; texto: string; retomarEm: string }) => {
      if (!podeRegistrarAndamento(texto, retomarEm)) throw new Error("Informe ao menos 3 caracteres e uma data que não esteja no passado.");
      if (!caso.tarefaId && !caso.devolucaoId) throw new Error("Informe a tarefa ou a devolução.");
      const { data, error } = await supabase.rpc("processo_andamento_registrar" as never, {
        p_texto: texto.trim(), p_tarefa_id: caso.tarefaId ?? null,
        p_devolucao_id: caso.tarefaId ? null : caso.devolucaoId ?? null, p_retomar_em: retomarEm || null,
      } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tarefas", "fila-processos"] }),
        qc.invalidateQueries({ queryKey: ["processos"] }),
        qc.invalidateQueries({ queryKey: KEY_ANDAMENTO }),
      ]);
      toast.success("Andamento registrado");
    },
    onError: (error) => toast.error(formatError(error)),
  });
}