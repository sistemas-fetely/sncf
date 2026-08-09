import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AlertaDivergencia from "./AlertaDivergencia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CicloXpm = {
  codigo: string;
  canal: "B2B" | "B2C" | "SEM NF";
  pedido_sncf: string | null;
  cliente_sncf: string | null;
  destinatario_nome: string | null;
  uf: string | null;
  estagio_codigo: string;
  estagio_seq: number;
  quantidade_volumes: number | null;
  peso_bruto: number | null;
  data_expedicao: string | null;
  t_solicitado: string | null;
  t_embarcado: string | null;
  t_expedido: string | null;
  horas_ciclo_bruto: number | null;
  horas_pausadas: number;
  horas_ciclo_liquido: number | null;
  horas_em_curso_liquido: number | null;
  qtd_pausas: number;
  pausada_agora: boolean;
  concluida: boolean;
  pedido_loja: string | null;
  numero_pedido_loja: string | null;
  cidade_entrega: string | null;
  pedido_display: string | null;
  uf_display: string | null;
  farol: "concluida" | "pausada" | "risco" | "atencao" | "no_prazo";
  limiar_atencao: number | null;
  limiar_risco: number | null;
};

function BadgeFarol({ farol }: { farol: CicloXpm["farol"] }) {
  if (farol === "risco") return <Badge variant="destructive">Risco</Badge>;
  if (farol === "atencao") return <Badge variant="secondary">Atenção</Badge>;
  if (farol === "pausada") return <Badge variant="outline">Pausada</Badge>;
  if (farol === "concluida") return <Badge variant="outline">Concluída</Badge>;
  return <Badge variant="outline">No prazo</Badge>;
}

const CANAIS: CicloXpm["canal"][] = ["B2B", "B2C", "SEM NF"];

const nfInt = new Intl.NumberFormat("pt-BR");
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function h1(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(1);
}

function percentil(ordenado: number[], p: number) {
  if (ordenado.length === 0) return null;
  const idx = Math.min(ordenado.length - 1, Math.max(0, Math.ceil(p * ordenado.length) - 1));
  return ordenado[idx];
}

