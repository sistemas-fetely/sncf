import {
  LayoutGrid, ClipboardList, UsersRound, UserCog, Workflow,
  LogOut, Network, Sparkles, BookOpen, Shield, ExternalLink, FileText,
  PartyPopper, MessageSquareWarning, Users, Monitor, Landmark,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { getHighestRoleLabel } from "@/lib/user-role";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMeuContratoPJ } from "@/hooks/useMinhasNotas";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

function getIcon(name: string) {
  const pascal = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[pascal];
  return Icon || ExternalLink;
}

const SNCF_COLOR = "#1A4A3A";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  end?: boolean;
  requireRole?: "gestor_or_rh" | "admin_rh_or_super";
  badge?: string;
}

// Grupo 1: Operacional diário
const operacionalItems: MenuItem[] = [
  { title: "Portal", url: "/sncf", icon: LayoutGrid, end: true },
  { title: "Minhas Tarefas", url: "/tarefas", icon: ClipboardList, end: true },
  { title: "Tarefas do Time", url: "/tarefas/time", icon: UsersRound, requireRole: "gestor_or_rh" },
];

const minhasNotasItem: MenuItem = {
  title: "Minhas Notas", url: "/minhas-notas", icon: FileText, end: true,
};

// Grupo 2: Celebração & Conversa
const celebracaoItems: MenuItem[] = [
  { title: "Mural Fetely", url: "/sncf", icon: PartyPopper, end: true, badge: "Novo" },
  { title: "Fala Fetely", url: "/fala-fetely", icon: Sparkles, end: true },
];

// Grupo 3: Administrativo transversal
// MIGRADOS na Sprint 2 (29/04/2026):
//   - Processos, Documentação, Base de Conhecimento, Gerenciar Usuários → ADM SNCF
//   - Reportes do Sistema → TI Fetely
// Mantido vazio aqui pra preservar grupo caso volte item transversal puro.
const adminItems: MenuItem[] = [];

interface SistemaExterno {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  rota_base: string;
}

