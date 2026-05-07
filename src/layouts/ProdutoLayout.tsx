import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Gift } from "lucide-react";
import { ProdutoSidebar } from "@/components/ProdutoSidebar";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { LayoutHeader } from "@/components/shared/LayoutHeader";

export default function ProdutoLayout() {
  useTrackPageVisit();
  usePrefetchTelas();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ProdutoSidebar />
        <div className="flex-1 flex flex-col">
          <LayoutHeader icon={Gift} nome="Produto Fetély" iconColor="#C77CA0" />
          <main className="flex-1 overflow-auto relative">
            <Outlet />
            <ReportarErroBotao />
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
