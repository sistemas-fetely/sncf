/**
 * Conciliação de recebimento — fundida na casa /recebimento/conciliacao.
 *
 * A antiga aba "Por pedido" morreu: o recebível é lido no eixo canônico
 * CLIENTE → TÍTULOS → PROVA (aba "Por cliente"). O pedido é rastro.
 * O componente RecebimentoPorPedido segue no repositório, sem uso aqui.
 */
import { Navigate } from "react-router-dom";

// Rota antiga viva: link salvo cai na casa nova, na aba certa.
export default function RecebimentosConciliar() {
  return <Navigate to="/recebimento/conciliacao?aba=por-cliente" replace />;
}
