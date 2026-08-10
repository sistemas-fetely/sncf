import { useState, Fragment, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, RefreshCw, Info, AlertTriangle, Scale, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";
import { MODULES, MODULE_CATEGORIES } from "./modulosMatriz";
import { CelulaPermissaoEditavel } from "./CelulaPermissaoEditavel";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 border-purple-200",
  diretoria_executiva: "bg-violet-100 text-violet-700 border-violet-200",
  rh: "bg-blue-100 text-blue-700 border-blue-200",
  gestao_direta: "bg-teal-100 text-teal-700 border-teal-200",
  financeiro: "bg-amber-100 text-amber-700 border-amber-200",
  administrativo: "bg-slate-100 text-slate-700 border-slate-200",
  operacional: "bg-orange-100 text-orange-700 border-orange-200",
  ti: "bg-cyan-100 text-cyan-700 border-cyan-200",
  recrutamento: "bg-pink-100 text-pink-700 border-pink-200",
  fiscal: "bg-yellow-100 text-yellow-700 border-yellow-200",
  estagiario: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  colaborador: "bg-slate-100 text-slate-700 border-slate-200",
};

const NIVEL_LABELS: Record<string, string> = {
  estagio: "estágio",
  assistente: "assistente",
  analista: "analista",
  coordenador: "coordenador",
  gerente: "gerente",
  diretor: "diretor",
};

const MATRIX_ROLES: { role: AppRole; label: string; shortLabel: string; isNew?: boolean }[] = [
  { role: "super_admin",         label: "Super Admin",          shortLabel: "S.Admin" },
  { role: "diretoria_executiva", label: "Diretoria Executiva",  shortLabel: "Diretoria", isNew: true },
  { role: "rh",                  label: "RH",                   shortLabel: "RH" },
  { role: "gestao_direta",       label: "Gestão Direta",        shortLabel: "Gestão" },
  { role: "financeiro",          label: "Financeiro",           shortLabel: "Financ." },
  { role: "administrativo",      label: "Administrativo",       shortLabel: "Admin." },
  { role: "operacional",         label: "Operacional",          shortLabel: "Operac." },
  { role: "ti",                  label: "TI",                   shortLabel: "TI" },
  { role: "recrutamento",        label: "Recrutamento",         shortLabel: "Recrut." },
  { role: "fiscal",              label: "Fiscal",               shortLabel: "Fiscal" },
  { role: "estagiario",          label: "Estagiário",           shortLabel: "Estag." },
  { role: "colaborador",         label: "Colaborador",          shortLabel: "Colab." },
];

const ALL_PERMISSIONS = ["view", "create", "edit", "delete", "aprovar", "enviar", "exportar", "fechar", "enviar_email"];
const PERMISSION_LABELS: Record<string, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Deletar",
  aprovar: "Aprovar",
  enviar: "Enviar",
  exportar: "Exportar",
  fechar: "Fechar",
  enviar_email: "Enviar E-mail",
};

const MODULOS_SENSIVEIS = new Set([
  "folha_pagamento", "notas_fiscais", "pagamentos_pj", "cargos",
  "memorias_fetely", "colaboradores", "contratos_pj", "usuarios",
]);

function ehModuloSensivel(key: string) {
  return MODULOS_SENSIVEIS.has(key);
}

type PermLevel = "full" | "partial" | "none" | "super";

function getDot(level: PermLevel) {
  switch (level) {
    case "super": return "bg-purple-500";
    case "full": return "bg-emerald-500";
    case "partial": return "bg-amber-400";
    case "none": return "border-2 border-muted-foreground/30 bg-transparent";
  }
}

interface RolePermissionRow {
  role_name: string;
  module: string;
  permission: string;
  granted: boolean;
  nivel_minimo: string | null;
}

interface MatrizPermissoesProps {
  // mantido para compat, mas não usado mais
  onNavigateToPerfis?: () => void;
}

interface SharedCtx {
  perms: RolePermissionRow[];
  roleCounts: Record<string, number>;
  podeEditar: boolean;
}

// Ações especiais por módulo (para popover multi-action)
const ACOES_ESPECIAIS_POR_MODULO: Record<string, string[]> = {
  ferias: ["aprovar"],
  notas_fiscais: ["aprovar", "enviar_email"],
  folha_pagamento: ["fechar", "exportar"],
  pagamentos_pj: ["aprovar", "exportar"],
  convites: ["enviar"],
  relatorios: ["exportar"],
};

