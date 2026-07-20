import {
  LayoutDashboard, Users, GitBranch, UserSearch, MailPlus, Rocket,
  ArrowLeftRight, Award, BookOpen, Receipt, Clock, CreditCard, FileText,
  Palmtree, Gift, BarChart3, LogOut, LayoutGrid, Tv, Shield, Monitor,
  ClipboardList, UsersRound, Banknote, Landmark,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const roleLabels: Record<AppRole, string> = {
  super_admin: "Super Admin",
  diretoria_executiva: "Diretoria Executiva",
  admin_rh: "Admin RH",
  admin_ti: "Admin TI",
  gestor_rh: "Gestor RH",
  gestor_direto: "Gestor Direto",
  colaborador: "Colaborador",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  operacional: "Operacional",
  recrutador: "Recrutador",
  rh: "RH",
  administrativo: "Administrativo",
  ti: "TI",
  recrutamento: "Recrutamento",
  gestao_direta: "Gestão Direta",
  estagiario: "Estagiário",
};

const ROLE_PRIORITY: AppRole[] = [
  "super_admin", "diretoria_executiva",
  "rh", "admin_rh", "gestor_rh",
  "recrutamento", "recrutador",
  "financeiro", "fiscal",
  "ti", "admin_ti",
  "administrativo", "operacional",
  "gestao_direta", "gestor_direto",
  "estagiario", "colaborador",
];

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permModule?: string;
  requireRole?: string;
}

// Grupo 1: Dashboards & Análise (topo)
// MIGRADOS na Sprint 2 (29/04/2026):
//   - Dashboard, Relatórios, Gestão à Vista → sistema "Gestão à Vista" (novo)
// Mantido vazio aqui pra preservar grupo caso volte item de análise focado em People.
const analiseItems: MenuItem[] = [];

// Grupo 2: Pessoas (núcleo operacional)
const pessoasItems: MenuItem[] = [
  { title: "Pessoas", url: "/pessoas", icon: Users, permModule: "colaboradores" },
  { title: "Cargos e Salários", url: "/admin/cargos", icon: Banknote, permModule: "cargos" },
  { title: "Organograma", url: "/organograma", icon: GitBranch, permModule: "organograma" },
  { title: "Recrutamento", url: "/recrutamento", icon: UserSearch, permModule: "recrutamento" },
  { title: "Convites de Cadastro", url: "/convites-cadastro", icon: MailPlus, permModule: "convites" },
  { title: "Onboarding", url: "/onboarding", icon: Rocket, permModule: "convites" },
  { title: "Movimentações", url: "/movimentacoes", icon: ArrowLeftRight, permModule: "movimentacoes" },
  { title: "Reembolsos", url: "/pessoas/reembolsos", icon: Receipt, permModule: "colaboradores" },
  { title: "Avaliações", url: "/avaliacoes", icon: Award, permModule: "avaliacoes" },
  { title: "Treinamentos", url: "/treinamentos", icon: BookOpen, permModule: "treinamentos" },
];

// Grupo 3: Benefícios & Financeiro
const beneficiosItems: MenuItem[] = [
  { title: "Folha de Pagamento", url: "/folha-pagamento", icon: Receipt, permModule: "folha_pagamento" },
  { title: "Ponto", url: "/ponto", icon: Clock, permModule: "folha_pagamento" },
  { title: "Férias", url: "/ferias", icon: Palmtree, permModule: "ferias" },
  { title: "Benefícios", url: "/beneficios", icon: Gift, permModule: "beneficios" },
  { title: "Pagamentos PJ", url: "/pagamentos-pj", icon: CreditCard, permModule: "pagamentos_pj" },
  { title: "Notas Fiscais PJ", url: "/notas-fiscais", icon: FileText, permModule: "notas_fiscais" },
];

interface MenuGroupProps {
  label: string;
  items: MenuItem[];
  collapsed: boolean;
  canViewModule: (mod: string) => boolean;
  userRoles?: string[];
}

function MenuGroup({ label, items, collapsed, canViewModule, userRoles = [] }: MenuGroupProps) {
  const location = useLocation();
  const visibleItems = items.filter((item) => {
    if (item.requireRole) {
      if (item.requireRole === "__gestor_or_rh__") {
        if (!userRoles.some((r) => ["gestor_direto", "super_admin", "admin_rh", "gestor_rh"].includes(r))) return false;
      } else if (item.requireRole === "__admin_rh_or_super__") {
        if (!userRoles.some((r) => ["super_admin", "admin_rh"].includes(r))) return false;
      } else if (!userRoles.includes(item.requireRole)) {
        return false;
      }
    }
    if (!item.permModule) return true;
    return canViewModule(item.permModule);
  });

  if (visibleItems.length === 0) return null;

  const isItemActive = (url: string) => {
    if (url.includes("?")) {
      const [path, query] = url.split("?");
      return location.pathname === path && location.search === `?${query}`;
    }
    return url === "/" ? location.pathname === "/" : location.pathname === url;
  };

  return (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => {
            const active = isItemActive(item.url);
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                      active && "bg-sidebar-primary/20 text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary shadow-sm"
                    )}
                  >
                    <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active && "text-sidebar-primary")} />
                    {!collapsed && <span>{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, roles, profile, signOut } = useAuth();
  const { canView } = usePermissions();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";

  const displayName = profile?.full_name || user?.email || "Usuário";
  const primaryRole = roleLabels[ROLE_PRIORITY.find(r => roles.includes(r)) || roles[0]] || "Colaborador";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: "#1A4A3A" }}
          >
            <Users className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight" style={{ color: "#1A4A3A" }}>People Fetely</span>
              <span className="text-[11px] text-sidebar-muted">Gestão de Pessoas</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        {/* Tarefas — acesso direto, ferramenta do dia-a-dia */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/tarefas"
                    end
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                      location.pathname === "/tarefas" && "bg-sidebar-primary/20 text-sidebar-primary font-medium border-l-[3px] border-sidebar-primary shadow-sm"
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
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                      )}
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
        <MenuGroup label="Análise" items={analiseItems} collapsed={collapsed} canViewModule={canView} userRoles={roles} />
        <div className="mx-4 border-t border-sidebar-border/40" />
        <MenuGroup label="Pessoas" items={pessoasItems} collapsed={collapsed} canViewModule={canView} userRoles={roles} />
        <div className="mx-4 border-t border-sidebar-border/40" />
        <MenuGroup label="Benefícios & Financeiro" items={beneficiosItems} collapsed={collapsed} canViewModule={canView} userRoles={roles} />
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
