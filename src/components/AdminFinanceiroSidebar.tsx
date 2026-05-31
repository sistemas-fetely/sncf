import {
  LayoutDashboard, Wallet, ListTree, Receipt,
  TrendingUp, ArrowDownToLine, ArrowUpFromLine, Upload,
  FileSignature, Building2, ShieldCheck, FolderArchive,
  Users, Monitor, Network, Landmark, LogOut, ClipboardList,
  UsersRound, Settings2, ShoppingCart, Package,
  Layers, CreditCard, Calendar, FileWarning, CheckSquare,
  Target,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
  badge?: string;
}

const dashboardItem: MenuItem = {
  title: "Dashboard Financeiro", url: "/administrativo", icon: LayoutDashboard, end: true,
};

const financeiroItems: MenuItem[] = [
  { title: "Contas a Pagar", url: "/administrativo/contas-pagar", icon: ArrowUpFromLine },
  { title: "Faturas de Cartão", url: "/administrativo/faturas-cartao", icon: CreditCard },
  { title: "Contas a Receber", url: "/administrativo/contas-receber", icon: ArrowDownToLine },
  { title: "Painel Financeiro da Conta", url: "/administrativo/painel-financeiro-conta", icon: Users },
  { title: "Fluxo de Caixa", url: "/administrativo/fluxo-caixa", icon: TrendingUp },
];

const caixaBancoItems: MenuItem[] = [
  { title: "Contratos Recorrentes", url: "/administrativo/compromissos", icon: Receipt },
  { title: "Fluxo Futuro Investimento", url: "/administrativo/fluxo-futuro-investimento", icon: Target },
  { title: "Fluxo Futuro", url: "/administrativo/fluxo-futuro", icon: Calendar },
  { title: "Contas Bancárias", url: "/administrativo/caixa-banco/contas", icon: Landmark },
  { title: "Investimento de Lançamento", url: "/administrativo/investimento-lancamento", icon: Target },
];

const configFinanceiroItems: MenuItem[] = [
  { title: "Recebimentos a conciliar", url: "/administrativo/recebimentos-conciliar", icon: ArrowDownToLine },
  { title: "Plano de Contas", url: "/administrativo/plano-contas", icon: ListTree },
  { title: "Conciliação", url: "/administrativo/conciliacao", icon: CheckSquare },
];

// MIGRADOS na Sprint 2 (29/04/2026) → Administrativo Fetely:
//   - Pedidos de Venda, Produtos (provisórios em Adm, podem migrar pra Produto Fetely depois)
//   - Contratos, Imóveis, Seguros, GED
const vendasBlingItems: MenuItem[] = [];

const futurosItems: MenuItem[] = [];

export function AdminFinanceiroSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, profile, signOut, roles } = useAuth();
  const location = useLocation();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";
  const displayName = profile?.full_name || user?.email || "Usuário";
  const primaryRole = getHighestRoleLabel(roles);

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  const renderItems = (items: MenuItem[]) => (
    <SidebarMenu>
      {items.map((item) => {
        const active = isItemActive(item.url, item.end);
        return (
          <SidebarMenuItem key={item.url}>
            <SidebarMenuButton asChild>
              <NavLink
                to={item.url}
                end={item.end}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                  active && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm border-l-admin"
                )}
                style={active ? { color: "hsl(var(--admin))" } : undefined}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" style={active ? { color: "hsl(var(--admin))" } : undefined} />
                {!collapsed && (
                  <span className="flex-1 flex items-center justify-between gap-2">
                    <span>{item.title}</span>
                    {item.badge && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-admin/30 text-admin">
                        {item.badge}
                      </Badge>
                    )}
                  </span>
                )}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm bg-admin">
            <Landmark className="h-5 w-5 text-admin-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-admin">ADM Fetely</span>
              <span className="text-[11px] text-sidebar-muted">Pilar Administrativo</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        <SidebarGroup>
          <SidebarGroupContent>{renderItems([dashboardItem])}</SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-4 border-t border-sidebar-border/40" />
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
              Atalhos
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/tarefas"
                    end
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-all duration-200",
                      location.pathname === "/tarefas"
                        ? "bg-admin/20 text-admin font-medium border-l-[3px] border-admin shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <ClipboardList className="h-[18px] w-[18px] shrink-0" />
                    {!collapsed && <span>Minhas Tarefas</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {roles.some((r) => ["gestor_direto", "gestor_rh", "admin_rh", "super_admin"].includes(r)) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/tarefas/time"
                      className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                    >
                      <UsersRound className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>Tarefas do Time</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-4 border-t border-sidebar-border/40" />
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
              Financeiro
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderItems(financeiroItems)}</SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-4 border-t border-sidebar-border/40" />
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
              Caixa e Banco
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderItems(caixaBancoItems)}</SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-4 border-t border-sidebar-border/40" />
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
              Configurações Financeiro
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>{renderItems(configFinanceiroItems)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-admin-foreground shadow-sm bg-admin">
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</span>
                <Badge variant="outline" className="text-[10px] w-fit border-sidebar-border/60 text-sidebar-muted mt-0.5">
                  {primaryRole}
                </Badge>
              </div>
            </div>
            <Link to="/meus-dados" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground">
              Meus Dados
            </Link>
            <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
