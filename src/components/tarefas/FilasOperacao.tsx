import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ChevronRight, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilaInbox {
  chave: string;
  nome: string;
  rota: string | null;
  severidade: "critica" | "alta" | "normal" | "baixa";
  area_nome: string | null;
  total: number | null;
  erro: string | null;
}

const SEM_AREA = "Sem área";

function useInboxFilas() {
  return useQuery({
    queryKey: ["inbox-filas"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<FilaInbox[]> => {
      const { data, error } = await (supabase as any).rpc("fn_inbox_filas");
      if (error) throw error;
      return (data ?? []) as FilaInbox[];
    },
  });
}

function BadgeFila({ fila }: { fila: FilaInbox }) {
  if (fila.erro) {
    return <Badge variant="destructive" className="text-[11px]">erro</Badge>;
  }
  const total = fila.total ?? 0;
  if (total === 0) {
    return (
      <Badge variant="outline" className="text-[11px] text-muted-foreground border-muted">
        0
      </Badge>
    );
  }
  if (fila.severidade === "critica") {
    return <Badge variant="destructive" className="text-[11px]">{total}</Badge>;
  }
  if (fila.severidade === "alta") {
    return (
      <Badge className="text-[11px] border-0 bg-warning text-warning-foreground hover:bg-warning/90">
        {total}
      </Badge>
    );
  }
  if (fila.severidade === "baixa") {
    return <Badge variant="outline" className="text-[11px]">{total}</Badge>;
  }
  return <Badge variant="secondary" className="text-[11px]">{total}</Badge>;
}

export function FilasOperacao() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = useInboxFilas();

  const grupos = useMemo(() => {
    const porArea = new Map<string, FilaInbox[]>();
    for (const f of data ?? []) {
      const area = f.area_nome?.trim() || SEM_AREA;
      if (!porArea.has(area)) porArea.set(area, []);
      porArea.get(area)!.push(f);
    }
    const ordenarFilas = (filas: FilaInbox[]) =>
      [...filas].sort((a, b) => {
        // filas com erro primeiro (defeito visível), zeradas no fim
        const peso = (f: FilaInbox) => (f.erro ? 0 : (f.total ?? 0) === 0 ? 2 : 1);
        const pa = peso(a);
        const pb = peso(b);
        if (pa !== pb) return pa - pb;
        return (b.total ?? 0) - (a.total ?? 0);
      });
    const nomes = [...porArea.keys()].sort((a, b) => {
      if (a === SEM_AREA) return 1;
      if (b === SEM_AREA) return -1;
      return a.localeCompare(b, "pt-BR");
    });
    return nomes.map((nome) => ({ nome, filas: ordenarFilas(porArea.get(nome)!) }));
  }, [data]);

  const totalGeral = (data ?? []).reduce((acc, f) => acc + (f.total ?? 0), 0);

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
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Trabalho pendente registrado nas filas do sistema, agrupado por área
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
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

        {!isLoading && !isError && grupos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma fila registrada.</p>
        )}

        {!isLoading &&
          !isError &&
          grupos.map((grupo) => (
            <div key={grupo.nome} className="space-y-1">
              <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground px-1">
                {grupo.nome}
              </p>
              <div className="rounded-lg border divide-y">
                {grupo.filas.map((fila) => {
                  const clicavel = !!fila.rota;
                  const zerada = !fila.erro && (fila.total ?? 0) === 0;
                  return (
                    <div
                      key={fila.chave}
                      role={clicavel ? "button" : undefined}
                      tabIndex={clicavel ? 0 : undefined}
                      onClick={clicavel ? () => navigate(fila.rota!) : undefined}
                      onKeyDown={
                        clicavel
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigate(fila.rota!);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "flex items-start justify-between gap-3 px-3 py-2 text-sm",
                        clicavel && "cursor-pointer hover:bg-muted/50 transition-colors",
                        !clicavel && "text-muted-foreground"
                      )}
                    >
                      <div className="min-w-0">
                        <span className={cn("truncate", zerada && "text-muted-foreground")}>
                          {fila.nome}
                        </span>
                        {fila.erro && (
                          <p className="text-xs text-destructive break-words">{fila.erro}</p>
                        )}
                      </div>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <BadgeFila fila={fila} />
                        {clicavel && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
