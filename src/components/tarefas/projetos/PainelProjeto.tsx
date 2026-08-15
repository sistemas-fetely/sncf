import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flag, ShieldAlert } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import {
  SAUDE_CLASSE, SAUDE_ROTULO, usePodeAprovarTarefas, useTarefasDoProjeto,
  type ProjetoSaude,
} from "@/hooks/tarefas/useProjetosTarefas";
import {
  montarBurndown, usePublicarStatusReport, useStatusReports, useTarefasBloqueadas,
} from "@/hooks/tarefas/useProjetoPainel";

interface Props {
  projetoId: string;
}

export function PainelProjeto({ projetoId }: Props) {
  const { user } = useAuth();
  const { data: tarefas } = useTarefasDoProjeto(projetoId);
  const { data: reports } = useStatusReports(projetoId);
  const { data: podeAprovar } = usePodeAprovarTarefas(user?.id);
  const publicar = usePublicarStatusReport(projetoId);
  const nomePessoa = useNomePessoa();

  const ids = useMemo(() => (tarefas ?? []).map((t) => t.id), [tarefas]);
  const { data: bloqueios } = useTarefasBloqueadas(projetoId, ids);

  const total = tarefas?.length ?? 0;
  const concluidas = (tarefas ?? []).filter((t) => t.status === "concluida").length;
  const pct = total ? Math.round((concluidas / total) * 100) : 0;

  const porResponsavel = useMemo(() => {
    const mapa = new Map<string, { abertas: number; concluidas: number }>();
    for (const t of tarefas ?? []) {
      const chave = t.responsavel_id ?? "__sem__";
      const atual = mapa.get(chave) ?? { abertas: 0, concluidas: 0 };
      if (t.status === "concluida") atual.concluidas += 1;
      else if (t.status !== "cancelada") atual.abertas += 1;
      mapa.set(chave, atual);
    }
    return [...mapa.entries()].sort((a, b) => b[1].abertas - a[1].abertas);
  }, [tarefas]);

  const burndown = useMemo(() => montarBurndown(tarefas ?? []), [tarefas]);
  const marcos = useMemo(() => (tarefas ?? []).filter((t) => t.tipo_tarefa === "marco"), [tarefas]);
  const tituloPorId = useMemo(
    () => new Map((tarefas ?? []).map((t) => [t.id, t.titulo])),
    [tarefas]
  );

  const [saude, setSaude] = useState<ProjetoSaude>("no_prazo");
  const [resumo, setResumo] = useState("");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Progresso</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold">{pct}%</span>
            <span className="text-sm text-muted-foreground">{concluidas}/{total} concluídas</span>
          </div>
          <Progress value={pct} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Por responsável</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {porResponsavel.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas.</p>}
          {porResponsavel.map(([id, c]) => (
            <div key={id} className="flex items-center justify-between text-sm">
              <span className="truncate">{id === "__sem__" ? "Sem responsável" : nomePessoa(id)}</span>
              <span className="shrink-0 text-muted-foreground">
                {c.abertas} abertas · {c.concluidas} concluídas
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Burndown (30 dias)</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={burndown}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <ChartTooltip />
              <Line type="monotone" dataKey="restantes" name="Abertas" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Marcos</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {marcos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum marco definido.</p>}
          {marcos.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <Flag className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.data_limite ? format(parseISO(m.data_limite), "dd/MM/yy", { locale: ptBR }) : "sem data"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Tarefas bloqueadas</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {(bloqueios ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nada bloqueado.</p>
          )}
          {(bloqueios ?? []).map((b) => (
            <div key={b.tarefa_id} className="space-y-0.5 text-sm">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 truncate">{tituloPorId.get(b.tarefa_id) ?? "Tarefa"}</span>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                Espera: {b.bloqueadores.join(", ")}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Status report</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {podeAprovar ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={saude} onValueChange={(v) => setSaude(v as ProjetoSaude)}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_prazo">No prazo</SelectItem>
                    <SelectItem value="em_risco">Em risco</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!resumo.trim() || publicar.isPending}
                  onClick={async () => {
                    await publicar.mutateAsync({ saude, resumo: resumo.trim() });
                    setResumo("");
                  }}
                >
                  Publicar status
                </Button>
              </div>
              <Textarea
                rows={3}
                value={resumo}
                onChange={(e) => setResumo(e.target.value)}
                placeholder="O que aconteceu, o que travou, o que vem agora."
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Você pode ler o histórico, mas não publicar novos status.
            </p>
          )}

          <div className="space-y-2">
            {(reports ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum status publicado ainda.</p>
            )}
            {(reports ?? []).map((r) => (
              <div key={r.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", SAUDE_CLASSE[r.saude])}>
                    {SAUDE_ROTULO[r.saude]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(r.criado_em), "dd/MM/yy HH:mm", { locale: ptBR })}
                    {r.criado_por ? ` · ${nomePessoa(r.criado_por)}` : ""}
                  </span>
                </div>
                {r.resumo && <p className="whitespace-pre-wrap text-sm">{r.resumo}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
