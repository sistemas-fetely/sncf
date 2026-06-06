import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloBoletoPendente, BoletoStatus } from "@/types/credito";

interface Options {
  busca?: string;
  status?: BoletoStatus | "todos";
}

export function useTitulosBoleto(opts: Options = {}) {
  return useQuery({
    queryKey: ["titulos-boleto", opts],
    staleTime: 20 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(`
          id, numero_titulo, numero_parcela, total_parcelas,
          valor_bruto, data_vencimento_atual,
          boleto_status, boleto_codigo_rejeicao, remessa_safra_id,
          nosso_numero_safra, boleto_enviado_em, pedido_id,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(
              id, razao_social, cnpj, email, cadastro_incompleto
            )
          ),
          pedido:pedidos(id_externo)
        `)
        .eq("tipo_pagamento", "boleto")
        .not("boleto_status", "is", null)
        .order("data_vencimento_atual", { ascending: true });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mapped: TituloBoletoPendente[] = (data || []).map((r: any) => ({
        titulo_id: r.id,
        numero_titulo: r.numero_titulo ?? "",
        numero_parcela: r.numero_parcela,
        total_parcelas: r.total_parcelas,
        valor_bruto: Number(r.valor_bruto ?? 0),
        data_vencimento: r.data_vencimento_atual ?? "",
        boleto_status: r.boleto_status ?? "pendente",
        boleto_codigo_rejeicao: r.boleto_codigo_rejeicao ?? null,
        remessa_safra_id: r.remessa_safra_id ?? null,
        nosso_numero_safra: r.nosso_numero_safra ?? null,
        boleto_enviado_em: r.boleto_enviado_em ?? null,
        pedido_id: r.pedido_id ?? "",
        pedido_id_externo: r.pedido?.id_externo ?? "—",
        parceiro_id: r.conta?.parceiro?.id ?? "",
        parceiro_nome: r.conta?.parceiro?.razao_social ?? "—",
        parceiro_cnpj: r.conta?.parceiro?.cnpj ?? "",
        parceiro_email: r.conta?.parceiro?.email ?? null,
        cadastro_incompleto: r.conta?.parceiro?.cadastro_incompleto ?? false,
      }));

      if (opts.status && opts.status !== "todos") {
        mapped = mapped.filter((t) => t.boleto_status === opts.status);
      }

      if (opts.busca) {
        const t = opts.busca.toLowerCase();
        mapped = mapped.filter(
          (m) =>
            m.parceiro_nome.toLowerCase().includes(t) ||
            m.parceiro_cnpj.includes(t) ||
            m.pedido_id_externo.toLowerCase().includes(t) ||
            m.numero_titulo.toLowerCase().includes(t)
        );
      }

      return mapped;
    },
  });
}
