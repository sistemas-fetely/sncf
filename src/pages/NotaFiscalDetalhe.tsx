import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit, FileText, Building2, Calendar, DollarSign, Hash, Clock, ExternalLink, Mail, Send, CheckCircle2, ChevronRight, Upload, Download, Eye, Trash2, Loader2 as Loader2Icon, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUrlAssinada } from "@/lib/storage/arquivoPrivado";
import { toast } from "sonner";
import { nomeCanonico } from "@/lib/parceiros/nome";
import { format, parseISO } from "date-fns";
import { useParametros } from "@/hooks/useParametros";
import { SalarioMasked } from "@/components/SalarioMasked";
import { PageShell } from "@/components/layout/PageShell";

const defaultStatusMap: Record<string, string> = {
  pendente: "Pendente", aprovada: "Aprovada", enviada_pagamento: "Enviada para Pagamento", paga: "Paga", cancelada: "Cancelada", vencida: "Vencida",
};
const statusStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
  aprovada: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  enviada_pagamento: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  paga: "bg-success/10 text-success border-0 min-w-[140px] justify-center",
  cancelada: "bg-destructive/10 text-destructive border-0 min-w-[140px] justify-center",
  vencida: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
};

interface NotaFiscal {
  id: string;
  numero: string;
  serie: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  competencia: string;
  descricao: string | null;
  arquivo_url: string | null;
  status: string;
  observacoes: string | null;
  contrato_id: string;
  created_at: string;
  updated_at: string;
}

interface ContratoPJ {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  contato_nome: string;
  departamento: string;
  valor_mensal: number;
}

interface PagamentoPJ {
  id: string;
  valor: number;
  competencia: string;
  data_prevista: string;
  data_pagamento: string | null;
  status: string;
  forma_pagamento: string;
  observacoes: string | null;
}

const statusPagMap: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  enviada_pagamento: "Enviada para Pagamento",
  paga: "Paga",
  pago: "Pago",
  cancelada: "Cancelada",
  cancelado: "Cancelado",
  vencida: "Vencida",
};
const statusPagStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
  aprovada: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  enviada_pagamento: "bg-info/10 text-info border-0 min-w-[140px] justify-center",
  paga: "bg-success/10 text-success border-0 min-w-[140px] justify-center",
  pago: "bg-success/10 text-success border-0 min-w-[140px] justify-center",
  cancelada: "bg-destructive/10 text-destructive border-0 min-w-[140px] justify-center",
  cancelado: "bg-destructive/10 text-destructive border-0 min-w-[140px] justify-center",
  vencida: "bg-warning/10 text-warning border-0 min-w-[140px] justify-center",
};

