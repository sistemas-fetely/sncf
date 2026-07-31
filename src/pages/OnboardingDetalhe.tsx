import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, Check, AlertTriangle, Loader2, ShieldAlert, ExternalLink, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SmartBackButton } from "@/components/SmartBackButton";

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  responsavel_role: string | null;
  responsavel_user_id: string | null;
  accountable_role: string | null;
  accountable_user_id: string | null;
  prazo_dias: number;
  prazo_data: string | null;
  status: string;
  concluida_em: string | null;
  concluida_por: string | null;
  area_destino: string | null;
  bloqueante: boolean | null;
  motivo_bloqueio: string | null;
  evidencia_texto: string | null;
  evidencia_url: string | null;
  origem_extensao_id: string | null;
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
};

type ExtensaoMeta = {
  id: string;
  dimensao: "cargo" | "departamento" | "sistema";
  referencia_label: string;
};

type Checklist = {
  id: string;
  colaborador_id: string | null;
  colaborador_tipo: string;
  status: string;
  concluido_em: string | null;
  coordenador_user_id: string | null;
  coordenador_nome: string | null;
  nome: string;
  cargo: string;
  departamento: string;
  tarefas: Tarefa[];
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin_rh: "Admin RH",
  gestor_rh: "Gestor RH",
  gestor_direto: "Gestor Direto",
  colaborador: "Colaborador",
  financeiro: "Financeiro",
};

function diasAtraso(prazoData: string): number {
  const prazo = new Date(prazoData + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  prazo.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - prazo.getTime()) / (1000 * 60 * 60 * 24));
}

