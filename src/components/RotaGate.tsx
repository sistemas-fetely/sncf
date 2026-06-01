import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { usePermissoesDoUsuario, TELAS_PUBLICAS } from "@/hooks/usePermissoesDoUsuario";

export function RotaGate({ children }: { children: ReactNode }) {
  const { roles, loading } = useAuth();
  const location = useLocation();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas, isLoading } = usePermissoesDoUsuario();

  // Aguarda auth ou carregamento de permissões (apenas para não-super_admin)
  if (loading || (!isSuperAdmin && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // super_admin vê tudo, inclusive telas em construção
  if (isSuperAdmin) return <>{children}</>;

  const regra = resolverRegraRota(location.pathname);

  // Rota não registrada → nega
  if (!regra) return <Navigate to="/sem-permissao" replace />;

  // Em construção → nega (independente de grupo)
  if (regra.status === "em_construcao") return <Navigate to="/sem-permissao" replace />;

  // Telas públicas: qualquer aprovado passa sem checar grupo
  if (regra.tela_slug && TELAS_PUBLICAS.has(regra.tela_slug)) return <>{children}</>;

  // Sem slug ou grupo não tem permissão → nega
  if (!regra.tela_slug || !permitidas?.has(regra.tela_slug)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
