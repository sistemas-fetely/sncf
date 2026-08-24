import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { adaptarParaTitulo, type LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";

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

/**
 * Fonte da régua = vw_cobranca_mesa. O gate de elegibilidade vive no banco
 * (`regua_elegivel`); a tela não recalcula nada.
 */
export function useReguaFilaHoje() {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "regua-fila-hoje"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .eq("regua_elegivel", true)
        .eq("pausa_regua_automatica", false)
        .order("data_proxima_acao_regua", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as LinhaMesa[]).map(adaptarParaTitulo);
    },
    staleTime: 30_000,
  });
}


/**
 * VENCIDO-NAO-DESAPARECE: títulos vencidos que a régua não pode escalar por
 * falta de lastro. O banco decide (regua_elegivel=false); a tela só mostra.
 */
export function useReguaVencidoForaDaFila() {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "regua-vencido-fora"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .gt("dias_atraso", 0)
        .eq("regua_elegivel", false)
        .neq("fila", "NAO_COBRAVEL")
        .order("dias_atraso", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as LinhaMesa[]).map(adaptarParaTitulo);
    },
    staleTime: 30_000,
  });
}


export function useReguaPausados() {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "regua-pausados"],
    queryFn: async (): Promise<TituloCobranca[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_cobranca_mesa")
        .select("*")
        .eq("regua_elegivel", true)
        .eq("pausa_regua_automatica", true)
        .order("dias_atraso", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as LinhaMesa[]).map(adaptarParaTitulo);
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
 * A etapa aplicável é decidida pelo BANCO (`vw_cobranca_mesa.etapa_atual_codigo`),
 * que já exclui as etapas cumpridas — mesma regra da RPC `registrar_acao_regua`.
 * A tela só traduz código+offset para o objeto da etapa.
 *
 * O cálculo puro por `dias_atraso` continua como fallback para títulos que não
 * vieram da view. Ele NÃO conhece o log de ações e por isso oferece etapa já
 * cumprida — foi essa divergência que gerou lembrete duplicado (12/08/2026).
 */
export function resolverEtapaParaTitulo(
  titulo: TituloCobranca,
  etapas: ReguaEtapa[],
): ReguaEtapa | null {
  const ativas = etapas.filter((e) => e.ativa);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mesa = (titulo as any)._mesa as LinhaMesa | undefined;

  if (mesa && "etapa_atual_codigo" in mesa) {
    if (!mesa.etapa_atual_codigo) return null;
    return (
      ativas.find(
        (e) =>
          e.codigo === mesa.etapa_atual_codigo &&
          e.dias_offset === Number(mesa.etapa_atual_offset),
      ) ?? null
    );
  }

  const perfilPreferido: PerfilCadencia = titulo.flag_bandeira_amarela
    ? "bandeira_amarela"
    : titulo.vip_relacionamento
      ? "vip"
      : "padrao";

  const tentarPerfil = (perfil: PerfilCadencia): ReguaEtapa | null => {
    const doPerfil = ativas.filter((e) => e.perfil_cadencia === perfil);
    if (doPerfil.length === 0) return null;
    const atraso = titulo.dias_atraso ?? 0;
    const aplicaveis = doPerfil.filter((e) => e.dias_offset <= atraso);
    if (aplicaveis.length === 0) return null;
    return aplicaveis.reduce((a, b) => (b.dias_offset > a.dias_offset ? b : a));
  };

  return (
    tentarPerfil(perfilPreferido) ??
    (perfilPreferido !== "padrao" ? tentarPerfil("padrao") : null)
  );
}

/** Última etapa efetivamente cumprida, para o caminho de reenvio consciente. */
export function etapaUltimaDoTitulo(
  titulo: TituloCobranca,
  etapas: ReguaEtapa[],
): { etapa: ReguaEtapa; em: string | null } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mesa = (titulo as any)._mesa as LinhaMesa | undefined;
  if (!mesa?.etapa_ultima_codigo) return null;
  const etapa = etapas.find(
    (e) =>
      e.codigo === mesa.etapa_ultima_codigo &&
      e.dias_offset === Number(mesa.etapa_ultima_offset),
  );
  if (!etapa) return null;
  return { etapa, em: mesa.etapa_ultima_em ?? null };
}
