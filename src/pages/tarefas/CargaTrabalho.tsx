import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { PRIORIDADE_ROTULO, useStatusRotulo } from "@/components/tarefas/detalhe/comuns";
import {
  CLASSE_TOM, tomDaCarga, useCargaDetalhe, useCargaSemanal, usePodeEditarCapacidade,
  useSalvarCapacidade, type CargaSemana,
} from "@/hooks/tarefas/useCargaTrabalho";

const SEMANAS = 6;

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface Celula {
  horas: number;
  semEstimativa: number;
}

interface LinhaPessoa {
  userId: string;
  nome: string;
  horasSemana: number;
  celulas: Record<string, Celula>;
  totalSemEstimativa: number;
}

export default function CargaTrabalho() {
  const inicio = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 0 }), []);
  const semanas = useMemo(
    () => Array.from({ length: SEMANAS }, (_, i) => addWeeks(inicio, i)),
    [inicio]
  );

  const { data: linhasRpc, isLoading, error } = useCargaSemanal(iso(inicio), SEMANAS);
  const { data: podeEditar } = usePodeEditarCapacidade();
  const salvarCapacidade = useSalvarCapacidade();

  const [drill, setDrill] = useState<{ userId: string; nome: string; inicio: string; fim: string } | null>(null);
  const { abrir: abrirTarefa, tarefaId } = useTarefaAberta();

  useEffect(() => {
    if (tarefaId) setDrill(null);
  }, [tarefaId]);

  const pessoas = useMemo<LinhaPessoa[]>(() => {
    const mapa = new Map<string, LinhaPessoa>();
    for (const l of (linhasRpc ?? []) as CargaSemana[]) {
      let p = mapa.get(l.user_id);
      if (!p) {
        p = {
          userId: l.user_id,
          nome: l.nome,
          horasSemana: Number(l.horas_semana ?? 0),
          celulas: {},
          totalSemEstimativa: 0,
        };
        mapa.set(l.user_id, p);
      }
      p.celulas[l.semana_inicio] = {
        horas: Number(l.horas ?? 0),
        semEstimativa: Number(l.sem_estimativa ?? 0),
      };
      p.totalSemEstimativa += Number(l.sem_estimativa ?? 0);
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhasRpc]);

  return (
    <PageShell>
      <PageTitle
        titulo="Carga de trabalho"
        estado={`Estimativas das próximas ${SEMANAS} semanas contra a capacidade de cada pessoa. Clique numa célula para ver o que compõe o número.`}
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar a carga: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando carga…</p>
      ) : pessoas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Gauge className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma tarefa estimada nas próximas semanas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-[240px] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Pessoa
                </th>
                <th className="w-[120px] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Capacidade
                </th>
                {semanas.map((s) => (
                  <th
                    key={iso(s)}
                    className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {format(s, "dd/MM", { locale: ptBR })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.userId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <p className="truncate font-medium">{p.nome}</p>
                    {p.totalSemEstimativa > 0 && (
                      <p className="flex items-center gap-1 text-[11px] text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        {p.totalSemEstimativa} sem estimativa no período
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {podeEditar ? (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={p.horasSemana}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          const horas = Number(e.target.value);
                          if (!Number.isFinite(horas) || horas < 0 || horas === p.horasSemana) return;
                          salvarCapacidade.mutate({ userId: p.userId, horas });
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground">{p.horasSemana}h/sem</span>
                    )}
                  </td>
                  {semanas.map((s) => {
                    const chave = iso(s);
                    const c = p.celulas[chave] ?? { horas: 0, semEstimativa: 0 };
                    const tom = tomDaCarga(c.horas, p.horasSemana);
                    const pct = p.horasSemana > 0 ? Math.round((c.horas / p.horasSemana) * 100) : 0;
                    return (
                      <td key={chave} className="p-1 align-top">
                        <button
                          onClick={() =>
                            setDrill({
                              userId: p.userId,
                              nome: p.nome,
                              inicio: chave,
                              fim: iso(addDays(s, 6)),
                            })
                          }
                          className={cn(
                            "w-full rounded-md border px-2 py-1.5 text-center transition hover:brightness-105",
                            CLASSE_TOM[tom]
                          )}
                        >
                          <span className="block text-sm font-medium">
                            {c.horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h
                          </span>
                          <span className="block text-[10px] opacity-80">{pct}%</span>
                          {c.semEstimativa > 0 && (
                            <span className="mt-0.5 block text-[10px] font-medium">
                              {c.semEstimativa} sem estimativa
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SheetDrill
        drill={drill}
        onFechar={() => setDrill(null)}
        onAbrirTarefa={abrirTarefa}
      />
    </PageShell>
  );
}

function SheetDrill({
  drill,
  onFechar,
  onAbrirTarefa,
}: {
  drill: { userId: string; nome: string; inicio: string; fim: string } | null;
  onFechar: () => void;
  onAbrirTarefa: (id: string) => void;
}) {
  const { data, isLoading, error } = useCargaDetalhe(
    drill?.userId ?? null,
    drill?.inicio ?? null,
    drill?.fim ?? null
  );
  // as funções de carga já aplicam suas regras no banco — não filtrar de novo aqui
  const linhas = data ?? [];

  return (
    <Sheet open={!!drill} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle>
            {drill?.nome}
            {drill && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {format(new Date(`${drill.inicio}T00:00:00`), "dd/MM")} a{" "}
                {format(new Date(`${drill.fim}T00:00:00`), "dd/MM")}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {error ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar as tarefas: {(error as Error).message}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando tarefas…</p>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa nessa semana.</p>
          ) : (
            linhas.map((t) => (
              <button
                key={t.id}
                onClick={() => onAbrirTarefa(t.id)}
                className="w-full rounded-md border border-border p-2 text-left transition hover:bg-accent"
              >
                <p className="text-sm font-medium">{t.titulo}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {rotuloStatus(t.status)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {PRIORIDADE_ROTULO[t.prioridade] ?? t.prioridade}
                  </Badge>
                  {t.data_limite && <span>vence {format(new Date(`${t.data_limite}T00:00:00`), "dd/MM")}</span>}
                  <span
                    className={cn(
                      t.estimativa_horas == null && "font-medium text-warning"
                    )}
                  >
                    {t.estimativa_horas == null ? "sem estimativa" : `${t.estimativa_horas}h`}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
