import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useEstadoTela } from "@/lib/navegacao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { CabecalhoOrdenavel, type DirecaoOrdenacao } from "@/components/tabela/CabecalhoOrdenavel";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { Loader2, Search, X } from "lucide-react";
import {
  fmtInt, fmtMeses, fmtPct, fmtX, mesCorrente, PALETA_SERIES, STATUS_BADGE, STATUS_COR,
  useGiro, useGiroMensal, type LinhaGiro, type StatusGiro,
} from "./icDados";

const CORTE = 60;

function SeloStatus({ s }: { s: StatusGiro | null }) {
  if (!s) return <span className="text-muted-foreground">—</span>;
  return <Badge variant="outline" className={cn("font-medium", STATUS_BADGE[s])}>{s}</Badge>;
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{valor}</div>
    </CardContent></Card>
  );
}

function Carregando() {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
}
function Erro({ e }: { e: unknown }) {
  return <div className="p-4 text-sm text-destructive">Erro: {(e as Error)?.message}</div>;
}

/* ---------- tabela de giro (coleção / variante / item) ---------- */
type Campo = "rotulo" | "categoria" | "status" | "cobertura_meses" | "giro_ano" | "sell_through" | "disponivel" | "vendido" | "saldo" | "venda_mes" | "tendencia_30d" | "estoque_custo" | "receita";

const COLUNAS: { campo: Campo; rotulo: string; dir?: boolean }[] = [
  { campo: "status", rotulo: "Status" },
  { campo: "cobertura_meses", rotulo: "Cobertura", dir: true },
  { campo: "giro_ano", rotulo: "Giro/ano", dir: true },
  { campo: "sell_through", rotulo: "Sell-through" },
  { campo: "disponivel", rotulo: "Disponível", dir: true },
  { campo: "vendido", rotulo: "Vendido", dir: true },
  { campo: "saldo", rotulo: "Sobrou", dir: true },
  { campo: "venda_mes", rotulo: "Venda/mês", dir: true },
  { campo: "tendencia_30d", rotulo: "Tendência 30d", dir: true },
  { campo: "estoque_custo", rotulo: "Estoque a custo", dir: true },
  { campo: "receita", rotulo: "Faturado", dir: true },
];

function valorOrdem(l: LinhaGiro & { rotulo: string }, c: Campo): number | string {
  const v = (l as any)[c];
  if (v === null || v === undefined) return typeof (l as any).rotulo === "string" && (c === "rotulo" || c === "categoria" || c === "status") ? "" : Number.POSITIVE_INFINITY;
  return v;
}

