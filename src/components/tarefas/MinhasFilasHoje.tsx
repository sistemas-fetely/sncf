import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex items-center justify-end gap-3">
      <div className="min-w-14 text-right"><strong className="text-sm tabular-nums">{fila.itens_total ?? 0}</strong><div className="text-xs text-muted-foreground">itens</div></div>
      <Badge variant="secondary" className="font-normal">sem relógio</Badge>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-3 text-right sm:gap-5">
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

export function MinhasFilasHoje() {
  const { data: filas, isLoading, isError, error } = useMinhasFilasHoje();
  const [mostrarVazias, setMostrarVazias] = useState(() => {
    // Exceção solicitada: somente esta preferência, nunca navegação ou dados.
    try { return window.localStorage.getItem(PREFERENCIA_VAZIAS) === "true"; }
    catch { return false; }
  });

  if (isLoading) return <section aria-label="Carregando minhas filas" className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></section>;
  if (isError) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{formatError(error)}</AlertDescription></Alert>;
  if (!filas?.length) return null;

  const resumo = resumirMinhasFilasHoje(filas);
  const visiveis = ordenarMinhasFilasHoje(filas, mostrarVazias);

  return (
    <section aria-labelledby="minhas-filas-hoje-titulo" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="minhas-filas-hoje-titulo" className="text-sm font-medium">Minhas filas</h2>
          <span className="text-xs text-muted-foreground">{resumo.filas} filas · {resumo.vencidos} vencidos · {resumo.divida} em dívida</span>
        </div>
        <label htmlFor="hoje-mostrar-filas-vazias" className="flex items-center gap-2 text-xs text-muted-foreground">
          mostrar vazias
          <Switch id="hoje-mostrar-filas-vazias" checked={mostrarVazias} onCheckedChange={(valor) => {
            setMostrarVazias(valor);
            try { window.localStorage.setItem(PREFERENCIA_VAZIAS, String(valor)); }
            catch { /* Preferência continua utilizável se o navegador bloquear armazenamento. */ }
          }} />
        </label>
      </div>
      <div className="divide-y divide-border border-y border-border">
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
          const className = cn("flex flex-wrap items-center justify-between gap-3 py-2 sm:flex-nowrap", (fila.itens_total ?? 0) === 0 && "opacity-50");
          return fila.rota
            ? <Link key={fila.fila_chave} to={fila.rota} className={cn(className, "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{conteudo}</Link>
            : <div key={fila.fila_chave} className={className}>{conteudo}</div>;
        })}
      </div>
    </section>
  );
}