import type { QueryClient } from "@tanstack/react-query";

/**
 * FONTE ÚNICA DE INVALIDAÇÃO DE PEDIDO.
 *
 * Uma linha da Casa dos Pedidos é montada a partir de ~9 caches React Query
 * independentes (estágio, risco, relógio, lastro de cobrança, cobertura,
 * entrega, etc.). Quando uma mutation invalidava só `pedidos-fila`,
 * `pedidos-pipeline` e `pedido-detalhe`, as demais chaves ficavam com dado
 * velho e a linha parecia não ter mudado até o usuário clicar em outro card
 * do pipeline.
 *
 * REGRA: toda mutation que muda estado de pedido precisa chamar
 * `invalidarPedido(qc, pedidoId)`. Não escreva blocos manuais de
 * `invalidateQueries` para chaves da família de pedido — acrescente a chave
 * aqui.
 *
 * Chaves que NÃO são da família de pedido (ex.: "contas-receber-titulos",
 * "cobranca-fila", "primeiro-pagamento-fila", "canal-msgs-pendentes")
 * continuam sendo invalidadas no próprio hook, junto com a chamada a este
 * helper.
 *
 * A invalidação da família por pedido é feita por prefixo, não depende de
 * receber o id. Esquecer de passar o id (ou passar `null`) não pode deixar
 * a tela de detalhe do pedido com dados velhos. O custo é baixo porque só
 * existe uma tela de detalhe de pedido montada por vez: apenas ela rebusca
 * imediatamente. As entradas de outros pedidos no cache apenas ficam
 * marcadas como sujas e rebuscam quando forem montadas.
 *
 * O parâmetro `_pedidoId` é mantido só por compatibilidade e legibilidade
 * das chamadas existentes. Ele não influencia a invalidação por prefixo.
 *
 * A invalidação é por prefixo (comportamento padrão do TanStack) e usa o
 * `refetchType` padrão: só o que está montado rebusca na hora.
 */

/** Chaves globais / de lista — sempre invalidadas. */
const CHAVES_GLOBAIS: readonly (readonly unknown[])[] = [
  ["pedidos-fila"], // cobre "entrega-lote" e "aguardando-estoque" (mesmo prefixo)
  ["pedidos-pipeline"],
  ["pedidos"],
  ["pedido-risco"],
  ["pedido-alerta"],
  ["pedido-relogio"],
  ["pedido-lastro-cobranca"],
  ["liberacao-expedicao-lote"],
  ["cobertura-pedidos"],
  ["cobertura-itens"],
  ["fila-analise-stages"],
  ["fila-por-apelido"],
  ["mesa-comercial-contagem"],
  ["mesa-comercial-card"],
  ["pedidos-pagamento-vencido-count"],
  ["fila-pedidos-priorizada"],
  ["prova-pagamento-lote"],
  ["candidatos-consolidacao"],
  ["pedido-venda-bling"],
  ["pedido-vinculos"],
  ["pedidos-complementares"],
];

/** Chaves por pedido — invalidadas por prefixo, independentemente do id. */
const CHAVES_POR_PEDIDO: readonly string[] = [
  "pedido-detalhe",
  "pedido",
  "pedido-adiantamento",
  "pedido-portao-regra",
  "pedido-destino-estoque",
  "triagem-pedido",
  "splits",
  "plano-aberto-pedido",
  "provisoes-pedido",
  "provisao-portao-pendente",
  "pedido-portao-provisorio",
  "pedido-priorizado",
  "pedido-eventos",
  "pedido-itens-split",
  // Hooks consumidos por PedidoDetalhe.tsx (nomes reais das chaves)
  "pedido-titulos", // usePedidoTitulos
  "remessas", // useRemessas
  "pedido-origens", // usePedidoOrigens
  "recebivel-familia", // useRecebivelFamilia
  "titulo-eixos-pedido", // useTituloEixosPedido
  "titulos-pedido-resumo", // useTitulosPedidoResumo
  "pedido-embalagem", // usePedidoEmbalagem
  "pedido-tarefas-vinculadas", // usePedidoTarefasVinculadas
  "prova-pagamento", // useProvaPagamento
  "frete-comparativo", // useFreteComparativo
  "pedido-rastreamento", // useRastreioPedido
  // Outras famílias por pedido já usadas por mutations de pedido
  "pedido-tarefas",
  "pedido-xpm",
  "envios-xpm",
  "nf-fila-pedido",
  "boletos-do-pedido",
  "gerenciar-links",
  "pedido-email-log",
];

export function invalidarPedido(qc: QueryClient, _pedidoId?: string | null): void {
  CHAVES_GLOBAIS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  CHAVES_POR_PEDIDO.forEach((prefixo) => qc.invalidateQueries({ queryKey: [prefixo] }));
}
