import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Pencil,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { toast } from "sonner";
import { fmtMoeda, VERDE } from "@/lib/compras/lancamento-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardIndicador } from "@/components/ui/card-indicador";

import { Badge } from "@/components/ui/badge";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { CelulaDinheiro } from "@/components/ui/celula-dinheiro";
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
import { PageHeader } from "@/components/layout/PageHeader";
import LancarNfDialog from "@/components/compras/LancarNfDialog";
import LancarInvoiceDialog from "@/components/compras/LancarInvoiceDialog";
import EditarPedidoMercadoriaDialog from "@/components/compras/EditarPedidoMercadoriaDialog";
import SaldoPedidoTab from "@/components/compras/SaldoPedidoTab";
import VincularNfDialog from "@/components/compras/VincularNfDialog";



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
  apelido: string | null;
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
  situacao: string | null;
}

interface ConfInv {
  importacao_pedido_id: number;
  numero_pedido: string | null;
  invoice_id: number | null;
  invoice_numero: string | null;
  data_emissao: string | null;
  sku: string | null;
  codigo_fornecedor: string | null;
  qtd_pedido: number | null;
  qtd_invoice: number | null;
  declarado_invoice: number | null;
  a_embarcar: number | null;
  custo_pedido: number | null;
  custo_invoice: number | null;
  delta_preco: number | null;
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
const SITUACAO_NF: Record<
  string,
  { rotulo: string; badge: string; linha?: string }
> = {
  ok: { rotulo: "OK", badge: "border-success/40 bg-success/10 text-success" },
  nao_alocado: {
    rotulo: "Não alocado",
    badge: "border-warning/40 bg-warning/10 text-warning",
    linha: "bg-warning/5",
  },
  so_nf: {
    rotulo: "Só na NF",
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    linha: "bg-destructive/10",
  },
  divergente: {
    rotulo: "Divergente",
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    linha: "bg-destructive/10",
  },
};

// Conferência Pedido × Invoice: embarque parcial NÃO é problema. Realce de
// linha só para erro de fato (excesso de embarque ou SKU fora do pedido).
const SITUACAO_INV: Record<
  string,
  { rotulo: string; estado: EstadoSelo; linha?: string }
> = {
  ok: { rotulo: "OK", estado: "success" },
  preco_divergente: { rotulo: "Preço divergente", estado: "warning" },
  embarque_excede_pedido: {
    rotulo: "Embarque acima do pedido",
    estado: "destructive",
    linha: "bg-destructive/10",
  },
  sku_fora_do_pedido: {
    rotulo: "SKU fora do pedido",
    estado: "destructive",
    linha: "bg-destructive/10",
  },
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
  return <CardIndicador compacto rotulo={rotulo} valor={valor} />;
}


// ============================================================================
// Página
// ============================================================================

export default function ChegadaMercadoriaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const pedidoId = Number(id);
  const [nfDialog, setNfDialog] = useState(false);
  const [invDialog, setInvDialog] = useState(false);
  const [nfAberta, setNfAberta] = useState<number | null>(null);
  const [invAberta, setInvAberta] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [vincNfDialog, setVincNfDialog] = useState(false);


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

