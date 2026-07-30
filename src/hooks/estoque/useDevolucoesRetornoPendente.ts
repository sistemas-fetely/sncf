import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RetornoPendenteLinha {
  pedido_id: string;
  id_externo: string | null;
  devolvido_em: string | null;
  motivo: string | null;
  nf: string | null;
  sku: string;
  nome_comercial: string | null;
  qtd_saiu: number;
  qtd_ja_retornada: number;
  qtd_pendente: number;
  dias_esperando: number | null;
  valor_custo_pendente: number | null;
}

export interface RetornoPendentePedido {
  pedido_id: string;
  id_externo: string | null;
  devolvido_em: string | null;
  motivo: string | null;
  nf: string | null;
  dias_esperando: number | null;
  unidades_pendentes: number;
  valor_custo_pendente: number;
  itens: RetornoPendenteLinha[];
}

const COLS =
  "pedido_id,id_externo,devolvido_em,motivo,nf,sku,nome_comercial,qtd_saiu,qtd_ja_retornada,qtd_pendente,dias_esperando,valor_custo_pendente";

export function useDevolucoesRetornoPendente() {
  return useQuery({
    queryKey: ["devolucao-retorno-pendente"],
    queryFn: async (): Promise<RetornoPendentePedido[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_devolucao_retorno_pendente")
        .select(COLS)
        .limit(5000);
      if (error) throw error;

      const linhas = (data ?? []) as RetornoPendenteLinha[];
      const mapa = new Map<string, RetornoPendentePedido>();

      for (const l of linhas) {
        let grupo = mapa.get(l.pedido_id);
        if (!grupo) {
          grupo = {
            pedido_id: l.pedido_id,
            id_externo: l.id_externo,
            devolvido_em: l.devolvido_em,
            motivo: l.motivo,
            nf: l.nf,
            dias_esperando: l.dias_esperando,
            unidades_pendentes: 0,
            valor_custo_pendente: 0,
            itens: [],
          };
          mapa.set(l.pedido_id, grupo);
        }
        grupo.itens.push(l);
        grupo.unidades_pendentes += Number(l.qtd_pendente ?? 0);
        grupo.valor_custo_pendente += Number(l.valor_custo_pendente ?? 0);
        if ((l.dias_esperando ?? 0) > (grupo.dias_esperando ?? 0)) {
          grupo.dias_esperando = l.dias_esperando;
        }
      }

      return Array.from(mapa.values()).sort(
        (a, b) => (b.dias_esperando ?? 0) - (a.dias_esperando ?? 0),
      );
    },
  });
}
