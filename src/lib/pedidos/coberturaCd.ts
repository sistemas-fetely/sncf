import type { PedidoFilaItem } from "@/types/pedido";

type ColunasCd = Pick<
  PedidoFilaItem,
  "cd_itens" | "cd_itens_cobertos" | "cd_faltas" | "cd_expedicao_nome"
>;

export interface AlertaCoberturaCd {
  /** Texto curto do selo, ex.: "CD não cobre 4/9". */
  texto: string;
  /** Nome do CD + uma linha por item faltante. Vazio quando a view não devolve nada. */
  tooltip: string;
}

/**
 * CD-NAO-COBRE (24/10/2026): a coluna Estoque mede a cobertura da rede; este alerta
 * mede só o CD de expedição do pedido. A view devolve nulas fora de pré-separação,
 * em separação e pré-faturamento — nesses casos não há alerta.
 */
export function alertaCoberturaCd(p: ColunasCd): AlertaCoberturaCd | null {
  const total = p.cd_itens;
  const cobertos = p.cd_itens_cobertos;
  if (total == null || cobertos == null || cobertos >= total) return null;

  const tooltip = [
    p.cd_expedicao_nome ? `CD ${p.cd_expedicao_nome}` : null,
    ...(p.cd_faltas ?? []).map(
      (f) => `${f.sku}: pede ${f.pedido}, livre no CD ${f.livre_cd}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return { texto: `CD não cobre ${total - cobertos}/${total}`, tooltip };
}
