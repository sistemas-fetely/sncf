import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Info, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEstadoTela } from "@/lib/navegacao";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CodProduto } from "@/components/produto/CodProduto";
import { mudarEixos, podeSalvarAgrupamento, titulosAlterados, type ColecaoAgrupamento } from "./agrupamentoShopify";
import { agrupamentoKey, useColecoesAgrupamento, useCamposVariacao, usePreviaAgrupamento, useHistoricoAgrupamento } from "./useAgrupamentoShopify";

function Situacao({ status }: { status: string }) {
  const rotulo = ({ sem_agrupamento: "Sem agrupamento", rascunho: "Rascunho", publicado: "Publicado", encerrado: "Encerrado" } as Record<string, string>)[status] ?? status;
  return <Badge variant="outline" className={status === "rascunho" ? "border-warning/40 bg-warning/10 text-warning" : status === "publicado" ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground"}>{rotulo}</Badge>;
}
function Erro({ error }: { error: unknown }) {
  return <Alert variant="destructive"><AlertDescription>{formatError(error)}</AlertDescription></Alert>;
}
function Carregando() {
  return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p>;
}
function dataHora(v: string | null) { return v ? new Date(v).toLocaleString("pt-BR") : "—"; }

export function ShopifyAgrupamentos() {
  const q = useColecoesAgrupamento();
  const [estado, setEstado] = useEstadoTela({ busca: "", situacao: "todas" }, { prefixo: "ag" });
  const [colecao, setColecao] = useState<ColecaoAgrupamento | null>(null);
  const linhas = useMemo(() => (q.data ?? []).filter((l) =>
    `${l.colecao} ${l.tipo}`.toLocaleLowerCase("pt-BR").includes(estado.busca.toLocaleLowerCase("pt-BR"))
    && (estado.situacao === "todas" || l.status === estado.situacao)), [q.data, estado]);
  return <section className="space-y-4">
    <h2 className="text-lg font-medium">Agrupamentos (variações)</h2>
    <p className="max-w-3xl text-sm text-muted-foreground">O SKU não muda. Aqui você define como os SKUs de uma coleção se agrupam em produtos-pai no Shopify e o que vira variação. Nesta etapa nada é enviado ao Shopify.</p>
    <div className="flex flex-wrap gap-3">
      <Input className="w-full sm:max-w-xs" placeholder="Buscar coleção ou tipo" aria-label="Buscar coleção ou tipo" value={estado.busca} onChange={(e) => setEstado({ busca: e.target.value })} />
      <Select value={estado.situacao} onValueChange={(situacao) => setEstado({ situacao })}><SelectTrigger className="w-48" aria-label="Situação do agrupamento"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="todas">Todas as situações</SelectItem><SelectItem value="sem_agrupamento">Sem agrupamento</SelectItem><SelectItem value="rascunho">Rascunho</SelectItem><SelectItem value="publicado">Publicado</SelectItem>
      </SelectContent></Select>
    </div>
    {q.isLoading ? <Carregando /> : q.isError ? <Erro error={q.error} /> : <div className="rounded-md border bg-card card-shadow overflow-x-auto">
      <Table><TableHeader><TableRow><TableHead>Coleção</TableHead><TableHead>Grupo / Tipo</TableHead><TableHead className="text-right">SKUs</TableHead><TableHead className="text-right">Pais vigentes</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
        <TableBody>{linhas.map((l) => <TableRow key={JSON.stringify([l.colecao, l.tipo])} className="cursor-pointer" tabIndex={0} onClick={() => setColecao(l)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setColecao(l); } }}>
          <TableCell className="font-medium">{l.colecao}</TableCell><TableCell>{l.grupo} / {l.tipo}</TableCell><TableCell className="text-right tabular-nums">{l.skus}</TableCell><TableCell className="text-right tabular-nums">{l.pais_vigentes}</TableCell><TableCell><Situacao status={l.status} /></TableCell>
        </TableRow>)}{linhas.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">{q.data?.length ? "Nenhuma coleção corresponde aos filtros." : "Nenhuma coleção disponível para agrupamento."}</TableCell></TableRow>}</TableBody></Table>
    </div>}
    <Sheet open={!!colecao} onOpenChange={(open) => { if (!open) setColecao(null); }}><SheetContent className="w-full sm:max-w-5xl overflow-y-auto p-4 sm:p-6">
      {colecao && <AgrupamentoDrawer key={JSON.stringify([colecao.colecao, colecao.tipo])} colecao={colecao} />}
    </SheetContent></Sheet>
  </section>;
}

