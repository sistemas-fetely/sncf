import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BaixaPendenteItem = {
  id: string;
  numero_titulo: string | null;
  valor: number;
  nosso_numero_seq: string | null;
  boleto_status: "baixa_solicitada" | "baixa_remessa_gerada";
  cliente: string;
};

type Row = {
  id: string;
  numero_titulo: string | null;
  valor_atual: number | null;
  valor_bruto: number | null;
  nosso_numero_seq: string | null;
  boleto_status: string | null;
  conta: { parceiro: { razao_social: string | null } | null } | null;
};

export type BaixasPendentesResult = {
  baixaSolicitada: BaixaPendenteItem[];
  baixaRemessaGerada: BaixaPendenteItem[];
  totalSolicitada: number;
  totalRemessaGerada: number;
  countSolicitada: number;
  countRemessaGerada: number;
  countTotal: number;
};

export function useBaixasPendentes() {
  return useQuery<BaixasPendentesResult>({
    queryKey: ["baixas-pendentes"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, valor_atual, valor_bruto, nosso_numero_seq, boleto_status, conta:contas_pagar_receber(parceiro:parceiros_comerciais(razao_social))",
        )
        .in("boleto_status", ["baixa_solicitada", "baixa_remessa_gerada"]);
      if (error) throw error;
      const baixaSolicitada: BaixaPendenteItem[] = [];
      const baixaRemessaGerada: BaixaPendenteItem[] = [];
      for (const r of ((data ?? []) as unknown as Row[])) {
        const item: BaixaPendenteItem = {
          id: r.id,
          numero_titulo: r.numero_titulo,
          valor: Number(r.valor_atual ?? r.valor_bruto ?? 0),
          nosso_numero_seq: r.nosso_numero_seq,
          boleto_status: r.boleto_status as BaixaPendenteItem["boleto_status"],
          cliente: r.conta?.parceiro?.razao_social ?? "—",
        };
        if (r.boleto_status === "baixa_solicitada") baixaSolicitada.push(item);
        else if (r.boleto_status === "baixa_remessa_gerada") baixaRemessaGerada.push(item);
      }
      const totalSolicitada = baixaSolicitada.reduce((s, i) => s + i.valor, 0);
      const totalRemessaGerada = baixaRemessaGerada.reduce((s, i) => s + i.valor, 0);
      return {
        baixaSolicitada,
        baixaRemessaGerada,
        totalSolicitada,
        totalRemessaGerada,
        countSolicitada: baixaSolicitada.length,
        countRemessaGerada: baixaRemessaGerada.length,
        countTotal: baixaSolicitada.length + baixaRemessaGerada.length,
      };
    },
  });
}
