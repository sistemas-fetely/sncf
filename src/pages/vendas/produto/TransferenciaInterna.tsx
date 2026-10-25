import { Navigate } from "react-router-dom";

/** Rota antiga: a transferência entre CDs de SP mora em Transferências Internas → Nova transferência. */
export default function TransferenciaInterna() {
  return <Navigate to="/pedidos/transferencias?aba=nova&tipo=entre_cds" replace />;
}
