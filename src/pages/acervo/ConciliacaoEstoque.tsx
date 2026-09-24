import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight,
  Download, RefreshCw, Search, Warehouse,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { fmtData } from "@/lib/data";
import { temValor } from "@/components/acervo/DeParaConciliacao";

/**
 * CONCILIAÇÃO DE ESTOQUE (24/09/2026) — irmã da Conciliação de Cadastro,
 * mesma cara e mesma mecânica, mas a fila é de ESTOQUE por centro.
 *
 * Uma linha = um produto × um centro × uma regra de divergência de estoque.
 * Primeira versão: só leitura, filtro e exportação — nada de seleção nem
 * ações de escrita. Nada de lista de regra ou centro escrita no código:
 * tudo vem de `vw_conciliacao_estoque_fila` e `divergencia_sistema_dim`.
 */
type FilaLinha = {
  linha_id: string;
  cod_cadastro: string | null; sku: string; nome_comercial: string | null;
  colecao: string | null; fase: string | null; centro: string | null;
  regra: string; regra_nome: string | null; onde_resolver: string | null;
  consequencia: string | null; o_que_fazer: string | null;
  campo_matriz: string | null; campo_destino: string | null;
  valor_sncf: string | null; valor_destino: string | null; detalhe: string | null;
};

type Grupo = "regra" | "centro" | "onde";
const PARAMS: Grupo[] = ["regra", "centro", "onde"];

type ColDef = { key: keyof FilaLinha | "onde" | "sncf" | "destino"; rotulo: string; ordenavel?: boolean };
const COLUNAS: ColDef[] = [
  { key: "cod_cadastro", rotulo: "Cód. cadastro", ordenavel: true },
  { key: "sku", rotulo: "SKU", ordenavel: true },
  { key: "nome_comercial", rotulo: "Nome", ordenavel: true },
  { key: "centro", rotulo: "Centro", ordenavel: true },
  { key: "regra", rotulo: "Regra", ordenavel: true },
  { key: "sncf", rotulo: "SNCF", ordenavel: true },
  { key: "destino", rotulo: "Destino", ordenavel: true },
  { key: "detalhe", rotulo: "Detalhe" },
  { key: "onde", rotulo: "Onde resolver", ordenavel: true },
  { key: "o_que_fazer", rotulo: "O que fazer" },
];

