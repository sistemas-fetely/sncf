/** BILayout — app BI de primeiro nível (28/10/2026), cópia estrutural do ChamadosLayout. */
import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { BISidebar } from "@/components/BISidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { MobileSidebarTrigger } from "@/components/navegacao/MobileSidebarTrigger";

export default function BILayout() {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-background">
        <BISidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 relative min-w-0">
            <MobileSidebarTrigger />
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
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
