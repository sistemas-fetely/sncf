/**
 * AdministrativoSidebar — Pilar novo cravado em 29/04/2026.
 *
 * Recebe itens que vieram do Financeiro Fetely:
 *   - Contratos, Imóveis, Seguros, GED
 *   - Pedidos de Venda ⚠️, Produtos ⚠️ (provisórios — podem migrar pra Produto Fetely)
 *
 * Doutrina das três casas: este sidebar reflete o que está em
 * sncf_documentacao slug "arquitetura-sistemas-fetely" v2 → seção 3 → Administrativo Fetely.
 */

import { Building2, ShieldCheck, FileSignature, FolderArchive, ShoppingCart, ClipboardList, UsersRound, Landmark, Users, Upload, Layers, FileWarning } from "lucide-react";
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

const ADM_FETELY_COLOR = "#6B5B45"; // tom terroso, distinto do verde Financeiro

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
  badge?: string;
}

// Grupo 1: Ativos & Patrimônio
const patrimonioItems: MenuItem[] = [
  { title: "Contratos", url: "/administrativo-fetely/contratos", icon: FileSignature },
  { title: "Imóveis", url: "/administrativo-fetely/imoveis", icon: Building2 },
  { title: "Seguros", url: "/administrativo-fetely/seguros", icon: ShieldCheck },
  { title: "GED", url: "/administrativo-fetely/ged", icon: FolderArchive },
];

// Grupo 2: Parceiros & Rede — "Parceiros Comerciais" migrado pro app Vendas em 31/05/2026.
const parceirosItems: MenuItem[] = [];

// Grupo 3: Vendas & Produtos — "Produtos" migrado pro app Vendas em 08/06/2026.
const vendasItems: MenuItem[] = [];

// Grupo 4: Documentos (migrado de Finanças em 31/05/2026)
const documentosItems: MenuItem[] = [
  { title: "Importar Dados", url: "/administrativo-fetely/importar", icon: Upload },
  { title: "NFs em Stage", url: "/administrativo-fetely/nfs-stage", icon: Layers },
  { title: "Documentos Pendentes", url: "/administrativo-fetely/documentos-pendentes", icon: FileWarning },
];

export function AdministrativoSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { roles } = useAuth();
  const primaryRole = getHighestRoleLabel(roles);
  const location = useLocation();

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  const renderItem = (item: MenuItem) => {
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
            style={active ? { borderLeftColor: ADM_FETELY_COLOR, color: ADM_FETELY_COLOR } : undefined}
          >
            <item.icon className={cn("h-[18px] w-[18px] shrink-0")} style={active ? { color: ADM_FETELY_COLOR } : undefined} />
            {!collapsed && (
              <span className="flex-1 flex items-center gap-2">
                {item.title}
                {item.badge && (
                  <Badge variant="outline" className="text-[9px] py-0 px-1">{item.badge}</Badge>
                )}
              </span>
            )}
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
        <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: ADM_FETELY_COLOR }}
          >
            <Landmark className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">Administrativo Fetély</span>
              <span className="text-[11px] text-sidebar-muted">BackOffice da empresa</span>
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
                    style={location.pathname === "/tarefas" ? { borderLeftColor: ADM_FETELY_COLOR, color: ADM_FETELY_COLOR } : undefined}
                  >
                    <ClipboardList className="h-[18px] w-[18px] shrink-0" style={location.pathname === "/tarefas" ? { color: ADM_FETELY_COLOR } : undefined} />
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

        {renderGroup("Ativos & Patrimônio", patrimonioItems)}
        <div className="mx-4 border-t border-sidebar-border/40" />
        {renderGroup("Documentos", documentosItems)}
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
