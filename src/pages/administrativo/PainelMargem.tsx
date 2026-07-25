import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingDown, AlertTriangle, Percent, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

const PISO = 0.20;

interface Row {
  sku: string;
  nome_comercial: string | null;
  grupo: string | null;
  colecao: string | null;
  custo: number | null;
  preco_b2b: number | null;
  preco_b2c: number | null;
  resultado_pct_b2b: number | null;
  resultado_pct_b2c: number | null;
  abaixo_piso_b2b: boolean | null;
  abaixo_piso_b2c: boolean | null;
}

const fmtBRL = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${(Number(v) * 100).toFixed(2)}%`;

type SortKey = "margem_b2b" | "margem_b2c" | null;
type SortDir = "asc" | "desc";

export default function PainelMargem() {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string>("todos");
  const [colecao, setColecao] = useState<string>("todas");
  const [soAbaixo, setSoAbaixo] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data = [], isLoading } = useQuery({
    queryKey: ["painel-margem"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_resultado_produto")
        .select(
          "sku, nome_comercial, grupo, colecao, custo, preco_b2b, preco_b2c, resultado_pct_b2b, resultado_pct_b2c, abaixo_piso_b2b, abaixo_piso_b2c"
        );
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const grupos = useMemo(
    () => Array.from(new Set(data.map((r) => r.grupo).filter(Boolean))).sort() as string[],
    [data]
  );
  const colecoes = useMemo(
    () => Array.from(new Set(data.map((r) => r.colecao).filter(Boolean))).sort() as string[],
    [data]
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let out = data.filter((r) => {
      if (grupo !== "todos" && r.grupo !== grupo) return false;
      if (colecao !== "todas" && r.colecao !== colecao) return false;
      if (soAbaixo && !(r.abaixo_piso_b2b || r.abaixo_piso_b2c)) return false;
      if (q) {
        const hay = [r.sku, r.nome_comercial, r.grupo, r.colecao]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortKey) {
      const key = sortKey === "margem_b2b" ? "resultado_pct_b2b" : "resultado_pct_b2c";
      out = [...out].sort((a, b) => {
        const va = a[key as keyof Row] as number | null;
        const vb = b[key as keyof Row] as number | null;
        // nulls sempre no fim
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return sortDir === "asc" ? va - vb : vb - va;
      });
    }
    return out;
  }, [data, busca, grupo, colecao, soAbaixo, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const abaixoB2B = data.filter((r) => r.abaixo_piso_b2b).length;
    const abaixoB2C = data.filter((r) => r.abaixo_piso_b2c).length;
    const b2b = data.map((r) => r.resultado_pct_b2b).filter((v): v is number => v != null);
    const b2c = data.map((r) => r.resultado_pct_b2c).filter((v): v is number => v != null);
    const mediaB2B = b2b.length ? b2b.reduce((s, v) => s + v, 0) / b2b.length : null;
    const mediaB2C = b2c.length ? b2c.reduce((s, v) => s + v, 0) / b2c.length : null;
    return { abaixoB2B, abaixoB2C, mediaB2B, mediaB2C };
  }, [data]);

  const porColecao = useMemo(() => {
    const map = new Map<string, { b2b: number[]; b2c: number[] }>();
    for (const r of data) {
      const k = r.colecao ?? "(sem coleção)";
      if (!map.has(k)) map.set(k, { b2b: [], b2c: [] });
      const g = map.get(k)!;
      if (r.resultado_pct_b2b != null) g.b2b.push(r.resultado_pct_b2b);
      if (r.resultado_pct_b2c != null) g.b2c.push(r.resultado_pct_b2c);
    }
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
    return Array.from(map.entries())
      .map(([colecao, g]) => ({
        colecao,
        media_b2b: avg(g.b2b),
        media_b2c: avg(g.b2c),
        n: g.b2b.length + g.b2c.length,
      }))
      .sort((a, b) => {
        const va = a.media_b2b ?? Number.POSITIVE_INFINITY;
        const vb = b.media_b2b ?? Number.POSITIVE_INFINITY;
        return va - vb;
      });
  }, [data]);

  const chartData = useMemo(
    () =>
      porColecao
        .filter((c) => c.media_b2b != null || c.media_b2c != null)
        .map((c) => ({
          colecao: c.colecao,
          B2B: c.media_b2b != null ? +(c.media_b2b * 100).toFixed(2) : 0,
          B2C: c.media_b2c != null ? +(c.media_b2c * 100).toFixed(2) : 0,
          _b2bNull: c.media_b2b == null,
        })),
    [porColecao]
  );

  function toggleSort(k: Exclude<SortKey, null>) {
    if (sortKey !== k) {
      setSortKey(k);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
    }
  }

  function SortIcon({ k }: { k: Exclude<SortKey, null> }) {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Percent className="h-6 w-6 text-gold" />
          Painel de Margem
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Margem por produto nos canais B2B e B2C. Piso de referência: {(PISO * 100).toFixed(0)}%.
          Somente leitura — o preço é decidido no FOP.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className={cn(kpis.abaixoB2B > 0 && "border-destructive/40")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className={cn("h-3.5 w-3.5", kpis.abaixoB2B > 0 ? "text-destructive" : "text-muted-foreground")} />
              SKUs abaixo do piso — B2B
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", kpis.abaixoB2B > 0 && "text-destructive")}>
              {kpis.abaixoB2B}
            </div>
          </CardContent>
        </Card>
        <Card className={cn(kpis.abaixoB2C > 0 && "border-destructive/40")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className={cn("h-3.5 w-3.5", kpis.abaixoB2C > 0 ? "text-destructive" : "text-muted-foreground")} />
              SKUs abaixo do piso — B2C
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", kpis.abaixoB2C > 0 && "text-destructive")}>
              {kpis.abaixoB2C}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Margem média B2B</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtPct(kpis.mediaB2B)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Margem média B2C</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtPct(kpis.mediaB2C)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Análise por coleção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-gold" />
            Margem média por coleção
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Ordenado da menor margem B2B para a maior — problemas primeiro. Linha tracejada = piso ({(PISO * 100).toFixed(0)}%).
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sem dados.</div>
          ) : (
            <div className="w-full h-[320px]">
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 60 }}>
                  <XAxis
                    dataKey="colecao"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: number) => `${v.toFixed(2)}%`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <ReferenceLine y={PISO * 100} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  <Bar dataKey="B2B" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={`b2b-${i}`}
                        fill={d.B2B > 0 && d.B2B < PISO * 100 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="B2C" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={`b2c-${i}`}
                        fill={d.B2C > 0 && d.B2C < PISO * 100 ? "hsl(var(--destructive) / 0.6)" : "hsl(var(--primary) / 0.5)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela por SKU */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos</CardTitle>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <Input
              placeholder="Buscar por SKU, nome, grupo, coleção…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os grupos</SelectItem>
                {grupos.map((g) => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={colecao} onValueChange={setColecao}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Coleção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as coleções</SelectItem>
                {colecoes.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="soAbaixo" checked={soAbaixo} onCheckedChange={setSoAbaixo} />
              <Label htmlFor="soAbaixo" className="text-sm cursor-pointer">Só abaixo do piso</Label>
            </div>
            {(grupo !== "todos" || colecao !== "todas" || soAbaixo || busca || sortKey) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGrupo("todos"); setColecao("todas"); setSoAbaixo(false);
                  setBusca(""); setSortKey(null);
                }}
              >
                Limpar filtros
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              {filtrados.length} de {data.length} SKUs
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gold" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Coleção</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Preço B2B</TableHead>
                    <TableHead className="text-right">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort("margem_b2b")}
                      >
                        Margem B2B <SortIcon k="margem_b2b" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Preço B2C</TableHead>
                    <TableHead className="text-right">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort("margem_b2c")}
                      >
                        Margem B2C <SortIcon k="margem_b2c" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((r) => {
                    const alerta = r.abaixo_piso_b2b || r.abaixo_piso_b2c;
                    return (
                      <TableRow
                        key={r.sku}
                        className={cn(alerta && "bg-destructive/5 hover:bg-destructive/10")}
                      >
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.nome_comercial || "—"}</TableCell>
                        <TableCell className="text-xs">{r.grupo || "—"}</TableCell>
                        <TableCell className="text-xs">{r.colecao || "—"}</TableCell>
                        <TableCell className="text-right text-xs">{fmtBRL(r.custo)}</TableCell>
                        <TableCell className="text-right text-xs">{fmtBRL(r.preco_b2b)}</TableCell>
                        <TableCell className="text-right">
                          {r.abaixo_piso_b2b ? (
                            <Badge variant="destructive" className="font-mono">{fmtPct(r.resultado_pct_b2b)}</Badge>
                          ) : (
                            <span className="font-mono text-xs">{fmtPct(r.resultado_pct_b2b)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmtBRL(r.preco_b2c)}</TableCell>
                        <TableCell className="text-right">
                          {r.abaixo_piso_b2c ? (
                            <Badge variant="destructive" className="font-mono">{fmtPct(r.resultado_pct_b2c)}</Badge>
                          ) : (
                            <span className="font-mono text-xs">{fmtPct(r.resultado_pct_b2c)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
