import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AlertaDivergencia from "./AlertaDivergencia";
import FunilFases from "./FunilFases";
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
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

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
  horas_sla: number | null;
  horas_cliente: number | null;
  horas_xpm: number | null;
  horas_fim_de_semana: number;
  dentro_sla_cliente: boolean | null;
  dentro_sla_xpm: boolean | null;
  horas_excedidas_cliente: number | null;
  horas_excedidas_xpm: number | null;
  estouro_so_por_fim_de_semana: boolean | null;
};

function corAderencia(pct: number | null) {
  if (pct == null) return "bg-muted";
  if (pct < 50) return "bg-destructive";
  if (pct < 80) return "bg-warning";
  return "bg-success";
}

function textoAderencia(pct: number | null) {
  if (pct == null) return "";
  if (pct < 50) return "text-destructive";
  if (pct < 80) return "text-warning";
  return "text-success";
}

function BarraAderencia({ pct }: { pct: number | null }) {
  return (
    <div className="mt-1 h-1 w-full rounded-sm bg-muted overflow-hidden">
      <div
        className={`h-full ${corAderencia(pct)}`}
        style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }}
      />
    </div>
  );
}

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

// Acima de 48h a leitura em horas perde sentido operacional: virou dia.
function fmtDuracao(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n > 48) return `${Math.round(n / 24)} d`;
  return `${n.toFixed(1)} h`;
}


type Estatistica = { canal: string; n: number; media: number | null; mediana: number | null; p90: number | null; melhor: number | null; pior: number | null };
type PainelDados = {
  bloco1: Estatistica[]; pausas: { n: number; horas: number };
  faixas: { label: string; series: { canal: string; n: number; pct: number }[] }[];
  tendencia: (Estatistica & { mes: string })[];
  farol_fila: { risco: number; atencao: number; noPrazo: number; pausadas: number };
  aderencia: { canal: string; meta: number | null; n: number; pctCliente: number | null; okCliente: number; pctXpm: number | null; okXpm: number; excesso: number | null; soFimDeSemana: number }[];
  volume: { expedicoes: number; volumes: number; peso: number };
  em_curso: CicloXpm[]; pausadas: CicloXpm[]; precisam_atencao: CicloXpm[];
};

const OPACIDADE: Record<string, string> = {
  B2B: "opacity-100",
  B2C: "opacity-70",
  "SEM NF": "opacity-40",
};

