import { Suspense, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TarefasSidebar } from "@/components/TarefasSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { SinoNotificacoes } from "@/components/shared/SinoNotificacoes";
import { rodarManutencaoTarefas } from "@/hooks/tarefas/useNotificacoesTarefas";


export default function TarefasLayout() {
  const rodou = useRef(false);

  useEffect(() => {
    if (rodou.current) return;
    rodou.current = true;
    // uma vez por sessão, silencioso: gera recorrentes e avisos de prazo
    void rodarManutencaoTarefas();
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <TarefasSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto">
              <SinoNotificacoes />
            </div>
          </header>

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
