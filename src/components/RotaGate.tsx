import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolverRegraRota, perfilDoEmail } from "@/config/rotasRegistry";

// Portão de acesso por rota (DEFAULT-DENY).
// Fica DENTRO de <ProtectedRoute> (auth + aprovação já garantidos)
// e ENVOLVE o layout. Decide por pathname antes de renderizar a tela.
export function RotaGate({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const location = useLocation();

  const isSuperAdmin = roles.includes("super_admin");

  // 1. super_admin passa em TUDO (inclusive em_construcao).
  if (isSuperAdmin) return <>{children}</>;

  // 2. Resolve a regra da rota atual. Não listada = DENY.
  const regra = resolverRegraRota(location.pathname);
  if (!regra) return <Navigate to="/sem-permissao" replace />;

  // 3. Em construção = só super_admin (já passou). Bloqueia o resto.
  if (regra.status === "em_construcao") {
    return <Navigate to="/sem-permissao" replace />;
  }

  // 4. Pronta = checa o perfil do usuário.
  const perfil = perfilDoEmail(user?.email);
  if (!regra.perfis.includes(perfil)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
