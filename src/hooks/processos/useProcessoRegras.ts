import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

export interface ProcessoRegraHistorico {
  regra_id: string;
  valor: number | null;
  unidade: string | null;
  valor_texto: string | null;
  conta_a_partir_de: string | null;
  definido_por: string | null;
  definido_em: string | null;
  motivo: string | null;
  substituido_em: string | null;
}

export interface ProcessoRegra extends Omit<ProcessoRegraHistorico, "regra_id" | "substituido_em"> {
  id: string;
  codigo: string;
  processo_id: string;
  nome: string;
  unidade_rotulo: string | null;
  ativo: boolean;
  updated_at: string | null;
  passos: string | null;
  mudancas: number;
}

export const dataProcesso = (data: string | null) => data ? data.slice(0, 10).split("-").reverse().join("/") : "—";
export const numeroProcesso = (valor: number | null) => valor == null ? "—" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export interface EdicaoRegra {
  valor: string;
  valorTexto: string;
  contaAPartirDe: string;
  motivo: string;
}

/** Validação do formulário; permissão e histórico continuam sendo responsabilidade da RPC. */
export function podeSalvarRegra(regra: ProcessoRegra, edicao: EdicaoRegra) {
  if (!edicao.motivo.trim()) return false;
  if (regra.unidade !== "texto") {
    const valor = Number(edicao.valor);
    if (!edicao.valor.trim() || !Number.isInteger(valor) || valor < 0) return false;
  }
  return (regra.unidade !== "texto" && Number(edicao.valor) !== regra.valor)
    || edicao.valorTexto !== (regra.valor_texto ?? "")
    || edicao.contaAPartirDe !== (regra.conta_a_partir_de ?? "");
}

export function useAlterarProcessoRegra(processoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ regra, edicao }: { regra: ProcessoRegra; edicao: EdicaoRegra }) => {
      if (!podeSalvarRegra(regra, edicao)) throw new Error("Preencha um motivo e altere a regra com um valor válido.");
      const { data, error } = await supabase.rpc("processo_regra_alterar" as never, {
        p_regra_id: regra.id,
        p_valor: regra.unidade === "texto" ? regra.valor : Number(edicao.valor),
        p_valor_texto: edicao.valorTexto || null,
        p_conta_a_partir_de: edicao.contaAPartirDe || null,
        p_motivo: edicao.motivo,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["processos", "regras", processoId] }),
        qc.invalidateQueries({ queryKey: ["processos", "regras-historico", processoId] }),
        qc.invalidateQueries({ queryKey: ["processos", "passos-vivos", processoId] }),
      ]);
      toast.success("Regra atualizada");
    },
    onError: (error) => toast.error(formatError(error)),
  });
}

export function idsHistoricoSobDemanda(regras: ProcessoRegra[], expandidas: Set<string>) {
  return regras.filter((r) => r.mudancas > 0 && expandidas.has(r.id)).map((r) => r.id).sort();
}

export function useProcessoRegras(processoId: string) {
  return useQuery({
    queryKey: ["processos", "regras", processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoRegra[]> => {
      const { data, error } = await supabase.from("vw_processo_regra" as never)
        .select("*").eq("processo_id", processoId).order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as ProcessoRegra[];
    },
  });
}

/** Uma leitura em lote para as regras expandidas com mudanças, nunca uma consulta por linha. */
export function useProcessoRegrasHistorico(processoId: string, regraIds: string[]) {
  return useQuery({
    queryKey: ["processos", "regras-historico", processoId, regraIds],
    enabled: regraIds.length > 0,
    queryFn: async (): Promise<Map<string, ProcessoRegraHistorico[]>> => {
      const { data, error } = await supabase.from("processo_regra_historico" as never)
        .select("regra_id,valor,unidade,valor_texto,conta_a_partir_de,definido_por,definido_em,motivo,substituido_em")
        .in("regra_id", regraIds).order("substituido_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const mapa = new Map<string, ProcessoRegraHistorico[]>();
      for (const r of (data ?? []) as unknown as ProcessoRegraHistorico[]) {
        mapa.set(r.regra_id, [...(mapa.get(r.regra_id) ?? []), r]);
      }
      return mapa;
    },
  });
}