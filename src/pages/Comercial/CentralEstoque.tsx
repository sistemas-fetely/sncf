import { MultiSelectFilter } from "@/components/shared/MultiSelectFilter";
import { filtrarDimensoesProduto, opcoesFiltroProduto, lerFiltroProduto } from "@/lib/produto/filtrosMultiplos";
/**
 * CENTRAL DE ESTOQUE (ESTOQUE v6 F2) — uma linha por produto, uma coluna por CD.
 * DISPONÍVEL é o número da venda; o resto é detalhe. Fonte única: vw_central_estoque.
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Boxes, Lock } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EstoqueAbas } from "@/components/estoque/EstoqueAbas";
import { FilterInput } from "@/components/ui/filter-input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CodProduto } from "@/components/produto/CodProduto";
import { DEFAULT_PAGE_SIZE, RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { useEstadoTela, useRestaurarScroll, escreverLista } from "@/lib/navegacao";
import { useCentralEstoque } from "@/hooks/estoque/useCentralEstoque";
import { filtrar, type ProdutoCentral } from "@/lib/estoque/centralEstoque";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { GavetaProdutoEstoque } from "@/components/estoque/central/GavetaProdutoEstoque";
import { corNumero } from "@/components/estoque/central/statusVisual";
import { FilaOperacionalEstoque } from "@/components/estoque/FilaOperacionalEstoque";
import { AcoesAlertasEstoque } from "@/components/estoque/AcoesAlertasEstoque";
import { useFilaOperacionalEstoque } from "@/hooks/estoque/useFilaOperacionalEstoque";
import { skusDoCard } from "@/lib/estoque/filaOperacionalEstoque";
import { PainelReposicaoSp } from "@/components/estoque/central/PainelReposicaoSp";

const fmt = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });


export default function CentralEstoque() {
  const [f, setF] = useEstadoTela({ q: "", colecao: "", fase: "", card: "", painel: "", reposicao: "urgente", saldo: false, pagina: 1, tamanho: DEFAULT_PAGE_SIZE as number }, { replaceKeys: ["q"] });
  const navigate = useNavigate();
  const fila = useFilaOperacionalEstoque();
  const cardAtivo = f.card || (f.painel === "repor" ? "repor" : "");
  const skusCard = skusDoCard(fila, cardAtivo);
  const [params, setParams] = useSearchParams();
  const foco = params.get("foco");
  const { produtos, colunas, isLoading, error } = useCentralEstoque();
  useRestaurarScroll(null, !isLoading);

  const colecoes = useMemo(() => [...new Set(produtos.map((p) => p.colecao).filter(Boolean) as string[])].sort(), [produtos]);
  const fases = useMemo(() => [...new Set(produtos.map((p) => p.fase).filter(Boolean) as string[])].sort(), [produtos]);
  const selecaoProduto = { colecao: lerFiltroProduto(f.colecao), fase: lerFiltroProduto(f.fase) };
  const baseOutrosFiltros = filtrar(produtos, { q: f.q, colecao: "", fase: "", card: "", comSaldo: f.saldo }).filter(p => !skusCard || skusCard.has(p.sku));
  const visiveis = filtrarDimensoesProduto(baseOutrosFiltros, selecaoProduto);
  const skusVisiveis = new Set(visiveis.map(p => p.sku));
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
      <EstoqueAbas />

      <FilaOperacionalEstoque fila={fila} ativo={cardAtivo} onCard={card => setF({ card, painel: "", pagina: 1 })} />
      {cardAtivo === "repor" ? <PainelReposicaoSp aba={f.reposicao === "carga" ? "carga" : "urgente"} onAba={v => setF({ reposicao: v })} onUsar={reposicaoSp => navigate("/pedidos/transferencias?aba=nova", { state: { reposicaoSp } })} /> : <>
      <div className="flex flex-wrap items-center gap-2">
        <FilterInput value={f.q} onChange={(e) => setF({ q: e.target.value, pagina: 1 })} placeholder="Código, SKU ou nome" className="w-64" />
        <MultiSelectFilter label="Todas as coleções" plural="coleções" opcoes={opcoesFiltroProduto(baseOutrosFiltros, selecaoProduto, "colecao", colecoes, undefined, p => p.sku)} selecionados={selecaoProduto.colecao} onChange={(v) => setF({ colecao: escreverLista(v), pagina: 1 })} className="w-44 h-9" />
        <MultiSelectFilter label="Todas as fases" plural="fases" opcoes={opcoesFiltroProduto(baseOutrosFiltros, selecaoProduto, "fase", fases, undefined, p => p.sku)} selecionados={selecaoProduto.fase} onChange={(v) => setF({ fase: escreverLista(v), pagina: 1 })} className="w-40 h-9" />
        <div className="flex items-center gap-2"><Switch id="so-saldo" checked={f.saldo} onCheckedChange={(v) => setF({ saldo: v, pagina: 1 })} /><Label htmlFor="so-saldo" className="text-sm">Só com saldo</Label></div>
        <AcoesAlertasEstoque card={cardAtivo} alertas={fila.alertas.filter(a => a.sku && skusVisiveis.has(a.sku))} />
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

      <GavetaProdutoEstoque produto={aberto} alerta={fila.alertas.find(a => a.sku === aberto?.sku)} onFechar={() => abrir(null)} />
    </PageShell>
  );
}
