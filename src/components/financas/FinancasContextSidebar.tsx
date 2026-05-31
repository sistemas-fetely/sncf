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

      <SidebarContent>
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

        {/* OPERAR */}
        <SidebarGroup>
          <SidebarGroupContent className="space-y-2">
            <FinancasSidebarSection title="Operar" variant="primary">
              <FinancasSidebarSection title="CPR">
                <FinancasSidebarItem to="/administrativo/contas-pagar" icon={ArrowDownCircle} label="Contas a Pagar" />
                <FinancasSidebarItem to="/administrativo/contas-receber" icon={ArrowUpCircle} label="Contas a Receber" />
                <FinancasSidebarItem to="/administrativo/caixa-banco" icon={ArrowLeftRight} label="Movimentações" end />
              </FinancasSidebarSection>

              <FinancasSidebarSection title="Banco">
                <FinancasSidebarItem to="/administrativo/faturas-cartao" icon={CreditCard} label="Faturas de Cartão" />
                <FinancasSidebarItem to="/administrativo/compromissos" icon={Calendar} label="Contratos Recorrentes" />
                <FinancasSidebarItem to="/administrativo/caixa-banco/contas" icon={Landmark} label="Contas Bancárias" />
              </FinancasSidebarSection>

            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ESTRUTURA */}
        <SidebarGroup>
          <SidebarGroupContent>
            <FinancasSidebarSection title="Estrutura" variant="primary">
              <FinancasSidebarItem to="/administrativo/plano-contas" icon={FolderTree} label="Plano de Contas" />
              <FinancasSidebarItem to="/administrativo/conciliacao" icon={CheckCheck} label="Conciliação" />
              <FinancasSidebarItem to="/administrativo/investimento-lancamento" icon={Coins} label="Investimento de Lançamento" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ACOMPANHAR */}
        <SidebarGroup>
          <SidebarGroupContent>
            <FinancasSidebarSection title="Acompanhar" variant="primary">
              <FinancasSidebarItem to="/administrativo/fluxo-caixa" icon={LineChart} label="Fluxo de Caixa" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro" icon={TrendingUp} label="Fluxo Futuro" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro-investimento" icon={Target} label="Fluxo Futuro Investimento" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
