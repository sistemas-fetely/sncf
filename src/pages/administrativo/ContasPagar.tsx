import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { getStatusCprMeta, STATUS_CPR_FILTRAVEIS, STATUS_CPR_META } from "@/lib/financeiro/status-cpr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SortableTableHead,
  ordenarPor,
  type SortState,
} from "@/components/shared/SortableTableHead";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ArrowUpFromLine,
  Plus,
  Upload,
  Flame,
  AlertTriangle,
  Clock,
  CalendarDays,
  MoreVertical,
  FileWarning,
  PackageOpen,
  X,
} from "lucide-react";
import AcoesInlineConta from "@/components/financeiro/AcoesInlineConta";
import {
  useTituloPagarAcoes,
  useTituloPagarTransicionar,
  type TituloPagarAcao,
} from "@/hooks/financeiro/useTituloPagarEstado";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import { NovaContaPagarSheet } from "@/components/financeiro/NovaContaPagarSheet";
import { ImportarNFDespesaDialog } from "@/components/financeiro/ImportarNFDespesaDialog";
import { getMeioPagamentoIcon } from "@/lib/financeiro/meio-pagamento-icon";
import { cn } from "@/lib/utils";
import { hojeISO } from "@/lib/data";
import { LoteAcaoContasDialog } from "@/components/financeiro/LoteAcaoContasDialog";

type Conta = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  parceiro_id: string | null;
  plano_contas_id: string | null;
  origem: string | null;
  meio_pagamento_id: string | null;
  meios_pagamento?: { codigo: string | null } | null;
  tags: unknown;
  tem_doc_pendente: boolean | null;
  atrasada: boolean | null;
  status_efetivo: string | null;
  
  nf_tipo: string | null;
  nf_fornecedor: string | null;
  mov_conciliada: boolean | null;
  movimentacao_bancaria_id: string | null;
  nf_numero_repositorio: string | null;
  nf_aplicavel?: boolean | null;
  vinculo_nf_completo?: boolean | null;
  valor_nf_vinculado?: number | null;
  plano_contas?: { codigo?: string | null; nome: string } | null;
  parceiros_comerciais?: { razao_social: string | null } | null;
  formas_pagamento?: { codigo: string | null; nome: string | null; cobra_email: boolean | null; pula_aprovacao: boolean | null } | null;
  fornecedor_cliente?: string | null;
  valor_alocado?: number | null;
  saldo?: number | null;
  situacao_pagamento?: "nao_pago" | "parcial" | "pago" | "cancelado" | null;
  qtd_pagamentos?: number | null;
  // ESTADO × PROVAS — a view devolve o estado já resolvido pelo banco.
  data_pretendida: string | null;
  estado_rotulo: string | null;
  estado_cor: string | null;
  estado_ordem: number | null;
  estado_terminal: boolean | null;
  estado_exige_data: boolean | null;
};

// Status de CPR: mapa canônico em `@/lib/financeiro/status-cpr`.


/** hoje + 7 dias, em Brasília, como "YYYY-MM-DD". */
function limiteSemana(): string {
  const [a, m, d] = hojeISO().split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + 7));
  return dt.toISOString().slice(0, 10);
}

type KpiFilter = "a_aprovar" | "a_programar" | "esta_semana" | "vencido" | null;

/** Regras dos KPIs — perguntas do trilho, uma fonte só para card e filtro. */
const REGRA_KPI: Record<Exclude<KpiFilter, null>, (c: Conta, limite: string) => boolean> = {
  a_aprovar: (c) => c.status === "aberto",
  a_programar: (c) => c.status === "aprovado" && !c.data_pretendida,
  esta_semana: (c, limite) =>
    c.status === "programado" && !!c.data_pretendida && c.data_pretendida <= limite,
  vencido: (c) => c.atrasada === true,
};

