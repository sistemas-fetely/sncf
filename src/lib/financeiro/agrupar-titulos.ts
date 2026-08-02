/**
 * Agrupamento da aba Títulos por PEDIDO.
 *
 * Doutrina: no SNCF cada parcela é um título com número próprio e sequência
 * independente (TIT-2026-00295-01 / TIT-2026-00296-02 / TIT-2026-00297-03).
 * Não existe "título pai" das parcelas — `titulo_pai_id` serve a outra
 * finalidade. Logo o único agrupador real desta tela é o PEDIDO.
 *
 * O total do grupo é a soma do que está VISÍVEL no filtro atual e NÃO está
 * encerrado. Nunca é o valor do pedido: em 26 dos 112 pedidos com título a
 * soma dos títulos não fecha com `pedidos.valor_liquido`, e essa divergência
 * é achado de auditoria, não número de tela.
 *
 * O resumo de estado sai pelo eixo_status — o mesmo que a coluna Status já
 * mostra em cada linha. Contar por status_gestao produziria cabeçalho
 * "3/3 pagas" sobre três linhas escritas "A vencer".
 */
import { tituloEntraNoKpi, type TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import { STATUS_META, type EixoProva, type EixoStatus } from "@/lib/financeiro/eixos-estado";

/** Plural feminino ("parcela") dos rótulos de STATUS_META. */
const EIXO_PLURAL: Record<EixoStatus, string> = {
  a_vencer: "a vencer",
  pago: "pagas",
  compensado: "compensadas",
  devolvido: "devolvidas",
  cancelado: "canceladas",
};

export interface GrupoPedido {
  /** Chave estável do grupo (id do pedido). */
  chave: string;
  pedidoId: string | null;
  pedidoRef: string | null;
  /** Primeiro título visível — fonte de cliente/CNPJ. */
  cabeca: TituloCobranca;
  /** Parcelas visíveis, ordenadas por parcela. */
  titulos: TituloCobranca[];
  /** Soma de valor_efetivo dos visíveis não encerrados. */
  totalVisivel: number;
  /** Visíveis encerrados (cancelado/devolvido/perda/renegociado): fora do total. */
  encerradosVisiveis: number;
  /** Títulos deste pedido que o filtro atual esconde. */
  ocultos: number;
  formas: string[];
  nfs: string[];
  /** Composição por eixo_status, na ordem canônica de STATUS_META. */
  composicao: { eixo: EixoStatus; qtd: number }[];
  /** Prova só quando unânime entre os visíveis — senão null. */
  provaUnanime: EixoProva | null;
  atrasoMax: number;
  /** Menor vencimento entre os visíveis ainda em aberto. */
  proximoVencimento: string | null;
  totalParcelasDeclarado: number;
}

function chaveDe(t: TituloCobranca): string {
  return t.pedido_id ?? `sem-pedido:${t.id}`;
}

function montar(chave: string, visiveis: TituloCobranca[], totalNoUniverso: number): GrupoPedido {
  const titulos = [...visiveis].sort(
    (a, b) =>
      (a.numero_parcela ?? 0) - (b.numero_parcela ?? 0) ||
      (a.data_vencimento_atual ?? "").localeCompare(b.data_vencimento_atual ?? "") ||
      (a.numero_titulo ?? "").localeCompare(b.numero_titulo ?? ""),
  );
  const cabeca = titulos[0];
  const vivos = titulos.filter(tituloEntraNoKpi);

  const contagem = new Map<EixoStatus, number>();
  for (const t of titulos) {
    if (!t.eixo_status) continue;
    contagem.set(t.eixo_status, (contagem.get(t.eixo_status) ?? 0) + 1);
  }
  const composicao = [...contagem.entries()]
    .map(([eixo, qtd]) => ({ eixo, qtd }))
    .sort((a, b) => STATUS_META[a.eixo].ordem - STATUS_META[b.eixo].ordem);

  const abertos = vivos.filter((t) => t.eixo_status === "a_vencer");
  const provas = new Set(titulos.map((t) => t.eixo_prova).filter(Boolean));

  return {
    chave,
    pedidoId: cabeca.pedido_id ?? null,
    pedidoRef: cabeca.pedido_id_externo ?? null,
    cabeca,
    titulos,
    totalVisivel: vivos.reduce((acc, t) => acc + (t.valor_efetivo ?? 0), 0),
    encerradosVisiveis: titulos.length - vivos.length,
    ocultos: Math.max(0, totalNoUniverso - titulos.length),
    formas: [...new Set(titulos.map((t) => t.tipo_pagamento).filter(Boolean))],
    nfs: [...new Set(titulos.map((t) => t.nf_numero).filter(Boolean) as string[])],
    composicao,
    provaUnanime: provas.size === 1 ? ([...provas][0] as EixoProva) : null,
    atrasoMax: vivos.reduce((acc, t) => Math.max(acc, t.dias_atraso ?? 0), 0),
    proximoVencimento:
      abertos.length > 0
        ? abertos
            .map((t) => t.data_vencimento_atual)
            .filter(Boolean)
            .sort()[0] ?? null
        : null,
    totalParcelasDeclarado: titulos.reduce((acc, t) => Math.max(acc, t.total_parcelas ?? 0), 0),
  };
}

/**
 * `visiveis` = títulos que passaram todos os filtros da tela.
 * `universo` = todos os títulos carregados, usado só para contar os ocultos.
 * A ordem dos grupos preserva a ordem de aparição em `visiveis` — quem ordena
 * a lista continua sendo a consulta do hook.
 */
export function agruparPorPedido(
  visiveis: TituloCobranca[],
  universo: TituloCobranca[],
): GrupoPedido[] {
  const totalPorPedido = new Map<string, number>();
  for (const t of universo) {
    const k = chaveDe(t);
    totalPorPedido.set(k, (totalPorPedido.get(k) ?? 0) + 1);
  }

  const mapa = new Map<string, TituloCobranca[]>();
  const ordem: string[] = [];
  for (const t of visiveis) {
    const k = chaveDe(t);
    if (!mapa.has(k)) {
      mapa.set(k, []);
      ordem.push(k);
    }
    mapa.get(k)!.push(t);
  }

  return ordem.map((k) => montar(k, mapa.get(k)!, totalPorPedido.get(k) ?? 0));
}

/** "2 compensadas · 1 a vencer" */
export function resumoComposicao(g: GrupoPedido): string {
  return g.composicao.map((c) => `${c.qtd} ${EIXO_PLURAL[c.eixo]}`).join(" · ");
}

/** Grupo que não merece accordion: uma parcela só e nada escondido. */
export function grupoEhUnitario(g: GrupoPedido): boolean {
  return g.titulos.length === 1 && g.ocultos === 0;
}
