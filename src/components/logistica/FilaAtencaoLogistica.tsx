import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ListTodo,
  Loader2,
  Plus,
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import {
  useLogisticaFilaAtencao,
  type FilaAtencaoRow,
} from "@/hooks/logistica/useLogisticaFilaAtencao";
import {
  useCriarTarefaPedido,
  useResponsaveisTarefaPedido,
  type PedidoTarefaPrioridade,
} from "@/hooks/pedidos/usePedidoTarefasVinculadas";

const MOTIVO_ROTULO: Record<string, string> = {
  entregue_sem_lastro: "Entregue sem lastro",
  entrega_nao_registrada: "Entrega não registrada",
  problema_ativo: "Problema ativo",
  custodia_parada: "Custódia parada",
  sem_fonte_rastreio: "Sem fonte de rastreio",
  sem_eta_em_transito: "Sem ETA em trânsito",
  eta_vencido: "ETA vencido",
};

// Rampa de intensidade: 1-2 destructive, 3 warning, 4-5 info.
function seloPorSeveridade(sev: number): EstadoSelo {
  if (sev <= 2) return "destructive";
  if (sev === 3) return "warning";
  return "info";
}

function nomeComApelido(canonico: string | null, apelido: string | null): string {
  if (apelido && apelido.trim()) return apelido;
  return canonico?.trim() || "—";
}

const PRIORIDADE_ROTULO: Record<PedidoTarefaPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

