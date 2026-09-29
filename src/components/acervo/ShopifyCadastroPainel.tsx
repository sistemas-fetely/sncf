import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { FiltroColecao, gravarColecoesUrl, lerColecoesUrl } from "@/components/acervo/BlingCardPainel";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { AlertTriangle, ChevronDown, Eye, ImageOff, Layers, Loader2, Send } from "lucide-react";

const LEVA = 10;
const FN = "shopify-cadastrar-produto";
const FN_VAR = "shopify-adicionar-variante";
const SLUG_CADASTRO = "acao.cadastrar_produto_shopify";

interface LinhaFila {
  cod_cadastro: string | null;
  sku: string | null;
  fase: string | null;
  canal_venda: string | null;
  nome_comercial: string | null;
  marca: string | null;
  grupo: string | null;
  preco_varejo: number | null;
  ean: string | null;
  peso_g: number | null;
  tem_descricao: boolean | null;
  tem_foto: boolean | null;
  codigo_shopify: string | null;
  colecoes_shopify: string[] | null;
  avisos: string[] | null;
  pode_enviar: boolean | null;
  produto_agrupado: string | null;
  produto_agrupado_id: string | number | null;
  pode_adicionar_variante: boolean | null;
  modo: "ativo" | "rascunho_antecipado" | null;
  chegada_prevista: string | null;
  colecao: string | null;
}

interface FotoPrincipal {
  cod_cadastro: string;
  url: string | null;
}

interface ResultadoSku {
  sku?: string;
  status?: string;
  erro?: string;
  motivo?: string;
  payload?: unknown;
  produto?: unknown;
  handle?: string;
  shopify_product_id?: string;
  avisos?: unknown;
  [k: string]: unknown;
}

const ROTULO_AVISO: Record<string, string> = {
  sem_foto: "Falta foto",
  sem_descricao: "Falta descrição",
  sem_peso: "Falta peso",
  sem_preco_varejo: "Falta preço",
  sem_ean: "Falta EAN",
  sem_card_bling: "Sem card no Bling",
  sem_xpm: "Fora do WMS",
  sem_sigla_colecao: "Coleção sem sigla",
  colecao_variante_sem_codigo: "Variante sem código na coleção",
  produto_agrupado_existe: "Já existe produto agrupado (use Adicionar variante)",
  mais_de_um_produto_agrupado: "Mais de um produto agrupado",
};
const AVISOS_NAO_BLOQUEANTES = new Set(["sem_foto", "sem_descricao", "sem_peso"]);

type Tom = "erro" | "aviso" | "ok" | "neutro";

function jsonLegivel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v, null, 2);
}

function ddmm(d: string | null): string {
  if (!d) return "—";
  const [, mes, dia] = d.slice(0, 10).split("-");
  return mes && dia ? `${dia}/${mes}` : "—";
}

function levas<T>(itens: T[]): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < itens.length; i += LEVA) grupos.push(itens.slice(i, i + LEVA));
  return grupos;
}

function detalheResultado(r: ResultadoSku): string {
  if (r.erro) return r.erro;
  if (r.motivo) return r.motivo;
  if (Array.isArray(r.avisos) && r.avisos.length > 0) {
    return r.avisos.map((a) => (typeof a === "string" ? ROTULO_AVISO[a] ?? a : jsonLegivel(a))).join("; ");
  }
  return "sem detalhe";
}

function statusPrevia(r: ResultadoSku): "vai" | "existe" | "bloqueado" {
  if (r.status === "dry_run" || r.status === "vai_criar") return "vai";
  if (r.status === "ja_existe" || r.status === "já_existe") return "existe";
  return "bloqueado";
}

async function chamar(skus: string[], dry_run: boolean): Promise<ResultadoSku[]> {
  const { data, error } = await supabase.functions.invoke(FN, { body: { skus, dry_run } });
  if (error) {
    let msg = formatError(error);
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corpo = await ctx.json();
        if (corpo?.erro) msg = corpo.erro;
        else if (corpo?.error) msg = corpo.error;
      }
    } catch { /* mantém a mensagem original */ }
    throw new Error(msg);
  }
  if (!data || data.ok === false) throw new Error(formatError(data?.erro ?? "Resposta vazia da função."));
  return (data.resultados ?? []) as ResultadoSku[];
}

