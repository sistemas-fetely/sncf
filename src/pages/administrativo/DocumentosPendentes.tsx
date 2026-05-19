import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileWarning,
  ChevronDown,
  ChevronRight,
  Upload,
  Package,
  AlertCircle,
  Clock,
  Users,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  History,
  FileText,
  Receipt,
  Banknote,
  Tag,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { toast } from "sonner";
import { format } from "date-fns";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import { UploadEmMassaDialog } from "@/components/financeiro/UploadEmMassaDialog";
import MarcarEnviadasDialog from "@/components/financeiro/MarcarEnviadasDialog";
import EnviarPeloSistemaDialog from "@/components/financeiro/EnviarPeloSistemaDialog";
import BuscarNFStageDialog from "@/components/financeiro/BuscarNFStageDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";

type Aba = "cobrar" | "pronto" | "enviado";

type ParcelaDetalhe = {
  plano_contas_id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status_conta: string;
  docs_status: string | null;
  tem_nf_anexada: boolean | null;
  estado_envio: "cobrar" | "pronto" | "enviado";
};

type ContaItem = {
  // Identificador da entrada — pra compromisso é a parcela "principal" (drawer abre nela)
  plano_contas_id: string;
  // Discriminador do tipo de evento. Ausente = legado (trata como avulsa).
  tipo?: "conta_avulsa" | "compromisso";
  compromisso_id?: string | null;
  qtd_parcelas?: number | null;
  parcelas_pagas?: number | null;
  parcelas?: ParcelaDetalhe[] | null;

  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status_conta: string;
  docs_status: string;
  nf_numero: string | null;
  estado_envio: "cobrar" | "pronto" | "enviado";
  cancelada_apos_envio: boolean;
  ultima_remessa_id: string | null;
  ultima_remessa_em: string | null;
  dias_aguardando: number;
  // Campos opcionais vindos da view nova
  tem_nf_anexada?: boolean | null;
  nf_aplicavel?: boolean | null;
  nf_aplicavel_motivo?: string | null;
  tem_boleto?: boolean | null;
  tem_comprovante?: boolean | null;
  tem_categoria?: boolean | null;
  enviado_contador?: boolean | null;
  parceiro_cnpj?: string | null;
};

// IDs reais de contas_pagar_receber dentro de uma entrada (1 pra avulsa, N pra compromisso)
function contaIdsDoItem(c: ContaItem): string[] {
  if (c.tipo === "compromisso" && c.parcelas && c.parcelas.length > 0) {
    return c.parcelas.map((p) => p.plano_contas_id);
  }
  return [c.plano_contas_id];
}

// -----------------------------------------------------------------------------
// Cluster Fetely de pills de status documental
// -----------------------------------------------------------------------------
type EstadoPill = "ok" | "falta" | "na";

