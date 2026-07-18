import { Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { FinancasContextSidebar } from "@/components/financas/FinancasContextSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function FinancasLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Controle de acesso delegado ao RotaGate (tela_slug: "tela.financeiro").
  // Quem chega aqui já foi validado pelo RotaGate. Não duplicar a guarda.


  return (
    <SidebarProvider>
      <div className="flex w-full min-h-[calc(100vh-4rem)] bg-background">
        <FinancasContextSidebar />
        <main className="flex-1 overflow-auto relative min-w-0">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full p-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </SidebarProvider>
  );
}
