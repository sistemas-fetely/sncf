import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { usePermissoesDoUsuario, TELAS_PUBLICAS, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import { useRotasConfig, resolverRegraRotaBanco } from "@/hooks/useRotasConfig";

export function RotaGate({ children }: { children: ReactNode }) {
  const { roles, loading } = useAuth();
  const location = useLocation();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas, isLoading } = usePermissoesDoUsuario();
  const { data: rotasBanco, isLoading: isLoadingRotas } = useRotasConfig();

  // super_admin vê tudo — nem espera o banco carregar.
  if (isSuperAdmin) return <>{children}</>;

  // Aguarda auth, permissões e config de rotas (só para não-super_admin).
  if (loading || isLoading || isLoadingRotas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Regra do banco (fonte ao vivo). Se não houver, fallback para o código.
  const regraBanco = resolverRegraRotaBanco(location.pathname, rotasBanco);
  const regraCodigo = resolverRegraRota(location.pathname);

  // Merge: status vem do banco se a rota estiver lá; o tela_slug também.
  // Se o banco não tem a rota (ou falhou), usa a regra do código inteira.
  const regra = regraBanco ?? regraCodigo;

  // Rota não registrada em lugar nenhum → nega
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
