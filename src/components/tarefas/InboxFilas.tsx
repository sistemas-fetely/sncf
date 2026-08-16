import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInboxFilas } from "@/hooks/tarefas/useInboxFilas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChevronDown, ChevronUp, ListChecks, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

export function InboxFilas() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const { data: filas, isLoading, isError, error, refetch, isFetching } = useInboxFilas();

  const totalGeral = (filas ?? []).reduce((acc, f) => acc + f.total, 0);

  const visiveis = (filas ?? []).filter((f) => f.total > 0 || !!f.erro);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Filas da operação
          {!isLoading && !isError && (
            <Badge variant="secondary" className="ml-auto text-[11px]">
              {totalGeral} item{totalGeral !== 1 ? "s" : ""}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Recolher filas" : "Expandir filas"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Trabalho pendente registrado nas filas do sistema, agrupado por área
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )}

          {isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar as filas</AlertTitle>
              <AlertDescription className="space-y-2">
                <p className="text-xs break-words">{formatError(error)}</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                  Tentar de novo
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !isError && visiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma fila pedindo ação agora.</p>
          )}

          {!isLoading && !isError && visiveis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {visiveis.map((fila) => {
                const comErro = !!fila.erro;
                const zerada = fila.total === 0 && !comErro;
                const ehCritica = fila.severidade === "critica";
                const ehAlta = fila.severidade === "alta";

                return (
                  <div
                    key={fila.chave}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(fila.rota)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(fila.rota);
                      }
                    }}
                    className={cn(
                      "relative flex flex-col justify-between gap-2 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50",
                      ehCritica && "border-destructive bg-destructive/5",
                      ehAlta && "border-warning bg-warning/5",
                      !ehCritica && !ehAlta && "border-border bg-card",
                      comErro && "border-destructive"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "text-2xl font-medium tabular-nums leading-none",
                          ehCritica && "text-destructive",
                          ehAlta && "text-warning",
                          zerada && "text-muted-foreground"
                        )}
                      >
                        {fila.total}
                      </span>
                      {comErro && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{fila.nome}</p>
                      {comErro && (
                        <p className="text-xs text-destructive break-words mt-1">{fila.erro}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {fila.area_nome ?? "Sem área"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
