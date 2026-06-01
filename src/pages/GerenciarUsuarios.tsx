import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import GruposAcessoTabV2 from "@/components/grupos-acesso/GruposAcessoTabV2";

import MatrizPermissoes from "@/components/gerenciar-usuarios/MatrizPermissoes";
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
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, XCircle, UserCheck, UserX, Users, UserPlus,
  Shield, ShieldCheck, ShieldAlert, Pencil, Trash2, Link2, LinkIcon, Unlink,
  ChevronDown, ChevronRight, FileText, Sparkles, Check, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmacaoDupla } from "@/components/ConfirmacaoDupla";
import { DrawerUsuario } from "@/components/DrawerUsuario";
import { HubDaPessoaDialog } from "@/components/gerenciar-usuarios/HubDaPessoaDialog";
import { GrupoCell } from "@/components/gerenciar-usuarios/GrupoCell";
import NovoUsuarioDialog from "@/components/gerenciar-usuarios/NovoUsuarioDialog";
import { useUnidades } from "@/hooks/useUnidades";
import { useTemplates } from "@/hooks/useTemplates";
import { useDepartamentoInfo } from "@/hooks/useEstruturaOrganizacional";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const ROLE_LABELS: Record<AppRole, string> = {
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
  // Legados (mantidos só por compatibilidade — não aparecem na UI nova)
  admin_rh: "Admin RH",
  admin_ti: "Admin TI",
  gestor_rh: "Gestor RH",
  gestor_direto: "Gestor Direto",
  recrutador: "Recrutador",
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
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
  // Legados (não exibidos)
  admin_rh: "[Legado] substituído por RH",
  admin_ti: "[Legado] substituído por TI",
  gestor_rh: "[Legado] substituído por RH",
  gestor_direto: "[Legado] substituído por Gestão Direta",
  recrutador: "[Legado] substituído por Recrutamento",
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
  const activeTab = searchParams.get("tab") || "usuarios";
  const handleTabChange = (value: string) => {
    setSearchParams(value === "usuarios" ? {} : { tab: value }, { replace: true });
  };
  const { roles: myRoles } = useAuth();
  const isSuperAdmin = myRoles.includes("super_admin");
  const isAdminRH = myRoles.includes("admin_rh");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ userId: string; name: string } | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [selectedColabTipo, setSelectedColabTipo] = useState<string>("");
  const [newUser, setNewUser] = useState({
    email: "", full_name: "", roles: ["colaborador"] as string[],
    tipo_acesso: "externo" as "vinculado" | "externo",
    colaborador_id: "", colaborador_tipo: ""
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; name: string } | null>(null);
  const [removeSuperAdminConfirm, setRemoveSuperAdminConfirm] = useState<
    { userId: string; name: string; mode: "ban" | "delete" } | null
  >(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUser, setLinkUser] = useState<{ userId: string; name: string } | null>(null);
  const [linkColaboradorId, setLinkColaboradorId] = useState("");
  const [linkContratoPjId, setLinkContratoPjId] = useState("");
  const [drawerUsuarioId, setDrawerUsuarioId] = useState<string | null>(null);
  const [novoUsuarioOpen, setNovoUsuarioOpen] = useState(false);

  // V3 — Template / Departamento / Unidade para Novo Usuário
  const [templateId, setTemplateId] = useState<string>("");
  const [departamentoId, setDepartamentoId] = useState<string>("");
  const [departamentoLabel, setDepartamentoLabel] = useState<string>("");
  const [unidadeIdNovo, setUnidadeIdNovo] = useState<string>("");
  const { data: templates } = useTemplates();
  const { data: departamentoInfo } = useDepartamentoInfo(departamentoId || null);
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

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
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

  // Fetch linked CLT/PJ to determine user type badges
  const { data: linkedCLT = [] } = useQuery({
    queryKey: ["linked-clt-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaboradores_clt")
        .select("id, user_id, nome_completo, cargo")
        .not("user_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const { data: linkedPJ = [] } = useQuery({
    queryKey: ["linked-pj-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos_pj")
        .select("id, user_id, contato_nome, tipo_servico")
        .not("user_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const getUserLink = (userId: string) => {
    const clt = linkedCLT.find((c) => c.user_id === userId);
    if (clt) return { tipo: "CLT" as const, nome: clt.nome_completo, cargo: clt.cargo, id: clt.id };
    const pj = linkedPJ.find((p) => p.user_id === userId);
    if (pj) return { tipo: "PJ" as const, nome: pj.contato_nome, cargo: pj.tipo_servico, id: pj.id };
    return null;
  };

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
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-clt"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-pj"] });
      queryClient.invalidateQueries({ queryKey: ["atribuicoes-todas-v2"] });
      toast.success("Usuário criado! Um e-mail com link de acesso foi enviado.");
      setCreateOpen(false);
      setNewUser({ email: "", full_name: "", roles: ["colaborador"], tipo_acesso: "externo", colaborador_id: "", colaborador_tipo: "" });
      setTemplateId("");
      setDepartamentoId("");
      setDepartamentoLabel("");
      setUnidadeIdNovo("");
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao criar usuário"),
  });

  const toggleBan = useMutation({
    mutationFn: async ({ user_id, ban }: { user_id: string; ban: boolean }) => {
      await callManageUser("toggle_ban", { user_id, ban });
    },
    onSuccess: (_, { ban }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      toast.success(ban ? "Usuário inativado com sucesso!" : "Usuário ativado com sucesso!");
    },
    onError: () => toast.error("Erro ao atualizar status do usuário"),
  });

  const approveUser = useMutation({
    mutationFn: async (user_id: string) => {
      await callManageUser("approve", { user_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      toast.success("Usuário aprovado com sucesso!");
    },
    onError: () => toast.error("Erro ao aprovar usuário"),
  });

  const updateRoles = useMutation({
    mutationFn: async ({ user_id, roles, colaborador_tipo }: { user_id: string; roles: AppRole[]; colaborador_tipo?: string | null }) => {
      await callManageUser("update_roles", { user_id, roles, colaborador_tipo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Perfis atualizados com sucesso!");
      setRolesDialogOpen(false);
    },
    onError: () => toast.error("Erro ao atualizar perfis"),
  });

  const deleteUser = useMutation({
    mutationFn: async (user_id: string) => {
      await callManageUser("delete_user", { user_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-auth-users"] });
      toast.success("Usuário deletado com sucesso!");
      setDeleteConfirm(null);
    },
    onError: (err: Error) => toast.error(err.message || "Erro ao deletar usuário"),
  });

  const linkRecord = useMutation({
    mutationFn: async ({ user_id, colaborador_id, contrato_pj_id }: { user_id: string; colaborador_id?: string; contrato_pj_id?: string }) => {
      await callManageUser("link_record", { user_id, colaborador_id, contrato_pj_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlinked-clt"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-pj"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["linked-clt-users"] });
      queryClient.invalidateQueries({ queryKey: ["linked-pj-users"] });
      toast.success("Vínculo realizado com sucesso!");
      setLinkDialogOpen(false);
      setLinkColaboradorId("");
      setLinkContratoPjId("");
    },
    onError: () => toast.error("Erro ao vincular registro"),
  });

  const unlinkRecord = useMutation({
    mutationFn: async (user_id: string) => {
      await callManageUser("unlink_record", { user_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unlinked-clt"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-pj"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["linked-clt-users"] });
      queryClient.invalidateQueries({ queryKey: ["linked-pj-users"] });
      toast.success("Vínculo removido com sucesso!");
      setLinkDialogOpen(false);
    },
    onError: () => toast.error("Erro ao desvincular registro"),
  });

  const getUserRoles = (userId: string) =>
    allRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const getUserRoleRecord = (userId: string, role: AppRole) =>
    allRoles.find((r) => r.user_id === userId && r.role === role);

  const isGestorManual = (userId: string) => {
    const record = getUserRoleRecord(userId, "gestor_direto" as AppRole);
    return record ? (record as any).atribuido_manualmente === true : false;
  };

  const getAuthUser = (userId: string) =>
    authUsers.find((u: { id: string }) => u.id === userId);

  const openRolesDialog = (userId: string, name: string) => {
    // admin_rh cannot edit super_admin or other admin_rh users
    if (!isSuperAdmin) {
      const targetRoles = getUserRoles(userId);
      if (targetRoles.includes("super_admin") || targetRoles.includes("admin_rh")) {
        toast.error("Sem permissão para editar este usuário");
        return;
      }
    }
    setSelectedUser({ userId, name });
    setSelectedRoles(getUserRoles(userId));
    const profile = profiles.find((p) => p.user_id === userId);
    setSelectedColabTipo((profile as any)?.colaborador_tipo || "");
    setRolesDialogOpen(true);
  };

  const toggleRole = (role: AppRole) => {
    if (!isSuperAdmin && role === "super_admin") {
      toast.error("Apenas Super Admin pode atribuir este role");
      return;
    }
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
          <p className="text-sm text-muted-foreground">Cadastrar, ativar/inativar e gerenciar perfis de acesso</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </Button>
          </DialogTrigger>
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
                  {departamentoInfo && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-muted-foreground">Receberá automaticamente:</span>
                      </div>
                      <div className="mt-1 ml-5">
                        <span className="font-medium text-primary">
                          {departamentoInfo.perfil_nome || "— (só transversal do template)"}
                        </span>
                        {departamentoInfo.area_label && (
                          <span className="text-muted-foreground"> · Área: {departamentoInfo.area_label}</span>
                        )}
                      </div>
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-[3px] border-l-blue-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Total</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              {profiles.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-emerald-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Ativos</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-500" />
              {approvedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-amber-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <UserX className="h-5 w-5 text-amber-500" />
              {pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-red-500">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Inativos</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              {bannedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2"><ShieldCheck className="h-4 w-4" /> Grupos de Acesso</TabsTrigger>
          {(isSuperAdmin || isAdminRH) && (
            <TabsTrigger value="matriz" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Matriz de Permissões
              <Badge variant="outline" className="ml-2 text-[10px] py-0">Em breve</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-lg">Usuários do Sistema</CardTitle>
              {(isSuperAdmin || isAdminRH) && (
                <Button size="sm" onClick={() => setNovoUsuarioOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Novo Usuário
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-xs font-normal text-muted-foreground">Último acesso</TableHead>
                    <TableHead className="text-xs font-normal text-muted-foreground">Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => {
                    const roles = getUserRoles(profile.user_id);
                    const authUser = getAuthUser(profile.user_id);
                    const isBanned = authUser?.banned === true;

                    return (
                      <TableRow key={profile.id} className={isBanned ? "opacity-60" : ""}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setDrawerUsuarioId(profile.user_id)}
                            className="text-left hover:text-primary transition-colors group"
                          >
                            <p className="font-medium group-hover:underline">{profile.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{authUser?.email || ""}</p>
                          </button>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const link = getUserLink(profile.user_id);
                            const hasCLT = linkedCLT.some((c) => c.user_id === profile.user_id);
                            const hasPJ = linkedPJ.some((c) => c.user_id === profile.user_id);
                            if (hasCLT || hasPJ) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex gap-1 cursor-default">
                                        {hasCLT && <Badge variant="outline" className="text-xs border-blue-300 text-blue-700"><LinkIcon className="h-3 w-3 mr-0.5" />CLT</Badge>}
                                        {hasPJ && <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700"><LinkIcon className="h-3 w-3 mr-0.5" />PJ</Badge>}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs font-medium">{link?.nome}</p>
                                      <p className="text-xs text-muted-foreground">{link?.cargo}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                            return (
                              <Badge variant="outline" className="text-xs border-muted-foreground/40 text-muted-foreground">
                                <Unlink className="h-3 w-3 mr-0.5" />Externo
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <GrupoCell userId={profile.user_id} />
                        </TableCell>
                        <TableCell>
                          {isBanned ? (
                            <Badge variant="outline" className="border-red-300 text-red-700">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativo
                            </Badge>
                          ) : profile.approved ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 text-amber-700">
                              <XCircle className="h-3 w-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {authUser?.last_sign_in_at
                            ? new Date(authUser.last_sign_in_at).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })
                            : "Nunca"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(profile.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => openRolesDialog(profile.user_id, profile.full_name || "Usuário")}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Button>
                            <Button
                               size="sm"
                               variant="outline"
                               className={`gap-1 ${
                                 getUserLink(profile.user_id)
                                   ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                   : "text-muted-foreground hover:text-foreground"
                               }`}
                               onClick={() => {
                                 setLinkUser({ userId: profile.user_id, name: profile.full_name || "Usuário" });
                                 setLinkColaboradorId("");
                                 setLinkContratoPjId("");
                                 setLinkDialogOpen(true);
                               }}
                             >
                               <Link2 className="h-3.5 w-3.5" />
                               {getUserLink(profile.user_id) ? "Vinculado" : "Vincular"}
                             </Button>
                            {isBanned ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 hover:text-emerald-700 gap-1"
                                onClick={() => toggleBan.mutate({ user_id: profile.user_id, ban: false })}
                                disabled={toggleBan.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Ativar
                              </Button>
                            ) : !profile.approved ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-600 hover:text-emerald-700 gap-1"
                                onClick={() => approveUser.mutate(profile.user_id)}
                                disabled={approveUser.isPending}
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                Aprovar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 gap-1"
                                onClick={() => {
                                  if (roles.includes("super_admin" as AppRole)) {
                                    setRemoveSuperAdminConfirm({
                                      userId: profile.user_id,
                                      name: profile.full_name || "Usuário",
                                      mode: "ban",
                                    });
                                  } else {
                                    toggleBan.mutate({ user_id: profile.user_id, ban: true });
                                  }
                                }}
                                disabled={toggleBan.isPending}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Inativar
                              </Button>
                            )}
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive gap-1"
                                onClick={() => {
                                  if (roles.includes("super_admin" as AppRole)) {
                                    setRemoveSuperAdminConfirm({
                                      userId: profile.user_id,
                                      name: profile.full_name || "Usuário",
                                      mode: "delete",
                                    });
                                  } else {
                                    setDeleteConfirm({ userId: profile.user_id, name: profile.full_name || "Usuário" });
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Deletar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {profiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          <GruposAcessoTabV2 />
        </TabsContent>

        {(isSuperAdmin || isAdminRH) && (
          <TabsContent value="matriz" className="mt-4">
            <MatrizPermissoes />
          </TabsContent>
        )}

      </Tabs>

      {/* Hub da Pessoa v2 — perfis, níveis e unidades */}
      <HubDaPessoaDialog
        userId={selectedUser?.userId || null}
        userName={selectedUser?.name || ""}
        open={rolesDialogOpen}
        onOpenChange={(open) => {
          setRolesDialogOpen(open);
          if (!open) setSelectedUser(null);
        }}
        onSucesso={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
        }}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o usuário <strong>{deleteConfirm?.name}</strong>? Esta ação é irreversível e removerá todos os dados de acesso do usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && deleteUser.mutate(deleteConfirm.userId)}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação dupla: remover/inativar Super Admin (Regra 18) */}
      <ConfirmacaoDupla
        open={!!removeSuperAdminConfirm}
        onOpenChange={(o) => !o && setRemoveSuperAdminConfirm(null)}
        titulo="🔐 Remover privilégios de Super Admin"
        descricao={
          <>
            <p>
              Você está prestes a {removeSuperAdminConfirm?.mode === "delete" ? "deletar" : "inativar"} o
              Super Admin <strong>{removeSuperAdminConfirm?.name}</strong>. Essa ação afeta o acesso total
              ao sistema e é registrada em auditoria.
            </p>
            <p>Confirme apenas se for realmente necessário.</p>
          </>
        }
        textoConfirmacao="REMOVER SUPER ADMIN"
        placeholder="REMOVER SUPER ADMIN"
        acaoLabel={removeSuperAdminConfirm?.mode === "delete" ? "Deletar Super Admin" : "Inativar Super Admin"}
        onConfirmar={async () => {
          if (!removeSuperAdminConfirm) return;
          if (removeSuperAdminConfirm.mode === "delete") {
            await deleteUser.mutateAsync(removeSuperAdminConfirm.userId);
          } else {
            await toggleBan.mutateAsync({ user_id: removeSuperAdminConfirm.userId, ban: true });
          }
          setRemoveSuperAdminConfirm(null);
        }}
      />

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Vincular Cadastro
            </DialogTitle>
            <DialogDescription>
              Vincular o usuário <strong>{linkUser?.name}</strong> a um registro de colaborador CLT ou contrato PJ existente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current link status */}
            {linkUser && (() => {
              const currentLink = getUserLink(linkUser.userId);
              if (currentLink) {
                return (
                  <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Vínculo atual</p>
                        <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                          <LinkIcon className="h-3.5 w-3.5 text-primary" />
                          {currentLink.nome}
                          <Badge variant="outline" className={`text-[10px] ml-1 ${currentLink.tipo === "CLT" ? "border-blue-300 text-blue-700" : "border-emerald-300 text-emerald-700"}`}>
                            {currentLink.tipo}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">{currentLink.cargo}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive gap-1"
                        onClick={() => unlinkRecord.mutate(linkUser.userId)}
                        disabled={unlinkRecord.isPending}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        {unlinkRecord.isPending ? "Removendo..." : "Desvincular"}
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-center">
                  <Unlink className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm text-muted-foreground">Sem vínculo ativo</p>
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label>Colaborador CLT</Label>
              <Select value={linkColaboradorId} onValueChange={setLinkColaboradorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (não vincular CLT)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {unlinkedCLT.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_completo} — {c.cargo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contrato PJ</Label>
              <Select value={linkContratoPjId} onValueChange={setLinkContratoPjId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (não vincular PJ)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {unlinkedPJ.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contato_nome} — {c.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (linkUser) {
                  linkRecord.mutate({
                    user_id: linkUser.userId,
                    colaborador_id: linkColaboradorId && linkColaboradorId !== "none" ? linkColaboradorId : undefined,
                    contrato_pj_id: linkContratoPjId && linkContratoPjId !== "none" ? linkContratoPjId : undefined,
                  });
                }
              }}
              disabled={linkRecord.isPending || (!linkColaboradorId && !linkContratoPjId) || (linkColaboradorId === "none" && linkContratoPjId === "none")}
            >
              {linkRecord.isPending ? "Vinculando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DrawerUsuario
        userId={drawerUsuarioId}
        open={!!drawerUsuarioId}
        onOpenChange={(open) => !open && setDrawerUsuarioId(null)}
      />

      <NovoUsuarioDialog open={novoUsuarioOpen} onOpenChange={setNovoUsuarioOpen} />
    </div>
  );
}