function getAcoesDoModulo(moduleKey: string): string[] {
  const base = ["view", "create", "edit", "delete"];
  const especiais = ACOES_ESPECIAIS_POR_MODULO[moduleKey] || [];
  return [...base, ...especiais];
}

// ============================================================================
// Helpers shared across modes
// ============================================================================
function getModulePerms(perms: RolePermissionRow[], roleName: string, moduleName: string) {
  return perms.filter((p) => p.role_name === roleName && p.module === moduleName);
}

function getLevel(perms: RolePermissionRow[], roleName: string, moduleName: string): PermLevel {
  if (roleName === "super_admin") return "super";
  const modulePerms = getModulePerms(perms, roleName, moduleName);
  if (modulePerms.length === 0) return "none";
  const hasView = modulePerms.some((p) => p.permission === "view");
  const hasCreate = modulePerms.some((p) => p.permission === "create");
  const hasEdit = modulePerms.some((p) => p.permission === "edit");
  if (hasView && hasCreate && hasEdit) return "full";
  return "partial";
}

function temAlgumAcesso(perms: RolePermissionRow[], roleName: string, moduleName: string): boolean {
  if (roleName === "super_admin") return true;
  return getModulePerms(perms, roleName, moduleName).length > 0;
}

function getPermissao(perms: RolePermissionRow[], roleName: string, moduleName: string, action: string) {
  if (roleName === "super_admin") return { granted: true, nivel_minimo: null as string | null };
  const found = perms.find((p) => p.role_name === roleName && p.module === moduleName && p.permission === action);
  return { granted: !!found, nivel_minimo: found?.nivel_minimo ?? null };
}

// ============================================================================
// Alertas inteligentes
// ============================================================================
function calcularAlertas(perms: RolePermissionRow[]): string[] {
  const alertas: string[] = [];

  // Módulos com 0 perfis
  for (const mod of MODULES) {
    const rolesComAcesso = MATRIX_ROLES.filter(
      (r) => r.role !== "super_admin" && temAlgumAcesso(perms, r.role, mod.key)
    );
    if (rolesComAcesso.length === 0) {
      alertas.push(`Módulo "${mod.label}" não tem nenhum perfil (além do Super Admin) com acesso — possível erro de configuração.`);
    }
  }

  // Perfis sem nenhuma permissão
  for (const r of MATRIX_ROLES) {
    if (r.role === "super_admin") continue;
    const totalGranted = perms.filter((p) => p.role_name === r.role).length;
    if (totalGranted === 0) {
      alertas.push(`Perfil "${r.label}" não tem nenhuma permissão configurada.`);
    }
  }

  // Módulos sensíveis com muitos perfis
  for (const mod of MODULES) {
    if (!ehModuloSensivel(mod.key)) continue;
    const rolesComAcesso = MATRIX_ROLES.filter(
      (r) => r.role !== "super_admin" && temAlgumAcesso(perms, r.role, mod.key)
    );
    if (rolesComAcesso.length >= 5) {
      alertas.push(`🔐 Módulo sensível "${mod.label}" está acessível por ${rolesComAcesso.length} perfis — vale revisar se todos precisam mesmo.`);
    }
  }

  return alertas;
}

