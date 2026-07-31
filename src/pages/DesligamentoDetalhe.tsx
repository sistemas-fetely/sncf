import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  ArrowLeft, UserX, CheckCircle2, AlertTriangle, Loader2, ExternalLink, Clock, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SmartBackButton } from "@/components/SmartBackButton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { humanizeError } from "@/lib/errorMessages";
import { formatError } from "@/lib/format-error";

import { cn } from "@/lib/utils";

interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  area_destino: string | null;
  responsavel_role: string | null;
  responsavel_user_id: string | null;
  accountable_role: string | null;
  prazo_dias: number;
  prazo_data: string | null;
  status: string;
  prioridade: string;
  bloqueante: boolean | null;
  motivo_bloqueio: string | null;
  evidencia_texto: string | null;
  evidencia_url: string | null;
  concluida_em: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
}

interface Checklist {
  id: string;
  colaborador_id: string | null;
  colaborador_tipo: string;
  status: string;
  tipo_processo: string;
  motivo: string | null;
  observacoes: string | null;
  data_efetivacao: string | null;
  aviso_previo: boolean | null;
  concluido_em: string | null;
  coordenador_nome: string | null;
}

const MOTIVO_LABELS: Record<string, string> = {
  sem_justa_causa: "Sem justa causa",
  com_justa_causa: "Com justa causa",
  pedido_demissao: "Pedido de demissão",
  acordo: "Acordo",
  fim_contrato: "Fim de contrato",
  fim_contrato_pj: "Fim do contrato",
  rescisao_empresa: "Rescisão pela empresa",
  rescisao_prestador: "Rescisão pelo prestador",
};

