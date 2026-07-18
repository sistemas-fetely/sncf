import { useLocation } from "react-router-dom";
import {
  Sliders, Settings, UserCog, Shield,
  ClipboardList, UsersRound, FilePlus, Eye,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const ADMIN_COLOR = "#1A4A3A";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
}

// Grupo 2: Pessoas & Acessos
const pessoasItems: MenuItem[] = [
  { title: "Gerenciar Usuários", url: "/admin/usuarios", icon: UserCog },
];

// Grupo 3: Sistema
const sistemaItems: MenuItem[] = [
  { title: "Parâmetros", url: "/admin/parametros", icon: Sliders },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
  { title: "Importações PDF", url: "/admin/importacoes-pdf", icon: FilePlus },
];

// MIGRADOS na Sprint 2 (29/04/2026):
//   - Cargos e Salários → People Fetely (já estava lá; removido daqui pra evitar duplicação)
//   - Reportes do Sistema → TI Fetely

export function AdminSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { roles } = useAuth();
  const collapsed = state === "collapsed";

  const sistemaItemsFinal: MenuItem[] = [
    ...sistemaItems,
    ...(roles.includes("super_admin")
      ? [{ title: "Visibilidade de Telas", url: "/admin/visibilidade", icon: Eye }]
      : []),
  ];

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  const renderMenuItem = (item: MenuItem) => {
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
            style={active ? { borderLeftColor: ADMIN_COLOR, color: ADMIN_COLOR } : undefined}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" style={active ? { color: ADMIN_COLOR } : undefined} />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (label: string, items: MenuItem[]) => (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>{items.map(renderMenuItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: ADMIN_COLOR }}
          >
            <Shield className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight" style={{ color: ADMIN_COLOR }}>
                ADM SNCF
              </span>
              <span className="text-[11px] text-sidebar-muted">Configurações globais</span>
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
                    style={location.pathname === "/tarefas" ? { borderLeftColor: ADMIN_COLOR, color: ADMIN_COLOR } : undefined}
                  >
                    <ClipboardList className="h-[18px] w-[18px] shrink-0" style={location.pathname === "/tarefas" ? { color: ADMIN_COLOR } : undefined} />
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
        {renderGroup("Pessoas & Acessos", pessoasItems)}
        <div className="mx-4 border-t border-sidebar-border/40" />
        {renderGroup("Sistema", sistemaItemsFinal)}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        {!collapsed && (
          <Badge variant="outline" className="text-[10px] w-fit border-sidebar-border/60 text-sidebar-muted">
            Área restrita
          </Badge>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
