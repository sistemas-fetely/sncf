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
  FolderTree,
  Landmark,
  Coins,
  LineChart,
  BarChart3,
  TrendingUp,
  Target,
  Users,
  ArrowDownToLine,
  Inbox,
  Filter,
  GitCompare,
  PieChart,
  Receipt,
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
        {/* LEITURA */}
        <SidebarGroup className="pb-3">
          <SidebarGroupLabel className="px-3 py-2 text-[11px] uppercase tracking-[2px] text-muted-foreground h-auto">Leitura</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <FinancasSidebarItem to="/administrativo" icon={LayoutDashboard} label="Visão Geral" end />
              <FinancasSidebarItem to="/administrativo/caixa-banco" icon={PieChart} label="Gerencial" end />
              <FinancasSidebarItem to="/administrativo/analise-despesas" icon={BarChart3} label="Análise de Despesas" />
              <FinancasSidebarItem to="/administrativo/fluxo-caixa" icon={LineChart} label="Fluxo de Caixa" />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* DESPESAS */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Despesas" variant="primary">
              <FinancasSidebarItem to="/administrativo/despesas" icon={Receipt} label="Despesas" />
              <FinancasSidebarItem to="/administrativo-fetely/nfs-stage" icon={FileText} label="Triagem de Documentos" />
              <FinancasSidebarItem to="/administrativo/contas-pagar" icon={ArrowDownCircle} label="Contas a Pagar (Agenda)" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* RECEITAS */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Receitas" variant="primary">
              <FinancasSidebarItem to="/administrativo/contas-receber" icon={ArrowUpCircle} label="Contas a Receber" />
              <FinancasSidebarItem to="/administrativo/recebimentos-conciliar" icon={CheckCheck} label="Recebimentos a conciliar" />
              <FinancasSidebarItem to="/administrativo/previsao-recebimentos" icon={ArrowDownToLine} label="Previsão de Recebimentos" />
              <FinancasSidebarItem to="/administrativo/painel-financeiro-conta" icon={Users} label="Vencimentos x Cliente" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CONTROLADORIA */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Controladoria" variant="primary">
              <FinancasSidebarItem to="/administrativo/extrato-importacao" icon={Upload} label="Importar Extratos" />
              <FinancasSidebarItem to="/administrativo/conciliacao-despesas" icon={GitCompare} label="Conciliar Despesas" />
              <FinancasSidebarItem to="/administrativo/extrato-pares" icon={ArrowLeftRight} label="Pares Transferência" />
              <FinancasSidebarItem to="/administrativo/conciliacao-cartao" icon={CreditCard} label="Conciliação Cartão" />
              <FinancasSidebarItem to="/administrativo/extrato-regras" icon={Filter} label="Regras Automáticas" />
              <FinancasSidebarItem to="/administrativo/extrato-inbox" icon={Inbox} label="Inbox Extrato" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* PROJEÇÕES */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Projeções (em reformulação)" variant="primary">
              <FinancasSidebarItem to="/administrativo/fluxo-futuro" icon={TrendingUp} label="Fluxo Futuro" />
              <FinancasSidebarItem to="/administrativo/fluxo-futuro-investimento" icon={Target} label="Fluxo Futuro Investimento" />
              <FinancasSidebarItem to="/administrativo/investimento-lancamento" icon={Coins} label="Investimento de Lançamento" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CADASTROS */}
        <SidebarGroup className="border-t border-gold/10 py-3">
          <SidebarGroupContent>
            <FinancasSidebarSection title="Cadastros" variant="primary">
              <FinancasSidebarItem to="/administrativo/plano-contas" icon={FolderTree} label="Plano de Contas" />
              <FinancasSidebarItem to="/administrativo/caixa-banco/contas" icon={Landmark} label="Contas Bancárias" />
              <FinancasSidebarItem to="/administrativo/compromissos" icon={Calendar} label="Contratos Recorrentes" />
              <FinancasSidebarItem to="/administrativo/faturas-cartao" icon={CreditCard} label="Faturas de Cartão" />
            </FinancasSidebarSection>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
