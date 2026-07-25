import { useMemo } from "react";
import {
  Loader2, TrendingUp, TrendingDown, DollarSign, Percent, Package, AlertTriangle,
  Truck, CheckCircle2, RotateCcw, MapPin, BarChart3, Clock, CalendarClock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLogisticaPnl } from "@/hooks/logistica/useLogisticaPnl";
import { useLogisticaFatoFrete, type CanalLogistica } from "@/hooks/logistica/useLogisticaFatoFrete";
import { useLogisticaRastreioCanonico } from "@/hooks/logistica/useLogisticaRastreioCanonico";
import { useLogisticaCustoTransportadora } from "@/hooks/logistica/useLogisticaCustoTransportadora";
import { useTranspFretesUf } from "@/hooks/logistica/useTranspFretesUf";
import { useLogisticaPrazoEntrega } from "@/hooks/logistica/useLogisticaPrazoEntrega";
import { useTransportadorasLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");
const n = (v: number | null | undefined) => Number(v ?? 0);

export type EscopoPainel =
  | { tipo: "canal"; canal: "total" | "b2b" | "b2c" }
  | { tipo: "transportadora"; transportadoraId: string; transportadoraNome?: string };

function normalize(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(LTDA|S\.?A\.?|ME|EPP|EIRELI|MEI|CIA)\b\.?/g, "")
    .replace(/[.,-]/g, " ").replace(/\s+/g, " ").trim();
}
function matchesTransp(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return na.split(" ")[0] === nb.split(" ")[0];
}
function mesLabel(mes: string): string {
  const d = new Date(mes.length === 10 ? `${mes}T00:00:00` : mes);
  if (isNaN(d.getTime())) return mes;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function StatCardMini({
  label, value, icon: Icon, tone, hint,
}: {
  label: string; value: string;
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
        {hint ? <div className="text-[11px] text-muted-foreground leading-snug break-words">{hint}</div> : null}
      </div>
    </div>
  );
}

// Escopo helpers
function canalFiltro(esc: EscopoPainel): "b2b" | "b2c" | null {
  if (esc.tipo === "canal") return esc.canal === "total" ? null : esc.canal;
  return null;
}
function matchCanal(row: { canal: CanalLogistica | null }, filtro: "b2b" | "b2c" | null): boolean {
  if (!filtro) return true;
  return row.canal === filtro;
}

export function PainelLogistica({ escopo }: { escopo: EscopoPainel }) {
  const pnlQuery = useLogisticaPnl();
  const fatoQuery = useLogisticaFatoFrete();
  const rastreioQuery = useLogisticaRastreioCanonico();
  const custoTranspQuery = useLogisticaCustoTransportadora();
  const custoUfQuery = useTranspFretesUf();
  const prazoQuery = useLogisticaPrazoEntrega();
  const transpQuery = useTransportadorasLogistica();

  const pnlAll = pnlQuery.data ?? [];
  const fatoAll = fatoQuery.data ?? [];
  const rastreioAll = rastreioQuery.data ?? [];
  const custoTranspAll = custoTranspQuery.data ?? [];
  const custoUfAll = custoUfQuery.data ?? [];
  const prazoAll = prazoQuery.data ?? [];
  const parceiros = transpQuery.data ?? [];

  const isTransp = escopo.tipo === "transportadora";
  const escopoTranspId = isTransp ? escopo.transportadoraId : null;
  const escopoTranspNome = isTransp ? escopo.transportadoraNome ?? "" : "";
  const canal = canalFiltro(escopo);

  // Nome resolver por id
  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of parceiros) m.set(p.id, p.nome_fantasia ?? p.razao_social ?? "");
    return m;
  }, [parceiros]);

  // FILTROS
  const fatoRows = useMemo(() => fatoAll.filter((r) => {
    if (escopoTranspId && r.transportadora_id !== escopoTranspId) return false;
    if (!matchCanal(r, canal)) return false;
    return true;
  }), [fatoAll, escopoTranspId, canal]);

  const rastreioRows = useMemo(() => rastreioAll.filter((r) => {
    if (escopoTranspId && r.transportadora_id !== escopoTranspId) return false;
    if (!matchCanal(r, canal)) return false;
    return true;
  }), [rastreioAll, escopoTranspId, canal]);

  const pnlRows = useMemo(() => pnlAll.filter((r) => {
    if (canal && r.canal !== canal) return false;
    if (escopoTranspId) {
      // Filtra pnl por nome (não tem id na view). Fallback: aceita se nomes casam.
      if (!matchesTransp(r.transportadora, escopoTranspNome)) return false;
    }
    return true;
  }), [pnlAll, canal, escopoTranspId, escopoTranspNome]);

  // Canal dominante do escopo (para transportadora: derivar do dado)
  const canalDominante: "b2b" | "b2c" | null = useMemo(() => {
    if (canal) return canal;
    if (!escopoTranspId) return null;
    let b2b = 0, b2c = 0;
    for (const r of fatoRows) { if (r.canal === "b2b") b2b++; else if (r.canal === "b2c") b2c++; }
    for (const r of rastreioRows) { if (r.canal === "b2b") b2b++; else if (r.canal === "b2c") b2c++; }
    if (b2b === 0 && b2c === 0) return null;
    return b2b >= b2c ? "b2b" : "b2c";
  }, [canal, escopoTranspId, fatoRows, rastreioRows]);

  const carrierIdEhB2c = (id: string | null): boolean => {
    if (!id) return false;
    for (const r of fatoAll) if (r.transportadora_id === id && r.canal) return r.canal === "b2c";
    for (const r of rastreioAll) if (r.transportadora_id === id && r.canal) return r.canal === "b2c";
    return false;
  };

  // ============ P&L (por canal) ============
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
    return { receita, custo, margem, baseNf, baseNfComFrete, nfs, nfsComFrete, nfsSemFrete, pctRec, pctNf, subsidio, pctBancado };
  }, [pnlRows]);

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
    return [...map.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1))
      .map((r) => ({ ...r, mesLabel: mesLabel(r.mes) }));
  }, [pnlRows]);

  const pnlPorTransp = useMemo(() => {
    const map = new Map<string, { transportadora: string; receita: number; custo: number; margem: number; receita_sem_custo: boolean }>();
    for (const r of pnlRows) {
      const key = r.transportadora ?? "—";
      const cur = map.get(key) ?? { transportadora: key, receita: 0, custo: 0, margem: 0, receita_sem_custo: false };
      cur.receita += n(r.receita_frete);
      cur.custo += n(r.custo_frete);
      cur.margem += n(r.margem);
      if (r.receita_sem_custo) cur.receita_sem_custo = true;
      map.set(key, cur);
    }
    return [...map.values()].filter((r) => r.receita !== 0 || r.custo !== 0).sort((a, b) => b.receita - a.receita);
  }, [pnlRows]);

  // ============ Fato frete (custo/UF/participação/detalhe) por canal ============
  // Agregado por transportadora_id
  const detalhePorTransp = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; fretes: number; total: number; canalB2c: boolean }>();
    for (const r of fatoRows) {
      if (!r.transportadora_id) continue;
      const nome = nomePorId.get(r.transportadora_id) ?? "—";
      const cur = map.get(r.transportadora_id) ?? { id: r.transportadora_id, nome, fretes: 0, total: 0, canalB2c: false };
      cur.fretes += 1;
      cur.total += n(r.custo_frete);
      if (r.canal === "b2c") cur.canalB2c = true;
      map.set(r.transportadora_id, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [fatoRows, nomePorId]);

  const totalFrete = useMemo(() => detalhePorTransp.reduce((a, r) => a + r.total, 0), [detalhePorTransp]);

  // Extras B2B (CTe): % custo/NF por id, peso por id
  const extrasPorId = useMemo(() => {
    const map = new Map<string, { peso: number; frete: number; nf: number }>();
    for (const r of custoTranspAll) {
      if (!r.transportadora_id) continue;
      const cur = map.get(r.transportadora_id) ?? { peso: 0, frete: 0, nf: 0 };
      cur.peso += n(r.peso_taxado_total);
      map.set(r.transportadora_id, cur);
    }
    for (const r of custoUfAll) {
      if (!r.transportadora_id) continue;
      const cur = map.get(r.transportadora_id) ?? { peso: 0, frete: 0, nf: 0 };
      cur.frete += n(r.frete_total);
      cur.nf += n(r.valor_nf);
      map.set(r.transportadora_id, cur);
    }
    return map;
  }, [custoTranspAll, custoUfAll]);

  // % cobrado/NF por id — resolvido via P&L (nome) → id (parceiros)
  function pctCobradoPorId(id: string): number | null {
    const nome = nomePorId.get(id);
    if (!nome) return null;
    let receita = 0, base = 0;
    for (const r of pnlRows) {
      if (matchesTransp(r.transportadora, nome)) {
        receita += n(r.receita_frete);
        base += n(r.base_nf_com_frete);
      }
    }
    return base > 0 ? (receita / base) * 100 : null;
  }

  // % custo/base por id — B2C: soma custo_frete e base_nf de pnlRows por nome
  function pctCustoBasePorId(id: string): number | null {
    const nome = nomePorId.get(id);
    if (!nome) return null;
    let custo = 0, base = 0;
    for (const r of pnlRows) {
      if (matchesTransp(r.transportadora, nome)) {
        custo += n(r.custo_frete);
        base += n(r.base_nf);
      }
    }
    return base > 0 ? (custo / base) * 100 : null;
  }

  // Custo por UF (top 12) — de fato_frete
  const custoPorUf = useMemo(() => {
    const map = new Map<string, { custo: number; fretes: number }>();
    for (const r of fatoRows) {
      const uf = r.uf_destino?.trim();
      if (!uf) continue;
      const cur = map.get(uf) ?? { custo: 0, fretes: 0 };
      cur.custo += n(r.custo_frete);
      cur.fretes += 1;
      map.set(uf, cur);
    }
    return [...map.entries()].map(([uf, v]) => ({ uf, ...v })).sort((a, b) => b.custo - a.custo).slice(0, 12);
  }, [fatoRows]);

  // ============ Rastreio / SLA ============
  const opsKpis = useMemo(() => {
    const MS_DIA = 1000 * 60 * 60 * 24;
    const total = rastreioRows.length;
    const entregues = rastreioRows.filter((r) => r.entregue === true).length;
    const devolucoes = rastreioRows.filter((r) => r.devolucao === true).length;
    const devPct = total > 0 ? (devolucoes / total) * 100 : 0;
    const comDatas = rastreioRows.filter((r) => r.data_entrega && r.previsao_entrega);
    const onTime = comDatas.filter((r) => new Date(r.data_entrega!) <= new Date(r.previsao_entrega!)).length;
    const onTimePct = comDatas.length > 0 ? (onTime / comDatas.length) * 100 : 0;
    let gapSum = 0, gapN = 0;
    for (const r of comDatas) {
      const dEnt = new Date(r.data_entrega!).getTime();
      const dPrev = new Date(r.previsao_entrega!).getTime();
      if (!isNaN(dEnt) && !isNaN(dPrev)) { gapSum += (dEnt - dPrev) / MS_DIA; gapN += 1; }
    }
    const gapMedio = gapN > 0 ? gapSum / gapN : null;
    return { total, entregues, devolucoes, devPct, comDatas: comDatas.length, onTimePct, gapMedio };
  }, [rastreioRows]);

  // Prazo médio (só B2B)
  const prazoEntrega = useMemo(() => {
    let rows = prazoAll;
    if (escopoTranspId) rows = rows.filter((r) => r.transportadora_id === escopoTranspId);
    else if (canal === "b2c") return { entregas: 0, media: null as number | null };
    // Se canal=b2b, prazoAll é B2B por natureza (só CTe/NF); em 'total' também vale
    let entregas = 0, diasTotal = 0;
    for (const r of rows) { entregas += n(r.entregas); diasTotal += n(r.dias_total); }
    return { entregas, media: entregas > 0 ? diasTotal / entregas : null };
  }, [prazoAll, escopoTranspId, canal]);

  // KPIs por transportadora (agregado sobre rastreio)
  const opsPorTransp = useMemo(() => {
    const MS_DIA = 1000 * 60 * 60 * 24;
    const map = new Map<string, { id: string | null; nome: string; total: number; entregues: number; devolucoes: number; comDatas: number; onTime: number; gapSum: number; canalB2c: boolean }>();
    for (const r of rastreioRows) {
      const key = r.transportadora_id ?? r.transportadora ?? "—";
      const nome = r.transportadora ?? (r.transportadora_id ? nomePorId.get(r.transportadora_id) ?? "—" : "—");
      const cur = map.get(key) ?? { id: r.transportadora_id, nome, total: 0, entregues: 0, devolucoes: 0, comDatas: 0, onTime: 0, gapSum: 0, canalB2c: r.canal === "b2c" };
      cur.total += 1;
      if (r.entregue) cur.entregues += 1;
      if (r.devolucao) cur.devolucoes += 1;
      if (r.canal === "b2c") cur.canalB2c = true;
      if (r.data_entrega && r.previsao_entrega) {
        const dEnt = new Date(r.data_entrega).getTime();
        const dPrev = new Date(r.previsao_entrega).getTime();
        if (!isNaN(dEnt) && !isNaN(dPrev)) {
          cur.comDatas += 1;
          cur.gapSum += (dEnt - dPrev) / MS_DIA;
          if (dEnt <= dPrev) cur.onTime += 1;
        }
      }
      map.set(key, cur);
    }
    return [...map.values()].map((r) => ({
      ...r,
      onTimePct: r.comDatas > 0 ? (r.onTime / r.comDatas) * 100 : null,
      gapMedio: r.comDatas > 0 ? r.gapSum / r.comDatas : null,
      devPct: r.total > 0 ? (r.devolucoes / r.total) * 100 : 0,
    })).sort((a, b) => b.total - a.total);
  }, [rastreioRows, nomePorId]);

  const mixTransp = useMemo(
    () => opsPorTransp.map((r) => ({ nome: r.nome, qtd: r.total })),
    [opsPorTransp]
  );

  // Prazo médio por id (lookup)
  const prazoMedioPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prazoAll) if (r.transportadora_id && r.prazo_medio_dias != null) m.set(r.transportadora_id, Number(r.prazo_medio_dias));
    return m;
  }, [prazoAll]);

  const isLoading =
    (pnlQuery.isLoading && !pnlQuery.error) ||
    (fatoQuery.isLoading && !fatoQuery.error) ||
    (rastreioQuery.isLoading && !rastreioQuery.error);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando dashboard…
      </div>
    );
  }

  // ============================================================
  // RENDER — mesmos blocos para canal e transportadora
  // (blocos comparativos entre transportadoras são ocultados no modo transp)
  // ============================================================
  const margemNeg = totais.margem < 0;
  const ehB2cEscopo = isTransp ? canalDominante === "b2c" : canal === "b2c";
  const canalB2cGlobal = ehB2cEscopo;
  const canalLabel = isTransp
    ? (escopoTranspNome || nomePorId.get(escopoTranspId ?? "") || "Transportadora")
    : canal === "b2b" ? "B2B" : canal === "b2c" ? "B2C" : "Total";

  return (
    <div className="space-y-8">
      {/* P&L */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">P&L da Logística</h2>
          <span className="text-xs text-muted-foreground">Receita cobrada × custo real · escopo: {canalLabel}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCardMini
            label="Receita de frete"
            value={BRL.format(totais.receita)}
            icon={TrendingUp}
            tone="success"
            hint={`${NUM.format(totais.nfsComFrete)} de ${NUM.format(totais.nfs)} NFs cobradas · ${NUM.format(totais.nfsSemFrete)} sem frete`}
          />
          <StatCardMini label="Custo real" value={BRL.format(totais.custo)} icon={TrendingDown} tone="info" hint="pago às transportadoras" />
          <StatCardMini
            label="Margem"
            value={BRL.format(totais.margem)}
            icon={margemNeg ? TrendingDown : TrendingUp}
            tone={margemNeg ? "destructive" : "success"}
            hint="= subsídio que a Fetely banca"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCardMini label="% recuperação" value={`${totais.pctRec.toFixed(1)}%`} icon={Percent} tone={totais.pctRec >= 100 ? "success" : "warning"} hint="receita ÷ custo" />
          <StatCardMini label="Frete cobrado/NF" value={`${totais.pctNf.toFixed(2)}%`} icon={Percent} tone="info" hint="sobre NFs com frete" />
          {(() => {
            const tone = totais.subsidio > 0 ? "destructive" : "success";
            const toneCls = tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success";
            const pctTotal = totais.pctBancado.toFixed(2);
            const pctNfs = (totais.baseNfComFrete > 0 ? (totais.subsidio / totais.baseNfComFrete) * 100 : 0).toFixed(2);
            return (
              <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground truncate">Peso do subsídio</div>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    <div className="leading-tight">
                      <span className="text-base font-semibold">{pctTotal}%</span>{" "}
                      <span className="text-[11px] text-muted-foreground">do faturamento total</span>
                    </div>
                    <div className="leading-tight">
                      <span className="text-base font-semibold">{pctNfs}%</span>{" "}
                      <span className="text-[11px] text-muted-foreground">das NFs com frete</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

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
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`} width={80} />
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

        {!isTransp ? (
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">P&L por transportadora</div>
              <div className="text-xs text-muted-foreground">"sem custo rastreado" quando não há CTe/postagem importada.</div>
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
                  {pnlPorTransp.map((r) => {
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
                        <TableCell className={cn("text-right tabular-nums font-medium", neg ? "text-destructive" : "text-success")}>{BRL.format(r.margem)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.custo > 0 ? `${pctRec.toFixed(1)}%` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {pnlPorTransp.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Nenhuma transportadora com movimento.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        ) : null}

        {/* Detalhe financeiro do carrier / Detalhe operacional por transportadora */}
        {isTransp ? (() => {
          const r = detalhePorTransp[0];
          if (!r) {
            return (
              <Card className="card-shadow">
                <CardContent className="p-6 text-sm text-muted-foreground text-center">Sem fretes.</CardContent>
              </Card>
            );
          }
          const ehB2c = r.canalB2c;
          const extras = extrasPorId.get(r.id);
          const pctCob = pctCobradoPorId(r.id);
          const pctCusto = ehB2c
            ? pctCustoBasePorId(r.id)
            : (extras && extras.nf > 0 ? (extras.frete / extras.nf) * 100 : null);
          const peso = !ehB2c ? n(extras?.peso) : null;
          const medio = r.fretes > 0 ? r.total / r.fretes : 0;
          return (
            <Card className="card-shadow">
              <CardContent className="p-4">
                <div className="text-sm font-medium mb-3">Detalhe financeiro — {r.nome}</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <StatCardMini label="Frete total" value={BRL.format(r.total)} icon={DollarSign} tone="info" hint={`${NUM.format(r.fretes)} envios`} />
                  <StatCardMini label="Frete médio" value={BRL.format(medio)} icon={DollarSign} tone="default" />
                  <StatCardMini label="% cobrado/NF" value={pctCob != null ? `${pctCob.toFixed(2)}%` : "—"} icon={Percent} tone="info" hint={ehB2c ? "n/a no B2C" : "frete cobrado ÷ NF"} />
                  <StatCardMini label="% custo/NF" value={pctCusto != null ? `${pctCusto.toFixed(2)}%` : "—"} icon={Percent} tone="default" hint={ehB2c ? "B2C: Σ custo_frete ÷ Σ base_nf (valor do pedido Shopify, não NF fiscal)" : "Σ frete ÷ Σ valor_nf"} />
                  <StatCardMini label="Peso taxado" value={peso != null ? `${NUM.format(Math.round(peso))} kg` : "—"} icon={Package} tone="default" hint={ehB2c ? "n/a no B2C" : undefined} />
                </div>
              </CardContent>
            </Card>
          );
        })() : (
          <Card className="card-shadow">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b">
                <div className="text-sm font-medium">Detalhe operacional por transportadora</div>
                <div className="text-xs text-muted-foreground">Fonte: CTes (B2B) + postagens (B2C)</div>
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
                      <TableHead className="text-right" title="B2B: Σ frete_total ÷ Σ valor_nf · B2C: Σ custo_frete ÷ Σ base_nf (valor do pedido Shopify, não NF fiscal)">% custo/NF</TableHead>
                      <TableHead className="text-right">Peso taxado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhePorTransp.map((r) => {
                      const ehB2c = r.canalB2c;
                      const extras = extrasPorId.get(r.id);
                      const pctCob = pctCobradoPorId(r.id);
                      const pctCusto = ehB2c
                        ? pctCustoBasePorId(r.id)
                        : (extras && extras.nf > 0 ? (extras.frete / extras.nf) * 100 : null);
                      const peso = !ehB2c ? n(extras?.peso) : null;
                      const medio = r.fretes > 0 ? r.total / r.fretes : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{NUM.format(r.fretes)}</TableCell>
                          <TableCell className="text-right tabular-nums">{BRL.format(r.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{BRL.format(medio)}</TableCell>
                          <TableCell className="text-right tabular-nums">{pctCob != null ? `${pctCob.toFixed(2)}%` : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums">{pctCusto != null ? `${pctCusto.toFixed(2)}%` : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums">{peso != null ? `${NUM.format(Math.round(peso))} kg` : <span className="text-muted-foreground">—</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                    {detalhePorTransp.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Sem fretes.</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Participação */}
        {!isTransp ? (
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div className="text-sm font-medium">Participação no total gasto</div>
              <span className="text-xs text-muted-foreground">Σ {BRL.format(totalFrete)}</span>
            </div>
            {detalhePorTransp.length === 0 || totalFrete <= 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem dados.</div>
            ) : (
              <div className="space-y-2">
                {detalhePorTransp.map((r) => {
                  const pct = (r.total / totalFrete) * 100;
                  return (
                    <div key={r.id} className="text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate">{r.nome}</span>
                        <span className="tabular-nums text-muted-foreground">{BRL.format(r.total)} · {pct.toFixed(1)}%</span>
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
        ) : null}

        {/* Custo × volume por UF */}
        <Card className="card-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <div className="text-sm font-medium">Custo × volume por UF — top 12</div>
            </div>
            {custoPorUf.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
            ) : (() => {
              const palette = ["hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent))", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#0ea5e9", "#84cc16"];
              const cor = new Map<string, string>();
              custoPorUf.forEach((d, i) => cor.set(d.uf, palette[i % palette.length]));
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Custo por UF (R$)</div>
                    <div style={{ width: "100%", height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart data={custoPorUf} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="uf" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`} width={80} />
                          <Tooltip formatter={(v: number) => BRL.format(Number(v))} />
                          <Bar dataKey="custo" name="Custo (R$)">
                            {custoPorUf.map((d) => (<Cell key={d.uf} fill={cor.get(d.uf)!} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Fretes por UF (qtd)</div>
                    <div style={{ width: "100%", height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart data={custoPorUf} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="uf" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} width={50} allowDecimals={false} />
                          <Tooltip formatter={(v: number) => `${Number(v).toLocaleString("pt-BR")} fretes`} />
                          <Bar dataKey="fretes" name="Fretes (qtd)">
                            {custoPorUf.map((d) => (<Cell key={d.uf} fill={cor.get(d.uf)!} />))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </section>

      {/* KPIs operacionais */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">KPIs operacionais</h2>
          <span className="text-xs text-muted-foreground">Baseado nos rastreios importados</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCardMini
            label="On-time %"
            value={canalB2cGlobal ? "—" : (opsKpis.comDatas > 0 ? `${opsKpis.onTimePct.toFixed(1)}%` : "—")}
            icon={CheckCircle2}
            tone={canalB2cGlobal ? "default" : opsKpis.onTimePct >= 90 ? "success" : opsKpis.onTimePct >= 75 ? "warning" : "destructive"}
            hint={canalB2cGlobal ? "n/a no B2C" : `${NUM.format(opsKpis.comDatas)} rastreios avaliados`}
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
          <StatCardMini
            label="Prazo médio de entrega"
            value={canalB2cGlobal ? "—" : (prazoEntrega.media == null ? "—" : `${prazoEntrega.media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dias`)}
            icon={Clock}
            tone={canalB2cGlobal ? "default" : "info"}
            hint={canalB2cGlobal ? "n/a no B2C" : `da emissão à entrega · ${NUM.format(prazoEntrega.entregas)} entregas`}
          />
          <StatCardMini
            label="Gap vs prometido"
            value={canalB2cGlobal ? "—" : (opsKpis.gapMedio == null ? "—" : `${opsKpis.gapMedio > 0 ? "+" : ""}${opsKpis.gapMedio.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dias`)}
            icon={CalendarClock}
            tone={canalB2cGlobal ? "default" : opsKpis.gapMedio == null ? "default" : opsKpis.gapMedio <= 0 ? "success" : "destructive"}
            hint={canalB2cGlobal ? "n/a no B2C" : "realizado − prometido · negativo = adiantado"}
          />
        </div>

        {!isTransp ? (
        <Card className="card-shadow">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">KPIs por transportadora</div>
              <div className="text-xs text-muted-foreground">Gap = realizado − prometido; negativo = adiantado</div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transportadora</TableHead>
                    <TableHead className="text-right">Rastreios</TableHead>
                    <TableHead className="text-right">On-time %</TableHead>
                    <TableHead className="text-right">Gap vs prometido (dias)</TableHead>
                    <TableHead className="text-right">Prazo médio (dias)</TableHead>
                    <TableHead className="text-right">Devolução %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opsPorTransp.map((r) => {
                    const ehB2c = r.canalB2c;
                    const lead = r.id ? prazoMedioPorId.get(r.id) ?? null : null;
                    return (
                      <TableRow key={r.id ?? r.nome}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{NUM.format(r.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ehB2c ? <span className="text-muted-foreground">—</span> : r.onTimePct != null ? (
                            <span className={cn(r.onTimePct >= 90 ? "text-success" : r.onTimePct >= 75 ? "text-amber-700 dark:text-amber-300" : "text-destructive")}>
                              {r.onTimePct.toFixed(1)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ehB2c ? <span className="text-muted-foreground">—</span> : r.gapMedio != null ? (
                            <span className={cn(r.gapMedio > 0 ? "text-destructive" : "text-success")}>
                              {r.gapMedio > 0 ? "+" : ""}{r.gapMedio.toFixed(1)}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {ehB2c ? <span className="text-muted-foreground">—</span> : lead != null ? lead.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.devPct.toFixed(1)}%<span className="text-muted-foreground text-[11px] ml-1">({NUM.format(r.devolucoes)})</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {opsPorTransp.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Sem rastreios.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        ) : null}

        {!isTransp ? (
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
        ) : null}
      </section>
    </div>
  );
}
