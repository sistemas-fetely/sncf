import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CasaHeader } from "@/components/casa/CasaHeader";
import { CasaBottomNav } from "@/components/casa/CasaBottomNav";
import { useRegistrarNavegacao } from "@/hooks/useRegistrarNavegacao";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";

function CasaLayoutInner() {
  useRegistrarNavegacao();
  usePrefetchTelas();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <CasaHeader />
      <main className="flex-1 pb-16 md:pb-0">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <CasaBottomNav />
    </div>
  );
}

export function CasaLayout() {
  return (
    <ThemeProvider>
      <CasaLayoutInner />
    </ThemeProvider>
  );
}

export default CasaLayout;
