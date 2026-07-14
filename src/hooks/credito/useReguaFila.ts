import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";

export type PerfilCadencia = "padrao" | "bandeira_amarela" | "vip";
export type CanalRegua =
  | "email"
  | "whatsapp"
  | "telefone"
  | "carta"
  | "cartorio"
  | "advogado";

export interface ReguaEtapa {
  id: string;
  codigo: string;
  ordem: number;
  dias_offset: number;
  perfil_cadencia: PerfilCadencia;
  canal_sugerido: CanalRegua;
  descricao_acao: string;
  template_mensagem: string | null;
  responsavel_default: string | null;
  requer_aprovacao: boolean;
  custo_externo_previsto: number | null;
  ativa: boolean;
}

export interface AcaoReguaLog {
  id: string;
  titulo_id: string;
  etapa_codigo: string;
  dias_offset: number;
  perfil_usado: PerfilCadencia;
  canal_efetivo: CanalRegua | null;
  mensagem_snapshot: string | null;
  resultado: "enviada" | "pulada" | "pausou_regua" | "abriu_renegociacao";
  observacao: string | null;
  executada_por: string | null;
  executada_em: string;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function useReguaEtapas() {
  return useQuery({
    queryKey: ["regua-etapas"],
    queryFn: async (): Promise<ReguaEtapa[]> => {
      const { data, error } = await (supabase as any)
        .from("regua_cobranca_etapas")
        .select("*")
        .order("perfil_cadencia", { ascending: true })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReguaEtapa[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useReguaFilaHoje() {
  return useQuery({
    queryKey: ["titulos-cobranca", "regua-fila-hoje"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const hoje = hojeISO();
      const { data, error } = await (supabase as any)
        .from("vw_titulos_cobranca")
        .select("*")
        .lte("data_proxima_acao_regua", hoje)
        .eq("pausa_regua_automatica", false)
        .in("status_gestao", ["atrasado", "vence_hoje", "a_vencer"])
        .order("dias_atraso", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TituloCobranca[];
    },
    staleTime: 30_000,
  });
}

export function useReguaPausados() {
  return useQuery({
    queryKey: ["titulos-cobranca", "regua-pausados"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulos_cobranca")
        .select("*")
        .eq("pausa_regua_automatica", true)
        .in("status_gestao", ["atrasado", "vence_hoje", "a_vencer"])
        .order("dias_atraso", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TituloCobranca[];
    },
    staleTime: 30_000,
  });
}

export function useHistoricoReguaTitulo(tituloId: string | null | undefined, limit = 5) {
  return useQuery({
    enabled: !!tituloId,
    queryKey: ["regua-log", tituloId, limit],
    queryFn: async (): Promise<AcaoReguaLog[]> => {
      const { data, error } = await (supabase as any)
        .from("regua_cobranca_acoes_log")
        .select("*")
        .eq("titulo_id", tituloId)
        .order("executada_em", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AcaoReguaLog[];
    },
    staleTime: 30_000,
  });
}

/**
 * Resolve a etapa aplicável para um título dado o conjunto de etapas ativas.
 * Perfil: bandeira_amarela > vip > padrao (com fallback para padrao).
 * Escolhe a linha com maior dias_offset <= dias_atraso.
 * Para títulos a_vencer (dias_atraso <= 0), aceita etapas com dias_offset negativo aplicáveis.
 */
export function resolverEtapaParaTitulo(
  titulo: TituloCobranca,
  etapas: ReguaEtapa[],
): ReguaEtapa | null {
  const ativas = etapas.filter((e) => e.ativa);
  const perfilPreferido: PerfilCadencia = titulo.flag_bandeira_amarela
    ? "bandeira_amarela"
    : titulo.vip_relacionamento
      ? "vip"
      : "padrao";

  const tentarPerfil = (perfil: PerfilCadencia): ReguaEtapa | null => {
    const doPerfil = ativas.filter((e) => e.perfil_cadencia === perfil);
    if (doPerfil.length === 0) return null;
    const atraso = titulo.dias_atraso ?? 0;
    // Etapas aplicáveis = dias_offset <= atraso.
    // Se atraso negativo (a_vencer), matcha lembretes pré-vencimento (dias_offset negativo mais próximo de 0 mas ainda <= atraso).
    const aplicaveis = doPerfil.filter((e) => e.dias_offset <= atraso);
    if (aplicaveis.length === 0) return null;
    // Pega a maior dias_offset entre as aplicáveis (a mais recente na régua).
    return aplicaveis.reduce((a, b) => (b.dias_offset > a.dias_offset ? b : a));
  };

  return (
    tentarPerfil(perfilPreferido) ??
    (perfilPreferido !== "padrao" ? tentarPerfil("padrao") : null)
  );
}