  // Léxico único: A faturar (fornecedor deve NF) · A confirmar (XPM deve conferência)
  const saldoQ = useQuery({
    queryKey: ["compra-tres-camadas-pedido-cabecalho", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas_pedido")
        .select(
          "a_faturar, a_confirmar, custo_projetado, delta_custo, delta_custo_pct, custo_comparavel, custo_incomparavel_motivo",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        a_faturar: number | null;
        a_confirmar: number | null;
        custo_projetado: number | null;
        delta_custo: number | null;
        delta_custo_pct: number | null;
        custo_comparavel: boolean | null;
        custo_incomparavel_motivo: string | null;
      } | null;
    },
  });

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
    queryKey: ["pedido-mercadoria-conferencia-nf", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_pedido_conferencia_nf")
        .select(
          "importacao_pedido_id, numero_pedido, nf_id, nf_numero, nf_linha_id, item_seq, codigo_nf, ncm, qtd_nf, valor_nf, sku, qtd_alocada, qtd_pedido, situacao",
        )
        .eq("importacao_pedido_id", pedidoId);
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
          "importacao_pedido_id, numero_pedido, invoice_id, invoice_numero, data_emissao, sku, codigo_fornecedor, qtd_pedido, qtd_invoice, declarado_invoice, a_embarcar, custo_pedido, custo_invoice, delta_preco, situacao",
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

  const qc = useQueryClient();

  const naoAlocadas = useMemo(
    () => (confNfQ.data ?? []).filter((r) => r.situacao === "nao_alocado").length,
    [confNfQ.data],
  );

  /**
   * Furo de verdade é erro de rateio DENTRO do documento: Qtd NF da linha contra a
   * soma do que foi alocado nos SKUs daquela mesma linha. Saldo de pedido não entra aqui —
   * ele vive na aba Saldo, como "A faturar" e "A confirmar".
   */
  const rateioPorLinhaNf = useMemo(() => {
    const m = new Map<number, { qtdNf: number; alocada: number }>();
    for (const r of confNfQ.data ?? []) {
      if (r.nf_linha_id == null) continue;
      const k = Number(r.nf_linha_id);
      const atual = m.get(k) ?? { qtdNf: Number(r.qtd_nf ?? 0), alocada: 0 };
      atual.alocada += Number(r.qtd_alocada ?? 0);
      m.set(k, atual);
    }
    return m;
  }, [confNfQ.data]);

  const nfIds = useMemo(
    () => (nfsQ.data?.nfs ?? []).map((n) => Number(n.id)).sort((a, b) => a - b),
    [nfsQ.data],
  );

  // Diagnostico real: o banco decide se falta de-para ou falta so rodar a alocacao.
  const diagAlocQ = useQuery({
    queryKey: ["pedido-mercadoria-diag-alocacao", pedidoId, nfIds.join(",")],
    enabled: nfIds.length > 0 && naoAlocadas > 0,
    queryFn: async () => {
      let sem_depara = 0;
      let linhas_alocaveis = 0;
      let servico_sem_destino = 0;
      for (const nfId of nfIds) {
        const { data, error } = await (supabase as any).rpc("alocar_nf_linhas", {
          p_nf_id: nfId,
          p_confirmar: false,
        });
        if (error) throw error;
        const r = (Array.isArray(data) ? data[0] : data) ?? {};
        sem_depara += Number(r.sem_depara ?? 0);
        linhas_alocaveis += Number(r.linhas_alocaveis ?? 0);
        servico_sem_destino += Number(r.servico_sem_destino ?? 0);
      }
      return { sem_depara, linhas_alocaveis, servico_sem_destino };
    },
  });

  const alocarAgora = useMutation({
    mutationFn: async () => {
      for (const nfId of nfIds) {
        const { error } = await (supabase as any).rpc("alocar_nf_linhas", {
          p_nf_id: nfId,
          p_confirmar: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Linhas alocadas.");
      invalidarCompras(qc);
      void qc.invalidateQueries({ queryKey: ["pedido-mercadoria-diag-alocacao"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });



  const diagAloc = diagAlocQ.data ?? null;

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
        to="/logistica/chegada-mercadoria?aba=pedidos"
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
            <PageHeader
              titulo={pedido.numero_pedido}
              acoes={(
                <>
                  {pedido.rocabella_ref && (
                    <span className="text-sm text-muted-foreground">Ref. {pedido.rocabella_ref}</span>
                  )}
                  <FaseBadge fase={pedido.fase_xpm} />
                  {pedido.status && <Badge variant="outline">{pedido.status}</Badge>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Editar pedido
                  </Button>
                </>
              )}
            />

            <div className="text-sm text-muted-foreground">
              <div>
                {pedido.fornecedor ?? "Fornecedor não informado"}
                {pedido.fabrica ? ` · ${pedido.fabrica}` : ""}
                {pedido.modalidade ? ` · ${pedido.modalidade}` : ""}
                {pedido.moeda ? ` · ${pedido.moeda}` : ""}
                {pedido.centro ? ` · ${pedido.centro}` : ""}
              </div>
              {pedido.apelido && (
                <div className="text-xs text-muted-foreground">{pedido.apelido}</div>
              )}
            </div>
          </div>

          {Number(pedido.skus_incompletos_xpm ?? 0) > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-warning" />
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
            <Stat rotulo="Custo FOB" valor={fmtMoeda(pedido.custo_total, moeda)} />
            {/* CUSTO-PROJETADO-RESPETA-COMPARABILIDADE: importação tem FOB em USD e
                NF nacionalizada em BRL — quando a view diz que não dá pra comparar,
                a tela NUNCA mostra número, só o motivo. */}
            {(() => {
              const s = saldoQ.data;
              const comparavel = s?.custo_comparavel !== false;
              const delta = Number(s?.delta_custo ?? 0);
              const pct = s?.delta_custo_pct;
              const nota = !comparavel
                ? (s?.custo_incomparavel_motivo ?? "Custo não comparável")
                : delta !== 0
                  ? `${delta > 0 ? "+" : "−"}${fmtMoeda(Math.abs(delta), "BRL")} · ${pct != null ? fmtNum(Math.abs(pct), 1) : "—"}% vs acordado`
                  : "igual ao acordado";
              const tom = !comparavel
                ? "neutro"
                : delta > 0
                  ? "atencao"
                  : delta < 0
                    ? "positivo"
                    : "neutro";
              return (
                <CardIndicador
                  compacto
                  rotulo="Custo projetado"
                  valor={
                    comparavel
                      ? s?.custo_projetado != null
                        ? fmtMoeda(s.custo_projetado, "BRL")
                        : "—"
                      : "—"
                  }
                  nota={nota}
                  tom={tom}
                />
              );
            })()}
            <Stat rotulo="ETD" valor={fmtDate(pedido.etd)} />
            <Stat rotulo="ETA" valor={fmtDate(pedido.eta)} />
            <Stat rotulo="NFs" valor={fmtNum(pedido.nfs)} />
            <Stat rotulo="Invoices" valor={fmtNum(pedido.invoices)} />
            <Stat
              rotulo="A faturar"
              valor={
                <span className={(saldoQ.data?.a_faturar ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}>
                  {fmtNum(saldoQ.data?.a_faturar ?? 0)}
                </span>
              }
            />
            <Stat
              rotulo="A confirmar"
              valor={
                <span className={(saldoQ.data?.a_confirmar ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}>
                  {fmtNum(saldoQ.data?.a_confirmar ?? 0)}
                </span>
              }
            />
          </div>

          <Tabs defaultValue="linhas">
            <TabsList>
              <TabsTrigger value="linhas">Linhas</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="conferencia">Conferência</TabsTrigger>
              <TabsTrigger value="saldo">Saldo</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>

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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      style={{ backgroundColor: VERDE }}
                      className="text-white hover:opacity-90"
                      onClick={() => setNfDialog(true)}
                    >
                      Lançar NF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setVincNfDialog(true)}>
                      Vincular NF existente
                    </Button>
                  </div>
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
                  <CardTitle className="text-base">Pedido × NF</CardTitle>
                </CardHeader>
                <CardContent>
                  {confNfQ.isLoading ? (
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
                    <div className="space-y-3">
                      {naoAlocadas > 0 && diagAloc && diagAloc.sem_depara > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {diagAloc.sem_depara} linha(s) sem de-para do fornecedor.
                          </span>
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/logistica/chegada-mercadoria?aba=de-para">
                              Preencher de-para <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          </Button>
                        </div>
                      )}
                      {naoAlocadas > 0 &&
                        diagAloc &&
                        diagAloc.sem_depara === 0 &&
                        diagAloc.linhas_alocaveis > 0 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info/10 p-3 text-sm text-info">
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              {diagAloc.linhas_alocaveis} linha(s) prontas para alocar. O de-para já
                              está preenchido.
                            </span>
                            <Button
                              size="sm"
                              onClick={() => alocarAgora.mutate()}
                              disabled={alocarAgora.isPending}
                            >
                              {alocarAgora.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                              )}
                              Alocar agora
                            </Button>
                          </div>
                        )}
                      {naoAlocadas > 0 && diagAloc && diagAloc.servico_sem_destino > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            {diagAloc.servico_sem_destino} linha(s) de serviço sem destino. Escolha o
                            SKU de destino do serviço no de-para do fornecedor.
                          </span>
                        </div>
                      )}
                      {naoAlocadas > 0 && diagAlocQ.isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Checando o que falta para alocar...
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>NF</TableHead>
                              <TableHead className="text-right">Item</TableHead>
                              <TableHead>Código</TableHead>
                              <TableHead>NCM</TableHead>
                              <TableHead className="text-right">Qtd NF</TableHead>
                              <TableHead className="text-right">Valor NF</TableHead>
                              <TableHead>SKU</TableHead>
                              <TableHead className="text-right">Qtd alocada</TableHead>
                              <TableHead className="text-right">Qtd pedido</TableHead>
                              <TableHead>Situação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {confNfQ.data!.map((r, i) => {
                              const meta = SITUACAO_NF[r.situacao ?? ""] ?? {
                                rotulo: r.situacao ?? "—",
                                badge: "bg-muted text-muted-foreground",
                                linha: undefined,
                              };
                              return (
                                <TableRow
                                  key={`${r.nf_linha_id ?? i}-${r.sku ?? "s"}-${i}`}
                                  className={meta.linha}
                                >
                                  <TableCell className="font-mono text-xs">
                                    {r.nf_numero ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right">{r.item_seq ?? "—"}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {r.codigo_nf ?? "—"}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{r.ncm ?? "—"}</TableCell>
                                  <TableCell className="text-right">{fmtNum(r.qtd_nf)}</TableCell>
                                  <TableCell className="text-right">
                                    {r.valor_nf === null || r.valor_nf === undefined
                                      ? "—"
                                      : fmtMoeda(r.valor_nf, "BRL")}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                                  <TableCell className="text-right">
                                    {fmtNum(r.qtd_alocada)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {fmtNum(r.qtd_pedido)}
                                  </TableCell>
                                  <TableCell>
                                    {(() => {
                                      const rat =
                                        r.nf_linha_id == null
                                          ? null
                                          : rateioPorLinhaNf.get(Number(r.nf_linha_id));
                                      if (!rat) {
                                        return (
                                          <Badge className={meta.badge} variant="outline">
                                            {meta.rotulo}
                                          </Badge>
                                        );
                                      }
                                      const dif = rat.qtdNf - rat.alocada;
                                      if (dif === 0) return <Selo estado="success">Rateio ok</Selo>;
                                      return (
                                        <Selo estado="destructive">
                                          {dif > 0
                                            ? `Falta ratear ${fmtNum(dif)}`
                                            : `Rateio excede em ${fmtNum(Math.abs(dif))}`}
                                        </Selo>
                                      );
                                    })()}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
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
                            <TableHead className="text-right">Qtd nesta invoice</TableHead>
                            <TableHead className="text-right">Declarado (invoice)</TableHead>
                            <TableHead className="text-right">A embarcar</TableHead>
                            <TableHead className="text-right">Custo pedido</TableHead>
                            <TableHead className="text-right">Custo invoice</TableHead>
                            <TableHead className="text-right">Δ preço</TableHead>
                            <TableHead>Situação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {confInvQ.data!.map((r, i) => {
                            const sit = SITUACAO_INV[r.situacao ?? ""] ?? {
                              rotulo: r.situacao ?? "—",
                              estado: "muted" as EstadoSelo,
                            };
                            const deltaPreco =
                              r.delta_preco != null && Number(r.delta_preco) !== 0;
                            return (
                              <TableRow
                                key={`${r.invoice_id}-${r.sku}-${i}`}
                                className={sit.linha}
                              >
                                <TableCell>{r.invoice_numero ?? "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_pedido)}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.qtd_invoice)}</TableCell>
                                <TableCell className="text-right">{fmtNum(r.declarado_invoice)}</TableCell>
                                <TableCell
                                  className={
                                    (r.a_embarcar ?? 0) > 0
                                      ? "text-right font-medium text-warning"
                                      : "text-right"
                                  }
                                >
                                  {fmtNum(r.a_embarcar)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtMoeda(r.custo_pedido, moeda)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtMoeda(r.custo_invoice, moeda)}
                                </TableCell>
                                <CelulaDinheiro
                                  valor={r.delta_preco}
                                  className={deltaPreco ? "font-medium text-warning" : undefined}
                                />
                                <TableCell>
                                  <Selo estado={sit.estado}>{sit.rotulo}</Selo>
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

            {/* ==================== SALDO ==================== */}
            <TabsContent value="saldo" className="mt-4">
              <SaldoPedidoTab pedidoId={pedidoId} />
            </TabsContent>

            {/* ==================== HISTÓRICO ==================== */}
            <TabsContent value="historico" className="mt-4">
              <HistoricoTab pedidoId={pedidoId} />
            </TabsContent>

          </Tabs>

          <LancarNfDialog
            open={nfDialog}
            onOpenChange={setNfDialog}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
          />
          <VincularNfDialog
            open={vincNfDialog}
            onOpenChange={setVincNfDialog}
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
          <EditarPedidoMercadoriaDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            pedidoId={pedidoId}
            onSaved={() => invalidarCompras(qc)}
          />

        </>
      )}
    </div>
  );
}

// ============================================================================
// Aba Histórico — importacao_pedido_evento
// ============================================================================

const ROTULO_TIPO_EVENTO: Record<string, string> = {
  criacao: "Criação",
  alteracao: "Alteração",
  mudanca_status: "Mudança de status",
  nf_vinculada: "NF vinculada",
  invoice_vinculada: "Invoice vinculada",
  observacao: "Observação",
};

interface EventoPedido {
  id: number;
  tipo: string | null;
  campo: string | null;
  valor_de: string | null;
  valor_para: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function HistoricoTab({ pedidoId }: { pedidoId: number }) {
  const eventosQ = useQuery({
    queryKey: ["importacao-pedido-evento", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_pedido_evento")
        .select("id, tipo, campo, valor_de, valor_para, payload, created_at")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoPedido[];
    },
  });

  if (eventosQ.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
      </div>
    );
  }
  if (eventosQ.isError) {
    return (
      <ErroBloco
        titulo="Falha ao carregar o histórico do pedido."
        erro={eventosQ.error}
        onRetry={() => eventosQ.refetch()}
      />
    );
  }
  const eventos = eventosQ.data ?? [];
  if (eventos.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhuma alteração registrada.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map((ev) => {
                const motivo =
                  ev.payload && typeof ev.payload === "object"
                    ? ((ev.payload as Record<string, unknown>).motivo as string | undefined)
                    : undefined;
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {ev.created_at
                        ? format(parseISO(ev.created_at), "dd/MM/yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ROTULO_TIPO_EVENTO[ev.tipo ?? ""] ?? ev.tipo ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>{ev.campo ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ev.valor_de ?? "—"}</TableCell>
                    <TableCell className="font-medium">{ev.valor_para ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[24rem]">
                      {motivo || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
