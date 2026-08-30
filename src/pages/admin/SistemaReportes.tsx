import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { MessageSquareWarning, Clock, AlertCircle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useReportesInbox,
  useAtualizarReporte,
  useResponsaveisReporte,
  useNomesUsuarios,
  type Reporte,
} from "@/hooks/useReportes";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const PRIORIDADE_COR: Record<string, string> = {
  critica: "bg-destructive/10 text-destructive border-destructive/30",
  alta: "bg-warning/10 text-warning border-warning/30",
  normal: "bg-muted text-muted-foreground",
  baixa: "bg-muted/50 text-muted-foreground",
};

const STATUS_COR: Record<string, string> = {
  recebido: "bg-info/10 text-info border-info/30",
  em_analise: "bg-warning/10 text-warning border-warning/30",
  em_correcao: "bg-info/10 text-info border-info/30",
  resolvido: "bg-success/10 text-success border-success/30",
  duplicado: "bg-muted text-muted-foreground",
  nao_procede: "bg-muted/50 text-muted-foreground",
};

export default function SistemaReportes() {
  const { roles: authRoles } = useAuth();
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const [filtroStatus, setFiltroStatus] = useState("");
  const { data: reportes, isLoading } = useReportesInbox(filtroStatus || undefined);
  const [selecionado, setSelecionado] = useState<Reporte | null>(null);
  const [respostaAdmin, setRespostaAdmin] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Reporte | null>(null);
  const atualizar = useAtualizarReporte();
  const { data: responsaveis } = useResponsaveisReporte();
  const { data: nomes } = useNomesUsuarios();

  const nomeDe = (id?: string | null) => (id ? nomes?.[id] : undefined);

  const handleDeleteReport = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("sistema_reportes").delete().eq("id", deleteTarget.id);
    if (error) toast.error("Erro ao excluir: " + humanizeError(error.message));
    else {
      toast.success("Report excluído");
      // refetch via query invalidation
      window.location.reload();
    }
    setDeleteTarget(null);
  };

  const { data: statusOpcoes } = useQuery({
    queryKey: ["parametros", "status_reporte"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parametros")
        .select("valor, label")
        .eq("categoria", "status_reporte")
        .eq("ativo", true)
        .order("ordem");
      return data || [];
    },
  });

  const { data: tipoLabels } = useQuery({
    queryKey: ["parametros", "tipo_reporte"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parametros")
        .select("valor, label")
        .eq("categoria", "tipo_reporte")
        .eq("ativo", true);
      return Object.fromEntries((data || []).map((t: any) => [t.valor, t.label]));
    },
  });

  const contadores = {
    total: reportes?.length || 0,
    recebido: reportes?.filter((r) => r.status_valor === "recebido").length || 0,
    sem_responsavel:
      reportes?.filter(
        (r) =>
          !r.atribuido_a &&
          !["resolvido", "duplicado", "nao_procede"].includes(r.status_valor)
      ).length || 0,
    resolvido: reportes?.filter((r) => r.status_valor === "resolvido").length || 0,
  };

  async function handleAtualizar(updates: {
    status_valor?: string;
    prioridade?: string;
    resposta_admin?: string;
    atribuido_a?: string | null;
  }) {
    if (!selecionado) return;
    try {
      await atualizar.mutateAsync({ id: selecionado.id, ...updates });
    } catch {
      return;
    }
    if (updates.status_valor)
      setSelecionado({ ...selecionado, status_valor: updates.status_valor });
    if (updates.prioridade)
      setSelecionado({ ...selecionado, prioridade: updates.prioridade });
    if (updates.resposta_admin !== undefined)
      setSelecionado({ ...selecionado, resposta_admin: updates.resposta_admin });
    if (updates.atribuido_a !== undefined)
      setSelecionado({ ...selecionado, atribuido_a: updates.atribuido_a });
  }

  return (
    <PageShell>
      <PageHeader
        icone={MessageSquareWarning}
        titulo="Reportes do Sistema"
        estado="Inbox colaborativa — bugs, sugestões e confusões reportados pelos usuários."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-medium">{contadores.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Recebidos</p>
            <p className="text-2xl font-medium text-info">{contadores.recebido}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sem responsável</p>
            <p className="text-2xl font-medium text-warning">{contadores.sem_responsavel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Resolvidos</p>
            <p className="text-2xl font-medium text-success">{contadores.resolvido}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={filtroStatus || "__all__"}
          onValueChange={(v) => setFiltroStatus(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {(statusOpcoes || []).map((s: any) => (
              <SelectItem key={s.valor} value={s.valor}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !reportes || reportes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum reporte no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reportes.map((r) => (
            <Card
              key={r.id}
              className="cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => {
                setSelecionado(r);
                setRespostaAdmin(r.resposta_admin || "");
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{r.descricao}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(r.reportado_em), {
                        locale: ptBR,
                        addSuffix: true,
                      })}
                      <span>·</span>
                      <span>por {nomeDe(r.reportado_por) || "autor desconhecido"}</span>
                      <span>·</span>
                      <code className="text-foreground/70">{r.rota}</code>
                      <span>·</span>
                      {r.atribuido_a ? (
                        <span>
                          resp.: {nomeDe(r.atribuido_a) ||
                            (responsaveis || []).find((u) => u.user_id === r.atribuido_a)?.nome ||
                            "responsável"}
                        </span>
                      ) : r.status_valor === "recebido" ? (
                        <span className="text-muted-foreground/70">sem responsável</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 shrink-0">
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {(tipoLabels as any)?.[r.tipo_valor] || r.tipo_valor}
                      </Badge>
                      {r.prioridade !== "normal" && (
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]", PRIORIDADE_COR[r.prioridade])}
                        >
                          {r.prioridade}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_COR[r.status_valor])}
                      >
                        {(statusOpcoes as any)?.find((s: any) => s.valor === r.status_valor)
                          ?.label || r.status_valor}
                      </Badge>
                    </div>
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                        aria-label="Excluir report"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle>Detalhe do report</DialogTitle>
                <DialogDescription>
                  Reportado{" "}
                  {formatDistanceToNow(new Date(selecionado.reportado_em), {
                    locale: ptBR,
                    addSuffix: true,
                  })}{" "}
                  por {nomeDe(selecionado.reportado_por) || "autor desconhecido"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Responsável</Label>
                    <Select
                      value={selecionado.atribuido_a || "__none__"}
                      onValueChange={(v) =>
                        handleAtualizar({ atribuido_a: v === "__none__" ? null : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem responsável</SelectItem>
                        {(responsaveis || []).map((u: any) => (
                          <SelectItem key={u.user_id} value={u.user_id}>
                            {u.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={selecionado.status_valor}
                      onValueChange={(v) => handleAtualizar({ status_valor: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(statusOpcoes || []).map((s: any) => (
                          <SelectItem key={s.valor} value={s.valor}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Prioridade</Label>
                    <Select
                      value={selecionado.prioridade}
                      onValueChange={(v) => handleAtualizar({ prioridade: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Descrição do reportante</Label>
                  <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3 mt-1">
                    {selecionado.descricao}
                  </p>
                </div>

                {selecionado.passos_reproduzir && (
                  <div>
                    <Label className="text-xs">Passos para reproduzir</Label>
                    <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3 mt-1">
                      {selecionado.passos_reproduzir}
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-xs">Contexto técnico</Label>
                  <div className="rounded-md border bg-muted/30 p-3 mt-1 space-y-1 text-[11px]">
                    <p>
                      <strong>Rota:</strong>{" "}
                      <code className="text-foreground/80">{selecionado.rota}</code>
                    </p>
                    {selecionado.titulo_tela && (
                      <p>
                        <strong>Tela:</strong> {selecionado.titulo_tela}
                      </p>
                    )}
                    {selecionado.viewport_width && (
                      <p>
                        <strong>Viewport:</strong> {selecionado.viewport_width}px
                      </p>
                    )}
                    {selecionado.user_agent && (
                      <p className="break-all">
                        <strong>Agent:</strong>{" "}
                        <span className="text-muted-foreground">
                          {selecionado.user_agent}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Resposta ao reportante</Label>
                  <Textarea
                    value={respostaAdmin}
                    onChange={(e) => setRespostaAdmin(e.target.value)}
                    rows={3}
                    placeholder="Ex: Corrigido em 20/04. Obrigada pela sinalização!"
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => handleAtualizar({ resposta_admin: respostaAdmin })}
                    disabled={atualizar.isPending}
                  >
                    Salvar resposta
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
