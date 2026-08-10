import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Portão de AUTENTICAÇÃO apenas. Autorização é responsabilidade do
 * RotaGate (sncf_navegacao / permissoes_catalogo) e das RLS no banco.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, roles, loading, approved } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!approved && !roles.includes("super_admin")) {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }

  return <>{children}</>;
}
