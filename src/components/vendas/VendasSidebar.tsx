import { ShoppingCart, Receipt, FileText, Building2, Boxes, HandCoins, Package, Truck, ShoppingBag, Radar, CreditCard, ClipboardList, MessageCircle, Users, TableProperties } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "@/components/financas/FinancasSidebarItem";
import { FinancasSidebarSection } from "@/components/financas/FinancasSidebarSection";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export function VendasSidebar() {
  const { pathname } = useLocation();

  const { data: qtdMsgsPendentes = 0 } = useQuery({
    queryKey: ["canal-msgs-pendentes-sidebar"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_eventos")
        .select("pedido_id, tipo_evento, criado_em")
        .in("tipo_evento", ["msg_comercial", "msg_sops"])
        .order("criado_em", { ascending: false });
      const lastEvento = new Map();
      for (const row of (data ?? []) as any[]) {
        if (!lastEvento.has(row.pedido_id)) {
          lastEvento.set(row.pedido_id, row.tipo_evento as string);
        }
      }
      let count = 0;
      for (const tipo of lastEvento.values()) {
        if (tipo === "msg_comercial") count++;
      }
      return count;
    },
    refetchInterval: 60_000,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <HandCoins className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            SOPs
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4 gap-0">
        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/canal-cpo")}>
                  <Link to="/canal-cpo" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    <span>Central de Mensagens</span>
                    {qtdMsgsPendentes > 0 && (
                      <Badge
                        className="ml-auto text-[9px] px-1.5 py-0 h-4 border-0"
                        style={{ backgroundColor: "#185FA5", color: "white" }}
                      >
                        {qtdMsgsPendentes}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <FinancasSidebarItem to="/pedidos" icon={ShoppingCart} label="Pedidos B2B" end />
              <FinancasSidebarItem to="/vendas/shopify" icon={ShoppingBag} label="Pedidos B2C" end />
              <FinancasSidebarItem to="/vendas/gestao-pedidos" icon={TableProperties} label="Gestão de Pedidos" />
              <FinancasSidebarItem to="/recebimento/cobranca" icon={Receipt} label="Cobrança" />
              <FinancasSidebarItem to="/credito/clientes" icon={CreditCard} label="Crédito do cliente" />
              <FinancasSidebarItem to="/administrativo-fetely/parceiros" icon={Building2} label="Parceiros" />
              <FinancasSidebarItem to="/comercial/estoque-virtual" icon={Boxes} label="Estoque Virtual" />
              <FinancasSidebarItem to="/vendas/produtos" icon={Package} label="Produtos" />
              <FinancasSidebarItem to="/vendas/farol-pedidos" icon={Radar} label="Farol de Pedidos" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Logística" defaultOpen>
              <FinancasSidebarItem to="/logistica" icon={Truck} label="Logística" />
              <FinancasSidebarItem to="/vendas/rastreamento" icon={Radar} label="Rastreamento" />
              <FinancasSidebarItem to="/vendas/faturas-correios" icon={FileText} label="Faturas Correios" />
              <FinancasSidebarItem to="/vendas/wns-xpm" icon={Truck} label="WNS / XPM" activeClassName="bg-green-50 text-green-700 font-medium [&_svg]:text-green-700 border-l-green-600" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Bling" defaultOpen>
              <FinancasSidebarItem to="/vendas/nfs" icon={FileText} label="NFs de Venda" />
              <FinancasSidebarItem to="/vendas/bling-pedidos" icon={ClipboardList} label="Pedidos de Venda" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pb-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Shopify" defaultOpen>
              <FinancasSidebarItem to="/vendas/shopify" icon={ShoppingBag} label="Pedidos B2C" end />
              <FinancasSidebarItem to="/vendas/shopify/checkouts" icon={Receipt} label="Checkouts" />
              <FinancasSidebarItem to="/vendas/shopify/produtos" icon={Package} label="Produtos" />
              <FinancasSidebarItem to="/vendas/shopify/clientes" icon={Users} label="Clientes" />
              <FinancasSidebarItem to="/vendas/shopify/reembolsos" icon={Receipt} label="Reembolsos" />
              <FinancasSidebarItem to="/vendas/shopify/fulfillments" icon={Truck} label="Fulfillments" />
              <FinancasSidebarItem to="/vendas/shopify/estoque" icon={Boxes} label="Estoque" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
