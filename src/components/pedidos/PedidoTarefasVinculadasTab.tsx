import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock,
  CheckCircle2,
  ListTodo,
  Loader2,
  Plus,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  STATUS_ABERTOS,
  useConcluirTarefaPedido,
  useCriarTarefaPedido,
  usePedidoTarefasVinculadas,
  useResponsaveisTarefaPedido,
  type PedidoTarefaPrioridade,
  type PedidoTarefaStatus,
} from "@/hooks/pedidos/usePedidoTarefasVinculadas";

const STATUS_ROTULO: Record<PedidoTarefaStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_CLASSE: Record<PedidoTarefaStatus, string> = {
  pendente: "border-border bg-muted text-muted-foreground",
  em_andamento: "border-info/40 bg-info/10 text-info",
  em_revisao: "border-warning/40 bg-warning/10 text-warning",
  concluida: "border-success/40 bg-success/10 text-success",
  cancelada: "border-destructive/40 bg-destructive/10 text-destructive",
};

const PRIORIDADE_ROTULO: Record<PedidoTarefaPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

const PRIORIDADE_CLASSE: Record<PedidoTarefaPrioridade, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

const fmtData = (s: string | null) =>
  s ? format(parseISO(s), "dd/MM/yyyy", { locale: ptBR }) : null;

export function PedidoTarefasVinculadasTab({ pedidoId }: { pedidoId: string }) {
  const { user } = useAuth();
  const { data: tarefas = [], isLoading } = usePedidoTarefasVinculadas(pedidoId);
  const { data: responsaveis = [] } = useResponsaveisTarefaPedido();
  const criar = useCriarTarefaPedido();
  const concluir = useConcluirTarefaPedido();

  const [dialogAberto, setDialogAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [prioridade, setPrioridade] = useState<PedidoTarefaPrioridade>("media");
  const [dataLimite, setDataLimite] = useState("");

  const abertas = tarefas.filter((t) => STATUS_ABERTOS.includes(t.status)).length;

  // Responsável padrão: o próprio usuário logado, se tiver vínculo ativo.
  useEffect(() => {
    if (!responsavelId && user?.id && responsaveis.some((r) => r.usuario_id === user.id)) {
      setResponsavelId(user.id);
    }
  }, [responsaveis, user?.id, responsavelId]);

  const resetarForm = () => {
    setTitulo("");
    setDescricao("");
    setResponsavelId(user?.id && responsaveis.some((r) => r.usuario_id === user.id) ? user.id : "");
    setPrioridade("media");
    setDataLimite("");
  };

  const salvar = () => {
    if (!titulo.trim() || !responsavelId) return;
    criar.mutate(
      {
        pedidoId,
        titulo,
        descricao,
        responsavelId,
        prioridade,
        dataLimite: dataLimite || null,
      },
      {
        onSuccess: () => {
          setDialogAberto(false);
          resetarForm();
        },
      },
    );
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Tarefas do pedido
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {abertas > 0 && (
            <Badge variant="outline" className="text-xs">
              {abertas} aberta{abertas === 1 ? "" : "s"}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setDialogAberto(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova tarefa
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : tarefas.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-md">
          Nenhuma tarefa vinculada a este pedido
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {tarefas.map((t) => {
            const aberta = STATUS_ABERTOS.includes(t.status);
            return (
              <li
                key={t.tarefa_id}
                className={cn("px-3 py-2.5 space-y-1.5", !aberta && "bg-muted/30")}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          t.status === "concluida" && "line-through text-muted-foreground",
                        )}
                      >
                        {t.titulo}
                      </span>
                      <Badge variant="outline" className={cn("text-[10px] py-0", STATUS_CLASSE[t.status])}>
                        {STATUS_ROTULO[t.status]}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] py-0", PRIORIDADE_CLASSE[t.prioridade])}>
                        {PRIORIDADE_ROTULO[t.prioridade]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      {t.responsavel_nome && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          {t.responsavel_nome}
                        </span>
                      )}
                      {fmtData(t.data_limite) && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          {fmtData(t.data_limite)}
                        </span>
                      )}
                      {t.status === "concluida" && t.data_conclusao && (
                        <span>
                          Concluída em {new Date(t.data_conclusao).toLocaleString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {t.descricao && (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {t.descricao}
                      </p>
                    )}
                  </div>
                  {aberta && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      disabled={concluir.isPending}
                      onClick={() => concluir.mutate({ tarefaId: t.tarefa_id, pedidoId })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-success" />
                      Marcar concluída
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa do pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-titulo">Título *</Label>
              <Input
                id="tarefa-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Confirmar endereço de entrega"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tarefa-descricao">Descrição</Label>
              <Textarea
                id="tarefa-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Detalhes opcionais…"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Responsável *</Label>
                <Select value={responsavelId} onValueChange={setResponsavelId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Escolher pessoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.usuario_id} value={r.usuario_id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select
                  value={prioridade}
                  onValueChange={(v) => setPrioridade(v as PedidoTarefaPrioridade)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["baixa", "media", "alta", "urgente"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDADE_ROTULO[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tarefa-prazo">Prazo</Label>
                <Input
                  id="tarefa-prazo"
                  type="date"
                  className="h-9 text-sm"
                  value={dataLimite}
                  onChange={(e) => setDataLimite(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={!titulo.trim() || !responsavelId || criar.isPending}
            >
              {criar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Criar tarefa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
