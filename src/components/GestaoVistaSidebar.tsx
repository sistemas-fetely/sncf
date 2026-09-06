/**
 * GestaoVistaSidebar — Sistema novo cravado em 29/04/2026.
 *
 * Recebe Dashboard + Relatórios (vindos do People Fetely).
 * Futuro: KPIs por área, Predictor IA, dashboards consolidados.
 *
 * URLs preservadas (/dashboard, /relatorios) — só layout muda.
 */

import { LayoutDashboard, BarChart3, Tv } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useVisibilidadeMenuFixo } from "@/hooks/useVisibilidadeMenu";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const GV_COLOR = "#2C5F7C"; // azul controller

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
}

const items: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Gestão à Vista", url: "/gestao-a-vista", icon: Tv },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
];

export function GestaoVistaSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { roles } = useAuth();
  const primaryRole = getHighestRoleLabel(roles);
  const location = useLocation();
  const { podeVer, isLoading: carregandoVisibilidade } = useVisibilidadeMenuFixo();
  const itensVisiveis = carregandoVisibilidade ? [] : items.filter((i) => podeVer(i.url));

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        {collapsed ? (
          // recolhida: o controle fica sozinho e centrado, sempre clicável para reabrir
          <div className="flex justify-center">
            <SidebarTrigger className="text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: GV_COLOR }}
            >
              <Tv className="h-5 w-5 text-white" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-sidebar-foreground tracking-tight">Gestão à Vista</span>
              <span className="text-[11px] text-sidebar-muted">KPIs & análises</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {itensVisiveis.length > 0 && (
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-medium mb-1 px-4">
              Análise
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {itensVisiveis.map((item) => {
                const active = isItemActive(item.url, item.end);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.end}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                          active && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm"
                        )}
                        style={active ? { borderLeftColor: GV_COLOR, color: GV_COLOR } : undefined}
                      >
                        <item.icon className={cn("h-[18px] w-[18px] shrink-0")} style={active ? { color: GV_COLOR } : undefined} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        {!collapsed && primaryRole && (
          <Badge variant="outline" className="text-[10px] w-fit border-sidebar-border/60 text-sidebar-muted">
            {primaryRole}
          </Badge>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
