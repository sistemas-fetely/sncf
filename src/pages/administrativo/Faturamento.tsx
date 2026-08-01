import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Receipt, Loader2, Download, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  Legend, CartesianGrid, ReferenceLine, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  useFaturamentoMensal, useFaturamentoNf, useFaturamentoProduto, useFaturamentoPedido,
  type FaturamentoMensal, type FaturamentoNf, type FaturamentoProduto, type FaturamentoPedido,
} from "@/hooks/financas/useFaturamento";


const CANAIS = ["B2B", "B2C", "SEM CANAL"] as const;

const fmtBRL = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`;

const fmtInt = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR");

function mesLabel(mes: string): string {
  const d = new Date(mes.slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return mes;
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", "/");
}

function dataLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

const n = (v: number | null | undefined) => Number(v ?? 0);

type Componente = "tudo" | "produto" | "frete";
type SortDir = "asc" | "desc";

function SortHead<T extends string>({
  col, label, sortCol, sortDir, onSort, className,
}: {
  col: T; label: string; sortCol: T | null; sortDir: SortDir;
  onSort: (c: T) => void; className?: string;
}) {
  const ativo = sortCol === col;
  return (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(col)}>
        {label}
        {!ativo ? <ArrowUpDown className="h-3 w-3 opacity-40" />
          : sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </button>
    </TableHead>
  );
}

function sortNums<T>(list: T[], get: (r: T) => number | string | null, dir: SortDir): T[] {
  return [...list].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return dir === "asc" ? va - vb : vb - va;
    return dir === "asc"
      ? String(va).localeCompare(String(vb), "pt-BR")
      : String(vb).localeCompare(String(va), "pt-BR");
  });
}

function KpiCard({ label, value, sub, alerta }: { label: string; value: string; sub?: string; alerta?: boolean }) {
  return (
    <Card className={cn(alerta && "border-destructive/40")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", alerta && "text-destructive")}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1 tabular-nums">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Faturamento() {
  const navigate = useNavigate();
  const [mes, setMes] = useState<string>("");
  const [canal, setCanal] = useState<string>("todos");
  const [componente, setComponente] = useState<Componente>("tudo");

  const { data: mensal = [], isLoading: loadingMensal, isError: errMensal, error: errorMensal } =
    useFaturamentoMensal();

  const mesesComReceita = useMemo(
    () =>
      Array.from(
        new Set(mensal.filter((r) => n(r.receita_produto) > 0).map((r) => String(r.mes).slice(0, 10))),
      ).sort((a, b) => b.localeCompare(a)),
    [mensal],
  );

  const mesEfetivo = mes || mesesComReceita[0] || "";

  const { data: nfs = [], isLoading: loadingNfs, isError: errNfs, error: errorNfs } =
    useFaturamentoNf(mesEfetivo);
  const { data: produtos = [], isLoading: loadingProd, isError: errProd, error: errorProd } =
    useFaturamentoProduto(mesEfetivo);
  const { data: pedidos = [], isLoading: loadingPed, isError: errPed, error: errorPed } =
    useFaturamentoPedido(mesEfetivo);


  const safra = useMemo(() => {
    const s = produtos.find((p) => p.custo_safra)?.custo_safra ?? nfs.find((r) => r.custo_safra)?.custo_safra;
    return s ? dataLabel(s) : "—";
  }, [produtos, nfs]);

  const canalOk = (c: string | null | undefined) => canal === "todos" || (c ?? "SEM CANAL") === canal;

  // ── Agregados do mês/canal
  const mesRows = useMemo(
    () => mensal.filter((r) => String(r.mes).slice(0, 10) === mesEfetivo && canalOk(r.canal)),
    [mensal, mesEfetivo, canal],
  );

  const agg = useMemo(() => {
    const soma = (f: (r: FaturamentoMensal) => number) => mesRows.reduce((s, r) => s + f(r), 0);
    const receita_produto = soma((r) => n(r.receita_produto));
    const receita_frete = soma((r) => n(r.receita_frete));
    const receita_total = soma((r) => n(r.receita_total));
    const cmv = soma((r) => n(r.cmv));
    const icms = soma((r) => n(r.icms));
    const margem_produto = soma((r) => n(r.margem_produto));
    const margem_com_frete = soma((r) => n(r.margem_com_frete_pago));
    const custo_frete_pago = soma((r) => n(r.custo_frete_pago));
    const resultado_frete = soma((r) => n(r.resultado_frete));
    const nfsQtd = soma((r) => n(r.nfs));
    const unidades = soma((r) => n(r.unidades));
    const lancamentos_frete = soma((r) => n(r.lancamentos_frete));

    const faturamento =
      componente === "produto" ? receita_produto : componente === "frete" ? receita_frete : receita_total;
    const margem = componente === "produto" ? margem_produto : margem_com_frete;

    return {
      receita_produto, receita_frete, receita_total, cmv, icms, margem_produto,
      margem_com_frete, custo_frete_pago, resultado_frete, nfsQtd, unidades,
      lancamentos_frete, faturamento, margem,
      ticket: nfsQtd > 0 ? faturamento / nfsQtd : null,
      margem_pct: faturamento > 0 ? margem / faturamento : null,
    };
  }, [mesRows, componente]);

  const resolver = useMemo(() => {
    const soma = (f: (r: FaturamentoMensal) => number) => mesRows.reduce((s, r) => s + f(r), 0);
    const divergencia = soma((r) => n(r.nfs_divergencia_canal));
    const semPedido = soma((r) => n(r.nfs_sem_pedido));
    const semCusto = soma((r) => n(r.itens_sem_custo));
    const cfopOrfao = soma((r) => n(r.itens_cfop_orfao));
    return { divergencia, semPedido, semCusto, cfopOrfao, total: divergencia + semPedido + semCusto + cfopOrfao };
  }, [mesRows]);

  // ── Gráfico (todos os meses)
  const chart = useMemo(() => {
    const meses = Array.from(new Set(mensal.map((r) => String(r.mes).slice(0, 10)))).sort();
    return meses.map((m) => {
      const rows = mensal.filter((r) => String(r.mes).slice(0, 10) === m && canalOk(r.canal));
      const linha: Record<string, string | number> = { mes: mesLabel(m) };
      for (const c of CANAIS) {
        if (canal !== "todos" && c !== canal) continue;
        const rc = rows.filter((r) => (r.canal ?? "SEM CANAL") === c);
        linha[c] = componente === "frete"
          ? rc.reduce((s, r) => s + n(r.resultado_frete), 0)
          : rc.reduce((s, r) => s + n(r.receita_produto), 0);
      }
      linha["Margem"] = rows.reduce(
        (s, r) => s + (componente === "produto" ? n(r.margem_produto) : n(r.margem_com_frete_pago)),
        0,
      );
      linha["Resultado do frete"] = rows.reduce((s, r) => s + n(r.resultado_frete), 0);
      return linha;
    });
  }, [mensal, canal, componente]);

  const canaisNoGrafico = canal === "todos" ? [...CANAIS] : [canal];
  const CORES: Record<string, string> = {
    B2B: "hsl(var(--primary))",
    B2C: "hsl(var(--primary) / 0.55)",
    "SEM CANAL": "hsl(var(--muted-foreground) / 0.5)",
  };

  const filtrosAlterados = (mes && mes !== mesesComReceita[0]) || canal !== "todos" || componente !== "tudo";

  if (errMensal) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 text-gold" /> Faturamento
        </h1>
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-sm text-destructive">
            Falha ao carregar o faturamento mensal: {(errorMensal as any)?.message ?? String(errorMensal)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 text-gold" />
          Faturamento
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faturamento é fato fiscal — NF autorizada. Não é recebível: não bate com Contas a Receber por
          definição. Custo pela safra de {safra}.
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center gap-3">
          <Select value={mesEfetivo} onValueChange={setMes}>
            <SelectTrigger className="w-[190px] h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              {mesesComReceita.map((m) => (
                <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            {(["todos", "B2B", "B2C", "SEM CANAL"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                className="h-9"
                variant={canal === c ? "default" : "outline"}
                onClick={() => setCanal(c)}
              >
                {c === "todos" ? "Todos" : c === "SEM CANAL" ? "Sem canal" : c}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {([
              ["tudo", "Tudo"],
              ["produto", "Só produto"],
              ["frete", "Só frete"],
            ] as const).map(([v, label]) => (
              <Button
                key={v}
                size="sm"
                className="h-9"
                variant={componente === v ? "default" : "outline"}
                onClick={() => setComponente(v)}
              >
                {label}
              </Button>
            ))}
          </div>

          {filtrosAlterados && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setMes(""); setCanal("todos"); setComponente("tudo"); }}
            >
              Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {loadingMensal ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : componente === "frete" ? (
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard label="Receita de frete cobrada" value={fmtBRL(agg.receita_frete)} />
          <KpiCard label="Custo de frete pago" value={fmtBRL(agg.custo_frete_pago)} />
          <KpiCard
            label="Resultado do frete"
            value={fmtBRL(agg.resultado_frete)}
            alerta={agg.resultado_frete < 0}
          />
          <KpiCard label="Lançamentos de frete" value={fmtInt(agg.lancamentos_frete)} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard label="Faturamento" value={fmtBRL(agg.faturamento)} sub={`${fmtInt(agg.unidades)} unidades`} />
          <KpiCard label="Nº de NFs" value={fmtInt(agg.nfsQtd)} />
          <KpiCard label="Ticket médio" value={fmtBRL(agg.ticket)} />
          <KpiCard label="CMV" value={fmtBRL(agg.cmv)} sub={`ICMS ${fmtBRL(agg.icms)}`} />
          <KpiCard
            label={componente === "produto" ? "Margem do produto" : "Margem com frete pago"}
            value={`${fmtBRL(agg.margem)} · ${fmtPct(agg.margem_pct)}`}
            alerta={agg.margem < 0}
          />
          <KpiCard
            label="Resultado do frete"
            value={fmtBRL(agg.resultado_frete)}
            alerta={agg.resultado_frete < 0}
          />
        </div>
      )}

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {componente === "frete" ? "Resultado do frete por mês" : "Receita de produto por mês"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMensal ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            </div>
          ) : chart.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
          ) : (
            <div className="w-full h-[320px]">
              <ResponsiveContainer>
                {componente === "frete" ? (
                  <BarChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRL(v)} width={100} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--foreground))" />
                    <Bar dataKey="Resultado do frete">
                      {chart.map((d, i) => (
                        <Cell
                          key={i}
                          fill={Number(d["Resultado do frete"]) < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <ComposedChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRL(v)} width={100} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {canaisNoGrafico.map((c) => (
                      <Bar key={c} dataKey={c} stackId="canal" fill={CORES[c]} />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="Margem"
                      stroke="hsl(var(--gold, var(--primary)))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* A resolver */}
      {resolver.total > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              A resolver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <div><div className="text-xs text-muted-foreground">NFs com canal divergente do CFOP</div><div className="text-xl font-semibold tabular-nums">{fmtInt(resolver.divergencia)}</div></div>
              <div><div className="text-xs text-muted-foreground">NFs de venda sem pedido vinculado</div><div className="text-xl font-semibold tabular-nums">{fmtInt(resolver.semPedido)}</div></div>
              <div><div className="text-xs text-muted-foreground">Itens sem custo</div><div className="text-xl font-semibold tabular-nums">{fmtInt(resolver.semCusto)}</div></div>
              <div><div className="text-xs text-muted-foreground">Itens com CFOP não classificado</div><div className="text-xl font-semibold tabular-nums">{fmtInt(resolver.cfopOrfao)}</div></div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Contadores de leitura. A correção não acontece aqui — o dado se conserta na origem e este
              painel zera sozinho.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="nfs">
        <TabsList>
          <TabsTrigger value="nfs">NFs consideradas</TabsTrigger>
          {componente !== "frete" && <TabsTrigger value="pedido">Por pedido</TabsTrigger>}
          {componente !== "frete" && <TabsTrigger value="produto">Rentabilidade por produto</TabsTrigger>}

        </TabsList>

        <TabsContent value="nfs" className="mt-4">
          <AbaNfs
            rows={nfs}
            isLoading={loadingNfs}
            isError={errNfs}
            error={errorNfs}
            canalOk={canalOk}
            componente={componente}
            mes={mesEfetivo}
            onPedido={(id) => navigate(`/pedidos/${id}`)}
          />
        </TabsContent>

        {componente !== "frete" && (
          <TabsContent value="pedido" className="mt-4">
            <AbaPedido
              rows={pedidos}
              isLoading={loadingPed}
              isError={errPed}
              error={errorPed}
              canalOk={canalOk}
              componente={componente}
              mes={mesEfetivo}
              onPedido={(id) => navigate(`/pedidos/${id}`)}
            />
          </TabsContent>
        )}

        {componente !== "frete" && (

          <TabsContent value="produto" className="mt-4">
            <AbaProduto
              rows={produtos}
              isLoading={loadingProd}
              isError={errProd}
              error={errorProd}
              canalOk={canalOk}
              mes={mesEfetivo}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ════════════════════════════════════════════════
// Derivação por linha (NF ou SKU)
// ════════════════════════════════════════════════
const NOTA_HONESTIDADE =
  "Resultado por linha é antes do custo de frete pago — ele não resolve por NF. O número com frete está na cascata.";

interface LinhaBase {
  unidades: number | null;
  receita_produto: number | null;
  receita_frete: number | null;
  cmv: number | null;
  icms: number | null;
  margem: number | null;
}

interface LinhaDerivada {
  receita: number;
  margem_bruta: number;
  resultado: number;
  cmv_pct: number | null;
  icms_pct: number | null;
  margem_bruta_pct: number | null;
  resultado_pct: number | null;
}

function derivarLinha(r: LinhaBase, componente: Componente): LinhaDerivada {
  const receita = componente === "produto"
    ? n(r.receita_produto)
    : n(r.receita_produto) + n(r.receita_frete);
  const cmv = n(r.cmv);
  const icms = n(r.icms);
  const margem_bruta = receita - cmv;
  const resultado = n(r.margem);
  const pct = (v: number) => (receita > 0 ? v / receita : null);
  return {
    receita, margem_bruta, resultado,
    cmv_pct: pct(cmv),
    icms_pct: pct(icms),
    margem_bruta_pct: pct(margem_bruta),
    resultado_pct: pct(resultado),
  };
}

function somarLinhas(rows: LinhaBase[], componente: Componente) {
  const unidades = rows.reduce((s, r) => s + n(r.unidades), 0);
  const receita_produto = rows.reduce((s, r) => s + n(r.receita_produto), 0);
  const receita_frete = rows.reduce((s, r) => s + n(r.receita_frete), 0);
  const cmv = rows.reduce((s, r) => s + n(r.cmv), 0);
  const icms = rows.reduce((s, r) => s + n(r.icms), 0);
  const margem = rows.reduce((s, r) => s + n(r.margem), 0);
  const d = derivarLinha(
    { unidades, receita_produto, receita_frete, cmv, icms, margem },
    componente,
  );
  return { unidades, receita_produto, receita_frete, cmv, icms, ...d };
}

// ════════════════════════════════════════════════
// Aba NFs consideradas
// ════════════════════════════════════════════════
type NfCol =
  | "nf_ref" | "data_emissao" | "cliente" | "unidades" | "receita"
  | "cmv_pct" | "icms_pct" | "margem_bruta_pct" | "resultado" | "resultado_pct";

function AbaNfs({
  rows, isLoading, isError, error, canalOk, componente, mes, onPedido,
}: {
  rows: FaturamentoNf[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  canalOk: (c: string | null | undefined) => boolean;
  componente: Componente;
  mes: string;
  onPedido: (id: string) => void;
}) {
  const [sortCol, setSortCol] = useState<NfCol>("resultado");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(c: NfCol) {
    if (sortCol !== c) { setSortCol(c); setSortDir("desc"); }
    else setSortDir(sortDir === "desc" ? "asc" : "desc");
  }

  const lista = useMemo(() => {
    const base = rows.filter((r) => canalOk(r.canal));
    const derivadas = base.map((r) => ({ r, d: derivarLinha(r, componente) }));
    const get = (x: { r: FaturamentoNf; d: LinhaDerivada }): number | string | null => {
      switch (sortCol) {
        case "nf_ref": return x.r.nf_ref;
        case "data_emissao": return x.r.data_emissao;
        case "cliente": return x.r.cliente;
        case "unidades": return n(x.r.unidades);
        case "receita": return x.d.receita;
        case "cmv_pct": return x.d.cmv_pct;
        case "icms_pct": return x.d.icms_pct;
        case "margem_bruta_pct": return x.d.margem_bruta_pct;
        case "resultado": return x.d.resultado;
        case "resultado_pct": return x.d.resultado_pct;
      }
    };
    return sortNums(derivadas, get, sortDir);
  }, [rows, canalOk, componente, sortCol, sortDir]);

  const total = useMemo(() => somarLinhas(lista.map((x) => x.r), componente), [lista, componente]);

  function exportar() {
    const linhas = lista.map(({ r, d }) => ({
      NF: r.nf_ref ?? "",
      Data: dataLabel(r.data_emissao),
      Pedido: r.pedido_ref ?? "",
      Cliente: r.cliente ?? "",
      UF: r.uf ?? "",
      Canal: r.canal ?? "",
      CFOP: r.cfops ?? "",
      Unidades: n(r.unidades),
      "Receita produto": n(r.receita_produto),
      "Receita frete": n(r.receita_frete),
      Receita: d.receita,
      CMV: n(r.cmv),
      ICMS: n(r.icms),
      "Margem bruta R$": d.margem_bruta,
      "Resultado R$": d.resultado,
      "CMV %": d.cmv_pct ?? "",
      "ICMS %": d.icms_pct ?? "",
      "Margem bruta %": d.margem_bruta_pct ?? "",
      "Resultado %": d.resultado_pct ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NFs");
    XLSX.writeFile(wb, `faturamento-nfs-${mes}.xlsx`);
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6 text-sm text-destructive">
          Falha ao carregar as NFs: {(error as any)?.message ?? String(error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">NFs consideradas · {lista.length}</CardTitle>
          <Button variant="outline" size="sm" disabled={lista.length === 0} onClick={exportar}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar XLSX
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{NOTA_HONESTIDADE}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma NF no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>CFOP</TableHead>
                  <SortHead col="unidades" label="Unidades" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="receita" label="Receita" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="cmv_pct" label="CMV %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="icms_pct" label="ICMS %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="margem_bruta_pct" label="Margem bruta %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="resultado" label="Resultado" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="resultado_pct" label="Resultado %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map(({ r, d }) => {
                  const avisos: string[] = [];
                  if (r.divergencia_canal) avisos.push("Canal divergente do CFOP");
                  if (r.sem_canal) avisos.push("NF sem canal");
                  if (n(r.itens_sem_custo) > 0) avisos.push(`${n(r.itens_sem_custo)} item(ns) sem custo`);
                  const baixa = d.resultado_pct != null && d.resultado_pct < 0.2;
                  return (
                    <TableRow key={r.nf_id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          {r.nf_ref ?? "—"}
                          {avisos.length > 0 && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1"
                              title={avisos.join(" · ")}
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{dataLabel(r.data_emissao)}</TableCell>
                      <TableCell className="text-xs">
                        {r.pedido_ref ? (
                          r.pedido_venda_id ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 font-mono text-xs"
                              onClick={() => onPedido(r.pedido_venda_id!)}
                            >
                              {r.pedido_ref}
                            </Button>
                          ) : (
                            <span className="font-mono text-xs">{r.pedido_ref}</span>
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate" title={r.cliente ?? undefined}>
                        {r.cliente ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.uf ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-xs">{r.canal ?? "SEM CANAL"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate" title={r.cfops ?? undefined}>
                        {r.cfops ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.unidades)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBRL(d.receita)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPct(d.cmv_pct)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPct(d.icms_pct)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPct(d.margem_bruta_pct)}</TableCell>
                      <TableCell className={cn("text-right text-xs tabular-nums", d.resultado < 0 && "text-destructive")}>
                        {fmtBRL(d.resultado)}
                      </TableCell>
                      <TableCell className={cn("text-right text-xs tabular-nums", baixa && "text-destructive font-medium")}>
                        {fmtPct(d.resultado_pct)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={7}>Total</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtInt(total.unidades)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtBRL(total.receita)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.cmv_pct)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.icms_pct)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.margem_bruta_pct)}</TableCell>
                  <TableCell className={cn("text-right text-xs tabular-nums", total.resultado < 0 && "text-destructive")}>
                    {fmtBRL(total.resultado)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.resultado_pct)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ════════════════════════════════════════════════
// Aba Rentabilidade por produto
// ════════════════════════════════════════════════
type ProdCol =
  | "sku" | "produto" | "colecao" | "unidades" | "preco_medio_un" | "custo_unit"
  | "receita" | "cmv_pct" | "margem_bruta_pct" | "resultado" | "resultado_pct";

function AbaProduto({
  rows, isLoading, isError, error, canalOk, componente, mes,
}: {
  rows: FaturamentoProduto[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  canalOk: (c: string | null | undefined) => boolean;
  componente: Componente;
  mes: string;
}) {
  const [busca, setBusca] = useState("");
  const [colecao, setColecao] = useState("todas");
  const [sortCol, setSortCol] = useState<ProdCol>("resultado");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(c: ProdCol) {
    if (sortCol !== c) { setSortCol(c); setSortDir("desc"); }
    else setSortDir(sortDir === "desc" ? "asc" : "desc");
  }

  const colecoes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.colecao).filter(Boolean))).sort() as string[],
    [rows],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (!canalOk(r.canal)) return false;
      if (colecao !== "todas" && r.colecao !== colecao) return false;
      if (q) {
        const hay = [r.sku, r.produto, r.colecao].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const derivadas = base.map((r) => ({ r, d: derivarLinha(r, componente) }));
    const get = (x: { r: FaturamentoProduto; d: LinhaDerivada }): number | string | null => {
      switch (sortCol) {
        case "sku": return x.r.sku;
        case "produto": return x.r.produto;
        case "colecao": return x.r.colecao;
        case "unidades": return n(x.r.unidades);
        case "preco_medio_un": return n(x.r.preco_medio_un);
        case "custo_unit": return n(x.r.custo_unit);
        case "receita": return x.d.receita;
        case "cmv_pct": return x.d.cmv_pct;
        case "margem_bruta_pct": return x.d.margem_bruta_pct;
        case "resultado": return x.d.resultado;
        case "resultado_pct": return x.d.resultado_pct;
      }
    };
    return sortNums(derivadas, get, sortDir);
  }, [rows, busca, colecao, canalOk, componente, sortCol, sortDir]);

  const total = useMemo(() => somarLinhas(lista.map((x) => x.r), componente), [lista, componente]);

  function exportar() {
    const linhas = lista.map(({ r, d }) => ({
      SKU: r.sku ?? "",
      Produto: r.produto ?? "",
      Coleção: r.colecao ?? "",
      Canal: r.canal ?? "",
      Unidades: n(r.unidades),
      "Preço médio un.": n(r.preco_medio_un),
      "Custo un.": n(r.custo_unit),
      "Receita produto": n(r.receita_produto),
      "Receita frete": n(r.receita_frete),
      Receita: d.receita,
      CMV: n(r.cmv),
      ICMS: n(r.icms),
      "Margem bruta R$": d.margem_bruta,
      "Resultado R$": d.resultado,
      "CMV %": d.cmv_pct ?? "",
      "ICMS %": d.icms_pct ?? "",
      "Margem bruta %": d.margem_bruta_pct ?? "",
      "Resultado %": d.resultado_pct ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produto");
    XLSX.writeFile(wb, `faturamento-produto-${mes}.xlsx`);
  }

  if (isError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-6 text-sm text-destructive">
          Falha ao carregar a rentabilidade por produto: {(error as any)?.message ?? String(error)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Rentabilidade por produto · {lista.length}</CardTitle>
          <Input
            placeholder="Buscar por SKU, produto, coleção…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs h-9"
          />
          <Select value={colecao} onValueChange={setColecao}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Coleção" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as coleções</SelectItem>
              {colecoes.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="ml-auto" disabled={lista.length === 0} onClick={exportar}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar XLSX
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{NOTA_HONESTIDADE}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhum produto no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead col="sku" label="SKU" sortCol={sortCol} sortDir={sortDir} onSort={toggle} />
                  <SortHead col="produto" label="Produto" sortCol={sortCol} sortDir={sortDir} onSort={toggle} />
                  <SortHead col="colecao" label="Coleção" sortCol={sortCol} sortDir={sortDir} onSort={toggle} />
                  <SortHead col="unidades" label="Unidades" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="preco_medio_un" label="Preço médio un." sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="custo_unit" label="Custo un." sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="receita" label="Receita" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="cmv_pct" label="CMV %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="margem_bruta_pct" label="Margem bruta %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="resultado" label="Resultado" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                  <SortHead col="resultado_pct" label="Resultado %" sortCol={sortCol} sortDir={sortDir} onSort={toggle} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map(({ r, d }, i) => {
                  const avisos: string[] = [];
                  if (r.sku_sem_cadastro) avisos.push("SKU sem cadastro");
                  if (r.sem_custo) avisos.push("Sem custo");
                  const baixa = d.resultado_pct != null && d.resultado_pct < 0.2;
                  return (
                    <TableRow key={`${r.sku ?? "sem-sku"}-${r.canal ?? ""}-${i}`}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          {r.sku ?? "—"}
                          {avisos.length > 0 && (
                            <span title={avisos.join(" · ")}>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate" title={r.produto ?? undefined}>
                        {r.produto ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.colecao ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.unidades)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.preco_medio_un)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBRL(r.custo_unit)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtBRL(d.receita)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPct(d.cmv_pct)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmtPct(d.margem_bruta_pct)}</TableCell>
                      <TableCell className={cn("text-right text-xs tabular-nums", d.resultado < 0 && "text-destructive")}>
                        {fmtBRL(d.resultado)}
                      </TableCell>
                      <TableCell className={cn("text-right text-xs tabular-nums", baixa && "text-destructive font-medium")}>
                        {fmtPct(d.resultado_pct)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-semibold bg-muted/40">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtInt(total.unidades)}</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-xs tabular-nums">{fmtBRL(total.receita)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.cmv_pct)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.margem_bruta_pct)}</TableCell>
                  <TableCell className={cn("text-right text-xs tabular-nums", total.resultado < 0 && "text-destructive")}>
                    {fmtBRL(total.resultado)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtPct(total.resultado_pct)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

