import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, Download, RefreshCw, Search, Warehouse } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { temValor } from "@/components/acervo/DeParaConciliacao";
import { formatError } from "@/lib/format-error";
import { NotasSemBaixaDialog, useNotasSemBaixa, FileWarning } from "@/components/acervo/NotasSemBaixaDialog";
import { AjustarPeloArmazemDialog } from "@/components/estoque/AjustarPeloArmazemDialog";

function BotaoNotasSemBaixa() {
  const notas = useNotasSemBaixa();
  const [aberto, setAberto] = useState(false);
  const n = notas.data?.length ?? 0;
  const titulo = notas.error ? `Erro ao carregar notas: ${(notas.error as Error).message}` : n === 0 && !notas.isLoading ? "Nenhuma nota com baixa pendente" : undefined;
  return <>
    <span title={titulo}>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} disabled={n === 0 && !notas.error} className={notas.error ? "text-destructive" : undefined}>
        <FileWarning className="mr-2 h-4 w-4" />Notas sem baixa ({notas.isLoading ? "…" : notas.error ? "erro" : n})
      </Button>
    </span>
    <NotasSemBaixaDialog open={aberto} onOpenChange={setAberto} />
  </>;
}

/**
 * CONCILIAÇÃO DE ESTOQUE — TRÍADE (29/09/2026).
 *
 * Uma validação só: Fiscal (notas e movimentos) × Real (armazém ou contagem)
 * × Virtual (à venda nos canais), por produto no TOTAL (`vw_estoque_triade_produto`)
 * e aberta por centro na linha expandida (`vw_estoque_triade_centro`).
 * As regras de divergência deixaram de ser a lista: viram a CAUSA dentro da
 * linha do produto/centro. A coluna Correção segue `correcao` da view:
 * notas sem baixa → diálogo de notas; ajustar_armazem → seleção (super_admin)
 * para `fn_estoque_ajustar_pelo_armazem`; contagem → Chegada de Mercadoria;
 * canais → aguarda o envio periódico. Nada de centro/regra escrito no código.
 */
type Causa = { regra: string; nome: string | null; detalhe: string | null; o_que_fazer: string | null };
type Produto = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; colecao: string | null; fase: string | null;
  fiscal: number | null; real: number | null; real_completo: boolean | null; virtual: number | null; reservado: number | null;
  delta_real_fiscal: number | null; delta_virtual_real: number | null; centros: number | null; nf_pendente?: number | null;
  centros_com_diferenca: number | null; centros_diferenca: string[] | null; causas_produto: Causa[] | null; com_diferenca: boolean | null;
};
type Centro = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; colecao: string | null; fase: string | null;
  centro: string; centro_nome: string | null; centro_ordem: number | null; centro_vende: boolean | null;
  fonte_real: "armazem" | "contagem" | "sem_contagem" | null; real_em: string | null;
  fiscal: number | null; real: number | null; virtual: number | null; reservado: number | null; fiscal_bloqueado: number | null;
  delta_real_fiscal: number | null; delta_virtual_real: number | null; shopify_diff: number | null; bling_diff: number | null;
  causas: Causa[] | null; tem_baixa_pendente: boolean | null; contagem_vencida: boolean | null;
  correcao: "notas_sem_baixa" | "ajustar_armazem" | "contagem" | "canais" | null; com_diferenca: boolean | null;
  nf_pendente: number | null; nf_pendente_detalhe: string | null; vendas_dia: number | null; risco_ruptura: boolean | null;
};

type Cartao = "diferenca" | "furo" | "ruptura" | "perdida" | "semreal" | "canais" | "nfpend";
const n0 = (v: number | null | undefined) => Number(v ?? 0);
const sinalNf = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR");
const somaNf = (ls: Centro[]) => ls.some(c => c.nf_pendente !== null && c.nf_pendente !== undefined) ? ls.reduce((t, c) => t + n0(c.nf_pendente), 0) : null;
const sinal = (v: number | null | undefined) => { const x = n0(v); return x > 0 ? `+${x}` : String(x); };

