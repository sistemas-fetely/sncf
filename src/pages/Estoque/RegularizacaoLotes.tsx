import { Navigate } from "react-router-dom";

/** Lista antiga: os lotes agora moram em Transferências Internas › Com retorno de remessa. */
export default function RegularizacaoLotes() {
  return <Navigate to="/pedidos/transferencias?aba=retorno" replace />;
}
