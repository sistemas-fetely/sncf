import { Badge } from "@/components/ui/badge";
import { AbasSiteSp } from "@/components/venda-direta/AbasSiteSp";
import { EstoqueSiteSpTab } from "@/components/venda-direta/EstoqueSiteSpTab";
import { ConteudoAba } from "@/components/AbaGate";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { CodProduto } from "@/components/produto/CodProduto";
import { LinkCartaoDialog } from "@/components/venda-direta/LinkCartao";
import { TrocarMeioPagamentoDialog } from "@/components/venda-direta/TrocarMeioPagamento";
import { TrocarCdVDDialog } from "@/components/venda-direta/TrocarCdVDDialog";
import { EscolhaCdLinhaVD } from "@/components/venda-direta/EscolhaCdLinhaVD";
import { controlesCdLinhaVD } from "@/components/venda-direta/escolherCdVD";
import { podeTrocarCdVD } from "@/components/venda-direta/trocarCdVD";
import { RemontarPagamentoDialog } from "@/components/venda-direta/RemontarPagamento";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll, abrirDetalhe } from "@/lib/navegacao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { abrirImpressaoVD } from "@/components/venda-direta/ImpressaoPedidoVD";
import {
  AlertTriangle, ArrowLeftRight, Ban, CheckCircle2, Copy, Link2, ExternalLink, List, PackageCheck, Plus, QrCode,
  Pencil, Printer, RefreshCw, RotateCcw, Settings, Truck, Wallet, Paperclip, type LucideIcon, } from "lucide-react";
import { AvisarClienteButton, ConfiguracoesVDDialog } from "@/components/venda-direta/MensagensVendaDireta";
import {
  ALERTA_FALTA, iconeFase, estadoDoTom, naoMapeada, temAlerta, useDimensoesVD,
  type ClassificacaoVD, type FiltroVD,
} from "@/components/venda-direta/FunilVD";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PipelineFases } from "@/components/vendas/PipelineFases";
import { ToggleCdB2c, abreviarCd } from "@/components/vendas/EscolhaCdB2c";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { fmtDataHora } from "@/lib/data";
import { COLUNAS_GESTAO_VD, fasesGestaoVD, filtrarGestaoVD, lerOrdemGestaoVD, ordenarGestaoVD, porCdGestaoVD, recentesGestaoVD, type ColunaGestaoVD } from "@/components/venda-direta/gestaoListaVD";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { alternarFiltroVD, lerFiltroVD } from "@/components/venda-direta/filtroGestaoVD";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { reprocessarFilaB2c } from "@/hooks/vendas/useB2c";
import {
  RegistrarRetiradaDialog, RegistrarEntregaDialog, type LinhaVD,
} from "@/components/venda-direta/AcoesVendaDireta";
import { QK_VD_GESTAO, invalidarVendaDireta } from "@/components/venda-direta/queryKeys";
import { DeclararCancelamentoDialog } from "@/components/devolucao/DeclararCancelamentoDialog";
import { useCancelamentosComNfSP } from "@/components/venda-direta/CancelamentoComNfVD";
import { ClienteVDSheet } from "@/components/venda-direta/ClienteVDSheet";
import { GavetaPedidoVD, useProdutosPorSku } from "@/components/venda-direta/GavetaPedidoVD";
import { DEVOLUCAO_ATIVA, QK_VD_DEVOLUCOES, useDevolucoesVD } from "@/components/venda-direta/DevolucaoVendaDireta";

// `situacao` segue alimentando só as AÇÕES; exibição (fase/etapa/rótulo/quem age) vem da view + dimensões.
type Situacao =
  | "aguardando_pagamento" | "descendo_bling" | "aguardando_nf" | "separacao"
  | "pronto_retirada" | "em_transporte" | "travado" | "pausado" | "entregue" | "cancelado" | "outro";

interface Linha extends LinhaVD, ClassificacaoVD {
  cliente_id?: string | null;
  recebido_em: string | null;
  cancelado_em: string | null;
  estagio: string | null;
  modal: "retirada" | "balcao" | "transportadora" | "sedex" | "pac" | "frete_fetely" | "entrega" | null;
  frete: { servico?: string | null; custo?: number | null; cobrado?: number | null; fonte?: string | null; gratis?: boolean | null } | null;
  pagamento: "pix" | "pix_safra" | "cartao" | "cartao_maquininha" | "bonificacao" | "conta_corrente_socio" | null;
  cliente_telefone: string | null;
  cliente_cpf_mascarado: string | null;
  endereco_entrega: Record<string, unknown> | null;
  pagamento_confirmado_em: string | null;
  link_pagamento: string | null;
  codigo_rastreio: string | null;
  rastreio_servico: string | null;
  fila_id: string | null;
  fila_erro: string | null;
  bling_pedido_numero: string | number | null;
  nf_numero: string | number | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  entrou_na_fase_em: string | null;
  situacao: Situacao;
  alerta_sem_pagamento: boolean | null;
  pagamento_desatualizado: boolean | null;
  faltando_site_sp: { sku: string; quantidade: number; saldo_site_sp: number }[] | null;
}


