import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tv } from "lucide-react";
import { GestaoVistaSidebar } from "@/components/GestaoVistaSidebar";
import { ReportarErroBotao } from "@/components/shared/ReportarErroBotao";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { LayoutHeader } from "@/components/shared/LayoutHeader";

export default function GestaoVistaLayout() {
  useTrackPageVisit();
  usePrefetchTelas();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <GestaoVistaSidebar />
        <div className="flex-1 flex flex-col">
          <LayoutHeader icon={Tv} nome="Gestão à Vista" iconColor="#2C5F7C" />
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
