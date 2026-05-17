import { useState, useEffect } from "react";
import { getTarefasParaTipo } from "@/lib/onboarding-tarefas";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft, Edit, Save, Loader2, X, User, FileText, Briefcase,
  Building2, Users as UsersIcon, Monitor, UserCheck, UserX, ArrowUpDown,
  CreditCard, Plus, MoreHorizontal, Trash2, DollarSign, Network,
} from "lucide-react";
import { OrgBranchView } from "@/components/organograma/OrgBranchView";
import { CustoResumoCard } from "@/components/CustoResumoCard";
import { HistoricoCustosChart } from "@/components/HistoricoCustosChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { useCLevelCargos } from "@/hooks/useCLevelCargos";
import type { Tables } from "@/integrations/supabase/types";

import { SmartBackButton } from "@/components/SmartBackButton";
import { StepDadosPessoaisPJ } from "@/components/contrato-pj/StepDadosPessoaisPJ";
import { StepDocumentosPJ } from "@/components/contrato-pj/StepDocumentosPJ";
import { StepDadosProfissionaisPJ } from "@/components/contrato-pj/StepDadosProfissionaisPJ";
import { StepDadosBancarios } from "@/components/colaborador-clt/StepDadosBancarios";
import { StepDadosEmpresa } from "@/components/colaborador-clt/StepDadosEmpresa";
import { StepDependentes } from "@/components/colaborador-clt/StepDependentes";
import { DocumentosAnexados } from "@/components/DocumentosAnexados";
import { CriarUsuarioAcessoButton } from "@/components/CriarUsuarioAcessoButton";
import { SalarioMasked } from "@/components/SalarioMasked";
import { ehCLevel } from "@/lib/clevel-protection";
import { Shield } from "lucide-react";

import type { AllPJFormData } from "@/lib/validations/contrato-pj";

const formatCompetencia = (c: string) => {
  if (/^\d{4}-\d{2}$/.test(c)) return format(parseISO(`${c}-01`), "MM/yyyy");
  if (/^\d{6}$/.test(c)) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return c;
};

const statusMap: Record<string, string> = {
  rascunho: "Rascunho", ativo: "Ativo", suspenso: "Suspenso",
  encerrado: "Encerrado", renovado: "Renovado",
};
const statusStyles: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground border-0",
  ativo: "bg-success/10 text-success border-0",
  suspenso: "bg-warning/10 text-warning border-0",
  encerrado: "bg-destructive/10 text-destructive border-0",
  renovado: "bg-info/10 text-info border-0",
};

const statusNFMap: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", enviada_pagamento: "Enviada p/ Pgto", paga: "Paga", cancelada: "Cancelada", vencida: "Vencida" };
const statusNFStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0", aprovada: "bg-info/10 text-info border-0",
  enviada_pagamento: "bg-info/10 text-info border-0", paga: "bg-success/10 text-success border-0",
  cancelada: "bg-destructive/10 text-destructive border-0", vencida: "bg-destructive/10 text-destructive border-0",
};
const statusPagMap: Record<string, string> = { pendente: "Pendente", pago: "Pago", cancelado: "Cancelado" };
const statusPagStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0", pago: "bg-success/10 text-success border-0",
  cancelado: "bg-destructive/10 text-destructive border-0",
};

