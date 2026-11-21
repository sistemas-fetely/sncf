import { MultiSelectFilter } from "@/components/shared/MultiSelectFilter";
import { lerFiltroProduto } from "@/lib/produto/filtrosMultiplos";
/**
 * CENTRAL DE ESTOQUE (ESTOQUE v6 F2) — uma linha por produto, uma coluna por CD.
 * DISPONÍVEL é o número da venda; o resto é detalhe. Fonte: fn_lista por SKU.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chamarLista, numeroAgregado, useListaPaginada } from "@/lib/lista/useListaPaginada";
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
import { useColunasCentralEstoque } from "@/hooks/estoque/useCentralEstoque";
import { adaptarProdutoCentral, type LinhaCentralProduto, type ProdutoCentral } from "@/lib/estoque/centralEstoque";
import { contagensCentralEstoque, parametrosCentralEstoque } from "@/lib/estoque/centralEstoqueLista";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { GavetaProdutoEstoque } from "@/components/estoque/central/GavetaProdutoEstoque";
import { corNumero } from "@/components/estoque/central/statusVisual";
import { FilaOperacionalEstoque } from "@/components/estoque/FilaOperacionalEstoque";
import { AcoesAlertasEstoque } from "@/components/estoque/AcoesAlertasEstoque";
import { useReposicaoSp } from "@/hooks/estoque/useReposicaoSp";
import { PainelReposicaoSp } from "@/components/estoque/central/PainelReposicaoSp";

const fmt = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });


export default function CentralEstoque() {
  const [f, setF] = useEstadoTela({ q: "", colecao: "", fase: "", card: "", painel: "", reposicao: "urgente", saldo: false, pagina: 1, tamanho: DEFAULT_PAGE_SIZE as number }, { replaceKeys: ["q"] });
  const navigate = useNavigate();
  const cardAtivo = f.card || (f.painel === "repor" ? "repor" : "");
  const [params, setParams] = useSearchParams();
  const foco = params.get("foco");
  const selecaoProduto = { colecao: lerFiltroProduto(f.colecao), fase: lerFiltroProduto(f.fase) };
  const filtros = { ...f, ...selecaoProduto, card: cardAtivo };
  const lista = useListaPaginada<LinhaCentralProduto>(parametrosCentralEstoque(filtros));
  const consultaColunas = useColunasCentralEstoque();
  const reposicao = useReposicaoSp();
  const colunas = consultaColunas.data ?? [];
  const pagina = useMemo(() => (lista.data?.linhas ?? []).map(adaptarProdutoCentral), [lista.data?.linhas]);
  const produtoPagina = foco ? pagina.find(p => p.sku === foco) : undefined;
  const detalhe = useQuery({
    queryKey: ["lista", "vw_central_estoque_produto", "foco", foco],
    enabled: !!foco && !!lista.data && !lista.isFetching && !produtoPagina,
    queryFn: async () => {
      if (!foco) throw new Error("Produto não informado.");
      const r = await chamarLista<LinhaCentralProduto>({ relacao: "vw_central_estoque_produto", filtros: [{ c: "sku", op: "eq", v: foco }], tamanho: 1, pagina: 1 });
      const linha = r.linhas[0];
      if (!linha) throw new Error("Nenhum produto.");
      return adaptarProdutoCentral(linha);
    },
  });
  const alerta = useQuery({
    queryKey: ["estoque-alerta-produto", "foco", foco], enabled: !!foco,
    queryFn: async () => {
      if (!foco) throw new Error("Produto não informado.");
      const { data, error } = await supabase.from("vw_estoque_alerta_produto").select("*").eq("sku", foco).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const aberto = foco ? produtoPagina ?? detalhe.data ?? null : null;
  const isLoading = lista.isLoading || consultaColunas.isLoading;
  const error = lista.error ?? consultaColunas.error;
  const erroGaveta = detalhe.error ?? alerta.error;
  const fila = {
    contagens: contagensCentralEstoque(lista.data?.agregados),
    custoPosicao: numeroAgregado(lista.data?.agregados, "custo_parado"),
    unidadesParadas: numeroAgregado(lista.data?.agregados, "unidades_paradas"),
    urgente: (reposicao.data ?? []).filter(r => r.ritmo === "urgente").length,
    carga: (reposicao.data ?? []).filter(r => r.ritmo === "carga").length,
    isLoading: lista.isLoading || reposicao.isLoading, error: lista.error ?? reposicao.error,
  };
  useRestaurarScroll(null, !isLoading);

  const opcoesFaceta = (campo: string) => (lista.data?.facetas[campo] ?? []).flatMap(o => o.valor ? [{ valor: o.valor, rotulo: o.valor, contagem: o.contagem }] : [])
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

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
        <MultiSelectFilter label="Todas as coleções" plural="coleções" opcoes={opcoesFaceta("colecao")} selecionados={selecaoProduto.colecao} onChange={(v) => setF({ colecao: escreverLista(v), pagina: 1 })} className="w-44 h-9" />
        <MultiSelectFilter label="Todas as fases" plural="fases" opcoes={opcoesFaceta("fase")} selecionados={selecaoProduto.fase} onChange={(v) => setF({ fase: escreverLista(v), pagina: 1 })} className="w-40 h-9" />
        <div className="flex items-center gap-2"><Switch id="so-saldo" checked={f.saldo} onCheckedChange={(v) => setF({ saldo: v, pagina: 1 })} /><Label htmlFor="so-saldo" className="text-sm">Só com saldo</Label></div>
        <AcoesAlertasEstoque card={cardAtivo} filtros={filtros} />
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
            <RodapePaginacao total={lista.data?.total ?? 0} pagina={f.pagina} tamanhoPagina={f.tamanho} tela="tela.central_estoque"
              onPagina={(n) => setF({ pagina: n })} onTamanhoPagina={(n) => setF({ tamanho: n, pagina: 1 })} />
          </div>
        </TooltipProvider>
      )}
      </>}

      {foco && erroGaveta && <Alert variant="destructive"><AlertDescription>{formatError(erroGaveta)}</AlertDescription></Alert>}
      <GavetaProdutoEstoque produto={aberto} alerta={alerta.data ?? undefined} onFechar={() => abrir(null)} />
    </PageShell>
  );
}
