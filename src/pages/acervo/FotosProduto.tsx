// FOTOS E VÍDEOS — /vendas/produto/fotos · gestão do Repositório de Mídia (mapa-repositorio-midia-v1, 28/11/2026).
// Só leitura: vw_midia_resumo, vw_midia_produto_gestao, produto_midia (galeria) e vw_midia_sem_vinculo.
// A base própria (envio manual) segue intocada, numa seção recolhível no fim.
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Download, ExternalLink, Image as ImageIcon, MoreHorizontal, Video } from "lucide-react";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll, montarFrom } from "@/lib/navegacao";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { ProdutoAbas } from "@/components/produto/ProdutoAbas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { fmtDataHora } from "@/lib/data";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { useMidiaGaleria, useMidiaProdutos, useMidiaResumo, useVariantesSemVinculo, useContagemSemVinculo } from "@/hooks/useMidiaGestao";
import { blingSemFoto, contarCartoes, filtrarMidia, rotuloOrigemFoto, ROTULO_SITUACAO, type CartaoMidia, type MidiaProduto } from "@/lib/midia/gestao";
import { BaseFotosPropria } from "./fotos/BaseFotosPropria";

const TODOS = "__todos";
const corSituacao: Record<string, string> = { com_foto: "border-success/40 text-success", so_cor_colecao: "border-warning/40 text-warning", sem_foto: "border-destructive/40 text-destructive" };

