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

export interface ClienteDetalhe {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parceiro: any;
  socios: SocioParceiro[];
  kpisFinanceiros: KpiFinanceiro | null;
  kpisGrupo: KpiFinanceiroGrupo | null;
  analises: AnaliseListItem[];
  marcos: ParceiroMarco[];
  haveres: HaverCliente[];
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
        kpisFinanceiros: (kpisData as KpiFinanceiro) || null,
        kpisGrupo,
        analises,
        marcos: (marcosData || []) as ParceiroMarco[],
        haveres: (haveresData as HaverCliente[]) || [],
      };
    },
  });
}
