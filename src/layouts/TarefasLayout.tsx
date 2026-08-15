import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TarefasSidebar } from "@/components/TarefasSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";

export default function TarefasLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <TarefasSidebar />
        <div className="flex flex-1 flex-col">
          <main className="relative flex-1 overflow-auto">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center p-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
