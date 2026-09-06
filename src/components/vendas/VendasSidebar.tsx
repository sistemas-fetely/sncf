/**
 * VendasSidebar (SOPs) — MENU-VIA-TABELA (21/08/2026).
 *
 * Itens, rótulos, ícones e ordem vêm da sncf_navegacao (app "sops") via
 * useMenuApp. Mudar esse menu passa a ser UPDATE, sem deploy.
 *
 * Achados na migração:
 *  - "Entradas Recebidas" chegou a existir aqui (sops.entradas), mas a tela foi
 *    desmontada em 23/08/2026 — adiantamento vive na aba da Cobrança.
 *  - "Aguardando Pagamento" idem (sops.aguard_pgto) — estágio visível na Casa
 *    dos Pedidos. Linhas removidas da sncf_navegacao na mesma data.
 *  - "Destinos de Cadastro" já estava na tabela mas nunca aparecia em nenhum
 *    menu — órfã corrigida de graça.
 *  - Badge de "Central de Mensagens" (badge_fonte='msgs_comercial_pendentes')
 *    já estava modelado, mas fn_badges() não sabia calculá-lo — completado
 *    na mesma sessão (replica exata da contagem que vivia inline aqui).
 *
 * Mantém FinancasSidebarItem/FinancasSidebarSection (identidade visual do
 * SOPs, com seções colapsáveis) — cada um já valida visibilidade sozinho via
 * useTelasVisiveis, mesma engine do RotaGate.
 */

import { HandCoins } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "@/components/financas/FinancasSidebarItem";
import { FinancasSidebarSection } from "@/components/financas/FinancasSidebarSection";
import { AtalhosFixos } from "@/components/navegacao/AtalhosFixos";
import { useMenuApp, type ItemMenu } from "@/hooks/useMenuApp";
import { useBadgesNavegacao } from "@/hooks/useBadgesNavegacao";
import { resolverIcone } from "@/config/iconesNavegacao";
import { Badge } from "@/components/ui/badge";

export function VendasSidebar() {
  const { grupos, isLoading } = useMenuApp("sops");
  const { data: badgesNav } = useBadgesNavegacao();

  const renderBadge = (item: ItemMenu) => {
    if (!item.badge_fonte) return undefined;
    const b = badgesNav?.get(item.badge_fonte);
    if (!b || b.total <= 0) return undefined;
    return (
      <Badge className="text-[9px] px-1.5 py-0 h-4 border-0" style={{ backgroundColor: "#185FA5", color: "white" }}>
        {b.total}
      </Badge>
    );
  };

  const renderItem = (item: ItemMenu) => {
    const Icone = resolverIcone(item.icone);
    return (
      <FinancasSidebarItem
        key={item.chave}
        to={item.rota}
        icon={Icone}
        label={item.label}
        // 'exato' vem derivado da árvore pelo useMenuApp (22/08/2026) — antes
        // era calculado à mão aqui, uma segunda implementação da mesma regra.
        end={item.exato}
        badge={renderBadge(item)}
      />
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
          <HandCoins className="h-5 w-5 text-gold flex-shrink-0 group-data-[collapsible=icon]:hidden" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            SOPs
          </span>
          <SidebarTrigger className="ml-auto h-7 w-7 text-sidebar-muted hover:text-sidebar-foreground group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <AtalhosFixos />
        <div className="mx-4 border-t border-sidebar-border/40" />

        {!isLoading && grupos.map((g) =>
          g.chave === "sops.operacao" ? (
            // Grupo "Operação" — sem título/seção colapsável, igual hoje.
            <SidebarGroup key={g.chave} className="pb-3">
              <SidebarGroupContent>
                <SidebarMenu>{g.itens.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup key={g.chave} className="pb-3">
              <SidebarGroupContent>
                <FinancasSidebarSection title={g.label} defaultOpen>
                  {g.itens.map(renderItem)}
                </FinancasSidebarSection>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        )}
      </SidebarContent>
    </Sidebar>
  );
}
