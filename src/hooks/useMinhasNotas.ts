import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface MeuContratoPJ {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  contato_nome: string;
  valor_mensal: number;
  categoria_pj: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
}

export interface MinhaNota {
  id: string;
  contrato_id: string;
  numero: string;
  serie: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  competencia: string;
  descricao: string | null;
  arquivo_url: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  classificacoes?: ClassificacaoNF[];
}

export interface ClassificacaoNF {
  id: string;
  nota_fiscal_id: string;
  valor: number;
  categoria_valor: string;
  descricao_adicional: string | null;
  justificativa: string | null;
  ordem: number;
}

export function useMeuContratoPJ() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meu-contrato-pj", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MeuContratoPJ | null> => {
      const { data, error } = await supabase.rpc("meu_contrato_pj_ativo" as any);
      if (error) throw error;
      const arr = (data as any[]) || [];
      return arr[0] || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMinhasNotas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["minhas-notas", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MinhaNota[]> => {
      const { data: notas, error } = await supabase
        .from("notas_fiscais_pj")
        .select("*")
        .order("competencia", { ascending: false });

      if (error) throw error;
      if (!notas || notas.length === 0) return [];

      const ids = notas.map((n: any) => n.id);
      const { data: cls } = await supabase
        .from("nf_pj_classificacoes" as any)
        .select("*")
        .in("nota_fiscal_id", ids);

      const byNota: Record<string, ClassificacaoNF[]> = {};
      ((cls as any[]) || []).forEach((c: any) => {
        if (!byNota[c.nota_fiscal_id]) byNota[c.nota_fiscal_id] = [];
        byNota[c.nota_fiscal_id].push(c);
      });

      return (notas as any[]).map((n: any) => ({
        ...n,
        classificacoes: byNota[n.id] || [],
      }));
    },
    staleTime: 30 * 1000,
  });
}

export interface SubmitNFInput {
  contrato_id: string;
  competencia: string;
  numero: string;
  serie?: string;
  valor_total: number;
  data_emissao: string;
  descricao?: string;
  arquivo_url: string;
  classificacoes: {
    valor: number;
    categoria_valor: string;
    descricao_adicional?: string;
    justificativa?: string;
  }[];
  tarefa_id?: string;
}

export function useSubmeterNF() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: SubmitNFInput) => {
      const somaClass = input.classificacoes.reduce((s, c) => s + Number(c.valor), 0);
      if (Math.abs(somaClass - input.valor_total) > 0.01) {
        throw new Error(
          `Soma das classificações (R$ ${somaClass.toFixed(2)}) não bate com valor total (R$ ${input.valor_total.toFixed(2)})`
        );
      }

      const { data: nf, error: errNF } = await supabase
        .from("notas_fiscais_pj")
        .insert({
          contrato_id: input.contrato_id,
          numero: input.numero,
          serie: input.serie || null,
          valor: input.valor_total,
          data_emissao: input.data_emissao,
          competencia: input.competencia,
          descricao: input.descricao || null,
          arquivo_url: input.arquivo_url,
          status: "aguardando_validacao",
        } as any)
        .select("id")
        .single();

      if (errNF) throw errNF;

      const classRows = input.classificacoes.map((c, i) => ({
        nota_fiscal_id: (nf as any).id,
        valor: c.valor,
        categoria_valor: c.categoria_valor,
        descricao_adicional: c.descricao_adicional || null,
        justificativa: c.justificativa || null,
        ordem: i,
        created_by: user?.id,
      }));

      const { error: errCls } = await supabase
        .from("nf_pj_classificacoes" as any)
        .insert(classRows as any);

      if (errCls) throw errCls;

      if (input.tarefa_id) {
        const { error: errTarefa } = await supabase.rpc("concluir_tarefa", {
          p_tarefa_id: input.tarefa_id,
          p_evidencia_texto: `NF ${input.numero} submetida. Aguardando validação do RH.`,
          p_evidencia_url: input.arquivo_url ?? null,
        });
        if (errTarefa) throw errTarefa;
      }

      return (nf as any).id;
    },
    onSuccess: () => {
      toast.success("NF submetida com sucesso! Aguardando validação.");
      queryClient.invalidateQueries({ queryKey: ["minhas-notas"] });
      queryClient.invalidateQueries({ queryKey: ["tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["minhas-tarefas"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao submeter NF");
    },
  });
}
