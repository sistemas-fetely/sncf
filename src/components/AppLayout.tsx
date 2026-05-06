import { useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { Outlet } from "react-router-dom";
import { SystemReadinessBanner } from "@/components/shared/SystemReadinessBanner";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";
import { useRegistrarNavegacao } from "@/hooks/useRegistrarNavegacao";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";

// Pré-carrega chunks lazy das telas mais usadas em idle.
// Acontece uma vez quando o AppLayout monta (após login).
function usePrefetchTelasPrincipais() {
  useEffect(() => {
    const prefetchAll = () => {
      void import("@/pages/administrativo/InvestimentoLancamento");
      void import("@/pages/administrativo/FluxoFuturoInvestimento");
      void import("@/pages/administrativo/DashboardFinanceiro");
      void import("@/pages/administrativo/Contratos");
      void import("@/pages/administrativo/ContasPagar");
      void import("@/pages/administrativo/ContasReceber");
      void import("@/pages/administrativo/CaixaBanco");
      void import("@/pages/administrativo/PlanoDeContas");
      void import("@/pages/administrativo/Parceiros");
      void import("@/pages/Pessoas");
      void import("@/components/ged/PastaDetalhe");
    };

    if ("requestIdleCallback" in window) {
      const id = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(prefetchAll, { timeout: 3000 });
      return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    } else {
      const id = setTimeout(prefetchAll, 800);
      return () => clearTimeout(id);
    }
  }, []);
}

export function AppLayout() {
  useRegistrarNavegacao();
  usePrefetchTelasPrincipais();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <AppHeader />
          <main className="flex-1 p-6 overflow-auto relative">
            <SystemReadinessBanner somenteCriticos className="mb-4" />
            <Outlet />
            <ReportarErroBotao />
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
