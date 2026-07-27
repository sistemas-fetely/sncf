import { Boxes, Sparkles } from "lucide-react";
// Boxes usado no item "Estoque Virtual" abaixo
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "@/components/financas/FinancasSidebarItem";

export function ComercialSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Boxes className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Comercial
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem to="/comercial/oportunidades" icon={Sparkles} label="Oportunidades" />
              <FinancasSidebarItem to="/comercial/estoque-virtual" icon={Boxes} label="Estoque Virtual" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
