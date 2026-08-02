import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type Orfa = {
  nsu: string;
  classe: string;
  severidade: number;
  pedido_id: string | null;
  id_externo: string | null;
  cliente: string | null;
  valor: number;
  estagio: string | null;
  detalhe: string;
  acao: string | null;
};

export type Venda = {
  nsu: string;
  data_venda: string;
  produto: string | null;
  modalidade: string | null;
  parcelas: number | null;
  valor_bruto: number;
  mdr: number | null;
  terminal: string | null;
};

export type Candidato = {
  pedido_id: string;
  id_externo: string | null;
  cliente: string;
  apelido: string | null;
  total_titulos: number;
};

const num = (v: unknown) => Number(v ?? 0);

export function useVendasSemPedido() {
  const orfas = useQuery({
    queryKey: ["auditoria-cartao-sem-pedido"],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_auditoria_cartao_sem_pedido").select("*");
      if (error) throw error;
      return (data || []) as Orfa[];
    },
  });

  const nsus = (orfas.data || []).map((o) => o.nsu);

  const vendas = useQuery({
    queryKey: ["auditoria-cartao-sem-pedido-vendas", nsus.join(",")],
    enabled: nsus.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("safrapay_venda")
        .select("nsu, data_venda, produto, modalidade, parcelas, valor_bruto, mdr, terminal")
        .in("nsu", nsus);
      if (error) throw error;
      const mapa: Record<string, Venda> = {};
      for (const v of (data || []) as Venda[]) mapa[v.nsu] = v;
      return mapa;
    },
  });

  return { orfas, vendas };
}

export async function buscarCandidatos(termo: string): Promise<Candidato[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const { data: parceiros, error: errP } = await sb
    .from("parceiros_comerciais")
    .select("id")
    .or(`razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%`)
    .limit(20);
  if (errP) throw errP;
  const ids = ((parceiros || []) as { id: string }[]).map((p) => p.id);

  const filtros = [`id_externo.ilike.%${q}%`];
  if (ids.length) filtros.push(`parceiro_id.in.(${ids.join(",")})`);

  const { data, error } = await sb
    .from("pedidos")
    .select(
      "id, id_externo, parceiros_comerciais(razao_social, nome_fantasia), titulo_a_receber(valor_atual, valor_bruto, tipo_pagamento, status)"
    )
    .or(filtros.join(","))
    .order("data_pedido", { ascending: false })
    .limit(10);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((p) => {
    const titulos = (p.titulo_a_receber || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.tipo_pagamento === "cartao" && !["cancelado", "devolvido"].includes(t.status)
    );
    return {
      pedido_id: p.id,
      id_externo: p.id_externo,
      cliente: nomeCanonico(p.parceiros_comerciais?.razao_social),
      apelido: apelidoParceiro(p.parceiros_comerciais?.razao_social, p.parceiros_comerciais?.nome_fantasia),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total_titulos: titulos.reduce((s: number, t: any) => s + num(t.valor_atual ?? t.valor_bruto), 0),
    } as Candidato;
  });
}

export { sb };
