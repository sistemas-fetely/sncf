import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { User } from "lucide-react";
import {
  SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

/**
 * AtalhoMeuEspaco — link único para o Meu Espaço, no topo de toda sidebar.
 *
 * ATALHO-APONTA-PRO-PILAR (23/08/2026). Antes, 5 das 8 sidebars repetiam DOIS
 * links hardcoded ("Minhas Tarefas" e "Tarefas do Time"), cada uma com a sua
 * cópia do JSX — e as 3 de maior tráfego (SOPs, Finanças e o próprio Meu
 * Espaço) não tinham nenhum. Quem passava o dia em SOPs não tinha atalho;
 * quem estava na Mesa tinha dois.
 *
 * Um link para o pilar, em vez de dois para pedaços dele: Meu Espaço é quem
 * POSSUI as tarefas, e lá dentro estão também Gestão, Meus Dados e os
 * favoritos fixados no topo. Quem usa uma tela o dia todo favorita ela e ela
 * passa a aparecer antes de tudo.
 *
 * Não renderiza dentro do próprio Meu Espaço — atalho para onde já se está é
 * ruído.
 *
 * `tela.self` é pública (TELAS_PUBLICAS): não precisa de checagem de
 * permissão, todo mundo tem o seu espaço.
 */
export function AtalhoMeuEspaco() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  // Já estou no Meu Espaço: o atalho não faz sentido.
  const dentroDoMeuEspaco =
    pathname.startsWith("/tarefas") ||
    pathname.startsWith("/meus-dados") ||
    pathname.startsWith("/meus-acessos") ||
    pathname.startsWith("/minhas-notas") ||
    pathname.startsWith("/fala-fetely/memorias");

  if (dentroDoMeuEspaco) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/tarefas/hoje"
                className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
              >
                <User className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>Meu Espaço</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
