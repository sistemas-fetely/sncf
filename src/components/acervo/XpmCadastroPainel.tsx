import { useMemo, useState } from "react";
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
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Eye, Loader2, Send, Wrench } from "lucide-react";

const TETO_SKUS = 10;

interface LinhaDivergencia {
  cod_cadastro: string | null;
  sku: string | null;
  fase: string | null;
  nome_comercial: string | null;
  grupo: string | null;
  xpm_produto_id: number | null;
  codigo_xpm: string | null;
  classe: string | null;
  ncm_sncf: string | null;
  ncm_xpm: string | null;
  ean_sncf: string | null;
  ean_xpm: string | null;
  peso_kg_sncf: number | null;
  peso_kg_xpm: number | null;
  categoria_xpm: string | null;
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

function jsonLegivel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v, null, 2);
}

function num(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

export function XpmCadastroPainel() {
  const qc = useQueryClient();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [payloadVisto, setPayloadVisto] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [payloads, setPayloads] = useState<ResultadoSku[]>([]);
  const [resultados, setResultados] = useState<ResultadoSku[]>([]);

  const { data: linhas, isLoading, isError, error } = useQuery({
    queryKey: ["xpm-cadastro-divergencia"],
    queryFn: async (): Promise<LinhaDivergencia[]> => {
      const { data, error } = await supabase
        .from("vw_xpm_cadastro_divergencia")
        .select("cod_cadastro, sku, fase, nome_comercial, grupo, xpm_produto_id, codigo_xpm, classe, ncm_sncf, ncm_xpm, ean_sncf, ean_xpm, peso_kg_sncf, peso_kg_xpm, categoria_xpm")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaDivergencia[];
    },
  });

  const vendaveisFora = useMemo(
    () => (linhas ?? []).filter((l) => l.classe === "FALTA_NO_XPM_E_VENDAVEL"),
    [linhas],
  );
  const saude = useMemo(
    () => (linhas ?? []).filter((l) => l.classe === "PESO_DIVERGE" || l.classe === "NCM_DIVERGE"),
    [linhas],
  );
  const preVenda = useMemo(
    () => (linhas ?? []).filter((l) => l.classe === "FALTA_NO_XPM"),
    [linhas],
  );

  function alternar(sku: string | null) {
    if (!sku) return;
    setPayloadVisto(false);
    setSelecionados((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]));
  }

  const verPayload = useMutation({
    mutationFn: async (skus: string[]) => {
      const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
        body: { tipo: "cadastrar_api", skus, dry_run: true },
      });
      if (error) throw error;
      return (data?.resultados ?? []) as ResultadoSku[];
    },
    onSuccess: (res) => {
      setPayloads(res);
      setPayloadVisto(true);
      setDialogAberto(true);
      toast.success(`Payload gerado para ${res.length} SKU(s)`);
    },
    onError: (e) => toast.error(`Falha ao gerar payload: ${formatError(e)}`),
  });

  const cadastrar = useMutation({
    mutationFn: async (skus: string[]) => {
      const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
        body: { tipo: "cadastrar_api", skus, dry_run: false },
      });
      if (error) throw error;
      return (data?.resultados ?? []) as ResultadoSku[];
    },
    onSuccess: (res) => {
      setResultados(res);
      const ok = res.filter((r) => r.status === "ok").length;
      const problema = res.filter((r) => r.status && r.status !== "ok");
      if (ok > 0) toast.success(`${ok} SKU(s) cadastrado(s) no XPM`);
      if (problema.length > 0) toast.error(`${problema.length} SKU(s) não cadastrado(s) — veja o resultado abaixo`);
      setSelecionados([]);
      setPayloadVisto(false);
      void qc.invalidateQueries({ queryKey: ["xpm-cadastro-divergencia"] });
    },
    onError: (e) => toast.error(`Falha ao cadastrar no XPM: ${formatError(e)}`),
  });

  const corrigirCategoria = useMutation({
    mutationFn: async (sku: string) => {
      const { data, error } = await supabase.functions.invoke("gerar-planilha-xpm", {
        body: { tipo: "corrigir_categoria_xpm", skus: [sku] },
      });
      if (error) throw error;
      return (data?.resultados ?? []) as ResultadoSku[];
    },
    onSuccess: (res) => {
      const r = res[0];
      if (r && r.status && r.status !== "ok") {
        toast.error(`Categoria não corrigida (${r.status}): ${r.erro ?? "sem detalhe"}`);
      } else {
        toast.success("Categoria corrigida no XPM");
      }
      void qc.invalidateQueries({ queryKey: ["xpm-cadastro-divergencia"] });
    },
    onError: (e) => toast.error(`Falha ao corrigir categoria: ${formatError(e)}`),
  });

  const acima = selecionados.length > TETO_SKUS;
  const enviando = cadastrar.isPending;
  const semSkus = selecionados.length === 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o cruzamento com o XPM…
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar o cruzamento com o XPM</AlertTitle>
        <AlertDescription className="text-xs">{formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  const semSku = resultados.filter((r) => r.status === "PRODUTO_SEM_SKU");

  return (
    <div className="space-y-4">
      {/* BLOCO 1 — consequência real */}
      <Card className="border-amber-500/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Vendável e fora do WMS
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {vendaveisFora.length} produtos vendáveis que o WMS não conhece. Vende e o WMS não tem o que separar.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{selecionados.length} selecionado(s)</Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={semSkus || acima || verPayload.isPending}
              onClick={() => verPayload.mutate(selecionados)}
            >
              {verPayload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Ver payload
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={semSkus || acima || !payloadVisto || enviando}
              onClick={() => cadastrar.mutate(selecionados)}
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Cadastrar no XPM
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

          {semSku.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Produto criado no XPM sem SKU</AlertTitle>
              <AlertDescription className="space-y-1 text-xs">
                {semSku.map((r) => (
                  <div key={r.sku}>
                    <strong>{r.sku}</strong> — produtoId {String(r.xpm_produto_id ?? "?")}: {r.acao ?? ""}
                    {r.erro ? ` (${r.erro})` : ""}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {resultados.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((r, i) => (
                    <TableRow key={`${r.sku}-${i}`}>
                      <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={r.status === "ok" ? "outline" : "destructive"}>{r.status ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs break-words">
                        {r.status === "ok"
                          ? `produtoId ${r.xpm_produto_id} / skuId ${r.xpm_sku_id}`
                          : r.erro ?? (r.bloqueios ? jsonLegivel(r.bloqueios) : "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {vendaveisFora.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum produto vendável fora do WMS.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Cód.</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Fase</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendaveisFora.map((l) => (
                    <TableRow key={l.sku ?? l.cod_cadastro}>
                      <TableCell>
                        <Checkbox
                          checked={!!l.sku && selecionados.includes(l.sku)}
                          onCheckedChange={() => alternar(l.sku)}
                          aria-label={`Selecionar ${l.sku ?? ""}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                      <TableCell className="text-sm">{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.grupo ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.fase ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 2 — higiene */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Saúde do cadastro no WMS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Divergências de dado em produtos já cadastrados. O peso 10,11 kg e o lastro 10000 são resíduo da carga
            inicial do XPM (cods 01000–01587), não erro por produto.
          </p>
        </CardHeader>
        <CardContent>
          {saude.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma divergência de dado.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead className="text-right">Peso SNCF</TableHead>
                    <TableHead className="text-right">Peso XPM</TableHead>
                    <TableHead>NCM SNCF</TableHead>
                    <TableHead>NCM XPM</TableHead>
                    <TableHead>Categoria XPM</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saude.map((l) => (
                    <TableRow key={l.sku ?? l.cod_cadastro}>
                      <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{num(l.peso_kg_sncf)}</TableCell>
                      <TableCell className="text-right text-xs">{num(l.peso_kg_xpm)}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ncm_sncf ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ncm_xpm ?? "—"}</TableCell>
                      <TableCell className="text-xs">{l.categoria_xpm ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {l.categoria_xpm === "BLOCADO PARA RESSONANCIA" && l.sku && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled={corrigirCategoria.isPending}
                            onClick={() => corrigirCategoria.mutate(l.sku as string)}
                          >
                            {corrigirCategoria.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Wrench className="h-3.5 w-3.5" />}
                            Corrigir categoria
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 3 — não urge */}
      <Card>
        <CardContent className="pt-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="pre-venda" className="border-none">
              <AccordionTrigger className="text-base font-semibold hover:no-underline">
                Pré-venda fora do WMS ({preVenda.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Não urge: produto que ainda não está vendável. Entra no WMS quando chegar mercadoria, pela planilha
                  Cad_item.
                </p>
                {preVenda.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhum produto nesta situação.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cód.</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Nome comercial</TableHead>
                          <TableHead>Grupo</TableHead>
                          <TableHead>Fase</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preVenda.map((l) => (
                          <TableRow key={l.sku ?? l.cod_cadastro}>
                            <TableCell className="font-mono text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                            <TableCell className="text-xs">{l.nome_comercial ?? "—"}</TableCell>
                            <TableCell className="text-xs">{l.grupo ?? "—"}</TableCell>
                            <TableCell className="text-xs">{l.fase ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payload que será enviado ao XPM</DialogTitle>
            <DialogDescription>
              Simulação (dry run). Nada foi enviado ainda — o conteúdo vem inteiro da RPC do banco.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {payloads.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum payload retornado.</p>
            )}
            {payloads.map((p, i) => (
              <div key={`${p.sku}-${i}`} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{p.sku}</span>
                  <Badge variant={p.status === "dry_run" ? "outline" : "destructive"}>{p.status ?? "—"}</Badge>
                </div>
                {p.aviso_corte && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{p.aviso_corte}</AlertDescription>
                  </Alert>
                )}
                {p.bloqueios && Array.isArray(p.bloqueios) && p.bloqueios.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs">Bloqueios</AlertTitle>
                    <AlertDescription>
                      <pre className="whitespace-pre-wrap text-xs">{jsonLegivel(p.bloqueios)}</pre>
                    </AlertDescription>
                  </Alert>
                )}
                {p.erro && <p className="text-xs text-destructive">{p.erro}</p>}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">passo_1_produto</p>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{jsonLegivel(p.passo_1_produto)}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">passo_2_produto_sku</p>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{jsonLegivel(p.passo_2_produto_sku)}</pre>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
