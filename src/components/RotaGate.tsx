import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolverRegraRota } from "@/config/rotasRegistry";
import { usePermissoesDoUsuario, TELAS_PUBLICAS, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import { useNavegacaoPortao, resolverRegraNavegacao } from "@/hooks/useNavegacaoPortao";
import { useRotaNaoDeclarada } from "@/hooks/useRotaNaoDeclarada";

export function RotaGate({ children }: { children: ReactNode }) {
  const { roles, loading } = useAuth();
  const location = useLocation();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas, isLoading } = usePermissoesDoUsuario();
  const { data: nav, isLoading: isLoadingNav } = useNavegacaoPortao();

  // Guarda de nascimento. Roda ANTES do bypass, de proposito — quem constroi
  // tela nova e super_admin e nao perceberia que ela nasceu invisivel.
  // Nao bloqueia render: e useEffect e so dispara quando as duas fontes falham.
  useRotaNaoDeclarada(location.pathname, nav, isLoadingNav, isSuperAdmin);


  // super_admin vê tudo — exceto rotas de app exclusivo, que exigem concessão
  // real. Por isso, para super_admin, só espera a navegação (não as permissões).
  const regraNavPre = resolverRegraNavegacao(location.pathname, nav);
  if (isSuperAdmin && !isLoadingNav && !regraNavPre?.exclusivo_slug) return <>{children}</>;

  // Aguarda auth, permissões e navegação.
  if (loading || isLoading || isLoadingNav) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Doutrina MENU-VIA-TABELA: sncf_navegacao manda.
  // rotasRegistry.ts é fallback de rollback até o passo 6 da ordem de desmonte.
  const regraNav = resolverRegraNavegacao(location.pathname, nav);
  const regraCodigo = resolverRegraRota(location.pathname);

  // App exclusivo: concessão real do slug do app (sem atalho de super_admin)
  // e depois a regra normal da própria tela, também sem atalho.
  if (regraNav?.exclusivo_slug && !temPermissaoTela(regraNav.exclusivo_slug, permitidas)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  // Rota não registrada em lugar nenhum → nega (fail-closed).
  if (!regraNav && !regraCodigo) return <Navigate to="/sem-permissao" replace />;

  // Usa UMA fonte inteira, nunca campos misturados.
  const status = regraNav ? regraNav.status : regraCodigo!.status;
  const slug = regraNav ? regraNav.tela_slug : regraCodigo!.tela_slug;
  // No rotasRegistry, tela_slug null significava "só super_admin".
  const apenasSuperAdmin = regraNav ? regraNav.apenas_super_admin : regraCodigo!.tela_slug === null;

  // Em construção → nega (independente de grupo)
  if (status === "em_construcao") return <Navigate to="/sem-permissao" replace />;

  // Zona restrita a super_admin (já retornamos acima se fosse super_admin)
  if (apenasSuperAdmin) return <Navigate to="/sem-permissao" replace />;

  // Telas públicas: qualquer aprovado passa sem checar grupo
  if (slug && TELAS_PUBLICAS.has(slug)) return <>{children}</>;

  // Sem slug ou grupo não tem permissão → nega (helper aplica guarda-chuva de Finanças)
  if (!temPermissaoTela(slug, permitidas)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
