import { Navigate } from "react-router-dom";

export default function ConfigurarPerfis() {
  return <Navigate to="/gerenciar-usuarios?aba=perfis" replace />;
}