export default function PainelXpm() {
  const [periodo, setPeriodo] = useState("90");

  const cicloQ = useQuery({
    queryKey: ["xpm-ciclo", periodo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_painel_xpm" as never, { p_dias: Number(periodo) } as never);
      if (error) throw error;
      if (!data) throw new Error("Erro ao carregar o ciclo das expedições");
      return data as unknown as PainelDados;
    },
  });
  const bloco1 = cicloQ.data?.bloco1 ?? [];
  const pausasResumo = cicloQ.data?.pausas ?? { n: 0, horas: 0 };
  const faixas = cicloQ.data?.faixas ?? [];
  const maiorFaixa = useMemo(() => Math.max(1, ...faixas.flatMap(f => f.series.map(s => s.n))), [faixas]);
  const tendencia = cicloQ.data?.tendencia ?? [];
  const emCurso = cicloQ.data?.em_curso ?? [];
  const pausadas = cicloQ.data?.pausadas ?? [];
  const precisamAtencao = cicloQ.data?.precisam_atencao ?? [];
  const farolFila = cicloQ.data?.farol_fila ?? { risco: 0, atencao: 0, noPrazo: 0, pausadas: 0 };
  const aderencia = cicloQ.data?.aderencia ?? [];
  const volume = cicloQ.data?.volume ?? { expedicoes: 0, volumes: 0, peso: 0 };

  if (cicloQ.isError) {
    return (
      <PageShell>
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            {(cicloQ.error as Error)?.message ?? "Erro ao carregar o ciclo das expedições"}
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (cicloQ.isLoading) {
    return (
      <PageShell>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Painel XPM"
        estado="Ciclo do armazém, do pedido solicitado à expedição efetiva."
        acoes={
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
        }
      />

      <AlertaDivergencia />

      <FunilFases />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risco de atraso</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sem SLA acordado, o limiar vem do próprio histórico: atenção a partir do P75 do canal,
            risco a partir do P90.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className={farolFila.risco > 0 ? "border-destructive/50" : undefined}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Risco</div>
                <div
                  className={`text-2xl font-medium ${
                    farolFila.risco > 0 ? "text-destructive" : ""
                  }`}
                >
                  {nfInt.format(farolFila.risco)}
                </div>
              </CardContent>
            </Card>
            <Card className={farolFila.atencao > 0 ? "border-warning/50" : undefined}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Atenção</div>
                <div
                  className={`text-2xl font-medium ${
                    farolFila.atencao > 0 ? "text-warning" : ""
                  }`}
                >
                  {nfInt.format(farolFila.atencao)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">No prazo</div>
                <div className="text-2xl font-medium">{nfInt.format(farolFila.noPrazo)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground">Pausadas</div>
                <div className="text-2xl font-medium text-muted-foreground">
                  {nfInt.format(farolFila.pausadas)}
                </div>
              </CardContent>
            </Card>
          </div>

          {precisamAtencao.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma expedição em risco.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[90px]">Canal</TableHead>
                    <TableHead className="w-[160px]">Estágio</TableHead>
                    <TableHead className="text-right w-[130px]">Horas em curso</TableHead>
                    <TableHead className="text-right w-[140px]">Limiar do canal</TableHead>
                    <TableHead className="w-[110px]">Farol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {precisamAtencao.map((r) => (
                    <TableRow key={r.codigo}>
                      <TableCell>
                        <div className={r.pedido_display ? "font-medium" : "font-mono text-xs"}>
                          {r.pedido_display ?? r.codigo}
                        </div>
                        <div className="text-xs text-muted-foreground">XPM {r.codigo}</div>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {r.cliente_sncf ?? r.destinatario_nome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.canal === "B2B"
                              ? "default"
                              : r.canal === "B2C"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {r.canal}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.estagio_codigo}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtDuracao(r.horas_em_curso_liquido)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtDuracao(r.farol === "risco" ? r.limiar_risco : r.limiar_atencao)}
                      </TableCell>
                      <TableCell>
                        <BadgeFarol farol={r.farol} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aderência ao SLA</CardTitle>
          <p className="text-sm text-muted-foreground">
            SLA definido pela Fetely. O relógio do cliente conta hora corrida; o da XPM desconta fim
            de semana, conforme a cláusula 3.3 do contrato.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {aderencia.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhuma expedição concluída com SLA definido no período.
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right w-[90px]">Meta (h)</TableHead>
                      <TableHead className="text-right w-[110px]">Expedições</TableHead>
                      <TableHead className="text-right w-[170px]">Aderência cliente</TableHead>
                      <TableHead className="text-right w-[170px]">Aderência XPM</TableHead>
                      <TableHead className="text-right w-[130px]">Excesso médio</TableHead>
                      <TableHead className="text-right w-[150px]">Só por fim de semana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aderencia.map((l) => (
                      <TableRow key={l.canal} className={l.canal === "Total" ? "font-medium" : ""}>
                        <TableCell>{l.canal}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.meta ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nfInt.format(l.n)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`tabular-nums ${textoAderencia(l.pctCliente)}`}>
                            {l.pctCliente == null ? "—" : `${nf2.format(l.pctCliente)}%`}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({nfInt.format(l.okCliente)}/{nfInt.format(l.n)})
                            </span>
                          </div>
                          <BarraAderencia pct={l.pctCliente} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={`tabular-nums ${textoAderencia(l.pctXpm)}`}>
                            {l.pctXpm == null ? "—" : `${nf2.format(l.pctXpm)}%`}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({nfInt.format(l.okXpm)}/{nfInt.format(l.n)})
                            </span>
                          </div>
                          <BarraAderencia pct={l.pctXpm} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{h1(l.excesso)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nfInt.format(l.soFimDeSemana)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                A diferença entre os dois relógios é o custo do fim de semana — não é falha da XPM
                nem atraso operacional.
              </p>
            </>
          )}
        </CardContent>
      </Card>






      {volume.expedicoes === 0 && emCurso.length === 0 && pausadas.length === 0 ? (
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
                    <div className="text-2xl font-medium">{nfInt.format(emCurso.length)}</div>
                  </CardContent>
                </Card>
                <Card className={pausadas.length > 0 ? "border-warning/50" : undefined}>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Pausadas</div>
                    <div className="text-2xl font-medium">{nfInt.format(pausadas.length)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Mais antiga em curso</div>
                    <div className="text-2xl font-medium">
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
                      <TableHead className="w-[110px]">Farol</TableHead>
                      <TableHead className="w-[110px]">Pausada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emCurso.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          Nenhuma expedição em curso.
                        </TableCell>
                      </TableRow>
                    ) : (
                      emCurso.map((r) => (
                        <TableRow key={r.codigo}>
                          <TableCell>
                            <div className={r.pedido_display ? "font-medium" : "font-mono text-xs"}>
                              {r.pedido_display ?? r.codigo}
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
                            <BadgeFarol farol={r.farol} />
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
                    <div className="text-2xl font-medium">{nfInt.format(volume.expedicoes)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Volumes</div>
                    <div className="text-2xl font-medium">{nfInt.format(volume.volumes)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground">Peso bruto</div>
                    <div className="text-2xl font-medium">{nf2.format(volume.peso)} kg</div>
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
    </PageShell>
  );
}