export default function FotosProduto() {
  const location = useLocation();
  const [nav, setNav] = useEstadoTela(
    { q: "", cartao: "", situacao: "", colecao: "", video: false, ativos: true, falha: false, pagina: 1, detalhe: "" },
    { replaceKeys: ["q"] },
  );
  const [tamanhoPagina, setTamanhoPagina] = useState<number>(DEFAULT_PAGE_SIZE);
  const [baseAberta, setBaseAberta] = useState(false);
  const [variantesAberta, setVariantesAberta] = useState(false);
  const resumoQ = useMidiaResumo();
  const produtosQ = useMidiaProdutos();
  const r = resumoQ.data;
  const cartao = nav.cartao as CartaoMidia;
  const mostrarVariantes = variantesAberta || cartao === "sem_vinculo";
  const variantesQ = useVariantesSemVinculo(mostrarVariantes);
  const nSemVinculoQ = useContagemSemVinculo();
  const n = useMemo(() => contarCartoes(produtosQ.data ?? []), [produtosQ.data]);

  const colecoes = useMemo(() => Array.from(new Set((produtosQ.data ?? []).map((p) => p.colecao).filter((c): c is string => !!c))).sort(), [produtosQ.data]);
  const filtradas = useMemo(() => filtrarMidia(produtosQ.data ?? [], {
    cartao, busca: nav.q, situacao: nav.situacao, colecao: nav.colecao, soVideo: nav.video, soAtivos: nav.ativos, soFalha: nav.falha,
  }), [produtosQ.data, cartao, nav.q, nav.situacao, nav.colecao, nav.video, nav.ativos, nav.falha]);
  const fim = nav.pagina * tamanhoPagina;
  const visiveis = filtradas.slice(fim - tamanhoPagina, fim);
  useFocoAoVoltar({ pronto: !produtosQ.isLoading, idsVisiveis: visiveis.map((p) => p.cod_cadastro) });
  useRestaurarScroll(null, !produtosQ.isLoading);
  const detalhe = (produtosQ.data ?? []).find((p) => p.cod_cadastro === nav.detalhe) ?? null;

  const cartoes: { id: CartaoMidia; rotulo: string; valor: number | undefined }[] = [
    { id: "com_foto", rotulo: "Com foto do produto", valor: n.com_foto },
    { id: "so_cor_colecao", rotulo: "Só foto de cor/coleção", valor: n.so_cor_colecao },
    { id: "sem_foto", rotulo: "Sem foto", valor: n.sem_foto },
    { id: "com_video", rotulo: "Com vídeo", valor: n.com_video },
    { id: "falha", rotulo: "Falhas de cópia", valor: n.falha },
    { id: "sem_vinculo", rotulo: "Variantes Shopify sem SKU no SNCF", valor: nSemVinculoQ.data },
  ];

  function exportarCsv() {
    const cab = ["codigo", "sku", "nome", "colecao", "fotos", "videos", "origem_principal", "fotos_bling", "situacao"];
    const linhas = filtradas.map((p) => [p.cod_cadastro, p.sku ?? "", p.nome_comercial ?? "", p.colecao ?? "", p.n_fotos ?? 0, p.n_videos ?? 0, rotuloOrigemFoto(p.foto_fonte), p.n_fotos_bling ?? "", ROTULO_SITUACAO[p.situacao] ?? p.situacao]);
    const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `fotos-videos-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const arquivos = (r?.arquivos_foto ?? 0) + (r?.arquivos_video ?? 0);
  return (
    <PageShell>
      <PageHeader
        titulo="Fotos e vídeos"
        icone={ImageIcon}
        estado={r ? `${arquivos} arquivos · ${(r.mb_bucket ?? 0).toLocaleString("pt-BR")} MB` : resumoQ.isLoading ? "Contando o repositório…" : `Resumo indisponível (${rawMessage(resumoQ.error)})`}
        acoes={<Button variant="outline" onClick={exportarCsv} disabled={filtradas.length === 0}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>}
      />
      <ProdutoAbas />

      {produtosQ.error && <p role="alert" className="text-sm text-destructive">{rawMessage(produtosQ.error)}</p>}

      <div className="space-y-1">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cartoes.map((c) => (
            <button key={c.id} type="button" onClick={() => { const novo = cartao === c.id ? "" : c.id; setNav({ cartao: novo, pagina: 1 }); if (novo === "sem_vinculo") setVariantesAberta(true); }} className="text-left">
              <Card className={cn("h-full transition-colors hover:border-primary/50", cartao === c.id && "border-primary ring-1 ring-primary")}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{c.rotulo}</p>
                  {(c.id === "sem_vinculo" ? nSemVinculoQ.isLoading : produtosQ.isLoading) ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-2xl tabular-nums">{c.valor ?? 0}</p>}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Entrada: Shopify (automático a cada 5 min). Fotos e vídeos ficam guardados no SNCF.</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64 space-y-1"><Label htmlFor="busca-midia">Busca</Label><Input id="busca-midia" placeholder="Código, nome ou SKU" value={nav.q} onChange={(e) => setNav({ q: e.target.value, pagina: 1 })} /></div>
            <div className="w-44 space-y-1"><Label>Situação</Label>
              <Select value={nav.situacao || TODOS} onValueChange={(v) => setNav({ situacao: v === TODOS ? "" : v, pagina: 1 })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={TODOS}>Todas</SelectItem>{Object.entries(ROTULO_SITUACAO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="w-52 space-y-1"><Label>Coleção</Label>
              <Select value={nav.colecao || TODOS} onValueChange={(v) => setNav({ colecao: v === TODOS ? "" : v, pagina: 1 })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={TODOS}>Todas</SelectItem>{colecoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {([["video", "Só com vídeo"], ["ativos", "Só ativos"], ["falha", "Só com falha"]] as const).map(([k, rot]) => (
              <label key={k} className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={nav[k]} onCheckedChange={(v) => setNav({ [k]: v === true, pagina: 1 })} />{rot}</label>
            ))}
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Foto</TableHead>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-36">Coleção</TableHead>
                <TableHead className="w-16 text-right">Fotos</TableHead>
                <TableHead className="w-16 text-right">Vídeos</TableHead>
                <TableHead className="w-28">Origem</TableHead>
                <TableHead className="w-20 text-right">No Bling</TableHead>
                <TableHead className="w-32">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosQ.isLoading ? Array.from({ length: 6 }).map((_, i) => <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
                : visiveis.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Nenhum produto com esses filtros.</TableCell></TableRow>
                : visiveis.map((p) => (
                  <TableRow key={p.cod_cadastro} data-foco-id={p.cod_cadastro} className="cursor-pointer" onClick={() => setNav({ detalhe: p.cod_cadastro })}>
                    <TableCell>{p.foto_principal_url ? <img src={p.foto_principal_url} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /></div>}</TableCell>
                    <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                      <Link className="underline underline-offset-4" to={`/vendas/produto/ficha/${p.cod_cadastro}`} state={{ from: montarFrom(location.pathname, location.search, p.cod_cadastro), fromLabel: "Fotos e vídeos" }}>{p.cod_cadastro}</Link>
                    </TableCell>
                    <TableCell><div className="truncate text-sm" title={p.nome_comercial ?? ""}>{p.nome_comercial ?? "—"}</div>{p.sku && <div className="truncate text-xs text-muted-foreground" title={p.sku}>{p.sku}</div>}</TableCell>
                    <TableCell><div className="truncate text-sm" title={p.colecao ?? ""}>{p.colecao ?? "—"}</div></TableCell>
                    <TableCell className="text-right tabular-nums">{p.n_fotos ?? 0}{(p.n_fotos_falha ?? 0) > 0 && <span className="ml-1 text-xs text-destructive" title="Falhas de cópia">({p.n_fotos_falha}!)</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{(p.n_videos ?? 0) > 0 ? <span className="inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" />{p.n_videos}</span> : "—"}</TableCell>
                    <TableCell>{p.foto_fonte ? <Badge variant="outline" className="font-normal">{rotuloOrigemFoto(p.foto_fonte)}</Badge> : "—"}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", blingSemFoto(p) && "rounded bg-warning/10 text-warning")}>{p.n_fotos_bling ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={cn("font-normal", corSituacao[p.situacao])}>{ROTULO_SITUACAO[p.situacao] ?? p.situacao}</Badge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          <RodapePaginacao total={filtradas.length} pagina={nav.pagina} tamanhoPagina={tamanhoPagina} tela="fotos_produto" onPagina={(v) => setNav({ pagina: v })} onTamanhoPagina={(t) => { setTamanhoPagina(t); setNav({ pagina: 1 }); }} />
        </CardContent>
      </Card>

      <Collapsible open={mostrarVariantes} onOpenChange={(o) => { setVariantesAberta(o); if (!o && cartao === "sem_vinculo") setNav({ cartao: "" }); }}>
        <Card>
          <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left text-sm font-medium">
            <span>Variantes da Shopify sem SKU no SNCF{nSemVinculoQ.data != null && <span className="ml-1 text-muted-foreground">({nSemVinculoQ.data})</span>}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", mostrarVariantes && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              <p className="text-sm text-muted-foreground">As fotos dessas variantes não entram no repositório até o SKU existir no SNCF.</p>
              {variantesQ.error ? <p role="alert" className="text-sm text-destructive">{rawMessage(variantesQ.error)}</p> : variantesQ.isLoading ? <Skeleton className="h-24 w-full" /> : (
                <Table className="table-fixed">
                  <TableHeader><TableRow><TableHead>Título</TableHead><TableHead className="w-48">SKU</TableHead><TableHead className="w-28">Status</TableHead><TableHead className="w-24 text-right">Imagens</TableHead></TableRow></TableHeader>
                  <TableBody>{(variantesQ.data ?? []).map((v) => (
                    <TableRow key={v.variant_id}><TableCell><div className="truncate" title={v.title ?? ""}>{v.title ?? "—"}</div></TableCell><TableCell className="font-mono text-xs">{v.sku || "—"}</TableCell><TableCell>{v.status ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{v.n_imagens ?? 0}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={baseAberta} onOpenChange={setBaseAberta}>
        <Card>
          <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left text-sm font-medium">
            Base própria (envio manual)
            <ChevronDown className={cn("h-4 w-4 transition-transform", baseAberta && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent><CardContent className="pt-0"><BaseFotosPropria /></CardContent></CollapsibleContent>
        </Card>
      </Collapsible>

      <GaleriaProduto produto={detalhe} cod={nav.detalhe} onFechar={() => setNav({ detalhe: "" })} />
    </PageShell>
  );
}

function GaleriaProduto({ produto, cod, onFechar }: { produto: MidiaProduto | null; cod: string; onFechar: () => void }) {
  const galQ = useMidiaGaleria(cod || null);
  return (
    <Sheet open={!!cod} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{cod} · {produto?.nome_comercial ?? "—"}</SheetTitle>
          <SheetDescription>{[produto?.colecao, produto?.cor_nome].filter(Boolean).join(" · ") || "Galeria do produto"}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {galQ.error ? <p role="alert" className="text-sm text-destructive">{rawMessage(galQ.error)}</p>
            : galQ.isLoading ? <Skeleton className="h-48 w-full" />
            : (galQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma foto ou vídeo no repositório para este produto.</p>
            : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(galQ.data ?? []).map((m) => {
                const img = m.url_800 ?? m.url_fonte;
                return (
                  <div key={m.id} className="relative overflow-hidden rounded border">
                    {m.tipo === "video" && m.video_status === "copiado" && m.video_url
                      ? <video controls src={m.video_url} poster={img ?? undefined} className="aspect-square w-full bg-black object-contain" />
                      : img ? <img src={img} alt="" loading="lazy" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-muted"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>}
                    <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                      {m.principal && <Badge className="text-[10px]">principal</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{m.vinculo === "variante" ? "variante" : "galeria"}</Badge>
                      {m.tipo === "video" && <Badge variant="secondary" className="text-[10px]"><Video className="mr-1 h-3 w-3" />{m.video_status === "copiado" ? "vídeo" : m.video_status ?? "vídeo"}</Badge>}
                    </div>
                    {m.url_original && (
                      <div className="absolute right-1 top-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="secondary" className="h-7 w-7" aria-label="Ações da foto"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={m.url_original} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir original</a></DropdownMenuItem></DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}
        </div>
        <div className="mt-4 space-y-1 border-t pt-3 text-sm text-muted-foreground">
          <div>Última cópia: {produto?.espelhado_em ? fmtDataHora(produto.espelhado_em) : "—"}</div>
          <div>Fotos no Bling: {produto?.n_fotos_bling ?? "—"}{produto?.bling_lido_em && <> · lido em {fmtDataHora(produto.bling_lido_em)}</>}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
