import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Selo } from "@/components/ui/selo";
import { usePedidosFila } from "@/hooks/pedidos/usePedidosFila";
import { usePedidoRisco, usePedidoRiscoFaixas, RISCO_COR_TOKEN } from "@/hooks/pedidos/usePedidoRisco";
import { usePedidoAlerta, ALERTA_COR_TOKEN, type PedidoAlerta } from "@/hooks/pedidos/usePedidoAlerta";
import { usePedidoRelogio } from "@/hooks/pedidos/usePedidoRelogio";
import type { PedidoRisco } from "@/hooks/pedidos/usePedidoRisco";
import { usePedidosEntregaLote, type EntregaLinhaInfo } from "@/hooks/pedidos/usePedidoEntrega";
import { useDownloadNfPdf } from "@/hooks/nf/useDownloadNfPdf";
import { nomeArquivoNf } from "@/lib/nf/nome-arquivo";
import { useLiberacaoExpedicaoLote, type LiberacaoExpedicao } from "@/hooks/pedidos/useLiberacaoExpedicao";
import { useCoberturaPedidos, usePoliticaCobertura, type CoberturaPedido, type PoliticaCobertura } from "@/lib/pedidoDestaque";
import { CelulaEntregaFila, LinhaNfFila } from "@/components/pedidos/CelulasFilaPedidos";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageCircle, MoreHorizontal, FileSpreadsheet, Tag, Download, Flame, Loader2, FileText, AlertTriangle, BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  classeSituacao,
  metaSituacao,
  rotuloSituacao,
  TOM_CLASSES,
} from "@/lib/pedidos/situacao-financeira";
import { formatDateBR } from "@/lib/format-currency";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { EmpurrarXpmLinhaDialog } from "@/components/pedidos/dialogs/EmpurrarXpmLinhaDialog";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { TabelaCadastroDialog } from "@/components/pedidos/dialogs/TabelaCadastroDialog";
import { ExportarPedidoDialog } from "@/components/pedidos/dialogs/ExportarPedidoDialog";
import { Button } from "@/components/ui/button";
import { BotaoSplitPedido } from "@/components/pedidos/BotaoSplitPedido";

import {
  EstagioBadge, FormatoIdade,
} from "./BadgesPedido";
import { MarcacaoPedido } from "./MarcacaoPedido";
import { useAtualizarUrgencia } from "@/hooks/pedidos/useAtualizarUrgencia";
import { useNivel } from "@/hooks/useNivel";
import { URGENCIA_LABELS, type UrgenciaDeclarada, type AreaPedido, type EstagioPedido, type PedidoFilaItem } from "@/types/pedido";


type OrdenacaoFila = "cronologico" | "risco" | "entrada_paga";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = 20;
const PAGE_SIZE_STORAGE_KEY = "fetely:pedidos:fila:page-size";



function buildPageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

interface Props {
  area: AreaPedido | "todas";
  estagioInicial?: EstagioPedido | "todos";
  /** Múltiplos estágios (vindos dos cards do pipeline) */
  estagios?: EstagioPedido[];
  apenasAtivos?: boolean;
  /** Espelha o toggle do pipeline: traz apenas cancelados para a fila. */
  incluirCancelados?: boolean;
  /** Espelha a tarja de risco alto do pipeline. */
  somenteRiscoAlto?: boolean;
}

interface EstadoVazioFilaProps {
  termoBusca: string;
  estagios?: EstagioPedido[];
  estagioFilter: EstagioPedido | "todos";
  usarEstagiosMultiplos: boolean;
  situacaoFilter: string;
  formaPgtoFilter: string;
  liberacaoFilter: string;
  marcacaoFilter: string;
  somenteComAlerta: boolean;
  somenteRiscoAlto?: boolean;
  setBusca: (v: string) => void;
  setSituacaoFilter: (v: string) => void;
  setFormaPgtoFilter: (v: string) => void;
  setLiberacaoFilter: (v: string) => void;
  setMarcacaoFilter: (v: string) => void;
  setSomenteComAlerta: (v: boolean) => void;
}

