import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OcorrenciaDeparaRow {
  id: string;
  transportadora_id: string;
  texto_padrao: string;
  codigo: string;
  ativo: boolean;
  created_at: string;
}

export interface OcorrenciaTipoRow {
  id: string;
  codigo: string;
  descricao: string;
  classe: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export function useOcorrenciaDepara(transportadoraId: string | null) {
  const qc = useQueryClient();

  const listaKey = ["logistica", "ocorrencia-depara", transportadoraId];
  const tiposKey = ["logistica", "ocorrencia-tipos", transportadoraId];

  const lista = useQuery({
    queryKey: listaKey,
    enabled: !!transportadoraId,
    queryFn: async (): Promise<OcorrenciaDeparaRow[]> => {
      const { data, error } = await sb
        .from("transp_ocorrencia_depara")
        .select("id, transportadora_id, texto_padrao, codigo, ativo, created_at")
        .eq("transportadora_id", transportadoraId)
        .order("texto_padrao");
      if (error) throw error;
      return (data ?? []) as OcorrenciaDeparaRow[];
    },
  });

  const tipos = useQuery({
    queryKey: tiposKey,
    enabled: !!transportadoraId,
    queryFn: async (): Promise<OcorrenciaTipoRow[]> => {
      const { data, error } = await sb
        .from("transp_ocorrencia_tipo")
        .select("id, codigo, descricao, classe")
        .eq("transportadora_id", transportadoraId)
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as OcorrenciaTipoRow[];
    },
  });

  function handleErr(e: unknown, acao: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = (e as any)?.message ?? String(e);
    if (msg.toLowerCase().includes("duplicate") || msg.includes("23505")) {
      toast.error("Já existe uma regra com esse texto para essa transportadora.");
    } else {
      toast.error(`Erro ao ${acao}: ${msg}`);
    }
  }

  const criar = useMutation({
    mutationFn: async (input: { texto_padrao: string; codigo: string; ativo: boolean }) => {
      const { error } = await sb.from("transp_ocorrencia_depara").insert({
        transportadora_id: transportadoraId,
        texto_padrao: input.texto_padrao.toUpperCase().trim(),
        codigo: input.codigo,
        ativo: input.ativo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra criada");
      qc.invalidateQueries({ queryKey: listaKey });
    },
    onError: (e) => handleErr(e, "criar"),
  });

  const editar = useMutation({
    mutationFn: async (input: { id: string; texto_padrao: string; codigo: string; ativo: boolean }) => {
      const { error } = await sb
        .from("transp_ocorrencia_depara")
        .update({
          texto_padrao: input.texto_padrao.toUpperCase().trim(),
          codigo: input.codigo,
          ativo: input.ativo,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra atualizada");
      qc.invalidateQueries({ queryKey: listaKey });
    },
    onError: (e) => handleErr(e, "editar"),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (input: { id: string; ativo: boolean }) => {
      const { error } = await sb
        .from("transp_ocorrencia_depara")
        .update({ ativo: input.ativo })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listaKey });
    },
    onError: (e) => handleErr(e, "alterar status"),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("transp_ocorrencia_depara").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra excluída");
      qc.invalidateQueries({ queryKey: listaKey });
    },
    onError: (e) => handleErr(e, "excluir"),
  });

  return { lista, tipos, criar, editar, toggleAtivo, excluir };
}
