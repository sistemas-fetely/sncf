/**
 * CENTRAL DE ESTOQUE (ESTOQUE v6 F2) — uma linha por produto, uma coluna por CD.
 * DISPONÍVEL é o número da venda; o resto é detalhe. Fonte única: vw_central_estoque.
 */
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Lock } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CodProduto } from "@/components/produto/CodProduto";
import { DEFAULT_PAGE_SIZE, RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { useEstadoTela, useRestaurarScroll } from "@/lib/navegacao";
import { useCentralEstoque } from "@/hooks/estoque/useCentralEstoque";
import { contarFila, filtrar, FILA, type CardFila, type ProdutoCentral } from "@/lib/estoque/centralEstoque";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { GavetaProdutoEstoque } from "@/components/estoque/central/GavetaProdutoEstoque";
import { corNumero } from "@/components/estoque/central/statusVisual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useReposicaoSp } from "@/hooks/estoque/useReposicaoSp";
import { PainelReposicaoSp } from "@/components/estoque/central/PainelReposicaoSp";

const ROTULO_FILA: Record<CardFila, string> = {
  acabando: "Acabando", zerado_venda: "Zerado com venda", retido: "Retido em canal",
  diverge: "Diverge do real", sem_contagem: "Sem contagem", a_caminho: "A caminho",
};
const fmt = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const TODAS = "__todas";

const ABAS = [
  { rotulo: "Central", to: "/vendas/produto/estoque/central" },
  { rotulo: "Cockpit", to: "/vendas/produto/estoque/virtual" },
  { rotulo: "Conciliação", to: "/vendas/produto/estoque/conciliacao" },
];

export default function CentralEstoque() {
  const [f, setF] = useEstadoTela({ q: "", colecao: "", fase: "", card: "", painel: "", reposicao: "urgente", saldo: false, pagina: 1, tamanho: DEFAULT_PAGE_SIZE as number }, { replaceKeys: ["q"] });
  const navigate = useNavigate();
  const reposicao = useReposicaoSp();
  const urgente = (reposicao.data ?? []).filter(l => l.ritmo === "urgente").length;
  const carga = (reposicao.data ?? []).filter(l => l.ritmo === "carga").length;
  const [params, setParams] = useSearchParams();
  const foco = params.get("foco");
  const { produtos, colunas, isLoading, error } = useCentralEstoque();
  useRestaurarScroll(null, !isLoading);

  const colecoes = useMemo(() => [...new Set(produtos.map((p) => p.colecao).filter(Boolean) as string[])].sort(), [produtos]);
  const fases = useMemo(() => [...new Set(produtos.map((p) => p.fase).filter(Boolean) as string[])].sort(), [produtos]);
  const contagem = useMemo(() => contarFila(produtos), [produtos]);
  const visiveis = useMemo(() => filtrar(produtos, { q: f.q, colecao: f.colecao, fase: f.fase, card: f.card, comSaldo: f.saldo }), [produtos, f.q, f.colecao, f.fase, f.card, f.saldo]);
  const pagina = visiveis.slice((f.pagina - 1) * f.tamanho, f.pagina * f.tamanho);
  const aberto = foco ? produtos.find((p) => p.sku === foco) ?? null : null;

  const abrir = (sku: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (sku) n.set("foco", sku); else n.delete("foco"); return n; });

  const celula = (p: ProdutoCentral, centro: string) => {
    const l = p.centros[centro];
    if (!l) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="text-right leading-tight">
        <div className={cn("text-base font-bold tabular-nums inline-flex items-center gap-1", corNumero(l))}>
          {l.status === "retido" && <Lock className="h-3 w-3" />}{fmt(l.disponivel)}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          cont {fmt(l.contabil)} · res {fmt(l.reservado)}
          {Number(l.a_caminho ?? 0) > 0 && <> · ↗ {fmt(l.a_caminho)} a caminho</>}
          {l.diverge_real && <> · <span className="text-warning">real {fmt(l.real_centro)}</span></>}
        </div>
      </div>
    );
  };

  return (
    <PageShell variant="dados">
      <PageHeader titulo="Central de Estoque" icone={Boxes} />
      <nav className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <Link key={a.to} to={a.to} className={cn("px-3 py-1.5 text-sm border-b-2 -mb-px", a.rotulo === "Central" ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>{a.rotulo}</Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {FILA.map((c) => (
          <Button key={c} type="button" variant="outline" onClick={() => setF({ card: f.card === c ? "" : c, painel: "", pagina: 1 })}
            className={cn("h-auto block rounded-md border bg-card p-3 text-left shadow-sm hover:bg-muted/40", f.card === c && !f.painel && "ring-2 ring-primary")}>
            <div className="text-xs text-muted-foreground">{ROTULO_FILA[c]}</div>
            <div className="text-2xl font-bold tabular-nums">{isLoading ? "…" : contagem[c]}</div>
          </Button>
        ))}
        <Button type="button" variant="outline" className={cn("h-auto block bg-card p-3 text-left shadow-sm", f.painel === "repor" && "ring-2 ring-primary")} onClick={() => setF({ painel: f.painel === "repor" ? "" : "repor", card: "" })}>
          <div className="text-xs text-muted-foreground">Repor SP</div><div className="text-2xl font-bold tabular-nums">{reposicao.isLoading ? "…" : reposicao.error ? "—" : urgente + carga}</div><Badge variant="outline" className="text-[10px] whitespace-normal">{urgente} urgente · {carga} carga</Badge>
        </Button>
      </div>

      {reposicao.error && <Alert variant="destructive"><AlertDescription>{formatError(reposicao.error)}</AlertDescription></Alert>}
      {f.painel === "repor" ? <PainelReposicaoSp aba={f.reposicao === "carga" ? "carga" : "urgente"} onAba={v => setF({ reposicao: v })} onUsar={reposicaoSp => navigate("/pedidos/transferencias?aba=nova", { state: { reposicaoSp } })} /> : <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterInput value={f.q} onChange={(e) => setF({ q: e.target.value, pagina: 1 })} placeholder="Código, SKU ou nome" className="w-64" />
        <Select value={f.colecao || TODAS} onValueChange={(v) => setF({ colecao: v === TODAS ? "" : v, pagina: 1 })}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Coleção" /></SelectTrigger>
          <SelectContent><SelectItem value={TODAS}>Todas as coleções</SelectItem>{colecoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={f.fase || TODAS} onValueChange={(v) => setF({ fase: v === TODAS ? "" : v, pagina: 1 })}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Fase" /></SelectTrigger>
          <SelectContent><SelectItem value={TODAS}>Todas as fases</SelectItem>{fases.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-2"><Switch id="so-saldo" checked={f.saldo} onCheckedChange={(v) => setF({ saldo: v, pagina: 1 })} /><Label htmlFor="so-saldo" className="text-sm">Só com saldo</Label></div>
      </div>

      {error ? (
        <Alert variant="destructive"><AlertDescription>{formatError(error)}</AlertDescription></Alert>
      ) : (
        <TooltipProvider>
          <div className="rounded-md border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Produto</th>
                    {colunas.map((c) => <th key={c.codigo} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{c.rotulo}</th>)}
                    <th className="px-3 py-2 text-right font-semibold">Rede</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Terceiros</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t"><td colSpan={colunas.length + 3} className="p-2"><Skeleton className="h-8 w-full" /></td></tr>
                  )) : pagina.length === 0 ? (
                    <tr><td colSpan={colunas.length + 3} className="p-6 text-center text-muted-foreground">Nenhum produto.</td></tr>
                  ) : pagina.map((p) => (
                    <tr key={p.sku} data-foco-id={p.sku} onClick={() => abrir(p.sku)} className="border-t cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2"><CodProduto chave={p.sku} /><span className="font-medium">{p.nome}</span></div>
                        <div className="text-xs text-muted-foreground">{[p.cor, p.colecao].filter(Boolean).join(" · ")}</div>
                      </td>
                      {colunas.map((c) => <td key={c.codigo} className="px-3 py-2">{celula(p, c.codigo)}</td>)}
                      <td className="px-3 py-2 text-right text-base font-bold tabular-nums bg-muted/30">{fmt(p.rede)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {p.terceiros.length === 0 ? "—" : (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="underline decoration-dotted">{fmt(p.terceirosDisp)}</span></TooltipTrigger>
                            <TooltipContent>{p.terceiros.map((t) => <div key={t.centro} className="tabular-nums">{t.centro_rotulo}: {fmt(t.disponivel)}</div>)}</TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RodapePaginacao total={visiveis.length} pagina={f.pagina} tamanhoPagina={f.tamanho} tela="tela.central_estoque"
              onPagina={(n) => setF({ pagina: n })} onTamanhoPagina={(n) => setF({ tamanho: n, pagina: 1 })} />
          </div>
        </TooltipProvider>
      )}
      </>}

      <GavetaProdutoEstoque produto={aberto} onFechar={() => abrir(null)} />
    </PageShell>
  );
}
