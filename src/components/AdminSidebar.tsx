import { useLocation } from "react-router-dom";
import { Shield } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const ADMIN_COLOR = "#1A4A3A";

export function AdminSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  // MENU-VIA-TABELA (21/08/2026): grupos, itens, rotulos, icones e ordem vem
  // da sncf_navegacao (app "mesa"). Mudar o menu de Mesa passa a ser UPDATE,
  // sem deploy. Achado na migracao: "Configurar Perfis" (/admin/usuarios/perfis)
  // ja existia na tabela e nunca tinha aparecido aqui — orfa corrigida de graca.
  const { grupos, soltos, isLoading: carregandoMenu } = useMenuApp("mesa");

  const isItemActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  const renderMenuItem = (item: ItemMenu) => {
    const active = isItemActive(item.rota);
    const Icone = resolverIcone(item.icone);
    return (
      <SidebarMenuItem key={item.chave}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.rota}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
              active && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm"
            )}
            style={active ? { borderLeftColor: ADMIN_COLOR, color: ADMIN_COLOR } : undefined}
          >
            <Icone className="h-[18px] w-[18px] shrink-0" style={active ? { color: ADMIN_COLOR } : undefined} />
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
              style={{ backgroundColor: ADMIN_COLOR }}
            >
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tracking-tight" style={{ color: ADMIN_COLOR }}>
                ADM SNCF
              </span>
              <span className="text-[11px] text-sidebar-muted">Configurações globais</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <AtalhosFixos />

        <div className="mx-4 border-t border-sidebar-border/40" />

        {!carregandoMenu && soltos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{soltos.map(renderMenuItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!carregandoMenu && grupos.map((g) => (
          <SidebarGroup key={g.chave}>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-medium mb-1 px-4">
                {g.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>{g.itens.map(renderMenuItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