function DialogNovaTarefa({
  linha,
  aberto,
  onFechar,
}: {
  linha: FilaAtencaoRow | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { data: responsaveis = [] } = useResponsaveisTarefaPedido();
  const criar = useCriarTarefaPedido();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [prioridade, setPrioridade] = useState<PedidoTarefaPrioridade>("media");
  const [dataLimite, setDataLimite] = useState("");

  // Preenche quando uma linha nova é aberta no dialog.
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  if (linha && linha.pedido_id !== ultimoPedido) {
    setUltimoPedido(linha.pedido_id);
    setTitulo(linha.diagnostico ?? MOTIVO_ROTULO[linha.motivo] ?? "");
    setDescricao("");
    setResponsavelId("");
    setPrioridade(linha.severidade <= 2 ? "alta" : "media");
    setDataLimite("");
  }

  const salvar = () => {
    if (!linha || !titulo.trim() || !responsavelId) return;
    criar.mutate(
      {
        pedidoId: linha.pedido_id,
        titulo,
        descricao,
        responsavelId,
        prioridade,
        dataLimite: dataLimite || null,
      },
      { onSuccess: onFechar },
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Nova tarefa — pedido {linha?.id_externo ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fila-tarefa-titulo">Título *</Label>
            <Input
              id="fila-tarefa-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fila-tarefa-descricao">Descrição</Label>
            <Textarea
              id="fila-tarefa-descricao"
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
              <Label htmlFor="fila-tarefa-prazo">Prazo</Label>
              <Input
                id="fila-tarefa-prazo"
                type="date"
                className="h-9 text-sm"
                value={dataLimite}
                onChange={(e) => setDataLimite(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
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
  );
}

export function FilaAtencaoLogistica() {
  const { data: linhas = [], isLoading } = useLogisticaFilaAtencao();
  const [motivosSel, setMotivosSel] = useState<Set<string>>(new Set());
  const [soAcaoNossa, setSoAcaoNossa] = useState(false);
  const [linhaTarefa, setLinhaTarefa] = useState<FilaAtencaoRow | null>(null);

  const motivosDisponiveis = useMemo(
    () => [...new Set(linhas.map((l) => l.motivo))].sort((a, b) => {
      // ordena pela menor severidade em que cada motivo aparece (mais urgente primeiro)
      const sev = (m: string) =>
        Math.min(...linhas.filter((l) => l.motivo === m).map((l) => l.severidade));
      return sev(a) - sev(b);
    }),
    [linhas],
  );

  const filtradas = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (motivosSel.size === 0 || motivosSel.has(l.motivo)) &&
          (!soAcaoNossa || l.exige_acao_nossa),
      ),
    [linhas, motivosSel, soAcaoNossa],
  );

  const contadores = useMemo(() => {
    const c = { urgente: 0, atencao: 0, informativo: 0 };
    for (const l of filtradas) {
      if (l.severidade <= 2) c.urgente += 1;
      else if (l.severidade === 3) c.atencao += 1;
      else c.informativo += 1;
    }
    return c;
  }, [filtradas]);

  const toggleMotivo = (m: string) =>
    setMotivosSel((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando fila de atenção…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contadores por faixa de severidade */}
      <div className="flex flex-wrap items-center gap-2">
        {contadores.urgente > 0 && (
          <Selo estado="destructive">
            {contadores.urgente} urgente{contadores.urgente === 1 ? "" : "s"}
          </Selo>
        )}
        {contadores.atencao > 0 && (
          <Selo estado="warning">
            {contadores.atencao} de atenção
          </Selo>
        )}
        {contadores.informativo > 0 && (
          <Selo estado="info">
            {contadores.informativo} informativo{contadores.informativo === 1 ? "" : "s"}
          </Selo>
        )}
        {filtradas.length === 0 && linhas.length === 0 && (
          <Selo estado="success">fila limpa</Selo>
        )}
      </div>

      {/* Filtros */}
      {linhas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                Motivo
                {motivosSel.size > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1">
                    {motivosSel.size}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {motivosDisponiveis.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m}
                  checked={motivosSel.has(m)}
                  onCheckedChange={() => toggleMotivo(m)}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs"
                >
                  {MOTIVO_ROTULO[m] ?? m}
                </DropdownMenuCheckboxItem>
              ))}
              {motivosSel.size > 0 && (
                <button
                  type="button"
                  onClick={() => setMotivosSel(new Set())}
                  className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  Limpar seleção
                </button>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={soAcaoNossa} onCheckedChange={setSoAcaoNossa} />
            Só o que exige ação nossa
          </label>
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
          <p className="text-sm text-muted-foreground">
            {linhas.length === 0
              ? "Nenhum pedido precisa de atenção agora."
              : "Nenhum pedido com os filtros atuais — limpe os filtros para ver a fila inteira."}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Pedido</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Transportadora</TableHead>
                <TableHead className="text-xs">Motivo</TableHead>
                <TableHead className="text-xs">Diagnóstico</TableHead>
                <TableHead className="text-xs text-right">Valor</TableHead>
                <TableHead className="text-xs text-right">Fat. há</TableHead>
                <TableHead className="text-xs text-right">Parado há</TableHead>
                <TableHead className="text-xs text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((l) => (
                <TableRow key={l.pedido_id}>
                  <TableCell>
                    <Link
                      to={`/pedidos/${l.pedido_id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {l.id_externo ?? "—"}
                    </Link>
                    {l.estagio && (
                      <div className="text-[10px] text-muted-foreground">{l.estagio}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {nomeComApelido(l.cliente, l.cliente_apelido)}
                    {l.cliente_apelido && l.cliente && l.cliente_apelido !== l.cliente && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {l.cliente}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {nomeComApelido(l.transportadora, l.transportadora_apelido)}
                    {(l.cidade || l.uf) && (
                      <div className="text-[10px] text-muted-foreground">
                        {[l.cidade, l.uf].filter(Boolean).join("/")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Selo estado={seloPorSeveridade(l.severidade)}>
                      {MOTIVO_ROTULO[l.motivo] ?? l.motivo}
                    </Selo>
                    {l.exige_acao_nossa && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> exige ação nossa
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    {l.diagnostico ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground truncate block cursor-default">
                              {l.diagnostico}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm text-xs">
                            {l.diagnostico}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {formatBRL(l.valor_liquido)}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {l.dias_desde_faturamento != null ? `${l.dias_desde_faturamento}d` : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-sm text-right tabular-nums",
                      (l.dias_sem_movimento ?? 0) > 7 && "text-destructive",
                    )}
                  >
                    {l.dias_sem_movimento != null ? `${l.dias_sem_movimento}d` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setLinhaTarefa(l)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Criar tarefa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogNovaTarefa
        linha={linhaTarefa}
        aberto={linhaTarefa !== null}
        onFechar={() => setLinhaTarefa(null)}
      />
    </div>
  );
}
