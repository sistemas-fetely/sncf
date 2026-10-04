import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import { fmtMoeda, VERDE } from "@/lib/compras/lancamento-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardIndicador } from "@/components/ui/card-indicador";

import { Badge } from "@/components/ui/badge";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";
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
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { CHAVE_EMBARQUE_PAINEL } from "@/lib/compras/embarque-painel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import LancarNfDialog from "@/components/compras/LancarNfDialog";
import LancarInvoiceDialog from "@/components/compras/LancarInvoiceDialog";
import EditarPedidoMercadoriaDialog from "@/components/compras/EditarPedidoMercadoriaDialog";
import SaldoPedidoTab from "@/components/compras/SaldoPedidoTab";
import VincularNfDialog from "@/components/compras/VincularNfDialog";
import ReceberForaXpmDialog from "@/components/compras/ReceberForaXpmDialog";
import ReguaPedido, {
  CHAVE_REGUA,
  usePedidoRegua,
} from "@/components/compras/ReguaPedido";
import { ParaQueServe } from "@/components/compras/ParaQueServe";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import {
  RodapePaginacao,
  DEFAULT_PAGE_SIZE,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";



// ============================================================================
// Types
// ============================================================================

interface PreviaExclusao {
  pedido_id: number;
  numero_pedido: string | null;
  pode_excluir: boolean;
  bloqueios: string[] | null;
  linhas_que_serao_apagadas: number | null;
  excluido: boolean | null;
}

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

interface LinhaCustos {
  linha_id: number;
  sku: string | null;
  cod_cadastro: string | null;
  produto: string | null;
  codigo_fornecedor: string | null;
  qtd_pedida: number | null;
  qtd_kits: number | null;
  total_caixas_master: number | null;
  total_caixas_inner: number | null;
  moeda_pedido: string | null;
  nfs: number | null;
  qtd_faturada: number | null;
  total_nfs: number | null;
  ultimo_custo_nf: number | null;
  custo_medio_nf: number | null;
  menor_custo_hist: number | null;
  menor_custo_nf: string | null;
  maior_custo_hist: number | null;
  maior_custo_nf: string | null;
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
  return <CardIndicador compacto rotulo={rotulo} valor={valor} />;
}


// ============================================================================
// Página
// ============================================================================

export default function ChegadaMercadoriaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const pedidoId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const subParam = searchParams.get("sub");
  const subAba = ["linhas", "documentos", "saldo", "historico"].includes(
    subParam ?? "",
  )
    ? (subParam as string)
    : "linhas";
  useEffect(() => {
    if (subParam === "conferencia") {
      const proximos = new URLSearchParams(searchParams);
      proximos.delete("sub");
      setSearchParams(proximos, { replace: true });
    }
  }, [subParam, searchParams, setSearchParams]);
  const [nfDialog, setNfDialog] = useState(false);
  const [invDialog, setInvDialog] = useState(false);
  const [nfAberta, setNfAberta] = useState<number | null>(null);
  const [invAberta, setInvAberta] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [vincNfDialog, setVincNfDialog] = useState(false);
  const navigate = useNavigate();
  const [receberNf, setReceberNf] = useState<NfRow | null>(null);


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

  // Doutrina #167: documento de remessa entra pelo embarque.
  const embarquesPedidoQ = useQuery({
    queryKey: ["pedido-mercadoria-embarques", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data: vincs, error } = await (supabase as any)
        .from("importacao_embarque_pedido")
        .select("embarque_id")
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      const ids = Array.from(new Set(((vincs ?? []) as Array<{ embarque_id: number }>).map((v) => Number(v.embarque_id))));
      if (ids.length === 0) return [] as Array<{ id: number; ref_rocabella: string | null }>;
      const { data: embs, error: e2 } = await (supabase as any)
        .from("importacao_embarque")
        .select("id, ref_rocabella")
        .in("id", ids);
      if (e2) throw e2;
      return (embs ?? []) as Array<{ id: number; ref_rocabella: string | null }>;
    },
  });
  const embarquesDoPedido = embarquesPedidoQ.data ?? [];
  // Só libera as portas do pedido quando sabemos que ele não tem embarque.
  const portaPeloPedido = embarquesPedidoQ.isSuccess && embarquesDoPedido.length === 0;

  const pedido = pedidoQ.data;
  const moeda = pedido?.moeda ?? "BRL";
  const reguaQ = usePedidoRegua(pedidoId);
  const exigeEmbarque = reguaQ.data?.exige_embarque !== false;

  const irSubAba = (sub: string) => {
    const proximos = new URLSearchParams(searchParams);
    if (sub === "linhas") proximos.delete("sub");
    else proximos.set("sub", sub);
    setSearchParams(proximos, { replace: true });
  };

  // Léxico único: A faturar (fornecedor deve NF) · A confirmar (XPM deve conferência)
  const saldoQ = useQuery({
    queryKey: ["compra-tres-camadas-pedido-cabecalho", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas_pedido")
        .select(
          "a_faturar, a_confirmar, aguarda_recebimento, falta_xpm, custo_projetado, delta_custo, delta_custo_pct, custo_comparavel, custo_incomparavel_motivo",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        a_faturar: number | null;
        a_confirmar: number | null;
        aguarda_recebimento: number | null;
        falta_xpm: number | null;
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

  const custosQ = useQuery({
    queryKey: ["vw_importacao_linha_custos", pedidoId],
    enabled: Number.isFinite(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_linha_custos")
        .select("*")
        .eq("importacao_pedido_id", pedidoId)
        .order("cod_cadastro", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LinhaCustos[];
    },
  });

  // PADRÃO FETELY DE LISTAGEM: moldura TabelaFetely + cabeçalho congelado +
  // RodapePaginacao. Busca local; totais somam o recorte filtrado.
  const [buscaLinhas, setBuscaLinhas] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const linhasFiltradas = useMemo(() => {
    const l = custosQ.data ?? [];
    const q = buscaLinhas.trim().toLowerCase();
    if (!q) return l;
    return l.filter((r) =>
      [r.cod_cadastro, r.sku, r.produto, r.codigo_fornecedor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [custosQ.data, buscaLinhas]);

  const totalPaginasLinhas = Math.max(1, Math.ceil(linhasFiltradas.length / tamanho));
  const paginaLinhas = Math.min(pagina, totalPaginasLinhas);
  const linhasPagina = linhasFiltradas.slice(
    (paginaLinhas - 1) * tamanho,
    paginaLinhas * tamanho,
  );

  /** Número da NF sem zeros à esquerda (ex.: "000055261" → "55261"). */
  const nfSemZeros = (nf: string | null | undefined) => (nf ? nf.replace(/^0+/, "") : "");

  const totaisCustos = useMemo(() => {
    const l = linhasFiltradas;
    let algumNf = false;
    let totalNfs = 0;
    for (const r of l) {
      if (r.total_nfs != null) {
        algumNf = true;
        totalNfs += Number(r.total_nfs);
      }
    }
    return {
      qtdPedida: l.reduce((s, r) => s + Number(r.qtd_pedida ?? 0), 0),
      qtdFaturada: l.reduce((s, r) => s + Number(r.qtd_faturada ?? 0), 0),
      totalNfs: algumNf ? totalNfs : null,
    };
  }, [linhasFiltradas]);

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

  const nfIdsCard = useMemo(
    () => (nfsQ.data?.nfs ?? []).map((n) => Number(n.id)),
    [nfsQ.data],
  );

  const nfIds = nfIdsCard;

  const recebimentosQ = useQuery({
    queryKey: ["nf-recebimento", nfIdsCard],
    enabled: nfIdsCard.length > 0,
    queryFn: async () => {
      const { data: movs, error: e1 } = await (supabase as any)
        .from("movimentacao_estoque")
        .select("nf_entrada_id, centro_id, referencia")
        .in("nf_entrada_id", nfIds)
        .eq("motivo", "recebimento_importacao");
      if (e1) throw e1;
      const lista = (movs ?? []) as Array<{
        nf_entrada_id: number;
        centro_id: string;
        referencia: string | null;
      }>;
      if (lista.length === 0) return new Map<number, string>();
      const centroIds = [...new Set(lista.map((m) => m.centro_id))];
      const { data: centros, error: e2 } = await (supabase as any)
        .from("centro_distribuicao")
        .select("id, codigo, nome, rotulo_curto")
        .in("id", centroIds);
      if (e2) throw e2;
      const centroPorId = new Map(
        ((centros ?? []) as Array<{
          id: string;
          codigo: string;
          nome: string;
          rotulo_curto: string | null;
        }>).map((c) => [c.id, c.rotulo_curto ?? c.nome ?? c.codigo]),
      );
      const mapa = new Map<number, string>();
      lista.forEach((m) => {
        if (!mapa.has(m.nf_entrada_id)) {
          mapa.set(m.nf_entrada_id, centroPorId.get(m.centro_id) ?? m.referencia ?? "—");
        }
      });
      return mapa;
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

  const qc = useQueryClient();

  // ---------------- Exclusão de pedido (restaurada do commit 7c5824ec) ----------------
  const [excluirAberto, setExcluirAberto] = useState(false);
  const permExcluir = usePermissaoAcaoOuSuperAdmin("acao.excluir_pedido_importacao");
  const semPermExcluir = permExcluir.carregando || !permExcluir.permitido;
  const tituloPermExcluir = !permExcluir.permitido && !permExcluir.carregando ? "Sem permissão: acao.excluir_pedido_importacao" : undefined;
  const [previaExclusao, setPreviaExclusao] = useState<PreviaExclusao | null>(null);
  const [checandoExclusao, setChecandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const abrirExclusao = async () => {
    setExcluirAberto(true);
    setPreviaExclusao(null);
    setChecandoExclusao(true);
    try {
      const { data, error } = await supabase.rpc("excluir_pedido_importacao", {
        p_pedido_id: pedidoId,
        p_confirmar: false,
      });
      if (error) throw error;
      const raw = Array.isArray(data) ? data[0] : data;
      setPreviaExclusao((raw as unknown as PreviaExclusao | null) ?? null);
    } catch (e) {
      toast.error(`Não foi possível checar a exclusão: ${formatError(e)}`);
      setExcluirAberto(false);
    } finally {
      setChecandoExclusao(false);
    }
  };

  const confirmarExclusao = async () => {
    setExcluindo(true);
    try {
      const { data, error } = await supabase.rpc("excluir_pedido_importacao", {
        p_pedido_id: pedidoId,
        p_confirmar: true,
      });
      if (error) throw error;
      const linha = (Array.isArray(data) ? data[0] : data) as unknown as PreviaExclusao | null;
      if (linha && linha.excluido === false) {
        toast.error(
          linha.bloqueios?.length
            ? `Exclusão barrada: ${linha.bloqueios.join(" · ")}`
            : "O banco não confirmou a exclusão.",
        );
        setPreviaExclusao(linha);
        return;
      }
      toast.success(`Pedido ${pedidoQ.data?.numero_pedido ?? ""} excluído.`);
      setExcluirAberto(false);
      setPreviaExclusao(null);
      invalidarCompras(qc);
      void qc.invalidateQueries({ queryKey: ["importacao-pedidos-painel"] });
      void qc.invalidateQueries({ queryKey: ["importacao-embarques"] });
      void qc.invalidateQueries({ queryKey: CHAVE_EMBARQUE_PAINEL });
      navigate("/vendas/produto/chegada-mercadoria?aba=painel");
    } catch (e) {
      toast.error(`Falha ao excluir: ${formatError(e)}`);
    } finally {
      setExcluindo(false);
    }
  };

  const CHAVE_LINHA_CUSTOS = (pedidoId: number) =>
    ["vw_importacao_linha_custos", pedidoId] as const;
  const invalidarReguaELinhaCustos = () => {
    void qc.invalidateQueries({ queryKey: CHAVE_REGUA(pedidoId) });
    void qc.invalidateQueries({ queryKey: CHAVE_LINHA_CUSTOS(pedidoId) });
    void qc.invalidateQueries({ queryKey: CHAVE_HISTORICO(pedidoId) });
  };

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
        to="/vendas/produto/chegada-mercadoria?aba=pedidos"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Chegada de Mercadoria
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
                  <BotaoGuardado
                    slug="acao.excluir_pedido_importacao"
                    rotuloAcao="Excluir pedido de importação"
                    contexto={{ pedido_id: pedido.id }}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="Excluir pedido"
                    aria-label={`Excluir pedido ${pedido.numero_pedido}`}
                    onClick={() => void abrirExclusao()}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </BotaoGuardado>
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

          <ReguaPedido pedidoId={pedidoId} onIrSubAba={irSubAba} />

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
? `${delta > 0 ? "+" : "−"}${fmtMoeda(Math.abs(delta), "BRL")} · ${pct != null ? fmtNum(Math.abs(pct), 1) : "—"}% vs PI original`
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
            {exigeEmbarque && <Stat rotulo="ETD" valor={fmtDate(pedido.etd)} />}
            {exigeEmbarque && <Stat rotulo="ETA" valor={fmtDate(pedido.eta)} />}
            <Stat rotulo="NFs" valor={fmtNum(pedido.nfs)} />
            {exigeEmbarque && <Stat rotulo="Invoices" valor={fmtNum(pedido.invoices)} />}
            <Stat
              rotulo="A faturar"
              valor={
                <span className={(saldoQ.data?.a_faturar ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}>
                  {fmtNum(saldoQ.data?.a_faturar ?? 0)}
                </span>
              }
            />
            <Stat
              rotulo="Aguarda recebimento"
              valor={
                <span className={(saldoQ.data?.aguarda_recebimento ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}>
                  {fmtNum(saldoQ.data?.aguarda_recebimento ?? 0)}
                  {Number(saldoQ.data?.falta_xpm ?? 0) > 0 && (
                    <span className="ml-1 text-xs text-destructive">+ {fmtNum(saldoQ.data?.falta_xpm)} em falta</span>
                  )}
                </span>
              }
            />
          </div>

          <Tabs value={subAba} onValueChange={irSubAba}>
            <TabsList>
              <TabsTrigger value="linhas">Linhas</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="saldo">Saldo</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>

            </TabsList>


            {/* ---------------- LINHAS ---------------- */}
            <TabsContent value="linhas" className="mt-4 space-y-4">
              <ParaQueServe>
                O que foi pedido e o que veio nas NFs, por produto: quantidade, custo realizado e
                a faixa histórica de preço.
              </ParaQueServe>
              <TabelaFetely
                busca={{
                  valor: buscaLinhas,
                  aoMudar: (v) => {
                    setBuscaLinhas(v);
                    setPagina(1);
                  },
                  placeholder: "Buscar por código, produto ou cód. fornecedor…",
                }}
                carregando={custosQ.isLoading}
                erro={custosQ.error ? (custosQ.error as Error).message : null}
                aoTentarNovamente={() => custosQ.refetch()}
                vazio={{ mensagem: "Este pedido ainda não tem linhas." }}
                semResultado="Nenhuma linha para essa busca."
                total={(custosQ.data ?? []).length}
                exibidos={linhasFiltradas.length}
                rotulo="linhas"
              >
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-auto max-h-[calc(100vh-18rem)]">
                      <Table containerClassName="overflow-visible">
                        <TableHeader className="sticky top-0 z-10 bg-background">
                          <TableRow>
                            <TableHead>Cód. cadastro</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead>Cód. fornecedor</TableHead>
                            {exigeEmbarque && <TableHead className="text-right">Kits</TableHead>}
                            {exigeEmbarque && (
                              <TableHead className="text-right">Cx. master</TableHead>
                            )}
                            {exigeEmbarque && (
                              <TableHead className="text-right">Cx. inner</TableHead>
                            )}
                            <TableHead className="text-right">Qtd pedida</TableHead>
                            <TableHead className="text-right">Qtd faturada</TableHead>
                            <TableHead className="text-right">Último custo (NF)</TableHead>
                            <TableHead className="text-right">Custo médio (NF)</TableHead>
                            <TableHead className="text-right">Menor preço (hist.)</TableHead>
                            <TableHead className="text-right">Maior preço (hist.)</TableHead>
                            <TableHead className="text-right">Total NFs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linhasPagina.map((r) => {
                            const pedida = Number(r.qtd_pedida ?? 0);
                            const faturada = Number(r.qtd_faturada ?? 0);
                            const acimaPedido = faturada > pedida;
                            const semNf = Number(r.nfs ?? 0) === 0;
                            return (
                              <TableRow key={r.linha_id}>
                                <TableCell>
                                  {r.cod_cadastro ? (
                                    <>
                                      <div className="font-mono text-xs">{r.cod_cadastro}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {r.sku ?? "—"}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="font-mono text-xs">{r.sku ?? "—"}</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className="max-w-[320px] truncate"
                                  title={r.produto ?? undefined}
                                >
                                  {r.produto ?? "—"}
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {r.codigo_fornecedor ?? "—"}
                                </TableCell>
                                {exigeEmbarque && (
                                  <TableCell className="text-right">
                                    {fmtNum(r.qtd_kits)}
                                  </TableCell>
                                )}
                                {exigeEmbarque && (
                                  <TableCell className="text-right">
                                    {fmtNum(r.total_caixas_master)}
                                  </TableCell>
                                )}
                                {exigeEmbarque && (
                                  <TableCell className="text-right">
                                    {fmtNum(r.total_caixas_inner)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right">
                                  {fmtNum(r.qtd_pedida)}
                                </TableCell>
                                <TableCell
                                  className={`text-right ${
                                    acimaPedido
                                      ? "text-warning"
                                      : faturada === 0
                                        ? "text-muted-foreground"
                                        : ""
                                  }`}
                                  title={
                                    acimaPedido
                                      ? `+${fmtNum(faturada - pedida)} além do pedido`
                                      : undefined
                                  }
                                >
                                  {fmtNum(r.qtd_faturada)}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  title="Preço unitário da NF mais recente deste pedido"
                                >
                                  {semNf || r.ultimo_custo_nf == null
                                    ? "—"
                                    : fmtMoeda(r.ultimo_custo_nf, "BRL")}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  title="Média ponderada pela quantidade de todas as NFs deste pedido"
                                >
                                  {semNf || r.custo_medio_nf == null
                                    ? "—"
                                    : fmtMoeda(r.custo_medio_nf, "BRL")}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  title={
                                    nfSemZeros(r.menor_custo_nf)
                                      ? `Menor preço unitário em todas as NFs de compra deste produto — NF ${nfSemZeros(r.menor_custo_nf)}`
                                      : "Menor preço unitário em todas as NFs de compra deste produto"
                                  }
                                >
                                  {r.menor_custo_hist == null
                                    ? "—"
                                    : fmtMoeda(r.menor_custo_hist, "BRL")}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  title={
                                    nfSemZeros(r.maior_custo_nf)
                                      ? `Maior preço unitário em todas as NFs de compra deste produto — NF ${nfSemZeros(r.maior_custo_nf)}`
                                      : "Maior preço unitário em todas as NFs de compra deste produto"
                                  }
                                >
                                  {r.maior_custo_hist == null
                                    ? "—"
                                    : fmtMoeda(r.maior_custo_hist, "BRL")}
                                </TableCell>
                                <TableCell className="text-right">
                                  {semNf || r.total_nfs == null
                                    ? "—"
                                    : fmtMoeda(r.total_nfs, "BRL")}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={3 + (exigeEmbarque ? 3 : 0)}>
                              {buscaLinhas.trim() ? "Total (filtrado)" : "Total"}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtNum(totaisCustos.qtdPedida)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtNum(totaisCustos.qtdFaturada)}
                            </TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-right">
                              {totaisCustos.totalNfs == null
                                ? "—"
                                : fmtMoeda(totaisCustos.totalNfs, "BRL")}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                    <RodapePaginacao
                      total={linhasFiltradas.length}
                      pagina={paginaLinhas}
                      tamanhoPagina={tamanho}
                      tela="pedido_linhas_custos"
                      onPagina={setPagina}
                      onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
                    />
                  </CardContent>
                </Card>
              </TabelaFetely>
            </TabsContent>

            {/* ---------------- DOCUMENTOS ---------------- */}
            <TabsContent value="documentos" className="mt-4 space-y-6">
              <ParaQueServe>
                NFs e invoices deste pedido. Em pedido de importação, eles entram pelo embarque; em pedido nacional, lance aqui.
              </ParaQueServe>
              {embarquesPedidoQ.isError ? (
                <ErroBloco
                  titulo="Falha ao verificar o embarque do pedido"
                  erro={embarquesPedidoQ.error}
                  onRetry={() => void embarquesPedidoQ.refetch()}
                />
              ) : embarquesDoPedido.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-info/40 bg-info/10 p-3 text-sm">
                  <span>
                    Documentos da remessa (NF e invoice) entram pelo embarque{" "}
                    <span className="font-mono">
                      {embarquesDoPedido.map((e) => e.ref_rocabella ?? e.id).join(", ")}
                    </span>
                    . Eles valem para todos os pedidos que vieram juntos.
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {embarquesDoPedido.map((e) => (
                      <Button key={e.id} size="sm" variant="outline" asChild>
                        <Link
                          to={`/vendas/produto/chegada-mercadoria?aba=painel&embarque=${e.id}&secao=documentos`}
                        >
                          Abrir embarque {e.ref_rocabella ?? e.id}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {/* NFs */}
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Notas fiscais
                  </CardTitle>
                  {portaPeloPedido && (
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
                  )}
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
                            <div className="flex items-center gap-3 p-3 text-sm hover:bg-muted/50">
                              <button
                                type="button"
                                className="flex flex-1 items-center gap-3 text-left"
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
                                {nf.container && (
                                  <span className="text-muted-foreground">{nf.container}</span>
                                )}
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {linhas.length} linha(s)
                                </span>
                              </button>
                              {recebimentosQ.data?.has(Number(nf.id)) ? (
                                <Badge variant="secondary">
                                  Recebida · {recebimentosQ.data.get(Number(nf.id))}
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReceberNf(nf)}
                                >
                                  Receber fora do XPM
                                </Button>
                              )}
                            </div>
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
                  {portaPeloPedido && (
                  <Button
                    size="sm"
                    style={{ backgroundColor: VERDE }}
                    className="text-white hover:opacity-90"
                    onClick={() => setInvDialog(true)}
                  >
                    Lançar Invoice
                  </Button>
                  )}
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
                              {inv.container && (
                                <span className="text-muted-foreground">{inv.container}</span>
                              )}
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

            {/* ==================== SALDO ==================== */}
            <TabsContent value="saldo" className="mt-4 space-y-4">
              <ParaQueServe>
                O que falta chegar e de quem é a próxima ação, por produto: pedido → NF →
                conferência da XPM.
              </ParaQueServe>
              <SaldoPedidoTab pedidoId={pedidoId} />
            </TabsContent>

            {/* ==================== HISTÓRICO ==================== */}
            <TabsContent value="historico" className="mt-4 space-y-4">
              <ParaQueServe>Tudo o que aconteceu com o pedido, do mais recente ao mais antigo: NFs, rateios, recebimentos, chegada e edições.</ParaQueServe>
              <HistoricoTab pedidoId={pedidoId} />
            </TabsContent>

          </Tabs>

          <LancarNfDialog
            open={nfDialog}
            onOpenChange={(open) => {
              setNfDialog(open);
              if (!open) invalidarReguaELinhaCustos();
            }}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
          />
          <VincularNfDialog
            open={vincNfDialog}
            onOpenChange={(open) => {
              setVincNfDialog(open);
              if (!open) invalidarReguaELinhaCustos();
            }}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
          />
          <LancarInvoiceDialog
            open={invDialog}
            onOpenChange={(open) => {
              setInvDialog(open);
              if (!open) invalidarReguaELinhaCustos();
            }}
            pedidoId={pedidoId}
            fornecedorId={pedido.fornecedor_id}
            moedaPadrao={pedido.moeda}
          />
          <EditarPedidoMercadoriaDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            pedidoId={pedidoId}
            onSaved={() => {
              invalidarCompras(qc);
              invalidarReguaELinhaCustos();
            }}
          />

          <Dialog
            open={excluirAberto}
            onOpenChange={(v) => {
              if (!v && !excluindo) {
                setExcluirAberto(false);
                setPreviaExclusao(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir pedido {pedido.numero_pedido}</DialogTitle>
                <DialogDescription>
                  Nada foi apagado ainda. O banco checa primeiro se o pedido pode sair.
                </DialogDescription>
              </DialogHeader>

              {checandoExclusao ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checando o pedido...
                </div>
              ) : previaExclusao ? (
                previaExclusao.pode_excluir ? (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                    {Number(previaExclusao.linhas_que_serao_apagadas ?? 0)} linha(s) serão apagadas
                    junto com o pedido. Isso não volta atrás.
                  </div>
                ) : (
                  <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <div>Este pedido não pode ser excluído:</div>
                    <ul className="list-disc pl-5">
                      {(previaExclusao.bloqueios ?? []).map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                      {(previaExclusao.bloqueios ?? []).length === 0 && (
                        <li>O banco recusou a exclusão sem detalhar o motivo.</li>
                      )}
                    </ul>
                  </div>
                )
              ) : null}

              <DialogFooter>
                <Button
                  variant="ghost"
                  disabled={excluindo}
                  onClick={() => {
                    setExcluirAberto(false);
                    setPreviaExclusao(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={!previaExclusao?.pode_excluir || excluindo || checandoExclusao || semPermExcluir}
                  title={tituloPermExcluir}
                  onClick={() => void confirmarExclusao()}
                >
                  {excluindo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Excluir mesmo assim
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {receberNf && (
            <ReceberForaXpmDialog
              open={!!receberNf}
              onOpenChange={(v) => {
                if (!v) setReceberNf(null);
                if (!v) invalidarReguaELinhaCustos();
              }}
              nfId={Number(receberNf.id)}
              nfNumero={`${receberNf.numero}${receberNf.serie ? `/${receberNf.serie}` : ""}`}
            />
          )}

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

const CHAVE_HISTORICO = (pedidoId: number) => ["vw_importacao_pedido_timeline", pedidoId] as const;

interface EventoTimeline {
  pedido_id: number;
  quando: string;
  tipo: string;
  titulo: string | null;
  detalhe: string | null;
  quantidade: number | null;
  valor: number | null;
  autor_id: string | null;
  autor: string | null;
}

const TIPO_TIMELINE: Record<string, { rotulo: string; estado: "muted" | "info" | "success" }> = {
  criacao: { rotulo: "Pedido", estado: "muted" },
  alteracao: { rotulo: "Edição", estado: "muted" },
  mudanca_status: { rotulo: "Status", estado: "info" },
  nf: { rotulo: "NF", estado: "info" },
  alocacao: { rotulo: "Rateio", estado: "muted" },
  recebimento: { rotulo: "Recebimento", estado: "success" },
  chegada: { rotulo: "Chegada", estado: "success" },
  invoice: { rotulo: "Invoice", estado: "info" },
};

const FILTROS_TIMELINE: { chave: string; rotulo: string; tipos: string[] }[] = [
  { chave: "nf", rotulo: "NF", tipos: ["nf"] },
  { chave: "alocacao", rotulo: "Rateio", tipos: ["alocacao"] },
  { chave: "recebimento", rotulo: "Recebimento", tipos: ["recebimento"] },
  { chave: "chegada", rotulo: "Chegada", tipos: ["chegada"] },
  { chave: "pedido", rotulo: "Pedido", tipos: ["criacao", "alteracao", "mudanca_status"] },
  { chave: "invoice", rotulo: "Invoice", tipos: ["invoice"] },
];

const FMT_QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function HistoricoTab({ pedidoId }: { pedidoId: number }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const q = useQuery({
    queryKey: CHAVE_HISTORICO(pedidoId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_pedido_timeline")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("quando", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoTimeline[];
    },
  });

  const todos = q.data ?? [];
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const tipos = FILTROS_TIMELINE.find((f) => f.chave === filtro)?.tipos;
    return todos.filter((e) => {
      if (tipos && !tipos.includes(e.tipo)) return false;
      if (!t) return true;
      return (e.titulo ?? "").toLowerCase().includes(t) || (e.detalhe ?? "").toLowerCase().includes(t);
    });
  }, [todos, busca, filtro]);

  useEffect(() => setPagina(1), [busca, filtro, tamanho]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const fatia = filtradas.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

  return (
    <TabelaFetely
      busca={{ valor: busca, aoMudar: setBusca, placeholder: "Buscar no histórico…" }}
      filtros={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant={filtro === "todos" ? "secondary" : "ghost"} onClick={() => setFiltro("todos")}
            disabled={todos.length === 0} className={cn(todos.length === 0 && "text-muted-foreground")}>
            Todos · {todos.length}
          </Button>
          {FILTROS_TIMELINE.map((f) => {
            const n = todos.filter((e) => f.tipos.includes(e.tipo)).length;
            return (
              <Button key={f.chave} size="sm" variant={filtro === f.chave ? "secondary" : "ghost"}
                onClick={() => setFiltro(f.chave)} disabled={n === 0} className={cn(n === 0 && "text-muted-foreground")}>
                {f.rotulo} · {n}
              </Button>
            );
          })}
        </div>
      }
      carregando={q.isLoading}
      erro={q.isError ? formatError(q.error) : null}
      aoTentarNovamente={() => q.refetch()}
      vazio={{ mensagem: "Nada aconteceu com este pedido ainda." }}
      semResultado="Nenhum evento para esse filtro."
      total={todos.length}
      exibidos={filtradas.length}
      rotulo="eventos"
    >
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-18rem)]">
            <Table containerClassName="overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="whitespace-nowrap">Quando</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Quem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fatia.map((e, i) => {
                  const t = TIPO_TIMELINE[e.tipo] ?? { rotulo: e.tipo, estado: "muted" as const };
                  return (
                    <TableRow key={`${e.quando}-${e.tipo}-${i}`}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                        {e.quando ? FMT_QUANDO.format(new Date(e.quando)).replace(",", "") : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Selo estado={t.estado}>{t.rotulo}</Selo>
                          <span className="text-sm">{e.titulo ?? ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[28rem]">{e.detalhe || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.quantidade == null ? "—" : fmtNum(e.quantidade)}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.valor == null ? "—" : fmtMoeda(e.valor, "BRL")}</TableCell>
                      <TableCell className="text-sm">{e.autor || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <RodapePaginacao total={filtradas.length} pagina={paginaAtual} tamanhoPagina={tamanho}
            tela="pedido_historico" onPagina={setPagina} onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)} />
        </CardContent>
      </Card>
    </TabelaFetely>
  );
}