export default function OnboardingDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userRoles: roles } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [extensoesMap, setExtensoesMap] = useState<Record<string, ExtensaoMeta>>({});
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  // Dialog conclusão
  const [tarefaAConcluir, setTarefaAConcluir] = useState<Tarefa | null>(null);
  const [observacao, setObservacao] = useState("");
  const [linkEvidencia, setLinkEvidencia] = useState("");

  const isHR = roles.some((r) => ["super_admin", "admin_rh", "gestor_rh"].includes(r));

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    if (!id) return;
    setLoading(true);

    const { data: cl, error } = await supabase
      .from("onboarding_checklists")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !cl) {
      toast.error("Onboarding não encontrado");
      setLoading(false);
      navigate("/onboarding");
      return;
    }

    // Tarefas
    const { data: tarefasData } = await supabase
      .from("vw_tarefas")
      .select("*")
      .eq("tipo_processo", "onboarding")
      .eq("processo_id", id)
      .order("prazo_dias", { ascending: true });

    const tarefas = (tarefasData || []) as any as Tarefa[];

    // Buscar metadados das extensões referenciadas
    const extensaoIds = Array.from(
      new Set(tarefas.map((t) => t.origem_extensao_id).filter((x): x is string => !!x))
    );
    if (extensaoIds.length > 0) {
      const { data: exts } = await (supabase as any)
        .from("sncf_template_extensoes")
        .select("id, dimensao, referencia_label")
        .in("id", extensaoIds);
      const map: Record<string, ExtensaoMeta> = {};
      (exts || []).forEach((e: any) => {
        map[e.id] = { id: e.id, dimensao: e.dimensao, referencia_label: e.referencia_label };
      });
      setExtensoesMap(map);
    } else {
      setExtensoesMap({});
    }

    // Nome / cargo / departamento
    let nome = "—", cargo = "—", departamento = "—";
    if (cl.colaborador_tipo === "clt" && cl.colaborador_id) {
      const { data } = await supabase
        .from("colaboradores_clt")
        .select("nome_completo, cargo, departamento")
        .eq("id", cl.colaborador_id)
        .maybeSingle();
      if (data) {
        nome = data.nome_completo;
        cargo = data.cargo;
        departamento = data.departamento;
      }
    } else if (cl.colaborador_tipo === "pj" && cl.colaborador_id) {
      const { data } = await supabase
        .from("contratos_pj")
        .select("contato_nome, tipo_servico, departamento")
        .eq("id", cl.colaborador_id)
        .maybeSingle();
      if (data) {
        nome = data.contato_nome;
        cargo = data.tipo_servico;
        departamento = data.departamento;
      }
    }

    setChecklist({
      ...(cl as any),
      nome,
      cargo,
      departamento,
      tarefas,
    });
    setLoading(false);
  }

  const stats = useMemo(() => {
    const tarefas = checklist?.tarefas || [];
    const total = tarefas.length;
    const concluidas = tarefas.filter((t) => t.status === "concluida").length;
    const atrasadas = tarefas.filter((t) => t.esta_atrasada).length;
    const atrasadasLegais = tarefas.filter((t) => t.bloqueante && t.esta_atrasada).length;
    const progress = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return { total, concluidas, atrasadas, atrasadasLegais, progress };
  }, [checklist]);

  const tarefasPorArea = useMemo(() => {
    const tarefas = checklist?.tarefas || [];
    return tarefas.reduce<Record<string, Tarefa[]>>((acc, t) => {
      const area = t.area_destino || "Geral";
      if (!acc[area]) acc[area] = [];
      acc[area].push(t);
      return acc;
    }, {});
  }, [checklist]);

  function isTarefaAtrasada(t: Tarefa) {
    return !!t.esta_atrasada;
  }

  function handleClickConcluir(tarefa: Tarefa) {
    if (tarefa.status === "concluida") return; // não reabre por aqui
    setTarefaAConcluir(tarefa);
    setObservacao("");
    setLinkEvidencia("");
  }

  async function confirmarConclusao() {
    if (!tarefaAConcluir || !user) return;
    if (observacao.trim().length < 5) {
      toast.error("Observação deve ter pelo menos 5 caracteres");
      return;
    }
    setUpdatingTask(tarefaAConcluir.id);
    const { error } = await supabase.rpc("concluir_tarefa", {
      p_tarefa_id: tarefaAConcluir.id,
      p_evidencia_texto: observacao.trim(),
      p_evidencia_url: linkEvidencia.trim() || null,
    });

    if (error) {
      toast.error("Erro ao concluir tarefa: " + formatError(error));
      setUpdatingTask(null);
      return;
    }

    // Verificar se concluiu o checklist inteiro
    if (checklist) {
      const updatedTarefas = checklist.tarefas.map((t) =>
        t.id === tarefaAConcluir.id
          ? {
              ...t,
              status: "concluida",
              concluida_em: new Date().toISOString(),
              concluida_por: user.id,
              evidencia_texto: observacao.trim(),
              evidencia_url: linkEvidencia.trim() || null,
            }
          : t,
      );
      const allDone = updatedTarefas.every((t) => t.status === "concluida");
      if (allDone && checklist.status !== "concluido") {
        await supabase
          .from("onboarding_checklists")
          .update({ status: "concluido", concluido_em: new Date().toISOString() } as any)
          .eq("id", checklist.id);
        await supabase.from("notificacoes_rh").insert({
          tipo: "onboarding_concluido",
          titulo: `Onboarding concluído: ${checklist.nome}`,
          mensagem: `Todas as tarefas de onboarding de ${checklist.nome} foram concluídas.`,
          link: "/onboarding",
          user_id: null,
        });
        toast.success("Onboarding concluído!");
      } else {
        toast.success("Tarefa concluída");
      }
    }

    setTarefaAConcluir(null);
    setObservacao("");
    setLinkEvidencia("");
    setUpdatingTask(null);
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!checklist) return null;

  const hasOverdue = stats.atrasadas > 0;
  const hojeStr = new Date().toISOString().split("T")[0];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="mb-2 -ml-2">
              <SmartBackButton fallback="/onboarding" fallbackLabel="Onboarding" />
            </div>
            <h1 className="text-2xl font-bold">{checklist.nome}</h1>
            <p className="text-muted-foreground text-sm">
              {checklist.cargo} · {checklist.departamento} · {checklist.colaborador_tipo?.toUpperCase()}
            </p>
          </div>
          <div className="text-right space-y-1">
            <Badge
              variant="outline"
              className={
                checklist.status === "concluido"
                  ? "bg-success/10 text-success border-0"
                  : hasOverdue
                  ? "bg-destructive/10 text-destructive border-0"
                  : "bg-info/10 text-info border-0"
              }
            >
              {checklist.status === "concluido" ? "Concluído" : hasOverdue ? "Com atrasos" : "Em andamento"}
            </Badge>
            {checklist.coordenador_nome && (
              <p className="text-xs text-muted-foreground">
                Coordenado por: <span className="text-foreground font-medium">{checklist.coordenador_nome}</span>
              </p>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total de tarefas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-success">{stats.concluidas}</p>
              <p className="text-xs text-muted-foreground">Concluídas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className={`text-3xl font-bold ${stats.atrasadas > 0 ? "text-destructive" : ""}`}>
                {stats.atrasadas}
              </p>
              <p className="text-xs text-muted-foreground">
                Atrasadas
                {stats.atrasadasLegais > 0 && (
                  <span className="text-destructive font-medium"> ({stats.atrasadasLegais} legal)</span>
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{stats.progress}%</p>
              <p className="text-xs text-muted-foreground mb-2">Progresso</p>
              <Progress value={stats.progress} className="h-2" />
            </CardContent>
          </Card>
        </div>

        {/* Barra geral */}
        <Progress value={stats.progress} className="h-3" />

        {/* Tarefas por área */}
        {Object.entries(tarefasPorArea).map(([area, tarefas]) => {
          const doneCount = tarefas.filter((t) => t.status === "concluida").length;
          const areaProgress = tarefas.length > 0 ? Math.round((doneCount / tarefas.length) * 100) : 0;
          const tarefasOrdenadas = [...tarefas].sort((a, b) => {
            if (a.bloqueante && !b.bloqueante) return -1;
            if (!a.bloqueante && b.bloqueante) return 1;
            return (a.prazo_data || "9999").localeCompare(b.prazo_data || "9999");
          });

          return (
            <Card key={area}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{area}</CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {doneCount}/{tarefas.length}
                    </span>
                    <Progress value={areaProgress} className="w-24 h-2" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {tarefasOrdenadas.map((t) => {
                  const atrasada = isTarefaAtrasada(t);
                  const atrasoLegal = atrasada && t.bloqueante;
                  const dias = t.dias_atraso ?? 0;

                  return (
                    <div
                      key={t.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        t.status === "concluida"
                          ? "bg-success/5 border-success/30"
                          : atrasoLegal
                          ? "bg-destructive/5 border-destructive"
                          : atrasada
                          ? "bg-warning/5 border-warning"
                          : t.bloqueante
                          ? "border-destructive/40"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <button
                        onClick={() => handleClickConcluir(t)}
                        disabled={t.status === "concluida" || updatingTask === t.id || (!isHR && t.responsavel_user_id !== user?.id)}
                        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          t.status === "concluida"
                            ? "bg-success border-success cursor-default"
                            : "border-border hover:border-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        }`}
                        aria-label="Concluir tarefa"
                      >
                        {t.status === "concluida" && <Check className="h-3 w-3 text-success-foreground" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`font-medium ${
                              t.status === "concluida" ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {t.titulo}
                          </p>
                          {t.bloqueante && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5 cursor-help gap-0.5">
                                  <ShieldAlert className="h-3 w-3" /> Legal
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">
                                  {t.motivo_bloqueio || "Tarefa com prazo legal"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {atrasada && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] border-0 gap-0.5 ${
                                atrasoLegal
                                  ? "bg-destructive text-destructive-foreground animate-pulse"
                                  : "bg-warning/15 text-warning"
                              }`}
                            >
                              {atrasoLegal && <ShieldAlert className="h-3 w-3" />}
                              {atrasoLegal ? "LEGAL — " : ""}Atrasada há {dias} dia{dias !== 1 ? "s" : ""}
                            </Badge>
                          )}
                          {t.origem_extensao_id && extensoesMap[t.origem_extensao_id] && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-0 gap-0.5 bg-success/15 text-success"
                            >
                              {extensoesMap[t.origem_extensao_id].dimensao === "cargo" && "Cargo: "}
                              {extensoesMap[t.origem_extensao_id].dimensao === "departamento" && "Depto: "}
                              {extensoesMap[t.origem_extensao_id].dimensao === "sistema" && "Sistema: "}
                              {extensoesMap[t.origem_extensao_id].referencia_label}
                            </Badge>
                          )}
                        </div>

                        {t.descricao && (
                          <p className="text-sm text-muted-foreground mt-0.5">{t.descricao}</p>
                        )}

                        {/* RACI info */}
                        <div className="flex items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                              {roleLabels[t.responsavel_role || ""] || t.responsavel_role || t.area_destino}
                            </Badge>
                            Execução
                          </span>
                          {t.accountable_role && (
                            <span className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-warning/10">
                                {roleLabels[t.accountable_role] || t.accountable_role}
                              </Badge>
                              Acompanhamento
                            </span>
                          )}
                          <span>
                            Prazo:{" "}
                            {t.prazo_data
                              ? format(new Date(t.prazo_data + "T00:00:00"), "dd/MM/yyyy")
                              : "—"}
                          </span>
                        </div>

                        {/* Evidência */}
                        {t.status === "concluida" && (
                          <div className="mt-2 p-2 rounded bg-success/5 border border-success/20 text-xs space-y-1">
                            <p className="text-success flex items-start gap-1">
                              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>
                                Concluída em{" "}
                                {t.concluida_em
                                  ? format(new Date(t.concluida_em), "dd/MM/yyyy 'às' HH:mm", {
                                      locale: ptBR,
                                    })
                                  : "—"}
                              </span>
                            </p>
                            {t.evidencia_texto && (
                              <p className="text-foreground pl-4">{t.evidencia_texto}</p>
                            )}
                            {t.evidencia_url && (
                              <a
                                href={t.evidencia_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 pl-4"
                              >
                                <ExternalLink className="h-3 w-3" /> Ver evidência
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}

        {/* Dialog conclusão */}
        <Dialog open={!!tarefaAConcluir} onOpenChange={(open) => !open && setTarefaAConcluir(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Concluir: {tarefaAConcluir?.titulo}</DialogTitle>
              <DialogDescription>Registre a evidência da conclusão para auditoria.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="obs">O que foi feito? *</Label>
                <Textarea
                  id="obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Email criado, acesso liberado, contrato assinado..."
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
                  placeholder="URL de comprovação"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTarefaAConcluir(null)}
                disabled={!!updatingTask}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarConclusao}
                disabled={!!updatingTask || observacao.trim().length < 5}
              >
                {updatingTask && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Concluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