function InfoField({ label, value }: { label: string; value: string | null | undefined | React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

export default function ContratoPJDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const rotaVolta = ((location.state as any)?.from as string) || "/contratos-pj";
  const { user, profile } = useAuth();
  const { hasPermission, canSeeSalary, isSuperAdmin } = usePermissions();
  const { isCargoClevel } = useCLevelCargos();
  const canEditContract = hasPermission("contratos_pj", "edit");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(searchParams.get("edit") === "true" && canEditContract);
  const [saving, setSaving] = useState(false);
  const [contrato, setContrato] = useState<Tables<"contratos_pj"> | null>(null);
  const [acessosSistemas, setAcessosSistemas] = useState<Tables<"contrato_pj_acessos_sistemas">[]>([]);
  const [equipamentos, setEquipamentos] = useState<Tables<"contrato_pj_equipamentos">[]>([]);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [gestorNome, setGestorNome] = useState<string | null>(null);

  const methods = useForm<AllPJFormData>({ mode: "onBlur" });

  const isAtivo = contrato?.status === "ativo" || contrato?.status === "rascunho";

  const handleToggleStatus = async () => {
    if (!id || !contrato) return;
    setTogglingStatus(true);
    const newStatus = isAtivo ? "encerrado" : "ativo";
    const updateData: any = { status: newStatus };
    if (newStatus === "encerrado") {
      updateData.data_fim = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("contratos_pj").update(updateData).eq("id", id);
    if (error) {
      toast.error(humanizeError(error.message));
    } else {
      setContrato({ ...contrato, status: newStatus });
      toast.success(newStatus === "encerrado" ? "Contrato encerrado" : "Contrato reativado");

      // Portal access automation
      try {
        if (newStatus === "ativo" && contrato.contato_email) {
          await supabase.functions.invoke("create-portal-access", {
            body: {
              action: "activate",
              email: contrato.contato_email,
              nome: contrato.contato_nome,
              contrato_pj_id: id,
              tipo: "pj",
            },
          });
          toast.success("Acesso ao portal criado automaticamente");

          // Notify leader about activation
          if (contrato.gestor_direto_id) {
            const { data: gestorProfile } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("id", contrato.gestor_direto_id)
              .single();

            if (gestorProfile?.user_id) {
              await supabase.from("notificacoes_rh").insert({
                tipo: "colaborador_ativado",
                titulo: `Novo prestador PJ ativado no seu time`,
                mensagem: `${contrato.contato_nome} (${contrato.tipo_servico}) foi ativado. Data de início: ${contrato.data_inicio}.`,
                link: `/contratos-pj/${id}`,
                user_id: gestorProfile.user_id,
              });
            }
          }
          // Create onboarding checklist for PJ (only if not already created by wizard)
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
                  colaborador_tipo: "pj",
                  coordenador_user_id: user?.id || null,
                  coordenador_nome: profile?.full_name || null,
                } as any)
                .select("id")
                .single();

              if (newChecklist) {
                const dataInicioPj = contrato.data_inicio ? new Date(contrato.data_inicio) : new Date();
                let gestorUserId: string | null = null;
                if (contrato.gestor_direto_id) {
                  const { data: gp } = await supabase.from("profiles").select("user_id").eq("id", contrato.gestor_direto_id).single();
                  gestorUserId = gp?.user_id || null;
                }
                const tarefas = (await getTarefasParaTipo("pj", supabase)).map((t) => {
                  const prazoDate = new Date(dataInicioPj);
                  prazoDate.setDate(prazoDate.getDate() + t.prazo_dias);
                  return {
                    tipo_processo: "onboarding",
                    sistema_origem: t.sistema_origem || "people",
                    area_destino: t.area_destino || null,
                    prioridade: t.prioridade || "normal",
                    processo_id: newChecklist.id,
                    colaborador_id: id,
                    colaborador_tipo: "pj",
                    colaborador_nome: (contrato as any).contato_nome || null,
                    titulo: t.titulo,
                    descricao: t.descricao || null,
                    responsavel_role: t.responsavel_role,
                    responsavel_user_id:
                      t.responsavel_role === "colaborador" ? contrato.user_id :
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
            console.error("Erro ao criar onboarding PJ:", onbErr);
          }

        } else if (newStatus === "encerrado" && contrato.user_id) {
          await supabase.functions.invoke("create-portal-access", {
            body: { action: "revoke", user_id: contrato.user_id },
          });
          toast.info("Acesso ao portal revogado");
        }
      } catch (portalErr) {
        console.error("Erro na automação de acesso:", portalErr);
      }
    }
    setTogglingStatus(false);
    setStatusDialogOpen(false);
  };

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [{ data: ct }, { data: acessos }, { data: equips }] = await Promise.all([
        supabase.from("contratos_pj").select("*").eq("id", id).maybeSingle(),
        supabase.from("contrato_pj_acessos_sistemas").select("*").eq("contrato_pj_id", id),
        supabase.from("contrato_pj_equipamentos").select("*").eq("contrato_pj_id", id),
      ]);
      if (!ct) {
        toast.error("Contrato não encontrado");
        navigate(rotaVolta);
        return;
      }
      setContrato(ct);
      setAcessosSistemas(acessos || []);
      setEquipamentos(equips || []);
      // Fetch gestor name
      if (ct.gestor_direto_id) {
        const { data: gp } = await supabase.from("profiles").select("full_name").eq("id", ct.gestor_direto_id).single();
        setGestorNome(gp?.full_name || null);
      }
      methods.reset({
        contato_nome: ct.contato_nome,
        contato_telefone: ct.contato_telefone || "",
        contato_email: ct.contato_email || "",
        cnpj: ct.cnpj,
        razao_social: ct.razao_social,
        nome_fantasia: ct.nome_fantasia || "",
        inscricao_municipal: ct.inscricao_municipal || "",
        inscricao_estadual: ct.inscricao_estadual || "",
        contrato_assinado: (ct as any).contrato_assinado || false,
        objeto: ct.objeto || "",
        observacoes: ct.observacoes || "",
        // Personal data fields
        cpf: ct.cpf || "",
        rg: ct.rg || "",
        orgao_emissor: ct.orgao_emissor || "",
        data_nascimento: ct.data_nascimento || "",
        genero: ct.genero || "",
        estado_civil: ct.estado_civil || "",
        nacionalidade: ct.nacionalidade || "Brasileira",
        etnia: ct.etnia || "",
        nome_mae: ct.nome_mae || "",
        nome_pai: ct.nome_pai || "",
        foto_url: ct.foto_url || "",
        // Address fields
        cep: ct.cep || "",
        logradouro: ct.logradouro || "",
        numero: ct.numero || "",
        complemento: ct.complemento || "",
        bairro: ct.bairro || "",
        cidade: ct.cidade || "",
        uf: ct.uf || "",
        // Contact fields
        telefone: ct.telefone || "",
        email_pessoal: ct.email_pessoal || "",
        contato_emergencia_nome: ct.contato_emergencia_nome || "",
        contato_emergencia_telefone: ct.contato_emergencia_telefone || "",
        // Document fields (unused for PJ but required by form type)
        titulo_eleitor: "",
        zona_eleitoral: "",
        secao_eleitoral: "",
        cnh_numero: "",
        cnh_categoria: "",
        cnh_validade: "",
        certificado_reservista: "",
        // Professional fields
        tipo_servico: ct.tipo_servico,
        departamento: ct.departamento,
        data_inicio: ct.data_inicio,
        data_fim: ct.data_fim || "",
        valor_mensal: ct.valor_mensal,
        valor_base: (ct as any).valor_base?.toString() || "",
        valor_transporte: (ct as any).valor_transporte?.toString() || "0",
        valor_beneficios_extras: (ct as any).valor_beneficios_extras?.toString() || "0",
        forma_pagamento: ct.forma_pagamento,
        dia_vencimento: ct.dia_vencimento || 10,
        renovacao_automatica: ct.renovacao_automatica,
        status: ct.status,
        gestor_direto_id: ct.gestor_direto_id || "",
        // Banking fields
        banco_nome: ct.banco_nome || "",
        banco_codigo: ct.banco_codigo || "",
        agencia: ct.agencia || "",
        conta: ct.conta || "",
        tipo_conta: ct.tipo_conta || "corrente",
        chave_pix: ct.chave_pix || "",
        email_corporativo: (ct as any).email_corporativo || "",
        telefone_corporativo: (ct as any).telefone_corporativo || "",
        ramal: "",
        data_integracao: "",
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
        dependentes: [],
      } as any);
      setLoading(false);
    }
    load();
  }, [id]);

  const onSave = async (data: AllPJFormData) => {
    if (!id) return;
    setSaving(true);
    try {
      const {
        dependentes, acessos_sistemas: formAcessos, equipamentos: formEquip,
        email_corporativo, telefone_corporativo, ramal, data_integracao,
        titulo_eleitor, zona_eleitoral, secao_eleitoral,
        cnh_numero, cnh_categoria, cnh_validade, certificado_reservista,
        valor_mensal, gestor_direto_id,
        ...rest
      } = data as any;

      const { error } = await supabase
        .from("contratos_pj")
        .update({
          contato_nome: rest.contato_nome,
          contato_telefone: rest.contato_telefone || null,
          contato_email: rest.contato_email || null,
          cnpj: rest.cnpj,
          razao_social: rest.razao_social,
          nome_fantasia: rest.nome_fantasia || null,
          inscricao_municipal: rest.inscricao_municipal || null,
          inscricao_estadual: rest.inscricao_estadual || null,
          contrato_assinado: rest.contrato_assinado,
          objeto: rest.objeto || null,
          observacoes: rest.observacoes || null,
          tipo_servico: rest.tipo_servico,
          departamento: rest.departamento,
          data_inicio: rest.data_inicio,
          data_fim: rest.data_fim || null,
          valor_base: Number(rest.valor_base) || 0,
          valor_transporte: Number(rest.valor_transporte) || 0,
          valor_beneficios_extras: Number(rest.valor_beneficios_extras) || 0,
          valor_mensal: (Number(rest.valor_base) || 0) + (Number(rest.valor_transporte) || 0) + (Number(rest.valor_beneficios_extras) || 0),
          forma_pagamento: rest.forma_pagamento,
          dia_vencimento: Number(rest.dia_vencimento) || 10,
          renovacao_automatica: rest.renovacao_automatica,
          status: rest.status,
          gestor_direto_id: gestor_direto_id || null,
          banco_nome: rest.banco_nome || null,
          banco_codigo: rest.banco_codigo || null,
          agencia: rest.agencia || null,
          conta: rest.conta || null,
          tipo_conta: rest.tipo_conta || null,
          chave_pix: rest.chave_pix || null,
          // Personal data fields
          cpf: rest.cpf || null,
          rg: rest.rg || null,
          orgao_emissor: rest.orgao_emissor || null,
          data_nascimento: rest.data_nascimento || null,
          genero: rest.genero || null,
          estado_civil: rest.estado_civil || null,
          nacionalidade: rest.nacionalidade || null,
          etnia: rest.etnia || null,
          nome_mae: rest.nome_mae || null,
          nome_pai: rest.nome_pai || null,
          foto_url: rest.foto_url || null,
          // Address fields
          cep: rest.cep || null,
          logradouro: rest.logradouro || null,
          numero: rest.numero || null,
          complemento: rest.complemento || null,
          bairro: rest.bairro || null,
          cidade: rest.cidade || null,
          uf: rest.uf || null,
          // Contact fields
          telefone: rest.telefone || null,
          email_pessoal: rest.email_pessoal || null,
          email_corporativo: email_corporativo || null,
          telefone_corporativo: telefone_corporativo || null,
          contato_emergencia_nome: rest.contato_emergencia_nome || null,
          contato_emergencia_telefone: rest.contato_emergencia_telefone || null,
        } as any)
        .eq("id", id);
      if (error) throw error;

      // Replace acessos_sistemas
      await supabase.from("contrato_pj_acessos_sistemas").delete().eq("contrato_pj_id", id);
      if (formAcessos && formAcessos.length > 0) {
        const acessosToInsert = formAcessos
          .filter((a: any) => a.tem_acesso && a.sistema)
          .map((a: any) => ({
            contrato_pj_id: id,
            sistema: a.sistema,
            tem_acesso: true,
            usuario: a.usuario || null,
            observacoes: a.observacoes || null,
            data_concessao: new Date().toISOString().split("T")[0],
          }));
        if (acessosToInsert.length > 0) {
          const { error: aErr } = await supabase.from("contrato_pj_acessos_sistemas").insert(acessosToInsert);
          if (aErr) throw aErr;
        }
      }

      // Replace equipamentos
      await supabase.from("contrato_pj_equipamentos").delete().eq("contrato_pj_id", id);
      if (formEquip && formEquip.length > 0) {
        const equipToInsert = formEquip
          .filter((e: any) => e.tipo)
          .map((e: any) => ({
            contrato_pj_id: id,
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
          const { error: eErr } = await supabase.from("contrato_pj_equipamentos").insert(equipToInsert);
          if (eErr) throw eErr;
        }
      }

      toast.success("Contrato atualizado com sucesso!");
      setEditing(false);
      // Reload
      const { data: updated } = await supabase.from("contratos_pj").select("*").eq("id", id).maybeSingle();
      if (updated) setContrato(updated);
      const { data: newAcessos } = await supabase.from("contrato_pj_acessos_sistemas").select("*").eq("contrato_pj_id", id);
      setAcessosSistemas(newAcessos || []);
      const { data: newEquips } = await supabase.from("contrato_pj_equipamentos").select("*").eq("contrato_pj_id", id);
      setEquipamentos(newEquips || []);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao atualizar contrato");
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

  if (!contrato) return null;

  const initials = contrato.contato_nome
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
              colaboradorId={contrato.id}
              colaboradorTipo="pj"
              email={contrato.contato_email || (contrato as any).email_pessoal || ""}
              nome={contrato.contato_nome}
              status={contrato.status}
              userId={(contrato as any).user_id || null}
              onChange={() => window.location.reload()}
            />
            {canEditContract && (
              <>
                <Button
                  variant={isAtivo ? "outline" : "default"}
                  onClick={() => setStatusDialogOpen(true)}
                  className={`gap-2 ${isAtivo ? "text-destructive border-destructive hover:bg-destructive/10" : ""}`}
                >
                  {isAtivo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  {isAtivo ? "Encerrar" : "Reativar"}
                </Button>
                <Button onClick={() => setEditing(true)} className="gap-2">
                  <Edit className="h-4 w-4" /> Editar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Header card */}
        <Card className="card-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              {(contrato as any).foto_url ? (
                <img src={(contrato as any).foto_url} alt={contrato.contato_nome} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {initials}
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{contrato.contato_nome}</h1>
                <p className="text-muted-foreground">{contrato.tipo_servico} · {contrato.razao_social}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge variant="outline" className={statusStyles[contrato.status] || ""}>
                    {statusMap[contrato.status] || contrato.status}
                  </Badge>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-0">
                    PJ
                  </Badge>
                  <Badge variant="outline" className="bg-muted text-xs">
                    {contrato.departamento}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {ehCLevel({ cargo: contrato.tipo_servico, nivel: null }) && !isSuperAdmin && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
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
            <TabsTrigger value="notas" className="gap-1"><FileText className="h-3.5 w-3.5" /> Notas Fiscais</TabsTrigger>
            <TabsTrigger value="pagamentos" className="gap-1"><CreditCard className="h-3.5 w-3.5" /> Pagamentos</TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1"><ArrowUpDown className="h-3.5 w-3.5" /> Movimentações</TabsTrigger>
            <TabsTrigger value="custos" className="gap-1"><DollarSign className="h-3.5 w-3.5" /> Custos</TabsTrigger>
            <TabsTrigger value="organograma" className="gap-1"><Network className="h-3.5 w-3.5" /> Organograma</TabsTrigger>
          </TabsList>

          <TabsContent value="pessoais">
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-4 text-sm text-muted-foreground">DADOS PESSOAIS DO PRESTADOR</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <InfoField label="Nome Completo" value={contrato.contato_nome} />
                <InfoField label="CPF" value={contrato.cpf} />
                <InfoField label="RG" value={contrato.rg} />
                <InfoField label="Órgão Emissor" value={contrato.orgao_emissor} />
                <InfoField label="Data de Nascimento" value={contrato.data_nascimento ? format(parseISO(contrato.data_nascimento), "dd/MM/yyyy") : null} />
                <InfoField label="Gênero" value={contrato.genero} />
                <InfoField label="Estado Civil" value={contrato.estado_civil} />
                <InfoField label="Nacionalidade" value={contrato.nacionalidade} />
                <InfoField label="Etnia" value={contrato.etnia} />
                <InfoField label="Nome da Mãe" value={contrato.nome_mae} />
                <InfoField label="Nome do Pai" value={contrato.nome_pai} />
              </div>

              <h3 className="font-semibold mb-4 text-sm text-muted-foreground">ENDEREÇO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <InfoField label="CEP" value={contrato.cep} />
                <InfoField label="Logradouro" value={contrato.logradouro} />
                <InfoField label="Número" value={contrato.numero} />
                <InfoField label="Complemento" value={contrato.complemento} />
                <InfoField label="Bairro" value={contrato.bairro} />
                <InfoField label="Cidade" value={contrato.cidade} />
                <InfoField label="UF" value={contrato.uf} />
              </div>

              <h3 className="font-semibold mb-4 text-sm text-muted-foreground">CONTATO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <InfoField label="Telefone" value={contrato.telefone || contrato.contato_telefone} />
                <InfoField label="Email Pessoal" value={contrato.email_pessoal} />
                <InfoField label="Email Comercial" value={contrato.contato_email} />
                <InfoField label="Contato Emergência - Nome" value={contrato.contato_emergencia_nome} />
                <InfoField label="Contato Emergência - Telefone" value={contrato.contato_emergencia_telefone} />
              </div>

              <h3 className="font-semibold mb-4 text-sm text-muted-foreground">DADOS DA EMPRESA</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="CNPJ" value={contrato.cnpj} />
                <InfoField label="Razão Social" value={contrato.razao_social} />
                <InfoField label="Nome Fantasia" value={contrato.nome_fantasia} />
                <InfoField label="Inscrição Municipal" value={contrato.inscricao_municipal} />
                <InfoField label="Inscrição Estadual" value={contrato.inscricao_estadual} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="documentos">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Contrato Assinado" value={
                  <Badge variant="outline" className={(contrato as any).contrato_assinado ? "bg-success/10 text-success border-0" : "bg-warning/10 text-warning border-0"}>
                    {(contrato as any).contrato_assinado ? "Sim" : "Não"}
                  </Badge>
                } />
                <InfoField label="Objeto do Contrato" value={contrato.objeto} />
                <InfoField label="Observações" value={contrato.observacoes} />
              </div>
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase">Documentos Anexados</h3>
                <DocumentosAnexados
                  contratoPjId={id}
                  currentFotoUrl={(contrato as any).foto_url}
                  onFotoUpdated={(url) => setContrato(prev => prev ? { ...prev, foto_url: url } as any : prev)}
                />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="profissionais">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Cargo / Tipo de Serviço" value={contrato.tipo_servico} />
                <InfoField label="Departamento" value={contrato.departamento} />
                {canSeeSalary(isCargoClevel(contrato.tipo_servico)) && (
                  <div className="md:col-span-2 lg:col-span-3 border rounded-lg p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Remuneração</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Salário base</span>
                      <SalarioMasked valor={Number((contrato as any).valor_base) || 0} userId={(contrato as any).user_id} contexto="admissao" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Aux. transporte</span>
                      <SalarioMasked valor={Number((contrato as any).valor_transporte) || 0} userId={(contrato as any).user_id} contexto="admissao" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Outros benefícios</span>
                      <SalarioMasked valor={Number((contrato as any).valor_beneficios_extras) || 0} userId={(contrato as any).user_id} contexto="admissao" />
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t font-semibold">
                      <span>Total</span>
                      <SalarioMasked valor={Number(contrato.valor_mensal)} userId={(contrato as any).user_id} contexto="admissao" />
                    </div>
                  </div>
                )}
                <InfoField label="Forma de Pagamento" value={contrato.forma_pagamento} />
                <InfoField
                  label="Telefone Corporativo"
                  value={(contrato as any).telefone_corporativo || contrato.telefone || contrato.contato_telefone || "—"}
                />
                <InfoField label="Dia do Vencimento" value={contrato.dia_vencimento?.toString()} />
                <InfoField label="Data de Início" value={format(parseISO(contrato.data_inicio), "dd/MM/yyyy")} />
                <InfoField label="Data de Fim" value={contrato.data_fim ? format(parseISO(contrato.data_fim), "dd/MM/yyyy") : "Indeterminado"} />
                <InfoField label="Renovação Automática" value={contrato.renovacao_automatica ? "Sim" : "Não"} />
                <InfoField label="Gestor Direto / Líder" value={gestorNome} />
                <InfoField label="Status" value={
                  <Badge variant="outline" className={statusStyles[contrato.status] || ""}>
                    {statusMap[contrato.status] || contrato.status}
                  </Badge>
                } />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="bancarios">
            <Card><CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="Banco" value={contrato.banco_nome} />
                <InfoField label="Código Banco" value={contrato.banco_codigo} />
                <InfoField label="Agência" value={contrato.agencia} />
                <InfoField label="Conta" value={contrato.conta} />
                <InfoField label="Tipo de Conta" value={contrato.tipo_conta} />
                <InfoField label="Chave PIX" value={contrato.chave_pix} />
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="empresa">
            <Card><CardContent className="pt-6">
              <h3 className="font-semibold mb-3">🔐 Acesso aos Sistemas</h3>
              {acessosSistemas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum acesso cadastrado.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {acessosSistemas.map((a) => (
                    <div key={a.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{a.sistema}</p>
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

              <h3 className="font-semibold mb-3">💻 Equipamentos</h3>
              {equipamentos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum equipamento cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {equipamentos.map((e) => (
                    <div key={e.id} className="border rounded-lg p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <InfoField label="Tipo" value={e.tipo} />
                        <InfoField label="Marca / Modelo" value={[e.marca, e.modelo].filter(Boolean).join(" ") || null} />
                        <InfoField label="Nº Patrimônio" value={e.numero_patrimonio} />
                        <InfoField label="Nº Série" value={e.numero_serie} />
                        <InfoField label="Estado" value={e.estado} />
                        <InfoField label="Data Entrega" value={e.data_entrega ? format(parseISO(e.data_entrega), "dd/MM/yyyy") : ""} />
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
              <p className="text-muted-foreground text-sm text-center py-8">Nenhum dependente cadastrado.</p>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="notas">
            <TabNotasFiscais contratoId={id!} />
          </TabsContent>

          <TabsContent value="pagamentos">
            <TabPagamentos contratoId={id!} />
          </TabsContent>

          <TabsContent value="movimentacoes">
            <HistoricoMovimentacoes contratoId={id!} />
          </TabsContent>

          <TabsContent value="custos">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustoResumoCard tipo="pj" salarioBase={Number(contrato.valor_mensal)} />
              <HistoricoCustosChart tipo="pj" entityId={id!} />
            </div>
          </TabsContent>

          <TabsContent value="organograma">
            <OrgBranchView contratoPjId={id} />
          </TabsContent>
        </Tabs>

        <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isAtivo ? "Encerrar contrato?" : "Reativar contrato?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isAtivo
                  ? `O contrato de "${contrato.contato_nome}" será marcado como encerrado. Você poderá reativá-lo depois.`
                  : `O contrato de "${contrato.contato_nome}" será reativado com status "Ativo".`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className={isAtivo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              >
                {togglingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : isAtivo ? "Encerrar" : "Reativar"}
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

        <h1 className="text-2xl font-bold tracking-tight">Editar: {contrato.contato_nome}</h1>

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
            <Card><CardContent className="pt-6"><StepDadosPessoaisPJ /></CardContent></Card>
          </TabsContent>
          <TabsContent value="documentos">
            <Card><CardContent className="pt-6"><StepDocumentosPJ /></CardContent></Card>
          </TabsContent>
          <TabsContent value="profissionais">
            <Card><CardContent className="pt-6"><StepDadosProfissionaisPJ /></CardContent></Card>
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

// ─── Notas Fiscais Tab ───
function TabNotasFiscais({ contratoId }: { contratoId: string }) {
  const navigate = useNavigate();
  const [notas, setNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editNota, setEditNota] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const fetchNotas = async () => {
    const { data } = await supabase.from("notas_fiscais_pj").select("*").eq("contrato_id", contratoId).order("data_emissao", { ascending: false });
    setNotas(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchNotas(); }, [contratoId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("notas_fiscais_pj").delete().eq("id", deleteTarget.id);
    if (error) toast.error(humanizeError(error.message));
    else { toast.success("Nota fiscal excluída"); fetchNotas(); }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Notas Fiscais</h3>
        <Button size="sm" className="gap-2" onClick={() => { setEditNota(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Nova NF
        </Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Número</TableHead>
              <TableHead className="font-semibold">Competência</TableHead>
              <TableHead className="font-semibold">Emissão</TableHead>
              <TableHead className="font-semibold">Valor</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : notas.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma nota fiscal cadastrada.</TableCell></TableRow>
            ) : notas.map((n) => (
              <TableRow key={n.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/notas-fiscais/${n.id}`, { state: { from: `/contratos-pj/${contratoId}`, fromLabel: "Contrato PJ" } })}>
                <TableCell className="font-medium">{n.numero}{n.serie ? `/${n.serie}` : ""}</TableCell>
                <TableCell>{n.competencia}</TableCell>
                <TableCell>{format(parseISO(n.data_emissao), "dd/MM/yyyy")}</TableCell>
                <TableCell>R$ {Number(n.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell><Badge variant="outline" className={statusNFStyles[n.status] || ""}>{statusNFMap[n.status] || n.status}</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditNota(n); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(n)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {formOpen && <NotaFiscalForm open={formOpen} onClose={() => setFormOpen(false)} nota={editNota} contratoId={contratoId} onSaved={fetchNotas} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Excluir a nota fiscal <strong>{deleteTarget?.numero}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NotaFiscalForm({ open, onClose, nota, contratoId, onSaved }: {
  open: boolean; onClose: () => void; nota: any | null; contratoId: string; onSaved: () => void;
}) {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    numero: nota?.numero || "", serie: nota?.serie || "", valor: nota?.valor?.toString() || "",
    data_emissao: nota?.data_emissao || "", data_vencimento: nota?.data_vencimento || "",
    competencia: nota?.competencia || "", descricao: nota?.descricao || "",
    status: nota?.status || "pendente", observacoes: nota?.observacoes || "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!isSuperAdmin && (!form.numero.trim() || !form.data_emissao || !form.valor || !form.competencia)) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    setSaving(true);
    const payload = {
      contrato_id: contratoId, numero: form.numero.trim(), serie: form.serie.trim() || null,
      valor: Number(form.valor), data_emissao: form.data_emissao,
      data_vencimento: form.data_vencimento || null, competencia: form.competencia.trim(),
      descricao: form.descricao.trim() || null, status: form.status, observacoes: form.observacoes.trim() || null,
    };
    try {
      if (nota) {
        const { error } = await supabase.from("notas_fiscais_pj").update(payload as any).eq("id", nota.id);
        if (error) throw error;
        toast.success("Nota fiscal atualizada!");
      } else {
        const { error } = await supabase.from("notas_fiscais_pj").insert(payload as any);
        if (error) throw error;
        toast.success("Nota fiscal cadastrada!");
      }
      onSaved(); onClose();
    } catch (err: any) { toast.error(humanizeError(err.message)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{nota ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label>Número *</Label><Input value={form.numero} onChange={(e) => set("numero", e.target.value)} /></div>
          <div><Label>Série</Label><Input value={form.serie} onChange={(e) => set("serie", e.target.value)} /></div>
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} /></div>
          <div><Label>Competência *</Label><Input value={form.competencia} onChange={(e) => set("competencia", e.target.value)} placeholder="MM/AAAA" /></div>
          <div><Label>Data Emissão *</Label><Input type="date" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} /></div>
          <div><Label>Data Vencimento</Label><Input type="date" value={form.data_vencimento} onChange={(e) => set("data_vencimento", e.target.value)} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusNFMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} rows={2} /></div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pagamentos Tab ───
function TabPagamentos({ contratoId }: { contratoId: string }) {
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editPag, setEditPag] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const fetchPagamentos = async () => {
    const { data } = await supabase.from("pagamentos_pj").select("*, notas_fiscais_pj(numero)").eq("contrato_id", contratoId).order("data_prevista", { ascending: false });
    setPagamentos(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchPagamentos(); }, [contratoId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("pagamentos_pj").delete().eq("id", deleteTarget.id);
    if (error) toast.error(humanizeError(error.message));
    else { toast.success("Pagamento excluído"); fetchPagamentos(); }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Pagamentos</h3>
        <Button size="sm" className="gap-2" onClick={() => { setEditPag(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> Novo Pagamento
        </Button>
      </div>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader>
             <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Competência</TableHead>
              <TableHead className="font-semibold">Nº NF</TableHead>
              <TableHead className="font-semibold">Data Prevista</TableHead>
              <TableHead className="font-semibold">Data Pagamento</TableHead>
              <TableHead className="font-semibold">Valor</TableHead>
              <TableHead className="font-semibold">Forma</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : pagamentos.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pagamento cadastrado.</TableCell></TableRow>
            ) : pagamentos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{formatCompetencia(p.competencia)}</TableCell>
                <TableCell className="text-sm">{p.notas_fiscais_pj?.numero || "—"}</TableCell>
                <TableCell>{format(parseISO(p.data_prevista), "dd/MM/yyyy")}</TableCell>
                <TableCell>{p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell>R$ {Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-sm">{p.forma_pagamento}</TableCell>
                <TableCell><Badge variant="outline" className={statusPagStyles[p.status] || ""}>{statusPagMap[p.status] || p.status}</Badge></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditPag(p); setFormOpen(true); }}><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {formOpen && <PagamentoForm open={formOpen} onClose={() => setFormOpen(false)} pagamento={editPag} contratoId={contratoId} onSaved={fetchPagamentos} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Excluir este pagamento?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PagamentoForm({ open, onClose, pagamento, contratoId, onSaved }: {
  open: boolean; onClose: () => void; pagamento: any | null; contratoId: string; onSaved: () => void;
}) {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    valor: pagamento?.valor?.toString() || "", data_prevista: pagamento?.data_prevista || "",
    data_pagamento: pagamento?.data_pagamento || "", competencia: pagamento?.competencia || "",
    forma_pagamento: pagamento?.forma_pagamento || "transferencia",
    status: pagamento?.status || "pendente", observacoes: pagamento?.observacoes || "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!isSuperAdmin && (!form.valor || !form.data_prevista || !form.competencia)) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    setSaving(true);
    const payload = {
      contrato_id: contratoId, valor: Number(form.valor), data_prevista: form.data_prevista,
      data_pagamento: form.data_pagamento || null, competencia: form.competencia.trim(),
      forma_pagamento: form.forma_pagamento, status: form.status,
      observacoes: form.observacoes.trim() || null,
    };
    try {
      if (pagamento) {
        const { error } = await supabase.from("pagamentos_pj").update(payload as any).eq("id", pagamento.id);
        if (error) throw error;
        toast.success("Pagamento atualizado!");
      } else {
        const { error } = await supabase.from("pagamentos_pj").insert(payload as any);
        if (error) throw error;
        toast.success("Pagamento cadastrado!");
      }
      onSaved(); onClose();
    } catch (err: any) { toast.error(humanizeError(err.message)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{pagamento ? "Editar Pagamento" : "Novo Pagamento"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor} onChange={(e) => set("valor", e.target.value)} /></div>
          <div><Label>Competência *</Label><Input type="month" value={form.competencia} onChange={(e) => set("competencia", e.target.value)} /></div>
          <div><Label>Data Prevista *</Label><Input type="date" value={form.data_prevista} onChange={(e) => set("data_prevista", e.target.value)} /></div>
          <div><Label>Data Pagamento</Label><Input type="date" value={form.data_pagamento} onChange={(e) => set("data_pagamento", e.target.value)} /></div>
          <div>
            <Label>Forma de Pagamento</Label>
            <Select value={form.forma_pagamento} onValueChange={(v) => set("forma_pagamento", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusPagMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Movimentações Tab ───
const TIPO_MOV_LABEL: Record<string, string> = {
  promocao: "Promoção", transferencia: "Transferência", alteracao_salarial: "Alteração Salarial",
  alteracao_cargo: "Alteração de Cargo", mudanca_departamento: "Mudança de Departamento",
};
const STATUS_MOV_STYLES: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0", aprovada: "bg-info/10 text-info border-0",
  efetivada: "bg-emerald-500/10 text-emerald-600 border-0", cancelada: "bg-destructive/10 text-destructive border-0",
};

function HistoricoMovimentacoes({ contratoId }: { contratoId: string }) {
  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["movimentacoes_pj", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes")
        .select("*")
        .eq("contrato_pj_id", contratoId)
        .order("data_efetivacao", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const fmt = (v: number | null) =>
    v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Carregando...</CardContent></Card>;
  }

  if (movs.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma movimentação registrada.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {movs.map((m) => (
          <div key={m.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{TIPO_MOV_LABEL[m.tipo] || m.tipo}</Badge>
                <Badge variant="outline" className={STATUS_MOV_STYLES[m.status] || ""}>{m.status}</Badge>
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
                  <p className="text-xs text-muted-foreground">Valor Mensal</p>
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
