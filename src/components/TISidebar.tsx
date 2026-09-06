import { Monitor, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useMenuApp } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const TI_COLOR = "#3A7D6B";

export function TISidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, profile, signOut, roles } = useAuth();
  const primaryRole = getHighestRoleLabel(roles);
  const location = useLocation();

  // MENU-VIA-TABELA: grupos, itens, rotulos, icones e ordem vem da
  // sncf_navegacao. Mudar o menu de TI passa a ser UPDATE, sem deploy.
  const { grupos, soltos } = useMenuApp("ti");

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";

  const displayName = profile?.full_name || user?.email || "Usuário";

  const ativa = (url: string) => location.pathname === url || location.pathname.startsWith(url + "/");

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
      active && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm"
    );

  const linkStyle = (active: boolean) =>
    active ? { borderLeftColor: TI_COLOR, color: TI_COLOR } : undefined;

  const renderItem = (item: { chave: string; label: string; icone: string | null; rota: string }) => {
    const active = ativa(item.rota);
    const Icone = resolverIcone(item.icone);
    return (
      <SidebarMenuItem key={item.chave}>
        <SidebarMenuButton asChild>
          <NavLink to={item.rota} className={linkClass(active)} style={linkStyle(active)}>
            <Icone className="h-[18px] w-[18px] shrink-0" style={active ? { color: TI_COLOR } : undefined} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

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
              style={{ backgroundColor: TI_COLOR }}
            >
              <Monitor className="h-5 w-5 text-white" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-sidebar-foreground tracking-tight">TI Fetély</span>
              <span className="text-[11px] text-sidebar-muted">Gestão de TI</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {soltos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{soltos.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {grupos.map((g) => (
          <SidebarGroup key={g.chave}>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-medium mb-1 px-4">
                {g.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>{g.itens.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white shadow-sm"
                style={{ backgroundColor: TI_COLOR }}
              >
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</span>
                <Badge variant="outline" className="text-[10px] w-fit border-sidebar-border/60 text-sidebar-muted mt-0.5">
                  {primaryRole}
                </Badge>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