function AgrupamentoDrawer({ colecao }: { colecao: ColecaoAgrupamento }) {
  const qc = useQueryClient();
  const campos = useCamposVariacao();
  const [eixos, setEixos] = useState<string[] | null>(null);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);
  const previa = usePreviaAgrupamento(colecao.colecao, colecao.tipo, eixos);
  const historico = useHistoricoAgrupamento(colecao.colecao);
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin("acao.cadastrar_produto_shopify");
  const p = previa.data;
  const selecionados = eixos ?? p?.eixos ?? [];
  const nomeCampo = (slug: string) => campos.data?.find((c) => c.slug === slug)?.nome ?? slug;
  const salvar = useMutation({ mutationFn: async () => {
    if (!podeSalvarAgrupamento(p, permitido, carregando || previa.isFetching || campos.isFetching || campos.isError) || !p) throw new Error("Agrupamento não pode ser salvo neste estado.");
    const { data, error } = await (supabase.rpc as any)("fn_agrupamento_salvar", {
      p_sistema: "Shopify", p_colecao: colecao.colecao, p_tipo: colecao.tipo,
      p_eixos: p.eixos, p_titulos: titulosAlterados(p.pais, titulos),
    });
    if (error) throw error;
    if (!data || data.pais === undefined || data.skus === undefined) throw new Error("Resposta vazia ao salvar agrupamento.");
    return data as { pais: number; skus: number; encerrados: number };
  }, onSuccess: async (data) => {
    toast.success(`Agrupamento salvo: ${data.pais} pais, ${data.skus} SKUs`);
    setConfirmar(false); setTitulos({});
    await qc.invalidateQueries({ queryKey: agrupamentoKey });
  } });
  const bloqueado = !podeSalvarAgrupamento(p, permitido, carregando || previa.isFetching || campos.isFetching || campos.isError) || salvar.isPending;
  async function gravar() { try { await salvar.mutateAsync(); } catch (e) { toast.error(formatError(e)); } }

  return <div className="space-y-6">
    <SheetHeader className="pr-7"><SheetTitle>Agrupar {colecao.colecao} · {colecao.grupo} {colecao.tipo}</SheetTitle><SheetDescription>O que é variação</SheetDescription></SheetHeader>
    {campos.isLoading ? <Carregando /> : campos.isError ? <Erro error={campos.error} /> : <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{campos.data?.map((c) => <Toggle key={c.slug} variant="outline" pressed={selecionados.includes(c.slug)} disabled={!p || previa.isFetching || salvar.isPending || (selecionados.includes(c.slug) ? selecionados.length <= 1 : selecionados.length >= 3)} onPressedChange={() => { setEixos(mudarEixos(selecionados, c.slug, campos.data ?? [])); setTitulos({}); }}>{c.nome}</Toggle>)}</div>
      {!campos.data?.length && <p className="text-sm text-muted-foreground">Nenhum campo de variação ativo.</p>}
      {eixos === null && p && <Badge variant="secondary">Sugestão do sistema</Badge>}
      {p && <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>{p.promovidos.length ? `Sobe para o pai: ${p.promovidos.map(nomeCampo).join(", ")}` : "Nada sobe para o pai"}</span><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Sobre campos promovidos"><Info className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent className="max-w-xs">Campo que muda entre os SKUs e não é variação separa os produtos-pai.</TooltipContent></Tooltip></div>}
    </div>}
    {previa.isFetching ? <Carregando /> : previa.isError ? <Erro error={previa.error} /> : p && <>
      <div className="grid grid-cols-3 gap-2">{[{ nome: "Produtos-pai", valor: p.total_pais }, { nome: "SKUs", valor: p.total_skus }, { nome: "Problemas", valor: p.problemas }].map((i) => <div key={i.nome} className="rounded-md border bg-card card-shadow p-3"><div className={`text-2xl font-medium tabular-nums ${i.nome === "Problemas" && i.valor > 0 ? "text-destructive" : ""}`}>{i.valor}</div><div className="text-xs text-muted-foreground">{i.nome}</div></div>)}</div>
      {p.problemas > 0 && <Alert variant="destructive"><AlertDescription>Há SKUs com a mesma combinação ou sem valor no eixo. Corrija o cadastro ou marque outro campo como variação.</AlertDescription></Alert>}
      {p.ja_publicado && <Alert><AlertDescription>Esta coleção já tem agrupamento publicado. Reagrupar produto publicado ainda não está disponível.</AlertDescription></Alert>}
      {!p.pais.length && <p className="text-sm text-muted-foreground">Nenhum produto-pai nesta prévia.</p>}
      <Accordion type="multiple" className="space-y-3">{p.pais.map((pai) => <AccordionItem value={pai.chave_txt} key={pai.chave_txt} className="rounded-md border bg-card px-3 card-shadow">
        <div className="flex flex-wrap items-center gap-2 pt-3"><Input className="min-w-0 flex-1" aria-label={`Título de ${pai.titulo}`} value={titulos[pai.chave_txt] ?? pai.titulo} disabled={salvar.isPending} onChange={(e) => setTitulos((atual) => ({ ...atual, [pai.chave_txt]: e.target.value }))} />{pai.problemas > 0 && <Badge variant="destructive">{pai.problemas} problemas</Badge>}</div>
        <AccordionTrigger className="text-sm">{pai.variantes_n} variantes</AccordionTrigger><AccordionContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Nome</TableHead>{p.eixos.map((e) => <TableHead key={e}>{nomeCampo(e)}</TableHead>)}<TableHead>Problema</TableHead></TableRow></TableHeader><TableBody>{pai.variantes.map((v) => <TableRow key={v.sku}><TableCell><CodProduto chave={v.sku} variant="compacto" /></TableCell><TableCell>{v.nome}</TableCell>{p.eixos.map((e) => <TableCell key={e}>{v.valores[e] ?? "—"}</TableCell>)}<TableCell>{v.problema ? <Badge variant="destructive" className="whitespace-normal">{v.problema}</Badge> : "—"}</TableCell></TableRow>)}</TableBody></Table></div></AccordionContent>
      </AccordionItem>)}</Accordion>
    </>}
    <Button disabled={bloqueado} onClick={() => setConfirmar(true)} title={!permitido ? "Requer permissão para cadastrar produto no Shopify" : undefined}><Save className="mr-2 h-4 w-4" />Salvar agrupamento (rascunho)</Button>
    <section className="space-y-3 border-t pt-5"><h3 className="font-medium">Histórico</h3>{historico.isLoading ? <Carregando /> : historico.isError ? <Erro error={historico.error} /> : !historico.data?.length ? <p className="text-sm text-muted-foreground">Nenhum agrupamento registrado para esta coleção.</p> : <div className="overflow-x-auto rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Título</TableHead><TableHead>Variação</TableHead><TableHead>SKUs</TableHead><TableHead>Situação</TableHead><TableHead>De</TableHead><TableHead>Até</TableHead></TableRow></TableHeader><TableBody>{historico.data.map((h) => <TableRow key={h.id} className={h.vigente_ate || h.status === "encerrado" ? "text-muted-foreground" : ""}><TableCell>{h.titulo}</TableCell><TableCell>{h.eixos.map(nomeCampo).join(", ")}</TableCell><TableCell>{h.skus}</TableCell><TableCell><Situacao status={h.status} /></TableCell><TableCell>{dataHora(h.vigente_de)}</TableCell><TableCell>{dataHora(h.vigente_ate)}</TableCell></TableRow>)}</TableBody></Table></div>}</section>
    <AlertDialog open={confirmar} onOpenChange={(open) => { if (!salvar.isPending) setConfirmar(open); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Salvar agrupamento (rascunho)?</AlertDialogTitle><AlertDialogDescription>Isso substitui o agrupamento em rascunho desta coleção, se houver. Nada é enviado ao Shopify.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={salvar.isPending}>Cancelar</AlertDialogCancel><Button disabled={bloqueado} onClick={() => void gravar()}>{salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar agrupamento</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}