export default function DesligamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [colabNome, setColabNome] = useState("");

  // Conclusão
  const [tarefaAConcluir, setTarefaAConcluir] = useState<Tarefa | null>(null);
  const [evidenciaTexto, setEvidenciaTexto] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");

  const handleDeleteDesligamento = async () => {
    if (!checklist) return;
    const motivo = motivoExclusao.trim();
    if (!motivo) {
      toast.error("Informe o motivo da exclusão");
      return;
    }
    const { data, error } = await (supabase as any).rpc("excluir_checklist_processo", {
      p_checklist_id: checklist.id,
      p_motivo: motivo,
    });
    if (error) {
      toast.error(formatError(error));
      return;
    }

    // Reverter status do colaborador
    if (checklist.colaborador_id) {
      if (checklist.colaborador_tipo === "clt") {
        await supabase.from("colaboradores_clt")
          .update({ status: "ativo", data_desligamento: null })
          .eq("id", checklist.colaborador_id);
      } else {
        await supabase.from("contratos_pj")
          .update({ status: "ativo", data_fim: null })
          .eq("id", checklist.colaborador_id);
      }
    }
    const canceladas = (data as any)?.tarefas_canceladas ?? 0;
    toast.success(`Processo excluído. ${canceladas} tarefa${canceladas === 1 ? "" : "s"} cancelada${canceladas === 1 ? "" : "s"}.`);

    setShowDeleteDialog(false);
    navigate("/pessoas");
  };

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [cRes, tRes] = await Promise.all([
      supabase.from("onboarding_checklists").select("*").eq("id", id).maybeSingle(),
      supabase.from("vw_tarefas").select("*").eq("processo_id", id).order("prazo_data", { nullsFirst: false }),
    ]);
    if (cRes.error || !cRes.data) {
      toast.error("Processo não encontrado");
      navigate(-1);
      return;
    }
    const c = cRes.data as Checklist;
    setChecklist(c);
    setTarefas((tRes.data ?? []) as Tarefa[]);

    if (c.colaborador_id) {
      if (c.colaborador_tipo === "clt") {
        const { data } = await supabase.from("colaboradores_clt").select("nome_completo").eq("id", c.colaborador_id).maybeSingle();
        setColabNome(data?.nome_completo ?? "");
      } else {
        const { data } = await supabase.from("contratos_pj").select("contato_nome, razao_social").eq("id", c.colaborador_id).maybeSingle();
        setColabNome(data?.contato_nome || data?.razao_social || "");
      }
    }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { void carregar(); }, [carregar]);

  const stats = useMemo(() => {
    const total = tarefas.length;
    const concluidas = tarefas.filter((t) => t.status === "concluida").length;
    const atrasadas = tarefas.filter((t) => t.esta_atrasada).length;
    const legais = tarefas.filter((t) => t.bloqueante && t.status !== "concluida").length;
    const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return { total, concluidas, atrasadas, legais, pct };
  }, [tarefas]);

  const tarefasPorArea = useMemo(() => {
    const grupos = new Map<string, Tarefa[]>();
    tarefas.forEach((t) => {
      const area = t.area_destino ?? "Geral";
      const arr = grupos.get(area) ?? [];
      arr.push(t);
      grupos.set(area, arr);
    });
    return Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tarefas]);

  const confirmarConclusao = async () => {
    if (!tarefaAConcluir || evidenciaTexto.trim().length < 5) {
      toast.error("Descreva o que foi feito (mínimo 5 caracteres)");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("sncf_tarefas")
      .update({
        status: "concluida",
        concluida_em: new Date().toISOString(),
        concluida_por: user?.id,
        evidencia_texto: evidenciaTexto.trim(),
        evidencia_url: evidenciaUrl.trim() || null,
      })
      .eq("id", tarefaAConcluir.id);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Tarefa concluída");
      setTarefaAConcluir(null);
      setEvidenciaTexto("");
      setEvidenciaUrl("");
      void carregar();
    }
    setSalvando(false);
  };

  if (loading) {
    return (
      <div className="container mx-auto py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!checklist) return null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SmartBackButton fallback="/pessoas" fallbackLabel="Pessoas" />
        {isSuperAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-2"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4" /> Excluir desligamento
          </Button>
        )}
      </div>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
                <UserX className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-2xl">Desligamento de {colabNome || "—"}</CardTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline">{checklist.colaborador_tipo.toUpperCase()}</Badge>
                  {checklist.motivo && (
                    <Badge variant="secondary">{MOTIVO_LABELS[checklist.motivo] ?? checklist.motivo}</Badge>
                  )}
                  {checklist.aviso_previo && <Badge variant="outline">Aviso prévio</Badge>}
                  {checklist.status === "concluido" && (
                    <Badge className="bg-emerald-500">Concluído</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Data efetiva</p>
              <p className="font-semibold">
                {checklist.data_efetivacao
                  ? new Date(checklist.data_efetivacao + "T00:00:00").toLocaleDateString("pt-BR")
                  : "—"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {checklist.observacoes && (
            <p className="text-sm text-muted-foreground italic mb-3">"{checklist.observacoes}"</p>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso geral</span>
              <span className="font-semibold">{stats.concluidas}/{stats.total} ({stats.pct}%)</span>
            </div>
            <Progress value={stats.pct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-emerald-600">{stats.concluidas}</p>
          <p className="text-xs text-muted-foreground">Concluídas</p>
        </CardContent></Card>
        <Card className={stats.atrasadas > 0 ? "border-destructive" : ""}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-destructive">{stats.atrasadas}</p>
            <p className="text-xs text-muted-foreground">Atrasadas</p>
          </CardContent>
        </Card>
        <Card className={stats.legais > 0 ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : ""}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{stats.legais}</p>
            <p className="text-xs text-muted-foreground">Pendências legais</p>
          </CardContent>
        </Card>
      </div>

      {/* Tarefas agrupadas por área */}
      <div className="space-y-4">
        {tarefasPorArea.map(([area, lista]) => (
          <Card key={area}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{area}</CardTitle>
                <Badge variant="outline">
                  {lista.filter((t) => t.status === "concluida").length}/{lista.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lista.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border",
                    t.esta_atrasada
                      ? "bg-destructive/5 border-destructive/30"
                      : t.bloqueante && t.status !== "concluida"
                      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900"
                      : t.status === "concluida"
                      ? "bg-muted/30"
                      : "border-border",
                  )}
                >
                  <button
                    onClick={() => {
                      if (t.status !== "concluida") {
                        setTarefaAConcluir(t);
                        setEvidenciaTexto("");
                        setEvidenciaUrl("");
                      }
                    }}
                    className={cn(
                      "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                      t.status === "concluida"
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-muted-foreground/30 hover:border-emerald-400",
                    )}
                    aria-label="Concluir"
                  >
                    {t.status === "concluida" && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("font-medium text-sm", t.status === "concluida" && "line-through text-muted-foreground")}>
                        {t.titulo}
                      </span>
                      {t.bloqueante && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Legal
                        </Badge>
                      )}
                      {t.prioridade === "urgente" && <Badge variant="destructive" className="text-[10px]">Urgente</Badge>}
                      {t.status === "em_andamento" && <Badge className="text-[10px] bg-blue-500 hover:bg-blue-500/90">Em andamento</Badge>}
                      {t.esta_atrasada && (
                        <Badge variant="destructive" className="text-[10px]">
                          Atrasada{t.dias_atraso ? ` há ${t.dias_atraso}d` : ""}
                        </Badge>
                      )}
                    </div>
                    {t.descricao && <p className="text-xs text-muted-foreground mt-1">{t.descricao}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t.prazo_data ? new Date(t.prazo_data + "T00:00:00").toLocaleDateString("pt-BR") : "Sem prazo"}
                      </span>
                      {t.responsavel_role && <span>Resp: {t.responsavel_role}</span>}
                    </div>
                    {t.status === "concluida" && t.evidencia_texto && (
                      <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          Concluída em {t.concluida_em ? new Date(t.concluida_em).toLocaleDateString("pt-BR") : "—"}
                        </p>
                        <p className="text-xs mt-0.5">{t.evidencia_texto}</p>
                        {t.evidencia_url && (
                          <a
                            href={t.evidencia_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs inline-flex items-center gap-1 mt-1 hover:underline text-emerald-700"
                          >
                            Ver evidência <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog conclusão */}
      <Dialog open={!!tarefaAConcluir} onOpenChange={(o) => !o && setTarefaAConcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>{tarefaAConcluir?.titulo}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>O que foi feito? *</Label>
              <Textarea
                rows={3}
                value={evidenciaTexto}
                onChange={(e) => setEvidenciaTexto(e.target.value)}
                placeholder="Descreva brevemente..."
              />
            </div>
            <div>
              <Label>Link de evidência (opcional)</Label>
              <Input
                type="url"
                value={evidenciaUrl}
                onChange={(e) => setEvidenciaUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarefaAConcluir(null)}>Cancelar</Button>
            <Button onClick={confirmarConclusao} disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar conclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir desligamento (super_admin) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir desligamento permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O processo de desligamento de "{colabNome}" e todas as tarefas vinculadas serão excluídos.
              O status do colaborador será revertido para "ativo". Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDesligamento} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
