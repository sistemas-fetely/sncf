import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useUrlAssinada } from "@/lib/storage/arquivoPrivado";

export interface Reporte {
  id: string;
  reportado_por: string | null;
  reportado_em: string;
  rota: string;
  titulo_tela: string | null;
  user_agent: string | null;
  viewport_width: number | null;
  tipo_valor: string;
  descricao: string;
  passos_reproduzir: string | null;
  status_valor: string;
  prioridade: string;
  atribuido_a: string | null;
  resolvido_em: string | null;
  resposta_admin: string | null;
  updated_at: string;
}

export interface ReporteInput {
  tipo_valor: string;
  descricao: string;
  passos_reproduzir?: string;
  titulo_tela?: string;
  imagem_url?: string;
}

export function useCriarReporte() {
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReporteInput) => {
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await (supabase.from("sistema_reportes") as any).insert({
        reportado_por: user.id,
        rota: location.pathname + location.search,
        titulo_tela: input.titulo_tela || document.title,
        user_agent: navigator.userAgent,
        viewport_width: window.innerWidth,
        tipo_valor: input.tipo_valor,
        descricao: input.descricao.trim(),
        passos_reproduzir: input.passos_reproduzir?.trim() || null,
        imagem_url: input.imagem_url || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report enviado! Obrigado por colaborar. 🙏");
      queryClient.invalidateQueries({ queryKey: ["reportes-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["meus-reportes"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao enviar report");
    },
  });
}

/**
 * Leitura da imagem de um report (bucket privado, tela autenticada).
 */
export function useImagemReporte(imagemUrl: string | null | undefined) {
  return useUrlAssinada("sistema-reportes", imagemUrl);
}

export function useReportesInbox(filtroStatus?: string) {
  return useQuery({
    queryKey: ["reportes-inbox", filtroStatus],
    queryFn: async (): Promise<Reporte[]> => {
      let q = (supabase.from("sistema_reportes") as any)
        .select("*")
        .order("reportado_em", { ascending: false });
      if (filtroStatus) q = q.eq("status_valor", filtroStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Reporte[];
    },
    staleTime: 30 * 1000,
  });
}

export function useMeusReportes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meus-reportes", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Reporte[]> => {
      const { data, error } = await (supabase.from("sistema_reportes") as any)
        .select("*")
        .order("reportado_em", { ascending: false });
      if (error) throw error;
      return (data || []) as Reporte[];
    },
  });
}

export function useAtualizarReporte() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status_valor?: string;
      prioridade?: string;
      atribuido_a?: string | null;
      resposta_admin?: string | null;
    }) => {
      const update: any = {};
      if (payload.status_valor !== undefined) update.status_valor = payload.status_valor;
      if (payload.prioridade !== undefined) update.prioridade = payload.prioridade;
      if (payload.atribuido_a !== undefined) update.atribuido_a = payload.atribuido_a;
      if (payload.resposta_admin !== undefined) update.resposta_admin = payload.resposta_admin;
      if (
        payload.status_valor === "resolvido" ||
        payload.status_valor === "duplicado" ||
        payload.status_valor === "nao_procede"
      ) {
        update.resolvido_em = new Date().toISOString();
      }

      const { error } = await (supabase.from("sistema_reportes") as any)
        .update(update)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report atualizado");
      queryClient.invalidateQueries({ queryKey: ["reportes-inbox"] });
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao atualizar"),
  });
}
