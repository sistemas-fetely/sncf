/**
 * AcervoLayout — MENU-VIA-TABELA (23/08/2026).
 *
 * Substitui a barra de abas (Processos | Documentação) por sidebar lateral,
 * no mesmo padrão dos outros pilares (MeuEspacoLayout/TILayout). A cor do
 * pilar (#1A4A3A) migrou da constante ACERVO_COLOR para a AcervoSidebar.
 *
 * Além das listagens, o layout também envolve as telas do Fala Fetely
 * (/fala-fetely, /fala-fetely/conhecimento) — exceto /fala-fetely/memorias,
 * que é do Meu Espaço. O Portal SNCF (/sncf) foi desmontado em 23/08/2026.
 */

import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AcervoSidebar } from "@/components/AcervoSidebar";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";

export default function AcervoLayout() {
  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen bg-background">
        <AcervoSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur-sm">
            <SidebarTrigger className="-ml-1" />
          </header>
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
      </div>
      <CommandPaletteProvider />
    </SidebarProvider>
  );
}
