import { useNavigate } from "react-router-dom";
import { Bell, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMarcarNotificacoesLidas, useNotificacoesTarefas, type NotificacaoTarefa,
} from "@/hooks/tarefas/useNotificacoesTarefas";

/**
 * Sino do módulo Tarefas — fonte é a tabela `notificacoes` (modulo = 'tarefas').
 * O sino do módulo Pessoas (AppHeader, notificacoes_rh) segue intacto.
 */
export function SinoTarefas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: itens, error } = useNotificacoesTarefas(user?.id);
  const marcar = useMarcarNotificacoesLidas(user?.id);

  const lista = itens ?? [];
  const naoLidas = lista.filter((n) => !n.lida);

  const abrir = (n: NotificacaoTarefa) => {
    if (!n.lida) marcar.mutate([n.id]);
    if (n.url) navigate(n.url);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl">
          <Bell className="h-4 w-4" />
          {naoLidas.length > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-0 p-0 text-[10px]">
              {naoLidas.length > 9 ? "9+" : naoLidas.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h4 className="text-sm font-semibold">Notificações</h4>
          <div className="flex items-center gap-1">
            {naoLidas.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => marcar.mutate(naoLidas.map((n) => n.id))}
              >
                Marcar todas
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate("/tarefas/notificacoes")}
              aria-label="Preferências de notificação"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[360px]">
          {error ? (
            <p className="p-4 text-sm text-destructive">
              Não foi possível carregar: {(error as Error).message}
            </p>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui</p>
          ) : (
            lista.map((n) => (
              <button
                key={n.id}
                onClick={() => abrir(n)}
                className={cn(
                  "w-full border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50",
                  !n.lida && "bg-primary/5"
                )}
              >
                <p className={cn("text-sm", !n.lida && "font-semibold")}>{n.titulo}</p>
                {n.corpo && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.corpo}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.criado_em), { locale: ptBR, addSuffix: true })}
                </p>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
