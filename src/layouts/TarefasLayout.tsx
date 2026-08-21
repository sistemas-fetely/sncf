import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays, CheckCheck, Compass, Gauge, Inbox, LayoutGrid, ListChecks, Repeat, Sun, UsersRound,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { CommandPaletteProvider } from "@/components/navegacao/CommandPaletteProvider";
import { SinoNotificacoes } from "@/components/shared/SinoNotificacoes";
import { rodarManutencaoTarefas } from "@/hooks/tarefas/useNotificacoesTarefas";

const ITENS = [
  { title: "Hoje", url: "/tarefas/hoje", icon: Sun },
  { title: "Minhas Tarefas", url: "/tarefas/minhas", icon: ListChecks },
  { title: "Projetos", url: "/tarefas/projetos", icon: LayoutGrid },
  { title: "Calendário", url: "/tarefas/calendario", icon: CalendarDays },
  { title: "Carga", url: "/tarefas/carga", icon: Gauge },
  { title: "Recorrências", url: "/tarefas/recorrencias", icon: Repeat },
  { title: "Templates", url: "/tarefas/templates", icon: CheckCheck },
  { title: "Meu Time", url: "/tarefas/time", icon: UsersRound },
  { title: "Fila de Processos", url: "/tarefas/fila", icon: Inbox },
  // GESTAO-E-ABA-DE-TAREFAS (21/08/2026): Sala de Gestão vive dentro de Tarefas
  { title: "Gestão", url: "/tarefas/gestao", icon: Compass },
];

export default function TarefasLayout() {
  const rodou = useRef(false);
  const location = useLocation();

  useEffect(() => {
    if (rodou.current) return;
    rodou.current = true;
    // uma vez por sessão, silencioso: gera recorrentes e avisos de prazo
    void rodarManutencaoTarefas();
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur-sm">
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
          {ITENS.map((item) => {
            const active = location.pathname.startsWith(item.url);
            return (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm transition-colors",
                  active
                    ? "border-b-2 border-gold text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto shrink-0">
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
      <CommandPaletteProvider />
    </div>
  );
}
