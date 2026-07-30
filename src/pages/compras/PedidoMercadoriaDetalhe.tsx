import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  FileText,
  Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { fmtMoeda, VERDE } from "@/lib/compras/lancamento-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import LancarNfDialog from "@/components/compras/LancarNfDialog";
import LancarInvoiceDialog from "@/components/compras/LancarInvoiceDialog";

// ============================================================================
// Types
// ============================================================================

interface PedidoDetalhe {
  id: number;
  numero_pedido: string;
  rocabella_ref: string | null;
  modalidade: string | null;
  moeda: string | null;
  data_pedido: string | null;
  prazo_entrega_acordado: string | null;
  etd: string | null;
  eta: string | null;
  eta_precisao: string | null;
  condicao_pagamento: string | null;
  referencia_fornecedor: string | null;
  observacao: string | null;
  total_conteineres: number | null;
  cbm_total: number | null;
  fornecedor_id: string | null;
  fornecedor: string | null;
  fabrica: string | null;
  centro: string | null;
  status: string | null;
  status_ordem: number | null;
  exige_nf: boolean | null;
  linhas: number | null;
  kits: number | null;
  custo_total: number | null;
  nfs: number | null;
  invoices: number | null;
  nfs_numeros: string | null;
  invoices_numeros: string | null;
  fase_xpm: number | null;
  skus_incompletos_xpm: number | null;
}

interface LinhaPedido {
  id: number;
  sku: string | null;
  ean: string | null;
  grupo_produto: string | null;
  descricao_original: string | null;
  qtd_kits: number | null;
  qtd_unitaria: number | null;
  custo_unitario: number | null;
  custo_total: number | null;
  total_caixas_master: number | null;
  total_caixas_inner: number | null;
  cbm_total: number | null;
}

interface NfRow {
  id: number;
  numero: string;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  container: string | null;
  valor_produtos: number | null;
  valor_ipi: number | null;
  valor_total: number | null;
  peso_bruto: number | null;
  peso_liquido: number | null;
  volumes: number | null;
  processo: string | null;
}

interface NfLinha {
  nf_id: number;
  item_seq: number;
  codigo_nf: string | null;
  ncm: string | null;
  quantidade: number | null;
  valor_unit: number | null;
  ipi_aliq: number | null;
  valor_total: number | null;
}

interface InvoiceRow {
  id: number;
  numero: string;
  data_emissao: string | null;
  moeda: string | null;
  incoterm: string | null;
  valor_total: number | null;
  container: string | null;
}

interface InvoiceLinha {
  invoice_id: number;
  item_seq: number;
  codigo_fornecedor: string | null;
  sku: string | null;
  descricao: string | null;
  quantidade: number | null;
  valor_unit: number | null;
  valor_total: number | null;
}

interface ConfNf {
  importacao_pedido_id: number;
  numero_pedido: string | null;
  nf_id: number | null;
  nf_numero: string | null;
  nf_linha_id: number | null;
  item_seq: number | null;
  codigo_nf: string | null;
  ncm: string | null;
  qtd_nf: number | null;
  valor_nf: number | null;
  sku: string | null;
  qtd_alocada: number | null;
  qtd_pedido: number | null;
  furo: number | null;
  situacao: string | null;
}

interface ConfInv {
  importacao_pedido_id: number;
  invoice_id: number | null;
  invoice_numero: string | null;
  sku: string | null;
  qtd_pedido: number | null;
  qtd_invoice: number | null;
  furo: number | null;
  custo_pedido: number | null;
  custo_invoice: number | null;
  situacao: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd/MM/yyyy");
  } catch {
    return d;
  }
};

const fmtNum = (v: number | null | undefined, casas = 0) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

function FaseBadge({ fase }: { fase: number | null | undefined }) {
  if (fase === 2) return <Badge variant="secondary">Fase 2 · com NF</Badge>;
  if (fase === 1) return <Badge variant="outline">Fase 1 · sem NF</Badge>;
  return null;
}

