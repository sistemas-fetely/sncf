import { MultiSelectFilter } from "@/components/shared/MultiSelectFilter";
import { lerFiltroProduto } from "@/lib/produto/filtrosMultiplos";
import { useEstadoTela, resolverAcao, escreverLista } from "@/lib/navegacao";
import type { SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import { RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { CodProduto } from "@/components/produto/CodProduto";
import { useListaPaginada, numeroAgregado, gruposAgregado, type FiltroLista, type AgregadoLista } from "@/lib/lista/useListaPaginada";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingDown, AlertTriangle, Percent, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

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
  // TELA-LEMBRA-ONDE-EU-ESTAVA: filtros da lista na URL.
  const [nav, setNav] = useEstadoTela({ busca: "", grupo: "todos", colecao: "todas", abaixo: "0", ordem: "", dir: "asc" }, { replaceKeys: ["busca"] });
  const busca = nav.busca; const setBusca = (v: SetStateAction<typeof busca>) => setNav({ busca: resolverAcao(v, busca) as never });
  const grupoFiltro = nav.grupo; const setGrupoFiltro = (v: SetStateAction<typeof grupoFiltro>) => setNav({ grupo: resolverAcao(v, grupoFiltro) as never });
  const colecaoFiltro = nav.colecao; const setColecaoFiltro = (v: SetStateAction<typeof colecaoFiltro>) => setNav({ colecao: resolverAcao(v, colecaoFiltro) as never });
  const abaixoFiltro = nav.abaixo; const setAbaixoFiltro = (v: SetStateAction<typeof abaixoFiltro>) => setNav({ abaixo: resolverAcao(v, abaixoFiltro) as never });
  const ordemFiltro = nav.ordem; const setOrdemFiltro = (v: SetStateAction<typeof ordemFiltro>) => setNav({ ordem: resolverAcao(v, ordemFiltro) as never });
  const dirFiltro = nav.dir; const setDirFiltro = (v: SetStateAction<typeof dirFiltro>) => setNav({ dir: resolverAcao(v, dirFiltro) as never });
  const grupo = useMemo(() => lerFiltroProduto(grupoFiltro), [grupoFiltro]);
  const setGrupo = (v: string[]) => setGrupoFiltro(v.length ? escreverLista(v) : "todos");
  const colecao = useMemo(() => lerFiltroProduto(colecaoFiltro), [colecaoFiltro]);
  const setColecao = (v: string[]) => setColecaoFiltro(v.length ? escreverLista(v) : "todas");
  const soAbaixo = abaixoFiltro === "1";
  const setSoAbaixo = (v: boolean) => setAbaixoFiltro(v ? "1" : "0");
  const sortKey: SortKey = ordemFiltro === "margem_b2b" || ordemFiltro === "margem_b2c" ? ordemFiltro : null;
  const setSortKey = (v: SortKey) => setOrdemFiltro(v ?? "");
  const sortDir: SortDir = dirFiltro === "desc" ? "desc" : "asc";
  const setSortDir = (v: SortDir) => setDirFiltro(v);

  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(50);
  useEffect(() => setPagina(1), [busca, grupoFiltro, colecaoFiltro, soAbaixo, sortKey, sortDir]);
  const filtros: FiltroLista[] = [
    ...(grupo.length ? [{ c: "grupo", op: "in" as const, v: grupo }] : []),
    ...(colecao.length ? [{ c: "colecao", op: "in" as const, v: colecao }] : []),
  ];
  // A condição "B2B OU B2C abaixo" é representada pela união dos SKUs dos dois agregados.
  const abaixoQ = useListaPaginada<Row>({ relacao: "vw_resultado_produto", tamanho: 1,
    agregados: ["abaixo_piso_b2b", "abaixo_piso_b2c"].map(c => ({ id: c, fn: "count", por: ["sku"], onde: [{ c, op: "eq", v: true }] })) }, { enabled: soAbaixo });
  if (soAbaixo) filtros.push({ c: "sku", op: "in", v: [...new Set(["abaixo_piso_b2b", "abaixo_piso_b2c"].flatMap(c => gruposAgregado(abaixoQ.data?.agregados, c).map(g => String(g.sku))))] });
  const ignorar = ["__busca__", "grupo", "colecao", "sku"];
  const agregados: AgregadoLista[] = [
    { id: "base", fn: "count", ignorar },
    { id: "abaixoB2B", fn: "count", ignorar, onde: [{ c: "abaixo_piso_b2b", op: "eq", v: true }] },
    { id: "abaixoB2C", fn: "count", ignorar, onde: [{ c: "abaixo_piso_b2c", op: "eq", v: true }] },
    ...["b2b", "b2c"].flatMap(c => [
      { id: c, fn: "avg" as const, c: `resultado_pct_${c}`, ignorar },
      { id: `colecao_${c}`, fn: "avg" as const, c: `resultado_pct_${c}`, por: ["colecao"], ignorar },
    ]),
    ...["colecao", "grupo"].map(c => ({ id: c, fn: "count" as const, por: [c], ignorar: [c] })),
  ];
  const listaQ = useListaPaginada<Row>({ relacao: "vw_resultado_produto", busca, filtros, pagina, tamanho,
    ordem: [{ c: sortKey === "margem_b2c" ? "resultado_pct_b2c" : sortKey === "margem_b2b" ? "resultado_pct_b2b" : "sku", dir: sortKey ? sortDir : "asc" }, { c: "sku", dir: "asc" }], agregados }, { enabled: !soAbaixo || abaixoQ.isSuccess });
  const isLoading = listaQ.isLoading || (soAbaixo && abaixoQ.isLoading);
  const filtrados = listaQ.data?.linhas ?? [];
  const ag = listaQ.data?.agregados;
  const nullable = (id: string) => typeof ag?.[id] === "number" ? ag[id] as number : null;
  const kpis = { abaixoB2B: numeroAgregado(ag, "abaixoB2B"), abaixoB2C: numeroAgregado(ag, "abaixoB2C"), mediaB2B: nullable("b2b"), mediaB2C: nullable("b2c") };
  const opcoesDimensao = (c: string) => gruposAgregado(ag, c).filter(g => g[c] != null).map(g => ({ valor: String(g[c]), rotulo: String(g[c]), contagem: Number(g.valor ?? 0) })).sort((a,b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const porColecao = useMemo(() => {
    const mapa = new Map<string, { colecao: string; media_b2b: number | null; media_b2c: number | null }>();
    for (const c of ["b2b", "b2c"] as const) for (const g of gruposAgregado(ag, `colecao_${c}`)) {
      const colecao = String(g.colecao ?? "(sem coleção)");
      const linha = mapa.get(colecao) ?? { colecao, media_b2b: null, media_b2c: null };
      linha[`media_${c}`] = g.valor;
      mapa.set(colecao, linha);
    }
    return [...mapa.values()].sort((a,b) => (a.media_b2b ?? Infinity) - (b.media_b2b ?? Infinity));
  }, [ag]);

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
    <PageShell>
      <PageHeader
        titulo="Painel de Margem"
        icone={Percent}
        estado={`Margem por produto nos canais B2B e B2C. Piso de referência: ${(PISO * 100).toFixed(0)}%. Somente leitura — o preço é decidido no FOP.`}
      />

      {(listaQ.error || abaixoQ.error) && <p className="text-sm text-destructive">{String((listaQ.error ?? abaixoQ.error)?.message)}</p>}
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
            <div className={cn("text-2xl font-medium", kpis.abaixoB2B > 0 && "text-destructive")}>
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
            <div className={cn("text-2xl font-medium", kpis.abaixoB2C > 0 && "text-destructive")}>
              {kpis.abaixoB2C}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Margem média B2B</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{fmtPct(kpis.mediaB2B)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Margem média B2C</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{fmtPct(kpis.mediaB2C)}</div>
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
            <MultiSelectFilter label="Todos os grupos" plural="grupos" opcoes={opcoesDimensao("grupo")} selecionados={grupo} onChange={setGrupo} className="w-[180px] h-10" />
            <MultiSelectFilter label="Todas as coleções" plural="coleções" opcoes={opcoesDimensao("colecao")} selecionados={colecao} onChange={setColecao} className="w-[180px] h-10" />
            <div className="flex items-center gap-2">
              <Switch id="soAbaixo" checked={soAbaixo} onCheckedChange={setSoAbaixo} />
              <Label htmlFor="soAbaixo" className="text-sm cursor-pointer">Só abaixo do piso</Label>
            </div>
            {(grupo.length > 0 || colecao.length > 0 || soAbaixo || busca || sortKey) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGrupo([]); setColecao([]); setSoAbaixo(false);
                  setBusca(""); setSortKey(null);
                }}
              >
                Limpar filtros
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              {listaQ.data?.total ?? 0} de {numeroAgregado(ag, "base")} SKUs
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
                    <TableHead>Código</TableHead>
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
                        <TableCell><CodProduto chave={r.sku} variant="compacto" /></TableCell>
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
          <RodapePaginacao total={listaQ.data?.total ?? 0} pagina={pagina} tamanhoPagina={tamanho} onPagina={setPagina} onTamanhoPagina={setTamanho} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