async function lerTudo<T>(view: string, ordem: string[]): Promise<T[]> {
  const PAGINA = 1000; const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from(view).select("*");
    for (const o of ordem) q = q.order(o);
    const { data, error } = await q.range(de, de + PAGINA - 1);
    if (error) throw error;
    const p = (data ?? []) as T[]; todas.push(...p);
    if (p.length < PAGINA) break;
  }
  return todas;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvCod(v: string | null): string { return temValor(v) ? `="${String(v).replace(/"/g, '""')}"` : ""; }

function fmtDataHora(iso: string | null, comHora: boolean) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return comHora ? `${dd} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : dd;
}
function fonteReal(c: Centro) {
  if (c.fonte_real === "armazem") return `Armazém (API XPM) em ${fmtDataHora(c.real_em, true)}`;
  if (c.fonte_real === "contagem") return `Contagem de ${fmtDataHora(c.real_em, false)}`;
  return "Nunca contado";
}

function DeltaRF({ v }: { v: number | null }) {
  const x = n0(v);
  return <span className={cn("tabular-nums font-medium", x === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{sinal(x)}</span>;
}
function DeltaVR({ v, risco }: { v: number | null; risco: boolean }) {
  const x = n0(v);
  if (x === 0) return <span className="tabular-nums text-muted-foreground">0</span>;
  if (x > 0 && !risco) return <Tooltip><TooltipTrigger asChild><span className="tabular-nums font-medium text-amber-600 dark:text-amber-400">{sinal(x)} excesso pequeno</span></TooltipTrigger>
    <TooltipContent className="max-w-xs">O canal oferece mais do que existe livre, mas o estoque cobre o ritmo de venda.</TooltipContent></Tooltip>;
  return <Tooltip><TooltipTrigger asChild><span className={cn("tabular-nums font-medium", x > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>{sinal(x)} {x > 0 ? "ruptura" : "venda perdida"}</span></TooltipTrigger>
    <TooltipContent className="max-w-xs">{x > 0 ? "Ruptura: o canal oferece mais do que existe livre no real." : "Venda perdida: existe estoque livre que o canal não está oferecendo."}</TooltipContent></Tooltip>;
}

function FiltroMulti({ label, opcoes, selecionados, onChange }: { label: string; opcoes: { valor: string; rotulo: string; contagem: number }[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{opcoes.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nada</p> : opcoes.map(o => <Button key={o.valor} variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal" onClick={() => onChange(selecionados.includes(o.valor) ? selecionados.filter(v => v !== o.valor) : [...selecionados, o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border", selecionados.includes(o.valor) && "border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor) && <Check className="h-3 w-3" />}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>
      {selecionados.length > 0 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

export default function ConciliacaoEstoque() {
  const [sp, setSp] = useSearchParams();
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ coluna: "fiscal" | "real" | "delta"; dir: "asc" | "desc" }>({ coluna: "delta", dir: "desc" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [notasAberto, setNotasAberto] = useState(false);
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");

  // FILTRO-MORA-NA-URL
  const lista = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const busca = sp.get("q") ?? "";
  const soDiferenca = sp.get("todos") !== "1";
  const cartao = (sp.get("cartao") ?? "") as Cartao | "";
  const centroCartao = sp.get("centro_card") ?? "";
  const filCentros = lista("centro"); const filColecoes = lista("colecao");
  function setParam(k: string, v: string | null) {
    const novo = new URLSearchParams(sp);
    if (v) novo.set(k, v); else novo.delete(k);
    setSp(novo, { replace: true }); setPagina(1);
  }
  function limpar() { setSp(new URLSearchParams(), { replace: true }); setPagina(1); }

  // POSTGREST-CORTA-EM-MIL
  const produtosQ = useQuery({ queryKey: ["estoque-triade-produto"], queryFn: () => lerTudo<Produto>("vw_estoque_triade_produto", ["sku"]) });
  const centrosQ = useQuery({ queryKey: ["estoque-triade-centro"], queryFn: () => lerTudo<Centro>("vw_estoque_triade_centro", ["sku", "centro"]) });
  const carregando = produtosQ.isLoading || centrosQ.isLoading;
  const erro = produtosQ.error ?? centrosQ.error;
  const atualizando = produtosQ.isFetching || centrosQ.isFetching;

  const produtos = useMemo(() => produtosQ.data ?? [], [produtosQ.data]);
  const porSku = useMemo(() => {
    const m = new Map<string, Centro[]>();
    for (const c of centrosQ.data ?? []) { const a = m.get(c.sku) ?? []; a.push(c); m.set(c.sku, a); }
    for (const a of m.values()) a.sort((x, y) => n0(x.centro_ordem) - n0(y.centro_ordem));
    return m;
  }, [centrosQ.data]);
  const cs = (sku: string) => porSku.get(sku) ?? [];

  // ESCOPO DE CENTRO: cartão da fileira ou filtro "Centro"; vazio = todos.
  const escopo = useMemo(() => centroCartao ? [centroCartao] : filCentros,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centroCartao, sp]);
  const temEscopo = escopo.length > 0;
  const linhasEscopo = (sku: string) => temEscopo ? cs(sku).filter(c => escopo.includes(c.centro)) : cs(sku);

  // Linha exibida: números do escopo (ou do total quando vazio).
  const exibidos = useMemo<Produto[]>(() => {
    if (!temEscopo) return produtos.map(p => ({ ...p, nf_pendente: somaNf(cs(p.sku)) }));
    return produtos.map(p => {
      const ls = linhasEscopo(p.sku);
      const comV = ls.filter(c => c.virtual !== null);
      const comDvr = ls.filter(c => c.delta_virtual_real !== null);
      const dif = ls.filter(c => c.com_diferenca);
      return {
        ...p,
        fiscal: ls.reduce((s, c) => s + n0(c.fiscal), 0),
        real: ls.reduce((s, c) => s + n0(c.real), 0),
        real_completo: ls.every(c => c.real !== null),
        virtual: comV.length ? comV.reduce((s, c) => s + n0(c.virtual), 0) : null,
        delta_real_fiscal: ls.reduce((s, c) => s + n0(c.delta_real_fiscal), 0),
        delta_virtual_real: comDvr.length ? comDvr.reduce((s, c) => s + n0(c.delta_virtual_real), 0) : null,
        nf_pendente: somaNf(ls),
        com_diferenca: dif.length > 0,
        centros: ls.length,
        centros_com_diferenca: dif.length,
        centros_diferenca: dif.map(c => c.centro),
        causas_produto: null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, porSku, escopo, temEscopo]);

  const testa: Record<Cartao, (p: Produto) => boolean> = {
    diferenca: p => !!p.com_diferenca,
    furo: p => linhasEscopo(p.sku).some(c => n0(c.delta_real_fiscal) !== 0),
    ruptura: p => linhasEscopo(p.sku).some(c => c.risco_ruptura === true),
    perdida: p => linhasEscopo(p.sku).some(c => n0(c.delta_virtual_real) < 0),
    semreal: p => linhasEscopo(p.sku).some(c => c.fonte_real === "sem_contagem" && c.fiscal !== 0),
    canais: p => linhasEscopo(p.sku).some(c => n0(c.shopify_diff) !== 0 || n0(c.bling_diff) !== 0),
    nfpend: p => linhasEscopo(p.sku).some(c => c.nf_pendente !== null && c.nf_pendente !== undefined),
  };

  // Base: busca + escopo de centro + coleção (cartões contam sobre ela).
  const base = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return exibidos.filter(p => {
      if (q && ![p.cod_cadastro, p.sku, p.nome_comercial].filter(temValor).some(v => String(v).toLocaleLowerCase("pt-BR").includes(q))) return false;
      if (filColecoes.length && !filColecoes.includes(p.colecao ?? "")) return false;
      if (temEscopo && linhasEscopo(p.sku).length === 0) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exibidos, porSku, busca, sp]);

  const baseSemEscopo = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return produtos.filter(p => {
      if (q && ![p.cod_cadastro, p.sku, p.nome_comercial].filter(temValor).some(v => String(v).toLocaleLowerCase("pt-BR").includes(q))) return false;
      if (filColecoes.length && !filColecoes.includes(p.colecao ?? "")) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, busca, sp]);

  const cartoes: { k: Cartao; titulo: string; sub?: string }[] = [
    { k: "diferenca", titulo: "Com diferença" },
    { k: "furo", titulo: "Furo físico", sub: `${base.reduce((s, p) => s + linhasEscopo(p.sku).reduce((t, c) => t + Math.abs(n0(c.delta_real_fiscal)), 0), 0)} un` },
    { k: "ruptura", titulo: "Risco de ruptura" },
    { k: "perdida", titulo: "Venda perdida" },
    { k: "semreal", titulo: "Sem real" },
    { k: "canais", titulo: "Canais" },
    { k: "nfpend", titulo: "NF pendente", sub: `${base.reduce((s, p) => s + linhasEscopo(p.sku).reduce((t, c) => t + Math.abs(n0(c.nf_pendente)), 0), 0).toLocaleString("pt-BR")} un` },
  ];
  const centrosLista = useMemo(() => {
    const m = new Map<string, { codigo: string; nome: string; ordem: number }>();
    for (const c of centrosQ.data ?? []) if (!m.has(c.centro)) m.set(c.centro, { codigo: c.centro, nome: c.centro_nome ?? c.centro, ordem: n0(c.centro_ordem) });
    return [...m.values()].sort((a, b) => a.ordem - b.ordem);
  }, [centrosQ.data]);
  const nomesEscopo = escopo.map(c => centrosLista.find(x => x.codigo === c)?.nome ?? c).join(", ");

  const recorte = useMemo(() => {
    const r = base.filter(p => {
      if (soDiferenca && !p.com_diferenca) return false;
      if (cartao && !testa[cartao](p)) return false;
      return true;
    });
    const val = (p: Produto) => ordem.coluna === "fiscal" ? n0(p.fiscal) : ordem.coluna === "real" ? n0(p.real) : Math.abs(n0(p.delta_real_fiscal));
    return r.sort((a, b) => (ordem.dir === "asc" ? 1 : -1) * (val(a) - val(b)) || a.sku.localeCompare(b.sku));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, soDiferenca, cartao, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  const ajustaveisVisiveis = [...new Set(visiveis.filter(p => linhasEscopo(p.sku).some(c => c.correcao === "ajustar_armazem")).map(p => p.sku))];
  const todosSel = ajustaveisVisiveis.length > 0 && ajustaveisVisiveis.every(s => selecionados.has(s));
  function alternar(sku: string) { setSelecionados(prev => { const n = new Set(prev); if (n.has(sku)) n.delete(sku); else n.add(sku); return n; }); }
  function alternarTodos() { setSelecionados(prev => { const n = new Set(prev); ajustaveisVisiveis.forEach(s => todosSel ? n.delete(s) : n.add(s)); return n; }); }

  const opcCentro = centrosLista.map(c => ({ valor: c.codigo, rotulo: c.nome, contagem: produtos.filter(p => cs(p.sku).some(x => x.centro === c.codigo)).length }));
  const opcColecao = [...new Set(produtos.map(p => p.colecao ?? ""))].filter(Boolean).sort().map(v => ({ valor: v, rotulo: v, contagem: produtos.filter(p => p.colecao === v).length }));

  function refetch() { produtosQ.refetch(); centrosQ.refetch(); }
  function exportar() {
    const skus = new Set(recorte.map(p => p.sku));
    const cols: (keyof Centro)[] = ["sku", "cod_cadastro", "nome_comercial", "colecao", "fase", "centro", "centro_nome", "centro_ordem", "centro_vende", "fonte_real", "real_em", "fiscal", "real", "virtual", "reservado", "fiscal_bloqueado", "delta_real_fiscal", "delta_virtual_real", "shopify_diff", "bling_diff", "nf_pendente", "nf_pendente_detalhe", "tem_baixa_pendente", "contagem_vencida", "correcao", "com_diferenca"];
    const linhas = [[...cols, "causas"].join(";")];
    for (const c of centrosQ.data ?? []) {
      if (!skus.has(c.sku)) continue;
      if (temEscopo && !escopo.includes(c.centro)) continue;
      linhas.push([...cols.map(k => k === "cod_cadastro" ? csvCod(c.cod_cadastro) : csvCelula(c[k])), csvCelula((c.causas ?? []).map(x => x.nome ?? x.regra).join(" · "))].join(";"));
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "conciliacao_estoque.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  function Ordenar({ col, rotulo }: { col: "fiscal" | "real" | "delta"; rotulo: string }) {
    const ativo = ordem.coluna === col;
    const Ic = !ativo ? ArrowUpDown : ordem.dir === "asc" ? ArrowUp : ArrowDown;
    return <Button variant="ghost" size="sm" className="-mr-2 h-7 px-2 font-medium" onClick={() => setOrdem(o => ({ coluna: col, dir: o.coluna === col && o.dir === "desc" ? "asc" : "desc" }))}>{rotulo}<Ic className="ml-1 h-3 w-3" /></Button>;
  }

  function Correcao({ c }: { c: Centro }) {
    if (c.correcao === "notas_sem_baixa") return <div className="space-y-1"><p className="text-xs">Resolver a nota antes</p><Button variant="outline" size="sm" className="h-7" onClick={() => setNotasAberto(true)}><FileWarning className="mr-1 h-3.5 w-3.5" />Notas sem baixa</Button></div>;
    if (c.correcao === "ajustar_armazem") return isSuperAdmin
      ? <label className="flex items-center gap-2 text-xs"><Checkbox checked={selecionados.has(c.sku)} onCheckedChange={() => alternar(c.sku)} />Ajustar pelo armazém</label>
      : <span className="text-xs text-muted-foreground">Ajuste pelo armazém (super admin)</span>;
    if (c.correcao === "contagem") return <Link to="/vendas/produto/chegada-mercadoria?aba=recebimento-loja" className="text-xs text-primary underline-offset-2 hover:underline">Contar na Chegada de Mercadoria</Link>;
    if (c.correcao === "canais") return <span className="text-xs">O envio a cada 15 min corrige; se persistir, veja a sincronização.</span>;
    return <span className="text-muted-foreground">—</span>;
  }

  return <TooltipProvider delayDuration={200}><PageShell>
    <PageHeader
      titulo="Conciliação de Estoque"
      icone={Warehouse}
      estado="Fiscal (notas e movimentos) × Real (armazém ou contagem) × Virtual (à venda nos canais) — por produto e por centro."
      acoes={<>
        <BotaoNotasSemBaixa />
        {isSuperAdmin && <Button variant="outline" size="sm" disabled={selecionados.size === 0} onClick={() => setAjusteAberto(true)}>Ajustar pelo armazém ({selecionados.size})</Button>}
        <Button variant="outline" size="sm" onClick={exportar} disabled={carregando || !!erro}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        <Button size="sm" onClick={refetch} disabled={atualizando}><RefreshCw className={cn("mr-2 h-4 w-4", atualizando && "animate-spin")} />Atualizar</Button>
      </>}
    />

    {erro && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertDescription>Erro ao carregar a conciliação: {formatError(erro)}</AlertDescription></Alert>}

    {!erro && <>
      <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-7">
        {cartoes.map(k => {
          const n = carregando ? null : base.filter(testa[k.k]).length;
          return <button key={k.k} type="button" onClick={() => setParam("cartao", cartao === k.k ? null : k.k)} className={cn("rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted", cartao === k.k && "border-primary ring-1 ring-primary")}>
            <p className="text-xs text-muted-foreground">{k.titulo}</p>
            <p className="text-xl font-semibold tabular-nums">{n ?? "…"}</p>
            {k.sub && <p className="text-[11px] text-muted-foreground">{k.sub}</p>}
          </button>;
        })}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {centrosLista.map(c => {
          const n = baseSemEscopo.filter(p => cs(p.sku).some(x => x.centro === c.codigo && x.com_diferenca)).length;
          return <button key={c.codigo} type="button" onClick={() => setParam("centro_card", centroCartao === c.codigo ? null : c.codigo)} className={cn("rounded border bg-card px-2 py-1 text-xs hover:bg-muted", centroCartao === c.codigo && "border-primary ring-1 ring-primary")}>
            {c.nome} <span className="ml-1 font-semibold tabular-nums">{n}</span>
          </button>;
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-72"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" placeholder="Cód., SKU ou nome" value={busca} onChange={e => setParam("q", e.target.value || null)} /></div>
        <FiltroMulti label="Centro" opcoes={opcCentro} selecionados={filCentros} onChange={v => setParam("centro", v.join(",") || null)} />
        <FiltroMulti label="Coleção" opcoes={opcColecao} selecionados={filColecoes} onChange={v => setParam("colecao", v.join(",") || null)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={soDiferenca} onCheckedChange={v => setParam("todos", v ? null : "1")} />Só com diferença</label>
        {sp.toString() && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros</Button>}
      </div>

      {temEscopo && <p className="mb-2 text-xs text-muted-foreground">Números do centro: {nomesEscopo}. Limpe o filtro para ver o total.</p>}
      <div className="overflow-hidden rounded-md border">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-20"><TableRow className="bg-muted">
            <TableHead className="w-8">{isSuperAdmin && ajustaveisVisiveis.length > 0 && <Checkbox checked={todosSel} onCheckedChange={alternarTodos} aria-label="Selecionar todos os visíveis ajustáveis" title="Selecionar todos os visíveis ajustáveis" />}</TableHead>
            <TableHead>Cód.</TableHead><TableHead>SKU</TableHead><TableHead>Nome</TableHead>
            <TableHead className="text-right"><Ordenar col="fiscal" rotulo="Fiscal" /></TableHead>
            <TableHead className="text-right"><Ordenar col="real" rotulo="Real" /></TableHead>
            <TableHead className="text-right">Virtual</TableHead>
            <TableHead className="text-right"><Ordenar col="delta" rotulo="Δ Real−Fiscal" /></TableHead>
            <TableHead className="text-right">Δ Virtual×Real</TableHead>
            <TableHead className="text-right">NF pendente</TableHead>
            <TableHead>Centros com diferença</TableHead><TableHead>Causas</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {carregando && Array.from({ length: 6 }).map((_, i) => <TableRow key={i}><TableCell colSpan={12}><Skeleton className="h-5 w-full" /></TableCell></TableRow>)}
            {!carregando && visiveis.length === 0 && <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">Nenhuma diferença entre Fiscal, Real e Virtual.</TableCell></TableRow>}
            {!carregando && visiveis.map(p => {
              const aberto = expandido === p.sku;
              const centros = linhasEscopo(p.sku);
              const causas = [...new Set([...centros.flatMap(c => (c.causas ?? []).map(x => x.nome ?? x.regra)), ...(temEscopo ? [] : (p.causas_produto ?? []).map(x => x.nome ?? x.regra))])];
              return <Fragment key={p.sku}>
                <TableRow className="cursor-pointer" onClick={() => setExpandido(aberto ? null : p.sku)}>
                  <TableCell>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="font-medium">{p.cod_cadastro ?? "—"}</TableCell>
                  <TableCell>{p.sku}</TableCell>
                  <TableCell className="max-w-60"><div className="truncate">{p.nome_comercial ?? "—"}</div>{p.colecao && <div className="text-[10px] text-muted-foreground">{p.colecao}</div>}</TableCell>
                  <TableCell className="text-right tabular-nums">{n0(p.fiscal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.real_completo === false
                    ? <Tooltip><TooltipTrigger asChild><span>{n0(p.real)}*</span></TooltipTrigger><TooltipContent>Há centro com saldo nunca contado</TooltipContent></Tooltip>
                    : n0(p.real)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n0(p.virtual)}</TableCell>
                  <TableCell className="text-right"><DeltaRF v={p.delta_real_fiscal} /></TableCell>
                  <TableCell className="text-right"><DeltaVR v={p.delta_virtual_real} risco={linhasEscopo(p.sku).some(c => c.risco_ruptura === true)} /></TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{(() => {
                    const det = centros.filter(c => c.nf_pendente_detalhe).map(c => `${c.centro_nome ?? c.centro}: ${c.nf_pendente_detalhe}`);
                    if (p.nf_pendente === null || p.nf_pendente === undefined) return "";
                    const t = n0(p.nf_pendente);
                    const txt = t === 0 ? "0" : sinalNf(t);
                    return det.length ? <Tooltip><TooltipTrigger asChild><span className="cursor-help">{txt}</span></TooltipTrigger><TooltipContent className="max-w-xs">{det.map((d, i) => <div key={i}>{d}</div>)}</TooltipContent></Tooltip> : txt;
                  })()}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(p.centros_diferenca ?? []).map(c => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}</div></TableCell>
                  <TableCell><div className="flex max-w-72 flex-wrap gap-1">{causas.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}</div></TableCell>
                </TableRow>
                {aberto && <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={12} className="p-2">
                  {centros.length === 0 ? <p className="p-2 text-muted-foreground">Sem linhas por centro.</p> :
                  <Table className="text-xs"><TableHeader><TableRow>
                    <TableHead>Centro</TableHead><TableHead>Fonte do real</TableHead>
                    <TableHead className="text-right">Fiscal</TableHead><TableHead className="text-right">Real</TableHead><TableHead className="text-right">Virtual</TableHead><TableHead className="text-right">Reservado</TableHead>
                    <TableHead className="text-right">Δ Real−Fiscal</TableHead><TableHead className="text-right">Δ Virtual×Real</TableHead><TableHead className="text-right">Venda/dia</TableHead><TableHead className="text-right">NF pendente</TableHead><TableHead>Shopify/Bling Δ</TableHead>
                    <TableHead>Causas</TableHead><TableHead>Correção</TableHead>
                  </TableRow></TableHeader><TableBody>
                    {centros.map(c => <TableRow key={c.centro}>
                      <TableCell className="font-medium">{c.centro_nome ?? c.centro}</TableCell>
                      <TableCell className={cn(c.fonte_real === "sem_contagem" && "text-amber-600 dark:text-amber-400")}>{fonteReal(c)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n0(c.fiscal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.real ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.virtual ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{n0(c.reservado)}</TableCell>
                      <TableCell className="text-right"><DeltaRF v={c.delta_real_fiscal} /></TableCell>
                      <TableCell className="text-right"><DeltaVR v={c.delta_virtual_real} risco={c.risco_ruptura === true} /></TableCell>
                      <TableCell className="text-right tabular-nums">{c.vendas_dia == null ? "—" : Number(c.vendas_dia).toFixed(1).replace(".", ",")}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{c.nf_pendente !== null && c.nf_pendente !== undefined && <>{n0(c.nf_pendente) === 0 ? "0" : sinalNf(n0(c.nf_pendente))}{c.nf_pendente_detalhe && <div className="text-[10px] font-normal text-muted-foreground">{c.nf_pendente_detalhe}</div>}</>}</TableCell>
                      <TableCell className="tabular-nums">{[n0(c.shopify_diff) !== 0 && `Shopify ${sinal(c.shopify_diff)}`, n0(c.bling_diff) !== 0 && `Bling ${sinal(c.bling_diff)}`].filter(Boolean).join(" · ") || ""}</TableCell>
                      <TableCell><ul className="space-y-0.5">{(c.causas ?? []).map((x, i) => <li key={i}>{x.o_que_fazer
                        ? <Tooltip><TooltipTrigger asChild><span className="cursor-help"><span className="font-medium">{x.nome ?? x.regra}</span>{x.detalhe && <span className="text-muted-foreground"> — {x.detalhe}</span>}</span></TooltipTrigger><TooltipContent className="max-w-xs">{x.o_que_fazer}</TooltipContent></Tooltip>
                        : <span><span className="font-medium">{x.nome ?? x.regra}</span>{x.detalhe && <span className="text-muted-foreground"> — {x.detalhe}</span>}</span>}</li>)}</ul></TableCell>
                      <TableCell onClick={e => e.stopPropagation()}><Correcao c={c} /></TableCell>
                    </TableRow>)}
                  </TableBody></Table>}
                </TableCell></TableRow>}
              </Fragment>;
            })}
          </TableBody>
        </Table>
        <RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="conciliacao_estoque" onPagina={setPagina} onTamanhoPagina={setTamanho} />
      </div>
    </>}

    <NotasSemBaixaDialog open={notasAberto} onOpenChange={setNotasAberto} />
    <AjustarPeloArmazemDialog aberto={ajusteAberto} onFechar={() => setAjusteAberto(false)} skus={[...selecionados]} onAjustado={() => { setSelecionados(new Set()); refetch(); }} />
  </PageShell></TooltipProvider>;
}