function ErroBloco({
  titulo,
  erro,
  onRetry,
}: {
  titulo: string;
  erro: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
      <div className="text-sm font-medium text-destructive">{titulo}</div>
      <div className="text-xs text-destructive/90 break-words">{formatError(erro)}</div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}

function Stat({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

// ============================================================================
// Página
// ============================================================================

export default function PedidoMercadoriaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const pedidoId = Number(id);
  const [nfDialog, setNfDialog] = useState(false);
  const [invDialog, setInvDialog] = useState(false);
  const [nfAberta, setNfAberta] = useState<number | null>(null);
  const [invAberta, setInvAberta] = useState<number | null>(null);

  const pedidoQ = useQuery({
    queryKey: ["pedido-mercadoria-detalhe", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_pedido_detalhe")
        .select("*")
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PedidoDetalhe | null;
    },
  });

  const pedido = pedidoQ.data;
  const moeda = pedido?.moeda ?? "BRL";

  const linhasQ = useQuery({
    queryKey: ["pedido-mercadoria-linhas", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_linha")
        .select(
          "id, sku, ean, grupo_produto, descricao_original, qtd_kits, qtd_unitaria, custo_unitario, custo_total, total_caixas_master, total_caixas_inner, cbm_total",
        )
        .eq("importacao_pedido_id", pedidoId)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as LinhaPedido[];
    },
  });

  const nfsQ = useQuery({
    queryKey: ["pedido-mercadoria-nfs", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data: vinc, error: e1 } = await (supabase as any)
        .from("importacao_nf_pedido")
        .select("nf_id")
        .eq("importacao_pedido_id", pedidoId);
      if (e1) throw e1;
      const ids = ((vinc ?? []) as Array<{ nf_id: number }>).map((v) => v.nf_id);
      if (ids.length === 0) return { nfs: [] as NfRow[], linhas: [] as NfLinha[] };
      const { data: nfs, error: e2 } = await (supabase as any)
        .from("importacao_nf")
        .select(
          "id, numero, serie, chave_acesso, data_emissao, container, valor_produtos, valor_ipi, valor_total, peso_bruto, peso_liquido, volumes, processo",
        )
        .in("id", ids);
      if (e2) throw e2;
      const { data: linhas, error: e3 } = await (supabase as any)
        .from("importacao_nf_linha")
        .select("nf_id, item_seq, codigo_nf, ncm, quantidade, valor_unit, ipi_aliq, valor_total")
        .in("nf_id", ids)
        .order("item_seq");
      if (e3) throw e3;
      return { nfs: (nfs ?? []) as NfRow[], linhas: (linhas ?? []) as NfLinha[] };
    },
  });

  const invoicesQ = useQuery({
    queryKey: ["pedido-mercadoria-invoices", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data: vinc, error: e1 } = await (supabase as any)
        .from("importacao_invoice_pedido")
        .select("invoice_id")
        .eq("importacao_pedido_id", pedidoId);
      if (e1) throw e1;
      const ids = ((vinc ?? []) as Array<{ invoice_id: number }>).map((v) => v.invoice_id);
      if (ids.length === 0) return { invoices: [] as InvoiceRow[], linhas: [] as InvoiceLinha[] };
      const { data: invs, error: e2 } = await (supabase as any)
        .from("importacao_invoice")
        .select("id, numero, data_emissao, moeda, incoterm, valor_total, container")
        .in("id", ids);
      if (e2) throw e2;
      const { data: linhas, error: e3 } = await (supabase as any)
        .from("importacao_invoice_linha")
        .select("invoice_id, item_seq, codigo_fornecedor, sku, descricao, quantidade, valor_unit, valor_total")
        .in("invoice_id", ids)
        .order("item_seq");
      if (e3) throw e3;
      return {
        invoices: (invs ?? []) as InvoiceRow[],
        linhas: (linhas ?? []) as InvoiceLinha[],
      };
    },
  });

  const confNfQ = useQuery({
    queryKey: ["pedido-mercadoria-conferencia-nf", pedido?.rocabella_ref],
    enabled: !!pedido?.rocabella_ref,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_conferencia_sku")
        .select("rocabella_ref, sku, nome_comercial, codigo_nf, qtd_pedido, qtd_fisica, divergencia_fisica")
        .eq("rocabella_ref", pedido!.rocabella_ref);
      if (error) throw error;
      return (data ?? []) as ConfNf[];
    },
  });

  const confInvQ = useQuery({
    queryKey: ["pedido-mercadoria-conferencia-inv", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_invoice_conferencia")
        .select(
          "importacao_pedido_id, invoice_id, invoice_numero, sku, qtd_pedido, qtd_invoice, furo, custo_pedido, custo_invoice, situacao",
        )
        .eq("importacao_pedido_id", pedidoId);
      if (error) throw error;
      return (data ?? []) as ConfInv[];
    },
  });

  const totaisLinhas = useMemo(() => {
    const l = linhasQ.data ?? [];
    return {
      kits: l.reduce((s, r) => s + Number(r.qtd_kits ?? 0), 0),
      unidades: l.reduce((s, r) => s + Number(r.qtd_unitaria ?? 0), 0),
      master: l.reduce((s, r) => s + Number(r.total_caixas_master ?? 0), 0),
      inner: l.reduce((s, r) => s + Number(r.total_caixas_inner ?? 0), 0),
      custo: l.reduce((s, r) => s + Number(r.custo_total ?? 0), 0),
    };
  }, [linhasQ.data]);

  const nfLinhasPor = (nfId: number) => (nfsQ.data?.linhas ?? []).filter((l) => l.nf_id === nfId);
  const invLinhasPor = (invId: number) =>
    (invoicesQ.data?.linhas ?? []).filter((l) => l.invoice_id === invId);

  // ============================ RENDER ============================

  if (!Number.isFinite(pedidoId)) {
    return (
      <div className="p-6">
        <ErroBloco titulo="Pedido inválido." erro="O id do pedido na URL não é um número." onRetry={() => {}} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link
        to="/compras/mercadoria?aba=pedidos"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Compras de Mercadoria
      </Link>

      {pedidoQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedido...
        </div>
      ) : pedidoQ.isError ? (
        <ErroBloco
          titulo="Falha ao carregar o pedido."
          erro={pedidoQ.error}
          onRetry={() => pedidoQ.refetch()}
        />
      ) : !pedido ? (
        <div className="text-sm text-muted-foreground">Pedido não encontrado.</div>
      ) : (
        <>
          {/* Cabeçalho */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{pedido.numero_pedido}</h1>
              {pedido.rocabella_ref && (
                <span className="text-sm text-muted-foreground">Ref. {pedido.rocabella_ref}</span>
              )}
              <FaseBadge fase={pedido.fase_xpm} />
              {pedido.status && <Badge variant="outline">{pedido.status}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">
              {pedido.fornecedor ?? "Fornecedor não informado"}
              {pedido.fabrica ? ` · ${pedido.fabrica}` : ""}
              {pedido.modalidade ? ` · ${pedido.modalidade}` : ""}
              {pedido.moeda ? ` · ${pedido.moeda}` : ""}
              {pedido.centro ? ` · ${pedido.centro}` : ""}
            </div>
          </div>

          {Number(pedido.skus_incompletos_xpm ?? 0) > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              <div>
                <div>
                  {pedido.skus_incompletos_xpm} SKU(s) sem peso, EAN ou dimensão — a planilha XPM vai
                  sair incompleta.
                </div>
                <Link to="/vendas/xpm" className="inline-flex items-center gap-1 text-xs underline">
                  Abrir XPM <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Stat rotulo="Linhas" valor={fmtNum(pedido.linhas)} />
            <Stat rotulo="Kits" valor={fmtNum(pedido.kits)} />
            <Stat rotulo="Custo total" valor={fmtMoeda(pedido.custo_total, moeda)} />
            <Stat rotulo="ETD" valor={fmtDate(pedido.etd)} />
            <Stat rotulo="ETA" valor={fmtDate(pedido.eta)} />
            <Stat rotulo="NFs" valor={fmtNum(pedido.nfs)} />
            <Stat rotulo="Invoices" valor={fmtNum(pedido.invoices)} />
          </div>

          <Tabs defaultValue="linhas">
            <TabsList>
              <TabsTrigger value="linhas">Linhas</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="conferencia">Conferência</TabsTrigger>
            </TabsList>

            {/* ---------------- LINHAS ---------------- */}
            <TabsContent value="linhas" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  {linhasQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando linhas...
                    </div>
                  ) : linhasQ.isError ? (
                    <ErroBloco
                      titulo="Falha ao carregar as linhas do pedido."
                      erro={linhasQ.error}
                      onRetry={() => linhasQ.refetch()}
                    />
                  ) : (linhasQ.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Este pedido não tem linhas gravadas.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right">Kits</TableHead>
                            <TableHead className="text-right">Unidades</TableHead>
                            <TableHead className="text-right">Cx. master</TableHead>
                            <TableHead className="text-right">Cx. inner</TableHead>
                            <TableHead className="text-right">Custo unit.</TableHead>
                            <TableHead className="text-right">Custo total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linhasQ.data!.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                              <TableCell className="max-w-[320px] truncate">
                                {l.descricao_original ?? "—"}
                              </TableCell>
                              <TableCell className="text-right">{fmtNum(l.qtd_kits)}</TableCell>
                              <TableCell className="text-right">{fmtNum(l.qtd_unitaria)}</TableCell>
                              <TableCell className="text-right">
                                {fmtNum(l.total_caixas_master)}
                              </TableCell>
                              <TableCell className="text-right">
                                {fmtNum(l.total_caixas_inner)}
                              </TableCell>
                              <TableCell className="text-right">
                                {fmtMoeda(l.custo_unitario, moeda)}
                              </TableCell>
                              <TableCell className="text-right">
                                {fmtMoeda(l.custo_total, moeda)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={2}>Totais</TableCell>
                            <TableCell className="text-right">{fmtNum(totaisLinhas.kits)}</TableCell>
                            <TableCell className="text-right">
                              {fmtNum(totaisLinhas.unidades)}
                            </TableCell>
                            <TableCell className="text-right">{fmtNum(totaisLinhas.master)}</TableCell>
                            <TableCell className="text-right">{fmtNum(totaisLinhas.inner)}</TableCell>
                            <TableCell />
                            <TableCell className="text-right">
                              {fmtMoeda(totaisLinhas.custo, moeda)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- DOCUMENTOS ---------------- */}
            <TabsContent value="documentos" className="mt-4 space-y-6">
              {/* NFs */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Notas fiscais
                  </CardTitle>
                  <Button
                    size="sm"
                    style={{ backgroundColor: VERDE }}
                    className="text-white hover:opacity-90"
                    onClick={() => setNfDialog(true)}
                  >
                    Lançar NF
                  </Button>
                </CardHeader>
                <CardContent>
                  {nfsQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando NFs...
                    </div>
                  ) : nfsQ.isError ? (
                    <ErroBloco
                      titulo="Falha ao carregar as NFs vinculadas."
                      erro={nfsQ.error}
                      onRetry={() => nfsQ.refetch()}
                    />
                  ) : (nfsQ.data?.nfs ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Nenhuma NF vinculada a este pedido.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nfsQ.data!.nfs.map((nf) => {
                        const aberto = nfAberta === nf.id;
                        const linhas = nfLinhasPor(nf.id);
                        return (
                          <div key={nf.id} className="rounded-md border">
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 p-3 text-left text-sm hover:bg-muted/50"
                              onClick={() => setNfAberta(aberto ? null : nf.id)}
                            >
                              {aberto ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium">
                                NF {nf.numero}
                                {nf.serie ? `/${nf.serie}` : ""}
                              </span>
                              <span className="text-muted-foreground">
                                {fmtDate(nf.data_emissao)}
                              </span>
                              <span className="text-muted-foreground">
                                {fmtMoeda(nf.valor_total, "BRL")}
                              </span>
                              <span className="text-muted-foreground">
                                {nf.container ?? "sem container"}
                              </span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {linhas.length} linha(s)
                              </span>
                            </button>
                            {aberto && (
                              <div className="border-t p-3 overflow-x-auto">
                                {linhas.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    Esta NF não tem linhas gravadas.
                                  </div>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Código</TableHead>
                                        <TableHead>NCM</TableHead>
                                        <TableHead className="text-right">Qtd</TableHead>
                                        <TableHead className="text-right">Valor unit.</TableHead>
                                        <TableHead className="text-right">IPI %</TableHead>
                                        <TableHead className="text-right">Valor total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {linhas.map((l) => (
                                        <TableRow key={`${l.nf_id}-${l.item_seq}`}>
                                          <TableCell>{l.item_seq}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {l.codigo_nf ?? "—"}
                                          </TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {l.ncm ?? "—"}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtNum(l.quantidade)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtMoeda(l.valor_unit, "BRL")}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtNum(l.ipi_aliq, 2)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtMoeda(l.valor_total, "BRL")}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Invoices */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Invoices
                  </CardTitle>
                  <Button
                    size="sm"
                    style={{ backgroundColor: VERDE }}
                    className="text-white hover:opacity-90"
                    onClick={() => setInvDialog(true)}
                  >
                    Lançar Invoice
                  </Button>
                </CardHeader>
                <CardContent>
                  {invoicesQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando invoices...
                    </div>
                  ) : invoicesQ.isError ? (
                    <ErroBloco
                      titulo="Falha ao carregar as invoices vinculadas."
                      erro={invoicesQ.error}
                      onRetry={() => invoicesQ.refetch()}
                    />
                  ) : (invoicesQ.data?.invoices ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Nenhuma invoice vinculada a este pedido.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invoicesQ.data!.invoices.map((inv) => {
                        const aberto = invAberta === inv.id;
                        const linhas = invLinhasPor(inv.id);
                        return (
                          <div key={inv.id} className="rounded-md border">
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 p-3 text-left text-sm hover:bg-muted/50"
                              onClick={() => setInvAberta(aberto ? null : inv.id)}
                            >
                              {aberto ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <span className="font-medium">Invoice {inv.numero}</span>
                              <span className="text-muted-foreground">
                                {fmtDate(inv.data_emissao)}
                              </span>
                              <span className="text-muted-foreground">
                                {fmtMoeda(inv.valor_total, inv.moeda ?? moeda)}
                              </span>
                              <span className="text-muted-foreground">
                                {inv.container ?? "sem container"}
                              </span>
                              {inv.incoterm && (
                                <Badge variant="outline">{inv.incoterm}</Badge>
                              )}
                              <span className="ml-auto text-xs text-muted-foreground">
                                {linhas.length} linha(s)
                              </span>
                            </button>
                            {aberto && (
                              <div className="border-t p-3 overflow-x-auto">
                                {linhas.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    Esta invoice não tem linhas gravadas.
                                  </div>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Código fornecedor</TableHead>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead className="text-right">Qtd</TableHead>
                                        <TableHead className="text-right">Valor unit.</TableHead>
                                        <TableHead className="text-right">Valor total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {linhas.map((l) => (
                                        <TableRow key={`${l.invoice_id}-${l.item_seq}`}>
                                          <TableCell>{l.item_seq}</TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {l.codigo_fornecedor ?? "—"}
                                          </TableCell>
                                          <TableCell className="font-mono text-xs">
                                            {l.sku ?? "—"}
                                          </TableCell>
                                          <TableCell className="max-w-[260px] truncate">
                                            {l.descricao ?? "—"}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtNum(l.quantidade)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtMoeda(l.valor_unit, inv.moeda ?? moeda)}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {fmtMoeda(l.valor_total, inv.moeda ?? moeda)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ---------------- CONFERÊNCIA ---------------- */}
            <TabsContent value="conferencia" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pedido × NF (físico)</CardTitle>
                </CardHeader>
                <CardContent>
                  {!pedido.rocabella_ref ? (
                    <div className="text-sm text-muted-foreground">
                      Este pedido não tem referência (rocabella_ref), que é a chave da conferência
                      física por NF.
                    </div>
                  ) : confNfQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando conferência...
                    </div>
                  ) : confNfQ.isError ? (
                    <ErroBloco
                      titulo="Falha ao carregar a conferência de NF."
                      erro={confNfQ.error}
                      onRetry={() => confNfQ.refetch()}
                    />
                  ) : (confNfQ.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      A conferência aparece quando houver NF vinculada a este pedido.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead>Código NF</TableHead>
                            <TableHead className="text-right">Qtd pedido</TableHead>
                            <TableHead className="text-right">Qtd física</TableHead>
                            <TableHead className="text-right">Divergência</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {confNfQ.data!.map((r, i) => {
                            const div = Number(r.divergencia_fisica ?? 0);
                            return (
                              <TableRow
                                key={`${r.sku}-${r.codigo_nf}-${i}`}
                                className={div !== 0 ? "bg-destructive/10" : undefined}
                              >
                                <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                                <TableCell className="max-w-[280px] truncate">
                                  {r.nome_comercial ?? "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {r.codigo_nf ?? "—"}
                                </TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_pedido)}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_fisica)}</TableCell>
                                <TableCell
                                  className={
                                    div !== 0 ? "text-right font-semibold text-destructive" : "text-right"
                                  }
                                >
                                  {fmtNum(r.divergencia_fisica)}
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pedido × Invoice</CardTitle>
                </CardHeader>
                <CardContent>
                  {confInvQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando conferência...
                    </div>
                  ) : confInvQ.isError ? (
                    <ErroBloco
                      titulo="Falha ao carregar a conferência de invoice."
                      erro={confInvQ.error}
                      onRetry={() => confInvQ.refetch()}
                    />
                  ) : (confInvQ.data ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      A conferência aparece quando houver invoice vinculada a este pedido.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qtd pedido</TableHead>
                            <TableHead className="text-right">Qtd invoice</TableHead>
                            <TableHead className="text-right">Furo</TableHead>
                            <TableHead className="text-right">Custo pedido</TableHead>
                            <TableHead className="text-right">Custo invoice</TableHead>
                            <TableHead>Situação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {confInvQ.data!.map((r, i) => {
                            const problema =
                              r.situacao === "divergente" ||
                              r.situacao === "so_pedido" ||
                              r.situacao === "so_invoice";
                            return (
                              <TableRow
                                key={`${r.invoice_id}-${r.sku}-${i}`}
                                className={problema ? "bg-destructive/10" : undefined}
                              >
                                <TableCell>{r.invoice_numero ?? "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_pedido)}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_invoice)}</TableCell>
                                <TableCell
                                  className={
                                    problema ? "text-right font-semibold text-destructive" : "text-right"
                                  }
                                >
                                  {fmtNum(r.furo)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtMoeda(r.custo_pedido, moeda)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtMoeda(r.custo_invoice, moeda)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={problema ? "destructive" : "secondary"}>
                                    {r.situacao ?? "—"}
                                  </Badge>
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
            </TabsContent>
          </Tabs>

          <LancarNfDialog
            open={nfDialog}
            onOpenChange={setNfDialog}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
          />
          <LancarInvoiceDialog
            open={invDialog}
            onOpenChange={setInvDialog}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
            moedaPadrao={pedido.moeda}
          />
        </>
      )}
    </div>
  );
}
