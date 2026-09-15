/**
 * ChamadosLayout — CHAMADOS-É-APP-PRÓPRIO (15/09/2026).
 *
 * Cópia estrutural do MeuEspacoLayout: o app Chamados já é de primeiro nível
 * na sncf_navegacao (nivel='app', pai_chave=null) e agora o roteador
 * acompanha — antes as rotas moravam no VendasLayout e a Central abria com a
 * sidebar do SOPs. Diferença em relação ao Meu Espaço: sem manutenção de
 * tarefas (rodarManutencaoTarefas é do Meu Espaço, não daqui).
 */

import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChamadosSidebar } from "@/components/ChamadosSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { MobileSidebarTrigger } from "@/components/navegacao/MobileSidebarTrigger";

export default function ChamadosLayout() {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-background">
        <ChamadosSidebar />
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
