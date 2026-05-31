import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Sprint C2 (29/04/2026) — Criação manual de usuário com modelo NOVO.
 *
 * Doutrina:
 *  - Marcos (Trabalhista): user_colaborador_link imutável após criação.
 *  - Marcos: vínculo é OPCIONAL em V1 (Flavio cravado).
 *  - Email de boas-vindas com link de recovery (user define senha no 1º acesso).
 *
 * Fluxo:
 *  1. Frontend coleta dados (3 passos)
 *  2. Hook chama Edge Function manage-user com action='create_user_v2'
 *  3. Edge Function cria user, profile, vínculo, grupos, e dispara email
 */

export type VinculoTipo = "clt" | "pj" | "externo" | null;

export interface CriarUsuarioV2Input {
  email: string;
  full_name: string;
  vinculo_tipo: VinculoTipo;
  colaborador_clt_id?: string | null;
  contrato_pj_id?: string | null;
  tipo_externo?: string | null;
  grupo_ids: string[];
}

export interface CriarUsuarioV2Output {
  success: boolean;
  user_id: string;
  email: string;
  vinculo_tipo: VinculoTipo;
  grupos_atribuidos: number;
  link_primeiro_acesso: string | null;
}

export function useCriarUsuarioV2() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarUsuarioV2Input): Promise<CriarUsuarioV2Output> => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: "create_user_v2",
          email: input.email.trim().toLowerCase(),
          full_name: input.full_name.trim(),
          vinculo_tipo: input.vinculo_tipo,
          colaborador_clt_id: input.colaborador_clt_id || null,
          contrato_pj_id: input.contrato_pj_id || null,
          tipo_externo: input.tipo_externo?.trim() || null,
          grupo_ids: input.grupo_ids,
        },
      });

      // Padrão Fetely: invoke nunca dá throw — checar .error e .data
      if (error) throw new Error(error.message || "Erro ao chamar Edge Function");
      if (!data) throw new Error("Resposta vazia da Edge Function");
      if (data.error) throw new Error(data.error);
      if (!data.success) throw new Error("Criação não confirmada pela Edge Function");

      return data as CriarUsuarioV2Output;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores-disponiveis"] });
      const grupos = data.grupos_atribuidos > 0
        ? ` em ${data.grupos_atribuidos} grupo(s)`
        : "";
      toast.success(`Usuário ${data.email} criado${grupos}. Copie o link de primeiro acesso abaixo.`);
    },
    onError: (e: Error) => {
      toast.error(`Erro ao criar usuário: ${e.message}`);
    },
  });
}

// =====================================================
// Lista de colaboradores DISPONÍVEIS pra vincular
// (sem user vinculado ainda — Marcos: vínculo imutável)
// =====================================================

export interface ColaboradorDisponivel {
  id: string;
  nome: string;
  email: string | null;
  tipo: "clt" | "pj";
  cargo?: string | null;
}

export function useColaboradoresDisponiveis(tipo: "clt" | "pj" | null) {
  return useQuery({
    queryKey: ["colaboradores-disponiveis", tipo],
    enabled: tipo === "clt" || tipo === "pj",
    queryFn: async (): Promise<ColaboradorDisponivel[]> => {
      if (tipo === "clt") {
        const { data, error } = await supabase
          .from("colaboradores_clt")
          .select("id, nome_completo, email_corporativo, email_pessoal, cargo, user_id")
          .is("user_id", null)
          .order("nome_completo");
        if (error) throw error;
        return (data || []).map((c) => ({
          id: c.id,
          nome: c.nome_completo,
          email: c.email_corporativo || c.email_pessoal || null,
          tipo: "clt" as const,
          cargo: c.cargo,
        }));
      } else if (tipo === "pj") {
        const { data, error } = await supabase
          .from("contratos_pj")
          .select("id, contato_nome, contato_email, tipo_servico, user_id")
          .is("user_id", null)
          .order("contato_nome");
        if (error) throw error;
        return (data || []).map((c) => ({
          id: c.id,
          nome: c.contato_nome,
          email: c.contato_email,
          tipo: "pj" as const,
          cargo: c.tipo_servico,
        }));
      }
      return [];
    },
  });
}

// =====================================================
// Lista resumida de grupos pra select multi
// =====================================================

export interface GrupoSelecionavel {
  id: string;
  nome: string;
  descricao: string | null;
  pre_cadastrado: boolean;
}

export function useGruposParaSelecao() {
  return useQuery({
    queryKey: ["grupos-para-selecao"],
    queryFn: async (): Promise<GrupoSelecionavel[]> => {
      const { data, error } = await supabase
        .from("grupos_acesso")
        .select("id, nome, descricao, pre_cadastrado")
        .eq("ativo", true)
        .order("pre_cadastrado", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data || []) as GrupoSelecionavel[];
    },
  });
}
