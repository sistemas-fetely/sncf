import {
  Wallet,
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  ArrowLeftRight,
  CreditCard,
  CheckCheck,
  Upload,
  FileText,
  FileWarning,
  FolderTree,
  Landmark,
  Coins,
  LineChart,
  TrendingUp,
  Target,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { FinancasSidebarItem } from "./FinancasSidebarItem";
import { FinancasSidebarSection } from "./FinancasSidebarSection";

export function FinancasContextSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Wallet className="h-5 w-5 text-gold flex-shrink-0" />
          <span className="font-serif text-lg text-foreground group-data-[collapsible=icon]:hidden">
            Finanças
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-3">
        {/* Item raiz */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem
                to="/administrativo"
                icon={LayoutDashboard}
                label="Visão Geral"
                end
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CPR */}
        <SidebarGroup>
          <SidebarGroupContent>
            <FinancasSidebarSection title="CPR" variant="primary">
              <FinancasSidebarItem to="/administrativo/contas-pagar" icon={ArrowDownCircle} label="Contas a Pagar" />
              <FinancasSidebarItem to="/administrativo/contas-receber" icon={ArrowUpCircle} label="Contas a Receber" />
              <FinancasSidebarItem to="/administrativo/caixa-banco" icon={ArrowLeftRight} label="Movimentações" end />
              <FinancasSidebarItem to="/administrativo/fluxo-caixa" icon={LineChart} label="Fluxo de Caixa" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* BANCO */}
        <SidebarGroup>
          <SidebarGroupContent>
            <FinancasSidebarSection title="Banco" variant="primary">
              <FinancasSidebarItem to="/administrativo/faturas-cartao" icon={CreditCard} label="Faturas de Cartão" />
              <FinancasSidebarItem to="/administrativo/compromissos" icon={Calendar} label="Contratos Recorrentes" />
              <FinancasSidebarItem to="/administrativo/caixa-banco/contas" icon={Landmark} label="Contas Bancárias" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro" icon={TrendingUp} label="Fluxo Futuro" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro-investimento" icon={Target} label="Fluxo Futuro Investimento" />
              <FinancasSidebarItem to="/administrativo/investimento-lancamento" icon={Coins} label="Investimento de Lançamento" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>


        {/* ESTRUTURA */}
        <SidebarGroup>
          <SidebarGroupContent>
            <FinancasSidebarSection title="Estrutura" variant="primary">
              <FinancasSidebarItem to="/administrativo/plano-contas" icon={FolderTree} label="Plano de Contas" />
              <FinancasSidebarItem to="/administrativo/conciliacao" icon={CheckCheck} label="Conciliação" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
