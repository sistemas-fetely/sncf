import { PageTitle } from "@/components/layout/PageTitle";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errorMessages";
import { formatError } from "@/lib/format-error";
import {
  ClipboardList, CheckCircle2, AlertTriangle, Clock, Eye, Inbox, Plus,
  Play, Pencil, X, MoreVertical, Users, ExternalLink, Filter,
  Flame, CheckSquare, UserPlus, Mail, PauseCircle, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { RadarOperacional } from "@/components/tarefas/RadarOperacional";
import { FilasOperacao } from "@/components/tarefas/FilasOperacao";
import { SubmeterNFDialog } from "@/components/minhas-notas/SubmeterNFDialog";
import { AprovarNFDialog } from "@/components/minhas-notas/AprovarNFDialog";
import { NovaTarefaDialog } from "@/components/tarefas/NovaTarefaDialog";
import { TarefaDetalheDrawer, type TarefaDrawer } from "@/components/tarefas/TarefaDetalheDrawer";


import { PageShell } from "@/components/layout/PageShell";
interface Tarefa {
  id: string;
  tipo_processo: string;
  sistema_origem: string;
  processo_id: string | null;
  colaborador_id: string | null;
  colaborador_tipo: string | null;
  colaborador_nome: string | null;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  area_destino: string | null;
  responsavel_role: string | null;
  responsavel_user_id: string | null;
  accountable_user_id: string | null;
  prazo_data: string | null;
  prazo_dias: number | null;
  status: string;
  concluida_em: string | null;
  bloqueante: boolean | null;
  evidencia_texto: string | null;
  evidencia_url: string | null;
  criado_por: string | null;
  created_at: string;
  // Derivados da view vw_tarefas
  esta_aberta?: boolean | null;
  esta_atrasada?: boolean | null;
  dias_atraso?: number | null;
  dias_restantes?: number | null;
}

type StatusFilter = "ativas" | "pendente" | "atrasadas" | "em_andamento" | "aguardando_terceiro" | "concluida" | "todas";
type AgrupamentoTipo = "prioridade" | "area" | "prazo" | "processo" | "nenhum";

interface PrioridadeDia {
  id: string;
  titulo: string;
  subtitulo: string;
  icone: typeof CheckSquare;
  prioridade: "urgente" | "atencao";
  botaoTexto: string;
  link: string;
}

const PRIORIDADE_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };

function diasDesdeISO(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function MinhasTarefas() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { roles: authRoles } = useAuth();
  const userRoles = authRoles;
  const isSuperAdmin = (authRoles ?? []).includes("super_admin");
  const isAdminRH = (authRoles ?? []).includes("admin_rh") || (authRoles ?? []).includes("rh" as never);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"minhas" | "acompanhamento">("minhas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ativas");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [sistemaFilter, setSistemaFilter] = useState<string>("todos");
  const [agrupamento, setAgrupamento] = useState<AgrupamentoTipo>("prioridade");
  const [prioridadesDia, setPrioridadesDia] = useState<PrioridadeDia[]>([]);

  // Conclusão
  const [concluirTarefa, setConcluirTarefa] = useState<Tarefa | null>(null);
  const [evidenciaTexto, setEvidenciaTexto] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Cancelar
  const [cancelarTarefa, setCancelarTarefa] = useState<Tarefa | null>(null);
  const [motivoCancelamentoTarefa, setMotivoCancelamentoTarefa] = useState("");

  // Cancelar com motivo (super_admin)
  const [deleteTarget, setDeleteTarget] = useState<Tarefa | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  // Submit NF (tarefa de emissao_nf)
  const [submeterNFTarefa, setSubmeterNFTarefa] = useState<Tarefa | null>(null);

  // Aprovar NF (tarefa de aprovacao_nf — RH)
  const [aprovarNFTarefa, setAprovarNFTarefa] = useState<Tarefa | null>(null);

  // Nova tarefa / editar tarefa manual
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);
  const [editarTarefa, setEditarTarefa] = useState<Tarefa | null>(null);

  // Drawer de detalhe
  const [drawerTarefa, setDrawerTarefa] = useState<Tarefa | null>(null);

  // Histórico: gravado automaticamente pelo gatilho trg_tarefa_historico no banco

  // Quem vê a seção "Prioridades do Dia"
  const isGestorRH = (userRoles as string[]).includes("gestor_rh");
  const isGestorDireto = (userRoles as string[]).includes("gestor_direto");
  const isColaboradorPuro = !isSuperAdmin && !isAdminRH && !isGestorRH && !isGestorDireto;
  const showPrioridadesRH = isSuperAdmin || isAdminRH || isGestorRH;

  const loadTarefas = useCallback(async () => {
    if (!user) return;
    setLoading(true);



    // Buscar tarefas: minhas (responsavel ou role) + acompanhamento (accountable)
    const filters: string[] = [`responsavel_user_id.eq.${user.id}`, `accountable_user_id.eq.${user.id}`];
    if (roles?.length) {
      filters.push(`responsavel_role.in.(${roles.join(",")})`);
    }

    const { data, error } = await supabase
      .from("vw_tarefas")
      .select("*")
      .or(filters.join(","))
      .order("prazo_data", { ascending: true, nullsFirst: false });

    if (error) {
      toast.error("Erro ao carregar tarefas: " + humanizeError(error.message));
      setTarefas([]);
    } else {
      setTarefas((data ?? []) as Tarefa[]);
    }
    setLoading(false);
  }, [user, roles]);

  useEffect(() => {
    void loadTarefas();
  }, [loadTarefas]);

  // Carregar "Prioridades do Dia" — ações operacionais (não-tarefa)
  const loadPrioridadesDia = useCallback(async () => {
    if (!user) return;
    if (isColaboradorPuro) {
      setPrioridadesDia([]);
      return;
    }

    const lista: PrioridadeDia[] = [];

    // Tarefas legais bloqueantes atrasadas — todos os perfis (gestor direto, RH, super)
    const { data: tarefasLegais } = await supabase
      .from("vw_tarefas")
      .select("id, titulo, prazo_data, processo_id, tipo_processo, colaborador_nome")
      .eq("bloqueante", true)
      .eq("esta_atrasada", true)
      .or(`responsavel_user_id.eq.${user.id},accountable_user_id.eq.${user.id}`);

    if (tarefasLegais && tarefasLegais.length > 0) {
      const primeiro = tarefasLegais[0];
      const link =
        primeiro.tipo_processo === "onboarding" && primeiro.processo_id
          ? `/onboarding/${primeiro.processo_id}`
          : "/tarefas";
      lista.push({
        id: "legais-atrasadas",
        titulo: `${tarefasLegais.length} tarefa${tarefasLegais.length > 1 ? "s" : ""} LEGAL${tarefasLegais.length > 1 ? "IS" : ""} atrasada${tarefasLegais.length > 1 ? "s" : ""} — risco de multa`,
        subtitulo: "Prazo legal ultrapassado",
        icone: AlertTriangle,
        prioridade: "urgente",
        botaoTexto: "Resolver",
        link,
      });
    }

    // Demais prioridades só para RH (super_admin, admin_rh, gestor_rh)
    if (showPrioridadesRH) {
      // 1. Convites aguardando aprovação
      const { data: aguardAprov } = await supabase
        .from("convites_cadastro")
        .select("id, nome")
        .eq("status", "preenchido");
      if (aguardAprov && aguardAprov.length > 0) {
        const primeiro = aguardAprov[0];
        lista.push({
          id: "convites-aprovacao",
          titulo: `${aguardAprov.length} cadastro${aguardAprov.length > 1 ? "s" : ""} aguardando aprovação`,
          subtitulo: aguardAprov.slice(0, 3).map((c) => c.nome).join(", ") +
            (aguardAprov.length > 3 ? "..." : ""),
          icone: CheckSquare,
          prioridade: "atencao",
          botaoTexto: "Aprovar",
          link: aguardAprov.length === 1 ? `/convites-cadastro/${primeiro.id}` : "/convites-cadastro?filter=preenchido",
        });
      }

      // 2. Convites aprovados aguardando criação
      const { data: aprovados } = await supabase
        .from("convites_cadastro")
        .select("id, nome, tipo")
        .eq("status", "aprovado");
      if (aprovados && aprovados.length > 0) {
        const primeiro = aprovados[0];
        lista.push({
          id: "colab-criacao",
          titulo: `${aprovados.length} colaborador${aprovados.length > 1 ? "es" : ""} aprovado${aprovados.length > 1 ? "s" : ""} aguardando criação`,
          subtitulo: aprovados.slice(0, 3).map((c) => c.nome).join(", ") +
            (aprovados.length > 3 ? "..." : ""),
          icone: UserPlus,
          prioridade: "urgente",
          botaoTexto: "Criar",
          link: aprovados.length === 1 ? `/convites-cadastro/${primeiro.id}` : "/convites-cadastro?filter=aprovado",
        });
      }

      // 3. Candidatos para triagem
      const { data: candTriagem } = await supabase
        .from("candidatos")
        .select("id, nome, vaga_id")
        .eq("status", "recebido");
      if (candTriagem && candTriagem.length > 0) {
        const primeiro = candTriagem[0];
        lista.push({
          id: "cand-triagem",
          titulo: `${candTriagem.length} candidato${candTriagem.length > 1 ? "s" : ""} para triagem`,
          subtitulo: candTriagem.slice(0, 3).map((c) => c.nome).join(", ") +
            (candTriagem.length > 3 ? "..." : ""),
          icone: Users,
          prioridade: "atencao",
          botaoTexto: "Triar",
          link: candTriagem.length === 1 && primeiro.vaga_id ? `/recrutamento/${primeiro.vaga_id}` : "/recrutamento",
        });
      }

      // 4. Convites sem preenchimento há +5 dias
      const cincoDiasAtras = new Date();
      cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5);
      const { data: enviadosVelhos } = await supabase
        .from("convites_cadastro")
        .select("id, nome, created_at")
        .eq("status", "email_enviado")
        .lt("created_at", cincoDiasAtras.toISOString());
      if (enviadosVelhos && enviadosVelhos.length > 0) {
        lista.push({
          id: "convites-velhos",
          titulo: `${enviadosVelhos.length} convite${enviadosVelhos.length > 1 ? "s" : ""} sem preenchimento há +5 dias`,
          subtitulo: enviadosVelhos.slice(0, 3).map((c) => c.nome).join(", ") +
            (enviadosVelhos.length > 3 ? "..." : ""),
          icone: Mail,
          prioridade: "atencao",
          botaoTexto: "Ver",
          link: "/convites-cadastro?filter=email_enviado",
        });
      }
    }

    // Ordenar: urgente primeiro
    lista.sort((a, b) => {
      if (a.prioridade === b.prioridade) return 0;
      return a.prioridade === "urgente" ? -1 : 1;
    });
    setPrioridadesDia(lista);
  }, [user, isColaboradorPuro, showPrioridadesRH]);

  useEffect(() => {
    void loadPrioridadesDia();
  }, [loadPrioridadesDia]);

  // Separar minhas vs acompanhamento
  const { minhasTarefas, tarefasAcompanhamento } = useMemo(() => {
    const minhas: Tarefa[] = [];
    const acomp: Tarefa[] = [];
    for (const t of tarefas) {
      const ehResponsavel =
        t.responsavel_user_id === user?.id ||
        (t.responsavel_role && roles?.includes(t.responsavel_role as never));
      const ehAccountable = t.accountable_user_id === user?.id;
      if (ehResponsavel) minhas.push(t);
      else if (ehAccountable) acomp.push(t);
    }
    return { minhasTarefas: minhas, tarefasAcompanhamento: acomp };
  }, [tarefas, user, roles]);

  // Filtros aplicados
  const aplicarFiltros = (lista: Tarefa[]) =>
    lista.filter((t) => {
      // status
      if (statusFilter === "ativas" && !["pendente", "em_andamento", "aguardando_terceiro"].includes(t.status)) return false;
      if (statusFilter === "atrasadas" && !t.esta_atrasada) return false;
      if (["pendente", "em_andamento", "aguardando_terceiro", "concluida"].includes(statusFilter) && t.status !== statusFilter) return false;
      // tipo
      if (tipoFilter !== "todos" && t.tipo_processo !== tipoFilter) return false;
      // sistema
      if (sistemaFilter !== "todos" && t.sistema_origem !== sistemaFilter) return false;
      return true;
    });

  const minhasFiltradas = aplicarFiltros(minhasTarefas);
  const acompanhamentoFiltradas = aplicarFiltros(tarefasAcompanhamento);

  // KPIs (sobre minhasTarefas — execução do usuário)
  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0];
    const pendentes = minhasTarefas.filter((t) => t.status === "pendente").length;
    const atrasadas = minhasTarefas.filter((t) => t.esta_atrasada).length;
    const emAndamento = minhasTarefas.filter((t) => t.status === "em_andamento").length;
    const concluidasHoje = minhasTarefas.filter(
      (t) => t.status === "concluida" && t.concluida_em?.startsWith(hoje),
    ).length;
    return {
      pendentes,
      atrasadas,
      emAndamento,
      concluidasHoje,
      acompanhamento: tarefasAcompanhamento.filter((t) => !["concluida", "cancelada"].includes(t.status)).length,
    };
  }, [minhasTarefas, tarefasAcompanhamento]);

  // Ações
  const handleConcluir = (t: Tarefa) => {
    if (t.tipo_processo === "emissao_nf" || t.tipo_processo === "correcao_nf") {
      setSubmeterNFTarefa(t);
      return;
    }
    if (t.tipo_processo === "aprovacao_nf") {
      setAprovarNFTarefa(t);
      return;
    }
    setConcluirTarefa(t);
    setEvidenciaTexto("");
    setEvidenciaUrl("");
  };

  const extrairCompetencia = (titulo: string): string => {
    const match = titulo.match(/(\d{4}-\d{2})/);
    return match ? match[1] : new Date().toISOString().slice(0, 7);
  };

  const confirmarConclusao = async () => {
    if (!concluirTarefa) return;
    setSalvando(true);
    
    const { error } = await supabase.rpc("concluir_tarefa", {
      p_tarefa_id: concluirTarefa.id,
      p_evidencia_texto: evidenciaTexto.trim() || undefined,
      p_evidencia_url: evidenciaUrl.trim() || undefined,
    });

    if (error) toast.error("Erro: " + (error.message || humanizeError(error.message)));
    else {
      toast.success("Tarefa concluída!");
      setConcluirTarefa(null);
      void loadTarefas();
    }
    setSalvando(false);
  };

  const handleIniciar = async (t: Tarefa) => {
    const { error } = await supabase.rpc("transicionar_tarefa", {
      p_tarefa_id: t.id,
      p_novo_status: "em_andamento",
    });
    if (error) toast.error("Erro: " + humanizeError(formatError(error)));
    else {
      toast.success("Tarefa iniciada! Agora aparece em 'Ativas' como 'Em andamento'.");
      void loadTarefas();
    }
  };

  const handleAguardando = async (t: Tarefa) => {
    const { error } = await supabase.rpc("transicionar_tarefa", {
      p_tarefa_id: t.id,
      p_novo_status: "aguardando_terceiro",
    });
    if (error) toast.error("Erro: " + humanizeError(formatError(error)));
    else {
      toast.success("Tarefa em espera.");
      void loadTarefas();
    }
  };

  const handleRetomar = async (t: Tarefa) => {
    const { error } = await supabase.rpc("transicionar_tarefa", {
      p_tarefa_id: t.id,
      p_novo_status: "em_andamento",
    });
    if (error) toast.error("Erro: " + humanizeError(formatError(error)));
    else {
      toast.success("Tarefa retomada!");
      void loadTarefas();
    }
  };

  const confirmarCancelamento = async () => {
    if (!cancelarTarefa || !motivoCancelamentoTarefa.trim()) return;
    const { error } = await supabase.rpc("cancelar_tarefa", {
      p_tarefa_id: cancelarTarefa.id,
      p_motivo: motivoCancelamentoTarefa.trim(),
    });
    if (error) toast.error("Erro: " + humanizeError(formatError(error)));
    else {
      toast.success("Tarefa cancelada");
      setCancelarTarefa(null);
      setMotivoCancelamentoTarefa("");
      void loadTarefas();
    }
  };

  const handleCancelarComMotivo = async () => {
    if (!deleteTarget || !motivoCancelamento.trim()) return;
    const { error } = await supabase.rpc("cancelar_tarefa", {
      p_tarefa_id: deleteTarget.id,
      p_motivo: motivoCancelamento.trim(),
    });
    if (error) toast.error("Erro ao cancelar: " + humanizeError(error.message));
    else {
      toast.success("Tarefa cancelada");
      void loadTarefas();
    }
    setDeleteTarget(null);
    setMotivoCancelamento("");
  };

  // Agrupamento
  const agrupar = (lista: Tarefa[]): Array<{ nome: string; tarefas: Tarefa[] }> => {
    if (agrupamento === "nenhum") {
      const ordenadas = [...lista].sort((a, b) => {
        const pa = PRIORIDADE_ORDER[a.prioridade] ?? 9;
        const pb = PRIORIDADE_ORDER[b.prioridade] ?? 9;
        if (pa !== pb) return pa - pb;
        return (a.prazo_data ?? "9999").localeCompare(b.prazo_data ?? "9999");
      });
      return [{ nome: "Todas", tarefas: ordenadas }];
    }

    const grupos = new Map<string, Tarefa[]>();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (const t of lista) {
      let chave = "Outros";
      if (agrupamento === "prioridade") {
        const map: Record<string, string> = {
          urgente: "🔴 Urgente",
          alta: "🟠 Alta",
          normal: "🟡 Normal",
          baixa: "🟢 Baixa",
        };
        chave = map[t.prioridade] ?? "Sem prioridade";
      } else if (agrupamento === "area") {
        chave = t.area_destino ? t.area_destino.toUpperCase() : "Geral";
      } else if (agrupamento === "prazo") {
        if (!t.prazo_data) chave = "Sem prazo";
        else {
          const prazo = new Date(t.prazo_data + "T00:00:00");
          const diff = Math.floor((prazo.getTime() - hoje.getTime()) / 86400000);
          if (diff < 0) chave = "🔴 Atrasadas";
          else if (diff === 0) chave = "🟠 Hoje";
          else if (diff <= 7) chave = "🟡 Esta semana";
          else if (diff <= 14) chave = "🔵 Próxima semana";
          else chave = "📅 Mais tarde";
        }
      } else if (agrupamento === "processo") {
        const map: Record<string, string> = {
          onboarding: "Onboarding",
          manual: "Tarefas Manuais",
          manutencao: "Manutenção",
        };
        chave = map[t.tipo_processo] ?? t.tipo_processo;
      }
      const arr = grupos.get(chave) ?? [];
      arr.push(t);
      grupos.set(chave, arr);
    }

    // Ordem dos grupos
    const ordemPrioridade = ["🔴 Urgente", "🟠 Alta", "🟡 Normal", "🟢 Baixa"];
    const ordemPrazo = ["🔴 Atrasadas", "🟠 Hoje", "🟡 Esta semana", "🔵 Próxima semana", "📅 Mais tarde", "Sem prazo"];
    const ordem = agrupamento === "prioridade" ? ordemPrioridade : agrupamento === "prazo" ? ordemPrazo : null;

    const entries = Array.from(grupos.entries()).map(([nome, tarefas]) => ({
      nome,
      tarefas: tarefas.sort((a, b) => (a.prazo_data ?? "9999").localeCompare(b.prazo_data ?? "9999")),
    }));

    if (ordem) {
      entries.sort((a, b) => {
        const ia = ordem.indexOf(a.nome);
        const ib = ordem.indexOf(b.nome);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    } else {
      entries.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    return entries;
  };

  const renderTarefa = (tarefa: Tarefa) => {
    const diasAtraso = tarefa.dias_atraso ?? 0;

    return (
      <div
        key={tarefa.id}
        onClick={() => setDrawerTarefa(tarefa)}
        className={cn(
          "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
          tarefa.esta_atrasada
            ? "bg-destructive/5 border-destructive/30 hover:bg-destructive/10"
            : tarefa.bloqueante
            ? "bg-warning/10 border-warning/40 hover:bg-warning/50"
            : tarefa.status === "concluida"
            ? "bg-muted/30 border-border"
            : "hover:bg-muted/50 border-border",
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleConcluir(tarefa); }}
          disabled={tarefa.status === "concluida"}
          className={cn(
            "mt-1 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
            tarefa.status === "concluida"
              ? "bg-success border-success/40"
              : "border-muted-foreground/30 hover:border-success/40",
          )}
          aria-label="Concluir tarefa"
        >
          {tarefa.status === "concluida" && <CheckCircle2 className="h-3 w-3 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={cn(
                "font-medium text-sm",
                tarefa.status === "concluida" && "line-through text-muted-foreground",
              )}
            >
              {tarefa.titulo}
            </p>
            {tarefa.bloqueante && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                ⚠ Legal
              </Badge>
            )}
            {tarefa.prioridade === "urgente" && (
              <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
            )}
            {tarefa.tipo_processo !== "manual" && (
              <Badge variant="secondary" className="text-[10px]">{tarefa.tipo_processo}</Badge>
            )}
            {tarefa.tipo_processo === "manual" && (
              <Badge variant="outline" className="text-[10px]">Manual</Badge>
            )}
            {tarefa.status === "pendente" && (
              <Badge variant="secondary" className="text-[10px]">Pendente</Badge>
            )}
            {tarefa.esta_atrasada && (
              <Badge variant="destructive" className="text-[10px]">
                Atrasada {diasAtraso > 0 ? `há ${diasAtraso} dia${diasAtraso !== 1 ? "s" : ""}` : ""}
              </Badge>
            )}
            {tarefa.status === "em_andamento" && (
              <Badge className="text-[10px] bg-info hover:bg-info/90">Em andamento</Badge>
            )}
            {tarefa.status === "aguardando_terceiro" && (
              <Badge className="text-[10px] bg-warning hover:bg-warning/90 gap-1">
                <PauseCircle className="h-2.5 w-2.5" /> Aguardando
              </Badge>
            )}
          </div>

          {tarefa.descricao && (
            <p className="text-xs text-muted-foreground mt-1">{tarefa.descricao}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {tarefa.colaborador_nome && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {tarefa.colaborador_nome}
              </span>
            )}
            {tarefa.area_destino && (
              <Badge variant="outline" className="text-[10px]">{tarefa.area_destino}</Badge>
            )}
            {tarefa.sistema_origem && tarefa.sistema_origem !== "manual" && (
              <Badge variant="outline" className="text-[10px]">
                {tarefa.sistema_origem === "people"
                  ? "People"
                  : tarefa.sistema_origem === "ti"
                  ? "TI"
                  : tarefa.sistema_origem}
              </Badge>
            )}
            <span>
              Prazo: {tarefa.prazo_data ? new Date(tarefa.prazo_data + "T00:00:00").toLocaleDateString("pt-BR") : "Sem prazo"}
            </span>
            {tarefa.created_at && (
              <span>Criada: {new Date(tarefa.created_at).toLocaleDateString("pt-BR")}</span>
            )}
          </div>

          {tarefa.status === "concluida" && tarefa.evidencia_texto && (
            <div className="mt-2 p-2 rounded bg-success/10 border border-success/40">
              <p className="text-[11px] font-medium text-success">
                Concluída em{" "}
                {tarefa.concluida_em
                  ? new Date(tarefa.concluida_em).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
              <p className="text-xs mt-0.5">{tarefa.evidencia_texto}</p>
              {tarefa.evidencia_url && (
                <a
                  href={tarefa.evidencia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs inline-flex items-center gap-1 mt-1 hover:underline text-success"
                >
                  Ver evidência <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-end gap-2">
          {/* Barra de ações rápidas */}
          {!["concluida", "cancelada"].includes(tarefa.status) && (
            <div className="flex gap-1 flex-wrap justify-end">
              {tarefa.status === "pendente" && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-success/40 text-success hover:bg-success/10"
                  onClick={() => handleIniciar(tarefa)}>
                  <Play className="h-3 w-3" /> Iniciar
                </Button>
              )}
              {tarefa.status === "em_andamento" && (
                <>
                  <Button size="sm" className="h-7 gap-1 text-xs bg-success hover:bg-success text-white"
                    onClick={() => handleConcluir(tarefa)}>
                    <CheckCircle2 className="h-3 w-3" /> Concluir
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-warning/40 text-warning hover:bg-warning/10"
                    onClick={() => handleAguardando(tarefa)}>
                    <PauseCircle className="h-3 w-3" /> Aguardando
                  </Button>
                </>
              )}
              {tarefa.status === "aguardando_terceiro" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs border-info/40 text-info hover:bg-info/10"
                    onClick={() => handleRetomar(tarefa)}>
                    <Play className="h-3 w-3" /> Retomar
                  </Button>
                  <Button size="sm" className="h-7 gap-1 text-xs bg-success hover:bg-success text-white"
                    onClick={() => handleConcluir(tarefa)}>
                    <CheckCircle2 className="h-3 w-3" /> Concluir
                  </Button>
                </>
              )}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tarefa.tipo_processo === "manual" && tarefa.criado_por === user?.id
                && tarefa.status !== "concluida" && tarefa.status !== "cancelada" && (
                <DropdownMenuItem className="gap-2" onClick={() => setEditarTarefa(tarefa)}>
                  <Pencil className="h-4 w-4" /> Editar
                </DropdownMenuItem>
              )}
              {tarefa.status !== "concluida" && tarefa.status !== "cancelada" && (
                <DropdownMenuItem onClick={() => setCancelarTarefa(tarefa)}
                  className="gap-2 text-destructive focus:text-destructive">
                  <X className="h-4 w-4" /> Cancelar
                </DropdownMenuItem>
              )}
              {tarefa.processo_id && tarefa.tipo_processo === "onboarding" && (
                <DropdownMenuItem
                  onClick={() => navigate(`/onboarding/${tarefa.processo_id}`, { state: { from: "/tarefas", fromLabel: "Minhas Tarefas" } })}
                  className="gap-2">
                  <Eye className="h-4 w-4" /> Ver onboarding
                </DropdownMenuItem>
              )}
              {isSuperAdmin && (
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(tarefa)}
                >
                  <Trash2 className="h-4 w-4" /> Cancelar tarefa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const renderTarefasAgrupadas = (lista: Tarefa[]) => {
    if (lista.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 mx-auto mb-3 text-success" />
            <p className="text-lg font-medium">Inbox zero!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Todas as suas tarefas estão em dia.
            </p>
          </CardContent>
        </Card>
      );
    }

    const grupos = agrupar(lista);
    return (
      <div className="space-y-4">
        {grupos.map((g) => (
          <Card key={g.nome}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{g.nome}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {g.tarefas.length} {g.tarefas.length === 1 ? "tarefa" : "tarefas"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">{g.tarefas.map(renderTarefa)}</CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <PageShell>
      <PageTitle
        titulo="Inbox"
        estado="Visão unificada de todas as suas pendências"
        acoes={
          <Button className="gap-2" onClick={() => setNovaTarefaOpen(true)}>
            <Plus className="h-4 w-4" /> Nova Tarefa
          </Button>
        }
      />

      {/* Radar operacional — indicadores que migraram do Dash Op */}
      <RadarOperacional />

      {/* Prioridades do Dia — ações operacionais (não-tarefa) */}
      {!isColaboradorPuro && prioridadesDia.length > 0 && (
        <Card className="border-l-4 border-l-warning/40 bg-warning/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-warning" /> Prioridades do Dia
              <Badge variant="outline" className="ml-auto text-[10px]">
                {prioridadesDia.length} pendência{prioridadesDia.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Ações operacionais que precisam da sua atenção hoje
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {prioridadesDia.map((p) => {
              const Icone = p.icone;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => navigate(p.link)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        p.prioridade === "urgente" ? "bg-destructive/10" : "bg-warning/10"
                      )}
                    >
                      <Icone
                        className={cn(
                          "h-4 w-4",
                          p.prioridade === "urgente" ? "text-destructive" : "text-warning"
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{p.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.subtitulo}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={p.prioridade === "urgente" ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(p.link);
                    }}
                    className={p.prioridade === "urgente" ? "bg-destructive text-white hover:opacity-90" : ""}
                  >
                    {p.botaoTexto}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Minhas tarefas
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-warning" />
            <p className="text-2xl font-medium">{kpis.pendentes}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-medium text-destructive">{kpis.atrasadas}</p>
            <p className="text-xs text-muted-foreground">Atrasadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Play className="h-5 w-5 mx-auto mb-1 text-info" />
            <p className="text-2xl font-medium">{kpis.emAndamento}</p>
            <p className="text-xs text-muted-foreground">Em andamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-success" />
            <p className="text-2xl font-medium">{kpis.concluidasHoje}</p>
            <p className="text-xs text-muted-foreground">Concluídas hoje</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="h-5 w-5 mx-auto mb-1 text-info" />
            <p className="text-2xl font-medium">{kpis.acompanhamento}</p>
            <p className="text-xs text-muted-foreground">Acompanhamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Filtros
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativas">Ativas (abertas)</SelectItem>
                  <SelectItem value="pendente">Pendentes</SelectItem>
                  <SelectItem value="atrasadas">Atrasadas</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="aguardando_terceiro">Aguardando terceiro</SelectItem>
                  <SelectItem value="concluida">Concluídas</SelectItem>
                  <SelectItem value="todas">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sistema</Label>
              <Select value={sistemaFilter} onValueChange={setSistemaFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="people">People Fetely</SelectItem>
                  <SelectItem value="ti">TI Fetely</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Agrupar por</Label>
              <Select value={agrupamento} onValueChange={(v) => setAgrupamento(v as AgrupamentoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prioridade">Prioridade</SelectItem>
                  <SelectItem value="area">Área</SelectItem>
                  <SelectItem value="prazo">Prazo</SelectItem>
                  <SelectItem value="processo">Processo</SelectItem>
                  <SelectItem value="nenhum">Sem agrupamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "minhas" | "acompanhamento")}>
        <TabsList>
          <TabsTrigger value="minhas" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Minha execução
            {kpis.pendentes + kpis.atrasadas > 0 && (
              <Badge variant="secondary" className="ml-1">{kpis.pendentes + kpis.atrasadas}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="acompanhamento" className="gap-2">
            <Eye className="h-4 w-4" /> Acompanhamento
            {kpis.acompanhamento > 0 && (
              <Badge variant="secondary" className="ml-1">{kpis.acompanhamento}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="minhas" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
          ) : (
            renderTarefasAgrupadas(minhasFiltradas)
          )}
        </TabsContent>
        <TabsContent value="acompanhamento" className="mt-4">
          {loading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
          ) : (
            renderTarefasAgrupadas(acompanhamentoFiltradas)
          )}
        </TabsContent>
      </Tabs>

      {/* Filas da operação — inbox único */}
      <FilasOperacao />



      {/* Dialog de conclusão */}
      <AlertDialog open={!!concluirTarefa} onOpenChange={(open) => { if (!open) setConcluirTarefa(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir: {concluirTarefa?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>
              {concluirTarefa?.colaborador_nome && `Colaborador: ${concluirTarefa.colaborador_nome}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-sm">Comentário de conclusão (opcional)</Label>
              <Textarea
                value={evidenciaTexto}
                onChange={(e) => setEvidenciaTexto(e.target.value)}
                placeholder="Se quiser, registre brevemente o que foi feito..."
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarConclusao}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Concluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de cancelamento */}
      <AlertDialog open={!!cancelarTarefa} onOpenChange={(open) => { if (!open) { setCancelarTarefa(null); setMotivoCancelamentoTarefa(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar "{cancelarTarefa?.titulo}"? O motivo fica registrado no histórico da tarefa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-cancelar-tarefa">Motivo *</Label>
            <Textarea
              id="motivo-cancelar-tarefa"
              value={motivoCancelamentoTarefa}
              onChange={(e) => setMotivoCancelamentoTarefa(e.target.value)}
              placeholder="Por que esta tarefa está sendo cancelada?"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarCancelamento}
              disabled={!motivoCancelamentoTarefa.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar tarefa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de cancelamento com motivo (super_admin) */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setMotivoCancelamento("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa "{deleteTarget?.titulo}" será cancelada. O histórico é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="motivo-cancelamento">Motivo do cancelamento *</Label>
            <Textarea
              id="motivo-cancelamento"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Explique por que a tarefa está sendo cancelada"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!motivoCancelamento.trim()}
              onClick={(e) => {
                e.preventDefault();
                void handleCancelarComMotivo();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar tarefa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Dialog de submissão de NF (tarefa emissao_nf) */}
      {submeterNFTarefa && (
        <SubmeterNFDialog
          open={!!submeterNFTarefa}
          onOpenChange={(o) => {
            if (!o) {
              setSubmeterNFTarefa(null);
              void loadTarefas();
            }
          }}
          tarefaId={submeterNFTarefa.id}
          competencia={extrairCompetencia(submeterNFTarefa.titulo)}
          modoCorrecao={submeterNFTarefa.tipo_processo === "correcao_nf"}
          notaAnteriorId={submeterNFTarefa.processo_id || undefined}
          motivoCorrecao={
            submeterNFTarefa.tipo_processo === "correcao_nf"
              ? submeterNFTarefa.descricao || undefined
              : undefined
          }
        />
      )}

      {/* Dialog de aprovação de NF (tarefa aprovacao_nf — RH) */}
      {aprovarNFTarefa && aprovarNFTarefa.processo_id && (
        <AprovarNFDialog
          open={!!aprovarNFTarefa}
          onOpenChange={(o) => {
            if (!o) {
              setAprovarNFTarefa(null);
              void loadTarefas();
            }
          }}
          tarefaId={aprovarNFTarefa.id}
          notaId={aprovarNFTarefa.processo_id}
        />
      )}

      {/* Dialog criar nova tarefa */}
      <NovaTarefaDialog
        open={novaTarefaOpen}
        onOpenChange={setNovaTarefaOpen}
        onCriada={() => void loadTarefas()}
      />

      {/* Dialog editar tarefa manual */}
      <NovaTarefaDialog
        open={!!editarTarefa}
        onOpenChange={(open) => !open && setEditarTarefa(null)}
        tarefaParaEditar={editarTarefa ? {
          id: editarTarefa.id,
          titulo: editarTarefa.titulo,
          descricao: editarTarefa.descricao,
          prazo_dias: editarTarefa.prazo_dias || 7,
          prioridade: editarTarefa.prioridade as "urgente" | "normal" | "baixa",
          responsavel_user_id: editarTarefa.responsavel_user_id,
          colaborador_id: editarTarefa.colaborador_id,
          colaborador_tipo: editarTarefa.colaborador_tipo as "clt" | "pj" | null,
          colaborador_nome: editarTarefa.colaborador_nome,
        } : undefined}
        onCriada={() => void loadTarefas()}
      />

      {/* Drawer de detalhe da tarefa com timeline */}
      <TarefaDetalheDrawer
        tarefa={drawerTarefa as TarefaDrawer | null}
        open={!!drawerTarefa}
        onOpenChange={(open) => { if (!open) setDrawerTarefa(null); }}
        onAtualizada={() => void loadTarefas()}
      />
    </PageShell>
  );
}
