import { PageShell } from "@/components/layout/PageShell";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  ArrowLeftRight,
  Loader2,
  Download,
  Check,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useFluxoCompetencia, type CicloTituloRow } from "@/hooks/financas/useFluxoCompetencia";

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const fmtData = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

const MESES_LONGO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** '2026-05-01' → 'maio/2026' */
function rotuloMesLongo(mes: string | null | undefined): string {
  if (!mes) return "—";
  const [a, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (isNaN(idx) || !MESES_LONGO[idx]) return mes;
  return `${MESES_LONGO[idx]}/${a}`;
}

/** '2026-06-01' → 'jun/26' */
function rotuloMesCurto(mes: string | null | undefined): string {
  if (!mes) return "—";
  const [a, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (isNaN(idx) || !MESES_CURTO[idx]) return mes;
  return `${MESES_CURTO[idx]}/${a.slice(2)}`;
}

/** data ISO → chave de mês 'YYYY-MM-01' */
function chaveMes(data: string | null | undefined): string | null {
  if (!data || data.length < 7) return null;
  return `${data.slice(0, 7)}-01`;
}

/** hoje local, zerado, em 'YYYY-MM-DD' */
function hojeLocalISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type Situacao = "pago" | "aberto" | "futuro" | "cancelado" | "devolvido";

/** Situação materializada do título — compara só a data, sem hora. */
function situacaoDe(t: CicloTituloRow, hoje: string): Situacao {
  if (t.status === "cancelado") return "cancelado";
  if (t.status === "devolvido") return "devolvido";
  if (t.data_pagamento) return "pago";
  if (t.data_liquidacao_prevista && t.data_liquidacao_prevista.slice(0, 10) >= hoje) return "futuro";
  return "aberto";
}

const SITUACAO_CLASSE: Record<Situacao, string> = {
  pago: "border-success/40 bg-success/10 text-success",
  aberto: "border-destructive/40 bg-destructive/10 text-destructive",
  futuro: "border-info/40 bg-info/10 text-info",
  cancelado: "border-muted bg-muted text-muted-foreground",
  devolvido: "border-muted bg-muted text-muted-foreground",
};

const ELO_ROTULO: Record<string, string> = {
  caixa_confirmado: "Caixa confirmado",
  haver: "Haver",
  haver_com_lastro: "Haver com lastro",
  haver_sem_lastro: "Haver sem lastro",
  aguarda_safrapay: "Aguarda SafraPay",
  pago_sem_rastro: "Pago sem rastro",
  previsto: "Previsto",
  previsto_vencido: "Previsto vencido",
  sem_previsao: "Sem previsão",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

function eloClasse(elo: string | null | undefined): string {
  switch (elo) {
    case "caixa_confirmado":
    case "haver":
    case "haver_com_lastro":
      return "border-success/40 bg-success/10 text-success";
    case "previsto":
      return "border-info/40 bg-info/10 text-info";
    case "previsto_vencido":
    case "aguarda_safrapay":
      return "border-warning/40 bg-warning/10 text-warning";
    case "pago_sem_rastro":
    case "haver_sem_lastro":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "cancelado":
    case "devolvido":
      return "border-muted bg-muted text-muted-foreground";
    default:
      return "border-border text-muted-foreground";
  }
}

type SortKey = "valor" | "vencimento" | "previsto" | "competencia";
type SortDir = "asc" | "desc";
type SortPedido = "total" | "pago" | "aberto" | "futuro" | "titulos";

interface PedidoAgregado {
  pedido_id: string | null;
  pedido_ref: string | null;
  cliente: string | null;
  estagio: string | null;
  nfs: string[];
  titulos: CicloTituloRow[];
  pago: number;
  aberto: number;
  futuro: number;
  total: number;
}

/** Quebra por tipo de pagamento, desc, só > 0 */
function quebraPorTipo(linhas: CicloTituloRow[]): { tipo: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const r of linhas) {
    const k = r.tipo_pagamento ?? "sem tipo";
    m.set(k, (m.get(k) ?? 0) + Number(r.valor_atual ?? 0));
  }
  return Array.from(m.entries())
    .map(([tipo, valor]) => ({ tipo, valor }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

function QuebraTipos({ linhas }: { linhas: CicloTituloRow[] }) {
  const itens = quebraPorTipo(linhas);
  if (itens.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {itens.map((i) => (
        <p key={i.tipo} className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="capitalize">{i.tipo}</span> ·{" "}
          <span className="tabular-nums">{fmtBRL(i.valor)}</span>
          {i.tipo === "haver" && (
            <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">sem caixa</Badge>
          )}
        </p>
      ))}
    </div>
  );
}

export default function FluxoCompetencia() {
  const navigate = useNavigate();
  const { data = [], isLoading, isError, error } = useFluxoCompetencia();

  const [mes, setMes] = useState<string>("");
  const [tipo, setTipo] = useState<string>("todos");
  const [elo, setElo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("valor");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visao, setVisao] = useState<"pedido" | "titulo">("pedido");
  const [sortPedido, setSortPedido] = useState<SortPedido>("total");
  const [sortPedidoDir, setSortPedidoDir] = useState<SortDir>("desc");
  const [expandido, setExpandido] = useState<string | null>(null);

  const hoje = hojeLocalISO();

  const meses = useMemo(
    () =>
      Array.from(new Set(data.map((r) => r.mes_pedido).filter(Boolean) as string[])).sort(
        (a, b) => b.localeCompare(a),
      ),
    [data],
  );

  // Default: mês mais recente com título.
  useEffect(() => {
    if (mes === "" && meses.length > 0) setMes(meses[0]);
  }, [mes, meses]);

  const tipos = useMemo(
    () => Array.from(new Set(data.map((r) => r.tipo_pagamento).filter(Boolean) as string[])).sort(),
    [data],
  );
  const elos = useMemo(
    () => Array.from(new Set(data.map((r) => r.elo_caixa).filter(Boolean) as string[])).sort(),
    [data],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter((r) => {
      if (mes !== "todos" && mes !== "" && r.mes_pedido !== mes) return false;
      if (tipo !== "todos" && r.tipo_pagamento !== tipo) return false;
      if (elo !== "todos" && r.elo_caixa !== elo) return false;
      if (q) {
        const hay = [r.pedido_ref, r.cliente, r.numero_titulo, r.nf_ref]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, mes, tipo, elo, busca]);

  const foraDoDefault = tipo !== "todos" || elo !== "todos" || busca !== "";

  // ── KPIs de materialização: pago / aberto / futuro ──────
  const kpis = useMemo(() => {
    const pagas: CicloTituloRow[] = [];
    const abertas: CicloTituloRow[] = [];
    const futuras: CicloTituloRow[] = [];
    let safrapay = 0;

    for (const r of filtrados) {
      const s = situacaoDe(r, hoje);
      if (s === "pago") pagas.push(r);
      else if (s === "aberto") abertas.push(r);
      else if (s === "futuro") futuras.push(r);
      if (r.elo_caixa === "aguarda_safrapay") safrapay += Number(r.valor_atual ?? 0);
    }
    const soma = (l: CicloTituloRow[]) => l.reduce((a, r) => a + Number(r.valor_atual ?? 0), 0);
    return {
      pagas, abertas, futuras,
      pago: soma(pagas),
      aberto: soma(abertas),
      futuro: soma(futuras),
      safrapay,
    };
  }, [filtrados, hoje]);

  // ── Leitura contábil (desce de nível, dentro do "Mês a mês") ──
  const contabil = useMemo(() => {
    let competencia = 0, caixa = 0, previsto = 0, semProva = 0;
    for (const r of filtrados) {
      const va = Number(r.valor_atual ?? 0);
      if (r.nf_id) competencia += va;
      if (r.elo_caixa === "caixa_confirmado") caixa += va;
      if (!r.data_pagamento && r.status !== "cancelado" && r.data_liquidacao_prevista && r.data_liquidacao_prevista >= hoje) {
        previsto += va;
      }
      if (r.elo_caixa === "pago_sem_rastro") semProva += va;
    }
    return { competencia, caixa, previsto, semProva };
  }, [filtrados, hoje]);

  /**
   * Movimentações distintas do conjunto filtrado.
   * Uma movimentação pode liquidar duas parcelas — somar por linha de título
   * contaria o mesmo crédito duas vezes.
   */
  const movsDistintas = useMemo(() => {
    const map = new Map<string, { mes_caixa: string | null; mov_valor: number }>();
    for (const r of filtrados) {
      if (!r.movimentacao_id || map.has(r.movimentacao_id)) continue;
      map.set(r.movimentacao_id, {
        mes_caixa: r.mes_caixa,
        mov_valor: Number(r.mov_valor ?? 0),
      });
    }
    return map;
  }, [filtrados]);

  // ── Bloco 2: mês a mês ──────────────────────────────────
  const mensal = useMemo(() => {
    const comp = new Map<string, number>();
    const cx = new Map<string, number>();
    const prev = new Map<string, number>();
    const add = (m: Map<string, number>, k: string | null, v: number) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + v);
    };

    for (const r of filtrados) {
      const va = Number(r.valor_atual ?? 0);
      if (r.nf_id) add(comp, r.mes_competencia, va);
      if (!r.data_pagamento && r.status !== "cancelado") {
        add(prev, chaveMes(r.data_liquidacao_prevista), va);
      }
    }
    // Caixa: dinheiro que entrou na conta, por movimentação distinta.
    for (const mv of movsDistintas.values()) add(cx, mv.mes_caixa, mv.mov_valor);

    const chaves = Array.from(new Set([...comp.keys(), ...cx.keys(), ...prev.keys()])).sort();
    return chaves.map((k) => ({
      mesKey: k,
      mes: rotuloMesCurto(k),
      competencia: comp.get(k) ?? 0,
      caixa: cx.get(k) ?? 0,
      previsto: prev.get(k) ?? 0,
    }));
  }, [filtrados, movsDistintas]);

  const totaisMensal = useMemo(
    () =>
      mensal.reduce(
        (acc, r) => ({
          competencia: acc.competencia + r.competencia,
          caixa: acc.caixa + r.caixa,
          previsto: acc.previsto + r.previsto,
        }),
        { competencia: 0, caixa: 0, previsto: 0 },
      ),
    [mensal],
  );

  // ── Bloco 3: pills por elo ──────────────────────────────
  const pills = useMemo(() => {
    const map = new Map<string, { n: number; total: number }>();
    for (const r of filtrados) {
      const k = r.elo_caixa ?? "sem_previsao";
      const cur = map.get(k) ?? { n: 0, total: 0 };
      cur.n++;
      cur.total += Number(r.valor_atual ?? 0);
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ elo: k, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtrados]);

  // ── Bloco 3: ordenação por título ───────────────────────
  const titulos = useMemo(() => {
    const valorDe = (r: CicloTituloRow): string | number | null => {
      switch (sortKey) {
        case "valor": return r.valor_atual == null ? null : Number(r.valor_atual);
        case "vencimento": return r.data_vencimento_atual;
        case "previsto": return r.data_liquidacao_prevista;
        case "competencia": return r.mes_competencia;
      }
    };
    return [...filtrados].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtrados, sortKey, sortDir]);

  const totaisTitulos = useMemo(() => {
    const valor = titulos.reduce((a, r) => a + Number(r.valor_atual ?? 0), 0);
    // Movimentação: deduplicada por movimentacao_id (uma mov pode liquidar N parcelas).
    const vistas = new Map<string, number>();
    for (const r of titulos) {
      if (!r.movimentacao_id || vistas.has(r.movimentacao_id)) continue;
      vistas.set(r.movimentacao_id, Number(r.mov_valor ?? 0));
    }
    let mov = 0;
    for (const v of vistas.values()) mov += v;
    return { valor, mov };
  }, [titulos]);

  // ── Bloco 3: agregação por pedido ───────────────────────
  const pedidos = useMemo(() => {
    const map = new Map<string, PedidoAgregado>();
    for (const r of filtrados) {
      const k = r.pedido_id ?? r.pedido_ref ?? "sem-pedido";
      let cur = map.get(k);
      if (!cur) {
        cur = {
          pedido_id: r.pedido_id,
          pedido_ref: r.pedido_ref,
          cliente: r.cliente,
          estagio: r.estagio,
          nfs: [],
          titulos: [],
          pago: 0, aberto: 0, futuro: 0, total: 0,
        };
        map.set(k, cur);
      }
      cur.titulos.push(r);
      if (r.nf_ref && !cur.nfs.includes(r.nf_ref)) cur.nfs.push(r.nf_ref);
      const va = Number(r.valor_atual ?? 0);
      const s = situacaoDe(r, hoje);
      if (s === "pago") cur.pago += va;
      else if (s === "aberto") cur.aberto += va;
      else if (s === "futuro") cur.futuro += va;
      if (s !== "cancelado" && s !== "devolvido") cur.total += va;
    }
    const lista = Array.from(map.values());
    const mult = sortPedidoDir === "asc" ? 1 : -1;
    return lista.sort((a, b) => {
      const num = (x: PedidoAgregado) =>
        sortPedido === "titulos" ? x.titulos.length : Number(x[sortPedido]);
      const va = num(a);
      const vb = num(b);
      return (va - vb) * mult;
    });
  }, [filtrados, hoje, sortPedido, sortPedidoDir]);

  const totaisPedidos = useMemo(
    () =>
      pedidos.reduce(
        (a, p) => ({
          titulos: a.titulos + p.titulos.length,
          pago: a.pago + p.pago,
          aberto: a.aberto + p.aberto,
          futuro: a.futuro + p.futuro,
          total: a.total + p.total,
        }),
        { titulos: 0, pago: 0, aberto: 0, futuro: 0, total: 0 },
      ),
    [pedidos],
  );

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  function toggleSortPedido(k: SortPedido) {
    if (sortPedido === k) setSortPedidoDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortPedido(k); setSortPedidoDir("desc"); }
  }

  function IconeSort({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="inline h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="inline h-3 w-3 text-gold" />
      : <ArrowDown className="inline h-3 w-3 text-gold" />;
  }

  function IconeSortPedido({ k }: { k: SortPedido }) {
    if (sortPedido !== k) return <ArrowUpDown className="inline h-3 w-3 opacity-40" />;
    return sortPedidoDir === "asc"
      ? <ArrowUp className="inline h-3 w-3 text-gold" />
      : <ArrowDown className="inline h-3 w-3 text-gold" />;
  }

  const sufixoArquivo = mes === "todos" || mes === "" ? "todos" : mes.slice(0, 7);

  function exportarMensal() {
    const ws = XLSX.utils.json_to_sheet(
      mensal.map((r) => ({
        mes: r.mesKey,
        mes_rotulo: r.mes,
        competencia: r.competencia,
        caixa: r.caixa,
        diferenca: r.competencia - r.caixa,
        previsto: r.previsto,
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mensal");
    XLSX.writeFile(wb, `fluxo-competencia-mensal-${sufixoArquivo}.xlsx`);
  }

  function exportarTitulos() {
    const ws = XLSX.utils.json_to_sheet(
      titulos.map((r) => ({ ...r, situacao: situacaoDe(r, hoje) })) as unknown as Record<string, unknown>[],
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Titulos");
    XLSX.writeFile(wb, `fluxo-competencia-titulos-${sufixoArquivo}.xlsx`);
  }

  function exportarPedidos() {
    const ws = XLSX.utils.json_to_sheet(
      pedidos.map((p) => ({
        pedido: p.pedido_ref,
        pedido_id: p.pedido_id,
        cliente: p.cliente,
        estagio: p.estagio,
        nfs: p.nfs.join(", "),
        titulos: p.titulos.length,
        pago: p.pago,
        aberto: p.aberto,
        futuro: p.futuro,
        total: p.total,
        situacao_agregada:
          p.aberto > 0 ? "aberto" : p.futuro > 0 ? "futuro" : p.pago > 0 ? "pago" : "sem valor",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `fluxo-competencia-pedidos-${sufixoArquivo}.xlsx`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Erro ao carregar vw_ciclo_titulo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive whitespace-pre-wrap">
            {String((error as { message?: string })?.message ?? error)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PageShell>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
          <ArrowLeftRight className="h-6 w-6 text-gold" />
          Fluxo &amp; Competência
        </h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
          Três datas do mesmo título, nunca somadas entre si: competência é a NF, caixa é a
          movimentação bancária, previsto é a régua de recebimento. A diferença entre elas é o que
          ainda não entrou mais o que entrou sem nota.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={mes || "todos"} onValueChange={setMes}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Mês do pedido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {meses.map((m) => (
                  <SelectItem key={m} value={m}>{rotuloMesLongo(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={elo} onValueChange={setElo}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Elo do caixa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os elos</SelectItem>
                {elos.map((e) => (
                  <SelectItem key={e} value={e}>{ELO_ROTULO[e] ?? e}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pedido, cliente, título ou NF"
              className="w-[280px]"
            />

            {foraDoDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTipo("todos"); setElo("todos"); setBusca(""); }}
              >
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Tipo de pagamento:</span>
            <Button
              size="sm"
              variant={tipo === "todos" ? "default" : "outline"}
              onClick={() => setTipo("todos")}
            >
              Todos
            </Button>
            {tipos.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tipo === t ? "default" : "outline"}
                onClick={() => setTipo(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bloco 1 — Materialização */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-gold/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PAGO</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">{fmtBRL(kpis.pago)}</p>
            <p className="text-xs text-muted-foreground">título com data de pagamento</p>
            <QuebraTipos linhas={kpis.pagas} />
          </CardContent>
        </Card>

        <Card className={cn(kpis.aberto > 0 && "border-destructive/40")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ABERTO</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-medium tabular-nums", kpis.aberto > 0 && "text-destructive")}>
              {fmtBRL(kpis.aberto)}
            </p>
            <p className="text-xs text-muted-foreground">vencido e sem pagamento</p>
            <QuebraTipos linhas={kpis.abertas} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">FUTURO</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-medium tabular-nums">{fmtBRL(kpis.futuro)}</p>
            <p className="text-xs text-muted-foreground">previsto pela régua de recebimento</p>
            <QuebraTipos linhas={kpis.futuras} />
          </CardContent>
        </Card>

        {kpis.safrapay > 0 && (
          <Card className="border-warning/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aguarda SafraPay</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-medium tabular-nums">{fmtBRL(kpis.safrapay)}</p>
              <p className="text-xs text-muted-foreground">
                liquidação de cartão ainda não importada
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Cancelado e devolvido ficam fora dos três totais e aparecem na tabela.
      </p>

      {/* Bloco 2 — Gráfico + tabela mensal */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mês a mês — competência, caixa e previsto</CardTitle>
          <Button variant="outline" size="sm" onClick={exportarMensal}>
            <Download className="mr-2 h-4 w-4" /> XLSX
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm">
            Competência <span className="tabular-nums">{fmtBRL(contabil.competencia)}</span>
            {" · "}Caixa confirmado <span className="tabular-nums">{fmtBRL(contabil.caixa)}</span>
            {" · "}Previsto <span className="tabular-nums">{fmtBRL(contabil.previsto)}</span>
            {" · "}
            <span className={cn(contabil.semProva > 0 && "text-destructive")}>
              Sem prova <span className="tabular-nums">{fmtBRL(contabil.semProva)}</span>
            </span>
          </p>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mensal} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={80}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000 ? `R$ ${Math.round(v / 1000)}k` : `R$ ${v}`
                  }
                />
                <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="competencia" name="Competência" fill="hsl(var(--primary))" />
                <Bar dataKey="caixa" name="Caixa" fill="hsl(var(--primary) / 0.55)" />
                <Line dataKey="previsto" name="Previsto" type="monotone" stroke="hsl(var(--info, var(--primary)))" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Competência</TableHead>
                <TableHead className="text-right">Caixa</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mensal.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nenhum título no filtro atual.
                  </TableCell>
                </TableRow>
              )}
              {mensal.map((r) => {
                const dif = r.competencia - r.caixa;
                return (
                  <TableRow key={r.mesKey}>
                    <TableCell>{r.mes}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.competencia)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.caixa)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", dif < 0 && "text-destructive")}>
                      {fmtBRL(dif)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.previsto)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtBRL(totaisMensal.competencia)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtBRL(totaisMensal.caixa)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    totaisMensal.competencia - totaisMensal.caixa < 0 && "text-destructive",
                  )}
                >
                  {fmtBRL(totaisMensal.competencia - totaisMensal.caixa)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtBRL(totaisMensal.previsto)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          <p className="text-xs text-muted-foreground">
            Competência e caixa não batem por definição — a NF é fato fiscal, a movimentação é fato
            financeiro. A coluna Caixa é dinheiro que entrou na conta, por movimentação distinta; o
            KPI Caixa confirmado é o valor do título com lastro. As duas divergem por MDR de cartão,
            juros e liquidação parcial.
          </p>
        </CardContent>
      </Card>

      {/* Bloco 3 — Títulos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {visao === "pedido" ? `Pedidos (${pedidos.length})` : `Títulos (${titulos.length})`}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={visao === "pedido" ? "default" : "outline"}
              onClick={() => setVisao("pedido")}
            >
              Por pedido
            </Button>
            <Button
              size="sm"
              variant={visao === "titulo" ? "default" : "outline"}
              onClick={() => setVisao("titulo")}
            >
              Por título
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={visao === "pedido" ? exportarPedidos : exportarTitulos}
            >
              <Download className="mr-2 h-4 w-4" /> XLSX
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <button
                key={p.elo}
                type="button"
                onClick={() => setElo(elo === p.elo ? "todos" : p.elo)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  eloClasse(p.elo),
                  elo === p.elo && "ring-2 ring-offset-1 ring-gold",
                )}
              >
                {ELO_ROTULO[p.elo] ?? p.elo} · {p.n} ·{" "}
                <span className="tabular-nums">{fmtBRL(p.total)}</span>
              </button>
            ))}
          </div>

          {visao === "pedido" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estágio</TableHead>
                    <TableHead>NFs</TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSortPedido("titulos")}>
                      Títulos <IconeSortPedido k="titulos" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSortPedido("pago")}>
                      PAGO <IconeSortPedido k="pago" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSortPedido("aberto")}>
                      ABERTO <IconeSortPedido k="aberto" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSortPedido("futuro")}>
                      FUTURO <IconeSortPedido k="futuro" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSortPedido("total")}>
                      Total <IconeSortPedido k="total" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                        Nenhum título no filtro atual.
                      </TableCell>
                    </TableRow>
                  )}
                  {pedidos.map((p) => {
                    const chave = p.pedido_id ?? p.pedido_ref ?? "sem-pedido";
                    const aberto = expandido === chave;
                    return (
                      <Fragment key={chave}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandido(aberto ? null : chave)}
                        >
                          <TableCell>
                            {aberto
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            {p.pedido_id ? (
                              <Button
                                variant="link"
                                className="h-auto p-0 font-mono text-xs"
                                onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${p.pedido_id}`); }}
                              >
                                {p.pedido_ref ?? "ver"}
                              </Button>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={p.cliente ?? undefined}>
                            {p.cliente ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{p.estagio ?? "—"}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {p.nfs.length > 0 ? p.nfs.join(", ") : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{p.titulos.length}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(p.pago)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", p.aberto > 0 && "text-destructive")}>
                            {fmtBRL(p.aberto)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtBRL(p.futuro)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{fmtBRL(p.total)}</TableCell>
                        </TableRow>
                        {aberto && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Forma</TableHead>
                                    <TableHead>Situação</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Pago em</TableHead>
                                    <TableHead>Previsto</TableHead>
                                    <TableHead>Movimentação</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {p.titulos.map((t) => {
                                    const s = situacaoDe(t, hoje);
                                    return (
                                      <TableRow key={t.titulo_id}>
                                        <TableCell>
                                          <span className="font-mono text-xs">{t.numero_titulo ?? "—"}</span>
                                          {t.total_parcelas ? (
                                            <span className="ml-1 text-xs text-muted-foreground">
                                              {t.numero_parcela ?? 1}/{t.total_parcelas}
                                            </span>
                                          ) : null}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {t.forma_nome ?? "—"}
                                          {t.gera_caixa === false && (
                                            <Badge variant="outline" className="ml-1 text-xs">sem caixa</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className={cn("text-xs", SITUACAO_CLASSE[s])}>
                                            {s}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{fmtBRL(t.valor_atual)}</TableCell>
                                        <TableCell className="text-xs">{fmtData(t.data_vencimento_atual)}</TableCell>
                                        <TableCell className="text-xs">{fmtData(t.data_pagamento)}</TableCell>
                                        <TableCell>
                                          <p className="text-xs">{fmtData(t.data_liquidacao_prevista)}</p>
                                          {t.ancora_regua && (
                                            <p className="text-xs text-muted-foreground">{t.ancora_regua}</p>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {t.movimentacao_id ? (
                                            <div title={t.mov_descricao ?? undefined}>
                                              <p className="flex items-center gap-1 text-xs">
                                                {fmtData(t.mov_data)} ·{" "}
                                                <span className="tabular-nums">{fmtBRL(t.mov_valor)}</span>
                                                {t.mov_conciliado && <Check className="h-3 w-3 text-success" />}
                                              </p>
                                              {t.mov_conta && (
                                                <p className="text-xs text-muted-foreground">{t.mov_conta}</p>
                                              )}
                                            </div>
                                          ) : t.quitado_por_haver ? (
                                            <p className="text-xs">Haver</p>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{totaisPedidos.titulos}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBRL(totaisPedidos.pago)}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", totaisPedidos.aberto > 0 && "text-destructive")}>
                      {fmtBRL(totaisPedidos.aberto)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBRL(totaisPedidos.futuro)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtBRL(totaisPedidos.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("competencia")}>
                      Competência <IconeSort k="competencia" />
                    </TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("valor")}>
                      Valor <IconeSort k="valor" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("vencimento")}>
                      Vencimento <IconeSort k="vencimento" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("previsto")}>
                      Previsto <IconeSort k="previsto" />
                    </TableHead>
                    <TableHead>Elo</TableHead>
                    <TableHead>Movimentação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {titulos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center text-sm text-muted-foreground">
                        Nenhum título no filtro atual.
                      </TableCell>
                    </TableRow>
                  )}
                  {titulos.map((r) => (
                    <TableRow key={r.titulo_id}>
                      <TableCell>
                        <span className="font-mono text-xs">{r.numero_titulo ?? "—"}</span>
                        {r.total_parcelas ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {r.numero_parcela ?? 1}/{r.total_parcelas}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {r.pedido_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() => navigate(`/pedidos/${r.pedido_id}`)}
                          >
                            {r.pedido_ref ?? "ver"}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate" title={r.cliente ?? undefined}>
                        {r.cliente ?? "—"}
                      </TableCell>
                      <TableCell>
                        {r.nf_id || r.nf_ref ? (
                          <div>
                            <p className="font-mono text-xs">{r.nf_ref ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{fmtData(r.nf_data)}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{rotuloMesCurto(r.mes_competencia)}</TableCell>
                      <TableCell className="text-xs">
                        {r.forma_nome ?? "—"}
                        {r.gera_caixa === false && (
                          <Badge variant="outline" className="ml-1 text-xs">sem caixa</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.banco_recebimento ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{r.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(r.valor_atual)}</TableCell>
                      <TableCell className="text-xs">{fmtData(r.data_vencimento_atual)}</TableCell>
                      <TableCell>
                        <p className="text-xs">{fmtData(r.data_liquidacao_prevista)}</p>
                        {r.ancora_regua && (
                          <p className="text-xs text-muted-foreground">{r.ancora_regua}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-xs", eloClasse(r.elo_caixa))}>
                          {ELO_ROTULO[r.elo_caixa ?? ""] ?? r.elo_caixa ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.movimentacao_id ? (
                          <div title={r.mov_descricao ?? undefined}>
                            <p className="flex items-center gap-1 text-xs">
                              {fmtData(r.mov_data)} ·{" "}
                              <span className="tabular-nums">{fmtBRL(r.mov_valor)}</span>
                              {r.mov_conciliado && <Check className="h-3 w-3 text-success" />}
                            </p>
                            {r.mov_conta && (
                              <p className="text-xs text-muted-foreground">{r.mov_conta}</p>
                            )}
                          </div>
                        ) : r.quitado_por_haver ? (
                          <p className="text-xs">Haver</p>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={8} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtBRL(totaisTitulos.valor)}
                    </TableCell>
                    <TableCell colSpan={3} />
                    <TableCell className="font-medium tabular-nums">
                      {fmtBRL(totaisTitulos.mov)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