function TabelaGiro({
  titulo, linhas, rotuloPrimeira, rotuloDe, mostrarCategoria, selecionado, onClicar, ordem, onOrdem, acoes,
}: {
  titulo?: string;
  linhas: LinhaGiro[];
  rotuloPrimeira: string;
  rotuloDe: (l: LinhaGiro) => string;
  mostrarCategoria?: boolean;
  selecionado?: string | null;
  onClicar?: (l: LinhaGiro) => void;
  ordem: string;
  onOrdem: (o: string) => void;
  acoes?: React.ReactNode;
}) {
  const [campo, dir] = (ordem ? ordem.split(":") : ["", ""]) as [Campo | "", DirecaoOrdenacao | ""];
  const comRotulo = useMemo(() => linhas.map((l) => ({ ...l, rotulo: rotuloDe(l) })), [linhas, rotuloDe]);
  const ordenadas = useMemo(() => {
    if (!campo || !dir) return comRotulo;
    const s = dir === "asc" ? 1 : -1;
    return [...comRotulo].sort((a, b) => {
      const va = valorOrdem(a, campo), vb = valorOrdem(b, campo);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb), "pt-BR") * s;
      return (va - vb) * s;
    });
  }, [comRotulo, campo, dir]);
  const ciclo = (c: Campo) => {
    if (campo !== c) onOrdem(`${c}:asc`);
    else if (dir === "asc") onOrdem(`${c}:desc`);
    else onOrdem("");
  };
  const d = (c: Campo) => (campo === c ? (dir as DirecaoOrdenacao) : null);

  return (
    <Card>
      {(titulo || acoes) && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          {titulo && <CardTitle className="text-base">{titulo}</CardTitle>}
          {acoes}
        </CardHeader>
      )}
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader><TableRow>
            <CabecalhoOrdenavel rotulo={rotuloPrimeira} dir={d("rotulo")} onOrdenar={() => ciclo("rotulo")} />
            {mostrarCategoria && <CabecalhoOrdenavel rotulo="Categoria" dir={d("categoria")} onOrdenar={() => ciclo("categoria")} />}
            {COLUNAS.map((c) => (
              <CabecalhoOrdenavel key={c.campo} rotulo={c.rotulo} dir={d(c.campo)} onOrdenar={() => ciclo(c.campo)} alinharDireita={c.dir} />
            ))}
          </TableRow></TableHeader>
          <TableBody>
            {ordenadas.length === 0 && (
              <TableRow><TableCell colSpan={13} className="py-6 text-center text-muted-foreground">Nada para mostrar.</TableCell></TableRow>
            )}
            {ordenadas.map((l, i) => {
              const t = l.tendencia_30d;
              return (
                <TableRow
                  key={`${l.rotulo}-${i}`}
                  className={cn(onClicar && "cursor-pointer", selecionado && selecionado === l.rotulo && "bg-muted")}
                  onClick={onClicar ? () => onClicar(l) : undefined}
                >
                  <TableCell className="font-medium">{l.rotulo}</TableCell>
                  {mostrarCategoria && <TableCell className="text-muted-foreground">{l.categoria ?? "—"}</TableCell>}
                  <TableCell><SeloStatus s={l.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMeses(l.cobertura_meses)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtX(l.giro_ano)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, (l.sell_through ?? 0) * 100))}%` }} />
                      </div>
                      <span className="text-xs tabular-nums">{fmtPct(l.sell_through)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(l.disponivel)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(l.vendido)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(l.saldo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.venda_mes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", t !== null && t >= 0.05 && "text-success", t !== null && t <= -0.05 && "text-destructive")}>
                    {t === null ? "—" : `${t > 0 ? "+" : ""}${fmtPct(t)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(l.estoque_custo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(l.receita)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- aba ---------- */
export function AbaGiro({ ini, fim }: { ini: string | null; fim: string | null }) {
  const [nav, setNav] = useEstadoTela({ cat: "", col: "", vari: "", busca: "", ordem: "" }, { prefixo: "g" });
  const [ordemVar, setOrdemVar] = useState("");
  const [ordemSku, setOrdemSku] = useState("");

  const totalQ = useGiro(ini, fim, "total");
  const catQ = useGiro(ini, fim, "categoria");
  const colQ = useGiro(ini, fim, "colecao");
  const varQ = useGiro(ini, fim, "variante", !!nav.col);
  const skuQ = useGiro(ini, fim, "sku", !!nav.vari);
  const mensalQ = useGiroMensal(ini, fim, nav.cat || null, nav.col || null, nav.vari || null);

  const t = totalQ.data?.[0];
  const colecoes = useMemo(
    () => (colQ.data ?? []).filter((c) => !nav.cat || c.categoria === nav.cat),
    [colQ.data, nav.cat],
  );
  const colecoesBusca = useMemo(() => {
    const b = nav.busca.trim().toLowerCase();
    return b ? colecoes.filter((c) => (c.colecao ?? "").toLowerCase().includes(b)) : colecoes;
  }, [colecoes, nav.busca]);

  const repor = colecoes.filter((c) => c.status === "Repor").sort((a, b) => (a.cobertura_meses ?? 0) - (b.cobertura_meses ?? 0));
  const forcar = colecoes.filter((c) => c.status === "Parado").sort((a, b) => b.estoque_custo - a.estoque_custo).slice(0, 10);
  const observar = colecoes.filter((c) => c.status === "Lento").sort((a, b) => b.estoque_custo - a.estoque_custo);

  const abrirColecao = (c: LinhaGiro) => {
    const mesma = nav.col === c.colecao;
    setNav({ col: mesma ? "" : c.colecao ?? "", vari: "" });
  };

  const colSel = colQ.data?.find((c) => c.colecao === nav.col);
  const ehVela = (colSel?.categoria ?? "").toLowerCase().startsWith("vela");
  const variantes = (varQ.data ?? []).filter((v) => v.colecao === nav.col);
  const itens = (skuQ.data ?? []).filter((s) => s.colecao === nav.col && s.variante === nav.vari);

  // gráfico de cobertura
  const dadosCob = useMemo(
    () =>
      [...colecoes]
        .sort((a, b) => (a.cobertura_meses ?? Infinity) - (b.cobertura_meses ?? Infinity))
        .map((c) => ({
          ...c,
          nomeCol: c.colecao ?? "—",
          barra: c.cobertura_meses === null ? CORTE : Math.min(CORTE, c.cobertura_meses),
          etiqueta: c.cobertura_meses === null ? "sem venda" : fmtMeses(c.cobertura_meses),
        })),
    [colecoes],
  );

  // gráfico mensal
  const { dadosMes, series } = useMemo(() => {
    const ss = [...new Set((mensalQ.data ?? []).map((r) => r.serie))];
    const porMes = new Map<string, Record<string, number | string>>();
    for (const r of mensalQ.data ?? []) {
      const o = porMes.get(r.mes) ?? { mes: r.mes };
      o[r.serie] = (Number(o[r.serie]) || 0) + r.receita;
      porMes.set(r.mes, o);
    }
    return { dadosMes: [...porMes.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes))), series: ss };
  }, [mensalQ.data]);
  const mesAtual = mesCorrente();
  const rotMes = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}${m === mesAtual ? "*" : ""}`;
  const filtroMensal = nav.vari || nav.col || nav.cat;

  return (
    <div className="mt-4 space-y-6">
      {/* a) KPIs */}
      {totalQ.isLoading ? <Carregando /> : totalQ.error ? <Erro e={totalQ.error} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Kpi rotulo="Faturado" valor={formatBRL(t?.receita ?? 0)} />
          <Kpi rotulo="Vendido (un)" valor={fmtInt(t?.vendido ?? 0)} />
          <Kpi rotulo="Estoque a custo" valor={formatBRL(t?.estoque_custo ?? 0)} />
          <Kpi rotulo="Cobertura (meses)" valor={fmtMeses(t?.cobertura_meses ?? null)} />
          <Kpi rotulo="Giro/ano" valor={fmtX(t?.giro_ano ?? null)} />
          <Kpi rotulo="Sell-through" valor={fmtPct(t?.sell_through ?? null)} />
          <Kpi rotulo="Venda por mês" valor={fmtInt(t?.venda_mes ?? 0)} />
        </div>
      )}

      {/* b) categorias */}
      {catQ.isLoading ? <Carregando /> : catQ.error ? <Erro e={catQ.error} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(catQ.data ?? []).map((c) => {
            const ativo = nav.cat === c.categoria;
            return (
              <Card
                key={c.categoria}
                className={cn("cursor-pointer transition-colors hover:border-primary", ativo && "border-primary ring-1 ring-primary")}
                onClick={() => setNav({ cat: ativo ? "" : c.categoria ?? "", col: "", vari: "" })}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.categoria}</span>
                    <SeloStatus s={c.status} />
                  </div>
                  <div><span className="text-3xl font-semibold tabular-nums">{fmtMeses(c.cobertura_meses)}</span> <span className="text-sm text-muted-foreground">meses</span></div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Faturado</span><span className="text-right tabular-nums">{formatBRL(c.receita)}</span>
                    <span className="text-muted-foreground">Estoque a custo</span><span className="text-right tabular-nums">{formatBRL(c.estoque_custo)}</span>
                    <span className="text-muted-foreground">Disp. / vendido</span><span className="text-right tabular-nums">{fmtInt(c.disponivel)} / {fmtInt(c.vendido)} ({fmtPct(c.sell_through)})</span>
                    <span className="text-muted-foreground">Sobrou</span><span className="text-right tabular-nums">{fmtInt(c.saldo)}</span>
                    <span className="text-muted-foreground">Giro/ano</span><span className="text-right tabular-nums">{fmtX(c.giro_ano)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* c) onde agir */}
      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { t: "Repor", l: repor, extra: (c: LinhaGiro) => `${c.venda_mes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/mês · ${fmtMeses(c.cobertura_meses)} m` },
          { t: "Forçar venda", l: forcar, extra: (c: LinhaGiro) => formatBRL(c.estoque_custo) },
          { t: "Observar", l: observar, extra: (c: LinhaGiro) => formatBRL(c.estoque_custo) },
        ].map((b) => (
          <Card key={b.t}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{b.t} <span className="text-sm font-normal text-muted-foreground">({b.l.length})</span></CardTitle></CardHeader>
            <CardContent className="max-h-72 space-y-1 overflow-y-auto">
              {colQ.isLoading ? <Carregando /> : b.l.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma coleção.</p> : b.l.map((c) => (
                <button key={c.colecao} type="button" onClick={() => abrirColecao(c)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted">
                  <span className="truncate">{c.colecao}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{b.extra(c)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* d) meses de estoque */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Meses de estoque por coleção</CardTitle></CardHeader>
        <CardContent>
          {colQ.isLoading ? <Carregando /> : colQ.error ? <Erro e={colQ.error} /> : (
            <ResponsiveContainer width="100%" height={Math.max(200, dadosCob.length * 22 + 40)}>
              <BarChart data={dadosCob} layout="vertical" margin={{ left: 8, right: 64 }}>
                <ReferenceArea x1={0} x2={6} fill="hsl(var(--success))" fillOpacity={0.06} />
                <ReferenceArea x1={6} x2={12} fill="hsl(var(--info))" fillOpacity={0.06} />
                <ReferenceArea x1={12} x2={24} fill="hsl(var(--warning))" fillOpacity={0.06} />
                <ReferenceArea x1={24} x2={CORTE} fill="hsl(var(--destructive))" fillOpacity={0.06} />
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, CORTE]} ticks={[0, 6, 12, 24, 36, 48, 60]} tickFormatter={(v) => (v === CORTE ? "60+" : String(v))} fontSize={11} />
                <YAxis type="category" dataKey="nomeCol" width={180} fontSize={11} interval={0} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const c = payload[0].payload as (typeof dadosCob)[number];
                    return (
                      <div className="rounded border bg-popover p-2 text-xs text-popover-foreground shadow">
                        <div className="mb-1 font-semibold">{c.nomeCol}</div>
                        <div>Status: {c.status ?? "—"}</div>
                        <div>Cobertura: {c.etiqueta}{c.cobertura_meses !== null ? " meses" : ""}</div>
                        <div>Venda/mês: {c.venda_mes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</div>
                        <div>Sobrou: {fmtInt(c.saldo)}</div>
                        <div>Estoque a custo: {formatBRL(c.estoque_custo)}</div>
                        <div>Sell-through: {fmtPct(c.sell_through)}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="barra" onClick={(d: any) => abrirColecao(d.payload ?? d)} className="cursor-pointer">
                  {dadosCob.map((c) => <Cell key={c.nomeCol} fill={c.status ? STATUS_COR[c.status] : STATUS_COR.Novo} />)}
                  <LabelList dataKey="etiqueta" position="right" fontSize={11} fill="hsl(var(--foreground))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* e) tabela de coleções */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={!nav.cat ? "default" : "outline"} onClick={() => setNav({ cat: "", col: "", vari: "" })}>Todas</Button>
          {(catQ.data ?? []).map((c) => (
            <Button key={c.categoria} size="sm" variant={nav.cat === c.categoria ? "default" : "outline"}
              onClick={() => setNav({ cat: c.categoria ?? "", col: "", vari: "" })}>{c.categoria}</Button>
          ))}
          <div className="relative ml-auto w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 pl-8" placeholder="Buscar coleção" value={nav.busca} onChange={(e) => setNav({ busca: e.target.value })} />
          </div>
        </div>
        {colQ.isLoading ? <Carregando /> : (
          <TabelaGiro titulo="Coleções" linhas={colecoesBusca} rotuloPrimeira="Coleção" rotuloDe={(l) => l.colecao ?? "—"}
            mostrarCategoria selecionado={nav.col || null} onClicar={abrirColecao} ordem={nav.ordem} onOrdem={(o) => setNav({ ordem: o })} />
        )}
      </div>

      {/* f) variantes e itens */}
      {nav.col && (
        varQ.isLoading ? <Carregando /> : varQ.error ? <Erro e={varQ.error} /> : (
          <TabelaGiro titulo={`Variantes de ${nav.col}`} linhas={variantes} rotuloPrimeira="Variante" rotuloDe={(l) => l.variante ?? "—"}
            selecionado={nav.vari || null} onClicar={(l) => setNav({ vari: nav.vari === l.variante ? "" : l.variante ?? "" })}
            ordem={ordemVar} onOrdem={setOrdemVar}
            acoes={<Button size="sm" variant="ghost" onClick={() => setNav({ col: "", vari: "" })}><X className="mr-1 h-4 w-4" />Fechar</Button>} />
        )
      )}
      {nav.col && nav.vari && (
        skuQ.isLoading ? <Carregando /> : skuQ.error ? <Erro e={skuQ.error} /> : (
          <TabelaGiro titulo={`Itens de ${nav.vari}`} linhas={itens} rotuloPrimeira={ehVela ? "Nº" : "Item"}
            rotuloDe={(l) => (ehVela ? l.numero ?? "—" : l.nome ?? l.sku ?? "—")} ordem={ordemSku} onOrdem={setOrdemSku}
            acoes={<Button size="sm" variant="ghost" onClick={() => setNav({ vari: "" })}><X className="mr-1 h-4 w-4" />Fechar</Button>} />
        )
      )}

      {/* g) faturamento por mês */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Faturamento por mês{filtroMensal ? ` — ${filtroMensal}` : ""}</CardTitle>
          {filtroMensal && <Button size="sm" variant="outline" onClick={() => setNav({ cat: "", col: "", vari: "" })}>Ver todas</Button>}
        </CardHeader>
        <CardContent>
          {mensalQ.isLoading ? <Carregando /> : mensalQ.error ? <Erro e={mensalQ.error} /> : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosMes}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tickFormatter={rotMes} fontSize={11} />
                  <YAxis fontSize={11} width={80} tickFormatter={(v) => formatBRL(v).replace(/,\d{2}$/, "")} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} labelFormatter={(m: string) => `${rotMes(m)}${m === mesAtual ? " (mês incompleto)" : ""}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {series.map((s, i) => (
                    <Bar key={s} dataKey={s} stackId="a" fill={PALETA_SERIES[i % PALETA_SERIES.length]}>
                      {dadosMes.map((d) => <Cell key={String(d.mes)} fillOpacity={d.mes === mesAtual ? 0.45 : 1} />)}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-xs text-muted-foreground">* mês corrente, ainda incompleto.</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* h) rodapé */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Como cada número é calculado</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p><b className="text-foreground">Disponível</b> = estoque no início do período + recebimentos de importação no período.</p>
          <p><b className="text-foreground">Vendido</b> = faturamento menos devoluções.</p>
          <p><b className="text-foreground">Sobrou</b> = saldo no fim do período.</p>
          <p><b className="text-foreground">Venda/mês</b> = média dos últimos 60 dias do período (ou do período, mínimo 30 dias).</p>
          <p><b className="text-foreground">Cobertura</b> = sobrou ÷ venda/mês.</p>
          <p><b className="text-foreground">Giro/ano</b> = venda/mês × 12 ÷ sobrou.</p>
          <p><b className="text-foreground">Sell-through</b> = vendido ÷ disponível.</p>
          <p><b className="text-foreground">Status</b>: Repor ≤ 6 meses, Saudável 6–12, Lento 12–24, Parado &gt; 24 ou sem venda, Novo &lt; 30 dias desde a chegada.</p>
        </CardContent>
      </Card>
    </div>
  );
}