export default function ContasPagar() {
  const qc = useQueryClient();

  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  // Altura do bloco sticky de KPIs/filtros — o cabeçalho da tabela fica ancorado logo abaixo dele
  const headerStickyRef = useRef<HTMLDivElement>(null);
  const [headerStickyH, setHeaderStickyH] = useState(0);
  useEffect(() => {
    const el = headerStickyRef.current;
    if (!el) return;
    const update = () => setHeaderStickyH(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pendentes");
  const [solicitanteFilter, setSolicitanteFilter] = useState<string>("todos");

  const [contaIdSelecionada, setContaIdSelecionada] = useState<string | null>(null);
  const [novaContaOpen, setNovaContaOpen] = useState(false);
  const [importarNFOpen, setImportarNFOpen] = useState(false);
  const [initialDataNovaConta, setInitialDataNovaConta] = useState<
    ComponentProps<typeof NovaContaPagarSheet>["initialData"] | undefined
  >(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["contas-pagar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contas_pagar_consolidado")
        .select(
          "*, plano_contas:plano_contas_id(codigo,nome), parceiros_comerciais:parceiro_id(razao_social), formas_pagamento:forma_pagamento_id(codigo,nome,cobra_email,pula_aprovacao), meios_pagamento:meio_pagamento_id(codigo), cartoes_credito:cartao_id(nome,ultimos_digitos)",
        )
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as Conta[];
    },
  });

  const { data: emailMap = new Map<string, boolean>() } = useQuery({
    queryKey: ["contas-pagar-email-map"],
    enabled: !!data && data.length > 0,
    queryFn: async () => {
      const ids = (data || []).map((c) => c.id).filter(Boolean) as string[];
      if (ids.length === 0) return new Map<string, boolean>();
      const { data: rows, error } = await supabase
        .from("contas_pagar_receber")
        .select("id, email_pagamento_enviado")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, boolean>();
      (rows || []).forEach((r: { id: string; email_pagamento_enviado: boolean | null }) => {
        m.set(r.id, !!r.email_pagamento_enviado);
      });
      return m;
    },
  });

  const { data: pendenciaMap = new Map<string, { com_pendencia: boolean; pendencias: string[] }>() } = useQuery({
    queryKey: ["contas-pagar-pendencia-map", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.length > 0,
    queryFn: async () => {
      const ids = (data || []).map((c) => c.id);
      if (ids.length === 0) return new Map<string, { com_pendencia: boolean; pendencias: string[] }>();
      const { data: rows, error } = await supabase
        .from("contas_pagar_receber")
        .select("id, pagamento_com_pendencia, pendencias_no_envio")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, { com_pendencia: boolean; pendencias: string[] }>();
      (rows || []).forEach((r: { id: string; pagamento_com_pendencia: boolean | null; pendencias_no_envio: string[] | null }) => {
        if (r.pagamento_com_pendencia) {
          m.set(r.id, { com_pendencia: true, pendencias: r.pendencias_no_envio || [] });
        }
      });
      return m;
    },
  });

  // Estado do vínculo NF por CPR (vw_contas_pagar_consolidado não expõe esses campos)
  const { data: nfStatusMap = new Map<string, { nf_aplicavel: boolean; vinculo_nf_completo: boolean; valor_nf_vinculado: number }>() } = useQuery({
    queryKey: ["contas-pagar-nf-status-map", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.length > 0,
    queryFn: async () => {
      const ids = (data || []).map((c) => c.id);
      const m = new Map<string, { nf_aplicavel: boolean; vinculo_nf_completo: boolean; valor_nf_vinculado: number }>();
      if (ids.length === 0) return m;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .select("id, nf_aplicavel, vinculo_nf_completo, valor_nf_vinculado")
        .in("id", ids);
      if (error) throw error;
      (rows || []).forEach((r: { id: string; nf_aplicavel: boolean | null; vinculo_nf_completo: boolean | null; valor_nf_vinculado: number | null }) => {
        m.set(r.id, {
          nf_aplicavel: r.nf_aplicavel !== false,
          vinculo_nf_completo: r.vinculo_nf_completo === true,
          valor_nf_vinculado: Number(r.valor_nf_vinculado || 0),
        });
      });
      return m;
    },
  });

  // Mapa: conta_id → data_vencimento da fatura de cartão vinculada
  const { data: faturaMap = new Map<string, string>() } = useQuery({
    queryKey: ["contas-pagar-fatura-map", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.some((c) => c.meios_pagamento?.codigo === "fatura_cartao"),
    queryFn: async () => {
      const ids = (data || []).filter((c) => c.meios_pagamento?.codigo === "fatura_cartao").map((c) => c.id);
      if (ids.length === 0) return new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .select("conta_pagar_id, faturas_cartao:fatura_id(data_vencimento)")
        .in("conta_pagar_id", ids);
      const m = new Map<string, string>();
      (rows || []).forEach((r: { conta_pagar_id: string | null; faturas_cartao: { data_vencimento: string } | null }) => {
        if (r.conta_pagar_id && r.faturas_cartao?.data_vencimento) {
          m.set(r.conta_pagar_id, r.faturas_cartao.data_vencimento);
        }
      });
      return m;
    },
  });

  // Solicitante — via pedido_compra. Retorna Map (cpr_id -> user_id) + options ordenadas pelo nome.
  const { data: solicitanteData = { map: new Map<string, string>(), options: [] as { id: string; nome: string }[] } } = useQuery({
    queryKey: ["contas-pagar-solicitante-data", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.length > 0,
    queryFn: async () => {
      const ids = (data || []).map((c) => c.id);
      if (ids.length === 0) return { map: new Map<string, string>(), options: [] as { id: string; nome: string }[] };

      const { data: cprs, error: e1 } = await supabase
        .from("contas_pagar_receber")
        .select("id, pedido_compra_id")
        .in("id", ids)
        .not("pedido_compra_id", "is", null);
      if (e1) throw e1;

      const pedidoIds = Array.from(
        new Set((cprs || []).map((c) => c.pedido_compra_id).filter(Boolean) as string[]),
      );
      if (pedidoIds.length === 0) return { map: new Map<string, string>(), options: [] as { id: string; nome: string }[] };

      const { data: pedidos, error: e2 } = await supabase
        .from("pedidos_compra")
        .select("id, solicitante_id")
        .in("id", pedidoIds);
      if (e2) throw e2;

      const pedidoSolMap = new Map<string, string>();
      (pedidos || []).forEach((p) => pedidoSolMap.set(p.id, p.solicitante_id));

      const cprToSol = new Map<string, string>();
      (cprs || []).forEach((c) => {
        if (c.pedido_compra_id && pedidoSolMap.has(c.pedido_compra_id)) {
          cprToSol.set(c.id, pedidoSolMap.get(c.pedido_compra_id)!);
        }
      });

      const userIds = Array.from(new Set(Array.from(cprToSol.values())));
      if (userIds.length === 0) return { map: cprToSol, options: [] as { id: string; nome: string }[] };

      const [profilesRes, clRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
        supabase.from("colaboradores_clt").select("user_id, nome_completo").in("user_id", userIds),
      ]);

      const nomeMap = new Map<string, string>();
      for (const p of profilesRes.data || []) {
        if (p.full_name) nomeMap.set(p.user_id as string, p.full_name);
      }
      for (const c of clRes.data || []) {
        if (c.nome_completo && c.user_id) nomeMap.set(c.user_id, c.nome_completo);
      }

      const options = userIds
        .map((id) => ({ id, nome: nomeMap.get(id) || "—" }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      return { map: cprToSol, options };
    },
  });

  const solicitanteMap = solicitanteData.map;
  const solicitantesOptions = solicitanteData.options;

  const temPendenciaNF = (id: string) => {
    const s = nfStatusMap.get(id);
    return !!s && s.nf_aplicavel && !s.vinculo_nf_completo;
  };

  type SortColumn = "parceiro" | "descricao" | "documento" | "vencimento" | "pretendida" | "meio_pagamento" | "categoria" | "valor" | "status";
  const [sort, setSort] = useState<SortState<SortColumn> | null>({ column: "vencimento", direction: "asc" });

  const limite = limiteSemana();

  const kpis = useMemo(() => {
    const lista = data || [];
    const sumValor = (arr: Conta[]) => arr.reduce((s, c) => s + Number(c.valor || 0), 0);
    const bloco = (k: Exclude<KpiFilter, null>) => {
      const arr = lista.filter((c) => REGRA_KPI[k](c, limite));
      return { count: arr.length, valor: sumValor(arr) };
    };
    return {
      a_aprovar: bloco("a_aprovar"),
      a_programar: bloco("a_programar"),
      esta_semana: bloco("esta_semana"),
      vencido: bloco("vencido"),
    };
  }, [data, limite]);

  const filtrados = useMemo(() => {
    let lista = data || [];
    if (kpiFilter) {
      lista = lista.filter((c) => REGRA_KPI[kpiFilter](c, limite));
    }
    if (busca.trim()) {
      const b = busca.toLowerCase();
      lista = lista.filter(
        (c) =>
          c.descricao?.toLowerCase().includes(b) ||
          c.parceiros_comerciais?.razao_social?.toLowerCase().includes(b) ||
          c.fornecedor_cliente?.toLowerCase().includes(b),
      );
    }
    if (statusFilter === "pendentes") {
      lista = lista.filter((c) => !c.estado_terminal);
    } else if (statusFilter === "pendencia_nf") {
      lista = lista.filter((c) => temPendenciaNF(c.id));
    } else if (statusFilter === "parcialmente_pago") {
      lista = lista.filter((c) => c.situacao_pagamento === "parcial");
    } else if (statusFilter && statusFilter !== "todos") {
      lista = lista.filter((c) => c.status === statusFilter);
    }
    if (solicitanteFilter && solicitanteFilter !== "todos") {
      lista = lista.filter((c) => solicitanteMap.get(c.id) === solicitanteFilter);
    }
    if (dataDe) lista = lista.filter((c) => (c.data_vencimento || "") >= dataDe);
    if (dataAte) lista = lista.filter((c) => (c.data_vencimento || "") <= dataAte);

    // Ordenação
    lista = ordenarPor(lista, sort, {
      parceiro: (c) => c.parceiros_comerciais?.razao_social || c.fornecedor_cliente || "",
      descricao: (c) => c.descricao || "",
      documento: (c) => c.nf_numero_repositorio || null,
      vencimento: (c) => c.data_vencimento || "",
      // nulos por último nas duas direções (ordenarPor já trata null assim)
      pretendida: (c) => c.data_pretendida ?? null,
      meio_pagamento: (c) => c.formas_pagamento?.nome || "",
      categoria: (c) => c.plano_contas?.nome || "",
      valor: (c) => Number(c.valor) || 0,
      // ESTADO × PROVAS — a ordem é a do banco, não a alfabética do slug.
      status: (c) => c.estado_ordem ?? null,
    });

    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kpiFilter, busca, statusFilter, solicitanteFilter, dataDe, dataAte, pendenciaMap, solicitanteMap, nfStatusMap, sort]);

  /**
   * AUSÊNCIA DE LINHA NA TRANSIÇÃO = BOTÃO NÃO EXISTE.
   * Uma consulta para a página toda — o hook devolve Map<cpr_id, acoes[]>.
   */
  const { data: acoesMap } = useTituloPagarAcoes(filtrados.map((c) => c.id));
  const transicionar = useTituloPagarTransicionar();

  // ---- Seleção em lote --------------------------------------------------
  // A seleção vive aqui e morre a cada troca de filtro: selecionar 187 títulos
  // e depois mudar o filtro faria a barra agir sobre o que não está mais na tela.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [acaoLote, setAcaoLote] = useState<TituloPagarAcao | null>(null);

  useEffect(() => {
    setSelecionados(new Set());
  }, [kpiFilter, busca, statusFilter, solicitanteFilter, dataDe, dataAte]);

  const idsSelecionados = useMemo(
    () => filtrados.filter((c) => selecionados.has(c.id)).map((c) => c.id),
    [filtrados, selecionados],
  );
  const valorSelecionado = useMemo(
    () =>
      filtrados
        .filter((c) => selecionados.has(c.id))
        .reduce((s, c) => s + Number(c.valor || 0), 0),
    [filtrados, selecionados],
  );
  /** Menor vencimento entre os selecionados; se já passou, usa hoje. */
  const dataPretendidaInicialLote = useMemo(() => {
    const contas = filtrados.filter((c) => selecionados.has(c.id));
    const vencimentos = contas
      .map((c) => c.data_vencimento)
      .filter((d): d is string => !!d);
    if (vencimentos.length === 0) return null;
    const menor = [...vencimentos].sort()[0];
    const hoje = hojeISO();
    return menor >= hoje ? menor : hoje;
  }, [filtrados, selecionados]);
  const todosSelecionados =
    filtrados.length > 0 && idsSelecionados.length === filtrados.length;

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  /**
   * INTERSEÇÃO das ações da dimensão: só ofereço em lote o que é transição legal
   * para TODOS os selecionados. Nada de condicional por estado no TSX.
   */
  const acoesLote = useMemo<TituloPagarAcao[]>(() => {
    if (idsSelecionados.length === 0 || !acoesMap) return [];
    const listas = idsSelecionados.map((id) => acoesMap.get(id) ?? []);
    if (listas.some((l) => l.length === 0)) return [];
    const [primeira, ...resto] = listas;
    return primeira.filter((a) =>
      resto.every((l) => l.some((b) => b.para === a.para)),
    );
  }, [idsSelecionados, acoesMap]);

  const [acaoPendente, setAcaoPendente] = useState<
    { conta: Conta; acao: TituloPagarAcao } | null
  >(null);
  const [motivo, setMotivo] = useState("");
  const [dataPretendida, setDataPretendida] = useState("");

  function executar(cprId: string, acao: TituloPagarAcao, m?: string, d?: string) {
    transicionar.mutate({
      cprId,
      para: acao.para,
      motivo: m || undefined,
      dataPretendida: d || null,
    });
  }

  function abrirAcao(conta: Conta, acao: TituloPagarAcao) {
    if (acao.exige_motivo || acao.exige_data_pretendida) {
      setMotivo("");
      setDataPretendida(conta.data_pretendida || "");
      setAcaoPendente({ conta, acao });
      return;
    }
    executar(conta.id, acao);
  }

  function confirmarAcaoPendente() {
    if (!acaoPendente) return;
    const { conta, acao } = acaoPendente;
    executar(conta.id, acao, acao.exige_motivo ? motivo : undefined, acao.exige_motivo ? undefined : dataPretendida);
    setAcaoPendente(null);
  }


  const temFiltroAtivo =
    !!busca.trim() ||
    !!dataDe ||
    !!dataAte ||
    statusFilter !== "pendentes" ||
    solicitanteFilter !== "todos" ||
    kpiFilter !== null;

  function limparFiltros() {
    setBusca("");
    setDataDe("");
    setDataAte("");
    setStatusFilter("pendentes");
    setSolicitanteFilter("todos");
    setKpiFilter(null);
  }

  function invalidarTudo() {
    qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar-pendencia-map"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar-email-map"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar-bola-redonda-set"] });
    qc.invalidateQueries({ queryKey: ["contas-pagar-solicitante-data"] });
  }

  function abrirNovaAvulsa() {
    setInitialDataNovaConta(undefined);
    setNovaContaOpen(true);
  }

  return (
    <PageShell>
      {/* Header sticky */}
      <div ref={headerStickyRef} className="sticky top-0 z-20 bg-background -mx-6 -mt-6 px-6 pt-6 pb-4 border-b space-y-4 backdrop-blur">
        <PageHeader
          titulo="Contas a Pagar"
          icone={ArrowUpFromLine}
          estado="O que precisa de ação. Títulos já provados ficam em 'Todos os status'."
          acoes={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setImportarNFOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Importar NF
              </Button>
              <Button
                onClick={abrirNovaAvulsa}
                style={{ backgroundColor: "#1A4A3A", color: "white" }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nova Despesa
              </Button>
            </div>
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={Flame}
            label="A aprovar"
            count={kpis.a_aprovar.count}
            valor={kpis.a_aprovar.valor}
            color="text-warning"
            border="border-warning/40"
            active={kpiFilter === "a_aprovar"}
            onClick={() => setKpiFilter(kpiFilter === "a_aprovar" ? null : "a_aprovar")}
          />
          <KpiCard
            icon={Clock}
            label="A programar"
            count={kpis.a_programar.count}
            valor={kpis.a_programar.valor}
            color="text-info"
            border="border-info/40"
            active={kpiFilter === "a_programar"}
            onClick={() => setKpiFilter(kpiFilter === "a_programar" ? null : "a_programar")}
          />
          <KpiCard
            icon={CalendarDays}
            label="Esta semana"
            count={kpis.esta_semana.count}
            valor={kpis.esta_semana.valor}
            color="text-success"
            border="border-success/40"
            active={kpiFilter === "esta_semana"}
            onClick={() => setKpiFilter(kpiFilter === "esta_semana" ? null : "esta_semana")}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Vencido"
            count={kpis.vencido.count}
            valor={kpis.vencido.valor}
            color="text-destructive"
            border="border-destructive/40"
            active={kpiFilter === "vencido"}
            onClick={() => setKpiFilter(kpiFilter === "vencido" ? null : "vencido")}
          />

        </div>
      </div>

      <ContasCorrentesFornecedorCard />


      {/* Barra de filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar parceiro ou descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-64"
        />
        <Input
          type="date"
          value={dataDe}
          onChange={(e) => setDataDe(e.target.value)}
          className="w-40"
          aria-label="Data de"
        />
        <Input
          type="date"
          value={dataAte}
          onChange={(e) => setDataAte(e.target.value)}
          className="w-40"
          aria-label="Data até"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Pendentes (padrão)</SelectItem>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_CPR_FILTRAVEIS.map((s) => (
              <SelectItem key={s} value={s}>
                {getStatusCprMeta(s).label}
              </SelectItem>
            ))}
            <SelectItem value="pendencia_nf">Pendência NF</SelectItem>
            <SelectItem value="parcialmente_pago">Parcialmente pagos</SelectItem>
          </SelectContent>
        </Select>
        {solicitantesOptions.length > 0 && (
          <Select value={solicitanteFilter} onValueChange={setSolicitanteFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Solicitante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os solicitantes</SelectItem>
              {solicitantesOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {temFiltroAtivo && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} className="gap-1">
            <X className="h-3 w-3" /> Limpar filtros
          </Button>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {filtrados.length} registro{filtrados.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Barra de ação em lote */}
      {idsSelecionados.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-md border bg-card px-4 py-3 shadow-sm">
          <span className="text-sm font-medium">
            {idsSelecionados.length} título{idsSelecionados.length === 1 ? "" : "s"} selecionado
            {idsSelecionados.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono">{formatBRL(valorSelecionado)}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())} className="gap-1">
            <X className="h-3 w-3" /> Limpar seleção
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {acoesLote.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                Os títulos selecionados estão em estados diferentes — refine a seleção.
              </span>
            ) : (
              acoesLote.map((a) => (
                <Button key={a.para} size="sm" variant="outline" onClick={() => setAcaoLote(a)}>
                  {a.rotulo_acao}
                </Button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <PackageOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">Nenhuma conta encontrada</h3>
              <p className="text-sm text-muted-foreground">
                {temFiltroAtivo
                  ? "Tente ajustar os filtros."
                  : "Importe NFs ou crie uma nova despesa pra começar."}
              </p>
            </div>
          ) : (
            // overflow-visible: sem isso o wrapper overflow-auto vira o contexto de scroll e quebra o sticky do cabeçalho na rolagem da página
            <TooltipProvider>
              <Table containerClassName="overflow-visible">
              <TableHeader
                className="sticky z-10 bg-background"
                style={{ top: headerStickyH }}
              >
                <TableRow>
                  <TableHead className="w-[36px]">
                    <Checkbox
                      checked={todosSelecionados}
                      aria-label="Selecionar todos os títulos filtrados"
                      onCheckedChange={(v) =>
                        setSelecionados(v ? new Set(filtrados.map((c) => c.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <SortableTableHead column="parceiro" sort={sort} onSort={setSort}>
                    Parceiro
                  </SortableTableHead>
                  <SortableTableHead column="descricao" sort={sort} onSort={setSort}>
                    Descrição
                  </SortableTableHead>
                  <SortableTableHead column="documento" sort={sort} onSort={setSort}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>Documento</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Nota fiscal amarrada ao título. Traço = título sem nota verificada.
                      </TooltipContent>
                    </Tooltip>
                  </SortableTableHead>
                  <SortableTableHead column="vencimento" sort={sort} onSort={setSort}>
                    Vencimento
                  </SortableTableHead>
                  <SortableTableHead column="pretendida" sort={sort} onSort={setSort}>
                    Pretendida
                  </SortableTableHead>
                  <SortableTableHead column="meio_pagamento" sort={sort} onSort={setSort}>
                    Meio de pagamento
                  </SortableTableHead>
                  <SortableTableHead column="categoria" sort={sort} onSort={setSort}>
                    Categoria
                  </SortableTableHead>
                  <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right">
                    Valor
                  </SortableTableHead>
                  <SortableTableHead column="status" sort={sort} onSort={setSort}>
                    Status
                  </SortableTableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => {
                  const parceiro =
                    c.parceiros_comerciais?.razao_social || c.fornecedor_cliente || "—";
                  const meio = c.formas_pagamento?.nome ?? null;
                  // Modelo 3D: cartão específico tem precedência sobre forma genérica
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cartaoData = (c as any).cartoes_credito as { nome: string; ultimos_digitos: string | null } | null;
                  const cartaoNome = cartaoData
                    ? cartaoData.nome + (cartaoData.ultimos_digitos ? ` ····${cartaoData.ultimos_digitos}` : "")
                    : null;
                  const meioDisplay = cartaoNome || meio;
                  const ico = meio ? getMeioPagamentoIcon(meio) : null;
                  const pend = pendenciaMap.get(c.id);
                  const atrasada =
                    c.atrasada && !["enviado_para_pagamento", "realizada", "cancelado"].includes(c.status);
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setContaIdSelecionada(c.id)}
                    >
                      <TableCell className="w-[36px]" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.has(c.id)}
                          aria-label={`Selecionar ${c.descricao}`}
                          onCheckedChange={() => alternarSelecao(c.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="truncate" title={parceiro}>
                          {parceiro}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate" title={c.descricao}>
                          {c.descricao}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.nf_numero_repositorio ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            NF {c.nf_numero_repositorio}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap",
                          atrasada && "text-destructive font-medium",
                        )}
                      >
                        {formatDateBR(c.data_vencimento)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.data_pretendida ? (
                          formatDateBR(c.data_pretendida)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {meio ? (
                          <div className="flex flex-col gap-0.5">
                            {ico ? (
                              <span className="flex items-center gap-1.5" title={meioDisplay || ""}>
                                <ico.Icon className={cn("h-4 w-4 shrink-0", ico.cor)} />
                                <span>{meioDisplay}</span>
                              </span>
                            ) : (
                              <span>{meioDisplay}</span>
                            )}
                            {c.meios_pagamento?.codigo === "fatura_cartao" && faturaMap.has(c.id) && (
                              <span className="text-[10px] text-muted-foreground pl-5">
                                fatura vence {formatDateBR(faturaMap.get(c.id)!)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                        {c.plano_contas?.nome ? (
                          <div className="truncate" title={c.plano_contas.nome}>
                            {c.plano_contas.nome}
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] border-warning/40 text-warning"
                          >
                            Sem categoria
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span>{formatBRL(c.valor)}</span>
                          {c.situacao_pagamento === "parcial" && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              restam {formatBRL(Number(c.saldo || 0))} · {c.qtd_pagamentos || 0} pagamento{(c.qtd_pagamentos || 0) === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {(() => {
                            // ESTADO × PROVAS: o RÓTULO vem do banco (estado_rotulo);
                            // o ESTILO continua sendo o design system (status-cpr).
                            // Slug desconhecido pelo TS cai em fail-soft com estado_cor.
                            const meta = getStatusCprMeta(c.status);
                            const rotulo = c.estado_rotulo || meta.label;
                            const desconhecido = !STATUS_CPR_META[c.status];
                            if (desconhecido && c.estado_cor) {
                              return (
                                <Badge
                                  className="border-transparent text-white"
                                  style={{ backgroundColor: c.estado_cor }}
                                >
                                  {rotulo}
                                </Badge>
                              );
                            }
                            return <Badge className={meta.className}>{rotulo}</Badge>;
                          })()}
                          {c.situacao_pagamento === "parcial" && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-info/40 text-info"
                            >
                              Parcialmente pago
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="min-w-[170px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          {(() => {
                            const acoes = acoesMap?.get(c.id) ?? [];
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild disabled={acoes.length === 0}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={acoes.length === 0}
                                    title={
                                      acoes.length === 0
                                        ? "Sem transição legal a partir deste estado"
                                        : "Mudar estado"
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  {acoes.map((a) => (
                                    <DropdownMenuItem
                                      key={`${a.de}-${a.para}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        abrirAcao(c, a);
                                      }}
                                    >
                                      {a.rotulo_acao}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })()}
                          <AcoesInlineConta
                            conta={{
                              ...c,
                              email_pagamento_enviado: emailMap.get(c.id) || false,
                            }}
                            onAbrirEditandoBanco={(id) => setContaIdSelecionada(id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <ContaPagarDetalheDrawer
        contaId={contaIdSelecionada}
        onClose={() => {
          setContaIdSelecionada(null);
          invalidarTudo();
        }}
      />

      <ImportarNFDespesaDialog
        open={importarNFOpen}
        onOpenChange={setImportarNFOpen}
        onDespesaPronta={(data) => {
          setInitialDataNovaConta(data);
          setImportarNFOpen(false);
          setNovaContaOpen(true);
        }}
      />

      <NovaContaPagarSheet
        open={novaContaOpen}
        onOpenChange={(v) => {
          setNovaContaOpen(v);
          if (!v) {
            setInitialDataNovaConta(undefined);
            invalidarTudo();
          }
        }}
        initialData={initialDataNovaConta}
      />

      <LoteAcaoContasDialog
        open={!!acaoLote}
        onOpenChange={(v) => !v && setAcaoLote(null)}
        ids={idsSelecionados}
        acao={acaoLote}
        dataPretendidaInicial={dataPretendidaInicialLote}
        onAplicado={() => {
          setSelecionados(new Set());
          invalidarTudo();
        }}
      />

      {/* UM só Dialog para toda a tabela — controlado por `acaoPendente`. */}
      <Dialog open={!!acaoPendente} onOpenChange={(v) => !v && setAcaoPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acaoPendente?.acao.rotulo_acao}</DialogTitle>
            <DialogDescription>
              {acaoPendente?.conta.descricao} · {formatBRL(acaoPendente?.conta.valor || 0)}
            </DialogDescription>
          </DialogHeader>

          {acaoPendente?.acao.exige_motivo ? (
            <div className="space-y-2">
              <Label htmlFor="motivo-transicao">Motivo</Label>
              <Textarea
                id="motivo-transicao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Fornecedor pediu para adiar o pagamento"
                rows={3}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="data-pretendida-transicao">Data pretendida de pagamento</Label>
              <Input
                id="data-pretendida-transicao"
                type="date"
                value={dataPretendida}
                onChange={(e) => setDataPretendida(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAcaoPendente(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarAcaoPendente}
              disabled={
                transicionar.isPending ||
                (acaoPendente?.acao.exige_motivo ? !motivo.trim() : !dataPretendida)
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  count,
  valor,
  color,
  border,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  valor: number;
  color: string;
  border: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        active && `border-2 ${border} shadow-sm`,
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-md bg-muted", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-medium leading-tight">{count}</div>
          <div className="text-xs text-muted-foreground font-mono">{formatBRL(valor)}</div>
        </div>
      </CardContent>
    </Card>
  );
}

type CcFornecedor = {
  cnpj: string | null;
  nome: string | null;
  documentado: number | null;
  n_docs: number | null;
  pago: number | null;
  n_pagamentos: number | null;
  saldo_devedor: number | null;
  ultimo_pagamento: string | null;
};

type CcExtratoRow = {
  cnpj: string;
  data: string;
  tipo: "documento" | "abatimento";
  descricao: string;
  valor: number;
  ref: string;
};

function ContaCorrenteFornecedorRow({ r }: { r: CcFornecedor }) {
  const [open, setOpen] = useState(false);
  const saldo = Number(r.saldo_devedor || 0);

  const { data: extrato, isLoading: loadingExtrato, error: extratoError } = useQuery({
    queryKey: ["cc-extrato", r.cnpj],
    enabled: open && !!r.cnpj,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conta_corrente_extrato")
        .select("*")
        .eq("cnpj", r.cnpj)
        .order("data");
      if (error) throw error;
      return (data || []) as CcExtratoRow[];
    },
  });

  let acumulado = 0;
  const linhasComSaldo = (extrato || []).map((mov) => {
    acumulado += Number(mov.valor || 0);
    return { mov, saldo: acumulado };
  });
  const saldoFinal = acumulado;

  return (
    <div className="py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 text-sm text-left hover:bg-muted/40 rounded px-1 -mx-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{r.nome || "—"}</div>
          {r.cnpj && <div className="text-[11px] text-muted-foreground font-mono">{r.cnpj}</div>}
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          Documentado <span className="font-mono">{formatBRL(Number(r.documentado || 0))}</span> ({r.n_docs || 0} doc{(r.n_docs || 0) === 1 ? "" : "s"})
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          Pago <span className="font-mono">{formatBRL(Number(r.pago || 0))}</span> ({r.n_pagamentos || 0} pagto{(r.n_pagamentos || 0) === 1 ? "" : "s"}
          {r.ultimo_pagamento ? ` · último ${formatDateBR(r.ultimo_pagamento)}` : ""})
        </div>
        <div className={cn(
          "text-right font-mono font-medium whitespace-nowrap min-w-[110px]",
          saldo > 0 ? "text-warning" : "text-success",
        )}>
          {formatBRL(saldo)}
        </div>
      </button>

      {open && (
        <div className="mt-2 ml-6 border rounded-md bg-muted/20">
          {loadingExtrato ? (
            <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Carregando extrato…
            </div>
          ) : extratoError ? (
            <div className="p-3 text-xs text-destructive">
              Erro ao carregar extrato: {(extratoError as Error).message}
            </div>
          ) : linhasComSaldo.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">Sem movimentos.</div>
          ) : (
            <div className="divide-y">
              {linhasComSaldo.map(({ mov, saldo: acc }, idx) => {
                const val = Number(mov.valor || 0);
                const isDoc = mov.tipo === "documento";
                return (
                  <div key={idx} className="px-3 py-1.5 flex items-center gap-3 text-xs">
                    <div className="whitespace-nowrap font-mono text-muted-foreground w-[78px]">
                      {formatDateBR(mov.data)}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        isDoc ? "border-warning/40 text-warning" : "border-success/40 text-success",
                      )}
                    >
                      {isDoc ? "+ documento" : "− abatimento"}
                    </Badge>
                    <div className="flex-1 min-w-0 truncate" title={mov.descricao || ""}>
                      {mov.descricao || "—"}
                    </div>
                    <div className={cn(
                      "font-mono whitespace-nowrap min-w-[100px] text-right",
                      val >= 0 ? "text-warning" : "text-success",
                    )}>
                      {val >= 0 ? "+" : "−"}{formatBRL(Math.abs(val))}
                    </div>
                    <div className="font-mono whitespace-nowrap min-w-[110px] text-right text-muted-foreground">
                      {formatBRL(acc)}
                    </div>
                  </div>
                );
              })}
              <div className="px-3 py-2 flex items-center justify-between text-xs bg-muted/40">
                <span className="font-medium">Saldo devedor</span>
                <span className={cn(
                  "font-mono font-medium",
                  saldoFinal > 0 ? "text-warning" : "text-success",
                )}>
                  {formatBRL(saldoFinal)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContasCorrentesFornecedorCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["vw-conta-corrente-fornecedor"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conta_corrente_fornecedor")
        .select("*")
        .order("saldo_devedor", { ascending: false });
      if (error) throw error;
      return (data || []) as CcFornecedor[];
    },
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Contas correntes de fornecedor</h3>
          <span className="text-xs text-muted-foreground">{data.length} fornecedor{data.length === 1 ? "" : "es"}</span>
        </div>
        <div className="divide-y">
          {data.map((r) => (
            <ContaCorrenteFornecedorRow key={(r.cnpj || r.nome || "") + ""} r={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
