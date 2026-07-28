import { Package, Boxes, Warehouse, HeartPulse, GitCompare } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "@/components/financas/FinancasSidebarItem";
import { FinancasSidebarSection } from "@/components/financas/FinancasSidebarSection";

export function ProdutoSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Package className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Produto
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem to="/produto" icon={Package} label="Produto" end />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Estoque" defaultOpen>
              <FinancasSidebarItem to="/produto/estoque/virtual" icon={Warehouse} label="Estoque Virtual" />
              <FinancasSidebarItem to="/produto/estoque/saude" icon={HeartPulse} label="Saúde do Estoque" />
              <FinancasSidebarItem to="/produto/estoque/conciliacao" icon={GitCompare} label="Conciliação" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
