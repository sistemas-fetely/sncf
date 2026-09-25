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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Eye, Loader2, Send } from "lucide-react";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

const TETO_SKUS = 10;
const FN = "shopify-cadastrar-produto";

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
  avisos: string[] | null;
  pode_enviar: boolean | null;
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
};

type FiltroFase = "todos" | "ativo" | "pre_venda";

function jsonLegivel(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v, null, 2);
}

function brl(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normFase(f: string | null): string {
  return (f ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s-]+/g, "_");
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
  const [filtro, setFiltro] = useState<FiltroFase>("ativo");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [payloadVisto, setPayloadVisto] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [payloads, setPayloads] = useState<ResultadoSku[]>([]);
  const [resultados, setResultados] = useState<ResultadoSku[]>([]);

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
        .select("cod_cadastro, sku, fase, canal_venda, nome_comercial, marca, grupo, preco_varejo, ean, peso_g, tem_descricao, tem_foto, avisos, pode_enviar")
        .order("cod_cadastro");
      if (error) throw error;
      return (data ?? []) as LinhaFila[];
    },
  });

  const visiveis = useMemo(() => {
    const todas = linhas ?? [];
    if (filtro === "todos") return todas;
    return todas.filter((l) => normFase(l.fase) === filtro);
  }, [linhas, filtro]);

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

  const cadastrar = useMutation({
    mutationFn: (skus: string[]) => chamar(skus, false),
    onSuccess: (res) => {
      setResultados(res);
      const ok = res.filter((r) => r.status === "ok").length;
      const problema = res.filter((r) => r.status !== "ok").length;
      if (ok > 0) toast.success(`${ok} SKU(s) cadastrado(s) no Shopify como Rascunho`);
      if (problema > 0) toast.error(`${problema} SKU(s) não cadastrado(s) — veja o resultado abaixo`);
      setSelecionados([]);
      setPayloadVisto(false);
      void qc.invalidateQueries({ queryKey: ["shopify-cadastro-fila"] });
    },
    onError: (e) => toast.error(`Falha ao cadastrar no Shopify: ${formatError(e)}`),
  });

  const acima = selecionados.length > TETO_SKUS;
  const semSkus = selecionados.length === 0;

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
            SKUs em Pré-Venda ou Ativo, com canal B2C ou B2B+B2C, que ainda não existem no Shopify. Todo produto nasce como Rascunho (Draft) — ativar na vitrine é feito no Shopify Admin.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroFase)}>
              <TabsList className="h-8">
                <TabsTrigger value="todos" className="text-xs">Todos</TabsTrigger>
                <TabsTrigger value="ativo" className="text-xs">Ativo</TabsTrigger>
                <TabsTrigger value="pre_venda" className="text-xs">Pré-Venda</TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="outline">{selecionados.length} selecionado(s)</Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={semSkus || acima || verPayload.isPending || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => verPayload.mutate(selecionados)}
            >
              {verPayload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Ver payload
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={semSkus || acima || !payloadVisto || cadastrar.isPending || !liberado}
              title={!liberado ? tituloSemPermissao : undefined}
              onClick={() => cadastrar.mutate(selecionados)}
            >
              {cadastrar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Cadastrar no Shopify (Draft)
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
                        disabled={!l.pode_enviar || !l.sku}
                        onCheckedChange={() => alternar(l.sku)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{l.cod_cadastro ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                    <TableCell className="text-sm">{l.nome_comercial ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.fase ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.canal_venda ?? "—"}</TableCell>
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
    </div>
  );
}