function mediana(ordenado: number[]) {
  if (ordenado.length === 0) return null;
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 === 1
    ? ordenado[meio]
    : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

function estatisticas(valores: number[]) {
  const ord = [...valores].sort((a, b) => a - b);
  return {
    n: ord.length,
    media: ord.length ? ord.reduce((s, v) => s + v, 0) / ord.length : null,
    mediana: mediana(ord),
    p90: percentil(ord, 0.9),
    melhor: ord.length ? ord[0] : null,
    pior: ord.length ? ord[ord.length - 1] : null,
  };
}

const OPACIDADE: Record<string, string> = {
  B2B: "opacity-100",
  B2C: "opacity-70",
  "SEM NF": "opacity-40",
};

export default function PainelXpm() {
  const [periodo, setPeriodo] = useState("90");

  const cicloQ = useQuery({
    queryKey: ["xpm-ciclo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_risco_atraso")
        .select("*")
        .order("data_expedicao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CicloXpm[];
    },
  });

  const rows = cicloQ.data ?? [];

  const noPeriodo = useMemo(() => {
    const dias = Number(periodo);
    const corte = Date.now() - dias * 86400000;
    return rows.filter((r) => {
      if (!r.data_expedicao) return false;
      const t = new Date(r.data_expedicao).getTime();
      return !Number.isNaN(t) && t >= corte;
    });
  }, [rows, periodo]);

  const concluidas = useMemo(
    () => noPeriodo.filter((r) => r.concluida === true && r.horas_ciclo_liquido != null),
    [noPeriodo],
  );

  const bloco1 = useMemo(() => {
    const linhas = CANAIS.map((c) => ({
      canal: c as string,
      ...estatisticas(
        concluidas.filter((r) => r.canal === c).map((r) => Number(r.horas_ciclo_liquido)),
      ),
    }));
    linhas.push({
      canal: "Total",
      ...estatisticas(concluidas.map((r) => Number(r.horas_ciclo_liquido))),
    });
    return linhas;
  }, [concluidas]);

  const pausasResumo = useMemo(() => {
    const comPausa = noPeriodo.filter((r) => Number(r.qtd_pausas ?? 0) > 0);
    const horas = noPeriodo.reduce((s, r) => s + Number(r.horas_pausadas ?? 0), 0);
    return { n: comPausa.length, horas };
  }, [noPeriodo]);

  const faixas = useMemo(() => {
    const defs = [
      { label: "até 24h", ok: (v: number) => v <= 24 },
      { label: "24–48h", ok: (v: number) => v > 24 && v <= 48 },
      { label: "48–72h", ok: (v: number) => v > 48 && v <= 72 },
      { label: "acima de 72h", ok: (v: number) => v > 72 },
    ];
    return defs.map((d) => ({
      label: d.label,
      series: CANAIS.map((c) => {
        const doCanal = concluidas.filter((r) => r.canal === c);
        const n = doCanal.filter((r) => d.ok(Number(r.horas_ciclo_liquido))).length;
        return {
          canal: c as string,
          n,
          pct: doCanal.length ? (n / doCanal.length) * 100 : 0,
        };
      }),
    }));
  }, [concluidas]);

  const maiorFaixa = useMemo(
    () => Math.max(1, ...faixas.flatMap((f) => f.series.map((s) => s.n))),
    [faixas],
  );

  const tendencia = useMemo(() => {
    const mapa = new Map<string, number[]>();
    for (const r of rows) {
      if (r.concluida !== true || r.horas_ciclo_liquido == null || !r.t_expedido) continue;
      const mes = String(r.t_expedido).slice(0, 7);
      const arr = mapa.get(mes) ?? [];
      arr.push(Number(r.horas_ciclo_liquido));
      mapa.set(mes, arr);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 6)
      .map(([mes, valores]) => ({ mes, ...estatisticas(valores) }));
  }, [rows]);

  const emCurso = useMemo(
    () =>
      noPeriodo
        .filter((r) => r.concluida === false)
        .sort(
          (a, b) => Number(b.horas_em_curso_liquido ?? 0) - Number(a.horas_em_curso_liquido ?? 0),
        ),
    [noPeriodo],
  );

  const pausadas = useMemo(() => noPeriodo.filter((r) => r.pausada_agora === true), [noPeriodo]);

  const volume = useMemo(
    () => ({
      expedicoes: concluidas.length,
      volumes: concluidas.reduce((s, r) => s + Number(r.quantidade_volumes ?? 0), 0),
      peso: concluidas.reduce((s, r) => s + Number(r.peso_bruto ?? 0), 0),
    }),
    [concluidas],
  );

  if (cicloQ.isError) {
    return (
      <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-8">
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {(cicloQ.error as Error)?.message ?? "Erro ao carregar o ciclo das expedições"}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cicloQ.isLoading) {
    return (
      <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-8 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Painel XPM</h1>
          <p className="text-sm text-muted-foreground">
            Ciclo do armazém, do pedido solicitado à expedição efetiva.
          </p>
        </div>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="md:w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <AlertaDivergencia />



      {noPeriodo.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nenhuma expedição no período escolhido.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ciclo total, por canal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Expedições</TableHead>
                      <TableHead className="text-right">Média</TableHead>
                      <TableHead className="text-right">Mediana</TableHead>
                      <TableHead className="text-right">P90</TableHead>
                      <TableHead className="text-right">Melhor</TableHead>
                      <TableHead className="text-right">Pior</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bloco1.map((l) => (
                      <TableRow key={l.canal} className={l.canal === "Total" ? "font-medium" : ""}>
                        <TableCell>{l.canal}</TableCell>
                        <TableCell className="text-right tabular-nums">{nfInt.format(l.n)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.media)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.mediana)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.p90)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.melhor)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.pior)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                {pausasResumo.n === 0
                  ? "Nenhuma pausa registrada no período."
                  : `${nfInt.format(pausasResumo.n)} expedições tiveram pausa no período, somando ${h1(
                      pausasResumo.horas,
                    )} h descontadas do ciclo.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuição do ciclo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {faixas.map((f) => (
                <div key={f.label} className="space-y-1">
                  <div className="text-sm font-medium">{f.label}</div>
                  {f.series.map((s) => (
                    <div key={s.canal} className="flex items-center gap-2">
                      <span className="w-16 text-xs text-muted-foreground">{s.canal}</span>
                      <div className="flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                        <div
                          className={`h-full bg-primary ${OPACIDADE[s.canal] ?? ""}`}
                          style={{ width: `${(s.n / maiorFaixa) * 100}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
                        {nfInt.format(s.n)} · {s.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendência mensal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Expedições</TableHead>
                      <TableHead className="text-right">Ciclo médio</TableHead>
                      <TableHead className="text-right">P90</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tendencia.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          Sem expedições concluídas com carimbo de expedição.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tendencia.map((t) => (
                        <TableRow key={t.mes}>
                          <TableCell className="tabular-nums">{t.mes}</TableCell>
                          <TableCell className="text-right tabular-nums">{nfInt.format(t.n)}</TableCell>
                          <TableCell className="text-right tabular-nums">{h1(t.media)}</TableCell>
                          <TableCell className="text-right tabular-nums">{h1(t.p90)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila atual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Em curso</div>
                    <div className="text-2xl font-semibold">{nfInt.format(emCurso.length)}</div>
                  </CardContent>
                </Card>
                <Card className={pausadas.length > 0 ? "border-amber-500/50" : undefined}>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Pausadas</div>
                    <div className="text-2xl font-semibold">{nfInt.format(pausadas.length)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Mais antiga em curso</div>
                    <div className="text-2xl font-semibold">
                      {emCurso.length === 0 || emCurso[0].horas_em_curso_liquido == null
                        ? "—"
                        : `${(Number(emCurso[0].horas_em_curso_liquido) / 24).toFixed(1)} d`}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-[90px]">Canal</TableHead>
                      <TableHead className="w-[160px]">Estágio</TableHead>
                      <TableHead className="text-right w-[130px]">Horas em curso</TableHead>
                      <TableHead className="w-[110px]">Pausada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emCurso.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          Nenhuma expedição em curso.
                        </TableCell>
                      </TableRow>
                    ) : (
                      emCurso.map((r) => (
                        <TableRow key={r.codigo}>
                          <TableCell>
                            <div className={r.pedido_sncf ? "font-medium" : "font-mono text-xs"}>
                              {r.pedido_sncf ?? r.codigo}
                            </div>
                            <div className="text-xs text-muted-foreground">XPM {r.codigo}</div>
                          </TableCell>
                          <TableCell className="max-w-[260px] truncate">
                            {r.cliente_sncf ?? r.destinatario_nome ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.canal === "B2B" ? "default" : r.canal === "B2C" ? "secondary" : "outline"
                              }
                            >
                              {r.canal}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.estagio_codigo}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {h1(r.horas_em_curso_liquido)}
                          </TableCell>
                          <TableCell>
                            {r.pausada_agora ? <Badge variant="secondary">Pausada</Badge> : null}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Volume expedido no período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Expedições concluídas</div>
                    <div className="text-2xl font-semibold">{nfInt.format(volume.expedicoes)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Volumes</div>
                    <div className="text-2xl font-semibold">{nfInt.format(volume.volumes)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Peso bruto</div>
                    <div className="text-2xl font-semibold">{nf2.format(volume.peso)} kg</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        A XPM registra horário real apenas em Solicitado, Embarcado e Expedido. Separação, conferência e
        nota fiscal entram em lote e não têm carimbo próprio — por isso não há tempo por etapa.
      </p>
    </div>
  );
}
