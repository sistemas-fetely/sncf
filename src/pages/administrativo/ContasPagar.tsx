import { useMemo, useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowUpFromLine,
  Plus,
  Upload,
  Flame,
  AlertTriangle,
  Clock,
  AlertCircle,
  
  FileWarning,
  PackageOpen,
  X,
} from "lucide-react";
import AcoesInlineConta from "@/components/financeiro/AcoesInlineConta";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import { NovaContaPagarSheet } from "@/components/financeiro/NovaContaPagarSheet";
import { ImportarNFDespesaDialog } from "@/components/financeiro/ImportarNFDespesaDialog";
import { getMeioPagamentoIcon } from "@/lib/financeiro/meio-pagamento-icon";
import { cn } from "@/lib/utils";

type Conta = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  parceiro_id: string | null;
  conta_id: string | null;
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
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  aprovado: "Aprovado",
  enviado_para_pagamento: "Enviado para Pagamento",
  realizada: "Realizada",
  cancelado: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  aprovado: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  enviado_para_pagamento: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  realizada: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  cancelado: "bg-red-100 text-red-800 hover:bg-red-100",
};

const diasAteVencer = (d: string | null) => {
  if (!d) return 999;
  return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86400000);
};

type KpiFilter = "para_agir" | "atrasadas" | "aguardando" | "pendencia" | null;

