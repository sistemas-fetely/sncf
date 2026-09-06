/**
 * AppSidebar (People Fetely) — MENU-VIA-TABELA (21/08/2026).
 *
 * Itens, rótulos, ícones e ordem vêm da sncf_navegacao (app "pessoas") via
 * useMenuApp. Mudar esse menu passa a ser UPDATE, sem deploy.
 *
 * Achado na migração: 6 telas reais e funcionando (Onboarding, Movimentações,
 * Férias, Benefícios, Pagamentos PJ,
 * Notas Fiscais PJ) estavam com status='em_construcao' na tabela — dado
 * desatualizado, não o app. Corrigido pra 'pronta' antes desta migração
 * (senão useTelasVisiveis esconderia todas de quem não é super_admin).
 * Ponto, Avaliações e Treinamentos continuam em_construcao de propósito —
 * são PlaceholderPage de verdade, confirmado no código.
 */

import { Users, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { grupos, isLoading: carregandoMenu } = useMenuApp("pessoas");

  const isItemActive = (url: string) => location.pathname === url;

  const renderItem = (item: ItemMenu) => {
    const active = isItemActive(item.rota);
    const Icone = resolverIcone(item.icone);
    return (
      <SidebarMenuItem key={item.chave}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.rota}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
              active && "bg-sidebar-primary/20 text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary shadow-sm"
            )}
          >
            <Icone className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active && "text-sidebar-primary")} />
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
              style={{ backgroundColor: "#1A4A3A" }}
            >
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tracking-tight" style={{ color: "#1A4A3A" }}>People Fetely</span>
              <span className="text-[11px] text-sidebar-muted">Gestão de Pessoas</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {!carregandoMenu && grupos.map((g) => (
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
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