export function ShopifyCadastroPainel() {
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [filtro, setFiltro] = useState("todos");
  const [previa, setPrevia] = useState<ResultadoSku[] | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoSku[] | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [varAberto, setVarAberto] = useState(false);

  const { permitido, carregando: carregandoPermissao } = usePermissaoAcaoOuSuperAdmin(SLUG_CADASTRO);
  const tituloSemPermissao = "Requer a permissão “Cadastrar produto no Shopify” (acao.cadastrar_produto_shopify)";
  const liberado = permitido && !carregandoPermissao;

  const q = useQuery({
    queryKey: ["shopify-cadastro-fila"],
    queryFn: async (): Promise<LinhaFila[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_shopify_cadastro_fila")
        .select("cod_cadastro, sku, fase, canal_venda, nome_comercial, marca, grupo, preco_varejo, ean, peso_g, tem_descricao, tem_foto, codigo_shopify, colecoes_shopify, avisos, pode_enviar, produto_agrupado, produto_agrupado_id, pode_adicionar_variante, modo, chegada_prevista, colecao")
        .order("chegada_prevista", { ascending: true, nullsFirst: false })
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaFila[];
    },
  });
  const linhas = q.data ?? [];

  const codigos = useMemo(
    () => [...new Set(linhas.map((l) => l.cod_cadastro).filter((c): c is string => !!c))],
    [linhas],
  );
  const qFotos = useQuery({
    queryKey: ["shopify-cadastro-fotos-principais", codigos],
    enabled: codigos.length > 0,
    queryFn: async (): Promise<FotoPrincipal[]> => {
      const { data, error } = await (supabase as any)
        .from("produto_foto")
        .select("cod_cadastro, url")
        .eq("principal", true)
        .in("cod_cadastro", codigos);
      if (error) throw error;
      return (data ?? []) as FotoPrincipal[];
    },
  });
  const fotos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const foto of qFotos.data ?? []) if (foto.url) mapa.set(foto.cod_cadastro, foto.url);
    return mapa;
  }, [qFotos.data]);

  const [colecaoUrl, setColecaoUrl] = useAbaUrl("", undefined, "colecao");
  const colecaoFiltro = useMemo(() => lerColecoesUrl(colecaoUrl), [colecaoUrl]);
  const setColecaoFiltro = (next: string[]) => setColecaoUrl(gravarColecoesUrl(next));
  const colecoes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const linha of linhas) {
      const colecao = (linha.colecao ?? "").trim();
      if (colecao) contagem.set(colecao, (contagem.get(colecao) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [linhas]);

  useEffect(() => {
    if (!q.isSuccess) return;
    const validas = colecaoFiltro.filter((f) => colecoes.some(([c]) => c === f));
    if (validas.length !== colecaoFiltro.length) setColecaoUrl(gravarColecoesUrl(validas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, colecoes, colecaoUrl]);

  const porColecao = useMemo(
    () => colecaoFiltro.length ? linhas.filter((l) => colecaoFiltro.includes((l.colecao ?? "").trim())) : linhas,
    [linhas, colecaoFiltro],
  );
  const cartoes = useMemo(() => {
    const itens: { chave: string; rotulo: string; qtd: number; tom: Tom }[] = [
      { chave: "todos", rotulo: "Todos", qtd: porColecao.length, tom: "neutro" },
      { chave: "prontos", rotulo: "Prontos", qtd: porColecao.filter((l) => l.pode_enviar).length, tom: "ok" },
      { chave: "rascunho", rotulo: "Rascunho antecipado", qtd: porColecao.filter((l) => l.modo === "rascunho_antecipado").length, tom: "neutro" },
    ];
    const contagem = new Map<string, number>();
    for (const linha of porColecao) {
      for (const aviso of linha.avisos ?? []) contagem.set(aviso, (contagem.get(aviso) ?? 0) + 1);
    }
    for (const [codigo, qtd] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) {
      itens.push({
        chave: `aviso:${codigo}`,
        rotulo: ROTULO_AVISO[codigo] ?? codigo,
        qtd,
        tom: AVISOS_NAO_BLOQUEANTES.has(codigo) ? "aviso" : "erro",
      });
    }
    return itens;
  }, [porColecao]);

  useEffect(() => {
    if (filtro !== "todos" && !cartoes.some((c) => c.chave === filtro)) setFiltro("todos");
  }, [cartoes, filtro]);

  const filtradas = useMemo(() => {
    if (filtro === "prontos") return porColecao.filter((l) => l.pode_enviar);
    if (filtro === "rascunho") return porColecao.filter((l) => l.modo === "rascunho_antecipado");
    if (filtro.startsWith("aviso:")) {
      const aviso = filtro.slice(6);
      return porColecao.filter((l) => (l.avisos ?? []).includes(aviso));
    }
    return porColecao;
  }, [filtro, porColecao]);

  const prontosVisiveis = filtradas.filter((l) => l.pode_enviar && l.sku);
  const selecionadasVisiveis = useMemo(
    () => filtradas.filter((l) => l.pode_enviar && l.sku && selecionados.includes(l.sku)).map((l) => l.sku as string),
    [filtradas, selecionados],
  );
  const todosProntosMarcados = prontosVisiveis.length > 0 && prontosVisiveis.every((l) => selecionados.includes(l.sku as string));
  const linhasSel = linhas.filter((l) => l.sku && selecionados.includes(l.sku));
  const todosVariante = linhasSel.length > 0 && linhasSel.every((l) => l.pode_adicionar_variante) && new Set(linhasSel.map((l) => l.produto_agrupado_id)).size === 1;

  function mudouSelecao(next: string[] | ((prev: string[]) => string[])) {
    setSelecionados(next);
    setPrevia(null);
    setResultados(null);
  }

  async function fazerPrevia() {
    const grupos = levas(selecionadasVisiveis);
    setCarregandoPrevia(true);
    setResultados(null);
    const acumulado: ResultadoSku[] = [];
    try {
      for (let i = 0; i < grupos.length; i++) {
        setProgresso(`Prévia: leva ${i + 1} de ${grupos.length}`);
        acumulado.push(...await chamar(grupos[i], true));
      }
      setPrevia(acumulado);
      setDialogAberto(true);
      toast.success(`Prévia: ${acumulado.filter((r) => statusPrevia(r) === "vai").length} a criar`);
    } catch (e) {
      setPrevia(null);
      toast.error(`Falha ao gerar prévia: ${formatError(e)}`);
    } finally {
      setCarregandoPrevia(false);
      setProgresso(null);
    }
  }

  const previaVai = (previa ?? []).filter((r) => statusPrevia(r) === "vai" && r.sku && selecionadasVisiveis.includes(r.sku));

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function cadastrar() {
    const skus = previaVai.map((r) => r.sku).filter((sku): sku is string => !!sku);
    const grupos = levas(skus);
    const acumulado: ResultadoSku[] = [];
    setCadastrando(true);
    try {
      for (let i = 0; i < grupos.length; i++) {
        setProgresso(`Cadastro: leva ${i + 1} de ${grupos.length}`);
        acumulado.push(...await chamar(grupos[i], false));
      }
      setResultados(acumulado);
      const criados = acumulado.filter((r) => r.status === "ok");
      const problemas = acumulado.length - criados.length;
      if (criados.length > 0) toast.success(`${criados.length} rascunho(s) criado(s) no Shopify`);
      if (problemas > 0) toast.error(`${problemas} item(ns) não criado(s) — veja o resumo`);
      const okSkus = new Set(criados.map((r) => r.sku).filter((sku): sku is string => !!sku));
      if (okSkus.size > 0) {
        qc.setQueryData<LinhaFila[]>(["shopify-cadastro-fila"], (atuais) => atuais?.filter((l) => !okSkus.has(l.sku ?? "")));
      }
      setSelecionados([]);
      setPrevia(null);
      void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] }), 8000);
    } catch (e) {
      setResultados(acumulado);
      toast.error(`Falha ao cadastrar no Shopify: ${formatError(e)}`);
    } finally {
      setCadastrando(false);
      setProgresso(null);
    }
  }

  const infoLinha = useMemo(() => {
    const mapa = new Map<string, LinhaFila>();
    for (const linha of linhas) if (linha.sku) mapa.set(linha.sku, linha);
    return mapa;
  }, [linhas]);
  const resumo = useMemo(() => {
    const res = resultados ?? [];
    return {
      criados: res.filter((r) => r.status === "ok").length,
      existentes: res.filter((r) => r.status === "ja_existe" || r.status === "já_existe").length,
      bloqueados: res.filter((r) => r.status === "bloqueado" || r.status === "recusado").length,
      erros: res.filter((r) => !["ok", "ja_existe", "já_existe", "bloqueado", "recusado"].includes(r.status ?? "")).length,
    };
  }, [resultados]);
  const ocupado = carregandoPrevia || cadastrando;

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a fila do Shopify…
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar a fila do Shopify</AlertTitle>
        <AlertDescription className="text-xs">{formatError(q.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 space-y-1">
          <CardTitle className="text-base">Cadastrar no Shopify</CardTitle>
          <p className="text-sm text-muted-foreground">
            Produtos ativos sem anúncio e pré-vendas com chegada em até 30 dias. Todo anúncio nasce em <strong>Rascunho</strong> (invisível na loja) com estoque 0 — publique no Shopify quando o produto estiver ativo e com foto e descrição.
          </p>
          {linhas.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {cartoes.map((cartao) => {
                const ativo = filtro === cartao.chave;
                const cor = cartao.tom === "erro" ? "text-destructive" : cartao.tom === "aviso" ? "text-warning" : cartao.tom === "ok" ? "text-success" : "";
                return (
                  <button
                    key={cartao.chave}
                    type="button"
                    onClick={() => setFiltro(ativo || cartao.chave === "todos" ? "todos" : cartao.chave)}
                    className={`rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 ${ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className={`text-xl font-semibold tabular-nums ${cor}`}>{cartao.qtd}</div>
                    <div className="text-[11px] text-muted-foreground">{cartao.rotulo}</div>
                  </button>
                );
              })}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {qFotos.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar as fotos</AlertTitle>
              <AlertDescription className="text-xs">{formatError(qFotos.error)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium">Coleção</p>
              <FiltroColecao colecoes={colecoes} selecionadas={colecaoFiltro} onChange={setColecaoFiltro} />
            </div>
            <Badge variant="outline">{selecionadasVisiveis.length} selecionado(s)</Badge>
            <BotaoGuardado
              slug={SLUG_CADASTRO}
              rotuloAcao="Prévia do cadastro no Shopify"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={selecionadasVisiveis.length === 0 || ocupado}
              onClick={() => void fazerPrevia()}
            >
              {carregandoPrevia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Prévia
            </BotaoGuardado>
            <BotaoGuardado
              slug={SLUG_CADASTRO}
              rotuloAcao="Cadastrar produto no Shopify"
              size="sm"
              className="gap-2"
              disabled={previaVai.length === 0 || ocupado}
              onClick={() => void cadastrar()}
            >
              {cadastrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Criar {previaVai.length} {previaVai.length === 1 ? "rascunho" : "rascunhos"} no Shopify
            </BotaoGuardado>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={selecionados.length === 0 || !todosVariante || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => setVarAberto(true)}
            >
              <Layers className="h-3.5 w-3.5" />
              Adicionar como variante ({selecionados.length})
            </Button>
            {progresso && <span className="text-xs text-muted-foreground">{progresso}</span>}
            {previa && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setDialogAberto(true)}>
                Ver prévia
              </Button>
            )}
            {!previa && selecionadasVisiveis.length > 0 && !ocupado && (
              <span className="text-xs text-muted-foreground">Veja a prévia antes de criar.</span>
            )}
          </div>

          {resultados && (
            <div className="rounded-md border p-3 space-y-2 text-xs">
              <p className="font-medium">
                Resultado: <span className="text-success">{resumo.criados} criado(s)</span> · {resumo.existentes} já existia(m) · {resumo.bloqueados} bloqueado(s) · <span className={resumo.erros ? "text-destructive" : ""}>{resumo.erros} erro(s)</span>
              </p>
              {resultados.filter((r) => r.status !== "ok").map((r, i) => (
                <div key={`${r.sku}-${i}`} className={r.status === "ja_existe" ? "text-muted-foreground" : "text-destructive"}>
                  <span className="font-mono">{r.sku ?? "—"}</span> ({r.status ?? "erro"}): {detalheResultado(r)}
                </div>
              ))}
            </div>
          )}

          {filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {linhas.length === 0 ? "Nenhum produto pendente de cadastro no Shopify." : "Nenhum produto corresponde aos filtros."}
            </p>
          ) : (
            <div className="rounded-md border max-h-[calc(100vh-22rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={todosProntosMarcados}
                        disabled={prontosVisiveis.length === 0}
                        onCheckedChange={() => mudouSelecao(todosProntosMarcados ? [] : prontosVisiveis.map((l) => l.sku as string))}
                        aria-label="Selecionar todos os prontos"
                      />
                    </TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead>Cód.</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Chegada</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>EAN</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead>Coleções no Shopify</TableHead>
                    <TableHead>Pendências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((linha) => {
                    const urlFoto = linha.cod_cadastro ? fotos.get(linha.cod_cadastro) : undefined;
                    return (
                      <TableRow key={linha.sku ?? linha.cod_cadastro ?? ""}>
                        <TableCell>
                          <Checkbox
                            checked={!!linha.sku && selecionados.includes(linha.sku)}
                            disabled={!linha.pode_enviar || !linha.sku}
                            onCheckedChange={() => mudouSelecao((prev) => prev.includes(linha.sku as string) ? prev.filter((s) => s !== linha.sku) : [...prev, linha.sku as string])}
                            aria-label={`Selecionar ${linha.sku ?? linha.cod_cadastro ?? "produto"}`}
                          />
                        </TableCell>
                        <TableCell>
                          {urlFoto ? (
                            <img src={urlFoto} alt="" className="h-12 w-12 rounded-sm border object-cover" />
                          ) : (
                            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-sm border bg-muted text-[9px] text-muted-foreground">
                              <ImageOff className="h-4 w-4" /> sem foto
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {linha.cod_cadastro ?? "—"}
                          <div className="text-[11px] text-muted-foreground">{linha.sku ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{linha.nome_comercial ?? "—"}</TableCell>
                        <TableCell className="text-xs">{linha.grupo ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {linha.modo === "rascunho_antecipado" ? "Rascunho antecipado" : "Ativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{ddmm(linha.chegada_prevista)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatBRL(linha.preco_varejo)}</TableCell>
                        <TableCell className="font-mono text-xs">{linha.ean ?? "—"}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {linha.peso_g ? `${Number(linha.peso_g).toLocaleString("pt-BR")} g` : <span className="text-warning">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(linha.colecoes_shopify ?? []).length > 0 ? (linha.colecoes_shopify ?? []).map((colecao) => (
                              <Badge key={colecao} variant="secondary" className="text-[10px]">{colecao}</Badge>
                            )) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(linha.avisos ?? []).length === 0 ? (
                            linha.pode_enviar ? <Badge variant="outline" className="border-success text-success text-[10px]">pronto</Badge> : "—"
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(linha.avisos ?? []).map((aviso) => (
                                <Badge
                                  key={aviso}
                                  variant={AVISOS_NAO_BLOQUEANTES.has(aviso) ? "outline" : "destructive"}
                                  className={AVISOS_NAO_BLOQUEANTES.has(aviso) ? "border-warning text-warning text-[10px]" : "text-[10px]"}
                                >
                                  {ROTULO_AVISO[aviso] ?? aviso}
                                </Badge>
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
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia do cadastro no Shopify</DialogTitle>
            <DialogDescription>
              Simulação — nada foi gravado. {previaVai.length} vai(ão) criar · {(previa ?? []).filter((r) => statusPrevia(r) === "existe").length} já existe(m) · {(previa ?? []).filter((r) => statusPrevia(r) === "bloqueado").length} bloqueado(s).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cód.</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Coleções</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(previa ?? []).map((item, i) => {
                  const linha = item.sku ? infoLinha.get(item.sku) : undefined;
                  const situacao = statusPrevia(item);
                  return (
                    <TableRow key={`${item.sku}-${i}`}>
                      <TableCell className="font-mono text-xs align-top">
                        {linha?.cod_cadastro ?? "—"}
                        <div className="text-[11px] text-muted-foreground">{item.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs align-top">
                        {linha?.nome_comercial ?? "—"}
                        <Collapsible>
                          <CollapsibleTrigger className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                            <ChevronDown className="h-3 w-3" /> detalhes técnicos
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{jsonLegivel(item.payload ?? item)}</pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </TableCell>
                      <TableCell className="text-xs align-top">{(linha?.colecoes_shopify ?? []).join(" · ") || "—"}</TableCell>
                      <TableCell className="text-xs align-top">
                        {situacao === "vai" ? (
                          <Badge variant="outline" className="border-success text-success text-[10px]">vai criar</Badge>
                        ) : situacao === "existe" ? (
                          <Badge variant="outline" className="text-[10px]">já existe</Badge>
                        ) : (
                          <span className="text-destructive">bloqueado: {detalheResultado(item)}</span>
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

      <VarianteDialog
        aberto={varAberto}
        onOpenChange={setVarAberto}
        skus={selecionados}
        liberado={liberado}
        onConcluido={(okSkus) => {
          if (okSkus.size > 0) {
            qc.setQueryData<LinhaFila[]>(["shopify-cadastro-fila"], (atuais) => atuais?.filter((l) => !okSkus.has(l.sku ?? "")));
            setSelecionados((prev) => prev.filter((sku) => !okSkus.has(sku)));
          }
          void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
          void qc.invalidateQueries({ queryKey: ["shopify-estoque-retido"] });
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] }), 8000);
        }}
      />

      <EstoqueRetidoCard liberado={liberado} tituloSemPermissao={tituloSemPermissao} />
    </div>
  );
}

// ---------------------------------------------------------------------------

async function invocar(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke(FN_VAR, { body });
  if (error) {
    let msg = formatError(error);
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.erro) msg = b.erro;
      }
    } catch { /* mantém msg */ }
    throw new Error(msg);
  }
  if (!data || data.ok === false) throw new Error(formatError(data?.erro ?? "Resposta vazia da função."));
  return data as Record<string, unknown>;
}

interface OpcaoProduto { name: string; values: string[] }
interface Sugestao {
  sku: string;
  irma_sku?: string;
  erro?: string;
  opcoes: { nome: string; valor: string; origem: string }[];
}

function VarianteDialog({
  aberto, onOpenChange, skus, liberado, onConcluido,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  skus: string[];
  liberado: boolean;
  onConcluido: (okSkus: Set<string>) => void;
}) {
  const [produto, setProduto] = useState<{ titulo?: string; status?: string; opcoes: OpcaoProduto[] } | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({});
  const [reter, setReter] = useState(true);
  const [previa, setPrevia] = useState<ResultadoSku[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoSku[] | null>(null);
  const [erroSugerir, setErroSugerir] = useState<string | null>(null);

  const sugerir = useMutation({
    mutationFn: () => invocar({ modo: "sugerir", itens: skus.map((sku) => ({ sku })) }),
    onSuccess: (d) => {
      const p = d.produto as { titulo?: string; status?: string; opcoes?: OpcaoProduto[] };
      const s = (d.sugestoes ?? []) as Sugestao[];
      setProduto({ titulo: p?.titulo, status: p?.status, opcoes: p?.opcoes ?? [] });
      setSugestoes(s);
      const v: Record<string, Record<string, string>> = {};
      for (const x of s) {
        v[x.sku] = {};
        for (const o of x.opcoes ?? []) v[x.sku][o.nome] = o.valor ?? "";
      }
      setValores(v);
    },
    onError: (e) => {
      setErroSugerir(formatError(e));
      toast.error(`Falha ao sugerir opções: ${formatError(e)}`);
    },
  });

  useEffect(() => {
    if (aberto) {
      setProduto(null); setSugestoes([]); setValores({}); setReter(true);
      setPrevia(null); setResultado(null); setErroSugerir(null);
      sugerir.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const itens = () =>
    skus.map((sku) => ({
      sku,
      opcoes: (produto?.opcoes ?? []).map((o) => ({ nome: o.name, valor: valores[sku]?.[o.name] ?? "" })),
    }));

  const verPrevia = useMutation({
    mutationFn: () => invocar({ modo: "adicionar", dry_run: true, reter, itens: itens() }),
    onSuccess: (d) => setPrevia((d.resultados ?? []) as ResultadoSku[]),
    onError: (e) => toast.error(`Falha ao gerar payload: ${formatError(e)}`),
  });

  const adicionar = useMutation({
    mutationFn: () => invocar({ modo: "adicionar", dry_run: false, reter, itens: itens() }),
    onSuccess: (d) => {
      const res = (d.resultados ?? []) as ResultadoSku[];
      setResultado(res);
      setPrevia(null);
      const ok = res.filter((r) => r.status === "ok");
      const problema = res.length - ok.length;
      if (ok.length > 0) toast.success(`${ok.length} variante(s) adicionada(s) no Shopify`);
      if (problema > 0) toast.error(`${problema} SKU(s) não adicionado(s) — veja o resultado`);
      onConcluido(new Set(ok.map((r) => r.sku).filter(Boolean) as string[]));
    },
    onError: (e) => toast.error(`Falha ao adicionar variantes: ${formatError(e)}`),
  });

  function mudar(sku: string, nome: string, valor: string) {
    setPrevia(null);
    setValores((prev) => ({ ...prev, [sku]: { ...(prev[sku] ?? {}), [nome]: valor } }));
  }

  const previaOk = !!previa && previa.some((p) => p.status === "dry_run");
  const opcoes = produto?.opcoes ?? [];

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar como variante</DialogTitle>
          <DialogDescription>
            {produto ? (
              <span className="flex items-center gap-2">
                {produto.titulo ?? "—"} <Badge variant="outline">{produto.status ?? "—"}</Badge>
              </span>
            ) : "Lendo o produto na loja…"}
          </DialogDescription>
        </DialogHeader>

        {sugerir.isPending && (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando sugestões…
          </div>
        )}
        {erroSugerir && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{erroSugerir}</AlertDescription>
          </Alert>
        )}

        {produto && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Irmã</TableHead>
                  {opcoes.map((o) => <TableHead key={o.name}>{o.name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sugestoes.map((s) => (
                  <TableRow key={s.sku}>
                    <TableCell className="font-mono text-xs align-top">
                      {s.sku}
                      {s.erro && <p className="mt-1 text-xs font-medium text-destructive whitespace-normal">{s.erro}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs align-top">{s.irma_sku ?? "—"}</TableCell>
                    {opcoes.map((o) => {
                      const v = valores[s.sku]?.[o.name] ?? "";
                      const novo = !!v && !o.values.some((x) => x.trim().toLowerCase() === v.trim().toLowerCase());
                      const origem = s.opcoes?.find((x) => x.nome === o.name)?.origem;
                      const listId = `dl-${o.name}`.replace(/\s+/g, "-");
                      return (
                        <TableCell key={o.name} className="align-top min-w-[160px]">
                          <Input value={v} list={listId} className="h-8 text-xs" onChange={(e) => mudar(s.sku, o.name, e.target.value)} />
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {novo && <Badge variant="outline" className="text-[10px]">valor novo</Badge>}
                            {origem && <span className="text-[10px] text-muted-foreground">{origem}</span>}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {opcoes.map((o) => (
              <datalist key={o.name} id={`dl-${o.name}`.replace(/\s+/g, "-")}>
                {o.values.map((x) => <option key={x} value={x} />)}
              </datalist>
            ))}

            <div className="flex items-start gap-2">
              <Checkbox id="reter-estoque" checked={reter} onCheckedChange={(c) => { setReter(c === true); setPrevia(null); }} />
              <div>
                <label htmlFor="reter-estoque" className="text-sm font-medium">Segurar estoque até liberar</label>
                <p className="text-xs text-muted-foreground">
                  Produto ativo na loja: a variante aparece na vitrine ao ser adicionada. Com estoque segurado, ela fica esgotada até você liberar.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-2" disabled={!liberado || verPrevia.isPending || adicionar.isPending} onClick={() => verPrevia.mutate()}>
                {verPrevia.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Ver payload
              </Button>
              <Button size="sm" className="gap-2" disabled={!liberado || !previaOk || adicionar.isPending} onClick={() => adicionar.mutate()}>
                {adicionar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Adicionar variantes
              </Button>
            </div>

            {previa && (
              <div className="space-y-2">
                {previa.map((p, i) => (
                  <div key={`${p.sku}-${i}`} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{p.sku}</span>
                      <Badge variant={p.status === "dry_run" ? "outline" : "destructive"}>{p.status}</Badge>
                    </div>
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                      {p.status === "dry_run" ? jsonLegivel(p.payload) : p.status === "ja_existe" ? jsonLegivel(p.produto) : (p.erro ?? jsonLegivel(p))}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {resultado && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Retido</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.map((r, i) => (
                    <TableRow key={`${r.sku}-${i}`}>
                      <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                      <TableCell><Badge variant={r.status === "ok" ? "default" : "destructive"}>{r.status ?? "—"}</Badge></TableCell>
                      <TableCell className="text-xs">{(r.titulo as string) ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.status === "ok" ? (r.retido ? "sim" : "não") : "—"}</TableCell>
                      <TableCell className="text-xs text-destructive whitespace-pre-wrap break-all">{r.erro ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LinhaRetida {
  id: string;
  sku: string;
  nome_comercial: string | null;
  motivo: string | null;
  retido_em: string | null;
  estoque_sncf: number | null;
}

function EstoqueRetidoCard({ liberado, tituloSemPermissao }: { liberado: boolean; tituloSemPermissao: string }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string[]>([]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["shopify-estoque-retido"],
    queryFn: async (): Promise<LinhaRetida[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_shopify_estoque_retencao_aberta")
        .select("id, sku, nome_comercial, motivo, retido_em, estoque_sncf")
        .order("retido_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinhaRetida[];
    },
  });

  const liberar = useMutation({
    mutationFn: async (p_skus: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_shopify_estoque_liberar", { p_skus });
      if (error) throw error;
      return data;
    },
    onSuccess: (d, skus) => {
      const n = typeof d === "number" ? d : skus.length;
      toast.success(`${n} SKU(s) com estoque liberado`);
      setSel([]);
      void qc.invalidateQueries({ queryKey: ["shopify-estoque-retido"] });
    },
    onError: (e) => toast.error(`Falha ao liberar estoque: ${formatError(e)}`),
  });

  const linhas = data ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Estoque retido</CardTitle>
        <p className="text-sm text-muted-foreground">
          O push de estoque ignora estes SKUs. Ao liberar, o estoque real sobe para o Shopify em até 15 min.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          size="sm"
          disabled={sel.length === 0 || liberar.isPending || !liberado}
          title={!liberado ? tituloSemPermissao : undefined}
          onClick={() => liberar.mutate(sel)}
          className="gap-2"
        >
          {liberar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Liberar estoque ({sel.length})
        </Button>
        {isLoading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">{formatError(error)}</AlertDescription>
          </Alert>
        ) : linhas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum estoque retido.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Retido em</TableHead>
                <TableHead className="text-right">Estoque SNCF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Checkbox
                      checked={sel.includes(l.sku)}
                      onCheckedChange={() => setSel((p) => (p.includes(l.sku) ? p.filter((s) => s !== l.sku) : [...p, l.sku]))}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                  <TableCell className="text-sm">{l.nome_comercial ?? "—"}</TableCell>
                  <TableCell className="text-xs">{l.motivo ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {l.retido_em ? new Date(l.retido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{l.estoque_sncf ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