// ============================================================================
// Componente: Alertas Card
// ============================================================================
function AlertasCard({ alertas }: { alertas: string[] }) {
  if (alertas.length === 0) return null;
  return (
    <Card className="mb-4 bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">Observações</p>
            <ul className="text-xs text-amber-800 dark:text-amber-300/90 space-y-0.5">
              {alertas.map((a, i) => <li key={i}>• {a}</li>)}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Modo 1: Perfil Único
// ============================================================================
function ModoPerfilUnico({ perms, roleCounts, podeEditar }: SharedCtx) {
  const [roleSelecionada, setRoleSelecionada] = useState<string>(MATRIX_ROLES[0].role);
  const roleInfo = MATRIX_ROLES.find((r) => r.role === roleSelecionada)!;
  const userCount = roleCounts[roleSelecionada] ?? 0;
  const alertas = useMemo(() => calcularAlertas(perms), [perms]);

  return (
    <div className="space-y-4">
      <AlertasCard alertas={alertas} />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 max-w-sm">
          <Label className="text-xs text-muted-foreground mb-1 block">Perfil</Label>
          <Select value={roleSelecionada} onValueChange={setRoleSelecionada}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATRIX_ROLES.map((r) => (
                <SelectItem key={r.role} value={r.role}>
                  <div className="flex items-center gap-2">
                    <span>{r.label}</span>
                    {r.isNew && <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-400 text-emerald-700">Nova</Badge>}
                    
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground pb-2">
          👥 {userCount} {userCount === 1 ? "usuário usa" : "usuários usam"} esse perfil
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        🌷 Vendo tudo o que <strong className="text-foreground">{roleInfo.label}</strong> pode fazer na Fetely
      </p>

      {MODULE_CATEGORIES.map((cat) => {
        const modulesDaCat = MODULES.filter((m) => m.category === cat.key);
        const modulesComAcesso = modulesDaCat.filter((m) => temAlgumAcesso(perms, roleSelecionada, m.key));
        if (modulesComAcesso.length === 0) return null;

        return (
          <Card key={cat.key}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm ${cat.color}`}>
                {cat.label} · {modulesComAcesso.length}/{modulesDaCat.length} módulos acessíveis
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {modulesComAcesso.map((m) => {
                const acoes = getAcoesDoModulo(m.key);
                return (
                  <div key={m.key} className="flex items-center justify-between py-2 border-b last:border-0 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.label}</span>
                      {ehModuloSensivel(m.key) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-[9px] cursor-help">🔐 Sensível</Badge>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Contém dados pessoais (LGPD)</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {acoes.map((action) => {
                        const perm = getPermissao(perms, roleSelecionada, m.key, action);
                        const actionLabel = PERMISSION_LABELS[action] || action;
                        const pill = (
                          <Badge
                            variant={perm.granted ? "default" : "outline"}
                            className={`text-[10px] ${podeEditar ? "cursor-pointer" : "cursor-default"} ${!perm.granted ? "opacity-50" : ""}`}
                          >
                            {action}
                            {perm.nivel_minimo && " ⚡"}
                          </Badge>
                        );
                        const tooltipBody = (
                          <Tooltip key={action}>
                            <TooltipTrigger asChild>
                              <span>{pill}</span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              {perm.nivel_minimo
                                ? `Requer nível mínimo: ${NIVEL_LABELS[perm.nivel_minimo] || perm.nivel_minimo}`
                                : perm.granted ? "Permitido" : "Sem permissão"}
                            </TooltipContent>
                          </Tooltip>
                        );
                        if (!podeEditar) return tooltipBody;
                        return (
                          <CelulaPermissaoEditavel
                            key={action}
                            roleName={roleSelecionada}
                            roleLabel={roleInfo.label}
                            moduleName={m.key}
                            moduleLabel={m.label}
                            action={action}
                            actionLabel={actionLabel}
                            granted={perm.granted}
                            nivelMinimo={perm.nivel_minimo}
                            usuariosAfetados={userCount}
                          >
                            {tooltipBody}
                          </CelulaPermissaoEditavel>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================================
// Modo 2: Módulo Único
// ============================================================================
function ModoModuloUnico({ perms, roleCounts, podeEditar }: SharedCtx) {
  const [moduleSelecionado, setModuleSelecionado] = useState<string>(MODULES[0].key);
  const modInfo = MODULES.find((m) => m.key === moduleSelecionado)!;
  const sensivel = ehModuloSensivel(moduleSelecionado);
  const alertas = useMemo(() => calcularAlertas(perms), [perms]);

  const rolesComAcesso = MATRIX_ROLES.filter((r) => temAlgumAcesso(perms, r.role, moduleSelecionado));
  const rolesSemAcesso = MATRIX_ROLES.filter((r) => !temAlgumAcesso(perms, r.role, moduleSelecionado));

  return (
    <div className="space-y-4">
      <AlertasCard alertas={alertas} />

      <div className="max-w-md">
        <Label className="text-xs text-muted-foreground mb-1 block">Módulo</Label>
        <Select value={moduleSelecionado} onValueChange={setModuleSelecionado}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {MODULE_CATEGORIES.map((cat) => {
              const modsDaCat = MODULES.filter((m) => m.category === cat.key);
              if (modsDaCat.length === 0) return null;
              return (
                <SelectGroup key={cat.key}>
                  <SelectLabel className={cat.color}>{cat.label}</SelectLabel>
                  {modsDaCat.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      <span className="flex items-center gap-2">
                        {m.label} {ehModuloSensivel(m.key) && <span>🔐</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          🔎 Vendo quem pode acessar <strong className="text-foreground">{modInfo.label}</strong>
        </p>
        {sensivel && (
          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
            🔐 Módulo sensível — contém dados pessoais
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left p-3 font-medium text-xs text-muted-foreground">Perfil</th>
                <th className="text-left p-3 font-medium text-xs text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-xs text-muted-foreground">Permissões</th>
                <th className="text-left p-3 font-medium text-xs text-muted-foreground">Nível mínimo</th>
              </tr>
            </thead>
            <tbody>
              {rolesComAcesso.map((r) => {
                const modPerms = r.role === "super_admin"
                  ? ALL_PERMISSIONS.map((p) => ({ permission: p, nivel_minimo: null as string | null, role_name: r.role, module: moduleSelecionado, granted: true }))
                  : getModulePerms(perms, r.role, moduleSelecionado);
                const niveisUsados = modPerms.filter((p) => p.nivel_minimo).map((p) => `${p.permission}: ${NIVEL_LABELS[p.nivel_minimo!] || p.nivel_minimo}`);
                const isFull = r.role === "super_admin" || (
                  modPerms.some((p) => p.permission === "view") &&
                  modPerms.some((p) => p.permission === "create") &&
                  modPerms.some((p) => p.permission === "edit")
                );
                return (
                  <tr key={r.role} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[r.role] || ""}`}>{r.shortLabel}</Badge>
                        <span className="text-xs">{r.label}</span>
                        {r.isNew && <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-400 text-emerald-700">Nova</Badge>}
                        
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {r.role === "super_admin" ? (
                        <span className="text-purple-700 dark:text-purple-400">✅ Acesso total</span>
                      ) : isFull ? (
                        <span className="text-emerald-700 dark:text-emerald-400">✅ Acesso total</span>
                      ) : niveisUsados.length > 0 ? (
                        <span className="text-amber-700 dark:text-amber-400">⚡ Condicional</span>
                      ) : (
                        <span className="text-blue-700 dark:text-blue-400">✓ Acesso parcial</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {getAcoesDoModulo(moduleSelecionado).map((acao) => {
                          const perm = getPermissao(perms, r.role, moduleSelecionado, acao);
                          const userCount = roleCounts[r.role] ?? 0;
                          const actionLabel = PERMISSION_LABELS[acao] || acao;
                          const pill = (
                            <Badge
                              variant={perm.granted ? "default" : "outline"}
                              className={`text-[10px] ${podeEditar && r.role !== "super_admin" ? "cursor-pointer" : "cursor-default"} ${!perm.granted ? "opacity-50" : ""}`}
                            >
                              {acao}
                              {perm.nivel_minimo && " ⚡"}
                            </Badge>
                          );
                          if (!podeEditar || r.role === "super_admin") {
                            return <span key={acao}>{pill}</span>;
                          }
                          return (
                            <CelulaPermissaoEditavel
                              key={acao}
                              roleName={r.role}
                              roleLabel={r.label}
                              moduleName={moduleSelecionado}
                              moduleLabel={modInfo.label}
                              action={acao}
                              actionLabel={actionLabel}
                              granted={perm.granted}
                              nivelMinimo={perm.nivel_minimo}
                              usuariosAfetados={userCount}
                            >
                              {pill}
                            </CelulaPermissaoEditavel>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {niveisUsados.length > 0 ? niveisUsados.join(" · ") : "—"}
                    </td>
                  </tr>
                );
              })}
              {rolesSemAcesso.map((r) => (
                <tr key={r.role} className="border-b last:border-0 opacity-60 bg-muted/10">
                  <td className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">{r.shortLabel}</Badge>
                      <span className="text-xs text-muted-foreground">{r.label}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">❌ Sem acesso</td>
                  <td className="p-3 text-xs text-muted-foreground">—</td>
                  <td className="p-3 text-xs text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Modo 3: Comparar Perfis
// ============================================================================
function ModoCompararPerfis({ perms, roleCounts }: Omit<SharedCtx, "podeEditar">) {
  const [selecionados, setSelecionados] = useState<string[]>([MATRIX_ROLES[1].role, MATRIX_ROLES[2].role]);
  const [apenasDivergentes, setApenasDivergentes] = useState(true);
  const alertas = useMemo(() => calcularAlertas(perms), [perms]);

  function toggleRole(role: string) {
    setSelecionados((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role);
      if (prev.length >= 4) return prev;
      return [...prev, role];
    });
  }

  function linhasDivergem(moduleKey: string): boolean {
    const niveis = selecionados.map((role) => getLevel(perms, role, moduleKey));
    return new Set(niveis).size > 1;
  }

  const rolesSelInfos = selecionados.map((r) => MATRIX_ROLES.find((m) => m.role === r)!).filter(Boolean);
  const totalDivergencias = MODULES.filter((m) => linhasDivergem(m.key)).length;

  return (
    <div className="space-y-4">
      <AlertasCard alertas={alertas} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Selecione 2 a 4 perfis para comparar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MATRIX_ROLES.map((r) => {
              const ativo = selecionados.includes(r.role);
              const desabilitado = !ativo && selecionados.length >= 4;
              return (
                <button
                  key={r.role}
                  type="button"
                  disabled={desabilitado}
                  onClick={() => toggleRole(r.role)}
                  className={`px-3 py-1.5 rounded-md border text-xs transition-colors flex items-center gap-1.5 ${
                    ativo
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted/50 border-border"
                  } ${desabilitado ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {r.label}
                  {r.isNew && <span className="text-[8px] opacity-80">Nova</span>}
                  
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selecionados.length < 2 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          🌷 Escolha 2 a 4 perfis para comparar
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm text-muted-foreground">
                ⚖️ Comparando {selecionados.length} perfis — onde eles divergem?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                🔍 Encontrei {totalDivergencias} {totalDivergencias === 1 ? "diferença" : "diferenças"} entre esses perfis
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="apenas-div" checked={apenasDivergentes} onCheckedChange={setApenasDivergentes} />
              <Label htmlFor="apenas-div" className="text-xs cursor-pointer">Mostrar apenas linhas divergentes</Label>
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium text-xs text-muted-foreground sticky left-0 bg-muted/30 min-w-[200px]">Módulo</th>
                    {rolesSelInfos.map((r) => (
                      <th key={r.role} className="text-center p-3 font-medium text-xs min-w-[120px]">
                        <div className="flex flex-col items-center gap-1">
                          <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[r.role] || ""}`}>{r.shortLabel}</Badge>
                          {r.isNew && <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-400 text-emerald-700">Nova</Badge>}
                          
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULE_CATEGORIES.map((cat) => {
                    const modsDaCat = MODULES.filter((m) => m.category === cat.key);
                    const modsVisiveis = apenasDivergentes ? modsDaCat.filter((m) => linhasDivergem(m.key)) : modsDaCat;
                    if (modsVisiveis.length === 0) return null;
                    return (
                      <Fragment key={cat.key}>
                        <tr>
                          <td colSpan={rolesSelInfos.length + 1} className="pt-3 pb-1 px-3 sticky left-0 bg-background">
                            <span className={`text-xs font-semibold uppercase tracking-wider ${cat.color}`}>{cat.label}</span>
                          </td>
                        </tr>
                        {modsVisiveis.map((mod) => {
                          const divergente = linhasDivergem(mod.key);
                          return (
                            <tr
                              key={mod.key}
                              className={`border-b border-muted/50 ${divergente ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}
                            >
                              <td className="py-2.5 px-3 font-medium text-xs sticky left-0 bg-inherit">
                                <div className="flex items-center gap-1.5">
                                  {mod.label}
                                  {ehModuloSensivel(mod.key) && (
                                    <Tooltip>
                                      <TooltipTrigger asChild><span className="cursor-help">🔐</span></TooltipTrigger>
                                      <TooltipContent className="text-xs">Módulo sensível — contém dados pessoais (LGPD)</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </td>
                              {rolesSelInfos.map((r) => {
                                const level = getLevel(perms, r.role, mod.key);
                                return (
                                  <td key={r.role} className="text-center py-2.5 px-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={`inline-block h-3.5 w-3.5 rounded-full cursor-default ${getDot(level)}`} />
                                      </TooltipTrigger>
                                      <TooltipContent className="text-xs">
                                        {r.label}: {level === "super" ? "Acesso total" : level === "full" ? "Acesso completo" : level === "partial" ? "Acesso parcial" : "Sem acesso"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Modo 4: Matriz Completa (preserva implementação original)
// ============================================================================
function ModoMatrizCompleta({ perms, roleCounts, podeEditar }: SharedCtx) {
  const alertas = useMemo(() => calcularAlertas(perms), [perms]);

  const getAllModulePermNames = (moduleName: string) => {
    const found = new Set<string>();
    perms.forEach((p) => { if (p.module === moduleName) found.add(p.permission); });
    return ALL_PERMISSIONS.filter((p) => found.has(p));
  };

  const getTooltipContent = (roleName: string, moduleName: string, roleLabel: string, moduleLabel: string) => {
    if (roleName === "super_admin") return `${roleLabel}: Acesso total a ${moduleLabel}`;
    const modulePerms = getModulePerms(perms, roleName, moduleName);
    const allPermsForModule = getAllModulePermNames(moduleName);
    if (allPermsForModule.length === 0) return `${roleLabel}: Sem permissões definidas para ${moduleLabel}`;
    const grantedMap = new Map<string, string | null>();
    modulePerms.forEach((p) => grantedMap.set(p.permission, p.nivel_minimo));
    const lines = allPermsForModule.map((p) => {
      const has = grantedMap.has(p);
      const nivel = has ? grantedMap.get(p) : null;
      const suffix = nivel ? ` (mín. ${NIVEL_LABELS[nivel] || nivel})` : "";
      return `${PERMISSION_LABELS[p] || p} ${has ? "✓" : "✗"}${suffix}`;
    });
    return `${roleLabel} em ${moduleLabel}:\n${lines.join("\n")}`;
  };

  const moduleGroups = MODULE_CATEGORIES
    .map((cat) => ({ category: cat, modules: MODULES.filter((m) => m.category === cat.key) }))
    .filter((g) => g.modules.length > 0);

  return (
    <div className="space-y-4">
      <AlertasCard alertas={alertas} />

      {podeEditar && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-3 flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold">🌷 Edição direta ativada</p>
            <p className="text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
              Clique em qualquer bolinha colorida para alterar a permissão. Módulos com 🔐 pedem confirmação extra.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-900 dark:text-blue-200 space-y-1">
          <p className="font-semibold">Matriz com {MATRIX_ROLES.length} perfis e 6 níveis hierárquicos</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-800/90 dark:text-blue-300/90">
            <li>Perfis com nível (RH, Gestão, Financeiro, etc.) suportam granularidade — ex.: "Fechar competência" só a partir de Coordenador.</li>
            <li><span className="font-medium">Diretoria Executiva</span> tem visibilidade executiva total sem poder configurar nada.</li>
            <li>Módulos com 🔐 são sensíveis — contêm dados pessoais (LGPD).</li>
            <li>Passe o mouse nas células para ver detalhes de nível mínimo exigido.</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-purple-500" /> Super Admin
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Acesso completo
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Acesso parcial
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-muted-foreground/30" /> Sem acesso
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground min-w-[220px] sticky left-0 bg-background z-10">Módulo</th>
              {MATRIX_ROLES.map((r) => (
                <th key={r.role} className="text-center py-2 px-2 font-medium min-w-[90px]">
                  <div className="flex flex-col items-center gap-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[r.role] || ""}`}>
                      {r.shortLabel}
                    </Badge>
                    {r.isNew && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 border-emerald-400 text-emerald-700">Nova</Badge>
                    )}
                    {/* perfis legados removidos da matriz */}
                    <span className="text-[10px] text-muted-foreground">
                      {roleCounts?.[r.role] ?? 0} {(roleCounts?.[r.role] ?? 0) === 1 ? "usuário" : "usuários"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {moduleGroups.map((group) => (
              <Fragment key={`group-${group.category.key}`}>
                <tr>
                  <td colSpan={MATRIX_ROLES.length + 1} className="pt-4 pb-1 sticky left-0 bg-background">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${group.category.color}`}>
                      {group.category.label}
                    </span>
                  </td>
                </tr>
                {group.modules.map((mod) => (
                  <tr key={mod.key} className="border-b border-muted/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 pr-4 font-medium sticky left-0 bg-background">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{mod.label}</span>
                        {ehModuloSensivel(mod.key) && (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-help">🔐</span></TooltipTrigger>
                            <TooltipContent className="text-xs">Módulo sensível — contém dados pessoais (LGPD)</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    {MATRIX_ROLES.map((r) => {
                      const level = getLevel(perms, r.role, mod.key);
                      const tip = getTooltipContent(r.role, mod.key, r.label, mod.label);
                      const dotEl = (
                        <span className={`inline-block h-3.5 w-3.5 rounded-full ${podeEditar && r.role !== "super_admin" ? "cursor-pointer" : "cursor-default"} ${getDot(level)}`} />
                      );
                      const tooltipEl = (
                        <Tooltip>
                          <TooltipTrigger asChild>{dotEl}</TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[320px] whitespace-pre-line text-xs">
                            {tip}
                          </TooltipContent>
                        </Tooltip>
                      );
                      if (!podeEditar || r.role === "super_admin") {
                        return (
                          <td key={r.role} className="text-center py-2.5 px-2">
                            {tooltipEl}
                          </td>
                        );
                      }
                      const acoesDoModulo = getAcoesDoModulo(mod.key);
                      return (
                        <td key={r.role} className="text-center py-2.5 px-2">
                          <CelulaPermissaoEditavel
                            roleName={r.role}
                            roleLabel={r.label}
                            moduleName={mod.key}
                            moduleLabel={mod.label}
                            granted={false}
                            nivelMinimo={null}
                            usuariosAfetados={roleCounts[r.role] ?? 0}
                            multiAction
                            acoesDisponiveis={acoesDoModulo.map((a) => ({ key: a, label: PERMISSION_LABELS[a] || a }))}
                            getPermissaoForAction={(acao) => getPermissao(perms, r.role, mod.key, acao)}
                          >
                            {tooltipEl}
                          </CelulaPermissaoEditavel>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Componente principal
// ============================================================================
export default function MatrizPermissoes({ onNavigateToPerfis: _onNavigateToPerfis }: MatrizPermissoesProps = {}) {
  const { roles: myRoles } = useAuth();
  const isSuperAdmin = myRoles.includes("super_admin");
  const podeEditar = isSuperAdmin;
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [mostrarComparacao, setMostrarComparacao] = useState(false);

  const { data: todasPermissoes, isLoading, isFetching } = useQuery({
    queryKey: ["all-role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_name, module, permission, granted, nivel_minimo")
        .eq("granted", true);
      if (error) throw error;
      setLastUpdated(new Date());
      return (data || []) as RolePermissionRow[];
    },
    refetchInterval: 30000,
  });

  const { data: roleCounts } = useQuery({
    queryKey: ["role-user-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((r) => { counts[r.role] = (counts[r.role] || 0) + 1; });
      return counts;
    },
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-role-permissions"] });
    queryClient.invalidateQueries({ queryKey: ["role-user-counts"] });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const ctx: SharedCtx = {
    perms: todasPermissoes || [],
    roleCounts: roleCounts || {},
    podeEditar,
  };

  const formattedTime = lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Matriz de Permissões</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">
                Atualizado em {formattedTime} • Atualiza automaticamente a cada 30s
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setMostrarComparacao(true)}
          >
            <Scale className="h-3.5 w-3.5" />
            Comparar Perfis
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={200}>
          <Tabs defaultValue="perfil" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4 h-auto">
              <TabsTrigger value="perfil" className="text-xs sm:text-sm">🔍 Perfil Único</TabsTrigger>
              <TabsTrigger value="modulo" className="text-xs sm:text-sm">📊 Módulo Único</TabsTrigger>
              <TabsTrigger value="completa" className="text-xs sm:text-sm">🗺 Matriz Completa</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil"><ModoPerfilUnico {...ctx} /></TabsContent>
            <TabsContent value="modulo"><ModoModuloUnico {...ctx} /></TabsContent>
            <TabsContent value="completa"><ModoMatrizCompleta {...ctx} /></TabsContent>
          </Tabs>

          <Dialog open={mostrarComparacao} onOpenChange={setMostrarComparacao}>
            <DialogContent className="max-w-[90vw] sm:max-w-[80vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Comparar Perfis
                </DialogTitle>
                <DialogDescription>
                  Compare 2 a 4 perfis lado a lado para identificar divergências.
                </DialogDescription>
              </DialogHeader>
              <ModoCompararPerfis perms={ctx.perms} roleCounts={ctx.roleCounts} />
            </DialogContent>
          </Dialog>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
