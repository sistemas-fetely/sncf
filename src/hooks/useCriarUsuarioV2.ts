import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Sprint C2 (29/04/2026) — Criação manual de usuário com modelo NOVO.
 *
 * Doutrina:
 *  - UM TRILHO SÓ: vínculo de usuário a pessoa acontece exclusivamente pelo botão
 *    "Vincular" da Mesa de Usuários, via RPC `mesa_vincular_usuario`. O wizard NÃO
 *    vincula mais a CLT/PJ aqui.
 *  - colaboradores_clt / contratos_pj são o modelo VELHO de pessoas; não usamos.
 *  - Email de boas-vindas com link de recovery (user define senha no 1º acesso).
 *
 * Fluxo:
 *  1. Frontend coleta dados (2 passos: Dados + Grupos)
 *  2. Hook chama Edge Function manage-user com action='create_user_v2'
 *  3. Edge Function cria user, profile e grupos, e dispara email
 */

export interface CriarUsuarioV2Input {
  email: string;
  full_name: string;
  grupo_ids: string[];
}

export interface CriarUsuarioV2Output {
  success: boolean;
  user_id: string;
  email: string;
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