/** Valor usado na ordenação — vazio sempre vai para o fim, nos dois sentidos. */
function chaveOrdem(l: FilaLinha, coluna: string): string | number | null {
  if (coluna === "sncf") return l.valor_sncf;
  if (coluna === "destino") return l.valor_destino;
  if (coluna === "onde") return l.onde_resolver;
  if (coluna === "regra") return l.regra_nome ?? l.regra;
  return (l as unknown as Record<string, string | number | null>)[coluna] ?? null;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** cod_cadastro sai como texto no Excel (="01000") para não perder o zero à esquerda. */
function csvCod(v: string | null): string {
  if (!temValor(v)) return "";
  return `="${String(v).replace(/"/g, '""')}"`;
}

function FiltroFacetado({ label, opcoes, selecionados, onChange }: { label: string; opcoes: { valor: string; rotulo: string; contagem: number }[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  const visiveis = opcoes.filter(o => o.contagem > 0 || selecionados.includes(o.valor));
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{visiveis.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nada neste recorte</p> : visiveis.map(o => <Button key={o.valor} variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal" onClick={() => onChange(selecionados.includes(o.valor) ? selecionados.filter(v => v !== o.valor) : [...selecionados, o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border", selecionados.includes(o.valor) && "border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor) && <Check className="h-3 w-3" />}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>{selecionados.length > 0 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

export default function ConciliacaoEstoque() {
  const [sp, setSp] = useSearchParams();
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ coluna: string; dir: "asc" | "desc" }>({ coluna: "regra", dir: "asc" });

  // FILTRO-MORA-NA-URL: o resto do sistema linka já filtrado.
  const lista = (k: Grupo) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const busca = sp.get("q") ?? "";
  function setLista(k: Grupo, vs: string[]) {
    const novo = new URLSearchParams(sp);
    if (vs.length) novo.set(k, vs.join(",")); else novo.delete(k);
    setSp(novo, { replace: true });
  }
  function setBusca(v: string) {
    const novo = new URLSearchParams(sp);
    if (v) novo.set("q", v); else novo.delete("q");
    setSp(novo, { replace: true });
  }
  function limpar() { setSp(new URLSearchParams(), { replace: true }); }

  // POSTGREST-CORTA-EM-MIL: lê em páginas de 1.000 com ordem única e estável
  // (linha_id) até a página vir incompleta — mesmo padrão da Conciliação de Cadastro.
  const fila = useQuery({
    queryKey: ["conciliacao-estoque-fila"],
    queryFn: async () => {
      const PAGINA = 1000;
      const todas: FilaLinha[] = [];
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from("vw_conciliacao_estoque_fila" as never)
          .select("*")
          .order("linha_id")
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        const pagina = (data ?? []) as FilaLinha[];
        todas.push(...pagina);
        if (pagina.length < PAGINA) break;
      }
      return todas;
    },
  });
  // Cor do "onde resolver" vem de `divergencia_sistema_dim`, igual à Conciliação de Cadastro.
  const sistemasDim = useQuery({
    queryKey: ["divergencia-sistema-dim"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divergencia_sistema_dim" as never)
        .select("slug, nome, ordem, cor")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as { slug: string; nome: string; ordem: number | null; cor: string | null }[];
    },
  });

  const carregando = fila.isLoading || sistemasDim.isLoading;
  const erro = fila.error;
  const atualizando = fila.isFetching;

  const linhas = useMemo(() => fila.data ?? [], [fila.data]);

  const aplica = (l: FilaLinha, ignorar?: Grupo) => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (q && ![l.cod_cadastro, l.sku, l.nome_comercial].filter(temValor).some(v => String(v).toLocaleLowerCase("pt-BR").includes(q))) return false;
    for (const g of PARAMS) {
      if (g === ignorar) continue;
      const sel = lista(g);
      if (!sel.length) continue;
      const v = g === "regra" ? l.regra : g === "centro" ? l.centro : l.onde_resolver;
      if (!sel.includes(String(v ?? "__sem__"))) return false;
    }
    return true;
  };

  const recorte = useMemo(() => {
    const base = linhas.filter(l => aplica(l));
    const mult = ordem.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = chaveOrdem(a, ordem.coluna), vb = chaveOrdem(b, ordem.coluna);
      const vazioA = va === null || va === undefined || String(va).trim() === "";
      const vazioB = vb === null || vb === undefined || String(vb).trim() === "";
      if (vazioA && vazioB) return 0;
      if (vazioA) return 1;
      if (vazioB) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      if (cmp !== 0) return cmp * mult;
      return String(a.cod_cadastro ?? "").localeCompare(String(b.cod_cadastro ?? ""), "pt-BR", { numeric: true });
    });
  // aplica depende dos parâmetros da URL, que entram na dependência via `sp`
  }, [linhas, ordem, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPagina(1); setExpandido(null); }, [sp, tamanho]);

  const corPorSistema = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of sistemasDim.data ?? []) if (d.cor) m.set(d.slug, d.cor);
    return m;
  }, [sistemasDim.data]);

  // UM CARD POR CENTRO: valores distintos de `centro` presentes, ordem alfabética.
  // Clicar filtra o centro. Tooltip quebra por regra, igual aos cards da irmã.
  const cards = useMemo(() => {
    const base = linhas.filter(l => aplica(l, "centro"));
    const centros = [...new Set(linhas.map(l => l.centro ?? "__sem__"))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    return centros.map(centro => {
      const ls = base.filter(l => (l.centro ?? "__sem__") === centro);
      const porRegra = new Map<string, { nome: string; n: number }>();
      for (const l of ls) {
        const atual = porRegra.get(l.regra);
        porRegra.set(l.regra, { nome: l.regra_nome ?? l.regra, n: (atual?.n ?? 0) + 1 });
      }
      const quebra = [...porRegra.values()].sort((a, b) => b.n - a.n).map(x => `${x.n} ${x.nome.toLocaleLowerCase("pt-BR")}`).join(" · ");
      return { centro, label: centro === "__sem__" ? "Sem centro" : centro, n: ls.length, quebra };
    });
  // aplica depende dos parâmetros da URL
  }, [linhas, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const facet = (g: Grupo, ops: { valor: string; rotulo: string }[], chave: (l: FilaLinha) => string) =>
    ops.map(o => ({ ...o, contagem: linhas.filter(l => aplica(l, g) && chave(l) === o.valor).length }));

  const opcoesRegra = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (!m.has(l.regra)) m.set(l.regra, l.regra_nome ?? l.regra);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [linhas]);
  const opcoesCentro = useMemo(() => [...new Set(linhas.map(l => l.centro ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem centro" : v })), [linhas]);
  const opcoesOnde = useMemo(() => [...new Set(linhas.map(l => l.onde_resolver ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem destino" : v })), [linhas]);

  const filtrosAtivos = (busca ? 1 : 0) + PARAMS.reduce((n, g) => n + lista(g).length, 0);
  const paginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, paginas);
  const paginaLinhas = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  const produtos = new Set(recorte.map(l => l.sku)).size;
  const estado = carregando ? "Carregando divergências…" : `${recorte.length} divergência(s) · ${produtos} produto(s)`;

  function ordenar(key: string) {
    setOrdem(o => o.coluna === key ? { coluna: key, dir: o.dir === "asc" ? "desc" : "asc" } : { coluna: key, dir: "asc" });
  }

  function exportar() {
    const cab = ["Cód. cadastro", "SKU", "Nome", "Coleção", "Fase", "Centro", "Regra", "Campo SNCF", "Valor SNCF", "Campo destino", "Valor destino", "Detalhe", "Onde resolver", "Consequência", "O que fazer"];
    const corpo = recorte.map(l => [
      csvCod(l.cod_cadastro), csvCelula(l.sku), csvCelula(l.nome_comercial), csvCelula(l.colecao), csvCelula(l.fase), csvCelula(l.centro),
      csvCelula(l.regra_nome ?? l.regra), csvCelula(l.campo_matriz), csvCelula(l.valor_sncf),
      csvCelula(l.campo_destino), csvCelula(l.valor_destino), csvCelula(l.detalhe),
      csvCelula(l.onde_resolver), csvCelula(l.consequencia), csvCelula(l.o_que_fazer),
    ].join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + cab.map(csvCelula).join(";") + "\n" + corpo], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacao-estoque-${fmtData(new Date(), "").split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const celulaVazia = <span className="text-muted-foreground">—</span>;

  function celula(l: FilaLinha, c: ColDef) {
    if (c.key === "cod_cadastro") return l.cod_cadastro
      ? <Link to={`/vendas/produto/ficha/${encodeURIComponent(l.cod_cadastro)}`} className="font-medium hover:underline">{l.cod_cadastro}</Link>
      : celulaVazia;
    if (c.key === "sku") return <span>{l.sku}</span>;
    if (c.key === "nome_comercial") return <span className="block max-w-56 truncate">{l.nome_comercial ?? "—"}</span>;
    if (c.key === "centro") return <span className="whitespace-nowrap">{l.centro ?? "—"}</span>;
    if (c.key === "regra") return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="whitespace-nowrap font-normal">{l.regra_nome ?? l.regra}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{l.consequencia ?? (l.regra_nome ?? l.regra)}</TooltipContent></Tooltip>;
    if (c.key === "sncf" || c.key === "destino") {
      const campo = c.key === "sncf" ? l.campo_matriz : l.campo_destino;
      const valor = c.key === "sncf" ? l.valor_sncf : l.valor_destino;
      if (!temValor(campo) && !temValor(valor)) return celulaVazia;
      return <span className="block max-w-48"><span className="block truncate">{temValor(valor) ? String(valor) : "—"}</span>{temValor(campo) && <span className="block truncate text-[10px] text-muted-foreground">{campo}</span>}</span>;
    }
    if (c.key === "detalhe") {
      if (!temValor(l.detalhe)) return celulaVazia;
      return <Tooltip><TooltipTrigger asChild><span className="block max-w-56 truncate text-left">{l.detalhe}</span></TooltipTrigger><TooltipContent className="max-w-sm">{l.detalhe}</TooltipContent></Tooltip>;
    }
    if (c.key === "onde") {
      const cor = corPorSistema.get(l.onde_resolver ?? "");
      return <span className="whitespace-nowrap" style={cor ? { color: cor } : undefined}>{l.onde_resolver ?? "—"}</span>;
    }
    if (!temValor(l.o_que_fazer)) return celulaVazia;
    return <Tooltip><TooltipTrigger asChild><span className="block max-w-64 truncate text-left">{l.o_que_fazer}</span></TooltipTrigger><TooltipContent className="max-w-sm">{l.o_que_fazer}</TooltipContent></Tooltip>;
  }

  return <TooltipProvider delayDuration={200}><PageShell>
    <PageHeader
      titulo="Conciliação de Estoque"
      icone={Warehouse}
      estado={estado}
      acoes={<>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!recorte.length}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        <Button size="sm" disabled={atualizando} onClick={async () => { await fila.refetch(); }}><RefreshCw className={cn("mr-2 h-4 w-4", atualizando && "animate-spin")} />Atualizar</Button>
      </>}
    />

    {erro && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar a fila de conciliação de estoque. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}

    <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicadores por centro">
      {carregando ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />) : cards.map(c => {
        const selecionado = lista("centro").includes(c.centro);
        const zera = c.n === 0;
        const botao = <Button
          variant="outline"
          disabled={zera}
          className={cn("h-20 items-start justify-center border border-l-4 p-3 text-left", zera && "opacity-50", selecionado && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
          onClick={() => setLista("centro", selecionado ? [] : [c.centro])}
        >
          <span className="flex w-full flex-col">
            <span className="truncate text-[11px] font-normal">{c.label}</span>
            <span className="mt-1 text-[21px] font-medium tabular-nums text-foreground">{c.n}</span>
          </span>
        </Button>;
        return <Tooltip key={c.centro}><TooltipTrigger asChild>{botao}</TooltipTrigger><TooltipContent className="max-w-xs">{c.quebra || "Nenhuma divergência neste recorte."}</TooltipContent></Tooltip>;
      })}
    </section>

    <section className="flex flex-wrap items-center gap-2 border-y py-3">
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU ou nome" />
      </div>
      <FiltroFacetado label="Regra" selecionados={lista("regra")} onChange={v => setLista("regra", v)} opcoes={facet("regra", opcoesRegra, l => l.regra)} />
      <FiltroFacetado label="Centro" selecionados={lista("centro")} onChange={v => setLista("centro", v)} opcoes={facet("centro", opcoesCentro, l => l.centro ?? "__sem__")} />
      <FiltroFacetado label="Onde resolver" selecionados={lista("onde")} onChange={v => setLista("onde", v)} opcoes={facet("onde", opcoesOnde, l => l.onde_resolver ?? "__sem__")} />
      {filtrosAtivos > 0 && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}
    </section>

    {carregando ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
    : recorte.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhuma divergência neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>
    : <div className="overflow-hidden rounded-md border bg-card">
      <Table className="text-xs" containerClassName="max-h-[min(62vh,46rem)]">
        <TableHeader><TableRow>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted" />
          {COLUNAS.map(c => <TableHead key={String(c.key)} className="sticky top-0 z-40 whitespace-nowrap bg-muted font-medium" aria-sort={ordem.coluna === c.key ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
            {c.ordenavel ? <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => ordenar(String(c.key))}>{c.rotulo}{ordem.coluna !== c.key ? <ArrowUpDown className="ml-1 h-3 w-3" /> : ordem.dir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />}</Button> : c.rotulo}
          </TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{paginaLinhas.map(l => <Fragment key={l.linha_id}>
          <TableRow className="border-b">
            <TableCell className="py-2.5 align-top">
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido === l.linha_id ? `Recolher ${l.sku}` : `Expandir ${l.sku}`} onClick={() => setExpandido(e => e === l.linha_id ? null : l.linha_id)}>
                {expandido === l.linha_id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </TableCell>
            {COLUNAS.map(c => <TableCell key={String(c.key)} className="py-2.5 align-top">{celula(l, c)}</TableCell>)}
          </TableRow>
          {expandido === l.linha_id && <TableRow><TableCell colSpan={COLUNAS.length + 1} className="bg-muted/30 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{l.regra_nome ?? l.regra}</p>
              {temValor(l.consequencia) && <p className="text-xs text-foreground">{l.consequencia}</p>}
              {temValor(l.o_que_fazer) && <p className="text-xs text-muted-foreground">{l.o_que_fazer}</p>}
            </div>
          </TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table>
      <RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="conciliacao_estoque" onPagina={setPagina} onTamanhoPagina={setTamanho} />
    </div>}
  </PageShell></TooltipProvider>;
}
