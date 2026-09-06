import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * ESTADO do título a pagar — o banco manda (decisão "opção A", 02/09/2026).
 *
 * Rótulo, cor e ordem vêm de `titulo_pagar_estado_dim`. As ações disponíveis
 * vêm de `vw_titulo_pagar_acoes`, que lê `titulo_pagar_transicao_dim`:
 * AUSÊNCIA DE LINHA = BOTÃO NÃO EXISTE. Nunca montar botão por condicional no
 * componente — se falta uma ação, a correção é na tabela, não no TSX.
 *
 * Este é o eixo ESTADO. O eixo PROVAS (NF, movimentação, comprovante) é
 * separado e independente: prova não é posição no processo.
 */

export type TituloPagarEstado = {
  slug: string;
  rotulo: string;
  descricao: string | null;
  ordem: number;
  cor: string | null;
  terminal: boolean;
  aposentado: boolean;
  exige_data_pretendida: boolean;
  sla_dias: number | null;
};

export type TituloPagarAcao = {
  cpr_id: string;
  de: string;
  para: string;
  rotulo_acao: string;
  exige_motivo: boolean;
  reversivel: boolean;
  para_rotulo: string;
  para_cor: string | null;
  para_ordem: number;
  exige_data_pretendida: boolean;
  exige_data_pagamento: boolean;
  exige_bola_redonda: boolean;
};

/** Dimensão de estados. Muda raramente — cache longo. */
export function useTituloPagarEstados(incluirAposentados = false) {
  return useQuery({
    queryKey: ["titulo-pagar-estados", { incluirAposentados }],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("titulo_pagar_estado_dim")
        .select("slug, rotulo, descricao, ordem, cor, terminal, aposentado, exige_data_pretendida, sla_dias")
        .order("ordem");
      if (!incluirAposentados) q = q.eq("aposentado", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TituloPagarEstado[];
    },
  });
}

/** Ações legais dos títulos informados. Sem ids, não consulta. */
export function useTituloPagarAcoes(cprIds: string[]) {
  const ids = [...new Set(cprIds)].filter(Boolean).sort();
  return useQuery({
    queryKey: ["titulo-pagar-acoes", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_titulo_pagar_acoes")
        .select("cpr_id, de, para, rotulo_acao, exige_motivo, reversivel, para_rotulo, para_cor, para_ordem, exige_data_pretendida, exige_data_pagamento, exige_bola_redonda")
        .in("cpr_id", ids)
        .order("para_ordem");
      if (error) throw error;
      const porTitulo = new Map<string, TituloPagarAcao[]>();
      for (const a of (data || []) as TituloPagarAcao[]) {
        const lista = porTitulo.get(a.cpr_id) ?? [];
        lista.push(a);
        porTitulo.set(a.cpr_id, lista);
      }
      return porTitulo;
    },
  });
}

/**
 * Porta ÚNICA de mudança de estado. Chama `fn_titulo_pagar_transicionar`.
 *
 * FAIL-LOUD: await de verdade, throw no erro, toast para o usuário. Nunca
 * fire-and-forget. Não existe caminho alternativo — `UPDATE` direto em
 * `status` pelo cliente está proibido (MECANISMO-ANTES-DE-UPDATE).
 */
export function useTituloPagarTransicionar() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      cprId: string;
      para: string;
      motivo?: string;
      dataPretendida?: string | null;
      dataPagamento?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_titulo_pagar_transicionar", {
        p_cpr_id: p.cprId,
        p_para: p.para,
        p_motivo: p.motivo ?? null,
        p_data_pretendida: p.dataPretendida ?? null,
        p_data_pagamento: p.dataPagamento ?? null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Falha ao mudar o estado do título");
      return data as {
        ok: true; cpr_id: string; de: string; para: string;
        acao: string; data_pretendida: string | null;
      };
    },
    onSuccess: (r) => {
      toast.success(`${r.acao} — título em "${r.para}"`);
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", r.cpr_id] });
      qc.invalidateQueries({ queryKey: ["titulo-pagar-acoes"] });
      qc.invalidateQueries({ queryKey: ["cp-historico"] });
    },
    onError: (e: Error) => {
      // A RPC devolve a lista de caminhos válidos na mensagem — mostrar inteira.
      toast.error(e.message || String(e), { duration: 6000 });
    },
  });
}
