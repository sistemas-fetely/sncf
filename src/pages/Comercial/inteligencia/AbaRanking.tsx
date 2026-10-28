import { useMemo, useState } from "react";
import { useEstadoTela } from "@/lib/navegacao";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { cn } from "@/lib/utils";
import { Download, Loader2, X } from "lucide-react";
import { fmtInt, fmtPct, juntar, lista, useOpcoes, useRanking, type FiltroRanking, type LinhaRanking } from "./icDados";

const NUMEROS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const ehVela = (cat: string) => cat.toLowerCase().startsWith("vela");

function alternar(arr: string[], v: string) {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function dataCurta(d: string | null) {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a.slice(2)}`;
}

function Bloco({ titulo, onLimpar, ativo, children }: { titulo: string; onLimpar: () => void; ativo: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        {ativo && <button type="button" className="text-xs text-primary hover:underline" onClick={onLimpar}>limpar</button>}
      </div>
      {children}
    </div>
  );
}

function exportarCsv(nome: string, linhas: LinhaRanking[], cliente: boolean) {
  const cab = cliente
    ? ["Posição", "Cliente", "CNPJ", "Tipo", "Cidade", "UF", "Faturado", "Kits", "NFs", "Ticket médio", "% do total", "Última compra"]
    : ["Posição", "UF", "Faturado", "Kits", "NFs", "Ticket médio", "% do total", "Última compra"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const num = (v: number) => v.toFixed(2).replace(".", ",");
  const corpo = linhas.map((l) =>
    (cliente
      ? [l.posicao, l.nome, l.tipo_pessoa === "PJ" && l.documento ? formatCNPJ(l.documento) : "", l.tipo_pessoa, l.cidade, l.uf, num(l.faturado), l.unidades, l.nfs, num(l.ticket_medio), num(l.pct_total * 100), l.ultima_compra ?? ""]
      : [l.posicao, l.chave, num(l.faturado), l.unidades, l.nfs, num(l.ticket_medio), num(l.pct_total * 100), l.ultima_compra ?? ""]
    ).map(esc).join(";"),
  );
  const blob = new Blob(["\ufeff" + [cab.map(esc).join(";"), ...corpo].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ListaRanking({
  titulo, q, cliente, selecionado, onClicar, arquivo,
}: {
  titulo: string;
  q: ReturnType<typeof useRanking>;
  cliente: boolean;
  selecionado?: string;
  onClicar?: (l: LinhaRanking) => void;
  arquivo: string;
}) {
  const [todos, setTodos] = useState(false);
  const linhas = q.data ?? [];
  const max = Math.max(1, ...linhas.map((l) => l.faturado));
  const vis = todos ? linhas : linhas.slice(0, 15);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <Button size="sm" variant="outline" disabled={!linhas.length} onClick={() => exportarCsv(arquivo, linhas, cliente)}>
          <Download className="mr-1 h-4 w-4" />CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {q.isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : q.error ? (
          <p className="text-sm text-destructive">Erro: {(q.error as Error).message}</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda nesta seleção.</p>
        ) : (
          vis.map((l) => (
            <button
              key={l.chave}
              type="button"
              disabled={!onClicar}
              onClick={() => onClicar?.(l)}
              className={cn("relative block w-full overflow-hidden rounded px-2 py-1.5 text-left", onClicar && "hover:bg-muted", selecionado === l.chave && "bg-muted ring-1 ring-primary")}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(l.faturado / max) * 100}%` }} />
              <div className="relative flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{l.posicao}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {cliente ? l.nome ?? "—" : l.chave}
                    {cliente && l.tipo_pessoa === "PJ" && l.documento && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatCNPJ(l.documento)}</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {cliente && <>{l.tipo_pessoa === "PJ" ? "Lojista" : "Consumidor"} · {[l.cidade, l.uf].filter(Boolean).join("/") || "—"} · </>}
                    {fmtInt(l.nfs)} NFs · última {dataCurta(l.ultima_compra)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm tabular-nums">{formatBRL(l.faturado)}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{fmtPct(l.pct_total, 1)}</div>
                </div>
              </div>
            </button>
          ))
        )}
        {linhas.length > 15 && (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => setTodos(!todos)}>
            {todos ? "Ver só os 15 primeiros" : `Ver todos (${linhas.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function AbaRanking({ ini, fim }: { ini: string | null; fim: string | null }) {
  const [nav, setNav] = useEstadoTela({ cats: "", cols: "", mods: "", nums: "", tipo: "", cli: "" }, { prefixo: "r" });
  const opQ = useOpcoes();
  const op = opQ.data ?? [];
  const cats = lista(nav.cats), cols = lista(nav.cols), mods = lista(nav.mods), nums = lista(nav.nums);

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    op.forEach((o) => m.set(o.categoria, o.categoria_ordem));
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  }, [op]);

  const colecoesPorCat = useMemo(() => {
    const m = new Map<string, Set<string>>();
    op.filter((o) => cats.length === 0 || cats.includes(o.categoria)).forEach((o) => {
      if (!m.has(o.categoria)) m.set(o.categoria, new Set());
      m.get(o.categoria)!.add(o.colecao);
    });
    return categorias.filter((c) => m.has(c)).map((c) => ({ cat: c, cols: [...m.get(c)!].sort((a, b) => a.localeCompare(b, "pt-BR")) }));
  }, [op, nav.cats, categorias]); // eslint-disable-line react-hooks/exhaustive-deps

  const modelos = useMemo(
    () => [...new Set(op.filter((o) => cols.includes(o.colecao) && o.variante).map((o) => o.variante as string))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [op, nav.cols], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const temVela = op.some((o) => cols.includes(o.colecao) && ehVela(o.categoria));

  const skus = useMemo(() => {
    if (mods.length === 0 && nums.length === 0) return null;
    return [...new Set(
      op.filter((o) =>
        (cols.length === 0 || cols.includes(o.colecao)) &&
        (mods.length === 0 || (o.variante !== null && mods.includes(o.variante))) &&
        (nums.length === 0 || (o.numero !== null && nums.includes(o.numero))),
      ).map((o) => o.sku),
    )];
  }, [op, nav.cols, nav.mods, nav.nums]); // eslint-disable-line react-hooks/exhaustive-deps

  const base: Omit<FiltroRanking, "dimensao" | "documento"> = skus
    ? { categorias: null, colecoes: null, skus: skus.length ? skus : ["__nenhum__"], tipo: nav.tipo || null }
    : { categorias: cats.length ? cats : null, colecoes: cols.length ? cols : null, skus: null, tipo: nav.tipo || null };

  const cliQ = useRanking(ini, fim, { ...base, dimensao: "cliente", documento: null }, opQ.isSuccess);
  const ufQ = useRanking(ini, fim, { ...base, dimensao: "uf", documento: null }, opQ.isSuccess);
  const comprasQ = useRanking(ini, fim, { ...base, dimensao: "colecao", documento: nav.cli || null }, opQ.isSuccess && !!nav.cli);

  const clientes = cliQ.data ?? [];
  const totalFat = clientes.reduce((s, l) => s + l.faturado, 0);
  const totalKits = clientes.reduce((s, l) => s + l.unidades, 0);
  const lojistas = clientes.filter((l) => l.tipo_pessoa === "PJ").length;
  const top5 = clientes.slice(0, 5).reduce((s, l) => s + l.pct_total, 0);
  const clienteSel = clientes.find((c) => c.chave === nav.cli);

  const mudarCats = (v: string[]) => {
    const novasCols = cols.filter((c) => op.some((o) => o.colecao === c && (v.length === 0 || v.includes(o.categoria))));
    setNav({ cats: juntar(v), cols: juntar(novasCols), mods: "", nums: "" });
  };
  const mudarCols = (v: string[]) => setNav({ cols: juntar(v), mods: "", nums: "" });

  return (
    <div className="mt-4 space-y-6">
      {/* a) filtros */}
      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-4">
          {opQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando filtros…</div>
          ) : opQ.error ? (
            <p className="text-sm text-destructive">Erro: {(opQ.error as Error).message}</p>
          ) : (
            <>
              <div className="space-y-4">
                <Bloco titulo="Categoria" ativo={cats.length > 0} onLimpar={() => mudarCats([])}>
                  <div className="flex flex-wrap gap-1">
                    {categorias.map((c) => (
                      <Button key={c} size="sm" variant={cats.includes(c) ? "default" : "outline"} onClick={() => mudarCats(alternar(cats, c))}>{c}</Button>
                    ))}
                  </div>
                </Bloco>
                <Bloco titulo="Tipo de cliente" ativo={!!nav.tipo} onLimpar={() => setNav({ tipo: "" })}>
                  <div className="flex flex-wrap gap-1">
                    {[["", "Todos"], ["PJ", "Lojistas (PJ)"], ["PF", "Consumidor final (PF)"]].map(([v, r]) => (
                      <Button key={v} size="sm" variant={nav.tipo === v ? "default" : "outline"} onClick={() => setNav({ tipo: v, cli: "" })}>{r}</Button>
                    ))}
                  </div>
                </Bloco>
              </div>
              <Bloco titulo="Coleção" ativo={cols.length > 0} onLimpar={() => mudarCols([])}>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded border p-2">
                  {colecoesPorCat.map((g) => (
                    <div key={g.cat}>
                      <div className="text-xs font-semibold text-muted-foreground">{g.cat}</div>
                      {g.cols.map((c) => (
                        <label key={c} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                          <Checkbox checked={cols.includes(c)} onCheckedChange={() => mudarCols(alternar(cols, c))} />{c}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </Bloco>
              <Bloco titulo="Modelo" ativo={mods.length > 0} onLimpar={() => setNav({ mods: "" })}>
                <div className="max-h-56 overflow-y-auto rounded border p-2">
                  {cols.length === 0 ? <p className="text-sm text-muted-foreground">Escolha uma coleção</p>
                    : modelos.length === 0 ? <p className="text-sm text-muted-foreground">Sem modelos</p>
                    : modelos.map((m) => (
                      <label key={m} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                        <Checkbox checked={mods.includes(m)} onCheckedChange={() => setNav({ mods: juntar(alternar(mods, m)) })} />{m}
                      </label>
                    ))}
                </div>
              </Bloco>
              {temVela && (
                <Bloco titulo="Número" ativo={nums.length > 0} onLimpar={() => setNav({ nums: "" })}>
                  <div className="flex flex-wrap gap-1">
                    {NUMEROS.map((x) => (
                      <Button key={x} size="sm" className="w-10" variant={nums.includes(x) ? "default" : "outline"} onClick={() => setNav({ nums: juntar(alternar(nums, x)) })}>Nº {x}</Button>
                    ))}
                  </div>
                </Bloco>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* b) KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Faturado", formatBRL(totalFat)],
          ["Kits", fmtInt(totalKits)],
          ["Clientes", `${fmtInt(clientes.length)} (${fmtInt(lojistas)} lojistas)`],
          ["Estados", fmtInt((ufQ.data ?? []).length)],
          ["% dos 5 maiores", fmtPct(top5, 1)],
        ].map(([r, v]) => (
          <Card key={r}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{r}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{cliQ.isLoading ? "…" : v}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* c) listas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ListaRanking titulo="Top clientes" q={cliQ} cliente selecionado={nav.cli}
          onClicar={(l) => setNav({ cli: nav.cli === l.chave ? "" : l.chave })} arquivo="top_clientes.csv" />
        <ListaRanking titulo="Top estados" q={ufQ} cliente={false} arquivo="top_estados.csv" />
      </div>

      {/* d) compras do cliente */}
      {nav.cli && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Compras de {clienteSel?.nome ?? "cliente"}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setNav({ cli: "" })}><X className="mr-1 h-4 w-4" />Fechar</Button>
          </CardHeader>
          <CardContent className="p-0">
            {comprasQ.isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
            ) : comprasQ.error ? (
              <p className="p-4 text-sm text-destructive">Erro: {(comprasQ.error as Error).message}</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Coleção</TableHead>
                  <TableHead className="text-right">Faturado</TableHead>
                  <TableHead className="text-right">Kits</TableHead>
                  <TableHead className="text-right">NFs</TableHead>
                  <TableHead className="text-right">% do cliente</TableHead>
                  <TableHead className="text-right">Última compra</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(comprasQ.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma compra nesta seleção.</TableCell></TableRow>
                  )}
                  {(comprasQ.data ?? []).map((l) => (
                    <TableRow key={l.chave}>
                      <TableCell className="font-medium">{l.nome ?? l.chave}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(l.faturado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(l.unidades)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(l.nfs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(l.pct_total, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.ultima_compra ? formatDateBR(l.ultima_compra) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
