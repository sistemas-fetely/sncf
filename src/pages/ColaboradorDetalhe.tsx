import { useState, useEffect } from "react";
import { getTarefasParaTipo } from "@/lib/onboarding-tarefas";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { format, parseISO, isValid } from "date-fns";

function safeFormatDate(dateStr: string | null | undefined, fmt = "dd/MM/yyyy"): string {
  if (!dateStr) return "";
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt) : dateStr;
  } catch { return dateStr || ""; }
}
import {
  ArrowLeft, Edit, Save, Loader2, X, User, FileText, Briefcase,
  Building2, Users as UsersIcon, Monitor, UserCheck, UserX, ArrowUpDown,
  TrendingUp, ArrowRightLeft, DollarSign, Network,
} from "lucide-react";
import { OrgBranchView } from "@/components/organograma/OrgBranchView";
import { CustoResumoCard } from "@/components/CustoResumoCard";
import { HistoricoCustosChart } from "@/components/HistoricoCustosChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCLevelCargos } from "@/hooks/useCLevelCargos";
import { useParametros } from "@/hooks/useParametros";
import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

import { SmartBackButton } from "@/components/SmartBackButton";
import { StepDadosPessoais } from "@/components/colaborador-clt/StepDadosPessoais";
import { StepDocumentos } from "@/components/colaborador-clt/StepDocumentos";
import { StepDadosProfissionais } from "@/components/colaborador-clt/StepDadosProfissionais";
import { StepDadosBancarios } from "@/components/colaborador-clt/StepDadosBancarios";
import { StepDependentes } from "@/components/colaborador-clt/StepDependentes";
import { StepDadosEmpresa } from "@/components/colaborador-clt/StepDadosEmpresa";
import { DocumentosAnexados } from "@/components/DocumentosAnexados";
import { CriarUsuarioAcessoButton } from "@/components/CriarUsuarioAcessoButton";
import { SalarioMasked } from "@/components/SalarioMasked";
import { ehCLevel } from "@/lib/clevel-protection";
import { Shield } from "lucide-react";

import type {
  DadosPessoaisForm,
  DocumentosForm,
  DadosProfissionaisForm,
  DadosBancariosForm,
  DadosEmpresaForm,
  DependentesForm,
} from "@/lib/validations/colaborador-clt";

type AllFormData = DadosPessoaisForm & DocumentosForm & DadosProfissionaisForm & DadosBancariosForm & DadosEmpresaForm & DependentesForm;

type Departamento = { id: string; departamento: string; percentual_rateio: number };
type Dependente = Tables<"dependentes">;

const statusMap: Record<string, string> = {
  ativo: "Ativo",
  ferias: "Férias",
  afastado: "Afastado",
  experiencia: "Experiência",
  desligado: "Desligado",
};

const statusStyles: Record<string, string> = {
  ativo: "bg-success/10 text-success border-0",
  ferias: "bg-info/10 text-info border-0",
  afastado: "bg-warning/10 text-warning border-0",
  experiencia: "bg-primary/10 text-primary border-0",
  desligado: "bg-destructive/10 text-destructive border-0",
};

