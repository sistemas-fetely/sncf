import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, CalendarClock, ListTodo, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatusRotulo, PRIORIDADE_ROTULO } from "@/components/tarefas/detalhe/comuns";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import { useTarefasDoPedido } from "@/hooks/pedidos/useTarefasDoPedido";
import { cn } from "@/lib/utils";

const PRIORIDADE_CLASSE: Record<string, string> = {
  urgente: "border-destructive/40 bg-destructive/10 text-destructive",
  alta: "border-warning/40 bg-warning/10 text-warning",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
};

function fmtData(s: string | null) {
  return s ? format(parseISO(s), "dd/MM/yyyy", { locale: ptBR }) : null;
}

interface Props {
  pedidoId: string;
}

export function PedidoTarefasBloco({ pedidoId }: Props) {
  const { data: tarefas = [], isLoading } = useTarefasDoPedido(pedidoId);
  const { abrir } = useTarefaAberta();
  const rotuloStatus = useStatusRotulo();
  const nomePessoa = useNomePessoa();
  const { data: statusDim } = useStatusTarefaDim();

  const abertas = tarefas.filter((t) => !t.e_terminal).length;

  const ordenadas = [...tarefas].sort((a, b) => {
    if (a.e_terminal !== b.e_terminal) return a.e_terminal ? 1 : -1;
    if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
    if (a.data_limite && b.data_limite) {
      return new Date(a.data_limite).getTime() - new Date(b.data_limite).getTime();
    }
    if (a.data_limite) return -1;
    if (b.data_limite) return 1;
    return 0;
  });

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          Tarefas do pedido
          {abertas > 0 && (
            <Badge variant="outline" className="text-xs ml-auto">
              {abertas} aberta{abertas === 1 ? "" : "s"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : tarefas.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma tarefa vinculada a este pedido
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Crie uma na aba Tarefas
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {ordenadas.map((t) => {
              const status = statusDim?.find((s) => s.codigo === t.status);
              const dataFmt = fmtData(t.data_limite);
              return (
                <li
                  key={t.tarefa_id}
                  className={cn(
                    "group rounded-md border px-3 py-2 transition-colors cursor-pointer",
                    "border-border/60 bg-card hover:bg-accent/40",
                    t.atrasada && !t.e_terminal && "border-destructive/40 bg-destructive/10",
                    t.e_terminal && "opacity-70 ml-4 border-l-2 border-l-muted"
                  )}
                  onClick={() => abrir(t.tarefa_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      abrir(t.tarefa_id);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        t.e_terminal && "line-through text-muted-foreground"
                      )}
                    >
                      {t.titulo}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0"
                      style={{
                        borderColor: status?.cor || undefined,
                        color: status?.cor || undefined,
                      }}
                    >
                      {rotuloStatus(t.status)}
                    </Badge>
                    {t.prioridade && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] py-0",
                          PRIORIDADE_CLASSE[t.prioridade] ?? PRIORIDADE_CLASSE.media
                        )}
                      >
                        {PRIORIDADE_ROTULO[t.prioridade] ?? t.prioridade}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      {nomePessoa(t.responsavel_id)}
                    </span>
                    {dataFmt && (
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          t.atrasada && !t.e_terminal && "text-destructive font-medium"
                        )}
                      >
                        <CalendarClock className="h-3 w-3 shrink-0" />
                        {dataFmt}
                      </span>
                    )}
                    {t.atrasada && !t.e_terminal && (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Atrasada
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
