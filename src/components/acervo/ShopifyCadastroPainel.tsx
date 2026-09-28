import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Eye, Layers, Loader2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

const TETO_SKUS = 10;
const FN = "shopify-cadastrar-produto";
const FN_VAR = "shopify-adicionar-variante";

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
}


interface ResultadoSku {
  sku?: string;
  status?: string;
  erro?: string;
  payload?: unknown;
  produto?: unknown;
  handle?: string;
  shopify_product_id?: string;
  avisos?: unknown;
  [k: string]: unknown;
}

const ROTULO_AVISO: Record<string, string> = {
  sem_descricao: "Sem descrição",
  sem_foto: "Sem foto",
  sem_preco_varejo: "Sem preço",
  sem_ean: "Sem EAN",
  sem_peso: "Sem peso",
  sem_card_bling: "Sem card Bling",
  sem_xpm: "Sem cadastro XPM",
  sem_sigla_colecao: "Coleção sem sigla",
  colecao_variante_sem_codigo: "Coleção com variante sem código no Shopify",
  produto_agrupado_existe: "Produto agrupado já existe — adicionar como variante",
  mais_de_um_produto_agrupado: "Mais de um produto agrupado com o mesmo código",
};

function jsonLegivel(v: unknown): string {

  if (v === null || v === undefined) return "—";
  return JSON.stringify(v, null, 2);
}

