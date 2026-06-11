import { useState } from "react";
import { Loader2, Plus, Trash2, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  usePedidoTarefas,
  useCriarTarefa,
  useToggleTarefa,
  useExcluirTarefa,
} from "@/hooks/pedidos/usePedidoTarefas";

export function PedidoTarefasTab({ pedidoId }: { pedidoId: string }) {
  const { data: tarefas = [], isLoading } = usePedidoTarefas(pedidoId);
  const criar = useCriarTarefa();
  const toggle = useToggleTarefa();
  const excluir = useExcluirTarefa();
  const [nova, setNova] = useState("");

  const handleAdd = () => {
    const t = nova.trim();
    if (!t) return;
    criar.mutate(
      { pedidoId, titulo: t },
      { onSuccess: () => setNova("") },
    );
  };

  const pendentes = tarefas.filter((t) => !t.concluida).length;
  const concluidas = tarefas.length - pendentes;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Tarefas e pendências
        </p>
        <div className="ml-auto flex gap-1.5">
          <Badge variant="outline" className="text-xs">
            {pendentes} pendente{pendentes === 1 ? "" : "s"}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {concluidas} concluída{concluidas === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Nova tarefa ou pendência…"
          disabled={criar.isPending}
        />
        <Button onClick={handleAdd} disabled={!nova.trim() || criar.isPending} size="sm">
          {criar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : tarefas.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-md">
          Nenhuma tarefa cadastrada
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {tarefas.map((t) => (
            <li
              key={t.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 group",
                t.concluida && "bg-muted/30",
              )}
            >
              <Checkbox
                checked={t.concluida}
                onCheckedChange={(v) =>
                  toggle.mutate({ id: t.id, concluida: !!v, pedidoId })
                }
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    t.concluida && "line-through text-muted-foreground",
                  )}
                >
                  {t.titulo}
                </p>
                {t.concluida && t.concluida_em && (
                  <p className="text-[10px] text-muted-foreground">
                    Concluída em {new Date(t.concluida_em).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={() => excluir.mutate({ id: t.id, pedidoId })}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