function EstadoVazioFila({
  termoBusca,
  estagios,
  estagioFilter,
  usarEstagiosMultiplos,
  situacaoFilter,
  formaPgtoFilter,
  liberacaoFilter,
  marcacaoFilter,
  somenteComAlerta,
  somenteRiscoAlto,
  setBusca,
  setSituacaoFilter,
  setFormaPgtoFilter,
  setLiberacaoFilter,
  setMarcacaoFilter,
  setSomenteComAlerta,
}: EstadoVazioFilaProps) {
  const temBusca = termoBusca.length > 0;
  const temFiltrosTabela =
    situacaoFilter !== "todas" ||
    formaPgtoFilter !== "todas" ||
    liberacaoFilter !== "todas" ||
    marcacaoFilter !== "todas" ||
    somenteComAlerta;
  const estagioAtivo = usarEstagiosMultiplos
    ? (estagios ?? []).filter((e): e is EstagioPedido => e !== undefined)
    : estagioFilter !== "todos"
      ? [estagioFilter]
      : [];
  const temEstagio = estagioAtivo.length > 0;
  const temFiltrosAtivos =
    temBusca || temFiltrosTabela || temEstagio || somenteComAlerta || somenteRiscoAlto;

  const limparFiltrosTabela = () => {
    setSituacaoFilter("todas");
    setFormaPgtoFilter("todas");
    setLiberacaoFilter("todas");
    setMarcacaoFilter("todas");
    setSomenteComAlerta(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-foreground">
        {temFiltrosAtivos
          ? "Nenhum pedido combina com os filtros ativos."
          : "Nenhum pedido nesta fila."}
      </p>

      {temFiltrosAtivos && (
        <>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {temBusca && (
              <Badge variant="outline" className="text-[11px] font-normal">
                busca: &quot;{termoBusca}&quot;
              </Badge>
            )}
            {estagioAtivo.map((e) => (
              <EstagioBadge key={e} estagio={e} />
            ))}
            {situacaoFilter !== "todas" && (
              <Badge variant="outline" className="text-[11px] font-normal">
                situação: {situacaoFilter}
              </Badge>
            )}
            {formaPgtoFilter !== "todas" && (
              <Badge variant="outline" className="text-[11px] font-normal">
                pagamento: {formaPgtoFilter}
              </Badge>
            )}
            {liberacaoFilter !== "todas" && (
              <Badge variant="outline" className="text-[11px] font-normal">
                liberação: {liberacaoFilter}
              </Badge>
            )}
            {marcacaoFilter !== "todas" && (
              <Badge variant="outline" className="text-[11px] font-normal">
                marcação: {marcacaoFilter}
              </Badge>
            )}
            {somenteComAlerta && (
              <Badge variant="outline" className="text-[11px] font-normal">
                só com alerta
              </Badge>
            )}
            {somenteRiscoAlto && (
              <Badge variant="outline" className="text-[11px] font-normal">
                só risco alto
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-center">
            {temBusca && (
              <Button size="sm" variant="outline" onClick={() => setBusca("")}>
                Limpar busca
              </Button>
            )}
            {temFiltrosTabela && (
              <Button size="sm" variant="outline" onClick={limparFiltrosTabela}>
                Limpar filtros da tabela
              </Button>
            )}
          </div>

          {temEstagio && !temFiltrosTabela && !temBusca && !somenteComAlerta && !somenteRiscoAlto && (
            <p className="text-xs text-muted-foreground">
              O estágio vem do card selecionado acima.
            </p>
          )}
        </>
      )}
    </div>
  );
}





/** COBERTURA-E-COBRANCA (24/08/2026): a coluna Estoque mede cobertura de estoque
 *  (percentual de itens do pedido com lastro, vindo de vw_pedido_cobertura).
 *  A coluna Cobrança mede instrumento de cobrança do dinheiro em aberto
 *  (boleto registrado / em remessa / nenhum), vindo de vw_pedido_lastro_cobranca. */
type LastroCobranca = {
  pedido_id: string;
  lastro: "registrado" | "em_remessa" | "boleto_sem_registro" | "sem_instrumento" | "nao_aplica";
  lastro_rotulo: string | null;
  valor_aberto: number | null;
  valor_registrado: number | null;
  valor_em_remessa: number | null;
  valor_boleto_sem_registro: number | null;
  valor_sem_instrumento: number | null;
  tem_vencido_sem_lastro: boolean | null;
  titulos: number | null;
};

const COBRANCA_META: Record<string, { texto: string; classe: string }> = {
  registrado: { texto: "Boleto registrado", classe: "border-success/50 text-success" },
  em_remessa: { texto: "Em remessa", classe: "border-warning/50 text-warning" },
  boleto_sem_registro: { texto: "SEM REGISTRO", classe: "border-destructive/50 text-destructive" },
  sem_instrumento: { texto: "SEM INSTRUMENTO", classe: "border-destructive/50 text-destructive" },
};

function CelulaCobranca({ cobranca }: { cobranca: LastroCobranca | undefined }) {
  const meta = cobranca ? COBRANCA_META[cobranca.lastro] : undefined;
  if (!cobranca || !meta) return <span className="text-muted-foreground">—</span>;

  const resumo = [
    cobranca.valor_registrado ? `Registrado ${fmtBRL.format(cobranca.valor_registrado)}` : null,
    cobranca.valor_em_remessa ? `Em remessa ${fmtBRL.format(cobranca.valor_em_remessa)}` : null,
    cobranca.valor_boleto_sem_registro
      ? `Sem registro ${fmtBRL.format(cobranca.valor_boleto_sem_registro)}`
      : null,
    cobranca.valor_sem_instrumento
      ? `Sem instrumento ${fmtBRL.format(cobranca.valor_sem_instrumento)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const mostraValor =
    cobranca.lastro === "boleto_sem_registro" || cobranca.lastro === "sem_instrumento";

  return (
    <div className="space-y-0.5">
      <Badge
        variant="outline"
        className={cn("rounded px-1.5 py-0 text-[10px]", meta.classe)}
        title={resumo || cobranca.lastro_rotulo || meta.texto}
      >
        {meta.texto}
      </Badge>
      {mostraValor && (
        <p className="text-xs text-muted-foreground">
          {fmtBRL.format(cobranca.valor_aberto || 0)}
          {cobranca.tem_vencido_sem_lastro ? <span className="text-destructive"> · vencido</span> : null}
        </p>
      )}
    </div>
  );
}

function CelulaEstoque({ cob, estagio, politica }: { cob: CoberturaPedido | undefined; estagio?: string | null; politica?: PoliticaCobertura }) {
  if (politica && !politica.mostra_na_fila) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!cob) {
    return <span className="text-muted-foreground">—</span>;
  }

  const pct = Math.round(cob.pct_coberto);
  const itensTotal = Math.round(cob.itens_total);
  const itensCobertos = Math.round(cob.itens_cobertos);
  const itensParciais = Math.round(cob.itens_parciais);
  const itensDescobertos = Math.round(cob.itens_descobertos);
  const itensSeparados = Math.round(cob.itens_separados);
  const itensProblematicos = itensParciais + itensDescobertos;
  const unTotal = Math.round(cob.un_total);
  const unCobertas = Math.round(cob.un_cobertas);
  const unDescobertas = Math.round(cob.un_descobertas);

  const tooltip = [
    politica?.rotulo ? politica.rotulo : null,
    `Itens: ${itensCobertos} cobertos · ${itensParciais} parciais · ${itensDescobertos} descobertos`,
    `Unidades: ${unCobertas} de ${unTotal} com lastro`,
    politica?.fonte === "lastro_livre"
      ? "Estagio nao reserva estoque — medido contra a sobra livre, sem posicao de fila."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (cob.cobertura_pedido === "separado") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="rounded px-1.5 py-0 text-[10px] border-border text-muted-foreground gap-1"
            >
              Separado
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs max-w-[220px] whitespace-pre-line">
              {`Separacao fechada pela XPM · ${itensSeparados} de ${itensTotal} itens\nA peca ja saiu da prateleira, mesmo antes da NF.`}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (cob.cobertura_pedido === "coberto") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="rounded px-1.5 py-0 text-[10px] border-success/50 text-success gap-1"
            >
              100%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs max-w-[220px] whitespace-pre-line">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const config =
    cob.cobertura_pedido === "descoberto"
      ? { classe: "border-destructive/50 text-destructive", icone: true }
      : { classe: "border-warning/50 text-warning", icone: true };

  const sublinhado =
    itensProblematicos === 1
      ? `1 de ${itensTotal} itens · ${unDescobertas} un sem lastro`
      : `${itensProblematicos} de ${itensTotal} itens · ${unDescobertas} un sem lastro`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="space-y-0.5">
            <Badge
              variant="outline"
              className={cn("rounded px-1.5 py-0 text-[10px] tabular-nums gap-1", config.classe)}
            >
              {config.icone && <AlertTriangle className="h-3 w-3" />}
              {pct}%
            </Badge>
            <p className="text-[10px] text-muted-foreground tabular-nums">{sublinhado}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-[220px] whitespace-pre-line">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



export function FilaPedidosPorArea({
  area,
  estagioInicial = "todos",
  estagios,
  apenasAtivos = true,
  incluirCancelados = false,
  somenteRiscoAlto = false,
  
}: Props) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [estagioFilter] = useState<EstagioPedido | "todos">(estagioInicial);

  const [marcacaoFilter, setMarcacaoFilter] = useState<string>("todas");
  const [formaPgtoFilter, setFormaPgtoFilter] = useState<string>("todas");
  const [situacaoFilter, setSituacaoFilter] = useState<string>("todas");
  const [liberacaoFilter, setLiberacaoFilter] = useState<string>("todas");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFila>("risco");
  const [somenteComAlerta, setSomenteComAlerta] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(() => {
    try {
      const salvo = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
      return (PAGE_SIZE_OPTIONS as readonly number[]).includes(salvo)
        ? (salvo as PageSizeOption)
        : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
  }, [buscaDebounced, estagioFilter, marcacaoFilter, formaPgtoFilter, situacaoFilter, liberacaoFilter, ordenacao, estagios, area]);


  const usarEstagiosMultiplos = !!(estagios && estagios.length > 0);




  // Quando um estágio específico é selecionado (ex: 'cancelado' ou 'entregue'),
  // desativa o filtro `apenasAtivos` que excluiria justamente esses estágios.
  const estagioEspecificoSelecionado =
    (usarEstagiosMultiplos && estagios && estagios.length > 0) ||
    (!usarEstagiosMultiplos && !!estagioFilter && estagioFilter !== "todos");

  const { data, isLoading, isError, error } = usePedidosFila({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    busca: buscaDebounced || undefined,
    apenasAtivos: apenasAtivos && !estagioEspecificoSelecionado,
    incluirCancelados,
  });

  // Farol de risco — fonte única: vw_pedido_risco + dimensão pedido_risco_faixa.
  const { data: riscoMap } = usePedidoRisco();
  const { data: relogioMap } = usePedidoRelogio();
  const { data: faixas } = usePedidoRiscoFaixas();
  // Alerta operacional — fonte única: vw_pedido_alerta (achados vivos da auditoria).
  const { data: alertaMap } = usePedidoAlerta();

  const termoBusca = buscaDebounced.trim();

  // Busca por nome fantasia: a busca da fila é server-side em razão social/CNPJ/nº,
  // então quem digita o apelido precisa desta perna extra — resolve os parceiros
  // pelo apelido em vw_parceiro_nome e traz os pedidos deles para o mesmo conjunto.
  const { data: pedidosPorApelido } = useQuery({
    queryKey: ["fila-por-apelido", termoBusca],
    enabled: termoBusca.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoFilaItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const t = termoBusca.replace(/[,()%]/g, " ").trim();
      const { data: nomes, error: nErr } = await sb
        .from("vw_parceiro_nome")
        .select("parceiro_id, apelido")
        .ilike("apelido", `%${t}%`)
        .limit(100);
      if (nErr) throw nErr;
      const ids = (nomes || [])
        .map((r: { parceiro_id: string }) => r.parceiro_id)
        .filter(Boolean);
      if (ids.length === 0) return [];
      const { data: rows, error } = await sb
        .from("v_pedidos_fila")
        .select("*")
        .in("parceiro_id", ids)
        .order("recebido_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (rows || []) as PedidoFilaItem[];
    },
  });

  // NOME-CANONICO-COM-APELIDO: v_pedidos_fila não traz apelido. Uma consulta
  // batelada em vw_parceiro_nome cobre a lista inteira (nunca por linha).
  const parceiroIdsLista = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.parceiro_id) set.add(p.parceiro_id); });
    (pedidosPorApelido || []).forEach((p) => { if (p.parceiro_id) set.add(p.parceiro_id); });
    return Array.from(set).sort();
  }, [data, pedidosPorApelido]);

  const { data: apelidoMap } = useQuery({
    queryKey: ["fila-apelidos", parceiroIdsLista],
    enabled: parceiroIdsLista.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase as any)
        .from("vw_parceiro_nome")
        .select("parceiro_id, apelido")
        .in("parceiro_id", parceiroIdsLista);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (rows || []).forEach((r: { parceiro_id: string; apelido: string | null }) => {
        map[r.parceiro_id] = r.apelido ?? null;
      });
      return map;
    },
  });


  const linhas = useMemo(() => {
    let base: PedidoFilaItem[] = data || [];
    if (termoBusca.length >= 2 && pedidosPorApelido && pedidosPorApelido.length > 0) {
      const vistos = new Set(base.map((p) => p.id));
      base = [...base, ...pedidosPorApelido.filter((p) => !vistos.has(p.id))];
    }
    // FILA-MOSTRA-O-QUE-EXISTE (02/09/2026): aguardando_pagamento VOLTA para a lista.
    // Ele nao tem card no funil, mas some-lo da tabela criava pedido invisivel —
    // fora da fila e fora do card da Mesa. O selo "Mesa Comercial" na coluna Estagio
    // continua dizendo quem trabalha. Recuperacao (desvio) segue fora: é outra sala.
    const foraDaFila = ["recuperacao_venda"] as const;
    foraDaFila.forEach((est) => {
      const pedidoExplicitamente = !!estagios?.some((e) => e === est);
      if (!pedidoExplicitamente) {
        base = base.filter((p) => p.estagio !== est);
      }
    });
    if (marcacaoFilter === "sem") base = base.filter((p) => !p.marcacao);
    else if (marcacaoFilter === "com") base = base.filter((p) => !!p.marcacao);
    else if (marcacaoFilter !== "todas") base = base.filter((p) => p.marcacao === marcacaoFilter);
    if (formaPgtoFilter !== "todas") {
      base = base.filter((p) => (p.forma_solicitada || "").toLowerCase() === formaPgtoFilter);
    }
    if (situacaoFilter !== "todas") {
      base = base.filter((p) => {
        const s = p.situacao_financeira;
        // Ortogonal às demais: descreve dinheiro que já entrou, não o que falta cobrar.
        if (situacaoFilter === "com_entrada_paga") return Number(p.adiantado_vivo || 0) > 0;
        if (situacaoFilter === "em_aberto") return s === "em_aberto" || s === "parcial_pago";
        return s === situacaoFilter;
      });
    }
    if (somenteRiscoAlto) {
      base = base.filter((p) => riscoMap?.get(p.id)?.risco_cor === "destructive");
    }
    if (somenteComAlerta) {
      base = base.filter((p) => !!alertaMap?.get(p.id)?.severidade);
    }
    if (ordenacao === "entrada_paga") {
      // Quem já pôs dinheiro fura a fila; empate volta ao critério cronológico.
      return [...base].sort((a, b) => {
        const va = Number(a.adiantado_vivo || 0);
        const vb = Number(b.adiantado_vivo || 0);
        if (vb !== va) return vb - va;
        return new Date(b.recebido_em).getTime() - new Date(a.recebido_em).getTime();
      });
    }
    if (ordenacao !== "risco") return base;
    return [...base].sort((a, b) => {
      const ra = riscoMap?.get(a.id);
      const rb = riscoMap?.get(b.id);
      const sa = ra?.risco_score ?? -1;
      const sb = rb?.risco_score ?? -1;
      if (sb !== sa) return sb - sa;
      const da = ra?.dias_na_fase ?? -1;
      const db = rb?.dias_na_fase ?? -1;
      if (db !== da) return db - da;
      return new Date(a.recebido_em).getTime() - new Date(b.recebido_em).getTime();
    });
  }, [data, pedidosPorApelido, termoBusca, ordenacao, riscoMap, marcacaoFilter, formaPgtoFilter, situacaoFilter, somenteRiscoAlto, somenteComAlerta, alertaMap, estagios]);

  const buscaGlobalAtiva = !!buscaDebounced.trim() && !estagioEspecificoSelecionado;








  const formasPgtoDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.forma_solicitada) set.add(p.forma_solicitada.toLowerCase()); });
    return Array.from(set).sort();
  }, [data]);

  const marcacoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.marcacao) set.add(p.marcacao); });
    return Array.from(set).sort();
  }, [data]);

  // Estágio da análise de crédito por pedido (somente para pedidos em em_analise_credito)
  const pedidoIdsEmAnalise = useMemo(
    () => (linhas || []).filter((p) => p.estagio === "em_analise_credito").map((p) => p.id),
    [linhas]
  );
  const { data: analiseStages } = useQuery({
    queryKey: ["fila-analise-stages", pedidoIdsEmAnalise],
    enabled: pedidoIdsEmAnalise.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("analises_credito")
        .select("pedido_id, estagio_atual, criado_em")
        .in("pedido_id", pedidoIdsEmAnalise)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const m = new Map<string, string>();
      (rows || []).forEach((r: { pedido_id: string; estagio_atual: string }) => {
        if (!m.has(r.pedido_id)) m.set(r.pedido_id, r.estagio_atual);
      });
      return m;
    },
  });

  // Info da remessa em aguardando_estoque (dias esperando, situação do recebível, falta)
  const pedidoIdsAguardando = useMemo(
    () => (linhas || []).filter((p) => p.estagio === "aguardando_estoque").map((p) => p.id),
    [linhas]
  );
  const { data: aguardandoEstoqueMap } = useQuery({
    // Prefixo "pedidos-fila" é intencional: invalidações existentes de ["pedidos-fila"]
    // ao liberar remessa no detalhe do pedido também revalidam este cache.
    queryKey: ["pedidos-fila", "aguardando-estoque", pedidoIdsAguardando],
    enabled: pedidoIdsAguardando.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("vw_pedido_aguardando_estoque")
        .select("pedido_id, dias_esperando, situacao_recebivel, situacao_codigo")
        .in("pedido_id", pedidoIdsAguardando);
      if (error) throw error;
      const m = new Map<
        string,
        {
          dias_esperando: number | null;
          situacao_recebivel: string | null;
          situacao_codigo: string | null;
        }
      >();
      (rows || []).forEach((r: any) => {
        m.set(r.pedido_id, {
          dias_esperando: r.dias_esperando,
          situacao_recebivel: r.situacao_recebivel,
          situacao_codigo: r.situacao_codigo,
        });
      });
      return m;
    },
  });

  // Coluna Entrega: vale para TODAS as linhas da fila (não só as expedidas).
  const pedidoIdsSaida = useMemo(() => (linhas || []).map((p) => p.id), [linhas]);
  const {
    data: entregaMap,
    isError: entregaErro,
    error: entregaErrorObj,
  } = usePedidosEntregaLote(pedidoIdsSaida);

  const { data: liberacaoMap } = useLiberacaoExpedicaoLote(pedidoIdsSaida);

  const { data: coberturaMap } = useCoberturaPedidos(pedidoIdsSaida);

  // Coluna Cobrança: instrumento de cobrança do dinheiro em aberto (view pronta, poucas linhas).
  const { data: cobrancaMap } = useQuery({
    queryKey: ["pedido-lastro-cobranca"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_lastro_cobranca")
        .select("*");
      if (error) throw error;
      const m = new Map<string, LastroCobranca>();
      (data || []).forEach((r: LastroCobranca) => m.set(r.pedido_id, r));
      return m;
    },
  });


  // Liberação: filtro aplicado depois que o mapa existe (hook acima depende dos ids).
  const linhasFiltradas = useMemo(() => {
    if (liberacaoFilter === "todas") return linhas;
    return linhas.filter((p) => {
      const lib = liberacaoMap?.get(p.id);
      if (!lib) return false;
      return liberacaoFilter === "liberado" ? lib.liberado : !lib.liberado;
    });
  }, [linhas, liberacaoMap, liberacaoFilter]);

  const resumoBuscaGlobal = useMemo(() => {
    if (!buscaGlobalAtiva) return null;
    let entregues = 0, cancelados = 0, recuperacao = 0;
    linhasFiltradas.forEach((p) => {
      if (p.estagio === "entregue") entregues++;
      else if (p.estagio === "cancelado") cancelados++;
      else if (p.estagio === "recuperacao_venda") recuperacao++;
    });
    return { entregues, cancelados, recuperacao, total: linhasFiltradas.length };
  }, [buscaGlobalAtiva, linhasFiltradas]);







  const { data: msgPendentes } = useQuery({
    queryKey: ["canal-msgs-pendentes"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_eventos")
        .select("pedido_id, tipo_evento, criado_em")
        .in("tipo_evento", ["msg_comercial", "msg_sops"])
        .order("criado_em", { ascending: false });

      const lastEvento = new Map<string, string>();
      for (const row of (data ?? []) as any[]) {
        if (!lastEvento.has(row.pedido_id)) {
          lastEvento.set(row.pedido_id, row.tipo_evento as string);
        }
      }
      const pendentes = new Set<string>();
      for (const [pid, tipo] of lastEvento.entries()) {
        if (tipo === "msg_comercial") pendentes.add(pid);
      }
      return pendentes;
    },
    refetchInterval: 60_000,
  });
  const pedidosComMsg = msgPendentes ?? new Set<string>();

  const totalLinhas = linhasFiltradas.length;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = linhasFiltradas.slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );
  const inicioRange = totalLinhas === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, totalLinhas);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Erro ao carregar a fila: {(error as Error)?.message ?? "erro desconhecido"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, nome fantasia, CNPJ ou nº do pedido…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={formaPgtoFilter} onValueChange={setFormaPgtoFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Pagamento: Todos</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="cartao">Cartão</SelectItem>
            {formasPgtoDisponiveis
              .filter((f) => !["boleto", "pix", "cartao"].includes(f))
              .map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={situacaoFilter} onValueChange={setSituacaoFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Situação: Todas</SelectItem>
            <SelectItem value="quitado">Quitado</SelectItem>
            <SelectItem value="parcial_pago">Parcial pago</SelectItem>
            <SelectItem value="em_aberto">Em aberto</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="previsto">Cobrança prevista</SelectItem>
            <SelectItem value="coberto_haver">Coberto por haver</SelectItem>
            <SelectItem value="recebivel_familia">Recebível na mãe</SelectItem>
            <SelectItem value="sem_cobranca">Sem cobrança</SelectItem>
            <SelectItem value="sem_recebivel">Sem recebível</SelectItem>
            <SelectItem value="anulado">Anulado</SelectItem>
            <SelectItem value="com_entrada_paga">Com entrada paga</SelectItem>
          </SelectContent>
        </Select>
        <Select value={liberacaoFilter} onValueChange={setLiberacaoFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Liberação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Liberação: Todas</SelectItem>
            <SelectItem value="liberado">Só liberáveis</SelectItem>
            <SelectItem value="bloqueado">Falta pagamento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={marcacaoFilter} onValueChange={setMarcacaoFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Marcação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Marcação: Todas</SelectItem>
            <SelectItem value="sem">Sem marcação</SelectItem>
            <SelectItem value="com">Com marcação</SelectItem>
            {marcacoesDisponiveis.length > 0 && marcacoesDisponiveis.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as OrdenacaoFila)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cronologico">Ordenar: Cronológico</SelectItem>
            <SelectItem value="risco">Ordenar: Risco</SelectItem>
            <SelectItem value="entrada_paga">Ordenar: Entrada paga primeiro</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={somenteComAlerta ? "secondary" : "outline"}
          size="sm"
          aria-pressed={somenteComAlerta}
          className="w-full sm:w-auto"
          onClick={() => setSomenteComAlerta((v) => !v)}
        >
          Só com alerta
        </Button>
      </div>

      {resumoBuscaGlobal && (() => {
        const grupos: string[] = [];
        if (resumoBuscaGlobal.entregues > 0)
          grupos.push(`${resumoBuscaGlobal.entregues} ${resumoBuscaGlobal.entregues === 1 ? "entregue" : "entregues"}`);
        if (resumoBuscaGlobal.cancelados > 0)
          grupos.push(`${resumoBuscaGlobal.cancelados} ${resumoBuscaGlobal.cancelados === 1 ? "cancelado" : "cancelados"}`);
        if (resumoBuscaGlobal.recuperacao > 0)
          grupos.push(`${resumoBuscaGlobal.recuperacao} em recuperação`);
        return (
          <p className="text-xs text-foreground bg-muted/50 rounded-md px-2 py-1 inline-block">
            Busca em todo o histórico · {resumoBuscaGlobal.total}{" "}
            {resumoBuscaGlobal.total === 1 ? "resultado" : "resultados"}
            {grupos.length > 0 && ` (${grupos.join(" · ")})`}
          </p>
        );
      })()}


      {(ordenacao === "risco" || somenteRiscoAlto) && (
        <p className="text-xs text-muted-foreground">
          {ordenacao === "risco" && "Ordenado por risco (maior primeiro). "}
          {somenteRiscoAlto && "Mostrando apenas pedidos em risco alto."}
        </p>
      )}

      <div className="rounded-md border border-border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-card">
              <TableHead className="w-[56px]">Risco</TableHead>
              <TableHead className="w-[220px]">Pedido</TableHead>
              <TableHead className="w-[150px]">Valor</TableHead>
              <TableHead className="w-[130px]">Pagamento</TableHead>
              <TableHead className="w-[100px]">Estoque</TableHead>
              <TableHead className="w-[130px]">Cobrança</TableHead>
              <TableHead className="w-[140px]">Estágio</TableHead>
              <TableHead className="w-[200px]">Entrega</TableHead>
              <TableHead className="w-[96px]">Na fase</TableHead>
              <TableHead className="w-[56px] text-right text-[11px] font-normal text-muted-foreground">Ações</TableHead>

            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && linhasFiltradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <EstadoVazioFila
                    termoBusca={termoBusca}
                    estagios={estagios}
                    estagioFilter={estagioFilter}
                    usarEstagiosMultiplos={usarEstagiosMultiplos}
                    situacaoFilter={situacaoFilter}
                    formaPgtoFilter={formaPgtoFilter}
                    liberacaoFilter={liberacaoFilter}
                    marcacaoFilter={marcacaoFilter}
                    somenteComAlerta={somenteComAlerta}
                    somenteRiscoAlto={somenteRiscoAlto}
                    setBusca={setBusca}
                    setSituacaoFilter={setSituacaoFilter}
                    setFormaPgtoFilter={setFormaPgtoFilter}
                    setLiberacaoFilter={setLiberacaoFilter}
                    setMarcacaoFilter={setMarcacaoFilter}
                    setSomenteComAlerta={setSomenteComAlerta}
                  />
                </TableCell>
              </TableRow>
            )}
            {pageItems.map((p) => {
              const risco = riscoMap?.get(p.id);
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer h-20 [&>td]:py-2 [&>td]:align-top [&>td]:overflow-hidden"
                  onClick={() => navigate(`/pedidos/${p.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                    <FarolRisco
                      faixa={risco?.risco_faixa ?? null}
                      cor={risco?.risco_cor ?? null}
                      score={risco?.risco_score ?? null}
                      motivos={risco?.risco_motivos ?? []}
                      rotuloFaixa={
                        risco?.risco_faixa ? faixas?.get(risco.risco_faixa)?.rotulo ?? null : null
                      }
                    />
                    <FarolAlerta alerta={alertaMap?.get(p.id)} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <p className="text-sm font-mono font-medium text-foreground flex items-center gap-1 min-w-0">
                      <span className="truncate" title={p.id_externo}>{p.id_externo}</span>
                      {(() => {
                        const motivos = risco?.risco_motivos ?? [];
                        const critico = motivos.some((m) => m.codigo === "urgencia_critica_declarada");
                        const alto = motivos.some((m) => m.codigo === "urgencia_alta_declarada");
                        if (critico) {
                          return (
                            <span title="Urgência crítica declarada" aria-label="Urgência crítica declarada" className="shrink-0">
                              <Flame className="h-3.5 w-3.5 text-destructive" />
                            </span>
                          );
                        }
                        if (alto) {
                          return (
                            <span title="Urgência alta declarada" aria-label="Urgência alta declarada" className="shrink-0">
                              <Flame className="h-3.5 w-3.5 text-warning" />
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </p>
                    {p.parceiro_id ? (
                      <button
                        type="button"
                        className="text-sm font-normal text-muted-foreground text-left hover:underline truncate block w-full min-w-0"
                        title={p.parceiro_razao}
                        onClick={() => navigate(`/parceiros/${p.parceiro_id}`, { state: { from: "/pedidos" } })}
                      >
                        {p.parceiro_razao}
                      </button>
                    ) : (
                      <p className="text-sm font-normal text-muted-foreground truncate block w-full min-w-0" title={p.parceiro_razao}>{p.parceiro_razao}</p>
                    )}
                    <p
                      className="text-[11px] text-muted-foreground truncate block w-full min-w-0 leading-tight"
                      title={[
                        p.parceiro_id && apelidoMap?.[p.parceiro_id] ? apelidoMap[p.parceiro_id] : null,
                        p.parceiro_cnpj,
                        p.marcacao,
                      ].filter(Boolean).join(" · ")}
                    >
                      {[
                        p.parceiro_id && apelidoMap?.[p.parceiro_id] ? apelidoMap[p.parceiro_id] : null,
                        p.parceiro_cnpj,
                        p.marcacao,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{fmtBRL.format(p.valor_liquido)}</p>
                    <div onClick={(e) => e.stopPropagation()}>
                      <LinhaNfFila info={entregaMap?.get(p.id)} pedidoRef={p.id_externo} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <CelulaPagamento p={p} liberacao={liberacaoMap?.get(p.id)} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <CelulaEstoque cob={coberturaMap?.get(p.id)} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <CelulaCobranca cobranca={cobrancaMap?.get(p.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-h-[68px] overflow-hidden">
                      <EstagioBadge estagio={p.estagio} />
                      {/* AREA-DIZ-ONDE-TRATAR (20/08/2026): o estagio diz o que falta, a area diz quem
                          trabalha. aguardando_pagamento e recuperacao_venda moram na Mesa Comercial. */}
                      {p.area_atual === "comercial" && (
                        <Badge
                          variant="outline"
                          className="rounded px-1.5 py-0 text-[10px]"
                          title="Este pedido é tratado pelo Comercial, na aba Mesa Comercial da Casa dos Pedidos."
                        >
                          Mesa Comercial
                        </Badge>
                      )}
                      {p.estagio === "em_analise_credito" && analiseStages?.get(p.id) === "entrada" && (
                        <Badge className="bg-warning text-white border-0 text-[10px]">
                          Aguardando liberação
                        </Badge>
                      )}
                      {p.estagio === "em_analise_credito" && analiseStages?.get(p.id) === "analise" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Em análise
                        </Badge>
                      )}
                      {p.estagio === "aguardando_estoque" && (() => {
                        const info = aguardandoEstoqueMap?.get(p.id);
                        if (!info) return null;
                        const cod = info.situacao_codigo;
                        const cls =
                          cod === "faturada_quitada"
                            ? "bg-muted text-foreground border-0"
                            : cod === "faturada_a_receber"
                            ? "bg-info/10 text-info border-0"
                            : cod === "faturada_com_diferenca" || cod === "sem_recebivel"
                            ? "bg-warning/10 text-warning border-0"
                            : cod === "natureza_sem_cobranca"
                            ? "bg-success/10 text-success border-0"
                            : "bg-muted text-foreground border-0";
                        const dias = info.dias_esperando;
                        return (
                          <>
                            {info.situacao_recebivel && (
                              <Badge className={cn(cls, "text-[10px] py-0 px-1.5")}>
                                {info.situacao_recebivel}
                              </Badge>
                            )}
                            {dias != null && (
                              <span className="text-[11px] text-muted-foreground truncate leading-tight">
                                esperando {dias}d
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="max-h-[68px] overflow-hidden">
                      {entregaErro ? (
                        <p className="text-[11px] text-destructive leading-tight">
                          Erro ao carregar entrega/NF: {(entregaErrorObj as Error)?.message || "falha desconhecida"}
                        </p>
                      ) : (
                        <CelulaEntregaFila info={entregaMap?.get(p.id)} />
                      )}
                    </div>
                  </TableCell>

                  <TableCell
                    className="text-sm whitespace-nowrap"
                    title="Dias no estágio atual · idade total do pedido desde o recebimento"
                  >
                    {(() => {
                      const slaEstourado = (risco?.risco_motivos ?? []).some(
                        (m) => m.codigo === "sla_interno_estourado"
                      );
                      const diasNaFase = risco?.dias_na_fase;
                      const totalDias = Math.floor((p.idade_minutos ?? 0) / 1440);
                      const relogio = relogioMap?.get(p.id);
                      return (
                        <div>
                          <p className={cn(slaEstourado && "text-destructive font-medium")}>
                            {diasNaFase != null ? `${Math.floor(diasNaFase)}d` : "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            pedido {totalDias === 0 ? "<1d" : `${totalDias}d`}
                          </p>
                          {relogio && relogio.dias_espera > 0 && (
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              {relogio.dias_nossos}d nossos
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>

                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <AcoesLinha p={p} temMsg={pedidosComMsg.has(p.id)} risco={risco} nfInfo={entregaMap?.get(p.id)} />
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm bg-background border-t border-border shadow-[0_-2px_8px_-4px_hsl(var(--foreground)/0.1)]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            {totalLinhas === 0
              ? "Nenhum resultado"
              : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicioRange}</span>–<span className="font-medium text-foreground tabular-nums">{fimRange}</span> de <span className="font-medium text-foreground tabular-nums">{totalLinhas}</span></>}
          </span>
          <span className="hidden sm:inline">·</span>
          <div className="hidden sm:flex items-center gap-1.5">
            <span>Por página:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const n = Number(v) as PageSizeOption;
                setPageSize(n);
                try {
                  localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(n));
                } catch {
                  // modo privativo pode bloquear o storage — a troca vale só nesta sessão
                }
                setPagina(1);
              }}
            >
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina(1)}
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {pageRange.map((p, idx) =>
              p === "…" ? (
                <span key={`e-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === paginaAtual ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 min-w-8 px-2 tabular-nums",
                    p === paginaAtual && "pointer-events-none",
                  )}
                  onClick={() => setPagina(p)}
                  aria-current={p === paginaAtual ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina(totalPaginas)}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ENTRADA-PAGA: dinheiro já recebido que ainda não virou título.
 * Convive com o badge de situação — são fatos diferentes sobre o mesmo pedido.
 */
function BadgeEntradaPaga({ p }: { p: PedidoFilaItem }) {
  const valor = Number(p.adiantado_vivo || 0);
  if (!(valor > 0)) return null;
  const pct = Number(p.adiantado_pct_pago || 0);
  const integral = !!p.adiantado_cobre_pedido_inteiro;
  const texto = integral
    ? `Pago integral · ${fmtBRL.format(valor)}`
    : `Entrada paga · ${fmtBRL.format(valor)} (${pct}%)`;
  const partes = [p.adiantado_formas, p.adiantado_recebido_em ? `recebido em ${formatDateBR(p.adiantado_recebido_em)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Badge className={cn(TOM_CLASSES.positivo, "text-[10px] py-0 px-1.5")}>{texto}</Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-[280px]">{partes || texto}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Compara sem acento e sem caixa — "Cartão" casa com "cartao". */
function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const MEIOS_PAGAMENTO = ["boleto", "cart", "pix", "haver"] as const;

/** Só exibição: encurta a condição, sem tocar no dado. */
function condicaoExibida(condicao: string): string {
  return (condicao || "")
    .replace(/\s*sem\s+juros\s*/gi, " ")
    .replace(/\s+\(/g, " · ")
    .replace(/\)\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function LinhaCondicaoPagamento({ p }: { p: PedidoFilaItem }) {
  const condicao = p.condicao_solicitada || "";
  const forma = p.forma_solicitada || "";
  const cond = normalizarTexto(condicao);
  const frm = normalizarTexto(forma);

  const meioNaCondicao = MEIOS_PAGAMENTO.find((m) => cond.includes(m));
  const meioNaForma = MEIOS_PAGAMENTO.find((m) => frm.includes(m));

  const condTexto = condicaoExibida(condicao);
  if (!condTexto && !forma) return null;

  // Condição já contém a forma → só a condição.
  if (frm && cond.includes(frm)) {
    return <p className="text-[11px] text-muted-foreground truncate leading-tight">{condTexto}</p>;
  }

  // Condição menciona um meio diferente do cadastro → destaque na forma.
  const divergente = !!meioNaCondicao && !!meioNaForma && meioNaCondicao !== meioNaForma;

  return (
    <p
      className="text-[11px] text-muted-foreground truncate leading-tight"
      title={
        divergente
          ? "A condição diz um meio de pagamento e o cadastro diz outro."
          : undefined
      }
    >
      {condTexto}
      {forma ? (
        <>
          {" · "}
          <span className={cn(divergente && "text-destructive")}>{forma}</span>
        </>
      ) : null}
    </p>
  );
}

function CelulaPagamento({
  p,
  liberacao,
}: {
  p: PedidoFilaItem;
  liberacao?: LiberacaoExpedicao;
}) {
  // REGRA-NÃO-MORA-EM-RÓTULO: a cor vem do campo `tom` de nivel_prova_dim
  // (exposto pela view), nunca de um mapa por código aqui no front.
  const provaEstado = ((): "success" | "warning" | "destructive" | "muted" => {
    switch (liberacao?.prova_tom) {
      case "perigo": return "destructive";
      case "alerta": return "warning";
      case "ok": return "success";
      default: return "muted";
    }
  })();

  const provaLine =
    liberacao?.prova_rotulo && liberacao?.nivel_prova !== "sem_prova" ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Selo estado={provaEstado} className="leading-tight">
              {liberacao.prova_rotulo}
            </Selo>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs max-w-[280px] leading-tight">{liberacao.prova_frase}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;


  const liberacaoLine = liberacao ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Selo estado={liberacao.tom === "ok" ? "success" : "warning"} className="leading-tight">
            {liberacao.rotulo}
          </Selo>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-[320px] space-y-1">
            {liberacao.motivo && <p className="text-xs leading-tight">{liberacao.motivo}</p>}
            {liberacao.prova_frase && (
              <p className="text-xs opacity-80 leading-tight">{liberacao.prova_frase}</p>
            )}
            {p.situacao_rotulo && (
              <p className="text-xs opacity-80 leading-tight">{p.situacao_rotulo}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <div className="min-w-0">
      {liberacaoLine}
      {provaLine}
      <LinhaCondicaoPagamento p={p} />
    </div>
  );
}




/**
 * Alerta operacional — bolinha menor, ao lado do risco.
 * Risco é previsão; alerta é defeito presente. Por isso não se misturam.
 */
function FarolAlerta({ alerta }: { alerta: PedidoAlerta | undefined }) {
  const sev = alerta?.severidade;
  if (!alerta || !sev) return null;
  const bg = ALERTA_COR_TOKEN[sev] ?? "bg-muted-foreground";
  const rotuloSev =
    sev === "bloqueante" ? "bloqueante" : sev === "atencao" ? "atenção" : "informativo";
  const total = alerta.achados ?? 0;
  const blo = alerta.bloqueantes ?? 0;
  const contagem =
    total > 1
      ? `${total} achados${blo > 0 ? `, ${blo} ${blo === 1 ? "bloqueante" : "bloqueantes"}` : ""}`
      : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="ml-1 inline-flex items-center cursor-help align-middle"
            aria-label={`Alerta ${rotuloSev}: ${alerta.titulo_principal ?? "achado de auditoria"}`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", bg)} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-xs font-medium">{alerta.titulo_principal ?? "Achado de auditoria"}</p>
          {alerta.detalhe_principal && (
            <p className="mt-1 text-xs opacity-80">{alerta.detalhe_principal}</p>
          )}
          {contagem && <p className="mt-1 text-xs tabular-nums opacity-80">{contagem}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Farol de risco — bolinha colorida + tooltip com faixa, score e motivos. */
function FarolRisco({
  faixa,
  cor,
  score,
  motivos,
  rotuloFaixa,
}: {
  faixa: string | null;
  cor: string | null;
  score: number | null;
  motivos: { codigo: string; rotulo: string; pontos: number }[];
  rotuloFaixa: string | null;
}) {
  // Terminal (cancelado / recuperacao_venda) vem sem faixa: nada é renderizado.
  if (!faixa) return null;
  const bg = RISCO_COR_TOKEN[cor ?? ""] ?? "bg-muted-foreground";
  const label = rotuloFaixa || faixa;
  const motivosOrdenados = [...motivos].sort((a, b) => b.pontos - a.pontos);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1.5 cursor-help"
            aria-label={`Risco: ${label}`}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", bg)} />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {score ?? "—"}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-xs font-medium">{label}{score != null ? ` · ${score}` : ""}</p>
          {motivosOrdenados.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {motivosOrdenados.map((m) => (
                <li key={m.codigo} className="flex justify-between gap-3">
                  <span className="opacity-80">{m.rotulo}</span>
                  <span className="font-mono">+{m.pontos}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs opacity-80">Sem motivos registrados.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Coluna de ações: uma ação primária por estágio + resto no menu "⋯". */
function AcoesLinha({ p, temMsg, risco, nfInfo }: { p: PedidoFilaItem; temMsg: boolean; risco: PedidoRisco | undefined; nfInfo: EntregaLinhaInfo | undefined }) {
  const navigate = useNavigate();
  const { temNivel } = useNivel();
  const { mutate: atualizarUrgencia, isPending } = useAtualizarUrgencia();
  const { baixar: baixarNf, baixando: baixandoNf } = useDownloadNfPdf();

  // NF-EM-ACOES-RAPIDAS (22/08/2026): download direto no menu "⋯", pra faturado→entregue.
  // Mesma fonte do chip clicável na coluna Valor (LinhaNfFila) — sem NF, o item simplesmente não aparece.
  const podeBaixarNf =
    ["faturado", "em_transporte", "entregue"].includes(p.estagio) && !!nfInfo?.nf_id;
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [exportarOpen, setExportarOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [marcacaoOpen, setMarcacaoOpen] = useState(false);
  const [urgenciaOpen, setUrgenciaOpen] = useState(false);
  const [confirmarPagamentoAberto, setConfirmarPagamentoAberto] = useState(false);

  const motivos = risco?.risco_motivos ?? [];
  const urgenciaInicial: UrgenciaDeclarada = motivos.some((m) => m.codigo === "urgencia_critica_declarada")
    ? "critica"
    : motivos.some((m) => m.codigo === "urgencia_alta_declarada")
    ? "alta"
    : "normal";

  const [urgencia, setUrgencia] = useState<UrgenciaDeclarada>(urgenciaInicial);
  const [observacao, setObservacao] = useState("");

  const abrirUrgencia = () => {
    setUrgencia(urgenciaInicial);
    setObservacao("");
    setUrgenciaOpen(true);
  };

  const obsObrigatoria = (urgencia === "alta" || urgencia === "critica") && !observacao.trim();

  const salvarUrgencia = () => {
    atualizarUrgencia(
      { pedidoId: p.id, urgencia, observacao: observacao.trim() || null },
      { onSuccess: () => setUrgenciaOpen(false) },
    );
  };

  const podeDeclararUrgencia = temNivel(3);

  return (
    <div className="flex justify-end items-center gap-0.5">
      {/* Ação primária do estágio */}
      {p.estagio === "recebido" && (
        <TriarPedidoDialog
          pedido_id={p.id}
          perfil_credito={null}
          estagio_atual={p.estagio}
          forma_solicitada={p.forma_solicitada}
          triggerLabel="Triar"
          triggerVariant="ghost"
        />
      )}
      {p.estagio === "cobranca" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Abrir cobrança"
          aria-label="Abrir cobrança"
          onClick={() =>
            navigate(`/recebimento/cobranca/${p.id}`, {
              state: { from: "/pedidos", fromLabel: "Fila de Pedidos" },
            })
          }
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      {p.estagio === "aguardando_pagamento" && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Confirmar pagamento"
            aria-label="Confirmar pagamento"
            onClick={() => setConfirmarPagamentoAberto(true)}
          >
            <BadgeCheck className="h-4 w-4" />
          </Button>
          <ConfirmarPagamentoDialog
            pedidoId={p.id}
            aberto={confirmarPagamentoAberto}
            aoFechar={() => setConfirmarPagamentoAberto(false)}
            modo="sops"
          />
        </>
      )}
      {p.estagio === "pre_faturamento" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Abrir pré-faturamento"
          aria-label="Abrir pré-faturamento"
          onClick={() =>
            navigate(`/pedidos/${p.id}`, {
              state: { from: "/pedidos", fromLabel: "Fila de Pedidos" },
            })
          }
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      {/* FATURAMENTO-NASCE-NO-SNCF: em pré-separação a única porta é a XPM.
          O Bling só recebe depois da conferência, no pré-faturamento. */}
      {p.estagio === "pre_separacao" && !p.xpm_expedicao_codigo && (
        <EmpurrarXpmLinhaDialog
          pedido_id={p.id}
          id_externo={p.id_externo}
          xpm_envio_erro={p.xpm_envio_erro}
          modo="normal"
        />
      )}
      {/* XPM-SEM-VAZAMENTO (21/08/2026): resgate do pedido que já foi pro Bling
          e ficou sem expedição na XPM. Mutuamente exclusivo com o botão acima. */}
      {p.bling_id_destino && !p.xpm_expedicao_codigo &&
        (p.estagio === "pre_separacao" || p.estagio === "em_separacao") && (
        <EmpurrarXpmLinhaDialog
          pedido_id={p.id}
          id_externo={p.id_externo}
          xpm_envio_erro={p.xpm_envio_erro}
        />
      )}


      {/* Secundárias */}
      {/* CONTRATO DE NÍVEL: 1 vê · 2 edita · 3 aprova · 4 apaga · 5 lê sensível · 6 tudo. Item que ESCREVE ou EXPORTA dado exige nível 2. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => navigate(`/pedidos/${p.id}`)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir pedido
          </DropdownMenuItem>
          {temMsg && (
            <DropdownMenuItem onSelect={() => navigate(`/pedidos/${p.id}`)}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Mensagem pendente
            </DropdownMenuItem>
          )}
          {temNivel(2) && (
            <DropdownMenuItem onSelect={() => setMarcacaoOpen(true)}>
              <Tag className="h-4 w-4 mr-2" />
              Marcação
            </DropdownMenuItem>
          )}
          {podeDeclararUrgencia && (
            <DropdownMenuItem onSelect={abrirUrgencia}>
              <Flame className="h-4 w-4 mr-2" />
              Declarar urgência
            </DropdownMenuItem>
          )}
          {podeBaixarNf && (
            <DropdownMenuItem
              disabled={baixandoNf}
              onSelect={() =>
                baixarNf({
                  nf_id: nfInfo!.nf_id!,
                  nome: nomeArquivoNf({
                    pedidoRef: p.id_externo,
                    numero: nfInfo!.nf_numero,
                    serie: nfInfo!.nf_serie,
                    fallbackId: nfInfo!.nf_id,
                  }),
                })
              }
            >
              {baixandoNf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Baixar NF
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setCadastroOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Cadastro
          </DropdownMenuItem>
          {temNivel(2) && (
            <DropdownMenuItem onSelect={() => setExportarOpen(true)}>
              <Download className="h-4 w-4 mr-2" />
              Exportar pedido
            </DropdownMenuItem>
          )}
          <BotaoSplitPedido
            pedido_id={p.id}
            id_externo={p.id_externo}
            valor_liquido={p.valor_liquido}
            estagio={p.estagio}
            variante="menuitem"
            open={splitOpen}
            onOpenChange={setSplitOpen}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Diálogo de marcação controlado pelo menu — Dialog, não Popover:
          o DropdownMenu devolve o foco ao trigger ao fechar e derrubava o popover. */}
      <MarcacaoPedido
        pedidoId={p.id}
        marcacao={p.marcacao}
        hideTrigger
        open={marcacaoOpen}
        onOpenChange={setMarcacaoOpen}
      />

      {/* Diálogo de urgência controlado pelo menu — mesmo padrão do diálogo de marcação. */}
      <Dialog open={urgenciaOpen} onOpenChange={setUrgenciaOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4" />
              Declarar urgência
            </DialogTitle>
            <DialogDescription>Pedido {p.id_externo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
            <RadioGroup
              value={urgencia}
              onValueChange={(v) => setUrgencia(v as UrgenciaDeclarada)}
              className="space-y-2"
            >
              {(["normal", "alta", "critica"] as UrgenciaDeclarada[]).map((u) => (
                <div key={u} className="flex items-center space-x-2">
                  <RadioGroupItem value={u} id={`urgencia-${u}`} />
                  <Label htmlFor={`urgencia-${u}`}>{URGENCIA_LABELS[u]}</Label>
                </div>
              ))}
            </RadioGroup>

            <div className="space-y-1.5">
              <Label htmlFor="observacao-urgencia">Observação</Label>
              <Textarea
                id="observacao-urgencia"
                placeholder="Por que esse pedido é urgente?"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {obsObrigatoria && (
                <p className="text-xs text-destructive">Urgência acima de normal exige justificativa.</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => setUrgenciaOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button size="sm" disabled={isPending || obsObrigatoria} onClick={salvarUrgencia}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogos ficam fora do menu — o conteúdo do menu desmonta ao fechar. */}
      <TabelaCadastroDialog
        pedido_id={p.id}
        id_externo={p.id_externo}
        parceiro_id={p.parceiro_id}
        parceiro_nome={p.parceiro_razao}
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        hideTrigger
      />
      <ExportarPedidoDialog
        pedidoId={p.id}
        open={exportarOpen}
        onOpenChange={setExportarOpen}
        hideTrigger
      />
      <BotaoSplitPedido
        pedido_id={p.id}
        id_externo={p.id_externo}
        valor_liquido={p.valor_liquido}
        estagio={p.estagio}
        variante="dialogo"
        open={splitOpen}
        onOpenChange={setSplitOpen}
      />
    </div>
  );
}


