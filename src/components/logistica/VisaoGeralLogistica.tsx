import { useMemo, useState } from "react";
import {
  Loader2, TrendingUp, TrendingDown, DollarSign, Percent, Package, AlertTriangle,
  Truck, CheckCircle2, RotateCcw, Filter, MapPin, BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLogisticaPnl } from "@/hooks/logistica/useLogisticaPnl";
import { useRastreioNf } from "@/hooks/logistica/useRastreioNf";
import { useLogisticaCustoTransportadora } from "@/hooks/logistica/useLogisticaCustoTransportadora";
import { useTranspFretesUf } from "@/hooks/logistica/useTranspFretesUf";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");
const n = (v: number | null | undefined) => Number(v ?? 0);

// Normaliza nome para match tolerante entre P&L/custo (nome do parceiro)
// e rastreio (nome da NF). Ex: "ICARO EXPRESS LOGISTICS" ~ "ICARO EXPRESS LOGISTICS LTDA".
function normalizeTransp(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(LTDA|S\.?A\.?|ME|EPP|EIRELI|MEI|CIA)\b\.?/g, "")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transpToken(raw: string | null | undefined): string {
  const n = normalizeTransp(raw);
  return n.split(" ")[0] ?? "";
}

function matchesTransp(rowName: string | null | undefined, selected: string): boolean {
  if (!selected) return true;
  const a = normalizeTransp(rowName);
  const b = normalizeTransp(selected);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const ta = transpToken(rowName);
  const tb = transpToken(selected);
  return !!ta && ta === tb;
}

function StatCardMini({
  label, value, icon: Icon, tone, hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "info" | "warning" | "destructive" | "default";
  hint?: string;
}) {
  const toneCls =
    tone === "success" ? "bg-success/10 text-success"
    : tone === "info" ? "bg-info/10 text-info"
    : tone === "warning" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    : tone === "destructive" ? "bg-destructive/10 text-destructive"
    : "bg-primary/10 text-primary";
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
        {hint ? <div className="text-[11px] text-muted-foreground truncate">{hint}</div> : null}
      </div>
    </div>
  );
}