export function SNCFSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, profile, signOut, roles } = useAuth();
  const location = useLocation();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "??";
  const displayName = profile?.full_name || user?.email || "Usuário";
  const primaryRole = getHighestRoleLabel(roles);

  const isAdminRHOrSuper = roles.some((r) => ["super_admin", "admin_rh"].includes(r));
  const { data: contratoPJ } = useMeuContratoPJ();

  const operacionalItemsFinal = contratoPJ
    ? [...operacionalItems, minhasNotasItem]
    : operacionalItems;

  const { data: qtdSugestoesPendentes = 0 } = useQuery({
    queryKey: ["sugestoes-conhecimento-pendentes"],
    queryFn: async () => {
      const { count } = await supabase
        .from("fala_fetely_sugestoes_conhecimento")
        .select("*", { count: "exact", head: true })
        .eq("status", "pendente");
      return count || 0;
    },
    enabled: isAdminRHOrSuper,
    refetchInterval: 30000,
  });

  // Sistemas (internos + externos) para mostrar no sidebar
  const { data: sistemasData } = useQuery({
    queryKey: ["sncf-sistemas-sidebar", user?.id, isAdminRHOrSuper],
    enabled: !!user,
    queryFn: async () => {
      const { data: sistemas } = await supabase
        .from("sncf_sistemas")
        .select("id, nome, icone, cor, rota_base")
        .eq("ativo", true)
        .order("ordem");
      const { data: userSystems } = await supabase
        .from("sncf_user_systems")
        .select("sistema_id, ativo")
        .eq("user_id", user!.id);
      const acessiveis = new Set(
        (userSystems || []).filter((u: any) => u.ativo).map((u: any) => u.sistema_id)
      );
      // Sprint 2 (29/04/2026): super_admin e admin_rh têm acesso universal,
      // sem precisar de cadastro em sncf_user_systems.
      const podeVer = (id: string) => isAdminRHOrSuper || acessiveis.has(id);
      const todos = ((sistemas || []) as SistemaExterno[]).filter((s) => podeVer(s.id));
      return {
        internos: todos.filter((s) => !s.rota_base?.startsWith("http")),
        externos: todos.filter((s) => s.rota_base?.startsWith("http")),
      };
    },
  });
  const sistemasInternos = sistemasData?.internos ?? [];
  const sistemasExternos = sistemasData?.externos ?? [];

  const isItemActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);


  const canSee = (req?: MenuItem["requireRole"]) => {
    if (!req) return true;
    if (req === "gestor_or_rh") {
      return roles.some((r) => ["gestor_direto", "super_admin", "admin_rh", "gestor_rh"].includes(r));
    }
    if (req === "admin_rh_or_super") {
      return isAdminRHOrSuper;
    }
    return true;
  };

  const renderGroup = (label: string, items: MenuItem[]) => {
    const visible = items.filter((i) => canSee(i.requireRole));
    if (!visible.length) return null;
    return (
      <SidebarGroup>
        {!collapsed && (
          <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
            {label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => {
              const active = isItemActive(item.url, item.end);
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200",
                        active && "bg-sidebar-accent text-sidebar-foreground font-medium border-l-[3px] shadow-sm"
                      )}
                      style={active ? { borderLeftColor: SNCF_COLOR, color: SNCF_COLOR } : undefined}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" style={active ? { color: SNCF_COLOR } : undefined} />
                      {!collapsed && (
                        <span className="flex-1 flex items-center justify-between gap-2">
                          <span>{item.title}</span>
                          <span className="flex items-center gap-1">
                            {item.badge && (
                              <Badge className="badge-novo text-[9px] px-1.5 py-0 h-4 border-0" style={{ backgroundColor: "#E91E63", color: "white" }}>
                                {item.badge}
                              </Badge>
                            )}
                            {item.url === "/fala-fetely/conhecimento" && qtdSugestoesPendentes > 0 && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                                {qtdSugestoesPendentes}
                              </Badge>
                            )}
                          </span>
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm"
            style={{ backgroundColor: SNCF_COLOR }}
          >
            <Network className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight" style={{ color: SNCF_COLOR }}>Fetély.</span>
              <span className="text-[11px] text-sidebar-muted">#celebreoqueimporta</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 space-y-1">
        {renderGroup("Operacional", operacionalItemsFinal)}
        <div className="mx-4 border-t border-sidebar-border/40" />
        {renderGroup("Celebração & Conversa", celebracaoItems)}
        {canSee("admin_rh_or_super") && <div className="mx-4 border-t border-sidebar-border/40" />}
        {renderGroup("Curadoria", adminItems)}

        {sistemasInternos.length > 0 && (
          <>
            <div className="mx-4 border-t border-sidebar-border/40" />
            <SidebarGroup>
              {!collapsed && (
                <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
                  Sistemas Fetely
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {sistemasInternos.map((s) => {
                    const Icon = getIcon(s.icone);
                    return (
                      <SidebarMenuItem key={s.id}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={s.rota_base}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                          >
                            <Icon className="h-[18px] w-[18px] shrink-0" style={s.cor ? { color: s.cor } : undefined} />
                            {!collapsed && <span>{s.nome}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {sistemasExternos.length > 0 && (
          <>
            <div className="mx-4 border-t border-sidebar-border/40" />
            <SidebarGroup>
              {!collapsed && (
                <SidebarGroupLabel className="text-sidebar-muted text-[10px] uppercase tracking-widest font-semibold mb-1 px-4">
                  Sistemas externos
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {sistemasExternos.map((s) => {
                    const Icon = getIcon(s.icone);
                    return (
                      <SidebarMenuItem key={s.id}>
                        <SidebarMenuButton asChild>
                          <button
                            onClick={() => window.open(s.rota_base, "_blank")}
                            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
                          >
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            {!collapsed && (
                              <span className="flex-1 flex items-center justify-between gap-2">
                                <span>{s.nome}</span>
                                <ExternalLink className="h-3 w-3 text-sidebar-muted" />
                              </span>
                            )}
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>


      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                style={{ backgroundColor: SNCF_COLOR }}
              >
                {initials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</span>
                <Badge variant="outline" className="text-[10px] w-fit border-sidebar-border/60 text-sidebar-muted mt-0.5">
                  {primaryRole}
                </Badge>
              </div>
            </div>
            <Link
              to="/meus-dados"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
            >
              <Shield className="h-3.5 w-3.5" />
              Meus Dados
            </Link>
            <Link
              to="/meus-acessos"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
            >
              <Shield className="h-3.5 w-3.5" />
              Meus Acessos
            </Link>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all duration-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
