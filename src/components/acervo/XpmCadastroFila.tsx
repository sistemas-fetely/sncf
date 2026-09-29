import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { FiltroColecao, lerColecoesUrl, gravarColecoesUrl } from "@/components/acervo/BlingCardPainel";
import { AlertTriangle, ChevronDown, Eye, Loader2, Send } from "lucide-react";

const LEVA = 10;

interface LinhaFila {
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  colecao: string | null;
  grupo: string | null;
  fase: string | null;
  chegada_prevista: string | null;
  pedido_importacao: string | null;
  tipo_fila: "vendavel" | "pre_venda" | null;
  pronto: boolean | null;
  bloqueios: string[] | null;
  aviso: string | null;
  categoria_xpm: string | null;
  descricao_xpm: string | null;
  descricao_reduzida_xpm: string | null;
  ean_xpm: string | null;
  peso_kg: number | null;
  largura_m: number | null;
  altura_m: number | null;
  comprimento_m: number | null;
  lastro: number | null;
  camada: number | null;
  embalagem_xpm: string | null;
  ean_sncf: string | null;
  dun: string | null;
}

interface ResultadoSku {
  sku?: string;
  status?: string;
  bloqueios?: unknown;
  erro?: string;
  acao?: string;
  xpm_produto_id?: number;
  xpm_sku_id?: number;
  passo_1_produto?: unknown;
  passo_2_produto_sku?: unknown;
  aviso_corte?: string | null;
  [k: string]: unknown;
}

function normalizarBloqueio(b: string): string {
  const t = b.trim();
  if (t.startsWith('grupo "')) return "Sem categoria no XPM";
  if (t === "sem peso") return "Falta peso";
  if (t === "sem dimensoes") return "Falta medidas";
  return t;
}

function medidasProvisorias(l: { aviso: string | null }): boolean {
  const a = (l.aviso ?? "").toUpperCase();
  return a.includes("PROVISÓRIO") || a.includes("PROVISORIO");
}

function bloqueiosDe(l: LinhaFila): string[] {
  return [...new Set((l.bloqueios ?? []).map(normalizarBloqueio))];
}

function ddmm(d: string | null): string | null {
  if (!d) return null;
  const [, m, dia] = d.slice(0, 10).split("-");
  return m && dia ? `${dia}/${m}` : null;
}

function pesoTxt(v: number | null): string | null {
  if (!v) return null;
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function cm(v: number | null): string | null {
  if (!v) return null;
  return (Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function medidasTxt(l: { largura_m: number | null; altura_m: number | null; comprimento_m: number | null }): string | null {
  const a = cm(l.largura_m), b = cm(l.altura_m), c = cm(l.comprimento_m);
  if (!a || !b || !c) return null;
  return `${a} × ${b} × ${c}`;
}

function listaBloqueios(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  return [typeof v === "string" ? v : JSON.stringify(v)];
}

function levas<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += LEVA) out.push(arr.slice(i, i + LEVA));
  return out;
}

async function chamar(skus: string[], dry_run: boolean): Promise<ResultadoSku[]> {
  const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
    body: { tipo: "cadastrar_api", skus, dry_run },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === "function") {
        const corpo = await ctx.json();
        if (corpo?.erro) msg = corpo.erro;
        else if (corpo?.error) msg = corpo.error;
      }
    } catch { /* mantém a mensagem original */ }
    throw new Error(msg);
  }
  return (data?.resultados ?? []) as ResultadoSku[];
}

type Tom = "erro" | "aviso" | "ok" | "neutro";

