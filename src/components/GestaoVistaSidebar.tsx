/**
 * GestaoVistaSidebar — Sistema novo cravado em 29/04/2026.
 *
 * Recebe Dashboard + Relatórios (vindos do People Fetely).
 * Futuro: KPIs por área, Predictor IA, dashboards consolidados.
 *
 * URLs preservadas (/dashboard, /relatorios) — só layout muda.
 */

import { LayoutDashboard, BarChart3, Tv, ClipboardList, UsersRound } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
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

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: GV_COLOR }}
          >
            <Tv className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">Gestão à Vista</span>
              <span className="text-[11px] text-sidebar-muted">KPIs & análises</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        {/* Tarefas — acesso direto */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/tarefas"
                    end
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                      location.pathname === "/tarefas" && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm"
                    )}
                    style={location.pathname === "/tarefas" ? { borderLeftColor: GV_COLOR, color: GV_COLOR } : undefined}
                  >
                    <ClipboardList className="h-[18px] w-[18px] shrink-0" style={location.pathname === "/tarefas" ? { color: GV_COLOR } : undefined} />
                    {!collapsed && <span>Minhas Tarefas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {roles.some((r) => ["gestor_direto", "gestor_rh", "admin_rh", "super_admin"].includes(r)) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/tarefas/time"
                      className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                    >
                      <UsersRound className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>Tarefas do Time</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="mx-4 border-t border-sidebar-border/40" />

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
              Análise
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
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
