/**
 * AcervoSidebar — MENU-VIA-TABELA (23/08/2026).
 *
 * Substitui a barra de abas do antigo AcervoLayout (só Processos |
 * Documentação) por uma sidebar lateral de verdade, no mesmo padrão de
 * Casa/SOPs/Finanças/Pessoas/Meu Espaço/TI.
 *
 * Itens, rótulos, ícones e ordem vêm da sncf_navegacao (app "acervo"),
 * em 3 grupos: Conhecimento (Processos, Documentação, Manual, Glossário),
 * Fala Fetely (Fala Fetely, Base de Conhecimento) e Portal (Portal SNCF).
 *
 * Estrutura espelha a MeuEspacoSidebar; a cor do pilar (#1A4A3A, herdada
 * da constante ACERVO_COLOR do antigo layout) entra via estilo inline,
 * mesmo padrão do TISidebar.
 */

import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { resolverIcone } from "@/config/iconesNavegacao";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { BookOpen } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

const ACERVO_COLOR = "#1A4A3A";

export function AcervoSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { grupos, soltos, isLoading } = useMenuApp("acervo");

  const isItemActive = (rota: string) =>
    location.pathname === rota || location.pathname.startsWith(rota + "/");

  const linhaClasse = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
      active && "bg-sidebar-accent font-medium border-l-[3px] shadow-sm"
    );

  const linhaStyle = (active: boolean) =>
    active ? { borderLeftColor: ACERVO_COLOR, color: ACERVO_COLOR } : undefined;

  const renderItem = (item: ItemMenu) => {
    const active = isItemActive(item.rota);
    const Icone = resolverIcone(item.icone);
    return (
      <SidebarMenuItem key={item.chave}>
        <SidebarMenuButton asChild>
          <NavLink to={item.rota} className={linhaClasse(active)} style={linhaStyle(active)}>
            <Icone
              className="h-[18px] w-[18px] shrink-0"
              style={active ? { color: ACERVO_COLOR } : undefined}
            />
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
              style={{ backgroundColor: ACERVO_COLOR }}
            >
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tracking-tight text-sidebar-foreground">Acervo</span>
              <span className="text-[11px] text-sidebar-muted">Processos, documentação e conhecimento</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        {/* ATALHO-APONTA-PRO-PILAR (23/08/2026): Casa e Meu Espaço no topo,
            mesmo padrão das outras sidebars. */}
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {!isLoading && soltos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{soltos.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!isLoading && grupos.map((g) => (
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
    </Sidebar>
  );
}