function InfoItem({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

interface EmailLog {
  id: string;
  created_at: string;
  status: string;
  recipient_email: string;
  message_id: string | null;
}

export default function NotaFiscalDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const hasPermission = (_m: string, _a?: string) => true;
  const canEdit = hasPermission("notas_fiscais", "edit");
  const canApprove = hasPermission("notas_fiscais", "aprovar");
  const canSendEmail = hasPermission("notas_fiscais", "enviar_email");
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [contrato, setContrato] = useState<ContratoPJ | null>(null);
  const [pagamentos, setPagamentos] = useState<PagamentoPJ[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("flavio@fsime.com.br");
  const [sendingEmail, setSendingEmail] = useState(false);

  const { data: statusParams } = useParametros("status_nota_fiscal");
  const statusMap = useMemo(() => {
    if (statusParams && statusParams.length > 0) {
      return Object.fromEntries(statusParams.map((p) => [p.valor, p.label]));
    }
    return defaultStatusMap;
  }, [statusParams]);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      // Fetch nota fiscal
      const { data: nfData, error: nfError } = await supabase
        .from("notas_fiscais_pj")
        .select("*")
        .eq("id", id)
        .single();
      if (nfError || !nfData) {
        toast.error("Nota fiscal não encontrada");
        navigate("/notas-fiscais");
        return;
      }
      setNota(nfData as NotaFiscal);

      // Fetch contrato
      const { data: contratoData } = await supabase
        .from("contratos_pj")
        .select("id, razao_social, nome_fantasia, cnpj, contato_nome, departamento, valor_mensal, user_id")
        .eq("id", nfData.contrato_id)
        .single();
      if (contratoData) setContrato(contratoData as ContratoPJ);

      // Fetch pagamentos vinculados
      const { data: pagData } = await supabase
        .from("pagamentos_pj")
        .select("*")
        .eq("nota_fiscal_id", id)
        .order("created_at", { ascending: false });
      if (pagData) setPagamentos(pagData as PagamentoPJ[]);

      // Fetch email logs for this nota fiscal
      const { data: emailData } = await supabase
        .from("email_send_log")
        .select("id, created_at, status, recipient_email, message_id")
        .eq("template_name", "nf-pagamento")
        .contains("metadata", { nota_fiscal_id: id })
        .order("created_at", { ascending: true });
      if (emailData) setEmailLogs(emailData as EmailLog[]);

      setLoading(false);
    };
    fetchData();
  }, [id, navigate]);

  // Verifica se já existe Conta a Pagar gerada automaticamente para esta NF (cross-módulo)
  const { data: cpGerada } = useQuery({
    queryKey: ["cp-from-nf-pj", nota?.numero, nota?.id],
    enabled: !!nota?.numero,
    queryFn: async () => {
      const { data } = await supabase
        .from("contas_pagar_receber")
        .select("id, status")
        .eq("origem", "nf_pj_interno")
        .eq("nf_numero", nota!.numero!)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!nota) return null;

  const formatDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";
  const formatCompetencia = (d: string | null) => d ? format(parseISO(d), "MM/yyyy") : "—";
  const formatCurrency = (v: number) => `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  // Ordered status pipeline for visual stepper
  const statusPipeline = ["pendente", "aprovada", "enviada_pagamento", "paga"];
  const terminalStatuses = ["cancelada", "vencida"];
  const currentIndex = statusPipeline.indexOf(nota.status);
  const isTerminal = terminalStatuses.includes(nota.status);

  // Map NF status to payment status — keep same status
  const nfToPagamentoStatus = (nfStatus: string): string => {
    return nfStatus;
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!nota) return;
    setChangingStatus(true);
    try {
      const normalizedNewStatus = newStatus === "enviada_p_pagamento" ? "enviada_pagamento" : newStatus;
      const previousNotaStatus = nota.status === "enviada_p_pagamento" ? "enviada_pagamento" : nota.status;

      const { error } = await supabase
        .from("notas_fiscais_pj")
        .update({ status: normalizedNewStatus } as any)
        .eq("id", nota.id);
      if (error) throw error;

      const { data: existingPagamento, error: existingPagamentoError } = await supabase
        .from("pagamentos_pj")
        .select("id")
        .eq("nota_fiscal_id", nota.id)
        .limit(1)
        .maybeSingle();
      if (existingPagamentoError) throw existingPagamentoError;

      if (existingPagamento) {
        const pagStatus = nfToPagamentoStatus(normalizedNewStatus);
        const { error: syncError } = await supabase
          .from("pagamentos_pj")
          .update({ status: pagStatus } as any)
          .eq("nota_fiscal_id", nota.id);
        if (syncError) throw syncError;
      } else if (normalizedNewStatus === "enviada_pagamento" && previousNotaStatus !== "enviada_pagamento") {
        const { data: contratoData, error: contratoError } = await supabase
          .from("contratos_pj")
          .select("forma_pagamento")
          .eq("id", nota.contrato_id)
          .single();
        if (contratoError) throw contratoError;

        const pagPayload = {
          contrato_id: nota.contrato_id,
          nota_fiscal_id: nota.id,
          valor: Number(nota.valor),
          competencia: nota.competencia,
          data_prevista: nota.data_vencimento || nota.data_emissao,
          forma_pagamento: contratoData?.forma_pagamento || "transferencia",
          status: normalizedNewStatus,
          observacoes: `Pagamento gerado automaticamente a partir da NF ${nota.numero}`,
        };
        const { error: pagError } = await supabase.from("pagamentos_pj").insert(pagPayload as any);
        if (pagError) throw pagError;
        toast.success("Pagamento PJ criado automaticamente!");
      }

      setNota({ ...nota, status: normalizedNewStatus });
      toast.success(`Status alterado para ${statusMap[normalizedNewStatus] || normalizedNewStatus}`);

      const { data: pagData, error: pagDataError } = await supabase
        .from("pagamentos_pj")
        .select("*")
        .eq("nota_fiscal_id", nota.id)
        .order("created_at", { ascending: false });
      if (pagDataError) throw pagDataError;
      if (pagData) setPagamentos(pagData as PagamentoPJ[]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChangingStatus(false);
      setPendingStatus(null);
    }
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SmartBackButton fallback="/notas-fiscais" fallbackLabel="Notas Fiscais" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-medium tracking-tight">
                NF {nota.numero}{nota.serie ? `/${nota.serie}` : ""}
              </h1>
              <Badge variant="outline" className={`text-sm ${statusStyles[nota.status] || ""}`}>
                {statusMap[nota.status] || nota.status}
              </Badge>
              {cpGerada && (
                <Link to={`/administrativo/contas-pagar?conta=${cpGerada.id}`}>
                  <Badge className="bg-admin/10 text-admin gap-1 hover:bg-admin/20 cursor-pointer">
                    <Landmark className="h-3 w-3" /> Conta a pagar gerada automaticamente
                  </Badge>
                </Link>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Competência {formatCompetencia(nota.competencia)} · Emitida em {formatDate(nota.data_emissao)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSendEmail && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setEmailDialogOpen(true)}
            >
              <Mail className="h-4 w-4" /> Enviar por E-mail
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" className="gap-2" onClick={() => navigate(`/notas-fiscais?edit=${nota.id}`)}>
              <Edit className="h-4 w-4" /> Editar
            </Button>
          )}
        </div>
      </div>

      {/* Status Pipeline */}
      <Card>
        <CardContent className="pt-6 pb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">Fluxo de Status</p>
            {isTerminal && (
              <Badge variant="outline" className={statusStyles[nota.status] || ""}>
                {statusMap[nota.status] || nota.status}
              </Badge>
            )}
          </div>
          {!isTerminal ? (
            <div className="flex items-center gap-0">
              {statusPipeline.map((status, idx) => {
                const isActive = nota.status === status;
                const isPast = currentIndex > idx;
                const isFuture = currentIndex < idx;
                const isNext = idx === currentIndex + 1;

                // Per-status color sets
                const colorMap: Record<string, { activeBg: string; activeFg: string; pastBg: string; pastFg: string; dot: string }> = {
                  pendente:           { activeBg: "bg-warning",   activeFg: "text-white",      pastBg: "bg-warning/10",  pastFg: "text-warning",  dot: "bg-warning" },
                  aprovada:           { activeBg: "bg-info",    activeFg: "text-white",      pastBg: "bg-info/10",   pastFg: "text-info",   dot: "bg-info" },
                  enviada_pagamento:  { activeBg: "bg-info",  activeFg: "text-white",      pastBg: "bg-info/10", pastFg: "text-info", dot: "bg-info" },
                  paga:               { activeBg: "bg-success", activeFg: "text-white",      pastBg: "bg-success/10",pastFg: "text-success",dot: "bg-success" },
                };
                const colors = colorMap[status] || colorMap.pendente;

                return (
                  <div key={status} className="flex items-center flex-1 last:flex-initial">
                    <button
                      disabled={changingStatus || isPast || isActive || !canApprove}
                      onClick={() => canApprove && (isNext || isFuture) ? setPendingStatus(status) : undefined}
                      className={`
                        relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all w-full min-w-[140px] justify-center
                        ${isActive ? `${colors.activeBg} ${colors.activeFg} shadow-md` : ""}
                        ${isPast ? `${colors.pastBg} ${colors.pastFg}` : ""}
                        ${isFuture && isNext && canApprove ? "bg-muted hover:bg-muted/80 cursor-pointer border-2 border-dashed border-muted-foreground/30 text-muted-foreground" : ""}
                        ${isFuture && isNext && !canApprove ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed" : ""}
                        ${isFuture && !isNext && canApprove ? "bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer" : ""}
                        ${isFuture && !isNext && !canApprove ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed" : ""}
                        ${isPast || isActive ? "cursor-default" : ""}
                      `}
                    >
                      <span className={`
                        flex h-6 w-6 items-center justify-center rounded-full text-xs shrink-0
                        ${isActive ? `${colors.activeFg} bg-white/20` : ""}
                        ${isPast ? `${colors.dot} text-white` : ""}
                        ${isFuture ? "bg-muted-foreground/20 text-muted-foreground" : ""}
                      `}>
                        {isPast ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </span>
                      <span className="truncate">{statusMap[status] || status}</span>
                    </button>
                    {idx < statusPipeline.length - 1 && (
                      <ChevronRight className={`h-5 w-5 shrink-0 mx-1 ${isPast ? "text-primary" : "text-muted-foreground/40"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Esta nota fiscal está com status final. Para retomar o fluxo, use o botão Editar.
              </p>
            </div>
          )}
          {!isTerminal && canApprove && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">Ações rápidas:</p>
              {terminalStatuses.map((ts) => (
                <Button
                  key={ts}
                  variant="outline"
                  size="sm"
                  className={`text-xs ${statusStyles[ts] || ""}`}
                  disabled={changingStatus}
                  onClick={() => setPendingStatus(ts)}
                >
                  {statusMap[ts] || ts}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Change Confirmation */}
      <AlertDialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Mudança de Status</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Alterar o status da NF <strong>{nota.numero}</strong> de{" "}
                  <Badge variant="outline" className={`mx-1 ${statusStyles[nota.status] || ""}`}>
                    {statusMap[nota.status] || nota.status}
                  </Badge>{" "}
                  para{" "}
                  <Badge variant="outline" className={`mx-1 ${statusStyles[pendingStatus || ""] || ""}`}>
                    {statusMap[pendingStatus || ""] || pendingStatus}
                  </Badge>?
                </p>
                {pendingStatus === "enviada_pagamento" && (
                  <p className="mt-2 text-sm font-medium text-primary">
                    ⚡ Um lançamento de pagamento será criado automaticamente.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changingStatus}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={changingStatus} onClick={() => pendingStatus && handleStatusChange(pendingStatus)}>
              {changingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Send Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Enviar NF por E-mail
            </DialogTitle>
            <DialogDescription>
              Revise os dados abaixo antes de enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">Destinatário</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Assunto</p>
              <p className="text-sm font-medium">
                [Fetely] - NF para pagamento{contrato?.nome_fantasia ? ` - ${contrato.nome_fantasia}` : ''}
              </p>
            </div>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Prévia do E-mail</p>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3">
                <p className="font-medium text-foreground">Nota Fiscal para Pagamento</p>
                <p>
                  Segue abaixo a nota fiscal referente aos serviços prestados
                  {contrato ? ` por ${contrato.contato_nome}` : ''}
                  {contrato?.nome_fantasia ? ` (${contrato.nome_fantasia})` : ''} para processamento de pagamento.
                </p>
                <div className="space-y-1 pl-2 border-l-2 border-primary/30">
                  <p><strong>Número da NF:</strong> {nota.numero}</p>
                  <p><strong>Valor:</strong> {formatCurrency(nota.valor)}</p>
                  <p><strong>Data de Vencimento:</strong> {formatDate(nota.data_vencimento)}</p>
                  <p><strong>Prestador:</strong> {contrato?.contato_nome || '—'}</p>
                </div>
                {nota.arquivo_url && (
                  <p className="text-center my-3">
                    <a href={nota.arquivo_url} target="_blank" rel="noopener noreferrer" className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium no-underline">
                      📄 Baixar Nota Fiscal (PDF)
                    </a>
                  </p>
                )}
                <p>Após o pagamento, favor enviar o comprovante para rh.corp@fetelycorp.com.br</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={sendingEmail}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              disabled={sendingEmail || !emailTo}
              onClick={async () => {
                if (!emailTo) return;
                setSendingEmail(true);
                try {
                  const { error } = await supabase.functions.invoke('send-transactional-email', {
                    body: {
                      templateName: 'nf-pagamento',
                      recipientEmail: emailTo,
                      idempotencyKey: `nf-pagamento-${nota.id}-${Date.now()}`,
                      metadata: { nota_fiscal_id: nota.id },
                      templateData: {
                        nomeColaborador: contrato?.contato_nome || '',
                        nomeEmpresa: nomeCanonico(contrato?.razao_social, ''),
                        numeroNF: nota.numero,
                        valor: formatCurrency(nota.valor),
                        dataVencimento: formatDate(nota.data_vencimento),
                        notaFiscalId: nota.id,
                      },
                    },
                  });
                  if (error) throw error;
                  toast.success("E-mail enviado com sucesso!");
                  setEmailDialogOpen(false);
                  // Refresh email logs
                  const { data: newLogs } = await supabase
                    .from("email_send_log")
                    .select("id, created_at, status, recipient_email, message_id")
                    .eq("template_name", "nf-pagamento")
                    .contains("metadata", { nota_fiscal_id: nota.id })
                    .order("created_at", { ascending: true });
                  if (newLogs) setEmailLogs(newLogs as EmailLog[]);
                } catch (err: any) {
                  toast.error("Erro ao enviar e-mail: " + (err.message || "Erro desconhecido"));
                } finally {
                  setSendingEmail(false);
                }
              }}
            >
              {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-xl font-medium">{formatCurrency(nota.valor)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencimento</p>
                <p className="text-xl font-medium">{formatDate(nota.data_vencimento)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data Pagamento</p>
                <p className="text-xl font-medium">{formatDate(nota.data_pagamento)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                <Hash className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagamentos Vinculados</p>
                <p className="text-xl font-medium">{pagamentos.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados da NF */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Dados da Nota Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <InfoItem label="Número" value={nota.numero} icon={Hash} />
              <InfoItem label="Série" value={nota.serie} />
              <InfoItem label="Competência" value={formatCompetencia(nota.competencia)} icon={Calendar} />
              <InfoItem label="Data de Emissão" value={formatDate(nota.data_emissao)} icon={Calendar} />
              <InfoItem label="Data de Vencimento" value={formatDate(nota.data_vencimento)} icon={Calendar} />
              <InfoItem label="Data de Pagamento" value={formatDate(nota.data_pagamento)} icon={Calendar} />
              <InfoItem label="Valor" value={formatCurrency(nota.valor)} icon={DollarSign} />
              <InfoItem label="Status" value={
                <Badge variant="outline" className={statusStyles[nota.status] || ""}>
                  {statusMap[nota.status] || nota.status}
                </Badge>
              } />
            </div>
            {nota.descricao && (
              <>
                <Separator className="my-4" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="text-sm">{nota.descricao}</p>
                </div>
              </>
            )}
            {nota.observacoes && (
              <>
                <Separator className="my-4" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="text-sm">{nota.observacoes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Contrato vinculado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Contrato Vinculado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contrato ? (
              <>
                <InfoItem label="Razão Social" value={contrato.razao_social} />
                {contrato.nome_fantasia && (
                  <InfoItem label="Nome Fantasia" value={contrato.nome_fantasia} />
                )}
                <InfoItem label="CNPJ" value={contrato.cnpj} />
                <InfoItem label="Contato" value={contrato.contato_nome} />
                <InfoItem label="Departamento" value={contrato.departamento} />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Valor Mensal</span>
                  <SalarioMasked
                    valor={contrato.valor_mensal}
                    userId={(contrato as any).user_id || null}
                    contexto="relatorio_pj"
                  />
                </div>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => navigate(`/contratos-pj/${contrato.id}`)}
                >
                  <ExternalLink className="h-4 w-4" /> Ver Contrato Completo
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Contrato não encontrado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pagamentos vinculados */}
      {pagamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Pagamentos Vinculados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pagamentos.map((pag) => (
                <div key={pag.id} className="flex items-center justify-between border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {formatCurrency(pag.valor)} · {pag.competencia}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pag.forma_pagamento} · Previsto: {formatDate(pag.data_prevista)}
                        {pag.data_pagamento && ` · Pago: ${formatDate(pag.data_pagamento)}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={statusPagStyles[pag.status] || ""}>
                    {statusPagMap[pag.status] || pag.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Arquivo da NF */}
      <ArquivoNFCard
        nota={nota}
        onArquivoUpdated={(url) => setNota({ ...nota, arquivo_url: url })}
        canEdit={canEdit}
      />

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Histórico
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2.5 top-1 bottom-1 w-px bg-border" />
            <TimelineItem
              date={nota.created_at}
              label="Nota fiscal cadastrada no sistema"
            />
            {nota.data_emissao && (
              <TimelineItem
                date={nota.data_emissao}
                label={`Emissão da NF ${nota.numero}`}
              />
            )}
            {nota.data_vencimento && (
              <TimelineItem
                date={nota.data_vencimento}
                label="Data de vencimento"
              />
            )}
            {/* Email logs */}
            {emailLogs.filter((log, idx, arr) => {
              // Show only the latest status per message_id (sent > pending)
              if (!log.message_id) return true;
              const lastForMessage = arr.filter(l => l.message_id === log.message_id).pop();
              return lastForMessage?.id === log.id;
            }).map((log) => {
              const statusLabel = log.status === 'sent' ? 'E-mail enviado' 
                : log.status === 'pending' ? 'E-mail na fila de envio'
                : log.status === 'failed' ? 'Falha no envio de e-mail'
                : `E-mail ${log.status}`;
              const variant = log.status === 'sent' ? 'email' 
                : log.status === 'failed' ? 'default' 
                : 'default';
              return (
                <TimelineItem
                  key={log.id}
                  date={log.created_at}
                  label={`${statusLabel} para ${log.recipient_email}`}
                  variant={variant as any}
                />
              );
            })}
            {nota.data_pagamento && (
              <TimelineItem
                date={nota.data_pagamento}
                label="Pagamento registrado"
                variant="success"
              />
            )}
            {nota.updated_at !== nota.created_at && (
              <TimelineItem
                date={nota.updated_at}
                label="Última atualização"
              />
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function ArquivoNFCard({ nota, onArquivoUpdated, canEdit = true }: { nota: NotaFiscal; onArquivoUpdated: (url: string | null) => void; canEdit?: boolean }) {
  const { url: urlLeitura } = useUrlAssinada("documentos-cadastro", nota.arquivo_url);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Formato não suportado. Use PDF, JPG, PNG ou WebP.");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "pdf";
    const filePath = `notas-fiscais/${nota.id}/nf-${nota.numero}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("documentos-cadastro")
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast.error("Erro ao enviar: " + uploadError.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage
      .from("documentos-cadastro")
      .getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;
    const { error: updateError } = await supabase
      .from("notas_fiscais_pj")
      .update({ arquivo_url: publicUrl })
      .eq("id", nota.id);
    if (updateError) {
      toast.error("Erro ao salvar URL: " + updateError.message);
    } else {
      onArquivoUpdated(publicUrl);
      toast.success("Nota fiscal anexada com sucesso!");
    }
    setUploading(false);
  };

  const handleRemove = async () => {
    const { error } = await supabase
      .from("notas_fiscais_pj")
      .update({ arquivo_url: null } as any)
      .eq("id", nota.id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    onArquivoUpdated(null);
    toast.success("Arquivo removido.");
  };

  const isPdf = nota.arquivo_url?.match(/\.pdf$/i);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          Arquivo da Nota Fiscal
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nota.arquivo_url ? (
          <div className="flex items-center justify-between border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">NF {nota.numero} - Arquivo anexado</p>
                <p className="text-xs text-muted-foreground">{isPdf ? "PDF" : "Imagem"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Visualizar" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Download">
                <a href={urlLeitura ?? undefined} target="_blank" rel="noopener noreferrer" download>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleRemove} title="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ) : canEdit ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Nenhum arquivo anexado</p>
            <Button
              variant="outline"
              className="gap-2"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Enviar Nota Fiscal
            </Button>
            <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG ou WebP (máx. 10MB)</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum arquivo anexado</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />

        {/* Preview Dialog */}
        {previewOpen && nota.arquivo_url && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setPreviewOpen(false)}>
            <div className="bg-background rounded-lg max-w-3xl w-full max-h-[85vh] p-6 m-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">NF {nota.numero}</h3>
                <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>Fechar</Button>
              </div>
              <div className="flex items-center justify-center overflow-auto max-h-[70vh]">
                {isPdf ? (
                  <iframe src={urlLeitura ?? undefined} className="w-full h-[65vh] border rounded" />
                ) : (
                  <img src={urlLeitura ?? undefined} alt={`NF ${nota.numero}`} className="max-w-full max-h-[65vh] object-contain rounded" />
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({ date, label, variant = "default" }: { date: string; label: string; variant?: "default" | "success" | "email" }) {
  const dotColor = variant === "success" ? "bg-success" : variant === "email" ? "bg-info" : "bg-primary";
  const formatted = date.includes("T") ? format(parseISO(date), "dd/MM/yyyy HH:mm") : format(parseISO(date), "dd/MM/yyyy");
  return (
    <div className="relative flex items-start gap-3">
      <div className={`absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-background`} />
      <div className="flex items-start gap-2">
        {variant === "email" && <Mail className="h-3.5 w-3.5 text-info mt-0.5 shrink-0" />}
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{formatted}</p>
        </div>
      </div>
    </div>
  );
}
