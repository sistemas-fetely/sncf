import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PermissaoTelaProvider, usePermissaoTelaContext, AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";
import {
  useMinhasFilas, useDeclararTempoFila, type MinhaFila, type MinhaFilaSeveridade,
} from "@/hooks/tarefas/useMinhasFilas";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, ExternalLink, ListChecks } from "lucide-react";

const SEVERIDADE_VARIANT: Record<MinhaFilaSeveridade, string> = {
  critica: "bg-destructive text-destructive-foreground",
  alta: "bg-warning text-warning-foreground",
  normal: "bg-primary text-primary-foreground",
  baixa: "bg-muted text-muted-foreground",
};

const SEVERIDADE_ROTULO: Record<MinhaFilaSeveridade, string> = {
  critica: "Crítica",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

function formatarHorasMinutos(totalMinutos: number): string {
  const h = Math.floor(totalMinutos / 60);
  const m = Math.round(totalMinutos % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

interface GrupoCadeira {
  cadeira: string;
  filas: MinhaFila[];
  totalMinutos: number;
}

function Resumo({
  totalFilas,
  totalItens,
  semTempo,
}: {
  totalFilas: number;
  totalItens: number;
  semTempo: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Filas</p>
          <p className="text-2xl font-medium tabular-nums">{totalFilas}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Itens pendentes</p>
          <p className="text-2xl font-medium tabular-nums">{totalItens}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sem tempo declarado</p>
          <p className={cn("text-2xl font-medium tabular-nums", semTempo > 0 && "text-destructive")}>
            {semTempo}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DeclararTempo({ fila }: { fila: MinhaFila }) {
  const [valor, setValor] = useState<string>("");
  const [redeclarar, setRedeclarar] = useState(false);
  const mutation = useDeclararTempoFila();

  const jaDeclarado = !redeclarar && fila.tempo_unitario_min != null && !fila.precisa_declarar;

  async function handleDeclarar(e?: React.FormEvent) {
    e?.preventDefault();

    const numero = parseFloat(valor.replace(",", "."));
    if (Number.isNaN(numero) || numero < 0.1 || numero > 480) {
      toast.error("Informe um tempo entre 0,1 e 480 minutos.");
      return;
    }

    try {
      const resultado = await mutation.mutateAsync({ filaChave: fila.fila_chave, tempoMin: numero });
      toast.success(
        `Tempo declarado: ${resultado?.tempo_unitario_min ?? numero} min · ${fila.fila_nome}`
      );
      setValor("");
      setRedeclarar(false);
    } catch (err) {
      toast.error(`Não foi possível declarar tempo: ${formatError(err)}`);
    }
  }

  if (jaDeclarado) {
    return (
      <div className="flex flex-col gap-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium tabular-nums">{fila.tempo_unitario_min} min</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          declarado por {fila.tempo_declarado_por ?? "—"} em {formatarDataHora(fila.tempo_declarado_em)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto w-fit self-end px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            setRedeclarar(true);
            setValor(String(fila.tempo_unitario_min ?? ""));
          }}
        >
          redeclarar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleDeclarar} className="flex flex-col gap-2 text-right">
      <div className="flex items-center justify-end gap-2">
        <div className="flex flex-col items-end gap-1">
          {fila.precisa_declarar && !redeclarar && (
            <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              tempo não declarado
            </span>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              min={0.1}
              max={480}
              placeholder="min"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              disabled={mutation.isPending}
              className="w-24 text-right text-sm h-8"
            />
            <Button
              type="submit"
              size="sm"
              disabled={mutation.isPending || valor === ""}
              className="h-8"
            >
              {mutation.isPending ? "…" : "Declarar"}
            </Button>
          </div>
        </div>
      </div>
      {redeclarar && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto w-fit self-end px-2 py-1 text-[11px]"
          onClick={() => {
            setRedeclarar(false);
            setValor("");
          }}
        >
          cancelar
        </Button>
      )}
    </form>
  );
}

function LinhaFila({ fila }: { fila: MinhaFila }) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30",
        fila.precisa_declarar && "border-destructive/50 bg-destructive/5"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium leading-tight">{fila.fila_nome}</h3>
            <Badge className={cn("text-[10px] h-5", SEVERIDADE_VARIANT[fila.severidade])}>
              {SEVERIDADE_ROTULO[fila.severidade]}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5">
              {fila.meu_papel === "atende" ? "atende" : "responde"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">
              <span className="text-foreground font-medium">{fila.itens}</span>{" "}
              {fila.itens === 1 ? "item" : "itens"}
            </span>
            <span>prazo: {fila.prazo_dias ?? "—"} dias úteis</span>
            {fila.minutos_fila > 0 && (
              <span className="tabular-nums">
                {formatarHorasMinutos(fila.minutos_fila)} de fila
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <DeclararTempo fila={fila} />
        </div>
      </div>

      {fila.rota && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-[11px]"
            onClick={() => navigate(fila.rota!)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            abrir fila
          </Button>
        </div>
      )}
    </div>
  );
}

function GrupoCadeira({ grupo }: { grupo: GrupoCadeira }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          {grupo.cadeira}
          <Badge variant="secondary" className="ml-auto text-[11px]">
            {formatarHorasMinutos(grupo.totalMinutos)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {grupo.filas.map((fila) => (
          <LinhaFila key={fila.fila_chave} fila={fila} />
        ))}
      </CardContent>
    </Card>
  );
}

function Conteudo() {
  const { podeEditar } = usePermissaoTelaContext();
  const { data: filas, isLoading, isError, error } = useMinhasFilas();

  const grupos = useMemo<GrupoCadeira[]>(() => {
    const mapa = new Map<string, MinhaFila[]>();
    for (const fila of filas ?? []) {
      const lista = mapa.get(fila.cadeira) ?? [];
      lista.push(fila);
      mapa.set(fila.cadeira, lista);
    }
    return Array.from(mapa.entries())
      .map(([cadeira, lista]) => ({
        cadeira,
        filas: lista.sort((a, b) => a.fila_nome.localeCompare(b.fila_nome, "pt-BR")),
        totalMinutos: lista.reduce((acc, f) => acc + (f.minutos_fila ?? 0), 0),
      }))
      .sort((a, b) => a.cadeira.localeCompare(b.cadeira, "pt-BR"));
  }, [filas]);

  const totalFilas = filas?.length ?? 0;
  const totalItens = (filas ?? []).reduce((acc, f) => acc + (f.itens ?? 0), 0);
  const semTempo = (filas ?? []).filter((f) => f.precisa_declarar).length;

  return (
    <PageShell>
      <PageTitle
        titulo="Minhas Filas"
        estado="Cadeiras em que você atende ou responde"
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      <Resumo totalFilas={totalFilas} totalItens={totalItens} semTempo={semTempo} />

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar suas filas</AlertTitle>
          <AlertDescription className="text-xs break-words">
            {formatError(error)}
          </AlertDescription>
        </Alert>
      )}

      {!isLoading && !isError && grupos.length === 0 && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <p className="text-sm font-medium">Você não está vinculado a nenhuma cadeira de atendimento</p>
            <p className="text-sm text-muted-foreground">
              As filas aparecem aqui quando você é configurado como atendente ou respondente de uma cadeira.
              Essa vinculação é feita pelo gestor no cadastro da cadeira.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && grupos.length > 0 && (
        <div className="space-y-4">
          {grupos.map((grupo) => (
            <GrupoCadeira key={grupo.cadeira} grupo={grupo} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

export default function MinhasFilas() {
  return (
    <PermissaoTelaProvider slug="tela.tarefas">
      <Conteudo />
    </PermissaoTelaProvider>
  );
}
