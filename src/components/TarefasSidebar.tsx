/**
 * TarefasSidebar — Módulo Tarefas (F1).
 * Todos os itens do módulo navegam.
 */

import {
  CalendarDays, CheckCheck, Gauge, LayoutGrid, ListChecks, Repeat, Sun, UsersRound,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const TAREFAS_COLOR = "#2563EB";

interface ItemTarefas {
  title: string;
  url?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
}

const itensAtivos: ItemTarefas[] = [
  { title: "Hoje", url: "/tarefas/hoje", icon: Sun },
  { title: "Minhas Tarefas", url: "/tarefas/minhas", icon: ListChecks },
  { title: "Projetos", url: "/tarefas/projetos", icon: LayoutGrid },
  { title: "Calendário", url: "/tarefas/calendario", icon: CalendarDays },
  { title: "Carga", url: "/tarefas/carga", icon: Gauge },
  { title: "Recorrências", url: "/tarefas/recorrencias", icon: Repeat },
  { title: "Templates", url: "/tarefas/templates", icon: CheckCheck },
  { title: "Meu Time", url: "/tarefas/time", icon: UsersRound },
];

export function TarefasSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: TAREFAS_COLOR }}
          >
            <ListChecks className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium tracking-tight text-sidebar-foreground">Tarefas</span>
              <span className="text-[11px] text-sidebar-muted">O que precisa sair hoje</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="space-y-1 px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {itensAtivos.map((item) => {
                const active = location.pathname.startsWith(item.url!);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url!}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          active && "bg-sidebar-accent font-medium border-l-[3px] shadow-sm"
                        )}
                        style={active ? { borderLeftColor: TAREFAS_COLOR, color: TAREFAS_COLOR } : undefined}
                      >
                        <item.icon
                          className="h-[18px] w-[18px] shrink-0"
                          style={active ? { color: TAREFAS_COLOR } : undefined}
                        />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
