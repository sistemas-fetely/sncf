import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { adaptarParaTitulo, type LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";

/**
 * KANBAN-DE-COBRANÇA (06/10/2026). BANCO PROTEGE ESTADO, RPC PROTEGE UX:
 * a tela lê `vw_cobranca_kanban` e só move pela RPC `fn_cobranca_mover_raia`.
 */
export interface LinhaKanban {
  titulo_id: string;
  raia_codigo: string;
  raia_rotulo: string;
  raia_ordem: number;
  raia_cor: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  pausa_regua: boolean;
  exige_data_retorno: boolean;
  responsavel_user_id: string | null;
  responsavel_nome: string | null;
  retorno_em: string | null;
  pausa_regua_automatica: boolean | null;
  na_raia_desde: string | null;
  dias_na_raia: number | null;
}

export interface RaiaKanban {
  codigo: string;
  rotulo: string;
  ordem: number;
  cor: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  pausa_regua: boolean;
  exige_data_retorno: boolean;
  descricao: string | null;
  ativo: boolean;
}

export type CardKanban = TituloCobranca & { _kanban: LinhaKanban };

export interface PessoaKanban {
  user_id: string;
  full_name: string;
}

export interface MovimentoRaia {
  id: string;
  titulo_id: string;
  raia_de: string | null;
  raia_para: string | null;
  responsavel_de: string | null;
  responsavel_para: string | null;
  retorno_em: string | null;
  origem: string;
  observacao: string | null;
  executado_por: string | null;
  executado_em: string;
}

export const ORIGEM_MOVIMENTO_LABEL: Record<string, string> = {
  humano: "manual",
  regua_entrada: "entrada automática",
  regua_retorno: "retorno vencido",
  regua_saida: "saiu do kanban",
};

/** CARTÃO-NÃO-VENCE-PROVA-VENCE — mesmo filtro de exibição da ReguaTab. */
const semCartao = (t: TituloCobranca) =>
  ((t as any)._mesa as LinhaMesa | undefined)?.instrumento !== "cartao";

export function useCobrancaKanban() {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "cobranca-kanban"],
    queryFn: async (): Promise<{ cards: CardKanban[]; idsNoKanban: Set<string> }> => {
      const { data: kanban, error } = await (supabase as any)
        .from("vw_cobranca_kanban")
        .select("*");
      if (error) throw error;
      const linhas = (kanban ?? []) as LinhaKanban[];
      const idsNoKanban = new Set(linhas.map((l) => l.titulo_id));
      if (linhas.length === 0) return { cards: [], idsNoKanban };

      // SEM filtro de pausa: cards em negociação/aguardando estão pausados e não podem sumir.
      const ids = [...idsNoKanban];
      const mesa: LinhaMesa[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e2 } = await (supabase as any)
          .from("vw_cobranca_mesa")
          .select("*")
          .in("titulo_id", ids.slice(i, i + 200));
        if (e2) throw e2;
        mesa.push(...((data ?? []) as LinhaMesa[]));
      }
      const porId = new Map(linhas.map((l) => [l.titulo_id, l]));
      const cards = mesa
        .map(adaptarParaTitulo)
        .filter(semCartao)
        .map((t) => ({ ...t, _kanban: porId.get(t.id)! }) as CardKanban)
        .filter((c) => !!c._kanban);
      return { cards, idsNoKanban };
    },
    staleTime: 30_000,
  });
}

export function useRaiasKanban(incluirInativas = false) {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "cobranca-kanban", "raias", incluirInativas],
    queryFn: async (): Promise<RaiaKanban[]> => {
      let q = (supabase as any)
        .from("cobranca_raia_dim")
        .select("*, departamentos(nome)")
        .order("ordem", { ascending: true });
      if (!incluirInativas) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        departamento_nome: r.departamentos?.nome ?? null,
      })) as RaiaKanban[];
    },
    staleTime: 60_000,
  });
}

export function usePessoasKanban() {
  return useQuery({
    queryKey: ["cobranca-kanban-pessoas"],
    queryFn: async (): Promise<PessoaKanban[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("approved", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PessoaKanban[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useMovimentosRaia(tituloId: string | null | undefined) {
  return useQuery({
    enabled: !!tituloId,
    queryKey: ["titulos-cobranca", "cobranca-mesa", "cobranca-kanban", "movimentos", tituloId],
    queryFn: async (): Promise<MovimentoRaia[]> => {
      const { data, error } = await (supabase as any)
        .from("cobranca_raia_movimento")
        .select("*")
        .eq("titulo_id", tituloId)
        .order("executado_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as MovimentoRaia[];
    },
    staleTime: 30_000,
  });
}

export interface MoverRaiaParams {
  tituloId: string;
  raiaCodigo: string;
  responsavelUserId?: string | null;
  retornoEm?: string | null;
  observacao?: string | null;
}

/** Única porta de escrita de raia. Lança o erro real do banco (FAIL-LOUD). */
export async function moverRaia(p: MoverRaiaParams): Promise<{
  ok: boolean;
  alterado: boolean;
  raia: string;
  regua_pausada: boolean;
  retorno_em: string | null;
}> {
  const { data, error } = await (supabase as any).rpc("fn_cobranca_mover_raia", {
    p_titulo_id: p.tituloId,
    p_raia_codigo: p.raiaCodigo,
    p_responsavel_user_id: p.responsavelUserId ?? null,
    p_retorno_em: p.retornoEm ?? null,
    p_observacao: p.observacao ?? null,
  });
  if (error) throw new Error(error.message);
  if (data && data.ok === false) throw new Error(data.erro ?? "Não foi possível mover o título.");
  return data;
}
