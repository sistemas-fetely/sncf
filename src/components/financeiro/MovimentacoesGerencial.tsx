import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowUpRight, Layers, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import {
  useMovimentacoesGerencial,
  type MovimentacaoGerencial,
} from "@/hooks/financeiro/useMovimentacoesGerencial";

const SEM_CLASSIFICACAO = "__sem__";

type Agrupamento = "plano" | "centro";

function competenciaAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function mesAnteriorISO(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function labelMesCurto(iso: string): string {
  const [y, m] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  const s = dt
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(".", "")
    .replace(" de ", "/");
  return s.replace(" ", "/");
}

function labelMesLongo(iso: string): string {
  const [y, m] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function statusLabel(l: MovimentacaoGerencial): { label: string; tip?: string; tone: string } {
  const s = (l.status || "").toLowerCase();
  if (s === "nao_vinculada") return { label: "NF", tip: "Despesa de NF — pagamento ainda não gerado", tone: "border-amber-300 text-amber-700 bg-amber-50" };
  if (s === "vinculada") return { label: "NF paga/enviada", tone: "border-emerald-300 text-emerald-700 bg-emerald-50" };
  if (s === "parcial") return { label: "Parcial", tone: "border-blue-300 text-blue-700 bg-blue-50" };
  if (s === "pago" || s === "enviado_para_pagamento") return { label: "Pago", tone: "border-emerald-300 text-emerald-700 bg-emerald-50" };
  if (s === "aberto") return { label: "Aberto", tone: "border-slate-300 text-slate-700 bg-slate-50" };
  if (s === "cancelado") return { label: "Cancelado", tone: "border-red-300 text-red-700 bg-red-50" };
  return { label: l.status || "—", tone: "border-slate-300 text-slate-700 bg-slate-50" };
}

export default function MovimentacoesGerencial() {
  const navigate = useNavigate();
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("plano");
  const [drill, setDrill] = useState<{ chave: string; nome: string; competencia: string | null } | null>(null);

  const { data: linhas = [], isLoading } = useMovimentacoesGerencial(null, "pagar");

  // Competências com dados (colunas da matriz)
  const competencias = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) if (l.competencia) set.add(l.competencia);
    return Array.from(set).sort();
  }, [linhas]);

  // Linhas agrupadas
  type LinhaMatriz = {
    chave: string;
    nome: string;
    porMes: Map<string, number>;
    total: number;
    itens: MovimentacaoGerencial[];
  };

  const matriz = useMemo<LinhaMatriz[]>(() => {
    const map = new Map<string, LinhaMatriz>();
    for (const l of linhas) {
      const chave =
        agrupamento === "plano"
          ? l.plano_contas_id || SEM_CLASSIFICACAO
          : l.centro_custo_id || SEM_CLASSIFICACAO;
      const nome =
        agrupamento === "plano"
          ? l.plano_contas_nome || "Sem classificação"
          : l.centro_custo_nome || "Sem centro de custo";
      let row = map.get(chave);
      if (!row) {
        row = { chave, nome, porMes: new Map(), total: 0, itens: [] };
        map.set(chave, row);
      }
      const v = Number(l.valor || 0);
      row.porMes.set(l.competencia, (row.porMes.get(l.competencia) || 0) + v);
      row.total += v;
      row.itens.push(l);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.chave === SEM_CLASSIFICACAO) return 1;
      if (b.chave === SEM_CLASSIFICACAO) return -1;
      return b.total - a.total;
    });
  }, [linhas, agrupamento]);

  const totaisMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of competencias) m.set(c, 0);
    for (const row of matriz) {
      for (const [c, v] of row.porMes) m.set(c, (m.get(c) || 0) + v);
    }
    return m;
  }, [matriz, competencias]);

  const totalPeriodo = useMemo(
    () => Array.from(totaisMes.values()).reduce((s, v) => s + v, 0),
    [totaisMes],
  );
  const mediaMensal = competencias.length > 0 ? totalPeriodo / competencias.length : 0;

  const mesCorrente = competenciaAtualISO();
  const totalCorrente = totaisMes.get(mesCorrente) || 0;
  const totalAnterior = totaisMes.get(mesAnteriorISO(mesCorrente)) || 0;
  const variacao =
    totalAnterior > 0 && totalCorrente > 0
      ? ((totalCorrente - totalAnterior) / totalAnterior) * 100
      : null;

  const qtd = linhas.length;
  const qtdCompletas = linhas.filter((l) => l.classificacao_completa).length;
  const pctCompletas = qtd > 0 ? Math.round((qtdCompletas / qtd) * 100) : 100;

  // Drill down items
  const drillItens = useMemo<MovimentacaoGerencial[]>(() => {
    if (!drill) return [];
    return linhas.filter((l) => {
      const k =
        agrupamento === "plano"
          ? l.plano_contas_id || SEM_CLASSIFICACAO
          : l.centro_custo_id || SEM_CLASSIFICACAO;
      if (k !== drill.chave) return false;
      if (drill.competencia && l.competencia !== drill.competencia) return false;
      return true;
    });
  }, [drill, linhas, agrupamento]);

  const drillTotal = drillItens.reduce((s, l) => s + Number(l.valor || 0), 0);

  function abrirDrill(chave: string, nome: string, competencia: string | null) {
    setDrill({ chave, nome, competencia });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {/* Toggle */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={agrupamento === "plano" ? "default" : "outline"}
              onClick={() => setAgrupamento("plano")}
              className={agrupamento === "plano" ? "bg-admin hover:bg-admin/90" : ""}
            >
              Por Plano de Contas
            </Button>
            <Button
              size="sm"
              variant={agrupamento === "centro" ? "default" : "outline"}
              onClick={() => setAgrupamento("centro")}
              className={agrupamento === "centro" ? "bg-admin hover:bg-admin/90" : ""}
            >
              Por Centro de Custo
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total do período</div>
              <div className="text-2xl font-bold font-mono mt-1">{formatBRL(totalPeriodo)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {competencias.length} {competencias.length === 1 ? "mês" : "meses"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Média mensal</div>
              <div className="text-2xl font-bold font-mono mt-1">{formatBRL(mediaMensal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{labelMesLongo(mesCorrente)}</div>
              <div className="text-2xl font-bold font-mono mt-1">{formatBRL(totalCorrente)}</div>
              {variacao !== null && (
                <div
                  className={cn(
                    "text-[11px] mt-0.5 flex items-center gap-1",
                    variacao > 0 ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {variacao > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {variacao > 0 ? "+" : ""}
                  {variacao.toFixed(1)}% vs mês anterior
                </div>
              )}
            </CardContent>
          </Card>
          <Card className={cn(pctCompletas < 100 && "border-amber-300 bg-amber-50/50")}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                Classificação completa
                {pctCompletas < 100 && <AlertCircle className="h-3 w-3 text-amber-600" />}
              </div>
              <div
                className={cn(
                  "text-2xl font-bold mt-1",
                  pctCompletas < 100 ? "text-amber-700" : "text-emerald-700",
                )}
              >
                {pctCompletas}%
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {qtdCompletas}/{qtd} com plano e centro
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Matriz */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : linhas.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma despesa gerencial no período.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/administrativo-fetely/nfs-stage")}
                className="gap-2"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Ir para NFs Stage
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader className="bg-muted/60 sticky top-0">
                <TableRow>
                  <TableHead className="min-w-[240px]">
                    {agrupamento === "plano" ? "Plano de contas" : "Centro de custo"}
                  </TableHead>
                  {competencias.map((c) => (
                    <TableHead key={c} className="text-right whitespace-nowrap">
                      {labelMesCurto(c)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right whitespace-nowrap border-l">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap w-20">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matriz.map((row) => {
                  const semClass = row.chave === SEM_CLASSIFICACAO;
                  const pct = totalPeriodo > 0 ? (row.total / totalPeriodo) * 100 : 0;
                  return (
                    <TableRow key={row.chave} className={cn(semClass && "bg-amber-50/50")}>
                      <TableCell>
                        <button
                          className="text-left font-medium hover:underline flex items-center gap-2"
                          onClick={() => abrirDrill(row.chave, row.nome, null)}
                        >
                          {semClass && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-700 bg-amber-50 gap-1"
                            >
                              <AlertCircle className="h-3 w-3" />
                            </Badge>
                          )}
                          <span>{row.nome}</span>
                        </button>
                      </TableCell>
                      {competencias.map((c) => {
                        const v = row.porMes.get(c);
                        return (
                          <TableCell key={c} className="text-right font-mono text-sm p-2">
                            {v && v > 0 ? (
                              <button
                                className="hover:underline hover:text-admin"
                                onClick={() => abrirDrill(row.chave, row.nome, c)}
                              >
                                {formatBRL(v)}
                              </button>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-mono font-semibold border-l">
                        {formatBRL(row.total)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {pct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Total geral */}
                <TableRow className="bg-muted/70 font-semibold border-t-2">
                  <TableCell>Total geral</TableCell>
                  {competencias.map((c) => (
                    <TableCell key={c} className="text-right font-mono">
                      {formatBRL(totaisMes.get(c) || 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono border-l">
                    {formatBRL(totalPeriodo)}
                  </TableCell>
                  <TableCell className="text-right text-xs">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        {/* Drill-down */}
        <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                {drill?.nome}
                {drill?.competencia && (
                  <span className="text-muted-foreground font-normal">
                    {" — "}
                    {labelMesLongo(drill.competencia)}
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>
                {drillItens.length} lançamento{drillItens.length === 1 ? "" : "s"} ·{" "}
                <span className="font-mono font-semibold">{formatBRL(drillTotal)}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 border rounded-md">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>
                      {agrupamento === "plano" ? "Centro custo" : "Plano"}
                    </TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillItens.map((l) => {
                    const st = statusLabel(l);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">{l.fornecedor_cliente || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                          {l.descricao || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {agrupamento === "plano"
                            ? l.centro_custo_nome || (
                                <span className="text-muted-foreground italic text-xs">sem</span>
                              )
                            : l.plano_contas_nome || (
                                <span className="text-muted-foreground italic text-xs">sem</span>
                              )}
                        </TableCell>
                        <TableCell className="text-xs">{l.nf_numero || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatBRL(Number(l.valor || 0))}
                        </TableCell>
                        <TableCell>
                          {st.tip ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className={cn("text-[10px]", st.tone)}>
                                  {st.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{st.tip}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="outline" className={cn("text-[10px]", st.tone)}>
                              {st.label}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
