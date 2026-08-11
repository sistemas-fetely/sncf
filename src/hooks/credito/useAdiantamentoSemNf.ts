import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdiantamentoSemNf {
  adiantamento_id: string;
  parceiro_id: string;
  cliente: string;
  cliente_apelido: string | null;
  cnpj: string | null;
  pedido_id: string;
  pedido: string | null;
  pedido_estagio: string | null;
  pedido_valor: number;
  valor: number;
  saldo: number;
  status: string;
  origem: string;
  forma: string | null;
  recebido_em: string | null;
  descricao: string | null;
  provisoes_previstas: number;
  sem_plano: boolean;
  pct_pedido: number | null;
  cobre_pedido_inteiro: boolean;
  dias_parado: number | null;
}

/**
 * Dinheiro do cliente que já entrou no banco mas ainda não virou título,
 * porque a NF não saiu. É passivo, não recebível — por isso não aparece
 * (e não deve aparecer) nos cards de vencimento da aba Títulos.
 */
export function useAdiantamentoSemNf(busca?: string) {
  return useQuery({
    queryKey: ["adiantamento-sem-nf", busca ?? ""],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<AdiantamentoSemNf[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_adiantamento_sem_nf")
        .select("*")
        .order("recebido_em", { ascending: false });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: AdiantamentoSemNf[] = (data ?? []).map((r: any) => ({
        ...r,
        pedido_valor: Number(r.pedido_valor ?? 0),
        valor: Number(r.valor ?? 0),
        saldo: Number(r.saldo ?? 0),
        provisoes_previstas: Number(r.provisoes_previstas ?? 0),
      }));

      if (!busca) return rows;
      const t = busca.toLowerCase();
      return rows.filter(
        (r) =>
          (r.cliente ?? "").toLowerCase().includes(t) ||
          (r.pedido ?? "").toLowerCase().includes(t) ||
          (r.cnpj ?? "").includes(t),
      );
    },
  });
}
