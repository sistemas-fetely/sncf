/**
 * MeuEspacoLayout — MENU-VIA-TABELA (22/08/2026).
 *
 * Substitui o TarefasLayout (abas horizontais) por sidebar lateral, no mesmo
 * padrão dos outros 4 pilares fixos do rodapé (Casa/SOPs/Finanças/Pessoas).
 * URLs preservadas — só o layout muda (mesmo padrão usado quando Gestão à
 * Vista assumiu Dashboard/Relatórios em 29/04/2026).
 *
 * Mantém a manutenção silenciosa de tarefas (recorrentes + avisos de prazo,
 * uma vez por sessão). O sino de notificações subiu para o header global da
 * Casa (CasaHeader) e não é mais renderizado aqui.
 */

import { Suspense, useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MeuEspacoSidebar } from "@/components/MeuEspacoSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
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
          {/* a faixa com o botão de recolher morreu: o controle mora no topo da própria sidebar */}
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