function PillStatus({
  icone: Icone,
  label,
  estado,
  tooltip,
  onClick,
}: {
  icone: LucideIcon;
  label: string;
  estado: EstadoPill;
  tooltip: string;
  onClick?: () => void;
}) {
  const cores = {
    ok: "bg-emerald-50 border-emerald-300 text-emerald-700",
    falta: "bg-red-50 border-red-300 text-red-700",
    na: "bg-zinc-50 border-zinc-200 text-zinc-500",
  }[estado];
  const sinal = estado === "ok" ? "✓" : estado === "falta" ? "!" : "—";
  const isClickable = !!onClick;
  const Comp: "button" | "div" = isClickable ? "button" : "div";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Comp
            type={isClickable ? "button" : undefined}
            onClick={
              isClickable
                ? (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onClick?.();
                  }
                : undefined
            }
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium transition-colors",
              cores,
              isClickable && "hover:brightness-95 cursor-pointer",
            )}
          >
            <Icone className="h-2.5 w-2.5" />
            <span className="hidden sm:inline">{label}</span>
            <span>{sinal}</span>
          </Comp>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[220px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ClusterPills({
  conta,
  onBuscarNF,
}: {
  conta: ContaItem;
  onBuscarNF?: (c: ContaItem) => void;
}) {
  const nfAplicavel = conta.nf_aplicavel !== false;
  const temNF = !!conta.tem_nf_anexada;
  const motivoNA = conta.nf_aplicavel_motivo;

  const nfEstado: EstadoPill = !nfAplicavel
    ? "na"
    : temNF
      ? "ok"
      : "falta";
  const nfTooltip = !nfAplicavel
    ? `NF não aplicável${motivoNA ? `: ${motivoNA}` : ""}`
    : temNF
      ? "NF anexada"
      : "Sem NF — clique para buscar em Stage";

  // Boleto, Comprovante, Categoria, Contador — usa flags se vierem da view,
  // senão fallback "na" (TODO: enriquecer RPC).
  const pill = (
    flag: boolean | null | undefined,
    okMsg: string,
    faltaMsg: string,
  ): { estado: EstadoPill; tooltip: string } =>
    flag === true
      ? { estado: "ok", tooltip: okMsg }
      : flag === false
        ? { estado: "falta", tooltip: faltaMsg }
        : { estado: "na", tooltip: "Não disponível" };

  const boleto = pill(
    conta.tem_boleto,
    "Boleto anexado",
    "Sem boleto",
  );
  const comprov = pill(
    conta.tem_comprovante,
    "Comprovante anexado",
    "Sem comprovante",
  );
  const categoria = pill(
    conta.tem_categoria,
    "Categorizada",
    "Sem categoria",
  );
  const contador = pill(
    conta.enviado_contador,
    "Enviada ao contador",
    "Ainda não enviada",
  );

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <PillStatus
        icone={FileText}
        label="NF"
        estado={nfEstado}
        tooltip={nfTooltip}
        onClick={
          nfAplicavel && !temNF && onBuscarNF
            ? () => onBuscarNF(conta)
            : undefined
        }
      />
      <PillStatus
        icone={Banknote}
        label="Boleto"
        estado={boleto.estado}
        tooltip={boleto.tooltip}
      />
      <PillStatus
        icone={Receipt}
        label="Comp."
        estado={comprov.estado}
        tooltip={comprov.tooltip}
      />
      <PillStatus
        icone={Tag}
        label="Cat."
        estado={categoria.estado}
        tooltip={categoria.tooltip}
      />
      <PillStatus
        icone={UserCheck}
        label="Contador"
        estado={contador.estado}
        tooltip={contador.tooltip}
      />
    </div>
  );
}

type GrupoFornecedor = {
  parceiro_id: string | null;
  parceiro_razao_social: string;
  qtd_contas: number;
  total_valor: number;
  mais_antigo_dias: number;
  qtd_canceladas_apos_envio: number;
  contas_json: ContaItem[];
};

type Remessa = {
  id: string;
  descricao: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  enviada_em: string;
  metodo: "sistema" | "manual_download";
  destinatarios: string[];
  observacao: string | null;
  qtd_documentos: number;
  qtd_contas: number;
  total_valor: number;
  tem_cancelada: boolean;
};

const STATUS_CONTA_BG: Record<string, string> = {
  enviado_para_pagamento: "bg-amber-50/40",
  cancelado: "bg-rose-50/40",
  aprovado: "bg-amber-50/40",
  aberto: "bg-blue-50/40",
};

const STATUS_CONTA_LABEL: Record<string, string> = {
  enviado_para_pagamento: "Enviado para Pagamento",
  cancelado: "Cancelada",
  aprovado: "Aprovada",
  aberto: "Aberta",
  rascunho: "Rascunho",
};

