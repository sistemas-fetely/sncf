/**
 * MeuEspacoLayout — MENU-VIA-TABELA (22/08/2026).
 *
 * Substitui o TarefasLayout (abas horizontais) por sidebar lateral, no mesmo
 * padrão dos outros 4 pilares fixos do rodapé (Casa/SOPs/Finanças/Pessoas).
 * URLs preservadas — só o layout muda (mesmo padrão usado quando Gestão à
 * Vista assumiu Dashboard/Relatórios em 29/04/2026).
 *
 * Mantém a manutenção silenciosa de tarefas (recorrentes + avisos de prazo,
 * uma vez por sessão) e o sino de notificações que viviam no TarefasLayout.
 */

import { Suspense, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MeuEspacoSidebar } from "@/components/MeuEspacoSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { SinoNotificacoes } from "@/components/shared/SinoNotificacoes";
import { rodarManutencaoTarefas } from "@/hooks/tarefas/useNotificacoesTarefas";

export default function MeuEspacoLayout() {
  const rodou = useRef(false);

  useEffect(() => {
    if (rodou.current) return;
    rodou.current = true;
    // uma vez por sessão, silencioso: gera recorrentes e avisos de prazo
    void rodarManutencaoTarefas();
  }, []);

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-background">
        <MeuEspacoSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto">
              <SinoNotificacoes />
            </div>
          </header>
          <main className="flex-1 relative min-w-0">
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
