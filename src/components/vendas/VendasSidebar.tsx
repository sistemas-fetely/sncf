import { ShoppingCart, Receipt, FileText, Building2, Boxes, HandCoins } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "@/components/financas/FinancasSidebarItem";

export function VendasSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <HandCoins className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Vendas
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem to="/pedidos" icon={ShoppingCart} label="Pedidos" end />
              <FinancasSidebarItem to="/recebimento/cobranca" icon={Receipt} label="Cobrança" />
              <FinancasSidebarItem to="/vendas/nfs" icon={FileText} label="NFs de Venda" />
              <FinancasSidebarItem to="/administrativo-fetely/parceiros" icon={Building2} label="Parceiros" />
              <FinancasSidebarItem to="/comercial/estoque-virtual" icon={Boxes} label="Estoque Virtual" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
