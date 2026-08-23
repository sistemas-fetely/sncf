import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Home, User } from "lucide-react";
import {
  SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

/**
 * AtalhosFixos — Casa e Meu Espaço no topo de toda sidebar.
 *
 * ATALHO-APONTA-PRO-PILAR (23/08/2026). Antes, 5 das 8 sidebars repetiam DOIS
 * links hardcoded ("Minhas Tarefas" e "Tarefas do Time"), cada uma com a sua
 * cópia do JSX — e as 3 de maior tráfego não tinham nenhum. Viraram um link
 * para o pilar Meu Espaço, em componente único.
 *
 * A Casa entrou em 23/08/2026: nenhuma sidebar tinha link para ela, então só
 * dava para voltar pelo menu do topo. A ordem Casa → Meu Espaço espelha o top
 * nav e o rodapé do mobile — mesmo padrão em três lugares.
 *
 * Cada atalho some quando já se está dentro dele — atalho para onde já se está
 * é ruído. Por isso a MeuEspacoSidebar mostra só a Casa, e a CasaHome nenhum.
 *
 * `tela.home` e `tela.self` são públicas (TELAS_PUBLICAS): não precisam de
 * checagem de permissão.
 */
export function AtalhosFixos() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const naCasa = pathname === "/";

  const noMeuEspaco =
    pathname.startsWith("/tarefas") ||
    pathname.startsWith("/meus-dados") ||
    pathname.startsWith("/meus-acessos") ||
    pathname.startsWith("/minhas-notas") ||
    pathname.startsWith("/fala-fetely/memorias");

  if (naCasa && noMeuEspaco) return null;

  const classe =
    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200";

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {!naCasa && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink to="/" end className={classe}>
                  <Home className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>Casa</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!noMeuEspaco && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink to="/tarefas/hoje" className={classe}>
                  <User className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span>Meu Espaço</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
