import { Navigate } from "react-router-dom";

export default function ConfigurarPerfis() {
  return <Navigate to="/admin/usuarios?aba=grupos" replace />;
}