function mesLabel(mes: string): string {
  const d = new Date(mes.length === 10 ? `${mes}T00:00:00` : mes);
  if (isNaN(d.getTime())) return mes;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function VisaoGeralLogistica() {
  const pnlQuery = useLogisticaPnl();
  const rastreioQuery = useRastreioNf();
  const custoTranspQuery = useLogisticaCustoTransportadora();
  const custoUfQuery = useTranspFretesUf();

  const [selected, setSelected] = useState<string>(""); // "" = Geral

  const pnlAll = pnlQuery.data ?? [];
  const rastreioAll = rastreioQuery.data ?? [];
  const custoTranspAll = custoTranspQuery.data ?? [];
  const custoUfAll = custoUfQuery.data ?? [];

  // Opções de transportadora vêm do P&L (fonte canônica)
  const opcoesTransp = useMemo(() => {
    const set = new Set<string>();
    for (const r of pnlAll) if (r.transportadora) set.add(r.transportadora);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [pnlAll]);

  // Aplica filtro
  const pnlRows = useMemo(
    () => (selected ? pnlAll.filter((r) => matchesTransp(r.transportadora, selected)) : pnlAll),
    [pnlAll, selected]
  );
  const rastreioRows = useMemo(
    () => (selected ? rastreioAll.filter((r) => matchesTransp(r.transportadora_nome, selected)) : rastreioAll),
    [rastreioAll, selected]
  );
  const custoTranspRows = useMemo(
    () => (selected ? custoTranspAll.filter((r) => matchesTransp(r.transportadora, selected)) : custoTranspAll),
    [custoTranspAll, selected]
  );
  // vw_transp_fretes tem só transportadora_id; resolve os ids das transportadoras selecionadas.
  const idsSelecionados = useMemo(() => {
    if (!selected) return null;
    const ids = new Set<string>();
    for (const r of custoTranspAll) {
      if (r.transportadora_id && matchesTransp(r.transportadora, selected)) ids.add(r.transportadora_id);
    }
    return ids;
  }, [custoTranspAll, selected]);
  const custoUfRows = useMemo(
    () => (idsSelecionados ? custoUfAll.filter((r) => r.transportadora_id && idsSelecionados.has(r.transportadora_id)) : custoUfAll),
    [custoUfAll, idsSelecionados]
  );


  // Agregados P&L
  const totais = useMemo(() => {
    const receita = pnlRows.reduce((a, r) => a + n(r.receita_frete), 0);
    const custo = pnlRows.reduce((a, r) => a + n(r.custo_frete), 0);
    const margem = pnlRows.reduce((a, r) => a + n(r.margem), 0);
    const baseNf = pnlRows.reduce((a, r) => a + n(r.base_nf), 0);
    const baseNfComFrete = pnlRows.reduce((a, r) => a + n(r.base_nf_com_frete), 0);
    const nfs = pnlRows.reduce((a, r) => a + n(r.nfs), 0);
    const nfsComFrete = pnlRows.reduce((a, r) => a + n(r.nfs_com_frete), 0);
    const nfsSemFrete = Math.max(nfs - nfsComFrete, 0);
    const pctRec = custo > 0 ? (receita / custo) * 100 : 0;
    const pctNf = baseNfComFrete > 0 ? (receita / baseNfComFrete) * 100 : 0;
    const subsidio = custo - receita;
    const pctBancado = baseNf > 0 ? (subsidio / baseNf) * 100 : 0;
    return {
      receita, custo, margem, baseNf, baseNfComFrete, nfs, nfsComFrete, nfsSemFrete,
      pctRec, pctNf, subsidio, pctBancado,
    };
  }, [pnlRows]);

  // Série mensal
  const serieMensal = useMemo(() => {
    const map = new Map<string, { mes: string; receita: number; custo: number; margem: number }>();
    for (const r of pnlRows) {
      const key = r.mes;
      const cur = map.get(key) ?? { mes: key, receita: 0, custo: 0, margem: 0 };
      cur.receita += n(r.receita_frete);
      cur.custo += n(r.custo_frete);
      cur.margem += n(r.margem);
      map.set(key, cur);
    }
    return [...map.values()]
      .sort((a, b) => (a.mes < b.mes ? -1 : 1))
      .map((r) => ({ ...r, mesLabel: mesLabel(r.mes) }));
  }, [pnlRows]);

  // Agrupamento por transportadora (P&L)
  const porTransportadora = useMemo(() => {
    const map = new Map<string, {
      transportadora: string; receita: number; custo: number; margem: number; receita_sem_custo: boolean;
    }>();
    for (const r of pnlRows) {
      const key = r.transportadora ?? "—";
      const cur = map.get(key) ?? { transportadora: key, receita: 0, custo: 0, margem: 0, receita_sem_custo: false };
      cur.receita += n(r.receita_frete);
      cur.custo += n(r.custo_frete);
      cur.margem += n(r.margem);
      if (r.receita_sem_custo) cur.receita_sem_custo = true;
      map.set(key, cur);
    }
    return [...map.values()]
      .filter((r) => r.receita !== 0 || r.custo !== 0)
      .sort((a, b) => b.receita - a.receita);
  }, [pnlRows]);

  // Custo por transportadora (detalhe)
  const custoTranspAgg = useMemo(() => {
    // A view já é por transportadora; só ordena
    return [...custoTranspRows].sort((a, b) => n(b.frete_total) - n(a.frete_total));
  }, [custoTranspRows]);

  const totalFreteTransp = useMemo(
    () => custoTranspAgg.reduce((a, r) => a + n(r.frete_total), 0),
    [custoTranspAgg]
  );

  // % justo (receita ÷ base_nf_com_frete) por transportadora — vem do P&L, respeita filtro
  const pctCobradoAgg = useMemo(() => {
    const map = new Map<string, { receita: number; base: number }>();
    for (const r of pnlRows) {
      const key = r.transportadora ?? "—";
      const cur = map.get(key) ?? { receita: 0, base: 0 };
      cur.receita += n(r.receita_frete);
      cur.base += n(r.base_nf_com_frete);
      map.set(key, cur);
    }
    return map;
  }, [pnlRows]);

  function pctCobradoPara(nome: string | null | undefined): number | null {
    let receita = 0;
    let base = 0;
    for (const [k, v] of pctCobradoAgg) {
      if (matchesTransp(k, nome ?? "")) {
        receita += v.receita;
        base += v.base;
      }
    }
    if (base <= 0) return null;
    return (receita / base) * 100;
  }

  const pctCobradoTotal = useMemo(() => {
    let receita = 0;
    let base = 0;
    for (const v of pctCobradoAgg.values()) {
      receita += v.receita;
      base += v.base;
    }
    return base > 0 ? (receita / base) * 100 : null;
  }, [pctCobradoAgg]);

  // % custo/NF por transportadora (Σ frete_total ÷ Σ valor_nf), a partir de vw_transp_fretes
  const custoNfPorId = useMemo(() => {
    const map = new Map<string, { frete: number; nf: number }>();
    for (const r of custoUfRows) {
      if (!r.transportadora_id) continue;
      const cur = map.get(r.transportadora_id) ?? { frete: 0, nf: 0 };
      cur.frete += n(r.frete_total);
      cur.nf += n(r.valor_nf);
      map.set(r.transportadora_id, cur);
    }
    return map;
  }, [custoUfRows]);

  function pctCustoNfPara(id: string | null | undefined): number | null {
    if (!id) return null;
    const v = custoNfPorId.get(id);
    if (!v || v.nf <= 0) return null;
    return (v.frete / v.nf) * 100;
  }

  const pctCustoNfTotal = useMemo(() => {
    let frete = 0;
    let nf = 0;
    for (const v of custoNfPorId.values()) {
      frete += v.frete;
      nf += v.nf;
    }
    return nf > 0 ? (frete / nf) * 100 : null;
  }, [custoNfPorId]);



  // Custo por UF (soma sobre transportadoras filtradas)
  const custoPorUf = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of custoUfRows) {
      const uf = r.destinatario_uf?.trim();
      if (!uf) continue;
      map.set(uf, (map.get(uf) ?? 0) + n(r.frete_total));
    }
    return [...map.entries()]
      .map(([uf, custo]) => ({ uf, custo }))
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 12);
  }, [custoUfRows]);

  // KPIs operacionais gerais
  const opsKpis = useMemo(() => {
    const total = rastreioRows.length;
    const comDatas = rastreioRows.filter((r) => r.data_entrega && r.previsao_entrega);
    const onTime = comDatas.filter((r) => new Date(r.data_entrega!) <= new Date(r.previsao_entrega!)).length;
    const onTimePct = comDatas.length > 0 ? (onTime / comDatas.length) * 100 : 0;
    const devolucoes = rastreioRows.filter((r) => r.eh_devolucao).length;
    const devPct = total > 0 ? (devolucoes / total) * 100 : 0;
    const entregues = rastreioRows.filter((r) => r.data_entrega).length;
    return { total, comDatas: comDatas.length, onTimePct, devolucoes, devPct, entregues };
  }, [rastreioRows]);

  // KPIs operacionais por transportadora
  const opsPorTransp = useMemo(() => {
    const map = new Map<string, {
      transportadora: string;
      total: number;
      comDatas: number;
      onTime: number;
      gapSum: number;
      devolucoes: number;
    }>();
    const MS_DIA = 1000 * 60 * 60 * 24;
    for (const r of rastreioRows) {
      const key = r.transportadora_nome ?? "—";
      const cur = map.get(key) ?? {
        transportadora: key, total: 0, comDatas: 0, onTime: 0, gapSum: 0, devolucoes: 0,
      };
      cur.total += 1;
      if (r.data_entrega && r.previsao_entrega) {
        const dEnt = new Date(r.data_entrega);
        const dPrev = new Date(r.previsao_entrega);
        if (!isNaN(dEnt.getTime()) && !isNaN(dPrev.getTime())) {
          cur.comDatas += 1;
          const gap = (dEnt.getTime() - dPrev.getTime()) / MS_DIA;
          cur.gapSum += gap;
          if (dEnt <= dPrev) cur.onTime += 1;
        }
      }
      if (r.eh_devolucao) cur.devolucoes += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((r) => ({
        transportadora: r.transportadora,
        total: r.total,
        onTimePct: r.comDatas > 0 ? (r.onTime / r.comDatas) * 100 : null,
        gapMedio: r.comDatas > 0 ? r.gapSum / r.comDatas : null,
        devPct: r.total > 0 ? (r.devolucoes / r.total) * 100 : 0,
        devolucoes: r.devolucoes,
        comDatas: r.comDatas,
      }))
      .sort((a, b) => b.total - a.total);
  }, [rastreioRows]);

  const mixTransp = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rastreioRows) {
      const key = r.transportadora_nome ?? "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [rastreioRows]);

  const isLoading =
    (pnlQuery.isLoading && !pnlQuery.error) ||
    (rastreioQuery.isLoading && !rastreioQuery.error) ||
    (custoTranspQuery.isLoading && !custoTranspQuery.error) ||
    (custoUfQuery.isLoading && !custoUfQuery.error);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando dashboard…
      </div>
    );
  }

  const semDados = pnlAll.length === 0 && rastreioAll.length === 0;
  if (semDados) {
    return (
      <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
        Nenhum dado logístico ainda.
      </div>
    );
  }

  const margemNeg = totais.margem < 0;
  

  return (
    <div className="space-y-8">
      {/* ============ FILTRO GLOBAL ============ */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Filtro — re-escopa toda a dashboard {selected ? `(${selected})` : "(Geral)"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selected === "" ? "default" : "outline"}
            onClick={() => setSelected("")}
            className="h-7 rounded-full text-xs"
          >
            Geral
          </Button>
          {opcoesTransp.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={selected === t ? "default" : "outline"}
              onClick={() => setSelected(t)}
              className="h-7 rounded-full text-xs"
            >
              {t}
            </Button>
          ))}
        </div>
      </section>

      {/* ================= BLOCO 1 — P&L ================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">P&L da Logística</h2>
          <span className="text-xs text-muted-foreground">Receita cobrada × custo real</span>
        </div>
        {pnlQuery.error ? (
          <div className="text-xs text-muted-foreground border rounded-md px-3 py-2">
            Não foi possível carregar o P&L.
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCardMini label="Receita de frete" value={BRL.format(totais.receita)} icon={TrendingUp} tone="success" />
          <StatCardMini label="Custo real" value={BRL.format(totais.custo)} icon={TrendingDown} tone="info" />
          <StatCardMini
            label="Margem"
            value={BRL.format(totais.margem)}
            icon={margemNeg ? TrendingDown : TrendingUp}
            tone={margemNeg ? "destructive" : "success"}
          />
          <StatCardMini
            label="% recuperação"
            value={`${totais.pctRec.toFixed(1)}%`}
            icon={Percent}
            tone={totais.pctRec >= 100 ? "success" : "warning"}
            hint="Receita ÷ custo"
          />
          <StatCardMini
            label="% da NF"
            value={`${totais.pctNf.toFixed(1)}%`}
            icon={Percent}
            tone="info"
            hint="sobre NFs com frete"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCardMini
            label="Subsídio de frete"
            value={BRL.format(totais.subsidio)}
            icon={AlertTriangle}
            tone={totais.subsidio > 0 ? "destructive" : "success"}
            hint={`${totais.pctBancado.toFixed(2)}% do faturamento — quanto a Fetely banca`}
          />
          <StatCardMini
            label="NFs c/ frete zero"
            value={NUM.format(totais.nfsSemFrete)}
            icon={AlertTriangle}
            tone="warning"
            hint="Absorvido pela Fetely"
          />
          <StatCardMini
            label="Base NF (total)"
            value={BRL.format(totais.baseNf)}
            icon={DollarSign}
            hint={`${NUM.format(totais.nfs)} NFs`}
          />
          <StatCardMini
            label="Base NF (c/ frete)"
            value={BRL.format(totais.baseNfComFrete)}
            icon={DollarSign}
            tone="info"
            hint={`${NUM.format(totais.nfsComFrete)} NFs`}
          />
        </div>


        {/* Gráfico mensal */}
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3">Evolução mensal — receita × custo × margem</div>
            {serieMensal.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados de P&L.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart data={serieMensal} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                      width={80}
                    />
                    <Tooltip formatter={(v: number) => BRL.format(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="receita" name="Receita" fill="hsl(var(--success))" />
                    <Bar dataKey="custo" name="Custo" fill="hsl(var(--info))" />
                    <Line type="monotone" dataKey="margem" name="Margem" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela P&L por transportadora */}
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">P&L por transportadora</div>
              <div className="text-xs text-muted-foreground">
                "sem custo rastreado" quando não há CTe importado.
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transportadora</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-right">% recuperação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porTransportadora.map((r) => {
                    const pctRec = r.custo > 0 ? (r.receita / r.custo) * 100 : 0;
                    const neg = r.margem < 0;
                    return (
                      <TableRow key={r.transportadora}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.transportadora}</span>
                            {r.receita_sem_custo ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                sem custo rastreado
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{BRL.format(r.receita)}</TableCell>
                        <TableCell className="text-right tabular-nums">{BRL.format(r.custo)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", neg ? "text-destructive" : "text-success")}>
                          {BRL.format(r.margem)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.custo > 0 ? `${pctRec.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {porTransportadora.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Nenhuma transportadora com movimento.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Detalhe por transportadora (custo) */}
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">Detalhe operacional por transportadora</div>
              <div className="text-xs text-muted-foreground">Fonte: CTes importados</div>
              {custoTranspQuery.error ? (
                <div className="text-xs text-muted-foreground mt-1">
                  Não foi possível carregar o detalhamento por transportadora.
                </div>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transportadora</TableHead>
                    <TableHead className="text-right">Fretes</TableHead>
                    <TableHead className="text-right">Frete total</TableHead>
                    <TableHead className="text-right">Frete médio</TableHead>
                    <TableHead className="text-right" title="frete cobrado ÷ NF, só c/ frete">% cobrado/NF</TableHead>
                    <TableHead className="text-right">Peso taxado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custoTranspAgg.map((r) => (
                    <TableRow key={r.transportadora ?? "—"}>
                      <TableCell className="font-medium">{r.transportadora ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{NUM.format(n(r.qtd_fretes))}</TableCell>
                      <TableCell className="text-right tabular-nums">{BRL.format(n(r.frete_total))}</TableCell>
                      <TableCell className="text-right tabular-nums">{BRL.format(n(r.frete_medio))}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(() => { const p = pctCobradoPara(r.transportadora); return p != null ? `${p.toFixed(2)}%` : "—"; })()}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {NUM.format(Math.round(n(r.peso_taxado_total)))} kg
                      </TableCell>
                    </TableRow>
                  ))}
                  {custoTranspAgg.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        Sem CTes.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const totFretes = custoTranspAgg.reduce((a, r) => a + n(r.qtd_fretes), 0);
                      const totPeso = custoTranspAgg.reduce((a, r) => a + n(r.peso_taxado_total), 0);
                      const medio = totFretes > 0 ? totalFreteTransp / totFretes : 0;
                      return (
                        <TableRow className="bg-muted/40 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right tabular-nums">{NUM.format(totFretes)}</TableCell>
                          <TableCell className="text-right tabular-nums">{BRL.format(totalFreteTransp)}</TableCell>
                          <TableCell className="text-right tabular-nums">{BRL.format(medio)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pctCobradoTotal != null ? `${pctCobradoTotal.toFixed(2)}%` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{NUM.format(Math.round(totPeso))} kg</TableCell>
                        </TableRow>
                      );
                    })()
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Comparativo — participação sobre total gasto */}
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div className="text-sm font-medium">Participação no total gasto</div>
              <span className="text-xs text-muted-foreground">Σ {BRL.format(totalFreteTransp)}</span>
            </div>
            {custoTranspAgg.length === 0 || totalFreteTransp <= 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem dados.</div>
            ) : (
              <div className="space-y-2">
                {custoTranspAgg.map((r) => {
                  const pct = (n(r.frete_total) / totalFreteTransp) * 100;
                  return (
                    <div key={r.transportadora ?? "—"} className="text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{r.transportadora ?? "—"}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {BRL.format(n(r.frete_total))} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custo por UF */}
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <div className="text-sm font-medium">Custo por UF — top 12</div>
            </div>
            {custoUfQuery.error ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Não foi possível carregar custo por UF.
              </div>
            ) : custoPorUf.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
            ) : (
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={custoPorUf} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="uf" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                      width={80}
                    />
                    <Tooltip formatter={(v: number) => BRL.format(Number(v))} />
                    <Bar dataKey="custo" name="Custo" fill="hsl(var(--info))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ================= BLOCO 2 — KPIs OPERACIONAIS ================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">KPIs operacionais</h2>
          <span className="text-xs text-muted-foreground">Baseado nos rastreios importados</span>
        </div>

        {rastreioQuery.error ? (
          <div className="text-xs text-muted-foreground border rounded-md px-3 py-2">
            Não foi possível carregar os rastreios.
          </div>
        ) : null}



        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCardMini
            label="On-time %"
            value={`${opsKpis.onTimePct.toFixed(1)}%`}
            icon={CheckCircle2}
            tone={opsKpis.onTimePct >= 90 ? "success" : opsKpis.onTimePct >= 75 ? "warning" : "destructive"}
            hint={`${NUM.format(opsKpis.comDatas)} rastreios avaliados`}
          />
          <StatCardMini
            label="Taxa de devolução"
            value={`${opsKpis.devPct.toFixed(1)}%`}
            icon={RotateCcw}
            tone={opsKpis.devPct <= 2 ? "success" : opsKpis.devPct <= 5 ? "warning" : "destructive"}
            hint={`${NUM.format(opsKpis.devolucoes)} devoluções`}
          />
          <StatCardMini label="Entregues" value={NUM.format(opsKpis.entregues)} icon={Package} tone="success" />
          <StatCardMini label="Total rastreado" value={NUM.format(opsKpis.total)} icon={Truck} tone="info" />
        </div>

        {/* KPIs por transportadora */}
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">KPIs por transportadora</div>
              <div className="text-xs text-muted-foreground">
                Prazo médio: negativo = adiantado · positivo = atrasado
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transportadora</TableHead>
                    <TableHead className="text-right">Rastreios</TableHead>
                    <TableHead className="text-right">On-time %</TableHead>
                    <TableHead className="text-right">Prazo médio (dias)</TableHead>
                    <TableHead className="text-right">Devolução %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opsPorTransp.map((r) => (
                    <TableRow key={r.transportadora}>
                      <TableCell className="font-medium">{r.transportadora}</TableCell>
                      <TableCell className="text-right tabular-nums">{NUM.format(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.onTimePct != null ? (
                          <span className={cn(
                            r.onTimePct >= 90 ? "text-success" : r.onTimePct >= 75 ? "text-amber-700 dark:text-amber-300" : "text-destructive"
                          )}>
                            {r.onTimePct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.gapMedio != null ? (
                          <span className={cn(r.gapMedio > 0 ? "text-destructive" : "text-success")}>
                            {r.gapMedio > 0 ? "+" : ""}{r.gapMedio.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.devPct.toFixed(1)}%
                        <span className="text-muted-foreground text-[11px] ml-1">({NUM.format(r.devolucoes)})</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {opsPorTransp.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                        Sem rastreios.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-3">Mix por transportadora — nº de rastreios</div>
            {mixTransp.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem rastreios ainda.</div>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={mixTransp} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={50} />
                    <Tooltip formatter={(v: number) => NUM.format(Number(v))} />
                    <Bar dataKey="qtd" name="Rastreios" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
