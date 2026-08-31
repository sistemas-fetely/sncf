import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, UserCheck, UserX, Users, UserPlus,
  Shield, ShieldCheck, ShieldAlert, Pencil, Trash2,
  ChevronDown, ChevronRight, FileText, Sparkles, Check, Ghost, Loader2, ScanSearch, History,
} from "lucide-react";
import { toast } from "sonner";
import { GrupoCell } from "@/components/gerenciar-usuarios/GrupoCell";
import NovoUsuarioDialog from "@/components/gerenciar-usuarios/NovoUsuarioDialog";
import MesaUsuariosTab from "@/components/gerenciar-usuarios/MesaUsuariosTab";
import DiagnosticoAcessoTab from "@/components/gerenciar-usuarios/DiagnosticoAcessoTab";
import RastroAcessoTab from "@/components/gerenciar-usuarios/RastroAcessoTab";
import PapeisTab from "@/components/gerenciar-usuarios/PapeisTab";
import ConsoleAcessoTab from "@/components/gerenciar-usuarios/ConsoleAcessoTab";
import { PageHeader } from "@/components/layout/PageHeader";


import { useUnidades } from "@/hooks/useUnidades";
import { useTemplates } from "@/hooks/useTemplates";

import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { usePermissoesDoUsuario, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  diretoria_executiva: "Diretoria Executiva",
  rh: "RH",
  gestao_direta: "Gestão Direta",
  financeiro: "Financeiro",
  administrativo: "Administrativo",
  operacional: "Operacional",
  ti: "TI",
  recrutamento: "Recrutamento",
  fiscal: "Fiscal",
  estagiario: "Estagiário",
  colaborador: "Colaborador",
  coordenador: "Coordenador",
  diretor: "Diretor",
  operador: "Operador",
  // Legados (mantidos só por compatibilidade — não aparecem na UI nova)
  admin_rh: "Admin RH",
  admin_ti: "Admin TI",
  gestor_rh: "Gestor RH",
  gestor_direto: "Gestor Direto",
  recrutador: "Recrutador",
  comprador: "Comprador",
  triagem: "Triagem",
  coordenacao_op_fin: "Coordenação Op/Fin",
  auditor: "Auditor",
  diretoria: "Diretor",
  folha: "Folha",
  gerente: "Gerente",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Acesso total ao sistema. Único que vê salário C-Level e configura perfis.",
  diretoria_executiva: "Visibilidade executiva total — vê tudo, inclusive todas as remunerações, mas não configura nem edita nada. Para sócios e board.",
  rh: "Recursos Humanos. Acesso conforme nível: do Estágio ao Diretor.",
  gestao_direta: "Liderança de time. Acessa suas informações e as do time conforme organograma.",
  financeiro: "Financeiro. Folha, NF, pagamentos PJ. Acesso conforme nível.",
  administrativo: "Administrativo geral. Acesso conforme nível.",
  operacional: "Operacional (ponto, turnos, NRs). Acesso conforme nível.",
  ti: "Tecnologia da Informação. Ativos, acessos, documentação.",
  recrutamento: "Recrutamento e Seleção. Acesso conforme nível.",
  fiscal: "Fiscal e tributário. NF-e e integração ERP.",
  estagiario: "Estagiário de qualquer área. Permissões reduzidas conforme nível.",
  colaborador: "Portal self-service. Acessa apenas seus próprios dados.",
  coordenador: "Coordenador de área ou operação. Acesso conforme nível.",
  diretor: "Diretor. Visibilidade ampla da área. Acesso conforme nível.",
  operador: "Operador de processo ou sistema. Acesso conforme nível.",
  // Legados (não exibidos)
  admin_rh: "[Legado] substituído por RH",
  admin_ti: "[Legado] substituído por TI",
  gestor_rh: "[Legado] substituído por RH",
  gestor_direto: "[Legado] substituído por Gestão Direta",
  recrutador: "[Legado] substituído por Recrutamento",
  comprador: "Comprador — acesso ao módulo de compras.",
  triagem: "Triagem operacional de pedidos.",
  coordenacao_op_fin: "Coordenação entre operação e financeiro.",
  auditor: "Auditoria — leitura ampla para conferência.",
  diretoria: "Diretor — visibilidade da diretoria.",
  folha: "Folha de pagamento — acesso conforme nível.",
  gerente: "Gerente de área ou operação. Acesso conforme nível.",
};