export default function DocumentosPendentes() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("cobrar");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [busca, setBusca] = useState("");
  const [contaIdDrawer, setContaIdDrawer] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [marcarOpen, setMarcarOpen] = useState(false);
  const [enviarSistemaOpen, setEnviarSistemaOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [parcelasExpandidas, setParcelasExpandidas] = useState<Set<string>>(new Set());
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [remessasExpandidas, setRemessasExpandidas] = useState<Set<string>>(new Set());
  const [desfazendo, setDesfazendo] = useState(false);
  const [remessaParaDesfazer, setRemessaParaDesfazer] = useState<Remessa | null>(null);
  const [contaParaBuscar, setContaParaBuscar] = useState<ContaItem | null>(null);

  // Reseta seleção ao trocar de aba
  function trocarAba(nova: Aba) {
    setAba(nova);
    setSelecionadas(new Set());
  }

  // ============================================================
  // QUERY 1: agrupado por fornecedor (abas Cobrar e Pronto)
  // ============================================================
  const { data: grupos = [], isLoading: loadingGrupos } = useQuery({
    queryKey: ["docs-envio-agrupados", aba, periodoInicio, periodoFim, busca],
    enabled: aba !== "enviado",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "documentos_envio_agrupados",
        {
          p_estado: aba,
          p_periodo_inicio: periodoInicio || null,
          p_periodo_fim: periodoFim || null,
          p_busca: busca.trim() || null,
        },
      );
      if (error) throw error;
      return (data || []) as GrupoFornecedor[];
    },
  });

  // ============================================================
  // QUERY 2: lista de remessas (aba Enviado)
  // ============================================================
  const { data: remessas = [], isLoading: loadingRemessas } = useQuery({
    queryKey: ["remessas-contador", periodoInicio, periodoFim, busca],
    enabled: aba === "enviado",
    queryFn: async () => {
      let q = supabase
        .from("remessas_contador")
        .select(
          `
          id, descricao, periodo_inicio, periodo_fim, enviada_em, metodo,
          destinatarios, observacao, qtd_documentos, qtd_contas
        `,
        )
        .order("enviada_em", { ascending: false });
      if (periodoInicio) q = q.gte("enviada_em", periodoInicio);
      if (periodoFim) q = q.lte("enviada_em", periodoFim + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;

      // Enriquece com total_valor e tem_cancelada por remessa
      const enriquecidas: Remessa[] = [];
      for (const r of data || []) {
        const { data: itens } = await supabase
          .from("remessas_contador_itens")
          .select("plano_contas_id, contas_pagar_receber!inner(valor, status)")
          .eq("remessa_id", r.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (itens || []) as any[];
        const total = items.reduce(
          (s, it) => s + Number(it.contas_pagar_receber?.valor || 0),
          0,
        );
        const temCancelada = items.some(
          (it) => it.contas_pagar_receber?.status === "cancelado",
        );
        enriquecidas.push({
          ...(r as Omit<Remessa, "total_valor" | "tem_cancelada">),
          total_valor: total,
          tem_cancelada: temCancelada,
        });
      }

      // Filtro busca (na descrição da remessa)
      const t = busca.trim().toLowerCase();
      return t
        ? enriquecidas.filter((r) =>
            (r.descricao || "").toLowerCase().includes(t),
          )
        : enriquecidas;
    },
  });

  // ============================================================
  // KPIs por aba
  // ============================================================
  const kpis = useMemo(() => {
    if (aba === "enviado") {
      const totalContas = remessas.reduce((s, r) => s + r.qtd_contas, 0);
      const totalValor = remessas.reduce((s, r) => s + (r.total_valor || 0), 0);
      const ultima = remessas[0];
      return {
        principal: { label: "Remessas no período", valor: String(remessas.length), icon: Send, cor: "text-emerald-600" },
        secundario1: { label: "Contas remetidas", valor: String(totalContas), icon: CheckCircle2, cor: "text-blue-600" },
        secundario2: { label: "Valor total", valor: formatBRL(totalValor), icon: Package, cor: "text-purple-600" },
        secundario3: {
          label: "Última remessa",
          valor: ultima ? formatDateBR(ultima.enviada_em.slice(0, 10)) : "—",
          icon: History,
          cor: "text-orange-600",
        },
      };
    }

    const totalContas = grupos.reduce((s, g) => s + Number(g.qtd_contas), 0);
    const totalValor = grupos.reduce((s, g) => s + Number(g.total_valor || 0), 0);
    const totalFornecedores = grupos.length;
    const maisAntigo = grupos.length > 0
      ? Math.max(...grupos.map((g) => g.mais_antigo_dias || 0))
      : 0;

    if (aba === "cobrar") {
      return {
        principal: { label: "Contas a cobrar", valor: String(totalContas), icon: AlertCircle, cor: "text-red-600" },
        secundario1: { label: "Fornecedores", valor: String(totalFornecedores), icon: Users, cor: "text-blue-600" },
        secundario2: { label: "Valor pendente", valor: formatBRL(totalValor), icon: Package, cor: "text-amber-600" },
        secundario3: { label: "Mais antigo", valor: maisAntigo + " dias", icon: Clock, cor: "text-orange-600" },
      };
    }

    // pronto
    return {
      principal: { label: "Prontas pra enviar", valor: String(totalContas), icon: Send, cor: "text-amber-600" },
      secundario1: { label: "Fornecedores", valor: String(totalFornecedores), icon: Users, cor: "text-blue-600" },
      secundario2: { label: "Valor pronto", valor: formatBRL(totalValor), icon: Package, cor: "text-emerald-600" },
      secundario3: { label: "Mais antigo", valor: maisAntigo + " dias", icon: Clock, cor: "text-orange-600" },
    };
  }, [aba, grupos, remessas]);

  // ============================================================
  // SELEÇÃO (aba pronto)
  // ============================================================
  const todasContasPronto = useMemo(() => {
    if (aba !== "pronto") return [];
    return grupos.flatMap((g) => g.contas_json);
  }, [aba, grupos]);

  const totalSelecionadoValor = useMemo(() => {
    return todasContasPronto
      .filter((c) => selecionadas.has(c.plano_contas_id))
      .reduce((s, c) => s + Number(c.valor || 0), 0);
  }, [todasContasPronto, selecionadas]);

  // Expande seleção de "entradas" (UI) pra IDs reais de contas (pra envio/export)
  const idsContasParaEnvio = useMemo(() => {
    const ids: string[] = [];
    for (const c of todasContasPronto) {
      if (!selecionadas.has(c.plano_contas_id)) continue;
      ids.push(...contaIdsDoItem(c));
    }
    return ids;
  }, [todasContasPronto, selecionadas]);

  function toggleSelecao(contaId: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(contaId)) next.delete(contaId);
      else next.add(contaId);
      return next;
    });
  }

  function toggleSelecaoFornecedor(grupo: GrupoFornecedor) {
    const ids = grupo.contas_json.map((c) => c.plano_contas_id);
    const todasJaSelecionadas = ids.every((id) => selecionadas.has(id));
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (todasJaSelecionadas) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function selecionarTodas() {
    setSelecionadas(new Set(todasContasPronto.map((c) => c.plano_contas_id)));
  }

  function limparSelecao() {
    setSelecionadas(new Set());
  }

  // ============================================================
  // EXPANDIR
  // ============================================================
  function toggleExpand(parceiroKey: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(parceiroKey)) next.delete(parceiroKey);
      else next.add(parceiroKey);
      return next;
    });
  }

  function expandirTodos() {
    setExpandidos(new Set(grupos.map((g) => g.parceiro_id || g.parceiro_razao_social)));
  }

  function colapsarTodos() {
    setExpandidos(new Set());
  }

  function toggleParcelas(key: string) {
    setParcelasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRemessa(id: string) {
    setRemessasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ============================================================
  // EXPORTAR PACOTE (das contas selecionadas)
  // ============================================================
  async function handleExportarPacote() {
    const ids = idsContasParaEnvio;
    if (ids.length === 0) {
      toast.error("Selecione pelo menos uma conta antes de exportar.");
      return;
    }
    setExportando(true);
    try {
      const { montarZipPacoteFiscal } = await import(
        "@/lib/financeiro/montar-pacote-fiscal"
      );
      const { blob, qtdDocumentos, contasSemDoc } =
        await montarZipPacoteFiscal(ids);

      if (qtdDocumentos === 0) {
        toast.error("Nenhum documento encontrado nas contas selecionadas.");
        return;
      }

      if (contasSemDoc.length > 0) {
        toast.warning(
          `${contasSemDoc.length} conta(s) sem NF anexada incluídas no pacote.`,
          { duration: 5000 },
        );
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documentos_${format(new Date(), "yyyy-MM-dd_HHmm")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Pacote exportado: ${qtdDocumentos} documento(s) em ZIP.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao exportar: " + msg);
    } finally {
      setExportando(false);
    }
  }

  // ============================================================
  // DESFAZER REMESSA
  // ============================================================
  async function confirmarDesfazerRemessa() {
    if (!remessaParaDesfazer) return;
    setDesfazendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("desfazer_remessa", {
        p_remessa_id: remessaParaDesfazer.id,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Erro ao desfazer");
      toast.success(`${data.qtd_contas_liberadas} conta(s) liberada(s)`);
      qc.invalidateQueries({ queryKey: ["remessas-contador"] });
      qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setDesfazendo(false);
      setRemessaParaDesfazer(null);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER */}
      <div className="px-6 pt-6 pb-3 border-b bg-background/95 backdrop-blur sticky top-0 z-20 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileWarning className="h-6 w-6 text-admin" />
              Documentos
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Cobrar fornecedores e administrar envios ao contador.
            </p>
          </div>
          <Button variant="outline" onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload em Massa
          </Button>
        </div>

        {/* TABS */}
        <Tabs value={aba} onValueChange={(v) => trocarAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="cobrar" className="gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Cobrar fornecedor
            </TabsTrigger>
            <TabsTrigger value="pronto" className="gap-1">
              <Send className="h-3.5 w-3.5" />
              Pronto pra enviar
            </TabsTrigger>
            <TabsTrigger value="enviado" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enviado
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[kpis.principal, kpis.secundario1, kpis.secundario2, kpis.secundario3].map((k, i) => {
            const Icon = k.icon;
            return (
              <Card key={i}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <Icon className={cn("h-3.5 w-3.5", k.cor)} />
                  </div>
                  <p className="text-2xl font-bold mt-1">{k.valor}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="h-8 text-xs w-36"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              className="h-8 text-xs w-36"
            />
          </div>
          <Input
            placeholder={aba === "enviado" ? "Buscar remessa..." : "Buscar fornecedor / NF..."}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 text-xs flex-1 min-w-[200px] max-w-[300px]"
          />
          {aba !== "enviado" && (
            <>
              <Button variant="ghost" size="sm" onClick={expandirTodos} className="h-8 text-xs">
                Expandir todos
              </Button>
              <Button variant="ghost" size="sm" onClick={colapsarTodos} className="h-8 text-xs">
                Colapsar
              </Button>
              {aba === "pronto" && (
                <>
                  <Button variant="ghost" size="sm" onClick={selecionarTodas} className="h-8 text-xs">
                    Selecionar todas
                  </Button>
                  {selecionadas.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={limparSelecao} className="h-8 text-xs">
                      Limpar seleção
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* LISTA */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-2 pb-24">
        {/* ABA COBRAR / PRONTO */}
        {aba !== "enviado" && (
          <>
            {loadingGrupos ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : grupos.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-600" />
                  <p className="font-medium">
                    {aba === "cobrar" ? "Nada pra cobrar" : "Nada pronto pra enviar"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {aba === "cobrar"
                      ? "Todos os documentos estão em ordem."
                      : "Suba documentos faltantes ou aguarde NFs chegarem."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              grupos.map((grupo) => {
                const key = grupo.parceiro_id || grupo.parceiro_razao_social;
                const isOpen = expandidos.has(key);
                const idsDoGrupo = grupo.contas_json.map((c) => c.plano_contas_id);
                const todasSelecionadas =
                  aba === "pronto" && idsDoGrupo.every((id) => selecionadas.has(id));
                const algumaSelecionada =
                  aba === "pronto" && idsDoGrupo.some((id) => selecionadas.has(id));

                return (
                  <Card key={key}>
                    <Collapsible open={isOpen} onOpenChange={() => toggleExpand(key)}>
                      <div className="p-4 flex items-center gap-3 hover:bg-muted/30">
                        {aba === "pronto" && (
                          <Checkbox
                            checked={todasSelecionadas}
                            onCheckedChange={() => toggleSelecaoFornecedor(grupo)}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(algumaSelecionada && !todasSelecionadas && "opacity-60")}
                          />
                        )}
                        <CollapsibleTrigger asChild>
                          <div className="flex-1 flex items-center gap-3 cursor-pointer min-w-0">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{grupo.parceiro_razao_social}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span>{grupo.qtd_contas} conta(s)</span>
                                {grupo.mais_antigo_dias > 0 && (
                                  <span>· {grupo.mais_antigo_dias} dias</span>
                                )}
                              </div>
                            </div>
                            <div className="font-mono text-sm shrink-0">
                              {formatBRL(Number(grupo.total_valor))}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="border-t divide-y">
                          {grupo.contas_json.map((c) => (
                            <ItemLinha
                              key={c.plano_contas_id}
                              conta={c}
                              aba={aba}
                              isSelected={selecionadas.has(c.plano_contas_id)}
                              onToggleSelecao={() => toggleSelecao(c.plano_contas_id)}
                              onAbrirDrawer={(id) => setContaIdDrawer(id)}
                              onBuscarNF={(conta) => setContaParaBuscar(conta)}
                              expandidoCompromisso={parcelasExpandidas.has(c.plano_contas_id)}
                              onToggleExpandirCompromisso={() =>
                                toggleParcelas(c.plano_contas_id)
                              }
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* ABA ENVIADO */}
        {aba === "enviado" && (
          <>
            {loadingRemessas ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : remessas.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium">Nenhuma remessa registrada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Marque contas como enviadas na aba "Pronto pra enviar".
                  </p>
                </CardContent>
              </Card>
            ) : (
              remessas.map((r) => {
                const isOpen = remessasExpandidas.has(r.id);
                return (
                  <Card key={r.id}>
                    <Collapsible open={isOpen} onOpenChange={() => toggleRemessa(r.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="p-4 cursor-pointer hover:bg-muted/30 flex items-center gap-3">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              {r.descricao || "Remessa sem descrição"}
                              {r.tem_cancelada && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] border-amber-400 text-amber-700 bg-amber-50 gap-1"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Cancelada após envio
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className="text-[9px] border-zinc-300 text-zinc-600"
                              >
                                {r.metodo === "manual_download" ? "Manual" : "Sistema"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                              <span>{formatDateBR(r.enviada_em.slice(0, 10))}</span>
                              <span>· {r.qtd_contas} conta(s)</span>
                              <span>· {r.qtd_documentos} doc(s)</span>
                              {r.destinatarios?.length > 0 && (
                                <span title={r.destinatarios.join(", ")}>
                                  · {r.destinatarios.length} destinatário(s)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="font-mono text-sm shrink-0">
                            {formatBRL(r.total_valor)}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t p-4 space-y-3">
                          {r.observacao && (
                            <div className="text-xs italic text-muted-foreground">
                              {r.observacao}
                            </div>
                          )}
                          <div className="text-[11px] text-muted-foreground">
                            <strong>Destinatários:</strong>{" "}
                            {r.destinatarios?.length > 0 ? r.destinatarios.join(", ") : "—"}
                          </div>
                          <RemessaContas remessaId={r.id} onAbrirConta={setContaIdDrawer} />
                          {r.metodo === "manual_download" && (
                            <div className="pt-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setRemessaParaDesfazer(r)}
                                className="text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Desfazer remessa
                              </Button>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>

      {/* BARRA FLUTUANTE (aba pronto + seleção) */}
      {aba === "pronto" && selecionadas.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background shadow-lg">
          <div className="px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <strong>{selecionadas.size}</strong> conta(s) selecionadas — total{" "}
              <strong className="font-mono">{formatBRL(totalSelecionadoValor)}</strong>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleExportarPacote}
                disabled={exportando}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                {exportando ? "Exportando..." : "Exportar Pacote"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setMarcarOpen(true)}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Marcar como enviadas
              </Button>
              <Button
                onClick={() => setEnviarSistemaOpen(true)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="h-4 w-4" />
                Enviar pelo sistema
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAIS */}
      <ContaPagarDetalheDrawer
        contaId={contaIdDrawer}
        onClose={() => {
          setContaIdDrawer(null);
          qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
          qc.invalidateQueries({ queryKey: ["remessas-contador"] });
        }}
      />

      <UploadEmMassaDialog
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
        }}
      />

      <MarcarEnviadasDialog
        open={marcarOpen}
        onClose={() => setMarcarOpen(false)}
        contasIds={idsContasParaEnvio}
        totalValor={totalSelecionadoValor}
        onSuccess={() => setSelecionadas(new Set())}
      />

      <EnviarPeloSistemaDialog
        open={enviarSistemaOpen}
        onClose={() => setEnviarSistemaOpen(false)}
        contasSelecionadas={todasContasPronto
          .filter((c) => selecionadas.has(c.plano_contas_id))
          .flatMap((c) => {
            // Pra compromisso: expande em todas as parcelas (com seus próprios valores/datas).
            // Pra avulsa: 1 entrada igual à conta.
            if (c.tipo === "compromisso" && c.parcelas && c.parcelas.length > 0) {
              return c.parcelas.map((p) => ({
                conta_id: p.plano_contas_id,
                valor: Number(p.valor || 0),
                data_vencimento: p.data_vencimento,
                data_pagamento: p.data_pagamento,
              }));
            }
            return [{
              conta_id: c.plano_contas_id,
              valor: Number(c.valor || 0),
              data_vencimento: c.data_vencimento,
              data_pagamento: c.data_pagamento,
            }];
          })}
        onSuccess={() => setSelecionadas(new Set())}
      />

      {contaParaBuscar && (
        <BuscarNFStageDialog
          open={!!contaParaBuscar}
          onOpenChange={(o) => !o && setContaParaBuscar(null)}
          contaId={contaParaBuscar.plano_contas_id}
          contaDescricao={contaParaBuscar.descricao}
          contaValor={Number(contaParaBuscar.valor || 0)}
          onVinculado={() => {
            qc.invalidateQueries({ queryKey: ["docs-envio-agrupados"] });
            setContaParaBuscar(null);
          }}
        />
      )}

      <AlertDialog
        open={!!remessaParaDesfazer}
        onOpenChange={(o) => !o && setRemessaParaDesfazer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer remessa?</AlertDialogTitle>
            <AlertDialogDescription>
              {remessaParaDesfazer && (
                <>
                  As {remessaParaDesfazer.qtd_contas} conta(s) desta remessa voltarão pra aba
                  "Pronto pra enviar". O registro histórico será removido.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desfazendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarDesfazerRemessa}
              disabled={desfazendo}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {desfazendo ? "Desfazendo..." : "Sim, desfazer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// SUBCOMPONENTE: contas de uma remessa (lazy)
// ============================================================
function RemessaContas({
  remessaId,
  onAbrirConta,
}: {
  remessaId: string;
  onAbrirConta: (id: string) => void;
}) {
  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["remessa-contas", remessaId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("remessas_contador_itens")
        .select(
          `
          plano_contas_id,
          contas_pagar_receber!inner(
            id, descricao, valor, data_pagamento, status, nf_numero,
            parceiros_comerciais:parceiro_id(razao_social),
            fornecedor_cliente
          )
        `,
        )
        .eq("remessa_id", remessaId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []) as any[];
    },
  });

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (contas.length === 0)
    return <div className="text-xs italic text-muted-foreground">Sem contas</div>;

  return (
    <div className="border rounded-md divide-y bg-muted/20">
      {contas.map((it) => {
        const c = it.contas_pagar_receber;
        const fornecedor = c?.parceiros_comerciais?.razao_social || c?.fornecedor_cliente || "—";
        const cancelada = c?.status === "cancelado";
        return (
          <div
            key={it.plano_contas_id}
            className={cn(
              "px-3 py-2 text-xs flex items-center gap-3 cursor-pointer hover:bg-muted/40",
              cancelada && "bg-rose-50/40",
            )}
            onClick={() => onAbrirConta(it.plano_contas_id)}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{fornecedor}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {c?.descricao}
                {c?.nf_numero && ` · NF ${c.nf_numero}`}
                {c?.data_pagamento && ` · Pago ${formatDateBR(c.data_pagamento)}`}
              </div>
            </div>
            {cancelada && (
              <Badge
                variant="outline"
                className="text-[9px] border-rose-400 text-rose-700 bg-rose-50 gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                Cancelada
              </Badge>
            )}
            <div className="font-mono text-[11px] shrink-0">
              {formatBRL(Number(c?.valor || 0))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// SUBCOMPONENTE: linha de uma entrada (conta avulsa OU compromisso parcelado)
// ============================================================
function ItemLinha({
  conta,
  aba,
  isSelected,
  onToggleSelecao,
  onAbrirDrawer,
  onBuscarNF,
  expandidoCompromisso,
  onToggleExpandirCompromisso,
}: {
  conta: ContaItem;
  aba: Aba;
  isSelected: boolean;
  onToggleSelecao: () => void;
  onAbrirDrawer: (id: string) => void;
  onBuscarNF: (c: ContaItem) => void;
  expandidoCompromisso: boolean;
  onToggleExpandirCompromisso: () => void;
}) {
  const ehCompromisso =
    conta.tipo === "compromisso" &&
    !!conta.parcelas &&
    conta.parcelas.length > 0;
  const bgClass = aba === "pronto" ? STATUS_CONTA_BG[conta.status_conta] || "" : "";

  return (
    <div>
      <div
        className={cn(
          "px-4 py-2 flex items-center gap-3 hover:bg-muted/30",
          bgClass,
          isSelected && "bg-emerald-50/60",
        )}
      >
        {aba === "pronto" && (
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelecao} />
        )}
        {ehCompromisso ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpandirCompromisso();
            }}
            className="shrink-0 p-0.5 hover:bg-muted rounded"
            title={expandidoCompromisso ? "Ocultar parcelas" : "Ver parcelas"}
          >
            {expandidoCompromisso ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onAbrirDrawer(conta.plano_contas_id)}
        >
          <div className="text-xs truncate flex items-center gap-1.5" title={conta.descricao}>
            <span className="truncate">{conta.descricao}</span>
            {ehCompromisso && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                {conta.parcelas_pagas ?? 0}/{conta.qtd_parcelas ?? conta.parcelas?.length ?? 0} parcelas pagas
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
            {ehCompromisso ? (
              <>
                <span>{conta.qtd_parcelas ?? conta.parcelas?.length ?? 0} parcelas</span>
                <span>· 1ª venc: {formatDateBR(conta.data_vencimento)}</span>
              </>
            ) : (
              <>
                <span>Venc: {formatDateBR(conta.data_vencimento)}</span>
                {conta.data_pagamento && (
                  <span>Pago: {formatDateBR(conta.data_pagamento)}</span>
                )}
              </>
            )}
            {conta.nf_numero && <span>NF: {conta.nf_numero}</span>}
            {aba === "pronto" && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {STATUS_CONTA_LABEL[conta.status_conta] || conta.status_conta}
              </Badge>
            )}
          </div>
        </div>
        <ClusterPills conta={conta} onBuscarNF={onBuscarNF} />
        <div className="font-mono text-xs shrink-0">
          {formatBRL(Number(conta.valor))}
        </div>
      </div>

      {/* Drill-down de parcelas (só quando compromisso e expandido) */}
      {ehCompromisso && expandidoCompromisso && (
        <div className="border-t bg-muted/20 divide-y">
          {conta.parcelas!.map((p, idx) => (
            <div
              key={p.plano_contas_id}
              className="pl-12 pr-4 py-1.5 flex items-center gap-3 text-[11px] cursor-pointer hover:bg-muted/40"
              onClick={() => onAbrirDrawer(p.plano_contas_id)}
            >
              <span className="text-muted-foreground shrink-0">
                Parcela {idx + 1}/{conta.qtd_parcelas ?? conta.parcelas!.length}
              </span>
              <div className="flex-1 min-w-0 flex gap-2 text-muted-foreground flex-wrap">
                <span>Venc: {formatDateBR(p.data_vencimento)}</span>
                {p.data_pagamento && (
                  <span>Pago: {formatDateBR(p.data_pagamento)}</span>
                )}
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                  {STATUS_CONTA_LABEL[p.status_conta] || p.status_conta}
                </Badge>
              </div>
              <div className="font-mono shrink-0">
                {formatBRL(Number(p.valor))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