const MODAL_LABEL: Record<string, string> = {
  retirada: "Retirada", sedex: "SEDEX", pac: "PAC", entrega: "PAC", frete_fetely: "Frete Fetely",
};
const modalLabel = (m: string | null) => (m ? (MODAL_LABEL[m] ?? m) : "—");
const pagamentoLabel = (p: Linha["pagamento"]) => p === "pix" ? "PIX QR (antigo)" : p === "pix_safra" ? "Link PIX Safra" : p === "cartao" ? "Cartão" : p === "cartao_maquininha" ? "Maquininha" : p === "bonificacao" ? "Bonificação" : "—";
const FONTE_LABEL: Record<string, string> = { api: "cotação Correios", plano_b: "tabela (plano B)", tabela: "tabela Fetely" };


function tempoDesde(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function dataPagamento(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("day")}/${valor("month")} ${valor("hour")}:${valor("minute")}`;
}

interface Acao { k: string; label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; destrutiva?: boolean }

function BotaoIcone({ a }: { a: Acao }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={a.disabled ? 0 : -1}>
          <Button size="icon" variant="ghost" className={cn("h-8 w-8", a.destrutiva && "text-destructive hover:text-destructive")} aria-label={a.label} disabled={a.disabled} onClick={a.onClick}>
            <a.icon className="h-4 w-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{a.label}</TooltipContent>
    </Tooltip>
  );
}

export default function VendaDiretaGestao() {
  const [aba] = useAbaUrl("gestao");
  const qc = useQueryClient();
  const { podeEditar } = usePermissoesTela("tela.venda_direta_gestao");
  const devolucoesQ = useDevolucoesVD();
  const cancelNfQ = useCancelamentosComNfSP();
  const cancelNfPorPedido = cancelNfQ.data;
  const devolucaoPorPedido = useMemo(() => new Map((devolucoesQ.data ?? []).map((d) => [d.pedido_id, d])), [devolucoesQ.data]);
  useEffect(() => { if (devolucoesQ.error) toast.error(rawMessage(devolucoesQ.error)); }, [devolucoesQ.error]);
  // TELA-LEMBRA-ONDE-EU-ESTAVA: filtros de lista vivem na URL.
  const [nav, setNav] = useEstadoTela({ filtro: "", cd: "todos", vendedora: "todas", pagamento: "todos", ordem: "", busca: "", pagina: 1 });
  const filtro = useMemo(() => lerFiltroVD(nav.filtro), [nav.filtro]);
  const setFiltro = (f: FiltroVD | null) => setNav({ filtro: f ? `${f.tipo}:${f.codigo}` : "", pagina: 1 });
  const ordenacao = useMemo(() => lerOrdemGestaoVD(nav.ordem), [nav.ordem]);
  const ordenarPor = (coluna: ColunaGestaoVD) => {
    const inicial = COLUNAS_GESTAO_VD.find((c) => c.coluna === coluna)?.inicial ?? "asc";
    const dir = ordenacao?.coluna === coluna ? (ordenacao.dir === "asc" ? "desc" : "asc") : inicial;
    setNav({ ordem: ordenacao?.coluna === coluna && dir === inicial ? "" : `${coluna}:${dir}`, pagina: 1 });
  };
  const pipelineRef = useRef<HTMLDivElement>(null);
  const [alturaPipeline, setAlturaPipeline] = useState(0);
  useEffect(() => {
    const el = pipelineRef.current;
    if (!el) return;
    const medir = () => setAlturaPipeline(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aba]);
  const [config, setConfig] = useState(false);
  const dimQ = useDimensoesVD();
  useEffect(() => { if (dimQ.error) toast.error(rawMessage(dimQ.error)); }, [dimQ.error]);
  const busca = nav.busca;
  const setBusca = (v: string) => setNav({ busca: v });
  const pagina = nav.pagina;
  const setPagina = (v: number) => setNav({ pagina: v });
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [confManual, setConfManual] = useState<Linha | null>(null);
  const [retirada, setRetirada] = useState<Linha | null>(null);
  const [entrega, setEntrega] = useState<Linha | null>(null);
  const [linkCartao, setLinkCartao] = useState<Linha | null>(null);
  const [remontar, setRemontar] = useState<Linha | null>(null);
  const [trocarMeio, setTrocarMeio] = useState<Linha | null>(null);
  const [trocarCd, setTrocarCd] = useState<Linha | null>(null);
  const [pixNovo, setPixNovo] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<Linha | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [clienteSheet, setClienteSheet] = useState<{ parceiroId: string; pedidoId: string; filaId?: string; filaErro: string | null } | null>(null);
  const [gavetaId, setGavetaIdState] = useState<string | null>(() => searchParams.get("pedido"));
  // ?pedido={id} abre a gaveta; fechar remove o parâmetro.
  const setGavetaId = (id: string | null) => {
    setGavetaIdState(id);
    if (!id && searchParams.has("pedido")) {
      const n = new URLSearchParams(searchParams); n.delete("pedido"); setSearchParams(n, { replace: true });
    }
  };
  const [confirmaPausado, setConfirmaPausado] = useState<Linha | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const q = useQuery({
    queryKey: QK_VD_GESTAO,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Linha[]> => {
      const linhas: Linha[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("vw_venda_direta_gestao" as never)
          .select("*").order("recebido_em", { ascending: false }).order("id").range(inicio, inicio + 499);
        if (error) throw error;
        const lote = (data ?? []) as unknown as Linha[];
        linhas.push(...lote);
        if (lote.length < 500) return linhas;
      }
    },
  });

  const reprocessar = useMutation({
    mutationFn: (l: Linha) => {
      if (!l.fila_id) throw new Error("Pedido sem vínculo com a fila Bling.");
      return reprocessarFilaB2c([l.fila_id], "bling", "Reprocessado na gestão VD");
    },
    onSuccess: (_r, l) => {
      toast.success(`Descida de ${l.id_externo} reenviada para a fila`);
      void invalidarVendaDireta(qc);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  // Uma leitura em lotes de TODOS os pedidos, não apenas da página visível.
  const idsLista = useMemo(() => (q.data ?? []).map((l) => l.id).sort(), [q.data]);
  const cdPedidoQ = useQuery({
    queryKey: ["vd-gestao-cd-pedido", idsLista],
    enabled: q.isSuccess,
    queryFn: async () => {
      const pedidos: { id: string; origem_centro_id: string | null }[] = [];
      for (let inicio = 0; inicio < idsLista.length; inicio += 300) {
        const { data, error } = await supabase.from("pedidos").select("id, origem_centro_id").in("id", idsLista.slice(inicio, inicio + 300));
        if (error) throw error;
        pedidos.push(...(data ?? []));
      }
      const centroIds = [...new Set(pedidos.flatMap((p) => p.origem_centro_id ? [p.origem_centro_id] : []))];
      const { data: cds, error } = await supabase.from("centro_distribuicao").select("id, codigo, nome, loja_bling_id, cnpj_emitente").order("nome");
      if (error) throw error;
      const centros = (cds ?? []).filter((c) => centroIds.includes(c.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const codigoPorId = new Map(centros.map((c) => [c.id, c.codigo]));
      const porPedido = new Map<string, string>();
      for (const p of pedidos) {
        const codigo = p.origem_centro_id ? codigoPorId.get(p.origem_centro_id) : undefined;
        if (codigo) porPedido.set(p.id, codigo);
      }
      return { centros, porPedido };
    },
  });
  useEffect(() => {
    if (cdPedidoQ.isError) toast.error(`Falha ao ler o CD dos pedidos: ${rawMessage(cdPedidoQ.error)}`);
  }, [cdPedidoQ.isError, cdPedidoQ.error]);
  const centrosPorPedido = useMemo(() => cdPedidoQ.data?.porPedido ?? new Map<string, string>(), [cdPedidoQ.data]);
  const visiveis = useMemo(() => recentesGestaoVD(q.data ?? []), [q.data]);
  const baseCd = useMemo(() => porCdGestaoVD(visiveis, nav.cd, centrosPorPedido), [visiveis, nav.cd, centrosPorPedido]);
  const fases = useMemo(() => fasesGestaoVD(dimQ.data?.fases ?? [], baseCd).map((f) => {
    const Icon = iconeFase(f.icone);
    return { ...f, icone: <Icon className="h-4 w-4" />, eh_desvio: f.fora_do_fluxo };
  }), [dimQ.data, baseCd]);
  const devolvidos = useMemo(() => new Set((devolucoesQ.data ?? []).filter((d) => d.status === "concluida").map((d) => d.pedido_id)), [devolucoesQ.data]);
  const linhas = useMemo(() => ordenarGestaoVD(filtrarGestaoVD(baseCd, { busca, filtro, vendedora: nav.vendedora, pagamento: nav.pagamento }, devolvidos), ordenacao, centrosPorPedido, devolvidos), [baseCd, busca, filtro, nav.vendedora, nav.pagamento, devolvidos, ordenacao, centrosPorPedido]);
  const vendedoras = useMemo(() => [...new Map((q.data ?? []).flatMap((l) => l.vendedor_id && l.vendedor_nome ? [[l.vendedor_id, l.vendedor_nome] as const] : [])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")), [q.data]);
  const fasesAlfabeticas = useMemo(() => [...(dimQ.data?.fases ?? [])].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")), [dimQ.data]);
  const andamento = baseCd.filter((l) => l.fase !== "cancelado" && l.fase !== "entregue");
  const valorAndamento = andamento.reduce((v, l) => v + Number(l.valor_liquido ?? 0), 0);
  const primeiraRender = useRef(true);
  useEffect(() => {
    if (primeiraRender.current) { primeiraRender.current = false; return; }
    setPagina(1);
  }, [nav.filtro, busca, nav.cd, nav.vendedora, nav.pagamento]);
  const pag = linhas.slice((pagina - 1) * tamanho, pagina * tamanho);
  useFocoAoVoltar({ pronto: q.isSuccess && cdPedidoQ.isSuccess, idsVisiveis: pag.map((l) => l.id) });
  useRestaurarScroll(null, q.isSuccess && cdPedidoQ.isSuccess);
  const abrirPedido = (id: string) => abrirDetalhe(navigate, location, `/pedidos/${id}`, { foco: id, label: "Pedidos Site SP" });
  const skusFalta = useMemo(() => Array.from(new Set(pag.flatMap((l) => (l.faltando_site_sp ?? []).map((f) => f.sku)))), [pag]);
  const prodFalta = useProdutosPorSku(skusFalta);
  const carregando = q.isLoading || cdPedidoQ.isLoading || dimQ.isLoading;
  const erroLista = q.error ?? cdPedidoQ.error ?? dimQ.error;
  const copiar = async (valor: string | number, rotulo: string) => {
    try { await navigator.clipboard.writeText(String(valor)); toast.success(`${rotulo} copiado.`); }
    catch (e) { toast.error(rawMessage(e)); }
  };

  const gaveta = gavetaId ? (q.data ?? []).find((l) => l.id === gavetaId) ?? null : null;

  // Entrada única: o orquestrador lê o momento do pedido e escolhe a esteira.
  const tentarCancelar = (l: Linha) => setCancelar(l);

  /** Ações de etapa (sem Avisar — ele é um componente próprio). */
  const acoesEtapa = (l: Linha, naGaveta: boolean): Acao[] => {
    if (!podeEditar) return [];
    const a: Acao[] = [];
    if (l.situacao === "aguardando_pagamento") {
      if (l.pagamento === "cartao_maquininha") a.push({ k: "conf", label: "Anexar comprovante", icon: Paperclip, onClick: () => setConfManual(l) });
      if (l.pagamento === "cartao" || l.pagamento === "pix_safra") a.push({ k: "link", label: "Link de pagamento", icon: Link2, onClick: () => setLinkCartao(l) });
      if (l.pagamento === "cartao") a.push({ k: "conf", label: "Confirmar pagamento manual", icon: Wallet, onClick: () => setConfManual(l) });
      if (l.pagamento === "pix" && !l.pagamento_desatualizado) a.push({ k: "conf", label: "Confirmar pagamento manual", icon: Wallet, onClick: () => setConfManual(l), disabled: !l.provisao_id });
    }
    if (l.situacao === "aguardando_pagamento" && !l.pagamento_confirmado_em && !DEVOLUCAO_ATIVA.has(devolucaoPorPedido.get(l.id)?.status ?? "concluida"))
      a.push({ k: "editar", label: "Editar pedido", icon: Pencil, onClick: () => abrirDetalhe(navigate, location, `/pedidos/venda-direta/${l.id}/editar`, { foco: l.id, label: "Pedidos Site SP" }) });
    if (l.situacao === "aguardando_pagamento" && !l.pagamento_confirmado_em) a.push({ k: "trocar", label: "Trocar meio de pagamento", icon: ArrowLeftRight, onClick: () => setTrocarMeio(l) });
    if (l.pagamento_desatualizado) a.push({ k: "remontar", label: "Remontar pagamento", icon: RefreshCw, onClick: () => setRemontar(l) });
    if (l.situacao === "travado" && l.fila_id) {
      a.push({ k: "repro", label: "Reprocessar descida", icon: RotateCcw, onClick: () => reprocessar.mutate(l), disabled: reprocessar.isPending });
    }
    if (naGaveta && l.situacao === "pausado" && l.fila_id) {
      a.push({ k: "repro", label: "Reprocessar descida", icon: RotateCcw, onClick: () => setConfirmaPausado(l), disabled: reprocessar.isPending });
    }
    if (l.situacao === "pronto_retirada") a.push({ k: "ret", label: "Registrar retirada", icon: PackageCheck, onClick: () => setRetirada(l) });
    if (l.situacao === "em_transporte" && l.modal === "frete_fetely") a.push({ k: "ent", label: "Registrar entrega", icon: Truck, onClick: () => setEntrega(l) });
    return a;
  };
  const podeCancelar = (l: Linha) => podeEditar && l.situacao !== "cancelado" && !cancelNfPorPedido?.get(l.id)?.aberta && (l.situacao !== "entregue" || !!l.nf_numero);
  const rotuloCancelar = (l: Linha) => l.nf_numero ? "Solicitar cancelamento com NF" : l.pagamento_confirmado_em ? "Solicitar cancelamento com reembolso" : "Cancelar";
  const avisoDe = (l: Linha, icone: boolean) =>
    podeEditar && (l.alerta_sem_pagamento || l.situacao === "aguardando_pagamento"
      ? <AvisarClienteButton linha={l} chave="cobrar_pagamento" label="Cobrar no WhatsApp" icone={icone} />
      : <AvisarClienteButton linha={l} icone={icone} />);

  const fechar = (fn: (v: null) => void) => () => { fn(null); void invalidarVendaDireta(qc); };

  return (
    <PageShell>
      <CasaPageHeader
        title="Pedidos Site SP"
        breadcrumb={[{ label: "Operação" }, { label: "Pedidos Site SP" }]}
        subtitle={`Venda direta do Site SP, do pagamento à entrega${q.dataUpdatedAt ? ` · atualizada às ${new Date(q.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={podeEditar && aba !== "estoque-site-sp" && (
          <div className="flex gap-2">
            <Button variant="outline" size="icon" aria-label="Configurações dos Pedidos Site SP" onClick={() => setConfig(true)}><Settings className="h-4 w-4" /></Button>
            <Button asChild><Link to="/pedidos/venda-direta/novo"><Plus className="mr-1 h-4 w-4" />Novo pedido</Link></Button>
          </div>
        )}
      />
      <AbasSiteSp />
      {aba === "estoque-site-sp" ? <ConteudoAba slug="tela.venda_direta_gestao"><EstoqueSiteSpTab /></ConteudoAba> : <>
      <TooltipProvider>
        <div className="space-y-4" style={{ "--fila-topo-colado": `${64 + alturaPipeline}px` } as CSSProperties}>
          <div ref={pipelineRef} className="sticky top-16 z-20 -mx-6 space-y-2 border-b border-border bg-background px-6 py-2 max-md:static max-md:[&>div]:flex-wrap max-md:[&>div:last-child>button]:min-w-0 max-md:[&>div:last-child>button]:basis-[calc(33.333%-0.5rem)] max-md:[&>div:first-child>button]:whitespace-normal max-md:[&>div:first-child>button]:max-w-full">
            <ToggleCdB2c centros={cdPedidoQ.data?.centros ?? []} valor={nav.cd} onChange={(cd) => setNav({ cd, pagina: 1 })} />
            <PipelineFases fases={fases} estagioAtivo={filtro?.tipo === "fase" ? filtro.codigo : null}
              onClickEstagio={(codigo) => setFiltro(alternarFiltroVD(filtro, { tipo: "fase", codigo }))}
              onLimparFiltro={() => setFiltro(null)} carregando={carregando}
              erro={erroLista ? rawMessage(erroLista) : null} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Buscar por pedido, cliente, telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-[240px]" />
            <Select value={filtro?.tipo === "fase" ? filtro.codigo : "todas"} onValueChange={(v) => setFiltro(v === "todas" ? null : { tipo: "fase", codigo: v })}>
              <SelectTrigger className="w-[190px]"><SelectValue placeholder="Fase: todas" /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Fase: todas</SelectItem>{fasesAlfabeticas.map((f) => <SelectItem key={f.codigo} value={f.codigo}>{f.rotulo}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={nav.vendedora} onValueChange={(vendedora) => setNav({ vendedora, pagina: 1 })}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Vendedora: todas" /></SelectTrigger>
              <SelectContent><SelectItem value="todas">Vendedora: todas</SelectItem>{vendedoras.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={nav.pagamento} onValueChange={(pagamento) => setNav({ pagamento, pagina: 1 })}>
              <SelectTrigger className="w-[210px]"><SelectValue placeholder="Pagamento: todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Pagamento: todos</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem><SelectItem value="bonificacao">Bonificação</SelectItem>
                <SelectItem value="conta_corrente_socio">Conta corrente sócio</SelectItem><SelectItem value="devolvido">Devolvido</SelectItem><SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
            <span className="ml-auto text-xs text-muted-foreground">{linhas.length} pedidos · {andamento.length} em andamento ({formatBRL(valorAndamento)})</span>
          </div>
          {erroLista ? <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            Erro ao carregar: {rawMessage(erroLista)}
            <Button variant="outline" size="sm" onClick={() => { void q.refetch(); void cdPedidoQ.refetch(); void dimQ.refetch(); }}>Tentar novamente</Button>
          </div> : <Card><CardContent className="p-0">
            <Table containerClassName="overflow-visible" className="table-fixed [&_th]:px-2 [&_th]:text-xs [&_th_button]:max-w-full [&_th_button]:whitespace-normal [&_td]:px-2 [&_td]:text-xs [&_td]:break-words max-md:block max-md:[&_colgroup]:hidden max-md:[&_thead]:hidden max-md:[&_tbody]:block max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_td]:block max-md:[&_td]:min-w-0 max-md:[&_td]:py-2 max-md:[&_td:before]:mb-1 max-md:[&_td:before]:block max-md:[&_td:before]:text-[10px] max-md:[&_td:before]:text-muted-foreground max-md:[&_td:before]:content-[attr(data-coluna)]">
              <colgroup>{COLUNAS_GESTAO_VD.map((c) => <col key={c.coluna} style={{ width: c.largura }} />)}<col style={{ width: "10%" }} /></colgroup>
              <TableHeader><TableRow className={LINHA_CABECALHO_COLADO}>
                {COLUNAS_GESTAO_VD.map((c) => <CabecalhoOrdenavel key={c.coluna} rotulo={c.rotulo}
                  dir={ordenacao?.coluna === c.coluna ? ordenacao.dir : null} onOrdenar={() => ordenarPor(c.coluna)}
                  alinharDireita={c.coluna === "valor"} className={c.coluna === "valor" ? "text-right" : undefined} />)}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {carregando ? <TableRow><TableCell colSpan={12} className="py-8 text-center"><Skeleton className="mx-auto h-4 w-32" /></TableCell></TableRow>
                : pag.length === 0 ? <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">{q.data?.length ? "Nenhum pedido para esse filtro." : "Nenhum pedido do Site SP ainda."}</TableCell></TableRow>
                : pag.map((l) => {
                  const controlesCd = controlesCdLinhaVD(l.etapa, podeEditar, podeTrocarCdVD(l));
                  const etapa = acoesEtapa(l, false);
                  const aviso = avisoDe(l, true);
                  const devolucao = devolucaoPorPedido.get(l.id);
                  const reembolsoAtivo = devolucao && DEVOLUCAO_ATIVA.has(devolucao.status) ? devolucao : null;
                  const reembolsoConcluido = devolucao?.status === "concluida";
                  const cancelNfAberto = cancelNfPorPedido?.get(l.id)?.aberta ?? false;
                  return <TableRow key={l.id} data-foco-id={l.id} className="cursor-pointer" onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, input, label, [role=combobox]")) return;
                    setGavetaId(l.id);
                  }}>
                    <TableCell data-coluna="Pedido" className="font-medium">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setGavetaId(l.id)}>{l.id_externo}</Button>
                        {l.fila_erro && <Tooltip><TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-destructive" aria-label="Erro na fila" /></TooltipTrigger><TooltipContent className="max-w-sm whitespace-pre-wrap">{l.fila_erro}</TooltipContent></Tooltip>}
                      </div>
                    </TableCell>
                    <TableCell data-coluna="Bling">
                      <div className="flex flex-col items-start gap-0.5">
                        {l.marcos?.bling_numero && <Button variant="ghost" title="Copiar número do pedido Bling" className="h-auto max-w-full gap-1 p-0 font-mono text-xs hover:text-gold" onClick={(e) => { e.stopPropagation(); void copiar(l.marcos?.bling_numero ?? "", "Pedido Bling"); }}><span className="break-all">#{l.marcos.bling_numero}</span><Copy className="h-3 w-3 shrink-0 text-muted-foreground" /></Button>}
                        {l.marcos?.nf_numero && <Button variant="ghost" title="Copiar NF" className="h-auto max-w-full gap-1 p-0 font-mono text-xs text-muted-foreground hover:text-gold" onClick={(e) => { e.stopPropagation(); void copiar(l.marcos?.nf_numero ?? "", "NF"); }}><span>NF {l.marcos.nf_numero}</span><Copy className="h-3 w-3 shrink-0" /></Button>}
                        {!l.marcos?.bling_numero && !l.marcos?.nf_numero && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell data-coluna="Data / Idade">{fmtDataHora(l.recebido_em)}<div className="text-xs text-muted-foreground">na fase há {tempoDesde(l.entrou_na_fase_em)}</div></TableCell>
                    <TableCell data-coluna="Cliente">
                      {l.cliente_id ? <Tooltip><TooltipTrigger asChild><Button variant="link" className="h-auto max-w-full whitespace-normal p-0 text-left text-xs" onClick={() => {
                        if (l.cliente_id) setClienteSheet({ parceiroId: l.cliente_id, pedidoId: l.id, filaId: l.fila_erro ? l.fila_id ?? undefined : undefined, filaErro: l.fila_erro });
                      }}>{l.cliente_nome ?? "—"}</Button></TooltipTrigger><TooltipContent>Editar cliente</TooltipContent></Tooltip> : <div>{l.cliente_nome ?? "—"}</div>}
                      <div className="text-xs tabular-nums text-muted-foreground">{l.cliente_telefone}</div>
                      <div className="text-xs text-muted-foreground">{l.vendedor_nome}</div>
                    </TableCell>
                    <TableCell data-coluna="CD">{abreviarCd(centrosPorPedido.get(l.id))}</TableCell>
                    <TableCell data-coluna="Valor" className="text-right tabular-nums">
                      {formatBRL(l.valor_liquido)}
                      {Number(l.credito_aplicado ?? 0) > 0 && <div className="text-xs text-muted-foreground">Crédito −{formatBRL(Number(l.credito_aplicado))} · A pagar {formatBRL(Number(l.valor_a_pagar ?? 0))}</div>}
                      {l.frete && <Tooltip><TooltipTrigger asChild><span className="block cursor-help text-xs text-muted-foreground">{l.frete.gratis || Number(l.frete.cobrado ?? 0) === 0 ? "frete grátis" : `frete ${formatBRL(l.frete.cobrado)}`}</span></TooltipTrigger><TooltipContent>Custo {l.frete.custo != null ? formatBRL(l.frete.custo) : "—"} · fonte {l.frete.fonte ? (FONTE_LABEL[l.frete.fonte] ?? l.frete.fonte) : "—"}</TooltipContent></Tooltip>}
                    </TableCell>
                    <TableCell data-coluna="Estágio">
                          {naoMapeada(l) ? (
                            <Selo className="max-w-full whitespace-normal" estado="destructive">Situação não mapeada — avisar Sistemas</Selo>
                          ) : reembolsoAtivo && !cancelNfAberto ? (
                            <Link
                              to={`/devolucoes?aba=reembolso&pedido=${l.id}`}
                              title="Abrir reembolso em Devoluções e Correções › Cancelamento sem NF"
                              aria-label="Abrir reembolso em Devoluções e Correções › Cancelamento sem NF"
                              className="inline-block cursor-pointer rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Selo className="max-w-full whitespace-normal" estado={estadoDoTom(l.etapa_tom)}>{l.etapa_rotulo}</Selo>
                            </Link>
                          ) : (
                            <Selo className="max-w-full whitespace-normal" estado={estadoDoTom(l.etapa_tom)}>{l.etapa_rotulo}</Selo>
                          )}
                    </TableCell>
                    <TableCell data-coluna="Dono" className="text-xs text-muted-foreground">{l.responsavel_rotulo ?? "—"}</TableCell>
                    <TableCell data-coluna="Próxima ação">
                      <div>{l.proxima_acao}</div>
                      <div className="mt-1 space-y-0.5 text-xs">
                        {l.etapa_detalhe && <div className={l.etapa_tom === "critico" ? "text-destructive-strong" : "text-muted-foreground"}>{l.etapa_detalhe}</div>}
                        {controlesCd.mostrarEscolha && <EscolhaCdLinhaVD pedido={l} podeEditar={podeEditar} />}
                            {temAlerta(l, ALERTA_FALTA) && (
                              <Tooltip>
                                <TooltipTrigger asChild><span className="block cursor-help text-destructive-strong">Falta no Site SP</span></TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  {prodFalta.isError && <div>{rawMessage(prodFalta.error)}</div>}
                                  {(l.faltando_site_sp ?? []).map((f) => {
                                    const p = prodFalta.data?.get(f.sku);
                                    return <div key={f.sku} className="tabular-nums"><CodProduto chave={f.sku} variant="compacto" />{p?.nome_comercial ? ` ${p.nome_comercial}` : ""} · pedido {f.quantidade} · saldo {f.saldo_site_sp}</div>;
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            )}
                      </div>
                    </TableCell>
                        <TableCell data-coluna="Pagamento">
                          {reembolsoConcluido ? (
                            <div>
                              <div className="text-muted-foreground">Devolvido</div>
                              <div className="text-xs tabular-nums text-muted-foreground">{formatBRL(devolucao.valor)}</div>
                            </div>
                          ) : l.pagamento === "conta_corrente_socio" ? (
                            <Badge variant="outline" className="max-w-full whitespace-normal">Conta corrente sócio</Badge>
                          ) : l.pagamento === "bonificacao" ? (
                            <div>
                              <Badge variant="outline" className="max-w-full whitespace-normal border-info/50 bg-info/10 text-foreground">Bonificação</Badge>
                              <div className="text-xs text-muted-foreground">sem cobrança</div>
                            </div>
                          ) : l.pagamento_confirmado_em ? (
                            <div>
                              <div className="flex items-center gap-1 font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Pago</div>
                              <div className="text-xs tabular-nums text-muted-foreground">{pagamentoLabel(l.pagamento)} · {dataPagamento(l.pagamento_confirmado_em)}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-muted-foreground">Aguardando</div>
                              <div className="text-xs text-muted-foreground">{pagamentoLabel(l.pagamento)} · há {tempoDesde(l.recebido_em)}</div>
                            </div>
                          )}
                        </TableCell>
                    <TableCell data-coluna="Rastreio" className="text-xs text-muted-foreground">
                      <div>{modalLabel(l.rastreio_servico ?? l.modal)}</div>
                      {l.codigo_rastreio && <span className="break-all font-mono">{l.codigo_rastreio}</span>}
                    </TableCell>
                        <TableCell data-coluna="Ações" className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-0.5">
                            {aviso}
                            {etapa.map((a) => <BotaoIcone key={a.k} a={a} />)}
                            {controlesCd.mostrarTroca && <BotaoIcone a={{ k: "trocar-cd", label: "Trocar CD", icon: ArrowLeftRight, onClick: () => setTrocarCd(l) }} />}
                            {(aviso || etapa.length > 0) && <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />}
                            <BotaoIcone a={{ k: "itens", label: "Ver itens", icon: List, onClick: () => setGavetaId(l.id) }} />
                            <BotaoIcone a={{ k: "imprimir", label: "Imprimir", icon: Printer, onClick: () => abrirImpressaoVD(l.id) }} />
                            {podeCancelar(l) && <BotaoIcone a={{ k: "cancel", label: rotuloCancelar(l), icon: l.pagamento_confirmado_em || l.nf_numero ? RotateCcw : Ban, onClick: () => tentarCancelar(l), destrutiva: true }} />}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                                  <Link to={`/pedidos/${l.id}`} aria-label="Abrir pedido" onClick={(e) => { e.preventDefault(); abrirPedido(l.id); }}><ExternalLink className="h-4 w-4" /></Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir pedido</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
            <RodapePaginacao total={linhas.length} pagina={pagina} tamanhoPagina={tamanho} tela="venda_direta_gestao" onPagina={setPagina} onTamanhoPagina={setTamanho} />
          </CardContent></Card>}
        </div>

        {clienteSheet && (
          <ClienteVDSheet
            parceiroId={clienteSheet.parceiroId}
            pedidoId={clienteSheet.pedidoId}
            filaId={clienteSheet.filaId}
            filaErro={clienteSheet.filaErro}
            open
            onOpenChange={(v) => { if (!v) setClienteSheet(null); }}
          />
        )}

        <GavetaPedidoVD
          linha={gaveta}
          modalLabel={modalLabel}
          onClose={() => setGavetaId(null)}
          acoes={gaveta && (
            <>
              {avisoDe(gaveta, false)}
              {acoesEtapa(gaveta, true).map((a) => (
                <Button key={a.k} size="sm" variant="outline" disabled={a.disabled} onClick={a.onClick}>
                  <a.icon className="mr-1 h-3.5 w-3.5" />{a.label}
                </Button>
              ))}
              {podeCancelar(gaveta) && (
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => tentarCancelar(gaveta)}>
                  {gaveta.pagamento_confirmado_em || gaveta.nf_numero ? <RotateCcw className="mr-1 h-3.5 w-3.5" /> : <Ban className="mr-1 h-3.5 w-3.5" />}{rotuloCancelar(gaveta)}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => abrirImpressaoVD(gaveta.id)}><Printer className="mr-1 h-3.5 w-3.5" />Imprimir</Button>
              <Button size="sm" asChild><Link to={`/pedidos/${gaveta.id}`} onClick={(e) => { e.preventDefault(); abrirPedido(gaveta.id); }}><ExternalLink className="mr-1 h-3.5 w-3.5" />Abrir pedido</Link></Button>
            </>
          )}
          devolucao={gaveta ? devolucaoPorPedido.get(gaveta.id) ?? null : null}
          cancelamentoNf={gaveta ? cancelNfPorPedido?.get(gaveta.id) ?? null : null}
          classificacao={gaveta}
        />
      </TooltipProvider>

      <AlertDialog open={!!confirmaPausado} onOpenChange={(v) => !v && setConfirmaPausado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocessar {confirmaPausado?.id_externo}?</AlertDialogTitle>
            <AlertDialogDescription>Este pedido foi pausado de propósito. Reprocessar mesmo assim?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmaPausado) reprocessar.mutate(confirmaPausado); setConfirmaPausado(null); }}>Reprocessar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RegistrarRetiradaDialog linha={retirada} onClose={fechar(setRetirada)} />
      {trocarCd && <TrocarCdVDDialog pedido={trocarCd} onClose={() => setTrocarCd(null)} />}
      <RegistrarEntregaDialog linha={entrega} onClose={fechar(setEntrega)} />
      <RemontarPagamentoDialog
        linha={remontar}
        onClose={fechar(setRemontar)}
        onPix={() => { void invalidarVendaDireta(qc); }}
        onCartao={(l) => setLinkCartao(l)}
      />
      {confManual && (
        <ConfirmarPagamentoDialog
          pedidoId={confManual.id}
          provisaoId={confManual.provisao_id ?? undefined}
          aberto={!!confManual}
          modo="sops"
          aoFechar={() => { setConfManual(null); void invalidarVendaDireta(qc); }}
        />
      )}
      <ConfiguracoesVDDialog aberto={config} onClose={() => setConfig(false)} />
      <LinkCartaoDialog linha={linkCartao} onClose={fechar(setLinkCartao)} />
      <TrocarMeioPagamentoDialog linha={trocarMeio} onClose={fechar(setTrocarMeio)} />
      <DeclararCancelamentoDialog
        pedidoId={cancelar?.id}
        open={!!cancelar}
        onOpenChange={(o) => { if (!o) { setCancelar(null); qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES }); void invalidarVendaDireta(qc); } }}
        onConcluido={() => { qc.invalidateQueries({ queryKey: QK_VD_DEVOLUCOES }); void invalidarVendaDireta(qc); }}
      />
      </>}
    </PageShell>
  );
}
