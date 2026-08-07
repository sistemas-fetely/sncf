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
 * ORDEM DENTRO DO GRUPO: vivos primeiro, encerrados depois, cada bloco pelo
 * NÚMERO DO TÍTULO. Ordenar por número mantém cada geração de título colada
 * (00186-01/00187-02/00188-03 é um bloco; 00262/00263/00264 é outro), enquanto
 * ordenar por parcela intercalaria as gerações. Conferido no vivo: em 247
 * linhas de pedidos de geração única, a ordem por número nunca discordou da
 * ordem por parcela.
 *
 * ESTADO DO GRUPO: um badge só, o que PREVALECE, calculado sobre a mesma base
 * do total — os vivos. Encerrado não dita o estado do grupo; se o grupo é só
 * encerrado, aí sim ele aparece cancelado/devolvido.
 *  - prova: a mais forte (maior ordem) — um NSU casado vale para a venda toda,
 *    logo se uma parcela viva está conciliada, a venda está provada.
 *  - status: o menos avançado (menor ordem) — o grupo só é compensado quando
 *    todas as parcelas vivas estão. Tela de cobrança não arredonda a favor.
 */
import { tituloEntraNoKpi, type TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import {
  INSTRUMENTO_META,
  RECEBIMENTO_META,
  type EixoInstrumento,
  type EixoRecebimento,
  type EixoProva,
  type EixoStatus,
} from "@/lib/financeiro/eixos-estado";

/** Plural feminino ("parcela") dos rótulos de RECEBIMENTO_META. */
const EIXO_PLURAL: Record<EixoRecebimento, string> = {
  em_aberto: "em aberto",
  quitado: "quitadas",
  compensado: "compensadas",
  devolvido: "devolvidas",
  cancelado: "canceladas",
};

/** Tradução do eixo novo para o vocabulário antigo (só para os aliases @deprecated). */
const RECEBIMENTO_PARA_STATUS: Record<EixoRecebimento, EixoStatus> = {
  em_aberto: "a_vencer",
  quitado: "pago",
  compensado: "compensado",
  devolvido: "devolvido",
  cancelado: "cancelado",
};

const INSTRUMENTO_PARA_PROVA: Record<EixoInstrumento, EixoProva> = {
  sem_instrumento: "registrado",
  registrado: "registrado",
  remessa_gerada: "registrado",
  baixa_solicitada: "registrado",
  liquidado_banco: "conciliado",
  conciliado: "conciliado",
};


export interface GrupoPedido {
  /** Chave estável do grupo (id do pedido). */
  chave: string;
  pedidoId: string | null;
  pedidoRef: string | null;
  /** Primeiro título visível — fonte de cliente/CNPJ. */
  cabeca: TituloCobranca;
  /** Parcelas visíveis: vivas primeiro, encerradas depois. */
  titulos: TituloCobranca[];
  /** Soma de valor_efetivo dos visíveis não encerrados. */
  totalVisivel: number;
  /** Visíveis encerrados (cancelado/devolvido/perda/renegociado): fora do total. */
  encerradosVisiveis: number;
  /** Títulos deste pedido que o filtro atual esconde. */
  ocultos: number;
  formas: string[];
  nfs: string[];
  /** Composição por eixo_status da base (vivos), ordem canônica de STATUS_META. */
  composicao: { eixo: EixoStatus; qtd: number }[];
  /** Prova que prevalece na base — a mais forte. */
  provaPrevalente: EixoProva | null;
  /** Status que prevalece na base — o menos avançado. */
  statusPrevalente: EixoStatus | null;
  atrasoMax: number;
  /** Menor vencimento entre os visíveis ainda em aberto. */
  proximoVencimento: string | null;
  totalParcelasDeclarado: number;
}

function chaveDe(t: TituloCobranca): string {
  return t.pedido_id ?? `sem-pedido:${t.id}`;
}

function montar(chave: string, visiveis: TituloCobranca[], totalNoUniverso: number): GrupoPedido {
  const titulos = [...visiveis].sort((a, b) => {
    const ea = tituloEntraNoKpi(a) ? 0 : 1;
    const eb = tituloEntraNoKpi(b) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (a.numero_titulo ?? "").localeCompare(b.numero_titulo ?? "");
  });
  const cabeca = titulos[0];
  const vivos = titulos.filter(tituloEntraNoKpi);

  /* Base do estado = base do total. Só cai para o conjunto todo se não sobrou vivo. */
  const base = vivos.length > 0 ? vivos : titulos;

  const contagem = new Map<EixoStatus, number>();
  for (const t of base) {
    if (!t.eixo_status) continue;
    contagem.set(t.eixo_status, (contagem.get(t.eixo_status) ?? 0) + 1);
  }
  const composicao = [...contagem.entries()]
    .map(([eixo, qtd]) => ({ eixo, qtd }))
    .sort((a, b) => STATUS_META[a.eixo].ordem - STATUS_META[b.eixo].ordem);

  const provas = base.map((t) => t.eixo_prova).filter(Boolean) as EixoProva[];
  const status = base.map((t) => t.eixo_status).filter(Boolean) as EixoStatus[];

  const abertos = vivos.filter((t) => t.eixo_status === "a_vencer");

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
    provaPrevalente:
      provas.length > 0
        ? provas.reduce((a, b) => (PROVA_META[b].ordem > PROVA_META[a].ordem ? b : a))
        : null,
    statusPrevalente:
      status.length > 0
        ? status.reduce((a, b) => (STATUS_META[b].ordem < STATUS_META[a].ordem ? b : a))
        : null,
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

/** "2 de 3 compensadas" — só faz sentido quando a base está dividida. */
export function resumoComposicao(g: GrupoPedido): string {
  return g.composicao.map((c) => `${c.qtd} ${EIXO_PLURAL[c.eixo]}`).join(" · ");
}

/** A base do grupo está dividida entre estados diferentes? */
export function grupoEstadoDividido(g: GrupoPedido): boolean {
  return g.composicao.length > 1;
}

/** Grupo que não merece accordion: uma parcela só e nada escondido. */
export function grupoEhUnitario(g: GrupoPedido): boolean {
  return g.titulos.length === 1 && g.ocultos === 0;
}
