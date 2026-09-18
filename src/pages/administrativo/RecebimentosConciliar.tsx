/**
 * Conciliação de recebimento — fundida na casa /recebimento/conciliacao (F2).
 *
 * O que sobrou desta tela é a visão da escada de prova por pedido, que virou
 * a aba "Por pedido" da casa nova (componente `ConciliacaoPorPedido`).
 *
 * A aba "Extrato órfão" (vw_fila_creditos_nao_conciliados) MORREU nesta fusão:
 * era a versão pobre da mesma população que a Mesa de Conciliação mostra rica,
 * hoje na aba "Créditos do banco".
 */
import { Navigate } from "react-router-dom";
import { RecebimentoPorPedido } from "@/components/financeiro/RecebimentoPorPedido";

/** Conteúdo da aba "Por pedido" da casa de Conciliação de Recebíveis. */
export function ConciliacaoPorPedido() {
  return <RecebimentoPorPedido />;
}

// Rota antiga viva: link salvo cai na casa nova, na aba certa.
export default function RecebimentosConciliar() {
  return <Navigate to="/recebimento/conciliacao?aba=por-pedido" replace />;
}
