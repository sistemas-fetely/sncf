import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AnaliseListItem,
  KpiFinanceiro,
  KpiFinanceiroGrupo,
  ParceiroMarco,
  SocioParceiro,
} from "@/types/credito";

export interface HaverCliente {
  id: string;
  valor: number;
  saldo: number;
  status: string;
  origem_descricao: string | null;
  data_expiracao: string | null;
  created_at: string;
}

export interface TituloB2B {
  id: string;
  numero_titulo: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor: number;
  data_vencimento: string;
  data_compra: string | null;
  data_recebimento: string | null;
  status_gestao: string;
  meio_pagamento: string | null;
  nf_numero: string | null;
  banco_nome: string | null;
  data_liquidacao: string | null;
  liquidacao_realizada: boolean;
  estado_em_aberto: boolean;
  estado_gestao: string | null;
  estado_rotulo: string | null;
}

export interface ClienteDetalhe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parceiro: any;
  socios: SocioParceiro[];
  kpisFinanceiros: KpiFinanceiro | null;
  kpisGrupo: KpiFinanceiroGrupo | null;
  analises: AnaliseListItem[];
  marcos: ParceiroMarco[];
  haveres: HaverCliente[];
  titulos: TituloB2B[];
}

export function useClienteDetalhe(parceiroId: string | undefined) {
  return useQuery({
    queryKey: ["cliente-detalhe", parceiroId],
    enabled: !!parceiroId,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<ClienteDetalhe> => {
      if (!parceiroId) throw new Error("parceiroId obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const { data: parceiroData, error: pErr } = await sb
        .from("parceiros_comerciais")
        .select("*")
        .eq("id", parceiroId)
        .single();
      if (pErr) throw pErr;

      const grupoId = parceiroData?.grupo_economico_id;

      const { data: sociosData } = await sb
        .from("socios_parceiro")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .is("desligado_em", null);

      const { data: titulosData } = await sb
        .from("vw_recebivel_b2b")
        .select("id, numero_titulo, numero_parcela, total_parcelas, valor, data_vencimento, data_compra, data_recebimento, status_gestao, meio_pagamento, nf_numero, banco_nome, data_liquidacao, liquidacao_realizada, estado_em_aberto, estado_gestao, estado_rotulo")
        .eq("parceiro_id", parceiroId)
        .order("data_vencimento", { ascending: false })
        .limit(200);

      const titulos = (titulosData || []) as TituloB2B[];

      // FONTE ÚNICA: mesma view consumida pelas telas de análise e decisão.
      // Não recalcular KPI em JS — a regra de "em aberto" vive na view
      // (exclui cancelado/devolvido, inclui título sem NF, trata baixa humana
      // como quitação da obrigação do cliente).
      const { data: kpisData } = await sb
        .from("v_credito_resumo_financeiro")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();

      const kpisFinanceiros = (kpisData as KpiFinanceiro) || null;

      let kpisGrupo: KpiFinanceiroGrupo | null = null;
      if (grupoId) {
        const { data: kg } = await sb
          .from("v_credito_resumo_financeiro_grupo")
          .select("*")
          .eq("grupo_economico_id", grupoId)
          .maybeSingle();
        kpisGrupo = (kg as KpiFinanceiroGrupo) || null;
      }

      const { data: anData } = await sb
        .from("analises_credito")
        .select(`
          id, pedido_id, parceiro_id, estagio_atual, status_final,
          criado_em, decidido_em, analise_ia_confianca, analise_ia_processada_em,
          parceiro:parceiros_comerciais(cnpj, razao_social),
          pedido:pedidos(id_externo, valor_liquido, condicao_solicitada)
        `)
        .eq("parceiro_id", parceiroId)
        .order("criado_em", { ascending: false })
        .limit(50);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const analises: AnaliseListItem[] = (anData || []).map((r: any) => ({
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
      }));

      const { data: marcosData } = await sb
        .from("v_parceiro_timeline")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("criado_em", { ascending: false })
        .limit(100);

      const { data: haveresData } = await sb
        .from("haver_cliente")
        .select("id, valor, saldo, status, origem_descricao, data_expiracao, created_at")
        .eq("parceiro_id", parceiroId)
        .in("status", ["disponivel", "parcial"])
        .order("created_at", { ascending: false });

      return {
        parceiro: parceiroData,
        socios: (sociosData || []) as SocioParceiro[],
        kpisFinanceiros,
        kpisGrupo,
        analises,
        marcos: (marcosData || []) as ParceiroMarco[],
        haveres: (haveresData as HaverCliente[]) || [],
        titulos,
      };
    },
  });
}
