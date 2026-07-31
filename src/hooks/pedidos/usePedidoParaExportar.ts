import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoPdfData } from "@/lib/pedidoPdf";

/**
 * Fonte ÚNICA de dados do documento do pedido (PDF, Excel e e-mail).
 * Nenhum consumidor deve montar a própria query — divergência entre elas foi
 * a causa dos totais que não fechavam.
 */

const fmtDate = (s?: string | null) =>
  s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "";

export interface PedidoExportItem {
  sku: string | null;
  descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  ordem: number | null;
}

export interface PedidoExportRaw {
  id: string;
  id_externo: string;
  parceiro_id: string | null;
  data_pedido: string | null;
  valor_bruto: number;
  desconto_pct: number;
  desconto_celebra_valor: number;
  bonus_pix_valor: number;
  valor_frete: number;
  frete_tipo: string | null;
  valor_liquido: number;
  forma_solicitada: string | null;
  condicao_solicitada: string | null;
  estagio: string | null;
  link_pagamento: string | null;
}

export interface PedidoParaExportar {
  pedido: PedidoExportRaw;
  parceiro: {
    razao_social: string | null;
    nome_fantasia: string | null;
    cnpj: string | null;
    email: string | null;
  } | null;
  itens: PedidoExportItem[];
  frete_entra_no_liquido: boolean;
  /** Já no formato que `gerarPedidoPdf` espera. */
  pdf: PedidoPdfData;
}

export async function fetchPedidoParaExportar(pedidoId: string): Promise<PedidoParaExportar> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: pedido, error: errP } = await sb
    .from("pedidos")
    .select(
      "id, id_externo, parceiro_id, data_pedido, valor_bruto, desconto_pct, desconto_celebra_valor, bonus_pix_valor, valor_frete, frete_tipo, valor_liquido, forma_solicitada, condicao_solicitada, estagio, link_pagamento",
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (errP) throw errP;
  if (!pedido) throw new Error("Pedido não encontrado");

  const [{ data: parceiro }, { data: itens, error: errI }, { data: freteTipos }] =
    await Promise.all([
      pedido.parceiro_id
        ? sb
            .from("parceiros_comerciais")
            .select("razao_social, nome_fantasia, cnpj, email")
            .eq("id", pedido.parceiro_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .from("pedido_itens")
        .select("sku, descricao, quantidade, valor_unitario, ordem")
        .eq("pedido_id", pedidoId)
        .order("ordem"),
      sb.from("frete_tipos").select("codigo, entra_no_liquido").eq("ativo", true),
    ]);
  if (errI) throw errI;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itensArr: PedidoExportItem[] = (itens ?? []).map((it: any) => ({
    sku: it.sku ?? null,
    descricao: it.descricao ?? null,
    quantidade: Number(it.quantidade ?? 0),
    valor_unitario: Number(it.valor_unitario ?? 0),
    ordem: it.ordem ?? null,
  }));

  const frete_entra_no_liquido =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (freteTipos ?? []).find((t: any) => t.codigo === pedido.frete_tipo)?.entra_no_liquido === true;

  const valor_bruto = Number(pedido.valor_bruto ?? 0);
  const desconto_pct = Number(pedido.desconto_pct ?? 0);
  const desconto_celebra_valor = Number(pedido.desconto_celebra_valor ?? 0);
  const desconto_valor =
    desconto_celebra_valor > 0
      ? desconto_celebra_valor
      : desconto_pct > 0
        ? valor_bruto * (desconto_pct / 100)
        : 0;

  const raw: PedidoExportRaw = {
    id: pedido.id,
    id_externo: pedido.id_externo,
    parceiro_id: pedido.parceiro_id ?? null,
    data_pedido: pedido.data_pedido ?? null,
    valor_bruto,
    desconto_pct,
    desconto_celebra_valor,
    bonus_pix_valor: Number(pedido.bonus_pix_valor ?? 0),
    valor_frete: Number(pedido.valor_frete ?? 0),
    frete_tipo: pedido.frete_tipo ?? null,
    valor_liquido: Number(pedido.valor_liquido ?? 0),
    forma_solicitada: pedido.forma_solicitada ?? null,
    condicao_solicitada: pedido.condicao_solicitada ?? null,
    estagio: pedido.estagio ?? null,
    link_pagamento: pedido.link_pagamento ?? null,
  };

  const pdf: PedidoPdfData = {
    id_externo: raw.id_externo,
    data_pedido: fmtDate(raw.data_pedido),
    parceiro_nome: parceiro?.razao_social ?? "",
    forma_pagamento: raw.forma_solicitada ?? "",
    condicao_pagamento: raw.condicao_solicitada ?? undefined,
    valor_bruto,
    desconto_valor,
    desconto_pct: desconto_pct > 0 ? desconto_pct : undefined,
    bonus_pix_valor: raw.bonus_pix_valor,
    valor_frete: raw.valor_frete,
    frete_entra_no_liquido,
    valor_liquido: raw.valor_liquido,
    itens: itensArr.map((it) => ({
      descricao: it.descricao ?? "",
      sku: it.sku ?? "",
      quantidade: it.quantidade,
      valor_unitario: it.valor_unitario,
      subtotal: it.quantidade * it.valor_unitario,
    })),
  };

  return { pedido: raw, parceiro: parceiro ?? null, itens: itensArr, frete_entra_no_liquido, pdf };
}

export function usePedidoParaExportar(pedidoId?: string) {
  return useQuery({
    queryKey: ["pedido-para-exportar", pedidoId],
    enabled: !!pedidoId,
    queryFn: () => fetchPedidoParaExportar(pedidoId as string),
  });
}
