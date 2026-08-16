import { useMemo, useState } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { TarefaDetalhePainel } from "@/components/tarefas/detalhe/TarefaDetalhePainel";
import { usePessoasSistema, useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  useReagendarNoCalendario, useTarefasCalendario, type FiltroCalendario,
} from "@/hooks/tarefas/useTarefasCalendario";
import type { Tarefa, TarefaPrioridade } from "@/hooks/tarefas/useTarefas";

import { PageShell } from "@/components/layout/PageShell";
const TODOS = "__todos__";

const COR_PRIORIDADE: Record<TarefaPrioridade, string> = {
  urgente: "border-l-destructive bg-destructive/10 text-destructive",
  alta: "border-l-warning bg-warning/10 text-warning",
  media: "border-l-warning/40 bg-warning/10 text-warning",
  baixa: "border-l-border bg-muted text-muted-foreground",
};

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export default function CalendarioTarefas() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { data: pessoas } = usePessoasSistema();
  const { data: projetos } = useProjetos();

  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [responsavelId, setResponsavelId] = useState<string | null>(user?.id ?? null);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [tarefaAberta, setTarefaAberta] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [diaAlvo, setDiaAlvo] = useState<string | null>(null);

  const filtro: FiltroCalendario = { responsavelId, projetoId };

  const { inicioGrade, fimGrade, dias } = useMemo(() => {
    const i = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
    const f = endOfWeek(endOfMonth(mes), { weekStartsOn: 0 });
    return { inicioGrade: i, fimGrade: f, dias: eachDayOfInterval({ start: i, end: f }) };
  }, [mes]);

  const { data: tarefas, isLoading } = useTarefasCalendario(iso(inicioGrade), iso(fimGrade), filtro);
  const reagendar = useReagendarNoCalendario(iso(inicioGrade), iso(fimGrade), filtro);

  const porDia = useMemo(() => {
    const mapa: Record<string, Tarefa[]> = {};
    for (const t of tarefas ?? []) {
      if (!t.data_limite) continue;
      (mapa[t.data_limite] ??= []).push(t);
    }
    return mapa;
  }, [tarefas]);

  const soltar = (dia: string) => {
    if (arrastando) reagendar.mutate({ tarefaId: arrastando, data: dia });
    setArrastando(null);
    setDiaAlvo(null);
  };

  const diasComTarefa = dias.filter((d) => isSameMonth(d, mes) && (porDia[iso(d)]?.length ?? 0) > 0);

  return (
    <PageShell>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-medium tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">
            Prazos no mês. Arraste uma tarefa para outro dia para reagendar.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setMes(startOfMonth(new Date()))}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-medium capitalize">
          {format(mes, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select
            value={responsavelId ?? TODOS}
            onValueChange={(v) => setResponsavelId(v === TODOS ? null : v)}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
              {(pessoas ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projetoId ?? TODOS} onValueChange={(v) => setProjetoId(v === TODOS ? null : v)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os projetos</SelectItem>
              {(projetos ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando prazos…</p>
      ) : isMobile ? (
        <div className="space-y-3">
          {diasComTarefa.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <CalendarDays className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum prazo neste mês.</p>
              </CardContent>
            </Card>
          ) : (
            diasComTarefa.map((d) => (
              <div key={iso(d)} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {format(d, "EEE, dd 'de' MMM", { locale: ptBR })}
                </p>
                {(porDia[iso(d)] ?? []).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTarefaAberta(t.id)}
                    className={cn(
                      "w-full rounded-md border border-l-4 px-2 py-1.5 text-left text-sm",
                      COR_PRIORIDADE[t.prioridade]
                    )}
                  >
                    <span className="line-clamp-2">{t.titulo}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const chaveDia = iso(d);
              const doMes = isSameMonth(d, mes);
              const lista = porDia[chaveDia] ?? [];
              const visiveis = lista.slice(0, 3);
              const extras = lista.length - visiveis.length;
              return (
                <div
                  key={chaveDia}
                  onDragOver={(e) => { e.preventDefault(); setDiaAlvo(chaveDia); }}
                  onDragLeave={() => setDiaAlvo((v) => (v === chaveDia ? null : v))}
                  onDrop={(e) => { e.preventDefault(); soltar(chaveDia); }}
                  className={cn(
                    "min-h-[110px] space-y-1 border-b border-r border-border p-1.5",
                    !doMes && "bg-muted/30 text-muted-foreground/60",
                    diaAlvo === chaveDia && "ring-2 ring-inset ring-primary"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isSameDay(d, new Date()) &&
                          "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground"
                      )}
                    >
                      {format(d, "d")}
                    </span>
                  </div>
                  {visiveis.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setArrastando(t.id)}
                      onDragEnd={() => { setArrastando(null); setDiaAlvo(null); }}
                      onClick={() => setTarefaAberta(t.id)}
                      className={cn(
                        "cursor-pointer truncate rounded border border-l-[3px] px-1 py-0.5 text-[11px]",
                        COR_PRIORIDADE[t.prioridade]
                      )}
                      title={t.titulo}
                    >
                      {t.titulo}
                    </div>
                  ))}
                  {extras > 0 && (
                    <p className="px-1 text-[11px] font-medium text-muted-foreground">+{extras}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TarefaDetalhePainel
        tarefaId={tarefaAberta}
        aberto={!!tarefaAberta}
        onOpenChange={(v) => !v && setTarefaAberta(null)}
      />
    </PageShell>
  );
}
