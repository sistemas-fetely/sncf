import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tv } from "lucide-react";
import { GestaoVistaSidebar } from "@/components/GestaoVistaSidebar";
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
