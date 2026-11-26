import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useMinhasFilasHoje } from "@/hooks/tarefas/useMinhasFilasHoje";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { ordenarMinhasFilasHoje, resumirMinhasFilasHoje, type MinhaFilaHoje } from "@/lib/tarefas/minhasFilasHoje";

const PREFERENCIA_VAZIAS = "sncf.hoje.filas-vazias";
const SEVERIDADE_VARIANT: Record<string, string> = {
  critica: "bg-destructive text-destructive-foreground",
  alta: "bg-warning text-warning-foreground",
  normal: "bg-primary text-primary-foreground",
  baixa: "bg-muted text-muted-foreground",
};
const SEVERIDADE_ROTULO: Record<string, string> = { critica: "Crítica", alta: "Alta", normal: "Normal", baixa: "Baixa" };

function NumerosFila({ fila }: { fila: MinhaFilaHoje }) {
  if (!fila.tem_relogio) return (
    <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
      <div className="min-w-14 text-right"><strong className="text-sm tabular-nums">{fila.itens_total ?? 0}</strong><div className="text-xs text-muted-foreground">itens</div></div>
      <Badge variant="secondary" className="font-normal">sem relógio</Badge>
    </div>
  );
  return (
    <div className="grid w-full grid-cols-3 gap-3 text-right sm:w-auto sm:gap-5">
      {[
        { rotulo: "vencidos", valor: fila.itens_vencidos ?? 0, cor: "text-destructive" },
        { rotulo: "dívida", valor: fila.itens_divida ?? 0, cor: "text-warning" },
        { rotulo: "no prazo", valor: fila.itens_no_prazo ?? 0, cor: "text-muted-foreground" },
      ].map(({ rotulo, valor, cor }) => (
        <div key={rotulo} className="min-w-14">
          <strong className={cn("text-sm tabular-nums", valor > 0 ? cor : "text-muted-foreground")}>{valor}</strong>
          <div className="whitespace-nowrap text-xs text-muted-foreground">{rotulo}</div>
        </div>
      ))}
    </div>
  );
}

function CabecalhoFilas({ resumo, mostrarVazias, onMostrarVazias }: {
  resumo: ReturnType<typeof resumirMinhasFilasHoje>;
  mostrarVazias: boolean;
  onMostrarVazias: (valor: boolean) => void;
}) {
  return (
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <CardTitle id="minhas-filas-hoje-titulo" className="text-base">
          Minhas filas
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {resumo.filas} filas · {resumo.vencidos} vencidos · {resumo.divida} em dívida
          </span>
        </CardTitle>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="hoje-mostrar-filas-vazias" checked={mostrarVazias} onCheckedChange={onMostrarVazias} />
          <Label htmlFor="hoje-mostrar-filas-vazias" className="text-xs text-muted-foreground">mostrar vazias</Label>
        </div>
      </div>
    </CardHeader>
  );
}

export function MinhasFilasHoje() {
  const { data: filas, isLoading, isError, error } = useMinhasFilasHoje();
  const [mostrarVazias, setMostrarVazias] = useState(() => {
    // Exceção solicitada: somente esta preferência, nunca navegação ou dados.
    try { return window.localStorage.getItem(PREFERENCIA_VAZIAS) === "true"; }
    catch { return false; }
  });

  const alternarVazias = (valor: boolean) => {
    setMostrarVazias(valor);
    try { window.localStorage.setItem(PREFERENCIA_VAZIAS, String(valor)); }
    catch { /* Preferência continua utilizável se o navegador bloquear armazenamento. */ }
  };

  if (isLoading) return (
    <section aria-label="Carregando minhas filas">
      <Card>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </section>
  );
  if (isError) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{formatError(error)}</AlertDescription></Alert>;
  if (!filas?.length) return null;

  const resumo = resumirMinhasFilasHoje(filas);
  const visiveis = ordenarMinhasFilasHoje(filas, mostrarVazias);

  return (
    <section aria-labelledby="minhas-filas-hoje-titulo">
      <Card>
        <CabecalhoFilas resumo={resumo} mostrarVazias={mostrarVazias} onMostrarVazias={alternarVazias} />
        <CardContent className="pt-0">
          <div className="divide-y divide-border">
            {visiveis.map((fila) => {
              const severidade = fila.severidade ?? "normal";
              const conteudo = <>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-sm font-medium">{fila.fila_nome}</span>
                    <Badge className={cn("h-5 text-[10px]", SEVERIDADE_VARIANT[severidade] ?? SEVERIDADE_VARIANT.normal)}>{SEVERIDADE_ROTULO[severidade] ?? SEVERIDADE_ROTULO.normal}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{fila.area_nome}</div>
                </div>
                <NumerosFila fila={fila} />
              </>;
              const className = cn("flex flex-col gap-2 rounded-sm px-1 py-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-3", (fila.itens_total ?? 0) === 0 && "opacity-50");
              return fila.rota
                ? <Link key={fila.fila_chave} to={fila.rota} className={cn(className, "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{conteudo}</Link>
                : <div key={fila.fila_chave} className={className}>{conteudo}</div>;
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
