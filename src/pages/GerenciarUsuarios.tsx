import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import GruposAcessoTabV2 from "@/components/grupos-acesso/GruposAcessoTabV2";

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
import { PageHeader } from "@/components/layout/PageHeader";


import { useUnidades } from "@/hooks/useUnidades";
import { useTemplates } from "@/hooks/useTemplates";
import { useDepartamentoInfo } from "@/hooks/useEstruturaOrganizacional";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { usePermissoesDoUsuario, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
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
  socio: "Sócio",
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
  socio: "Sócio — visibilidade societária.",
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
  const activeTab = searchParams.get("aba") || searchParams.get("tab") || "usuarios";
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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-[3px] border-l-info/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Total</p>
            <p className="text-2xl font-medium flex items-center gap-2">
              <Users className="h-5 w-5 text-info" />
              {profiles.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-success/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Ativos</p>
            <p className="text-2xl font-medium flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-success" />
              {approvedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-warning/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
            <p className="text-2xl font-medium flex items-center gap-2">
              <UserX className="h-5 w-5 text-warning" />
              {pendingCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-[3px] border-l-destructive/40">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase">Inativos</p>
            <p className="text-2xl font-medium flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              {bannedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" /> Usuários</TabsTrigger>
          <TabsTrigger value="grupos" className="gap-2"><ShieldCheck className="h-4 w-4" /> Grupos de Acesso</TabsTrigger>
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


        <TabsContent value="grupos" className="mt-4">
          <GruposAcessoTabV2 />
        </TabsContent>

        <TabsContent value="papeis" className="mt-4">
          <PapeisTab />
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
