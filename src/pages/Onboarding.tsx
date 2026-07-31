import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, AlertTriangle, Loader2, TrendingUp, ShieldAlert, ExternalLink, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type Checklist = {
  id: string;
  colaborador_id: string | null;
  colaborador_tipo: string;
  convite_id: string | null;
  status: string;
  created_at: string;
  concluido_em: string | null;
  coordenador_user_id?: string | null;
  coordenador_nome?: string | null;
  nome?: string;
  cargo?: string;
  departamento?: string;
  tarefas?: Tarefa[];
};

type Tarefa = {
  id: string;
  checklist_id: string;
  titulo: string;
  descricao: string | null;
  responsavel_role: string;
  responsavel_user_id: string | null;
  prazo_dias: number;
  prazo_data: string | null;
  status: string;
  concluida_em: string | null;
  concluida_por: string | null;
  area_destino?: string | null;
  bloqueante?: boolean | null;
  motivo_bloqueio?: string | null;
  evidencia_texto?: string | null;
  evidencia_url?: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
};

const statusFilter = [
  { value: "todos", label: "Todos" },
  { value: "em_andamento", label: "Em Andamento" },
  { value: "atrasado", label: "Com atrasos" },
  { value: "concluido", label: "Concluído" },
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin_rh: "Admin RH",
  gestor_rh: "Gestor RH",
  gestor_direto: "Gestor Direto",
  colaborador: "Colaborador",
  financeiro: "Financeiro",
};

