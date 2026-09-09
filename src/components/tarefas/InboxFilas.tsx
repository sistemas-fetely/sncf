import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInboxFilas, type FilaInbox } from "@/hooks/tarefas/useInboxFilas";
import { useInboxFilaItens } from "@/hooks/tarefas/useInboxFilaItens";
import { useFilaMedidas, fmtPrazoMedida, type FilaMedida } from "@/hooks/tarefas/useFilaMedidas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, ListChecks, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

const RE_DATA = /^\d{4}-\d{2}-\d{2}/;

function rotuloColuna(chave: string) {
  return chave.replace(/_/g, " ");
}

function formatarCelula(valor: unknown): { texto: string; numerico: boolean } {
  if (valor === null || valor === undefined) return { texto: "—", numerico: false };
  if (typeof valor === "boolean") return { texto: valor ? "Sim" : "Não", numerico: false };
  if (typeof valor === "number") return { texto: valor.toLocaleString("pt-BR"), numerico: true };
  if (typeof valor === "string") {
    if (RE_DATA.test(valor)) {
      const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
      if (!Number.isNaN(d.getTime())) {
        return { texto: d.toLocaleDateString("pt-BR"), numerico: true };
      }
    }
    return { texto: valor, numerico: false };
  }
  let json = "";
  try {
    json = JSON.stringify(valor);
  } catch {
    json = String(valor);
  }
  return { texto: json.length > 60 ? `${json.slice(0, 60)}…` : json, numerico: false };
}

function TabelaFila({ fila }: { fila: FilaInbox }) {
  const { data, isLoading, isError, error } = useInboxFilaItens(fila.chave, 25);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar os itens</AlertTitle>
        <AlertDescription className="text-xs break-words">{formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  const linhas = data ?? [];
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum item nesta fila.</p>;
  }

  const colunas = Object.keys(linhas[0]);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => (
                <TableHead key={c} className="whitespace-nowrap capitalize text-xs">
                  {rotuloColuna(c)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha, i) => (
              <TableRow key={i}>
                {colunas.map((c) => {
                  const { texto, numerico } = formatarCelula(linha[c]);
                  return (
                    <TableCell
                      key={c}
                      title={texto}
                      className={cn(
                        "max-w-[240px] truncate text-xs",
                        numerico && "tabular-nums"
                      )}
                    >
                      {texto}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {fila.total > linhas.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {linhas.length} de {fila.total} — abra a tela para ver tudo
        </p>
      )}
    </div>
  );
}

/** F2 — bloco compacto com o que a fila instrumentada mediu (últimos 90 dias).
 *  Filas fora de vw_fila_medida simplesmente não mostram o bloco. */
function BlocoMedida({ medida }: { medida: FilaMedida }) {
  const chegada = `${medida.padrao ?? "sem dado"}${medida.padrao_ref ? ` · ${medida.padrao_ref}` : ""}`;
  const volume =
    medida.media_por_dia_corrido == null
      ? "—"
      : `${medida.media_por_dia_corrido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia`;
  const volumeAtivo =
    medida.padrao !== "diario" && medida.media_por_dia_ativo != null
      ? `${medida.media_por_dia_ativo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/dia nos dias ativos`
      : null;
  const semHumano = (medida.amostra_humana ?? 0) === 0;

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Chegada</p>
          <p className="text-sm font-medium capitalize">{chegada}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Volume</p>
          <p className="text-sm font-medium tabular-nums">{volume}</p>
          {volumeAtivo && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{volumeAtivo}</p>
          )}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Pico</p>
          <p className="text-sm font-medium tabular-nums">
            {medida.pico_dia_qtd != null ? `${medida.pico_dia_qtd} num dia` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Prazo real</p>
          {semHumano ? (
            <p className="text-[11px] text-muted-foreground">
              sem execução humana registrada — resolvido por automação
            </p>
          ) : (
            <>
              <p className="text-sm font-medium tabular-nums">
                {fmtPrazoMedida(medida.lead_p50_min)}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                p80 {fmtPrazoMedida(medida.lead_p80_min)}
              </p>
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        medido nos últimos 90 dias · {medida.entradas_total ?? 0} chegadas
      </p>
    </div>
  );
}

export function InboxFilas() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [filaAberta, setFilaAberta] = useState<FilaInbox | null>(null);
  const { data: filas, isLoading, isError, error, refetch, isFetching } = useInboxFilas();
  const medidas = useFilaMedidas();

  const totalGeral = (filas ?? []).reduce((acc, f) => acc + f.total, 0);

  const comPendencia = (filas ?? []).filter((f) => f.total > 0 || !!f.erro);
  const zeradas = (filas ?? []).filter((f) => f.total === 0 && !f.erro);
  const visiveis = [...comPendencia, ...zeradas];

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
            <p className="text-sm text-muted-foreground">Nenhuma fila cadastrada.</p>
          )}

          {!isLoading && !isError && visiveis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {visiveis.map((fila) => {
                const comErro = !!fila.erro;
                const zerada = fila.total === 0 && !comErro;
                const ehCritica = !zerada && fila.severidade === "critica";
                const ehAlta = !zerada && fila.severidade === "alta";

                return (
                  <div
                    key={fila.chave}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilaAberta(fila)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setFilaAberta(fila);
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
                      <p
                        className={cn(
                          "text-sm font-medium leading-tight",
                          zerada && "text-muted-foreground"
                        )}
                      >
                        {fila.nome}
                      </p>
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

      <Sheet open={!!filaAberta} onOpenChange={(o) => !o && setFilaAberta(null)}>
        <SheetContent side="right" className="sm:max-w-2xl w-full overflow-y-auto">
          {filaAberta && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{filaAberta.nome}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {filaAberta.total}
                  </Badge>
                </SheetTitle>
                <SheetDescription>{filaAberta.area_nome ?? "Sem área"}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                {(() => {
                  const medida = medidas.data?.get(filaAberta.chave);
                  return medida ? <BlocoMedida medida={medida} /> : null;
                })()}
                <TabelaFila fila={filaAberta} />
              </div>

              {filaAberta.rota && (
                <SheetFooter className="mt-4">
                  <Button
                    onClick={() => {
                      const rota = filaAberta.rota;
                      setFilaAberta(null);
                      navigate(rota);
                    }}
                  >
                    Abrir tela
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
