import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AnaliseDetalheCompleto,
  AnaliseListItem,
  AnaliseScore,
  AnaliseTransicao,
  KpiFinanceiro,
  KpiFinanceiroGrupo,
  ParceiroMarco,
  SocioParceiro,
  TituloCredito,
} from "@/types/credito";

export function useAnaliseDetalhe(analiseId: string | undefined) {
  return useQuery({
    queryKey: ["analise-detalhe", analiseId],
    enabled: !!analiseId,
    staleTime: 10 * 1000,
    queryFn: async (): Promise<AnaliseDetalheCompleto & { scoresHistoricoCount: number }> => {
      if (!analiseId) throw new Error("analiseId obrigatório");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: analiseData, error: aErr } = await sb
        .from("analises_credito")
        .select(`
          *,
          pedido:pedidos(*),
          parceiro:parceiros_comerciais(*)
        `)
        .eq("id", analiseId)
        .single();
      if (aErr) throw aErr;

      const parceiroId = analiseData.parceiro_id;
      const grupoId = analiseData.parceiro?.grupo_economico_id;

      const { data: sociosData } = await sb
        .from("socios_parceiro")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .is("desligado_em", null);

      const { data: scoresData } = await sb
        .from("analise_credito_scores")
        .select("*")
        .eq("analise_id", analiseId)
        .order("anexado_em", { ascending: false });

      const { data: transicoesData } = await sb
        .from("analise_credito_transicoes")
        .select("*")
        .eq("analise_id", analiseId)
        .order("criado_em", { ascending: true });

      const { data: kpisData } = await sb
        .from("v_credito_resumo_financeiro")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();

      let kpisGrupo: KpiFinanceiroGrupo | null = null;
      if (grupoId) {
        const { data: kg } = await sb
          .from("v_credito_resumo_financeiro_grupo")
          .select("*")
          .eq("grupo_economico_id", grupoId)
          .maybeSingle();
        kpisGrupo = (kg as KpiFinanceiroGrupo) || null;
      }

      const { data: anterioresData } = await sb
        .from("analises_credito")
        .select(`
          id, pedido_id, parceiro_id, estagio_atual, status_final,
          criado_em, decidido_em, analise_ia_confianca, analise_ia_processada_em,
          limite_concedido, prazo_max_dias, validade_ate, perfil_aplicado,
          parceiro:parceiros_comerciais(cnpj, razao_social),
          pedido:pedidos(id_externo, valor_liquido, condicao_solicitada)
        `)
        .eq("parceiro_id", parceiroId)
        .neq("id", analiseId)
        .order("criado_em", { ascending: false })
        .limit(20);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anteriores: AnaliseListItem[] = (anterioresData || []).map((r: any) => ({
        id: r.id,
        pedido_id: r.pedido_id,
        parceiro_id: r.parceiro_id,
        estagio_atual: r.estagio_atual,
        status_final: r.status_final,
        criado_em: r.criado_em,
        decidido_em: r.decidido_em,
        parceiro_cnpj: r.parceiro?.cnpj ?? null,
        parceiro_razao: r.parceiro?.razao_social ?? null,
        pedido_valor_liquido: Number(r.pedido?.valor_liquido ?? 0),
        pedido_condicao: r.pedido?.condicao_solicitada ?? "",
        pedido_id_externo: r.pedido?.id_externo ?? "",
        analise_ia_confianca: r.analise_ia_confianca,
        analise_ia_processada_em: r.analise_ia_processada_em,
        limite_concedido: r.limite_concedido == null ? null : Number(r.limite_concedido),
        prazo_max_dias: r.prazo_max_dias ?? null,
        validade_ate: r.validade_ate ?? null,
        perfil_aplicado: r.perfil_aplicado ?? null,
      })) as AnaliseListItem[];

      const { data: marcosData } = await sb
        .from("v_parceiro_timeline")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("criado_em", { ascending: false })
        .limit(50);

      // Drill-down dos KPIs financeiros — mesma base da v_credito_resumo_financeiro
      const { data: titulosData } = await sb
        .from("vw_titulos_cobranca")
        .select(
          "id, numero_titulo, numero_parcela, total_parcelas, eh_entrada, pedido_id, pedido_id_externo, nf_id, nf_numero, tipo_pagamento, valor_efetivo, data_vencimento_original, data_vencimento_atual, data_pagamento, data_pagamento_banco, status_gestao, subestado_atraso, titulo_renegociado_origem_id, modalidade_renegociacao",
        )
        .eq("parceiro_id", parceiroId)
        .order("data_vencimento_atual", { ascending: true });

      // Bureaus reaproveitáveis: outras análises do mesmo cliente, dentro da janela
      // de validade (parâmetro bureau_validade_dias), deduplicados por fonte.
      const { data: paramValidade } = await sb
        .from("parametros")
        .select("valor")
        .eq("categoria", "bureau_validade_dias")
        .eq("ativo", true)
        .order("ordem")
        .limit(1)
        .maybeSingle();

      const validadeDias = Number(paramValidade?.valor) > 0 ? Number(paramValidade.valor) : 90;
      const limiteData = new Date();
      limiteData.setDate(limiteData.getDate() - validadeDias);
      const limiteDataStr = limiteData.toISOString().slice(0, 10);

      const { data: bureausData } = await sb
        .from("analise_credito_scores")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .neq("analise_id", analiseId)
        .not("documento_storage_path", "is", null)
        .gte("data_consulta", limiteDataStr)
        .order("data_consulta", { ascending: false });

      const hoje = Date.now();
      const porFonte = new Map<string, BureauReaproveitavel>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const b of (bureausData || []) as any[]) {
        if (porFonte.has(b.fonte)) continue; // já ordenado por data_consulta desc
        const consulta = new Date(
          String(b.data_consulta).length === 10 ? `${b.data_consulta}T00:00:00` : b.data_consulta,
        ).getTime();
        porFonte.set(b.fonte, {
          ...b,
          idade_dias: Math.max(0, Math.floor((hoje - consulta) / 86_400_000)),
        });
      }

      return {
        analise: analiseData,
        pedido: analiseData.pedido,
        parceiro: analiseData.parceiro,
        socios: (sociosData || []) as SocioParceiro[],
        scores: (scoresData || []) as AnaliseScore[],
        transicoes: (transicoesData || []) as AnaliseTransicao[],
        kpisFinanceiros: (kpisData as KpiFinanceiro) || null,
        kpisGrupo,
        analisesAnteriores: anteriores,
        marcos: (marcosData || []) as ParceiroMarco[],
        titulos: (titulosData || []) as TituloCredito[],
        bureausReaproveitaveis: [...porFonte.values()],
      };
    },
  });
}