export default function ContasPagar() {
  const qc = useQueryClient();

  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
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
          "*, plano_contas:conta_id(codigo,nome), parceiros_comerciais:parceiro_id(razao_social), formas_pagamento:forma_pagamento_id(codigo,nome,cobra_email,pula_aprovacao), meios_pagamento:meio_pagamento_id(codigo)",
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

  type SortColumn = "parceiro" | "descricao" | "vencimento" | "meio_pagamento" | "categoria" | "valor" | "status";
  const [sort, setSort] = useState<SortState<SortColumn> | null>({ column: "vencimento", direction: "asc" });

  const kpis = useMemo(() => {
    const lista = data || [];
    const para_agir = lista.filter(
      (c) => ["aberto", "aprovado"].includes(c.status) && diasAteVencer(c.data_vencimento) <= 7,
    );
    const atrasadas = lista.filter(
      (c) => c.atrasada && !["enviado_para_pagamento", "realizada", "cancelado"].includes(c.status),
    );
    const aguardando = lista.filter((c) => c.status === "enviado_para_pagamento");
    const pendencia = lista.filter(
      (c) => pendenciaMap.has(c.id) || temPendenciaNF(c.id),
    );
    const sumValor = (arr: Conta[]) => arr.reduce((s, c) => s + Number(c.valor || 0), 0);
    return {
      para_agir: { count: para_agir.length, valor: sumValor(para_agir) },
      atrasadas: { count: atrasadas.length, valor: sumValor(atrasadas) },
      aguardando: { count: aguardando.length, valor: sumValor(aguardando) },
      pendencia: { count: pendencia.length, valor: sumValor(pendencia) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pendenciaMap, nfStatusMap]);

  const filtrados = useMemo(() => {
    let lista = data || [];
    if (kpiFilter === "para_agir") {
      lista = lista.filter(
        (c) => ["aberto", "aprovado"].includes(c.status) && diasAteVencer(c.data_vencimento) <= 7,
      );
    } else if (kpiFilter === "atrasadas") {
      lista = lista.filter(
        (c) => c.atrasada && !["enviado_para_pagamento", "realizada", "cancelado"].includes(c.status),
      );
    } else if (kpiFilter === "aguardando") {
      lista = lista.filter((c) => c.status === "enviado_para_pagamento");
    } else if (kpiFilter === "pendencia") {
      lista = lista.filter((c) => pendenciaMap.has(c.id) || temPendenciaNF(c.id));
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
    if (statusFilter === "pendencia_nf") {
      lista = lista.filter((c) => temPendenciaNF(c.id));
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
      vencimento: (c) => c.data_vencimento || "",
      meio_pagamento: (c) => c.formas_pagamento?.nome || "",
      categoria: (c) => c.plano_contas?.nome || "",
      valor: (c) => Number(c.valor) || 0,
      status: (c) => c.status || "",
    });

    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kpiFilter, busca, statusFilter, solicitanteFilter, dataDe, dataAte, pendenciaMap, solicitanteMap, nfStatusMap, sort]);

  const temFiltroAtivo =
    !!busca.trim() ||
    !!dataDe ||
    !!dataAte ||
    statusFilter !== "todos" ||
    solicitanteFilter !== "todos" ||
    kpiFilter !== null;

  function limparFiltros() {
    setBusca("");
    setDataDe("");
    setDataAte("");
    setStatusFilter("todos");
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
    <div className="p-6 space-y-6">
      {/* Header sticky */}
      <div className="sticky top-0 z-20 bg-background -mx-6 -mt-6 px-6 pt-6 pb-4 border-b space-y-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#1A4A3A" }}
            >
              <ArrowUpFromLine className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Contas a Pagar</h1>
              <p className="text-sm text-muted-foreground">
                Vencimentos a parceiros — abertos, pagos e atrasados.
              </p>
            </div>
          </div>
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
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={Flame}
            label="Para agir"
            count={kpis.para_agir.count}
            valor={kpis.para_agir.valor}
            color="text-orange-600"
            border="border-orange-300"
            active={kpiFilter === "para_agir"}
            onClick={() => setKpiFilter(kpiFilter === "para_agir" ? null : "para_agir")}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Atrasadas"
            count={kpis.atrasadas.count}
            valor={kpis.atrasadas.valor}
            color="text-red-600"
            border="border-red-300"
            active={kpiFilter === "atrasadas"}
            onClick={() => setKpiFilter(kpiFilter === "atrasadas" ? null : "atrasadas")}
          />
          <KpiCard
            icon={Clock}
            label="Enviado para Pagamento"
            count={kpis.aguardando.count}
            valor={kpis.aguardando.valor}
            color="text-teal-600"
            border="border-teal-300"
            active={kpiFilter === "aguardando"}
            onClick={() => setKpiFilter(kpiFilter === "aguardando" ? null : "aguardando")}
          />
          <KpiCard
            icon={AlertCircle}
            label="Pendência de dados"
            count={kpis.pendencia.count}
            valor={kpis.pendencia.valor}
            color="text-amber-600"
            border="border-amber-300"
            active={kpiFilter === "pendencia"}
            onClick={() => setKpiFilter(kpiFilter === "pendencia" ? null : "pendencia")}
          />
        </div>
      </div>

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
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="enviado_para_pagamento">Enviado para Pagamento</SelectItem>
            <SelectItem value="realizada">Realizada</SelectItem>
            <SelectItem value="cancelado">Cancelada</SelectItem>
            <SelectItem value="pendencia_nf">Pendência NF</SelectItem>
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
              <h3 className="font-semibold mb-1">Nenhuma conta encontrada</h3>
              <p className="text-sm text-muted-foreground">
                {temFiltroAtivo
                  ? "Tente ajustar os filtros."
                  : "Importe NFs ou crie uma nova despesa pra começar."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="parceiro" sort={sort} onSort={setSort}>
                    Parceiro
                  </SortableTableHead>
                  <SortableTableHead column="descricao" sort={sort} onSort={setSort}>
                    Descrição
                  </SortableTableHead>
                  <SortableTableHead column="vencimento" sort={sort} onSort={setSort}>
                    Vencimento
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
                      <TableCell
                        className={cn(
                          "whitespace-nowrap",
                          atrasada && "text-red-600 font-medium",
                        )}
                      >
                        {formatDateBR(c.data_vencimento)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {meio ? (
                          <div className="flex flex-col gap-0.5">
                            {ico ? (
                              <span className="flex items-center gap-1.5" title={meio}>
                                <ico.Icon className={cn("h-4 w-4 shrink-0", ico.cor)} />
                                <span>{meio}</span>
                              </span>
                            ) : (
                              <span>{meio}</span>
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
                            className="text-[9px] border-amber-400 text-amber-700"
                          >
                            Sem categoria
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono whitespace-nowrap">
                        {formatBRL(c.valor)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          <Badge className={STATUS_STYLES[c.status] || "bg-muted"}>
                            {STATUS_LABELS[c.status] || c.status}
                          </Badge>
                          {pend?.com_pendencia && (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-300 gap-1"
                              title={
                                pend.pendencias?.length
                                  ? `Pendências: ${pend.pendencias.join(", ")}`
                                  : "Pagamento marcado com pendência"
                              }
                            >
                              <FileWarning className="h-3 w-3" />
                              Pendência
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="min-w-[140px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AcoesInlineConta
                          conta={{
                            ...c,
                            email_pagamento_enviado: emailMap.get(c.id) || false,
                          }}
                          onAbrirEditandoBanco={(id) => setContaIdSelecionada(id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
    </div>
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
          <div className="text-2xl font-bold leading-tight">{count}</div>
          <div className="text-xs text-muted-foreground font-mono">{formatBRL(valor)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
