import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SNCFSidebar } from "@/components/SNCFSidebar";
import { useTrackPageVisit } from "@/hooks/useTrackPageVisit";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { usePrefetchTelas } from "@/hooks/usePrefetchTelas";

export default function SNCFLayout() {
  useTrackPageVisit();
  usePrefetchTelas();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SNCFSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 p-6 overflow-auto bg-background relative min-w-0">
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


