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
  Users,
  ArrowDownToLine,
  Inbox,
} from "lucide-react";


import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

      <SidebarContent className="pt-4 gap-0">
        {/* Item raiz */}
        <SidebarGroup className="pb-3">
          <SidebarGroupLabel className="px-3 py-2 text-[11px] uppercase tracking-[2px] text-muted-foreground h-auto">Tudo à Vista</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem
                to="/administrativo"
                icon={LayoutDashboard}
                label="Visão Geral"
                end
              />
              <FinancasSidebarItem to="/administrativo/painel-financeiro-conta" icon={Users} label="Vencimentos x Cliente" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CPR */}
        <SidebarGroup className="border-t border-gold/10 py-3">
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
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Banco" variant="primary">
              <FinancasSidebarItem to="/administrativo/faturas-cartao" icon={CreditCard} label="Faturas de Cartão" />
              <FinancasSidebarItem to="/administrativo/compromissos" icon={Calendar} label="Contratos Recorrentes" />
              <FinancasSidebarItem to="/administrativo/caixa-banco/contas" icon={Landmark} label="Contas Bancárias" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro" icon={TrendingUp} label="Fluxo Futuro" />
              <FinancasSidebarItem to="/administrativo/previsao-recebimentos" icon={ArrowDownToLine} label="Previsão de Recebimentos" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro-investimento" icon={Target} label="Fluxo Futuro Investimento" />
              <FinancasSidebarItem to="/administrativo/investimento-lancamento" icon={Coins} label="Investimento de Lançamento" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ESTRUTURA */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Estrutura" variant="primary">
              <FinancasSidebarItem to="/administrativo/recebimentos-conciliar" icon={ArrowUpCircle} label="Recebimentos a conciliar" />
              <FinancasSidebarItem to="/administrativo/plano-contas" icon={FolderTree} label="Plano de Contas" />
              <FinancasSidebarItem to="/administrativo/conciliacao" icon={CheckCheck} label="Conciliação" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