const ACTIVE_ROLES: AppRole[] = [
  "super_admin", "diretoria_executiva", "rh", "gestao_direta", "financeiro",
  "administrativo", "operacional", "ti", "recrutamento", "fiscal",
  "estagiario", "colaborador",
];
const FUTURE_ROLES: AppRole[] = [];
const LEGACY_ROLES: AppRole[] = [
  "admin_rh", "admin_ti", "gestor_rh", "gestor_direto", "recrutador",
];
const ALL_ROLES: AppRole[] = [...ACTIVE_ROLES, ...FUTURE_ROLES];

const ROLES_COM_NIVEL: AppRole[] = [
  "rh", "gestao_direta", "financeiro", "administrativo",
  "operacional", "ti", "recrutamento", "fiscal", "estagiario",
];

const isFutureRole = (role: AppRole) => FUTURE_ROLES.includes(role);
const isLegacyRole = (role: AppRole) => LEGACY_ROLES.includes(role);

async function callManageUser(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("manage-user", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}


export default function GerenciarUsuarios() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const abaBruta = searchParams.get("aba") || searchParams.get("tab") || "usuarios";
  // CONSOLE DE ACESSO ÚNICO: as antigas abas "grupos" e "acoes" viraram uma só.
  const activeTab = abaBruta === "grupos" || abaBruta === "acoes" ? "acesso" : abaBruta;
  const handleTabChange = (value: string) => {
    setSearchParams(value === "usuarios" ? {} : { aba: value }, { replace: true });
  };
  const { roles: myRoles } = useAuth();
  const isSuperAdmin = myRoles.includes("super_admin");
  // ABA-QUE-É-TELA-VIRA-LINHA (23/08/2026): as abas de auditoria de acesso
  // (Contas sem Perfil, Diagnóstico, Rastro) eram escondidas por
  // `isSuperAdmin &&` no JSX — regra de acesso em código, invisível ao
  // catálogo. Agora vêm de tela.acesso_auditoria, que já está declarada em
  // sncf_navegacao e concedida aos mesmos grupos de hoje.
  const { data: permitidas } = usePermissoesDoUsuario();
  const podeAuditarAcesso = isSuperAdmin || temPermissaoTela("tela.acesso_auditoria", permitidas);
  const isAdminRH = myRoles.includes("admin_rh");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "", full_name: "", roles: ["colaborador"] as string[],
    tipo_acesso: "externo" as "vinculado" | "externo",
    colaborador_id: "", colaborador_tipo: ""
  });
  const [novoUsuarioOpen, setNovoUsuarioOpen] = useState(false);

  // V3 — Template / Departamento / Unidade para Novo Usuário
  const [templateId, setTemplateId] = useState<string>("");
  const [departamentoId, setDepartamentoId] = useState<string>("");
  const [departamentoLabel, setDepartamentoLabel] = useState<string>("");
  const [unidadeIdNovo, setUnidadeIdNovo] = useState<string>("");
  const { data: templates } = useTemplates();
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });


  const { data: authUsers = [] } = useQuery({
    queryKey: ["admin-auth-users"],
    queryFn: async () => {
      const result = await callManageUser("list_users", {});
      return result.users || [];
    },
  });

  const { data: unidadesV2 = [] } = useUnidades();


  const { data: unlinkedCLT = [] } = useQuery({
    queryKey: ["unlinked-clt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores_clt")
        .select("id, nome_completo, cargo")
        .is("user_id", null)
        .eq("status", "ativo");
      if (error) throw error;
      return data;
    },
  });

  const { data: unlinkedPJ = [] } = useQuery({
    queryKey: ["unlinked-pj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos_pj")
        .select("id, contato_nome, razao_social")
        .is("user_id", null)
        .eq("status", "ativo");
      if (error) throw error;
      return data;
    },
  });

  // F5 (25/08/2026) — Prévia honesta: papel/nível do template + grupos da área.
  const { data: previaAcesso } = useQuery({
    queryKey: ["previa-acesso-cargo", templateId, departamentoId],
    enabled: !!templateId && !!departamentoId,
    queryFn: async () => {
      const [tplRes, depRes] = await Promise.all([
        supabase.from("cargo_template").select("papel").eq("id", templateId).maybeSingle(),
        supabase.from("departamentos").select("perfil_area_codigo").eq("id", departamentoId).maybeSingle(),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (depRes.error) throw depRes.error;
      const papel = (tplRes.data as { papel?: string | null } | null)?.papel ?? null;
      const areaCodigo = (depRes.data as { perfil_area_codigo?: string | null } | null)?.perfil_area_codigo ?? null;

      let nivel: number | null = null;
      if (papel) {
        const { data: nv } = await supabase
          .from("papel_nivel")
          .select("nivel")
          .eq("papel", papel as never)
          .maybeSingle();
        nivel = (nv as { nivel?: number } | null)?.nivel ?? null;
      }

      let grupos: string[] = [];
      if (areaCodigo) {
        const { data: ga, error: errGa } = await supabase
          .from("area_grupo_acesso")
          .select("grupos_acesso(nome)")
          .eq("perfil_area_codigo", areaCodigo);
        if (errGa) throw errGa;
        grupos = ((ga || []) as Array<{ grupos_acesso: { nome: string } | null }>)
          .map((r) => r.grupos_acesso?.nome)
          .filter((n): n is string => !!n);
      }

      return { papel, nivel, areaCodigo, grupos };
    },
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const result = await callManageUser("create_user_standalone", {
        email: newUser.email,
        full_name: newUser.full_name,
        roles: [], // V2: roles legados não são mais usados — perfis vêm via template
        colaborador_id: newUser.tipo_acesso === "vinculado" && newUser.colaborador_id ? newUser.colaborador_id : undefined,
        colaborador_tipo: newUser.tipo_acesso === "vinculado" ? newUser.colaborador_tipo : "all",
      });

      const novoUserId = result?.user_id;
      let concessao: { papel?: string; nivel?: number; telas?: number } | null = null;
      if (novoUserId && templateId) {
        const { data: authData } = await supabase.auth.getUser();
        const { error: errTemplate } = await supabase.rpc("aplicar_template_cargo_v3", {
          _user_id: novoUserId,
          _template_id: templateId,
          _departamento_id: departamentoId || null,
          _unidade_id: unidadeIdNovo || null,
          _atribuidor: authData?.user?.id || null,
        });
        if (errTemplate) {
          toast.warning(
            "Usuário criado, mas falha ao aplicar template: " + errTemplate.message
          );
        }

        // F5 — concessão real de acesso (papel em user_roles + grupos). FAIL-LOUD.
        const { data: acesso, error: errAcesso } = await (supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>)(
          "conceder_acesso_por_cargo",
          {
            p_user_id: novoUserId,
            p_template_id: templateId,
            p_departamento_id: departamentoId || null,
          },
        );
        if (errAcesso) throw new Error("Falha ao conceder acesso: " + errAcesso.message);
        concessao = acesso as { papel?: string; nivel?: number; telas?: number };
      }
      return { ...result, concessao };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-clt"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-pj"] });
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-todas-v2"] });
      queryClient.invalidateQueries({ queryKey: ["grupos-acesso-v2"] });
      queryClient.invalidateQueries({ queryKey: ["grupo-acesso-vinculo"] });
      queryClient.invalidateQueries({ queryKey: ["mesa-grupos-usuarios"] });
      const c = (res as { concessao?: { papel?: string; nivel?: number; telas?: number } | null })?.concessao;
      toast.success(
        c?.papel
          ? `Usuário criado · ${c.papel} (nível ${c.nivel ?? "?"}) · ${c.telas ?? 0} telas liberadas`
          : "Usuário criado! Um e-mail com link de acesso foi enviado."
      );
      setCreateOpen(false);
      setNewUser({ email: "", full_name: "", roles: ["colaborador"], tipo_acesso: "externo", colaborador_id: "", colaborador_tipo: "" });
      setTemplateId("");
      setDepartamentoId("");
      setDepartamentoLabel("");
      setUnidadeIdNovo("");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao criar usuário"),
  });


  const toggleNewUserRole = (role: string) => {
    setNewUser((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  };

  const pendingCount = profiles.filter((p) => !p.approved).length;
  const approvedCount = profiles.filter((p) => p.approved).length;
  const bannedCount = authUsers.filter((u: { banned: boolean }) => u.banned).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gerenciar Usuários"
        estado="Cadastrar, ativar/inativar e gerenciar perfis de acesso"
        acoes={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Novo Usuário
          </Button>
        }
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Usuário</DialogTitle>
              <DialogDescription>O usuário receberá um e-mail com link para definir senha no primeiro acesso.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Nome do usuário"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail Corporativo *</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Acesso</Label>
                <Select value={newUser.tipo_acesso} onValueChange={(v: "vinculado" | "externo") => setNewUser({ ...newUser, tipo_acesso: v, colaborador_id: "", colaborador_tipo: "" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="externo">Usuário externo (sem vínculo)</SelectItem>
                    <SelectItem value="vinculado">Colaborador vinculado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newUser.tipo_acesso === "externo"
                    ? "Contador, advogado, consultor ou sócio com acesso ao sistema"
                    : "Vincular a um cadastro CLT ou PJ existente"}
                </p>
              </div>
              {newUser.tipo_acesso === "vinculado" && (
                <div className="space-y-2">
                  <Label>Vincular a</Label>
                  <Select value={newUser.colaborador_tipo || "none"} onValueChange={(v) => setNewUser({ ...newUser, colaborador_tipo: v === "none" ? "" : v, colaborador_id: "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      <SelectItem value="clt">Colaborador CLT</SelectItem>
                      <SelectItem value="pj">Contrato PJ</SelectItem>
                    </SelectContent>
                  </Select>
                  {newUser.colaborador_tipo === "clt" && (
                    <Select value={newUser.colaborador_id || "none"} onValueChange={(v) => setNewUser({ ...newUser, colaborador_id: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o colaborador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione...</SelectItem>
                        {unlinkedCLT.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_completo} — {c.cargo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {newUser.colaborador_tipo === "pj" && (
                    <Select value={newUser.colaborador_id || "none"} onValueChange={(v) => setNewUser({ ...newUser, colaborador_id: v === "none" ? "" : v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione...</SelectItem>
                        {unlinkedPJ.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.contato_nome} — {c.razao_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Template de cargo *
                </Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o template (define os perfis padrão)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(templates || []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{t.nome}</span>
                          {t.descricao && (
                            <span className="text-[10px] text-muted-foreground leading-tight">
                              {t.descricao}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O template já vem com os perfis padrão. Você pode ajustar depois no Hub da Pessoa.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Departamento *</Label>
                  <SelectDepartamentoHierarquico
                    valueId={departamentoId || null}
                    valueTexto={departamentoLabel}
                    onChange={(dep) => {
                      setDepartamentoId(dep?.id || "");
                      setDepartamentoLabel(dep?.label || "");
                    }}
                  />
                  {previaAcesso && (
                    <div className="space-y-2">
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span className="text-muted-foreground">Acesso que será concedido:</span>
                        </div>
                        <div className="mt-1 ml-5 space-y-0.5">
                          <div>
                            <span className="text-muted-foreground">Papel: </span>
                            <span className="font-medium text-primary">
                              {previaAcesso.papel
                                ? `${ROLE_LABELS[previaAcesso.papel as AppRole] || previaAcesso.papel} (nível ${previaAcesso.nivel ?? "?"})`
                                : "— (template sem papel definido)"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Grupos: </span>
                            <span className="font-medium text-primary">
                              {["Base Fetely", ...previaAcesso.grupos].join(" + ")}
                            </span>
                          </div>
                        </div>
                      </div>
                      {previaAcesso.grupos.length === 0 && (
                        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                          Esta área ainda não tem grupo de acesso. A pessoa entrará só com o acesso básico (Base Fetely).
                        </div>
                      )}
                    </div>
                  )}

                </div>
                <div className="space-y-2">
                  <Label>Unidade *</Label>
                  <Select value={unidadeIdNovo} onValueChange={setUnidadeIdNovo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {(unidadesV2 || []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => createUser.mutate()}
                disabled={
                  !newUser.email ||
                  !newUser.full_name ||
                  !templateId ||
                  !departamentoId ||
                  !unidadeIdNovo ||
                  createUser.isPending
                }
              >
                {createUser.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Faixa fina de leitura (não clicável) — mesmos números dos antigos 4 cards. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-xs">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-info" />
          <span className="font-medium tabular-nums text-info">{profiles.length}</span>
          <span className="text-muted-foreground">total</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1">
          <UserCheck className="h-3.5 w-3.5 text-success" />
          <span className="font-medium tabular-nums text-success">{approvedCount}</span>
          <span className="text-muted-foreground">ativos</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1">
          <UserX className="h-3.5 w-3.5 text-warning" />
          <span className="font-medium tabular-nums text-warning">{pendingCount}</span>
          <span className="text-muted-foreground">pendentes</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          <span className="font-medium tabular-nums text-destructive">{bannedCount}</span>
          <span className="text-muted-foreground">inativos</span>
        </span>
      </div>


      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
          <TabsTrigger value="acesso" className="gap-2"><ShieldCheck className="h-4 w-4" /> Console de Acesso</TabsTrigger>
          <TabsTrigger value="papeis" className="gap-2"><Shield className="h-4 w-4" /> Papéis</TabsTrigger>
          {podeAuditarAcesso && (
            <TabsTrigger value="fantasmas" className="gap-2">
              <Ghost className="h-4 w-4" /> Contas sem perfil
            </TabsTrigger>
          )}
          {podeAuditarAcesso && (
            <TabsTrigger value="diagnostico" className="gap-2">
              <ScanSearch className="h-4 w-4" /> Diagnóstico
            </TabsTrigger>
          )}
          {podeAuditarAcesso && (
            <TabsTrigger value="rastro" className="gap-2">
              <History className="h-4 w-4" /> Rastro
            </TabsTrigger>
          )}


        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          <MesaUsuariosTab
            isSuperAdmin={isSuperAdmin}
            podeCriar={isSuperAdmin || isAdminRH}
            onNovoUsuario={() => setNovoUsuarioOpen(true)}
          />
        </TabsContent>


        <TabsContent value="papeis" className="mt-4">
          <PapeisTab />
        </TabsContent>

        <TabsContent value="acesso" className="mt-4">
          <ConsoleAcessoTab />
        </TabsContent>

        {podeAuditarAcesso && (
          <TabsContent value="fantasmas" className="mt-4">
            <ContasSemPerfilTab
              profileUserIds={new Set((profiles || []).map((p: any) => p.user_id))}
            />
          </TabsContent>
        )}

        {podeAuditarAcesso && (
          <TabsContent value="diagnostico" className="mt-4">
            <DiagnosticoAcessoTab />
          </TabsContent>
        )}

        {podeAuditarAcesso && (
          <TabsContent value="rastro" className="mt-4">
            <RastroAcessoTab />
          </TabsContent>
        )}



      </Tabs>

      <NovoUsuarioDialog open={novoUsuarioOpen} onOpenChange={setNovoUsuarioOpen} />
    </div>
  );
}

function ContasSemPerfilTab({ profileUserIds }: { profileUserIds: Set<string> }) {
  const queryClient = useQueryClient();
  const [targetUser, setTargetUser] = useState<{ id: string; email: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: authUsers = [], isLoading } = useQuery({
    queryKey: ["admin-auth-users-fantasmas"],
    queryFn: async () => {
      const result = await callManageUser("list_users", {});
      return (result.users || []) as Array<{ id: string; email: string; created_at: string; last_sign_in_at: string | null }>;
    },
  });

  const fantasmas = authUsers.filter((u) => !profileUserIds.has(u.id));

  const fmtDate = (v: string | null) => {
    if (!v) return "Nunca";
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const handleDelete = async () => {
    if (!targetUser) return;
    setDeleting(true);
    try {
      await callManageUser("delete_user", { user_id: targetUser.id });
      toast.success(`Conta ${targetUser.email} excluída`);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users-fantasmas"] });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      setTargetUser(null);
    } catch (e: any) {
      toast.error(`Falha ao excluir: ${e?.message || e}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Ghost className="h-5 w-5" /> Contas sem perfil
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Contas de autenticação que não têm registro em profiles. Excluí-las libera o e-mail para reuso.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : fantasmas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p>Nenhuma conta sem perfil. Tudo limpo.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fantasmas.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>{fmtDate(u.created_at)}</TableCell>
                  <TableCell>{fmtDate(u.last_sign_in_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setTargetUser({ id: u.id, email: u.email })}
                      className="gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={!!targetUser} onOpenChange={(o) => !o && !deleting && setTargetUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir definitivamente a conta <strong>{targetUser?.email}</strong>? Esta ação remove o usuário de auth.users e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Excluindo…</> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