function diasAtraso(prazoData: string): number {
  const prazo = new Date(prazoData);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  prazo.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - prazo.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Onboarding() {
  const { user } = useAuth();
  const { userRoles: roles, isSuperAdmin } = usePermissions();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [filter, setFilter] = useState("todos");
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Checklist | null>(null);

  // Dialog de conclusão com evidência
  const [tarefaAConcluir, setTarefaAConcluir] = useState<Tarefa | null>(null);
  const [observacao, setObservacao] = useState("");
  const [linkEvidencia, setLinkEvidencia] = useState("");

  const isHR = roles.some((r) => ["super_admin", "admin_rh", "gestor_rh"].includes(r));
  const isGestor = roles.includes("gestor_direto");
  const isColaborador = !isHR && !isGestor;

  useEffect(() => {
    loadChecklists();
  }, []);

  async function loadChecklists() {
    setLoading(true);
    const { data: cls, error } = await supabase
      .from("onboarding_checklists")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar onboardings");
      setLoading(false);
      return;
    }

    // Load tarefas
    const ids = (cls || []).map((c: any) => c.id);
    let tarefasMap: Record<string, Tarefa[]> = {};
    let allTarefas: any[] = [];
    if (ids.length > 0) {
      const { data: tarefas, error: errTarefas } = await supabase
        .from("vw_tarefas")
        .select("*")
        .eq("tipo_processo", "onboarding")
        .in("processo_id", ids)
        .order("prazo_dias", { ascending: true });

      if (errTarefas) toast.error("Erro ao carregar tarefas: " + errTarefas.message);

      allTarefas = tarefas || [];

      allTarefas.forEach((t: any) => {
        const item = { ...t, checklist_id: t.processo_id };
        if (!tarefasMap[t.processo_id]) tarefasMap[t.processo_id] = [];
        tarefasMap[t.processo_id].push(item);
      });
    }

    // Load nomes
    const cltIds = (cls || []).filter((c: any) => c.colaborador_tipo === "clt" && c.colaborador_id).map((c: any) => c.colaborador_id);
    const pjIds = (cls || []).filter((c: any) => c.colaborador_tipo === "pj" && c.colaborador_id).map((c: any) => c.colaborador_id);

    let cltMap: Record<string, any> = {};
    let pjMap: Record<string, any> = {};

    if (cltIds.length > 0) {
      const { data } = await supabase.from("colaboradores_clt").select("id, nome_completo, cargo, departamento").in("id", cltIds);
      (data || []).forEach((c: any) => { cltMap[c.id] = c; });
    }
    if (pjIds.length > 0) {
      const { data } = await supabase.from("contratos_pj").select("id, contato_nome, tipo_servico, departamento").in("id", pjIds);
      (data || []).forEach((c: any) => { pjMap[c.id] = c; });
    }

    const enriched: Checklist[] = (cls || []).map((c: any) => {
      const tarefas = tarefasMap[c.id] || [];
      let nome = "—", cargo = "—", departamento = "—";
      if (c.colaborador_tipo === "clt" && cltMap[c.colaborador_id]) {
        const col = cltMap[c.colaborador_id];
        nome = col.nome_completo; cargo = col.cargo; departamento = col.departamento;
      } else if (c.colaborador_tipo === "pj" && pjMap[c.colaborador_id]) {
        const ct = pjMap[c.colaborador_id];
        nome = ct.contato_nome; cargo = ct.tipo_servico; departamento = ct.departamento;
      }
      return { ...c, nome, cargo, departamento, tarefas };
    });

    setChecklists(enriched);
    setLoading(false);
  }

  function getProgress(cl: Checklist) {
    const t = cl.tarefas || [];
    if (t.length === 0) return 0;
    return Math.round((t.filter((x) => x.status === "concluida").length / t.length) * 100);
  }

  function isTarefaAtrasada(t: Tarefa) {
    return !!t.esta_atrasada;
  }

  function hasOverdue(cl: Checklist) {
    return (cl.tarefas || []).some(isTarefaAtrasada);
  }

  function hasOverdueLegal(cl: Checklist) {
    return (cl.tarefas || []).some((t) => isTarefaAtrasada(t) && t.bloqueante);
  }

  function countOverdue(cl: Checklist) {
    return (cl.tarefas || []).filter(isTarefaAtrasada).length;
  }

  function countOverdueLegal(cl: Checklist) {
    return (cl.tarefas || []).filter((t) => isTarefaAtrasada(t) && t.bloqueante).length;
  }

  // Ordena tarefas: bloqueantes primeiro, depois por prazo_data
  function ordenarTarefas(tarefas: Tarefa[]): Tarefa[] {
    return [...tarefas].sort((a, b) => {
      if (a.bloqueante && !b.bloqueante) return -1;
      if (!a.bloqueante && b.bloqueante) return 1;
      const ad = a.prazo_data || "9999";
      const bd = b.prazo_data || "9999";
      return ad.localeCompare(bd);
    });
  }

  const filtered = checklists.filter((cl) => {
    if (filter === "todos") return true;
    if (filter === "concluido") return cl.status === "concluido";
    if (filter === "atrasado") return cl.status === "em_andamento" && hasOverdue(cl);
    return cl.status === "em_andamento" && !hasOverdue(cl);
  });

  // KPIs
  const totalAtivos = checklists.filter((c) => c.status === "em_andamento").length;
  const totalAtrasadas = checklists.reduce((acc, cl) => acc + countOverdue(cl), 0);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const concluidosMes = checklists.filter(
    (c) => c.status === "concluido" && c.concluido_em && new Date(c.concluido_em) >= inicioMes
  ).length;
  const totalConcluidasGeral = checklists.reduce(
    (acc, cl) => acc + (cl.tarefas || []).filter((t) => t.status === "concluida").length,
    0
  );
  const totalTarefasGeral = checklists.reduce((acc, cl) => acc + (cl.tarefas || []).length, 0);
  const percConclusaoGeral = totalTarefasGeral > 0 ? Math.round((totalConcluidasGeral / totalTarefasGeral) * 100) : 0;

  // Abrir dialog para concluir tarefa
  function handleClickConcluir(tarefa: Tarefa) {
    if (tarefa.status === "concluida") {
      // Reabrir tarefa direto, sem dialog
      reabrirTarefa(tarefa);
      return;
    }
    setTarefaAConcluir(tarefa);
    setObservacao("");
    setLinkEvidencia("");
  }

  async function reabrirTarefa(tarefa: Tarefa) {
    if (!user) return;
    setUpdatingTask(tarefa.id);
    const { error } = await supabase.from("sncf_tarefas").update({
      status: "pendente",
      concluida_em: null,
      concluida_por: null,
      evidencia_texto: null,
      evidencia_url: null,
    } as any).eq("id", tarefa.id);
    if (error) {
      toast.error("Erro ao reabrir tarefa");
    } else {
      await loadChecklists();
    }
    setUpdatingTask(null);
  }

  async function confirmarConclusao() {
    if (!tarefaAConcluir || !user) return;
    if (observacao.trim().length < 5) {
      toast.error("Observação deve ter pelo menos 5 caracteres");
      return;
    }
    setUpdatingTask(tarefaAConcluir.id);
    const { error } = await supabase.from("sncf_tarefas").update({
      status: "concluida",
      concluida_em: new Date().toISOString(),
      concluida_por: user.id,
      evidencia_texto: observacao.trim(),
      evidencia_url: linkEvidencia.trim() || null,
    } as any).eq("id", tarefaAConcluir.id);

    if (error) {
      toast.error("Erro ao concluir tarefa");
      setUpdatingTask(null);
      return;
    }

    toast.success("Tarefa concluída");
    await loadChecklists();
    setTarefaAConcluir(null);
    setObservacao("");
    setLinkEvidencia("");
    setUpdatingTask(null);
  }

  // (removido) openChecklist — agora navegamos para /onboarding/:id

  async function handleDeleteOnboarding() {
    if (!deleteTarget) return;
    const { data: tarefasIds } = await supabase
      .from("sncf_tarefas")
      .select("id")
      .eq("processo_id", deleteTarget.id);
    const ids = (tarefasIds || []).map((t: any) => t.id);
    if (ids.length > 0) {
      await supabase.from("sncf_tarefas_historico").delete().in("tarefa_id", ids);
    }
    await supabase.from("sncf_tarefas").delete().eq("processo_id", deleteTarget.id);
    const { error } = await supabase.from("onboarding_checklists").delete().eq("id", deleteTarget.id);
    if (error) toast.error(humanizeError(error.message));
    else {
      toast.success("Onboarding excluído");
      void loadChecklists();
    }
    setDeleteTarget(null);
  }

  // Colaborador view
  if (isColaborador) {
    const myChecklists = checklists.filter((cl) => cl.tarefas?.some((t) => t.responsavel_user_id === user?.id));
    const myTarefas = myChecklists.flatMap((cl) =>
      (cl.tarefas || []).filter((t) => t.responsavel_user_id === user?.id).map((t) => ({ ...t, checklistNome: cl.nome }))
    );
    const totalTarefas = myTarefas.length;
    const concluidas = myTarefas.filter((t) => t.status === "concluida").length;
    const progress = totalTarefas > 0 ? Math.round((concluidas / totalTarefas) * 100) : 0;

    return (
      <div className="p-4 max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold">Meu Onboarding</h1>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : myTarefas.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Nenhuma tarefa de onboarding pendente.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso</span>
                <span>{concluidas}/{totalTarefas}</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
            <div className="space-y-3">
              {ordenarTarefas(myTarefas).map((t) => (
                <Card key={t.id} className={isTarefaAtrasada(t) ? "border-warning" : ""}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Checkbox
                      checked={t.status === "concluida"}
                      disabled={updatingTask === t.id}
                      onCheckedChange={() => handleClickConcluir(t)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>
                          {t.titulo}
                        </p>
                        {t.bloqueante && (
                          <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5">
                            <ShieldAlert className="h-3 w-3 mr-0.5" /> Legal
                          </Badge>
                        )}
                      </div>
                      {t.descricao && <p className="text-xs text-muted-foreground mt-1">{t.descricao}</p>}
                      {t.prazo_data && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Prazo: {format(new Date(t.prazo_data), "dd/MM/yyyy")}
                        </p>
                      )}
                      {t.status === "concluida" && t.evidencia_texto && (
                        <p className="text-xs text-success mt-1">✓ {t.evidencia_texto}</p>
                      )}
                    </div>
                    {isTarefaAtrasada(t) && (
                      <Badge variant="outline" className={`text-xs border-0 ${t.bloqueante ? "bg-destructive/15 text-destructive animate-pulse" : "bg-warning/10 text-warning"}`}>
                        Atrasada {t.prazo_data ? `${diasAtraso(t.prazo_data)}d` : ""}
                      </Badge>
                    )}
                    {t.status === "concluida" && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
        <ConcluirTarefaDialog
          tarefa={tarefaAConcluir}
          observacao={observacao}
          linkEvidencia={linkEvidencia}
          setObservacao={setObservacao}
          setLinkEvidencia={setLinkEvidencia}
          onClose={() => setTarefaAConcluir(null)}
          onConfirm={confirmarConclusao}
          loading={!!updatingTask}
        />
      </div>
    );
  }

  // HR / Gestor view
  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Onboarding</h1>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilter.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalAtivos}</p>
              <p className="text-xs text-muted-foreground">Em andamento</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-info" />
            <div>
              <p className="text-2xl font-bold">{percConclusaoGeral}%</p>
              <p className="text-xs text-muted-foreground">Conclusão geral</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-warning" />
            <div>
              <p className="text-2xl font-bold">{totalAtrasadas}</p>
              <p className="text-xs text-muted-foreground">Tarefas atrasadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{concluidosMes}</p>
              <p className="text-xs text-muted-foreground">Concluídos este mês</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum onboarding encontrado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((cl) => {
            const progress = getProgress(cl);
            const overdue = hasOverdue(cl);
            const overdueLegal = hasOverdueLegal(cl);
            const totalT = (cl.tarefas || []).length;
            const concluidasT = (cl.tarefas || []).filter((t) => t.status === "concluida").length;
            const atrasadasT = countOverdue(cl);
            const atrasadasLegais = countOverdueLegal(cl);
            const porArea = (cl.tarefas || []).reduce((acc: Record<string, { total: number; done: number }>, t) => {
              const area = t.area_destino || "Geral";
              if (!acc[area]) acc[area] = { total: 0, done: 0 };
              acc[area].total++;
              if (t.status === "concluida") acc[area].done++;
              return acc;
            }, {});

            return (
              <Card
                key={cl.id}
                className="cursor-pointer hover:shadow-md transition-all"
                onClick={() => navigate(`/onboarding/${cl.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{cl.nome}</p>
                      <p className="text-sm text-muted-foreground truncate">{cl.cargo} · {cl.departamento}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {overdueLegal && (
                        <Badge className="bg-destructive text-destructive-foreground animate-pulse text-xs">
                          <ShieldAlert className="h-3 w-3 mr-0.5" /> Tarefa legal atrasada!
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          cl.status === "concluido"
                            ? "bg-success/10 text-success border-0"
                            : overdue
                            ? "bg-destructive/10 text-destructive border-0"
                            : "bg-info/10 text-info border-0"
                        }
                      >
                        {cl.status === "concluido" ? "Concluído" : overdue ? "Com atrasos" : "Em andamento"}
                      </Badge>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(cl); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <Progress value={progress} className="h-2" />

                  <div className="flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
                    <span>
                      {concluidasT} de {totalT} tarefas concluídas
                      {atrasadasT > 0 && !overdueLegal && (
                        <Badge variant="outline" className="ml-2 bg-warning/10 text-warning border-0 text-[10px]">
                          {atrasadasT} atrasada{atrasadasT > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {atrasadasLegais > 0 && (
                        <span className="ml-2 text-destructive font-medium">
                          {atrasadasLegais} legal{atrasadasLegais > 1 ? "s" : ""} atrasada{atrasadasLegais > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    {cl.coordenador_nome && <span>Coordenado por: {cl.coordenador_nome}</span>}
                  </div>

                  {Object.keys(porArea).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(porArea).map(([area, counts]) => (
                        <Badge
                          key={area}
                          variant="outline"
                          className={`text-[10px] ${counts.done === counts.total ? "bg-success/10 text-success border-0" : "bg-muted text-muted-foreground border-0"}`}
                        >
                          {area} {counts.done}/{counts.total}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir onboarding permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              O onboarding de "{deleteTarget?.nome}" e todas as tarefas vinculadas serão excluídos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOnboarding} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}

// ── Dialog de conclusão ──
function ConcluirTarefaDialog({
  tarefa,
  observacao,
  linkEvidencia,
  setObservacao,
  setLinkEvidencia,
  onClose,
  onConfirm,
  loading,
}: {
  tarefa: Tarefa | null;
  observacao: string;
  linkEvidencia: string;
  setObservacao: (v: string) => void;
  setLinkEvidencia: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={!!tarefa} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir: {tarefa?.titulo}</DialogTitle>
          <DialogDescription>
            Registre a evidência da conclusão para auditoria.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="obs">Observação de conclusão *</Label>
            <Textarea
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Descreva brevemente o que foi feito. Ex: Email criado, acesso liberado, contrato assinado..."
              rows={3}
              required
            />
            <p className="text-xs text-muted-foreground">Mínimo 5 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link">Link de evidência (opcional)</Label>
            <Input
              id="link"
              type="url"
              value={linkEvidencia}
              onChange={(e) => setLinkEvidencia(e.target.value)}
              placeholder="URL de comprovação (opcional)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={loading || observacao.trim().length < 5}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
