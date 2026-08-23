/**
 * AdministrativoSidebar — Pilar novo cravado em 29/04/2026.
 *
 * MENU-VIA-TABELA (21/08/2026): o grupo Patrimônio (Contratos, Imóveis,
 * Seguros, GED) vem da sncf_navegacao (app "patrimonio") via useMenuApp.
 * Mudar esse menu passa a ser UPDATE, sem deploy.
 *
 * Em 23/08/2026 o grupo "Documentos" (NFs em Stage, Importar Dados, Motor de
 * Classificação, Documentos Pendentes) foi movido na sncf_navegacao de
 * `financas` para `patrimonio` — as 4 rotas sempre viveram sob
 * /administrativo-fetely. Antes disso apareciam nos DOIS menus: aqui por
 * hardcode, e em Finanças pela tabela. Agora vêm só da tabela, como o resto.
 * A permissão segue `tela.fin_documentos`: menu é lugar, permissão é quem pode.
 */

import { Landmark } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import { AtalhoMeuEspaco } from "@/components/navegacao/AtalhoMeuEspaco";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";


const ADM_FETELY_COLOR = "#6B5B45"; // tom terroso, distinto do verde Financeiro

export function AdministrativoSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { roles } = useAuth();
  const primaryRole = getHighestRoleLabel(roles);
  const location = useLocation();
  const { grupos, soltos: patrimonioSoltos, isLoading: carregandoMenu } = useMenuApp("patrimonio");

  const isItemActive = (url: string) =>
    location.pathname === url || location.pathname.startsWith(url + "/");

  const renderTabelaItem = (item: ItemMenu) => {
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
            style={active ? { borderLeftColor: ADM_FETELY_COLOR, color: ADM_FETELY_COLOR } : undefined}
          >
            <Icone className="h-[18px] w-[18px] shrink-0" style={active ? { color: ADM_FETELY_COLOR } : undefined} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

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
              <span className="text-sm font-medium text-sidebar-foreground tracking-tight">Administrativo Fetély</span>
              <span className="text-[11px] text-sidebar-muted">BackOffice da empresa</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <AtalhoMeuEspaco />

        <div className="mx-4 border-t border-sidebar-border/40" />

        {!carregandoMenu && patrimonioSoltos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{patrimonioSoltos.map(renderTabelaItem)}</SidebarMenu>
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
              <SidebarMenu>{g.itens.map(renderTabelaItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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