export function XpmCadastroFila() {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [filtro, setFiltro] = useState<string>("todos");
  const [previa, setPrevia] = useState<ResultadoSku[] | null>(null);
  const [previaAberta, setPreviaAberta] = useState(false);
  const [resultados, setResultados] = useState<ResultadoSku[] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["xpm-cadastro-fila"],
    queryFn: async (): Promise<LinhaFila[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_cadastro_fila")
        .select("*")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as LinhaFila[];
      return rows.sort((a, b) => {
        const ta = a.tipo_fila === "vendavel" ? 0 : 1;
        const tb = b.tipo_fila === "vendavel" ? 0 : 1;
        if (ta !== tb) return ta - tb;
        if (a.chegada_prevista !== b.chegada_prevista) {
          if (!a.chegada_prevista) return 1;
          if (!b.chegada_prevista) return -1;
          return a.chegada_prevista < b.chegada_prevista ? -1 : 1;
        }
        return (a.cod_cadastro ?? "").localeCompare(b.cod_cadastro ?? "");
      });
    },
  });
  const linhas = q.data ?? [];

  const [colecaoUrl, setColecaoUrl] = useAbaUrl("", undefined, "colecao");
  const colecaoFiltro = useMemo(() => lerColecoesUrl(colecaoUrl), [colecaoUrl]);
  const setColecaoFiltro = (l: string[]) => setColecaoUrl(gravarColecoesUrl(l));

  const colecoes = useMemo(() => {
    const cont = new Map<string, number>();
    for (const l of linhas) {
      const c = (l.colecao ?? "").trim();
      if (!c) continue;
      cont.set(c, (cont.get(c) ?? 0) + 1);
    }
    return [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [linhas]);

  useEffect(() => {
    if (!q.isSuccess) return;
    const validas = colecaoFiltro.filter((f) => colecoes.some(([c]) => c === f));
    if (validas.length !== colecaoFiltro.length) setColecaoUrl(gravarColecoesUrl(validas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, colecoes, colecaoUrl]);

  const porColecao = useMemo(
    () => (colecaoFiltro.length ? linhas.filter((l) => colecaoFiltro.includes((l.colecao ?? "").trim())) : linhas),
    [linhas, colecaoFiltro],
  );

  const cartoes = useMemo(() => {
    const out: { chave: string; rotulo: string; qtd: number; tom: Tom }[] = [
      { chave: "todos", rotulo: "Todos", qtd: porColecao.length, tom: "neutro" },
      { chave: "prontos", rotulo: "Prontos", qtd: porColecao.filter((l) => l.pronto).length, tom: "ok" },
    ];
    const vend = porColecao.filter((l) => l.tipo_fila === "vendavel").length;
    if (vend > 0) out.push({ chave: "vendavel", rotulo: "Vendável fora do WMS", qtd: vend, tom: "aviso" });
    const cont = new Map<string, number>();
    for (const l of porColecao) for (const b of bloqueiosDe(l)) cont.set(b, (cont.get(b) ?? 0) + 1);
    for (const [b, n] of [...cont.entries()].sort((a, b) => b[1] - a[1])) {
      out.push({ chave: `b:${b}`, rotulo: b, qtd: n, tom: "erro" });
    }
    return out;
  }, [porColecao]);

  // Cartão ativo que sumiu → volta para Todos.
  useEffect(() => {
    if (filtro !== "todos" && !cartoes.some((c) => c.chave === filtro)) setFiltro("todos");
  }, [cartoes, filtro]);

  const filtradas = useMemo(() => {
    if (filtro === "todos") return porColecao;
    if (filtro === "prontos") return porColecao.filter((l) => l.pronto);
    if (filtro === "vendavel") return porColecao.filter((l) => l.tipo_fila === "vendavel");
    const b = filtro.slice(2);
    return porColecao.filter((l) => bloqueiosDe(l).includes(b));
  }, [porColecao, filtro]);

  const prontosVisiveis = filtradas.filter((l) => l.pronto && l.sku);
  const selecionadasVisiveis = useMemo(
    () => filtradas.filter((l) => l.pronto && l.sku && selecionados.includes(l.sku)).map((l) => l.sku as string),
    [filtradas, selecionados],
  );
  const todosProntosMarcados =
    prontosVisiveis.length > 0 && prontosVisiveis.every((l) => selecionados.includes(l.sku as string));

  function mudouSelecao(fn: (prev: string[]) => string[]) {
    setSelecionados(fn);
    setPrevia(null);
    setResultados(null);
  }

  const previaSemErro = !!previa && previa.length > 0 && previa.every((p) => !p.erro);
  const previaVai = (previa ?? []).filter((p) => listaBloqueios(p.bloqueios).length === 0 && !p.erro);

  async function fazerPrevia() {
    const grupos = levas(selecionadasVisiveis);
    setCarregandoPrevia(true);
    setResultados(null);
    const acumulado: ResultadoSku[] = [];
    try {
      for (let i = 0; i < grupos.length; i++) {
        setProgresso(`Prévia: leva ${i + 1} de ${grupos.length}`);
        acumulado.push(...(await chamar(grupos[i], true)));
      }
      setPrevia(acumulado);
      setPreviaAberta(true);
    } catch (e) {
      setPrevia(null);
      toast.error(formatError(e));
    } finally {
      setCarregandoPrevia(false);
      setProgresso(null);
    }
  }

  async function cadastrar() {
    const skus = previaVai.map((p) => p.sku).filter((s): s is string => !!s && selecionadasVisiveis.includes(s));
    const grupos = levas(skus);
    setCadastrando(true);
    const acumulado: ResultadoSku[] = [];
    try {
      for (let i = 0; i < grupos.length; i++) {
        setProgresso(`Cadastro: leva ${i + 1} de ${grupos.length}`);
        acumulado.push(...(await chamar(grupos[i], false)));
      }
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setResultados(acumulado);
      setCadastrando(false);
      setProgresso(null);
      setPrevia(null);
      setSelecionados([]);
      const ok = acumulado.filter((r) => r.status === "ok").length;
      const semSku = acumulado.filter((r) => r.status === "PRODUTO_SEM_SKU").length;
      const outros = acumulado.length - ok;
      if (ok > 0) toast.success(`${ok} SKU(s) cadastrado(s) no WMS`);
      if (semSku > 0) toast.error(`${semSku} produto(s) criado(s) sem SKU no XPM — NÃO repita o cadastro`);
      else if (outros > 0) toast.error(`${outros} SKU(s) não cadastrado(s) — veja o resumo`);
      void q.refetch();
    }
  }

  const infoLinha = useMemo(() => {
    const m = new Map<string, LinhaFila>();
    for (const l of linhas) if (l.sku) m.set(l.sku, l);
    return m;
  }, [linhas]);

  const contagem = (s: string) => (resultados ?? []).filter((r) => r.status === s).length;
  const semSkuRes = (resultados ?? []).filter((r) => r.status === "PRODUTO_SEM_SKU");
  const ocupado = carregandoPrevia || cadastrando;

  return (
    <Card>
      <CardHeader className="pb-3 space-y-1">
        <CardTitle className="text-base">Cadastrar no WMS (XPM)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Produtos ativos e de pré-venda que o WMS ainda não conhece. O WMS só recebe o que conhece — cadastre antes de
          a mercadoria chegar.
        </p>
        {!q.isLoading && !q.isError && linhas.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {cartoes.map((c) => {
              const ativo = filtro === c.chave;
              const cor =
                c.tom === "erro" ? "text-destructive" : c.tom === "aviso" ? "text-warning" : c.tom === "ok" ? "text-success" : "";
              return (
                <button
                  key={c.chave}
                  type="button"
                  onClick={() => setFiltro(ativo || c.chave === "todos" ? "todos" : c.chave)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${
                    ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className={`text-xl font-semibold tabular-nums ${cor}`}>{c.qtd}</div>
                  <div className="text-[11px] text-muted-foreground">{c.rotulo}</div>
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar a fila do WMS</AlertTitle>
            <AlertDescription className="text-xs">{formatError(q.error)}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">Coleção</p>
            <FiltroColecao colecoes={colecoes} selecionadas={colecaoFiltro} onChange={setColecaoFiltro} />
          </div>
          <Badge variant="outline">{selecionadasVisiveis.length} selecionado(s)</Badge>
          <BotaoGuardado
            slug="acao.cadastrar_produto_xpm"
            rotuloAcao="Prévia do cadastro no XPM"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={selecionadasVisiveis.length === 0 || ocupado}
            onClick={() => void fazerPrevia()}
          >
            {carregandoPrevia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Prévia
          </BotaoGuardado>
          <BotaoGuardado
            slug="acao.cadastrar_produto_xpm"
            rotuloAcao="Cadastrar produto no XPM"
            size="sm"
            className="gap-2"
            disabled={!previaSemErro || previaVai.length === 0 || ocupado}
            onClick={() => void cadastrar()}
          >
            {cadastrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Cadastrar {previaVai.length} no WMS
          </BotaoGuardado>
          {progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}
          {previa && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPreviaAberta(true)}>
              Ver prévia
            </Button>
          )}
          {!previa && selecionadasVisiveis.length > 0 && !ocupado && (
            <span className="text-xs text-muted-foreground">Veja a prévia antes de cadastrar.</span>
          )}
        </div>

        {resultados && (
          <div className="rounded-md border p-3 space-y-2 text-xs">
            <p className="font-medium">
              Resumo: <span className="text-success">{contagem("ok")} ok</span> · {contagem("bloqueado")} bloqueado(s) ·{" "}
              {contagem("erro_passo1")} erro no passo 1
              {semSkuRes.length > 0 && <span className="text-destructive"> · {semSkuRes.length} PRODUTO_SEM_SKU</span>}
            </p>
            {semSkuRes.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Produto criado no XPM sem SKU — não repita o cadastro</AlertTitle>
                <AlertDescription className="space-y-1 text-xs">
                  {semSkuRes.map((r, i) => (
                    <div key={`${r.sku}-${i}`}>
                      <strong>{r.sku}</strong> — produtoId {String(r.xpm_produto_id ?? "?")}: {r.acao ?? ""}
                      {r.erro ? ` (${r.erro})` : ""}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {resultados
              .filter((r) => r.status !== "ok" && r.status !== "PRODUTO_SEM_SKU")
              .map((r, i) => (
                <div key={`${r.sku}-${i}`} className="text-destructive break-words">
                  <span className="font-mono">{r.sku ?? "—"}</span> ({r.status ?? "—"}):{" "}
                  {r.erro ?? (listaBloqueios(r.bloqueios).join("; ") || "sem detalhe")}
                </div>
              ))}
          </div>
        )}

        {q.isLoading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a fila…
          </div>
        ) : linhas.length === 0 && !q.isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todos os produtos ativos e de pré-venda estão no WMS.
          </p>
        ) : (
          <TooltipProvider>
            <div className="rounded-md border max-h-[calc(100vh-22rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosProntosMarcados}
                        disabled={prontosVisiveis.length === 0}
                        onCheckedChange={() =>
                          mudouSelecao(() => (todosProntosMarcados ? [] : prontosVisiveis.map((l) => l.sku as string)))
                        }
                        aria-label="Selecionar todos os prontos"
                      />
                    </TableHead>
                    <TableHead>Cód.</TableHead>
                    <TableHead>Descrição no XPM</TableHead>
                    <TableHead>Grupo → Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Chegada</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead>Medidas (cm)</TableHead>
                    <TableHead>Lastro/Camada</TableHead>
                    <TableHead>Pendências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((l) => {
                    const bl = bloqueiosDe(l);
                    const peso = pesoTxt(l.peso_kg);
                    const med = medidasTxt(l);
                    return (
                      <TableRow key={l.sku ?? l.cod_cadastro}>
                        <TableCell>
                          <Checkbox
                            checked={!!l.sku && selecionados.includes(l.sku)}
                            disabled={!l.pronto || !l.sku}
                            onCheckedChange={() =>
                              mudouSelecao((prev) =>
                                prev.includes(l.sku as string)
                                  ? prev.filter((s) => s !== l.sku)
                                  : [...prev, l.sku as string],
                              )
                            }
                            aria-label={`Selecionar ${l.sku ?? ""}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {l.cod_cadastro ?? "—"}
                          <div className="text-[11px] text-muted-foreground">{l.sku ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-start gap-1">
                            <span>{l.descricao_xpm ?? "—"}</span>
                            {l.aviso && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">{l.aviso}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {l.descricao_reduzida_xpm && (
                            <div className="text-[11px] text-muted-foreground">{l.descricao_reduzida_xpm}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {l.grupo ?? "—"}
                          <div className="text-[11px]">
                            {l.categoria_xpm ? (
                              <span className="text-muted-foreground">{l.categoria_xpm}</span>
                            ) : (
                              <span className="text-destructive">sem categoria</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {l.tipo_fila === "vendavel" ? (
                            <Badge variant="outline" className="border-warning text-warning text-[10px]">Vendável</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Pré-venda</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ddmm(l.chegada_prevista) ?? "—"}
                          {l.pedido_importacao && (
                            <div className="text-[11px] text-muted-foreground">{l.pedido_importacao}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{l.ean_xpm ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {peso ? `${peso} kg` : <span className="text-destructive">—</span>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {med ?? <span className="text-destructive">—</span>}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {l.lastro ?? "—"} / {l.camada ?? "—"}
                        </TableCell>
                        <TableCell>
                          {bl.length === 0 ? (
                            l.pronto ? (
                              <Badge variant="outline" className="border-success text-success text-[10px]">pronto</Badge>
                            ) : (
                              "—"
                            )
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {bl.map((b) => (
                                <Badge key={b} variant="destructive" className="text-[10px]">{b}</Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>

      <Dialog open={previaAberta} onOpenChange={setPreviaAberta}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia do cadastro no WMS</DialogTitle>
            <DialogDescription>
              Simulação — nada foi enviado. {previaVai.length} vai(ão) · {(previa?.length ?? 0) - previaVai.length}{" "}
              bloqueado(s).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cód.</TableHead>
                  <TableHead>Descrição no XPM</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>EAN</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead>Medidas (cm)</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(previa ?? []).map((p, i) => {
                  const l = p.sku ? infoLinha.get(p.sku) : undefined;
                  const bl = listaBloqueios(p.bloqueios);
                  const peso = l ? pesoTxt(l.peso_kg) : null;
                  const med = l ? medidasTxt(l) : null;
                  return (
                    <TableRow key={`${p.sku}-${i}`}>
                      <TableCell className="font-mono text-xs align-top">
                        {l?.cod_cadastro ?? "—"}
                        <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                      </TableCell>
                      <TableCell className="text-xs align-top">
                        {l?.descricao_xpm ?? "—"}
                        {p.aviso_corte && <div className="text-[11px] text-warning">{p.aviso_corte}</div>}
                        <Collapsible>
                          <CollapsibleTrigger className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3 w-3" /> detalhes técnicos
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1 pt-1">
                            <p className="text-[11px] font-medium text-muted-foreground">passo_1_produto</p>
                            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
                              {JSON.stringify(p.passo_1_produto ?? null, null, 2)}
                            </pre>
                            <p className="text-[11px] font-medium text-muted-foreground">passo_2_produto_sku</p>
                            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
                              {JSON.stringify(p.passo_2_produto_sku ?? null, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </TableCell>
                      <TableCell className="text-xs align-top">{l?.categoria_xpm ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs align-top">{l?.ean_xpm ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs align-top">{peso ? `${peso} kg` : "—"}</TableCell>
                      <TableCell className="text-xs align-top">{med ?? "—"}</TableCell>
                      <TableCell className="text-xs align-top">
                        {p.erro ? (
                          <span className="text-destructive">erro: {p.erro}</span>
                        ) : bl.length > 0 ? (
                          <span className="text-destructive">bloqueado: {bl.join("; ")}</span>
                        ) : (
                          <Badge variant="outline" className="border-success text-success text-[10px]">vai</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
