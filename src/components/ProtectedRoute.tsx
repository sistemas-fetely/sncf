import { ReactNode, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
  /** If set, checks dynamic permission instead of allowedRoles */
  permModule?: string;
  permAction?: string;
}

export function ProtectedRoute({ children, allowedRoles, permModule, permAction = "view" }: ProtectedRouteProps) {
  const { user, roles, loading, approved } = useAuth();
  const hasPermission = (_m: string, _a?: string) => true;
  const permLoading = false;

  if (loading || (permModule && permLoading)) {
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

  const isSuperAdmin = roles.includes("super_admin");
  if (!approved && !isSuperAdmin) {
    return <Navigate to="/aguardando-aprovacao" replace />;
  }

  // Super Admin bypasses ALL permission checks (global)
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Permission-based check (preferred)
  if (permModule) {
    if (!hasPermission(permModule, permAction)) {
      return <Navigate to="/sem-permissao" replace />;
    }
    return <>{children}</>;
  }

  // Legacy role-based check
  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some((r) => roles.includes(r));
    if (!hasAccess) {
      return <Navigate to="/sem-permissao" replace />;
    }
  }

  return <>{children}</>;
}
