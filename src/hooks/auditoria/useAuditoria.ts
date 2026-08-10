/**
 * Camada de dados do motor de auditoria. Leituras: vw_auditoria_achado,
 * vw_auditoria_painel, dims e histórico. Escritas: SEMPRE via RPC
 * (fn_auditoria_tratar_achado, fn_auditoria_rodar, fn_auditoria_regra_testar).
 * FAIL-LOUD: todo erro é lançado e vira toast na tela.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Achado, Execucao, RegraPainel } from "@/lib/auditoria/meta";
import type { Tables } from "@/integrations/supabase/types";

export type FiltrosAchados = {
  modulo: string | null;
  severidade: string | null;
  situacao: string | null;
  dono: string | null;
  regra: string | null;
  incluirTratadosESumidos: boolean;
  busca: string;
};

export const CHAVES_AUDITORIA = {
  achados: ["auditoria", "achados"] as const,
  painel: ["auditoria", "painel"] as const,
  execucoes: ["auditoria", "execucoes"] as const,
  eventos: ["auditoria", "eventos"] as const,
  regras: ["auditoria", "regras"] as const,
};

export function useAchadosAuditoria(f: FiltrosAchados) {
  return useQuery({
    queryKey: [...CHAVES_AUDITORIA.achados, f],
    queryFn: async (): Promise<Achado[]> => {
      let q = supabase.from("vw_auditoria_achado").select("*");
      if (!f.incluirTratadosESumidos) q = q.eq("esta_vivo", true);
      if (f.modulo) q = q.eq("modulo_slug", f.modulo);
      if (f.severidade) q = q.eq("severidade", f.severidade);
      if (f.situacao) q = q.eq("situacao", f.situacao);
      if (f.dono) q = q.eq("dono_user_id", f.dono);
      if (f.regra) q = q.eq("regra_slug", f.regra);
      const termo = f.busca.trim();
      if (termo) {
        const t = `%${termo}%`;
        q = q.or(
          `id_externo.ilike.${t},parceiro.ilike.${t},detalhe.ilike.${t},regra_titulo.ilike.${t}`,
        );
      }
      const { data, error } = await q
        .order("severidade_peso", { ascending: false, nullsFirst: false })
        .order("valor", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePainelAuditoria() {
  return useQuery({
    queryKey: CHAVES_AUDITORIA.painel,
    queryFn: async (): Promise<RegraPainel[]> => {
      const { data, error } = await supabase
        .from("vw_auditoria_painel")
        .select("*")
        .order("modulo_nome", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExecucoesAuditoria() {
  return useQuery({
    queryKey: CHAVES_AUDITORIA.execucoes,
    queryFn: async (): Promise<Execucao[]> => {
      const { data, error } = await supabase
        .from("auditoria_execucao")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEventosAchado(achadoId: string | null) {
  return useQuery({
    queryKey: [...CHAVES_AUDITORIA.eventos, achadoId],
    enabled: !!achadoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auditoria_achado_evento")
        .select("id, tipo, de, para, nota, created_at")
        .eq("achado_id", achadoId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDimsAuditoria() {
  return useQuery({
    queryKey: ["auditoria", "dims"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [sev, sit, ent, mod] = await Promise.all([
        supabase
          .from("auditoria_severidade_dim")
          .select("codigo, rotulo, peso, ordem")
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("auditoria_situacao_dim")
          .select("codigo, rotulo, atribuivel_por_humano, eh_terminal, ordem")
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("auditoria_entidade_dim")
          .select("codigo, rotulo, ordem")
          .eq("ativo", true)
          .order("ordem"),
        supabase.from("sncf_modulo").select("slug, nome").eq("ativo", true).order("ordem"),
      ]);
      const erro = sev.error || sit.error || ent.error || mod.error;
      if (erro) throw erro;
      return {
        severidades: sev.data ?? [],
        situacoes: sit.data ?? [],
        entidades: ent.data ?? [],
        modulos: mod.data ?? [],
      };
    },
  });
}

export function useDonosAuditoria() {
  return useQuery({
    queryKey: ["auditoria", "donos"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("approved", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegrasAuditoria() {
  return useQuery({
    queryKey: CHAVES_AUDITORIA.regras,
    queryFn: async (): Promise<Tables<"auditoria_regra">[]> => {
      const { data, error } = await supabase
        .from("auditoria_regra")
        .select("*")
        .order("modulo_slug")
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function assertOk(payload: unknown) {
  const r = (payload ?? {}) as { ok?: boolean; erro?: string };
  if (r.ok === false) throw new Error(r.erro || "A operação foi recusada pelo banco.");
  return r;
}

export function useTratarAchado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      achadoId: string;
      situacao?: string | null;
      nota?: string | null;
      donoUserId?: string | null;
      limparDono?: boolean;
      userId: string;
    }) => {
      const { data, error } = await supabase.rpc("fn_auditoria_tratar_achado", {
        p_achado_id: args.achadoId,
        p_situacao: args.situacao ?? undefined,
        p_nota: args.nota ?? undefined,
        p_dono_user_id: args.donoUserId ?? undefined,
        p_limpar_dono: args.limparDono ?? false,
        p_user_id: args.userId,
      });
      if (error) throw error;
      return assertOk(data);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.achados }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.eventos }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.painel }),
      ]);
    },
  });
}

export type ResumoRodada = {
  regras_rodadas?: number;
  regras_com_erro?: number;
  achados_novos?: number;
  achados_reaparecidos?: number;
  achados_sumiram?: number;
  achados_vivos?: number;
  duracao_ms?: number;
  interrompida?: boolean;
};

export function useRodarAuditoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; regraSlug?: string | null }) => {
      const { data, error } = await supabase.rpc("fn_auditoria_rodar", {
        p_origem: "manual",
        p_user_id: args.userId,
        p_regra_slug: args.regraSlug ?? undefined,
        p_teto_ms: 120000,
      });
      if (error) throw error;
      return (data ?? {}) as ResumoRodada;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.achados }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.painel }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.execucoes }),
        qc.invalidateQueries({ queryKey: ["auditoria", "saude"] }),
      ]);
    },
  });
}

export type ResultadoTeste = {
  ok?: boolean;
  linhas?: number;
  contagem?: number;
  duracao_ms?: number;
  colunas?: string[];
  amostra?: Record<string, unknown>[];
  aviso?: string;
  erro?: string;
};

export function useTestarRegra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string): Promise<ResultadoTeste> => {
      const { data, error } = await supabase.rpc("fn_auditoria_regra_testar", {
        p_slug: slug,
        p_limite: 20,
      });
      if (error) throw error;
      return (data ?? {}) as ResultadoTeste;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.regras }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.painel }),
      ]);
    },
  });
}

export function useSalvarRegra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      criando: boolean;
      valores: Partial<Tables<"auditoria_regra">> & { slug: string };
    }) => {
      if (args.criando) {
        const { error } = await supabase
          .from("auditoria_regra")
          // regra nasce inativa — ativação só depois de teste válido
          .insert({ ...args.valores, ativo: false } as never);
        if (error) throw error;
        return;
      }
      const { slug, ...resto } = args.valores;
      const { error } = await supabase
        .from("auditoria_regra")
        .update(resto as never)
        .eq("slug", slug);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.regras }),
        qc.invalidateQueries({ queryKey: CHAVES_AUDITORIA.painel }),
      ]);
    },
  });
}
