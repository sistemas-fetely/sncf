import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { VendasSidebar } from "@/components/vendas/VendasSidebar";

export default function VendasLayout() {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-[calc(100vh-4rem)] bg-background">
        <VendasSidebar />
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
