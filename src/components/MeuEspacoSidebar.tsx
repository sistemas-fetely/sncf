/**
 * MeuEspacoSidebar — MENU-VIA-TABELA (22/08/2026).
 *
 * Substitui as abas horizontais do antigo TarefasLayout por uma sidebar
 * lateral de verdade, no mesmo padrão de Casa/SOPs/Finanças/Pessoas —
 * Meu Espaço é um dos 5 pilares fixos do rodapé (Mapa de Navegação v7).
 *
 * Itens, rótulos, ícones e ordem vêm da sncf_navegacao (app "meu_espaco"),
 * organizados em 2 grupos criados nesta migração: Tarefas e Pessoal.
 * "Gestão" é um item único aqui — dentro dele, o GestaoLayout continua
 * fornecendo sua própria sub-navegação (Salas/Projetos/Decisões/Riscos).
 *
 * Repõe a TarefasSidebar.tsx órfã (zero referência no repo, nunca roteada).
 */

import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { useFavoritos } from "@/hooks/useFavoritos";
import { resolverIcone } from "@/config/iconesNavegacao";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { ListChecks, Star } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";

export function MeuEspacoSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { grupos, isLoading } = useMenuApp("meu_espaco");
  const { favoritos } = useFavoritos();

  const isItemActive = (rota: string) => location.pathname.startsWith(rota);

  const linhaClasse = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
      active && "bg-sidebar-accent font-medium border-l-[3px] border-l-gold text-gold shadow-sm"
    );

  const renderItem = (item: ItemMenu) => {
    const active = isItemActive(item.rota);
    const Icone = resolverIcone(item.icone);
    return (
      <SidebarMenuItem key={item.chave}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.rota}
            className={linhaClasse(active)}
          >
            <Icone className={cn("h-[18px] w-[18px] shrink-0", active && "text-gold")} />
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold shadow-sm">
              <ListChecks className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium tracking-tight text-sidebar-foreground">Meu Espaço</span>
              <span className="text-[11px] text-sidebar-muted">O que precisa sair hoje</span>
            </div>
            <SidebarTrigger className="ml-auto -mr-2 shrink-0 text-sidebar-muted hover:text-sidebar-foreground" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        {/* ATALHO-APONTA-PRO-PILAR (23/08/2026): Casa e Meu Espaço no topo.
            Aqui, dentro do Meu Espaço, só a Casa aparece — atalho para onde
            já se está é ruído. */}
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {/* FIXOS — favoritos do próprio usuário, no topo. Vêm da
            usuario_paginas_favoritas, com rótulo/ícone resolvidos da
            sncf_navegacao. Ordem definida por ele no popover do header. */}
        {favoritos.length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-medium mb-1 px-4 flex items-center gap-1.5">
                <Star className="h-3 w-3 fill-gold text-gold" />
                Fixos
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {favoritos.map((f) => {
                  const active = isItemActive(f.rota);
                  const Icone = resolverIcone(f.icone);
                  return (
                    <SidebarMenuItem key={f.id}>
                      <SidebarMenuButton asChild>
                        <NavLink to={f.rota} className={linhaClasse(active)}>
                          <Icone className={cn("h-[18px] w-[18px] shrink-0", active && "text-gold")} />
                          {!collapsed && <span className="truncate">{f.titulo}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
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
