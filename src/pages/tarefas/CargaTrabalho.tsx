// CARGA-MORA-NA-MESA (09/09/2026): /tarefas/carga virou a aba "Carga" da
// Mesa do Gestor. Esta rota só redireciona para não quebrar link salvo/favorito.
import { Navigate } from "react-router-dom";

export default function CargaTrabalho() {
  return <Navigate to="/tarefas/mesa-gestor?aba=carga" replace />;
}