function brl(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function chamar(skus: string[], dry_run: boolean): Promise<ResultadoSku[]> {

  const { data, error } = await supabase.functions.invoke(FN, { body: { skus, dry_run } });
  if (error) {
    // Tenta extrair a mensagem real devolvida pela função
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
  if (!data || data.ok === false) throw new Error(data?.erro ?? "Resposta vazia da função.");
  return (data.resultados ?? []) as ResultadoSku[];
}

export function ShopifyCadastroPainel() {
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const [payloadVisto, setPayloadVisto] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [payloads, setPayloads] = useState<ResultadoSku[]>([]);
  const [resultados, setResultados] = useState<ResultadoSku[]>([]);
  const [varAberto, setVarAberto] = useState(false);

  const { permitido, carregando: carregandoPermissao } =
    usePermissaoAcaoOuSuperAdmin("acao.cadastrar_produto_shopify");
  const tituloSemPermissao =
    "Requer a permissão “Cadastrar produto no Shopify” (acao.cadastrar_produto_shopify)";
  const liberado = permitido && !carregandoPermissao;

  const { data: linhas, isLoading, isError, error } = useQuery({
    queryKey: ["shopify-cadastro-fila"],
    queryFn: async (): Promise<LinhaFila[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_shopify_cadastro_fila")
        .select("cod_cadastro, sku, fase, canal_venda, nome_comercial, marca, grupo, preco_varejo, ean, peso_g, tem_descricao, tem_foto, codigo_shopify, colecoes_shopify, avisos, pode_enviar, produto_agrupado, produto_agrupado_id, pode_adicionar_variante")
        .order("cod_cadastro");
      if (error) throw error;
      return (data ?? []) as LinhaFila[];
    },
  });

  const visiveis = linhas ?? [];


  function alternar(sku: string | null) {
    if (!sku) return;
    setPayloadVisto(false);
    setSelecionados((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]));
  }

  const verPayload = useMutation({
    mutationFn: (skus: string[]) => chamar(skus, true),
    onSuccess: (res) => {
      setPayloads(res);
      setPayloadVisto(true);
      setDialogAberto(true);
      toast.success(`Payload gerado para ${res.length} SKU(s)`);
    },
    onError: (e) => toast.error(`Falha ao gerar payload: ${formatError(e)}`),
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Limpa o revalidate agendado quando o painel sai da tela.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const cadastrar = useMutation({
    mutationFn: (skus: string[]) => chamar(skus, false),
    onSuccess: (res) => {
      setResultados(res);
      const ok = res.filter((r) => r.status === "ok").length;
      const problema = res.filter((r) => r.status !== "ok").length;
      if (ok > 0) toast.success(`${ok} SKU(s) cadastrado(s) no Shopify como Rascunho`);
      if (problema > 0) toast.error(`${problema} SKU(s) não cadastrado(s) — veja o resultado abaixo`);
      // Remove da lista exibida (e da seleção) os SKUs criados com sucesso — o webhook
      // do Shopify ainda não gravou o produto no espelho, então a view ainda os devolve.
      const okSkus = new Set(res.filter((r) => r.status === "ok").map((r) => r.sku).filter(Boolean) as string[]);
      if (okSkus.size > 0) {
        qc.setQueryData<LinhaFila[]>(["shopify-cadastro-fila"], (old) =>
          old?.filter((l) => !okSkus.has(l.sku ?? ""))
        );
      }
      setSelecionados([]);
      setPayloadVisto(false);
      void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
      // Revalida depois de um tempo, para a tela bater com o banco quando o webhook chegar.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
      }, 8000);
    },
    onError: (e) => toast.error(`Falha ao cadastrar no Shopify: ${formatError(e)}`),
  });

  const acima = selecionados.length > TETO_SKUS;
  const semSkus = selecionados.length === 0;
  const linhasSel = (linhas ?? []).filter((l) => l.sku && selecionados.includes(l.sku));
  const todosEnviar = linhasSel.length > 0 && linhasSel.every((l) => l.pode_enviar);
  const todosVariante =
    linhasSel.length > 0 &&
    linhasSel.every((l) => l.pode_adicionar_variante) &&
    new Set(linhasSel.map((l) => l.produto_agrupado_id)).size === 1;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a fila do Shopify…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar a fila do Shopify</AlertTitle>
        <AlertDescription className="text-xs">{formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cadastro no Shopify</CardTitle>
          <p className="text-sm text-muted-foreground">
            SKUs ativos, com canal B2C ou B2B+B2C, sem anúncio no Shopify (fonte: Conciliação de Cadastro). Todo produto nasce como Rascunho (Draft) — ativar na vitrine é feito no Shopify Admin.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selecionados.length} selecionado(s)</Badge>

            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={semSkus || acima || !todosEnviar || verPayload.isPending || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => verPayload.mutate(selecionados)}
            >
              {verPayload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Ver payload
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={semSkus || acima || !todosEnviar || !payloadVisto || cadastrar.isPending || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => cadastrar.mutate(selecionados)}
            >
              {cadastrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Cadastrar no Shopify (Draft)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={semSkus || acima || !todosVariante || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => setVarAberto(true)}
            >
              <Layers className="h-3.5 w-3.5" />
              Adicionar como variante ({selecionados.length})
            </Button>
            {acima && (
              <span className="text-xs text-destructive">
                Máximo de {TETO_SKUS} SKUs por chamada. Reduza a seleção.
              </span>
            )}
            {!payloadVisto && !semSkus && !acima && (
              <span className="text-xs text-muted-foreground">Veja o payload antes de cadastrar.</span>
            )}
          </div>

          {visiveis.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum SKU pendente de cadastro no Shopify.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Cód. cadastro</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome comercial</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Código Shopify</TableHead>
                  <TableHead>Coleções</TableHead>
                  <TableHead>Produto na loja</TableHead>
                  <TableHead className="text-right">Preço varejo</TableHead>
                  <TableHead>EAN</TableHead>
                  <TableHead>Avisos</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((l) => (
                  <TableRow key={l.sku ?? l.cod_cadastro ?? ""}>
                    <TableCell>
                      <Checkbox
                        checked={!!l.sku && selecionados.includes(l.sku)}
                        disabled={!(l.pode_enviar || l.pode_adicionar_variante) || !l.sku}
                        title={!(l.pode_enviar || l.pode_adicionar_variante) ? `Bloqueado: ${(l.avisos ?? []).join(", ") || "falta preço de varejo ou nome comercial"}` : undefined}
                        onCheckedChange={() => alternar(l.sku)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.nome_comercial ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.fase ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.canal_venda ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{l.codigo_shopify ?? "—"}</TableCell>
                    <TableCell className="text-xs">{(l.colecoes_shopify ?? []).join(" · ") || "—"}</TableCell>
                    <TableCell className="text-xs">{l.produto_agrupado ?? ""}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{brl(l.preco_varejo)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.ean ?? "—"}</TableCell>


                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(l.avisos ?? []).map((a) => (
                          <Badge key={a} variant="outline" className="text-[10px]">
                            {ROTULO_AVISO[a] ?? a}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resultados.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultado do cadastro</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>Shopify product ID</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultados.map((r, i) => (
                  <TableRow key={`${r.sku}-${i}`}>
                    <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ok" ? "default" : "destructive"}>{r.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.handle ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.shopify_product_id ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive whitespace-pre-wrap break-all">{r.erro ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payload para o Shopify (simulação)</DialogTitle>
            <DialogDescription>Nada foi gravado. Confira antes de cadastrar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {payloads.map((p, i) => (
              <div key={`${p.sku}-${i}`} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{p.sku}</span>
                  <Badge variant={p.status === "dry_run" ? "outline" : "destructive"}>{p.status}</Badge>
                </div>
                {p.status === "dry_run" ? (
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{jsonLegivel(p.payload)}</pre>
                ) : (
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                    {p.status === "ja_existe" ? jsonLegivel(p.produto) : (p.erro ?? jsonLegivel(p))}
                  </pre>
                )}
              </div>
            ))}
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
            qc.setQueryData<LinhaFila[]>(["shopify-cadastro-fila"], (old) =>
              old?.filter((l) => !okSkus.has(l.sku ?? ""))
            );
            setSelecionados((prev) => prev.filter((s) => !okSkus.has(s)));
          }
          void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
          void qc.invalidateQueries({ queryKey: ["shopify-estoque-retido"] });
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
          }, 8000);
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
        .order("retido_em");
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
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum SKU com estoque segurado.</p>
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