export default function ColaboradorDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const rotaVolta = ((location.state as any)?.from as string) || "/colaboradores";
  const { user, profile } = useAuth();
  const { roles: authRoles } = useAuth();
  const isSuperAdminLocal = (authRoles ?? []).includes("super_admin");
  const isAdminRHLocal = (authRoles ?? []).includes("admin_rh");
  const canSeeSalary = (isCLevel = false) => isCLevel ? isSuperAdminLocal : (isSuperAdminLocal || isAdminRHLocal);
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const { isCargoClevel } = useCLevelCargos();
  const { data: sistemasParametros } = useParametros("sistema");
  const { data: tiposEquipParametros } = useParametros("tipo_equipamento");
  const { data: estadosEquipParametros } = useParametros("estado_equipamento");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);
  const [colaborador, setColaborador] = useState<Tables<"colaboradores_clt"> | null>(null);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [acessosSistemas, setAcessosSistemas] = useState<Tables<"colaborador_acessos_sistemas">[]>([]);
  const [equipamentos, setEquipamentos] = useState<Tables<"colaborador_equipamentos">[]>([]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const methods = useForm<AllFormData>({ mode: "onBlur" });

  const isAtivo = colaborador?.status === "ativo" || colaborador?.status === "experiencia";

  const handleToggleStatus = async () => {
    if (!id || !colaborador) return;
    setTogglingStatus(true);
    const newStatus = isAtivo ? "desligado" : "ativo";
    const updateData: any = { status: newStatus };
    if (newStatus === "desligado") {
      updateData.data_desligamento = new Date().toISOString().slice(0, 10);
    } else {
      updateData.data_desligamento = null;
    }
    const { error } = await supabase
      .from("colaboradores_clt")
      .update(updateData)
      .eq("id", id);
    if (error) {
      toast.error(humanizeError(error.message));
    } else {
      setColaborador({ ...colaborador, status: newStatus });
      toast.success(newStatus === "desligado" ? "Colaborador inativado" : "Colaborador reativado");

      // Activation automations
      if (newStatus === "ativo") {
        // Portal access (only if email exists)
        if (colaborador.email_pessoal) {
          try {
            await supabase.functions.invoke("create-portal-access", {
              body: {
                action: "activate",
                email: colaborador.email_pessoal,
                nome: colaborador.nome_completo,
                colaborador_id: id,
                tipo: "clt",
              },
            });
            toast.success("Acesso ao portal criado automaticamente");
          } catch (portalErr) {
            console.error("Erro na automação de acesso:", portalErr);
          }
        }

        // Calculate trial period dates (always)
        try {
          const dataInicio = colaborador.data_admissao ? new Date(colaborador.data_admissao) : new Date();
          const fim1 = new Date(dataInicio);
          fim1.setDate(fim1.getDate() + 45);
          const fim2 = new Date(dataInicio);
          fim2.setDate(fim2.getDate() + 90);
          const fim1Str = fim1.toISOString().slice(0, 10);
          const fim2Str = fim2.toISOString().slice(0, 10);

          await supabase
            .from("colaboradores_clt")
            .update({
              fim_periodo_experiencia_1: fim1Str,
              fim_periodo_experiencia_2: fim2Str,
            } as any)
            .eq("id", id);

          // Create scheduled alerts for trial periods
          const alerta1Date = new Date(fim1);
          alerta1Date.setDate(alerta1Date.getDate() - 15);
          const alerta2Date = new Date(fim2);
          alerta2Date.setDate(alerta2Date.getDate() - 5);

          const alertas: any[] = [
            {
              tipo: "periodo_experiencia_1",
              titulo: `Período de experiência: ${colaborador.nome_completo}`,
              mensagem: `O 1º período de experiência (45 dias) de ${colaborador.nome_completo} encerra em ${fim1Str}. Avalie a continuidade.`,
              link: `/colaboradores/${id}`,
              data_alerta: alerta1Date.toISOString().slice(0, 10),
              colaborador_id: id,
              user_id: null,
            },
            {
              tipo: "periodo_experiencia_2",
              titulo: `⚠️ Fim da experiência: ${colaborador.nome_completo}`,
              mensagem: `O 2º período de experiência (90 dias) de ${colaborador.nome_completo} encerra em ${fim2Str}. Decisão de efetivação necessária.`,
              link: `/colaboradores/${id}`,
              data_alerta: alerta2Date.toISOString().slice(0, 10),
              colaborador_id: id,
              user_id: null,
            },
          ];

          // If there's a gestor_direto, also notify them
          if (colaborador.gestor_direto_id) {
            const { data: gestorProfile } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("id", colaborador.gestor_direto_id)
              .single();

            if (gestorProfile?.user_id) {
              alertas.push(
                {
                  tipo: "periodo_experiencia_1",
                  titulo: `Período de experiência: ${colaborador.nome_completo}`,
                  mensagem: `O 1º período de experiência de ${colaborador.nome_completo} encerra em ${fim1Str}.`,
                  link: `/colaboradores/${id}`,
                  data_alerta: alerta1Date.toISOString().slice(0, 10),
                  colaborador_id: id,
                  user_id: gestorProfile.user_id,
                },
                {
                  tipo: "periodo_experiencia_2",
                  titulo: `⚠️ Fim da experiência: ${colaborador.nome_completo}`,
                  mensagem: `O 2º período de experiência de ${colaborador.nome_completo} encerra em ${fim2Str}. Decisão necessária.`,
                  link: `/colaboradores/${id}`,
                  data_alerta: alerta2Date.toISOString().slice(0, 10),
                  colaborador_id: id,
                  user_id: gestorProfile.user_id,
                }
              );

              // Notify leader about activation
              await supabase.from("notificacoes_rh").insert({
                tipo: "colaborador_ativado",
                titulo: `Novo colaborador ativado no seu time`,
                mensagem: `${colaborador.nome_completo} (${colaborador.cargo}) foi ativado. Data de início: ${colaborador.data_admissao}.`,
                link: `/colaboradores/${id}`,
                user_id: gestorProfile.user_id,
              });
            }
          }

          await (supabase as any).from("alertas_agendados").insert(alertas);
        } catch (alertErr) {
          console.error("Erro ao criar alertas de experiência:", alertErr);
        }

        // Create onboarding checklist (only if not already created by wizard)
        try {
          const { data: existingChecklist } = await supabase
            .from("onboarding_checklists")
            .select("id")
            .eq("colaborador_id", id)
            .maybeSingle();

          if (!existingChecklist) {
            const { data: newChecklist } = await supabase
              .from("onboarding_checklists")
              .insert({
                colaborador_id: id,
                colaborador_tipo: "clt",
                coordenador_user_id: user?.id || null,
                coordenador_nome: profile?.full_name || null,
              } as any)
              .select("id")
              .single();

            if (newChecklist) {
              const dataInicioCl = colaborador.data_admissao ? new Date(colaborador.data_admissao) : new Date();
              let gestorUserId: string | null = null;
              if (colaborador.gestor_direto_id) {
                const { data: gp } = await supabase.from("profiles").select("user_id").eq("id", colaborador.gestor_direto_id).single();
                gestorUserId = gp?.user_id || null;
              }
              const tarefas = (await getTarefasParaTipo("clt", supabase)).map((t) => {
                const prazoDate = new Date(dataInicioCl);
                prazoDate.setDate(prazoDate.getDate() + t.prazo_dias);
                return {
                  tipo_processo: "onboarding",
                  sistema_origem: t.sistema_origem || "people",
                  area_destino: t.area_destino || null,
                  prioridade: t.prioridade || "normal",
                  processo_id: newChecklist.id,
                  colaborador_id: id,
                  colaborador_tipo: "clt",
                  colaborador_nome: (colaborador as any).nome_completo || null,
                  titulo: t.titulo,
                  descricao: t.descricao || null,
                  responsavel_role: t.responsavel_role,
                  responsavel_user_id:
                    t.responsavel_role === "colaborador" ? colaborador.user_id :
                    t.responsavel_role === "gestor_direto" && gestorUserId ? gestorUserId :
                    null,
                  prazo_dias: t.prazo_dias,
                  prazo_data: prazoDate.toISOString().slice(0, 10),
                  bloqueante: t.bloqueante || false,
                  motivo_bloqueio: t.motivo_bloqueio || null,
                  accountable_role: t.accountable_role || null,
                  accountable_user_id: t.accountable_role ? null : user?.id || null,
                };
              });
              await supabase.from("sncf_tarefas").insert(tarefas as any);
            }
          }
        } catch (onbErr) {
          console.error("Erro ao criar onboarding:", onbErr);
        }
      } else if (newStatus === "desligado" && colaborador.user_id) {
        try {
          await supabase.functions.invoke("create-portal-access", {
            body: { action: "revoke", user_id: colaborador.user_id },
          });
          toast.info("Acesso ao portal revogado");
        } catch (portalErr) {
          console.error("Erro na automação de acesso:", portalErr);
        }
      }
    }
    setTogglingStatus(false);
    setStatusDialogOpen(false);
  };

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [{ data: col }, { data: deps }, { data: depts }, { data: acessos }, { data: equips }] = await Promise.all([
        supabase.from("colaboradores_clt").select("*").eq("id", id).maybeSingle(),
        supabase.from("dependentes").select("*").eq("colaborador_id", id),
        supabase.from("colaborador_departamentos").select("*").eq("colaborador_id", id),
        supabase.from("colaborador_acessos_sistemas").select("*").eq("colaborador_id", id),
        supabase.from("colaborador_equipamentos").select("*").eq("colaborador_id", id),
      ]);
      if (!col) {
        toast.error("Colaborador não encontrado");
        navigate(rotaVolta);
        return;
      }
      setColaborador(col);
      setDepartamentos(depts || []);
      setDependentes(deps || []);
      setAcessosSistemas(acessos || []);
      setEquipamentos(equips || []);
      // Set form defaults
      methods.reset({
        ...col,
        cnh_validade: col.cnh_validade || "",
        dependentes: (deps || []).map((d) => ({
          nome_completo: d.nome_completo,
          cpf: d.cpf || "",
          data_nascimento: d.data_nascimento,
          parentesco: d.parentesco,
          incluir_irrf: d.incluir_irrf || false,
          incluir_plano_saude: d.incluir_plano_saude || false,
        })),
        departamento: col.departamento,
        acessos_sistemas: (acessos || []).map((a) => ({
          sistema: a.sistema,
          tem_acesso: a.tem_acesso,
          usuario: a.usuario || "",
          observacoes: a.observacoes || "",
        })),
        equipamentos: (equips || []).map((e) => ({
          tipo: e.tipo,
          marca: e.marca || "",
          modelo: e.modelo || "",
          numero_patrimonio: e.numero_patrimonio || "",
          numero_serie: e.numero_serie || "",
          data_entrega: e.data_entrega || "",
          estado: e.estado || "novo",
          observacoes: e.observacoes || "",
        })),
      } as any);
      setLoading(false);
    }
    load();
  }, [id]);

  const onSave = async (data: AllFormData) => {
    if (!id) return;
    setSaving(true);
    try {
      const { dependentes: formDeps, acessos_sistemas: formAcessos, equipamentos: formEquip, salario_base, jornada_semanal, ...rest } = data;
      const cleaned = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v])
      );

      const { error } = await supabase
        .from("colaboradores_clt")
        .update({
          ...cleaned,
          salario_base: Number(salario_base),
          jornada_semanal: Number(jornada_semanal) || 44,
        } as any)
        .eq("id", id);
      if (error) throw error;

      // Replace dependentes
      await supabase.from("dependentes").delete().eq("colaborador_id", id);
      if (formDeps && formDeps.length > 0) {
        const { error: depErr } = await supabase.from("dependentes").insert(
          formDeps.map((d) => ({
            colaborador_id: id,
            nome_completo: d.nome_completo,
            cpf: d.cpf || null,
            data_nascimento: d.data_nascimento,
            parentesco: d.parentesco,
            incluir_irrf: d.incluir_irrf,
            incluir_plano_saude: d.incluir_plano_saude,
          }))
        );
        if (depErr) throw depErr;
      }

      // Replace acessos_sistemas
      await supabase.from("colaborador_acessos_sistemas").delete().eq("colaborador_id", id);
      if (formAcessos && formAcessos.length > 0) {
        const acessosToInsert = formAcessos
          .filter((a: any) => a.tem_acesso && a.sistema)
          .map((a: any) => ({
            colaborador_id: id,
            sistema: a.sistema,
            tem_acesso: true,
            usuario: a.usuario || null,
            observacoes: a.observacoes || null,
            data_concessao: new Date().toISOString().split("T")[0],
          }));
        if (acessosToInsert.length > 0) {
          const { error: aErr } = await supabase.from("colaborador_acessos_sistemas").insert(acessosToInsert);
          if (aErr) throw aErr;
        }
      }

      // Replace equipamentos
      await supabase.from("colaborador_equipamentos").delete().eq("colaborador_id", id);
      if (formEquip && formEquip.length > 0) {
        const equipToInsert = formEquip
          .filter((e: any) => e.tipo)
          .map((e: any) => ({
            colaborador_id: id,
            tipo: e.tipo,
            marca: e.marca || null,
            modelo: e.modelo || null,
            numero_patrimonio: e.numero_patrimonio || null,
            numero_serie: e.numero_serie || null,
            data_entrega: e.data_entrega || null,
            estado: e.estado || "novo",
            observacoes: e.observacoes || null,
          }));
        if (equipToInsert.length > 0) {
          const { error: eErr } = await supabase.from("colaborador_equipamentos").insert(equipToInsert);
          if (eErr) throw eErr;
        }
      }

      toast.success("Colaborador atualizado com sucesso!");
      setEditing(false);
      // Reload data
      const { data: updated } = await supabase.from("colaboradores_clt").select("*").eq("id", id).maybeSingle();
      if (updated) setColaborador(updated);
      const { data: newDepts } = await supabase.from("colaborador_departamentos").select("*").eq("colaborador_id", id);
      setDepartamentos(newDepts || []);
      const { data: newDeps } = await supabase.from("dependentes").select("*").eq("colaborador_id", id);
      setDependentes(newDeps || []);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao atualizar colaborador");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!colaborador) return null;

  const initials = colaborador.nome_completo
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // VIEW MODE
  if (!editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SmartBackButton fallback={rotaVolta} fallbackLabel="Voltar" />
          <div className="flex items-center gap-2">
            <CriarUsuarioAcessoButton
              colaboradorId={colaborador.id}
              colaboradorTipo="clt"
              email={colaborador.email_pessoal || colaborador.email_corporativo || ""}
              nome={colaborador.nome_completo}
              status={colaborador.status}
              userId={colaborador.user_id || null}
              onChange={() => window.location.reload()}
            />
            <Button
              variant={isAtivo ? "outline" : "default"}
              onClick={() => setStatusDialogOpen(true)}
              className={`gap-2 ${isAtivo ? "text-destructive border-destructive hover:bg-destructive/10" : ""}`}
            >
              {isAtivo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
              {isAtivo ? "Inativar" : "Reativar"}
            </Button>
            <Button onClick={() => setEditing(true)} className="gap-2">
              <Edit className="h-4 w-4" /> Editar
            </Button>
          </div>
        </div>

        {/* Header card */}
        <Card className="card-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {colaborador.foto_url ? (
                <img src={colaborador.foto_url} alt={colaborador.nome_completo} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-medium text-primary">
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-medium">{colaborador.nome_completo}</h1>
                <p className="text-muted-foreground">{colaborador.cargo}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="outline" className={statusStyles[colaborador.status] || ""}>
                    {statusMap[colaborador.status] || colaborador.status}
                  </Badge>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-0 capitalize">
                    {colaborador.tipo_contrato}
                  </Badge>
                  {departamentos.map((d, i) => (
                    <Badge key={i} variant="outline" className="bg-muted text-xs">
                      {d.departamento} ({d.percentual_rateio}%)
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {ehCLevel({ cargo: colaborador.cargo, nivel: (colaborador as any).nivel ?? null }) && !isSuperAdmin && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
            <Shield className="h-4 w-4 mt-0.5 text-warning" />
            <p className="text-muted-foreground">
              Algumas informações são restritas por política de C-Level.
            </p>
          </div>
        )}

        <Tabs defaultValue="pessoais">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="pessoais" className="gap-1"><User className="h-3.5 w-3.5" /> Dados Pessoais</TabsTrigger>
            <TabsTrigger value="documentos" className="gap-1"><FileText className="h-3.5 w-3.5" /> Documentos</TabsTrigger>
            <TabsTrigger value="profissionais" className="gap-1"><Briefcase className="h-3.5 w-3.5" /> Profissionais</TabsTrigger>
            <TabsTrigger value="bancarios" className="gap-1"><Building2 className="h-3.5 w-3.5" /> Bancários</TabsTrigger>
            <TabsTrigger value="empresa" className="gap-1"><Monitor className="h-3.5 w-3.5" /> Empresa</TabsTrigger>
            <TabsTrigger value="dependentes" className="gap-1"><UsersIcon className="h-3.5 w-3.5" /> Dependentes</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1"><ArrowUpDown className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="custos" className="gap-1"><DollarSign className="h-3.5 w-3.5" /> Custos</TabsTrigger>
            <TabsTrigger value="organograma" className="gap-1"><Network className="h-3.5 w-3.5" /> Organograma</TabsTrigger>
          </TabsList>

          <TabsContent value="pessoais">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="CPF" value={colaborador.cpf} />
                <InfoField label="RG" value={colaborador.rg} />
                <InfoField label="Órgão Emissor" value={colaborador.orgao_emissor} />
                <InfoField label="Data de Nascimento" value={colaborador.data_nascimento ? safeFormatDate(colaborador.data_nascimento) : ""} />
                <InfoField label="Gênero" value={colaborador.genero} />
                <InfoField label="Estado Civil" value={colaborador.estado_civil} />
                <InfoField label="Nacionalidade" value={colaborador.nacionalidade} />
                <InfoField label="Etnia" value={colaborador.etnia} />
                <InfoField label="Nome da Mãe" value={colaborador.nome_mae} />
                <InfoField label="Nome do Pai" value={colaborador.nome_pai} />
                <InfoField label="Telefone" value={colaborador.telefone} />
                <InfoField label="Email Pessoal" value={colaborador.email_pessoal} />
                <InfoField label="CEP" value={colaborador.cep} />
                <InfoField label="Logradouro" value={colaborador.logradouro} />
                <InfoField label="Número" value={colaborador.numero} />
                <InfoField label="Complemento" value={colaborador.complemento} />
                <InfoField label="Bairro" value={colaborador.bairro} />
                <InfoField label="Cidade" value={colaborador.cidade} />
                <InfoField label="UF" value={colaborador.uf} />
                <InfoField label="Contato Emergência" value={colaborador.contato_emergencia_nome} />
                <InfoField label="Tel. Emergência" value={colaborador.contato_emergencia_telefone} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="documentos">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="PIS/PASEP" value={colaborador.pis_pasep} />
                <InfoField label="CTPS Número" value={colaborador.ctps_numero} />
                <InfoField label="CTPS Série" value={colaborador.ctps_serie} />
                <InfoField label="CTPS UF" value={colaborador.ctps_uf} />
                <InfoField label="Título de Eleitor" value={colaborador.titulo_eleitor} />
                <InfoField label="Zona Eleitoral" value={colaborador.zona_eleitoral} />
                <InfoField label="Seção Eleitoral" value={colaborador.secao_eleitoral} />
                <InfoField label="CNH Número" value={colaborador.cnh_numero} />
                <InfoField label="CNH Categoria" value={colaborador.cnh_categoria} />
                <InfoField label="CNH Validade" value={colaborador.cnh_validade ? safeFormatDate(colaborador.cnh_validade) : ""} />
                <InfoField label="Certificado Reservista" value={colaborador.certificado_reservista} />
              </div>
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase">Documentos Anexados</h3>
                <DocumentosAnexados
                  colaboradorId={id}
                  currentFotoUrl={colaborador.foto_url}
                  onFotoUpdated={(url) => setColaborador(prev => prev ? { ...prev, foto_url: url } : prev)}
                />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="profissionais">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Matrícula" value={colaborador.matricula} />
                <InfoField label="Cargo" value={colaborador.cargo} />
                <InfoField label="Data de Admissão" value={safeFormatDate(colaborador.data_admissao)} />
                <InfoField label="Data de Desligamento" value={(colaborador as any).data_desligamento ? safeFormatDate((colaborador as any).data_desligamento) : "—"} />
                <InfoField label="Tipo de Contrato" value={colaborador.tipo_contrato} />
                {canSeeSalary(isCargoClevel(colaborador.cargo)) && (
                  <InfoField
                    label="Salário Base"
                    value={
                      <SalarioMasked
                        valor={Number(colaborador.salario_base)}
                        userId={colaborador.user_id}
                        contexto="admissao"
                      />
                    }
                  />
                )}
                <InfoField label="Jornada Semanal" value={colaborador.jornada_semanal ? `${colaborador.jornada_semanal}h` : ""} />
                <InfoField label="Horário de Trabalho" value={colaborador.horario_trabalho} />
                <InfoField label="Local de Trabalho" value={colaborador.local_trabalho} />
              </div>
              <InfoField label="Departamento" value={colaborador.departamento} />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="bancarios">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Banco" value={colaborador.banco_nome} />
                <InfoField label="Código Banco" value={colaborador.banco_codigo} />
                <InfoField label="Agência" value={colaborador.agencia} />
                <InfoField label="Conta" value={colaborador.conta} />
                <InfoField label="Tipo de Conta" value={colaborador.tipo_conta} />
                <InfoField label="Chave PIX" value={colaborador.chave_pix} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="empresa">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <InfoField label="Email Corporativo" value={colaborador.email_corporativo} />
                <InfoField label="Ramal" value={colaborador.ramal} />
                <InfoField label="Data de Integração" value={colaborador.data_integracao ? safeFormatDate(colaborador.data_integracao) : ""} />
              </div>

              <h3 className="font-medium mb-3">🔐 Acesso aos Sistemas</h3>
              {acessosSistemas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum acesso cadastrado.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {acessosSistemas.map((a) => (
                    <div key={a.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{(sistemasParametros || []).find((s) => s.valor === a.sistema)?.label || a.sistema}</p>
                        {a.usuario && <p className="text-xs text-muted-foreground">Usuário: {a.usuario}</p>}
                        {a.observacoes && <p className="text-xs text-muted-foreground">{a.observacoes}</p>}
                      </div>
                      <Badge variant={a.tem_acesso ? "default" : "secondary"} className="text-xs">
                        {a.tem_acesso ? "Ativo" : "Sem acesso"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="font-medium mb-3">💻 Equipamentos</h3>
              {equipamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum equipamento cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {equipamentos.map((e) => (
                    <div key={e.id} className="border rounded-lg p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <InfoField label="Tipo" value={(tiposEquipParametros || []).find((t) => t.valor === e.tipo)?.label || e.tipo} />
                        <InfoField label="Marca / Modelo" value={[e.marca, e.modelo].filter(Boolean).join(" ") || null} />
                        <InfoField label="Nº Patrimônio" value={e.numero_patrimonio} />
                        <InfoField label="Nº Série" value={e.numero_serie} />
                        <InfoField label="Estado" value={(estadosEquipParametros || []).find((s) => s.valor === e.estado)?.label || e.estado} />
                        <InfoField label="Data Entrega" value={e.data_entrega ? safeFormatDate(e.data_entrega) : ""} />
                      </div>
                      {e.observacoes && <p className="text-xs text-muted-foreground mt-2">{e.observacoes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="dependentes">
            <Card><CardContent className="pt-6">
              {dependentes.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Nenhum dependente cadastrado.</p>
              ) : (
                <div className="space-y-4">
                  {dependentes.map((d) => (
                    <div key={d.id} className="border rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <InfoField label="Nome" value={d.nome_completo} />
                        <InfoField label="CPF" value={d.cpf} />
                        <InfoField label="Nascimento" value={safeFormatDate(d.data_nascimento)} />
                        <InfoField label="Parentesco" value={d.parentesco} />
                        <InfoField label="IRRF" value={d.incluir_irrf ? "Sim" : "Não"} />
                        <InfoField label="Plano de Saúde" value={d.incluir_plano_saude ? "Sim" : "Não"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="movimentacoes">
            <HistoricoMovimentacoes colaboradorId={id!} />
          </TabsContent>

          <TabsContent value="custos">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustoResumoCard
                tipo="clt"
                salarioBase={Number(colaborador.salario_base)}
                dependentesIRRF={dependentes.filter(d => d.incluir_irrf).length}
              />
              <HistoricoCustosChart tipo="clt" entityId={id!} />
            </div>
          </TabsContent>

          <TabsContent value="organograma">
            <OrgBranchView colaboradorId={id} />
          </TabsContent>
        </Tabs>

        <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isAtivo ? "Inativar colaborador?" : "Reativar colaborador?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isAtivo
                  ? `O colaborador "${colaborador.nome_completo}" será marcado como desligado. Você poderá reativá-lo depois.`
                  : `O colaborador "${colaborador.nome_completo}" será reativado com status "Ativo".`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className={isAtivo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              >
                {togglingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : isAtivo ? "Inativar" : "Reativar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // EDIT MODE — reuse wizard step components
  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setEditing(false)} className="gap-2">
            <X className="h-4 w-4" /> Cancelar Edição
          </Button>
          <Button
            onClick={() => methods.handleSubmit(onSave)()}
            disabled={saving}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>

        <h1 className="text-2xl font-medium tracking-tight">Editar: {colaborador.nome_completo}</h1>

        <Tabs defaultValue="pessoais">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
            <TabsTrigger value="bancarios">Bancários</TabsTrigger>
            <TabsTrigger value="empresa">Empresa</TabsTrigger>
            <TabsTrigger value="dependentes">Dependentes</TabsTrigger>
          </TabsList>

          <TabsContent value="pessoais">
            <Card><CardContent className="pt-6"><StepDadosPessoais /></CardContent></Card>
          </TabsContent>
          <TabsContent value="documentos">
            <Card><CardContent className="pt-6"><StepDocumentos /></CardContent></Card>
          </TabsContent>
          <TabsContent value="profissionais">
            <Card><CardContent className="pt-6"><StepDadosProfissionais /></CardContent></Card>
          </TabsContent>
          <TabsContent value="bancarios">
            <Card><CardContent className="pt-6"><StepDadosBancarios /></CardContent></Card>
          </TabsContent>
          <TabsContent value="empresa">
            <Card><CardContent className="pt-6"><StepDadosEmpresa /></CardContent></Card>
          </TabsContent>
          <TabsContent value="dependentes">
            <Card><CardContent className="pt-6"><StepDependentes /></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </FormProvider>
  );
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{isEmpty ? "—" : value}</p>
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  promocao: "Promoção",
  transferencia: "Transferência",
  alteracao_salarial: "Alteração Salarial",
  alteracao_cargo: "Alteração de Cargo",
  mudanca_departamento: "Mudança de Departamento",
};

const STATUS_STYLES: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0",
  aprovada: "bg-info/10 text-info border-0",
  efetivada: "bg-success text-success border-0",
  cancelada: "bg-destructive/10 text-destructive border-0",
};

function HistoricoMovimentacoes({ colaboradorId }: { colaboradorId: string }) {
  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["movimentacoes_colaborador", colaboradorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("*")
        .eq("colaborador_id", colaboradorId)
        .order("data_efetivacao", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const fmt = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  if (isLoading) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Carregando...</CardContent></Card>
    );
  }

  if (movs.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma movimentação registrada.</CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {movs.map((m) => (
          <div key={m.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{TIPO_LABEL[m.tipo] || m.tipo}</Badge>
                <Badge variant="outline" className={STATUS_STYLES[m.status] || ""}>{m.status}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.data_efetivacao + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {(m.cargo_anterior || m.cargo_novo) && (
                <div>
                  <p className="text-xs text-muted-foreground">Cargo</p>
                  <p>{m.cargo_anterior || "—"} → <span className="font-medium">{m.cargo_novo || "—"}</span></p>
                </div>
              )}
              {(m.departamento_anterior || m.departamento_novo) && (
                <div>
                  <p className="text-xs text-muted-foreground">Departamento</p>
                  <p>{m.departamento_anterior || "—"} → <span className="font-medium">{m.departamento_novo || "—"}</span></p>
                </div>
              )}
              {(m.salario_anterior != null || m.salario_novo != null) && (
                <div>
                  <p className="text-xs text-muted-foreground">Salário</p>
                  <p>{fmt(m.salario_anterior)} → <span className="font-medium">{fmt(m.salario_novo)}</span></p>
                </div>
              )}
            </div>
            {m.motivo && <p className="text-xs text-muted-foreground"><strong>Motivo:</strong> {m.motivo}</p>}
            {m.observacoes && <p className="text-xs text-muted-foreground"><strong>Obs:</strong> {m.observacoes}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
