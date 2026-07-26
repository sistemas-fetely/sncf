import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BaixaPendenteItem = {
  id: string;
  numero_titulo: string | null;
  valor: number;
  nosso_numero_seq: string | null;
  boleto_status: "baixa_solicitada" | "baixa_remessa_gerada";
  cliente: string;
  // Rastro da remessa que carregou esse título (baixa/prorrogação):
  remessa_id: string | null;
  remessa_status: string | null;
  remessa_gerado_em: string | null;
  remessa_enviada_em: string | null;
  remessa_retorno_processado_em: string | null;
};

type Row = {
  id: string;
  numero_titulo: string | null;
  valor_atual: number | null;
  valor_bruto: number | null;
  nosso_numero_seq: string | null;
  boleto_status: string | null;
  baixa_remessa_id: string | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
  remessa: {
    id: string;
    status: string | null;
    gerado_em: string | null;
    enviada_em: string | null;
    retorno_processado_em: string | null;
  } | null;
};

export type BaixasPendentesResult = {
  // Bloco 1 — aguardando gerar remessa de baixa
  baixaSolicitada: BaixaPendenteItem[];
  totalSolicitada: number;
  countSolicitada: number;
  // Bloco 2 — remessa gerada, aguardando envio no SafraNet
  remessaGeradaAguardandoEnvio: BaixaPendenteItem[];
  totalRemessaGeradaAguardandoEnvio: number;
  countRemessaGeradaAguardandoEnvio: number;
  // Bloco 3 — remessa enviada ao banco, aguardando retorno
  remessaEnviadaAguardandoRetorno: BaixaPendenteItem[];
  totalRemessaEnviadaAguardandoRetorno: number;
  countRemessaEnviadaAguardandoRetorno: number;
  // Totais
  countTotal: number;
  /** Só o que exige ação nossa: blocos 1 + 2 (bloco 3 aguarda o banco). */
  countAcoesNossas: number;
};

export function useBaixasPendentes() {
  return useQuery<BaixasPendentesResult>({
    queryKey: ["baixas-pendentes"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, valor_atual, valor_bruto, nosso_numero_seq, boleto_status, baixa_remessa_id, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social)), remessa:remessas_safra!titulo_a_receber_baixa_remessa_id_fkey(id, status, gerado_em, enviada_em, retorno_processado_em)",
        )
        .in("boleto_status", ["baixa_solicitada", "baixa_remessa_gerada"]);
      // FAIL-LOUD: nunca engolir erro de query
      if (error) throw error;

      const baixaSolicitada: BaixaPendenteItem[] = [];
      const remessaGeradaAguardandoEnvio: BaixaPendenteItem[] = [];
      const remessaEnviadaAguardandoRetorno: BaixaPendenteItem[] = [];

      for (const r of ((data ?? []) as unknown as Row[])) {
        const item: BaixaPendenteItem = {
          id: r.id,
          numero_titulo: r.numero_titulo,
          valor: Number(r.valor_atual ?? r.valor_bruto ?? 0),
          nosso_numero_seq: r.nosso_numero_seq,
          boleto_status: r.boleto_status as BaixaPendenteItem["boleto_status"],
          cliente: r.conta?.parceiro?.razao_social ?? "—",
          remessa_id: r.remessa?.id ?? null,
          remessa_status: r.remessa?.status ?? null,
          remessa_gerado_em: r.remessa?.gerado_em ?? null,
          remessa_enviada_em: r.remessa?.enviada_em ?? null,
          remessa_retorno_processado_em: r.remessa?.retorno_processado_em ?? null,
        };

        if (r.boleto_status === "baixa_solicitada") {
          baixaSolicitada.push(item);
        } else if (r.boleto_status === "baixa_remessa_gerada") {
          const status = r.remessa?.status ?? null;
          if (status === "enviada") {
            remessaEnviadaAguardandoRetorno.push(item);
          } else {
            // status = 'gerada' OU título sem baixa_remessa_id (legado) → aguarda envio
            remessaGeradaAguardandoEnvio.push(item);
          }
        }
      }

      const totalSolicitada = baixaSolicitada.reduce((s, i) => s + i.valor, 0);
      const totalRemessaGeradaAguardandoEnvio = remessaGeradaAguardandoEnvio.reduce((s, i) => s + i.valor, 0);
      const totalRemessaEnviadaAguardandoRetorno = remessaEnviadaAguardandoRetorno.reduce((s, i) => s + i.valor, 0);

      const countSolicitada = baixaSolicitada.length;
      const countRemessaGeradaAguardandoEnvio = remessaGeradaAguardandoEnvio.length;
      const countRemessaEnviadaAguardandoRetorno = remessaEnviadaAguardandoRetorno.length;

      return {
        baixaSolicitada,
        totalSolicitada,
        countSolicitada,
        remessaGeradaAguardandoEnvio,
        totalRemessaGeradaAguardandoEnvio,
        countRemessaGeradaAguardandoEnvio,
        remessaEnviadaAguardandoRetorno,
        totalRemessaEnviadaAguardandoRetorno,
        countRemessaEnviadaAguardandoRetorno,
        countTotal:
          countSolicitada + countRemessaGeradaAguardandoEnvio + countRemessaEnviadaAguardandoRetorno,
        countAcoesNossas: countSolicitada + countRemessaGeradaAguardandoEnvio,
      };
    },
  });
}
