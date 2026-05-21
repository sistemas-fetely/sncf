import { Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminFinanceiroSidebar } from "@/components/AdminFinanceiroSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Wallet } from "lucide-react";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { LayoutHeader } from "@/components/shared/LayoutHeader";

export default function AdminFinanceiroLayout() {
  const { user, roles, loading } = useAuth();
  useTrackPageVisit();
  usePrefetchTelas();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Pilar restrito a super_admin (Fase 1)
  if (!roles.includes("super_admin")) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminFinanceiroSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Nome corrigido: este é o pilar Financeiro Fetely (não confundir com Administrativo Fetely, que é pilar separado) */}
          <LayoutHeader icon={Wallet} nome="Financeiro Fetély" />
          <main className="flex-1 overflow-auto relative min-w-0">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full p-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            }>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
