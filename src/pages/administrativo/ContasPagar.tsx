import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Link } from "react-router-dom";
import { ArrowUpFromLine, FileWarning, Plus, Search, Sparkles, Upload, UserCheck, X } from "lucide-react";
import AcoesInlineConta from "@/components/financeiro/AcoesInlineConta";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import ContaPagarDetalheDrawer from "@/components/financeiro/ContaPagarDetalheDrawer";
import AcoesMassaButtons, {
  type ContaSelecionada,
} from "@/components/financeiro/AcoesMassaButtons";
import { NovaContaPagarSheet } from "@/components/financeiro/NovaContaPagarSheet";
import { getFaturaInfoMap, type FaturaInfo } from "@/lib/financeiro/get-fatura-info";
import { getCompromissoInfoMap, type CompromissoInfo } from "@/lib/financeiro/get-compromisso-info";
import { getMeioPagamentoIcon } from "@/lib/financeiro/meio-pagamento-icon";
import { useQualidadeDadoMap } from "@/hooks/useQualidadeDadoMap";
import { getQualidadeDadoIcon } from "@/lib/financeiro/qualidade-dado-icon";

import { Repeat, CheckCircle2 } from "lucide-react";
import { classFundoFuturo, classBordaTemporal } from "@/lib/financeiro/is-vencimento-futuro";
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
  is_cartao: boolean | null;
  // Campos da view consolidada
  tags: unknown;
  tem_doc_pendente: boolean | null;
  atrasada: boolean | null;
  status_efetivo: string | null;
  nf_stage_id: string | null;
  nf_tipo: string | null;
  nf_fornecedor: string | null;
  mov_conciliada: boolean | null;
  movimentacao_bancaria_id: string | null;
  nf_numero_repositorio: string | null;
  // Joins
  plano_contas?: { codigo?: string | null; nome: string } | null;
  parceiros_comerciais?: { razao_social: string | null } | null;
  formas_pagamento?: { codigo: string | null; nome: string | null } | null;
  fornecedor_cliente?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  aprovado: "Aprovado",
  aguardando_pagamento: "Aguardando pagamento",
  paga: "Paga",
  cancelado: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  aprovado: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  aguardando_pagamento: "bg-teal-100 text-teal-800 hover:bg-teal-100",
  paga: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  cancelado: "bg-red-100 text-red-800 hover:bg-red-100",
};

export default function ContasPagar() {
  const qc = useQueryClient();
  type ModoOperacional = "para_agir" | "aguardando_ofx" | "pagas_mes" | "canceladas" | "todos";
  const [modoOperacional, setModoOperacional] = useState<ModoOperacional>("para_agir");
  const [tagFilter, setTagFilter] = useState<"todas" | "doc_pendente" | "atrasada" | "qualidade_alerta">("todas");
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [contaIdSelecionada, setContaIdSelecionada] = useState<string | null>(null);
  const [editandoBanco, setEditandoBanco] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [novaContaOpen, setNovaContaOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contas-pagar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_contas_pagar_consolidado")
        .select(
          "*, plano_contas:conta_id(codigo,nome), parceiros_comerciais:parceiro_id(razao_social), formas_pagamento:forma_pagamento_id(codigo,nome)",
        )
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as Conta[];
    },
  });

  // Email enviado vem da tabela base (não está na view consolidada)
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

  // Map: conta_pagar_id -> { banco_nome, fatura_vencimento }
  // Permite mostrar sub-linha "↳ Itaú · fat dd/mm/yyyy" na coluna Meio de pagamento.
  const { data: faturaInfoMap = new Map<string, FaturaInfo>() } = useQuery({
    queryKey: ["fatura-info-map-contas-pagar", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.length > 0,
    queryFn: () => getFaturaInfoMap((data || []).map((c) => c.id)),
  });

  // Map: conta_pagar_id -> { tipo: 'recorrente'|'parcelado', titulo }
  // Permite ícone 🔁 (recorrente) ou tooltip "vem do compromisso X".
  const { data: compromissoInfoMap = new Map<string, CompromissoInfo>() } = useQuery({
    queryKey: ["compromisso-info-map-contas-pagar", (data || []).map((c) => c.id).join(",")],
    enabled: !!data && data.length > 0,
    queryFn: () => getCompromissoInfoMap((data || []).map((c) => c.id)),
  });

  // Map de qualidade do dado por conta_id (bolinha 🔴/🟡 na coluna Tags).
  const idsContas = useMemo(() => (data || []).map((c) => c.id), [data]);
  const { data: qualidadeMap } = useQualidadeDadoMap(idsContas);

  const filtered = useMemo(() => {
    let list = data || [];
    if (modoOperacional === "para_agir") {
      list = list.filter((c) => c.status === "aberto" || c.status === "aprovado");
    } else if (modoOperacional === "aguardando_ofx") {
      list = list.filter((c) => c.status === "aguardando_pagamento");
    } else if (modoOperacional === "pagas_mes") {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const inicioISO = inicioMes.toISOString().slice(0, 10);
      list = list.filter((c) => c.status === "paga" && (c.data_pagamento || "") >= inicioISO);
    } else if (modoOperacional === "canceladas") {
      list = list.filter((c) => c.status === "cancelado");
    }
    if (tagFilter === "doc_pendente") {
      list = list.filter((c) => c.tem_doc_pendente === true);
    } else if (tagFilter === "atrasada") {
      list = list.filter((c) => c.atrasada === true);
    } else if (tagFilter === "qualidade_alerta") {
      list = list.filter((c) => {
        const q = qualidadeMap?.get(c.id);
        return q && q.nivel !== "verde";
      });
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter(
        (c) =>
          c.descricao?.toLowerCase().includes(t) ||
          c.fornecedor_cliente?.toLowerCase().includes(t) ||
          c.parceiros_comerciais?.razao_social?.toLowerCase().includes(t),
      );
    }
    if (dataDe) list = list.filter((c) => (c.data_vencimento || "") >= dataDe);
    if (dataAte) list = list.filter((c) => (c.data_vencimento || "") <= dataAte);
    return list;
  }, [data, modoOperacional, tagFilter, busca, dataDe, dataAte, qualidadeMap]);

  const totals = useMemo(() => {
    let escopo = data || [];
    let modoFocado: "selecao" | "datas" | "total" = "total";

    // 1) PRIORIDADE: itens selecionados (se há)
    if (selecionadas.size > 0) {
      escopo = escopo.filter((c) => selecionadas.has(c.id));
      modoFocado = "selecao";
    }
    // 2) DATAS — só se não há seleção
    else if (dataDe || dataAte) {
      if (dataDe) escopo = escopo.filter((c) => (c.data_vencimento || "") >= dataDe);
      if (dataAte) escopo = escopo.filter((c) => (c.data_vencimento || "") <= dataAte);
      modoFocado = "datas";
    }

    // 🔥 Para agir
    const paraAgir = escopo.filter((c) => c.status === "aberto" || c.status === "aprovado");
    const paraAgirValor = paraAgir.reduce((s, c) => s + Number(c.valor || 0), 0);

    // ⚠️ Atrasados
    const atrasados = paraAgir.filter((c) => c.atrasada === true);
    const atrasadosValor = atrasados.reduce((s, c) => s + Number(c.valor || 0), 0);

    // 🩺 Saúde do dado
    const semSaude = escopo.filter((c) => {
      const q = qualidadeMap?.get(c.id);
      return q && q.nivel !== "verde" && c.status !== "cancelado";
    });
    const totalAtivas = escopo.filter((c) => c.status !== "cancelado").length;
    const percentSaudavel = totalAtivas > 0
      ? Math.round(((totalAtivas - semSaude.length) / totalAtivas) * 100)
      : 100;

    // ⏳ Aguardando pagamento
    const aguardandoPgto = escopo.filter((c) => c.status === "aguardando_pagamento");
    const aguardandoValor = aguardandoPgto.reduce((s, c) => s + Number(c.valor || 0), 0);

    const countDocPendente = escopo.filter(
      (c) => c.tem_doc_pendente === true && c.status !== "cancelado",
    ).length;
    const countSemCategoria = escopo.filter(
      (c) => !c.conta_id && c.status !== "cancelado",
    ).length;

    return {
      paraAgir: { count: paraAgir.length, valor: paraAgirValor },
      atrasados: { count: atrasados.length, valor: atrasadosValor },
      saude: { semSaude: semSaude.length, percent: percentSaudavel },
      aguardandoOfx: { count: aguardandoPgto.length, valor: aguardandoValor },
      countDocPendente,
      countSemCategoria,
      modoFocado,
      qtdSelecionadas: selecionadas.size,
    };
  }, [data, qualidadeMap, dataDe, dataAte, selecionadas]);


  // Filtros ativos
  const filtrosAtivos = [
    !!busca.trim(),
    !!dataDe,
    !!dataAte,
    tagFilter !== "todas",
    modoOperacional !== "para_agir",
  ].filter(Boolean).length;
  const temFiltroAtivo = filtrosAtivos > 0;
  function limparFiltros() {
    setBusca("");
    setDataDe("");
    setDataAte("");
    setTagFilter("todas");
    setModoOperacional("para_agir");

  }
  const filtroAtivoCls = "border-admin bg-admin/5 ring-1 ring-admin/30";

  // Seleção
  function toggleSelecionada(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTodas() {
    if (filtered.every((c) => selecionadas.has(c.id))) {
      const next = new Set(selecionadas);
      filtered.forEach((c) => next.delete(c.id));
      setSelecionadas(next);
    } else {
      const next = new Set(selecionadas);
      filtered.forEach((c) => next.add(c.id));
      setSelecionadas(next);
    }
  }
  function limparSelecao() {
    setSelecionadas(new Set());
  }
  function verSemCategoria() {
    setModoOperacional("todos");
    setBusca("");

  }
  function verPendentesDocs() {
    setTagFilter("doc_pendente");

  }

  const contasSelecionadas: ContaSelecionada[] = useMemo(() => {
    const map = new Map((data || []).map((c) => [c.id, c]));
    return Array.from(selecionadas)
      .map((id) => map.get(id))
      .filter((c): c is Conta => !!c)
      .map((c) => ({ id: c.id, status: c.status, conta_id: c.conta_id }));
  }, [data, selecionadas]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER STICKY ÚNICO — título + cards + filtros */}
      <div className="sticky top-0 z-20 bg-background px-6 pt-6 pb-3 border-b space-y-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ArrowUpFromLine className="h-6 w-6 text-admin" />
              Contas a Pagar
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Vencimentos a parceiros — abertos, pagos e atrasados.
            </p>
          </div>
          <Button
            onClick={() => setNovaContaOpen(true)}
            className="gap-2 bg-admin hover:bg-admin-accent text-admin-foreground"
          >
            <Plus className="h-4 w-4" />
            Nova Despesa
          </Button>
        </div>
      {totals.modoFocado === "selecao" && (
        <div className="flex items-center justify-between text-xs px-1 -mb-1">
          <div className="text-emerald-700 font-medium">
            📌 Cards refletem {totals.qtdSelecionadas}{" "}
            {totals.qtdSelecionadas === 1 ? "conta selecionada" : "contas selecionadas"}
          </div>
          <button
            type="button"
            onClick={() => setSelecionadas(new Set())}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Limpar seleção
          </button>
        </div>
      )}
      {totals.modoFocado === "datas" && (
        <div className="text-xs px-1 -mb-1 text-blue-700 font-medium">
          📅 Cards refletem o período filtrado
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 🔥 Para agir (default) */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            totals.modoFocado === "selecao" && "bg-emerald-50 border-emerald-200",
            modoOperacional === "para_agir" && tagFilter === "todas" && totals.modoFocado !== "selecao" && "bg-blue-50 border-blue-300"
          )}
          onClick={() => { setModoOperacional("para_agir"); setTagFilter("todas"); }}
        >
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1">
              🔥 Para agir
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className="text-lg font-bold text-blue-700">{formatBRL(totals.paraAgir.valor)}</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.paraAgir.count} {totals.paraAgir.count === 1 ? "conta" : "contas"}
            </div>
          </CardContent>
        </Card>

        {/* ⚠️ Atrasados */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            totals.modoFocado === "selecao" && "bg-emerald-50 border-emerald-200",
            modoOperacional === "para_agir" && tagFilter === "atrasada" && totals.modoFocado !== "selecao" && "bg-red-50 border-red-300"
          )}
          onClick={() => { setModoOperacional("para_agir"); setTagFilter("atrasada"); }}
        >
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1">
              ⚠️ Atrasados
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className="text-lg font-bold text-red-700">{formatBRL(totals.atrasados.valor)}</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.atrasados.count} {totals.atrasados.count === 1 ? "conta" : "contas"}
            </div>
          </CardContent>
        </Card>

        {/* 🩺 Saúde do dado */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            totals.modoFocado === "selecao" && "bg-emerald-50 border-emerald-200",
            tagFilter === "qualidade_alerta" && totals.modoFocado !== "selecao" && "bg-amber-50 border-amber-300"
          )}
          onClick={() => { setModoOperacional("para_agir"); setTagFilter("qualidade_alerta"); }}
        >
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1">
              🩺 Saúde do dado
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className="text-lg font-bold text-amber-700">{totals.saude.percent}%</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.saude.semSaude} {totals.saude.semSaude === 1 ? "conta com alerta" : "contas com alerta"}
            </div>
          </CardContent>
        </Card>

        {/* ⏳ Aguardando Pagamento */}
        <Card
          className={cn(
            "cursor-pointer transition-all hover:shadow-md",
            totals.modoFocado === "selecao" && "bg-emerald-50 border-emerald-200",
            modoOperacional === "aguardando_ofx" && totals.modoFocado !== "selecao" && "bg-teal-50 border-teal-300"
          )}
          onClick={() => { setModoOperacional("aguardando_ofx"); setTagFilter("todas"); }}
        >
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground flex items-center gap-1">
              ⏳ Aguardando Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className="text-lg font-bold text-teal-700">{formatBRL(totals.aguardandoOfx.valor)}</div>
            <div className="text-[10px] text-muted-foreground">
              {totals.aguardandoOfx.count} {totals.aguardandoOfx.count === 1 ? "conta" : "contas"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Banner Doc Pendente
          OCULTO 29/04/2026 — info migrará pra outro lugar (ainda não decidido).
          Mantida no código pra reativar facilmente trocando false por totals... */}
      {false && totals.countDocPendente > 0 && (
        <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-[260px]">
            <Sparkles className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {totals.countDocPendente} {totals.countDocPendente === 1 ? "conta com documentação pendente" : "contas com documentação pendente"}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Pagamento foi enviado ao financeiro mas falta NF/Recibo do fornecedor. Reenvie e-mail cobrando ou finalize manualmente.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-800 hover:bg-amber-100"
            onClick={() => { setTagFilter("doc_pendente"); }}
          >
            Ver pendentes
          </Button>
        </div>
      )}

      {/* Alerta: sem categoria
          OCULTO 29/04/2026 — info migrará pra outro lugar (ainda não decidido).
          Mantida no código pra reativar facilmente trocando false por totals... */}
      {false && totals.countSemCategoria > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 text-sm">
              <FileWarning className="h-4 w-4" />
              {totals.countSemCategoria} sem categoria
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-amber-700 border-amber-300"
              onClick={verSemCategoria}
            >
              Ver
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição ou parceiro..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);

                }}
                className={`pl-9 ${busca ? filtroAtivoCls : ""}`}
              />
            </div>
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => {
                setDataDe(e.target.value);

              }}
              className={`w-full lg:w-44 ${dataDe ? filtroAtivoCls : ""}`}
            />
            <Input
              type="date"
              value={dataAte}
              onChange={(e) => {
                setDataAte(e.target.value);

              }}
              className={`w-full lg:w-44 ${dataAte ? filtroAtivoCls : ""}`}
            />
            <Select
              value={tagFilter}
              onValueChange={(v) => {
                setTagFilter(v as "todas" | "doc_pendente" | "atrasada" | "qualidade_alerta");

              }}
            >
              <SelectTrigger
                className={`w-full lg:w-44 ${tagFilter !== "todas" ? filtroAtivoCls : ""}`}
              >
                <SelectValue placeholder="Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as tags</SelectItem>
                <SelectItem value="doc_pendente">Com doc pendente</SelectItem>
                <SelectItem value="atrasada">Atrasadas</SelectItem>
                <SelectItem value="qualidade_alerta">Alerta de qualidade</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "pagas_mes", label: "✅ Pagas (mês)" },
                { value: "canceladas", label: "❌ Canceladas" },
                { value: "todos", label: "🔍 Todos" },
              ].map((modo) => (
                <Button
                  key={modo.value}
                  size="sm"
                  variant={modoOperacional === modo.value ? "default" : "outline"}
                  onClick={() => { setModoOperacional(modo.value as ModoOperacional); }}
                  className={cn(
                    modoOperacional === modo.value && "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  {modo.label}
                </Button>
              ))}
            </div>
          </div>
          {temFiltroAtivo && (
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="outline" className="text-[10px] text-admin border-admin">
                {filtrosAtivos} filtro{filtrosAtivos > 1 ? "s" : ""} ativo{filtrosAtivos > 1 ? "s" : ""}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="text-admin hover:text-admin/80 gap-1 text-xs h-7"
                onClick={limparFiltros}
              >
                <X className="h-3 w-3" /> Limpar filtros
              </Button>
            </div>
          )}
        </CardHeader>
      </Card>
      </div>
      {/* /HEADER STICKY */}

      {/* CONTEÚDO COM SCROLL PRÓPRIO */}
      <div className="flex-1 overflow-auto px-6 pb-6 pt-4 space-y-6">
      <Card>
        <CardContent className="pt-6">
          {/* Barra de ações em massa */}
          {selecionadas.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50 mb-4 flex-wrap">
              <span className="text-sm font-medium">
                {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}
              </span>
              <div className="flex-1" />
              <AcoesMassaButtons
                contas={contasSelecionadas}
                onDone={() => {
                  setSelecionadas(new Set());
                  qc.invalidateQueries({ queryKey: ["contas-pagar"] });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={limparSelecao}
              >
                Limpar
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (data || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-admin-muted">
                <Upload className="h-8 w-8 text-admin" />
              </div>
              <p className="text-lg font-semibold">Sem contas a pagar importadas</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Sincronize com o Bling ou importe NFs (Qive, XML, PDF) para começar.
              </p>
              <Button asChild className="bg-admin hover:bg-admin-accent text-admin-foreground">
                <Link to="/administrativo/importar">
                  <Upload className="h-4 w-4 mr-2" />
                  Ir para importação
                </Link>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado para os filtros aplicados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-6 px-6">
                <div className="border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background border-b shadow-sm">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              filtered.length > 0 && filtered.every((c) => selecionadas.has(c.id))
                            }
                            onCheckedChange={toggleTodas}
                            aria-label="Selecionar todos"
                          />
                        </TableHead>
                        <TableHead>Parceiro</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Meio de pagamento</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => {
                        const isSel = selecionadas.has(c.id);
                        const compromissoInfo = compromissoInfoMap.get(c.id);
                        return (
                          <TableRow
                            key={c.id}
                            className={cn(
                              "cursor-pointer hover:bg-muted/50 transition-colors",
                              classBordaTemporal(c.data_vencimento, c.atrasada, c.status),
                              !c.atrasada && classFundoFuturo(c.data_vencimento),
                              isSel && "bg-muted/40",
                            )}
                            onClick={() => setContaIdSelecionada(c.id)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSel}
                                onCheckedChange={() => toggleSelecionada(c.id)}
                                aria-label="Selecionar conta"
                              />
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <div className="truncate" title={c.parceiros_comerciais?.razao_social || c.fornecedor_cliente || ""}>
                                {c.parceiros_comerciais?.razao_social ||
                                  c.fornecedor_cliente ||
                                  "—"}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs" title={c.descricao}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate">{c.descricao}</span>
                                {compromissoInfo?.tipo === "recorrente" && (
                                  <span
                                    className="shrink-0"
                                    title={`Recorrente — ${compromissoInfo.titulo}`}
                                  >
                                    <Repeat className="h-3.5 w-3.5 text-indigo-600" />
                                  </span>
                                )}
                                {c.mov_conciliada && (
                                  <span
                                    className="shrink-0"
                                    title="Conciliada — bateu com extrato bancário"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  </span>
                                )}
                                {c.origem === "nf_pj_interno" && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 text-[10px] py-0 px-1.5 shrink-0"
                                  >
                                    <UserCheck className="h-2.5 w-2.5" /> NF PJ
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatDateBR(c.data_vencimento)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {(() => {
                                const meioPagamento = c.formas_pagamento?.nome ?? null;
                                const faturaInfo = faturaInfoMap.get(c.id);
                                if (!meioPagamento) {
                                  return <span className="text-[10px] italic">—</span>;
                                }
                                const ico = getMeioPagamentoIcon(meioPagamento);
                                return (
                                  <div className="flex flex-col">
                                    {ico ? (
                                      <span
                                        className="flex items-center gap-1.5 whitespace-nowrap"
                                        title={meioPagamento}
                                      >
                                        <ico.Icon className={`h-4 w-4 ${ico.cor} shrink-0`} />
                                        <span className="text-xs">{meioPagamento}</span>
                                      </span>
                                    ) : (
                                      <span className="whitespace-nowrap">{meioPagamento}</span>
                                    )}
                                    {(faturaInfo?.banco_nome || faturaInfo?.fatura_vencimento) && (
                                      <span className="text-[10px] text-muted-foreground/70 ml-5 whitespace-nowrap">
                                        ↳{" "}
                                        {faturaInfo.banco_nome}
                                        {faturaInfo.banco_nome && faturaInfo.fatura_vencimento && " · "}
                                        {faturaInfo.fatura_vencimento &&
                                          `fat ${formatDateBR(faturaInfo.fatura_vencimento)}`}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {c.plano_contas?.nome ? (
                                c.plano_contas.nome
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] border-amber-400 text-amber-700"
                                >
                                  Sem categoria
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono whitespace-nowrap">
                              {formatBRL(c.valor)}
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_STYLES[c.status] || "bg-muted"}>
                                {STATUS_LABELS[c.status] || c.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-[140px]" onClick={(e) => e.stopPropagation()}>
                              <AcoesInlineConta
                                conta={{ ...c, email_pagamento_enviado: emailMap.get(c.id) || false }}
                                onAbrirEditandoBanco={(id) => {
                                  setEditandoBanco(true);
                                  setContaIdSelecionada(id);
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-sm text-muted-foreground">
                  {filtered.length} registro{filtered.length === 1 ? "" : "s"}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ContaPagarDetalheDrawer
        contaId={contaIdSelecionada}
        onClose={() => {
          setContaIdSelecionada(null);
          setEditandoBanco(false);
        }}
        iniciarEditando={editandoBanco}
        highlightCampo={editandoBanco ? "pago_em_conta_id" : null}
      />

      <NovaContaPagarSheet
        open={novaContaOpen}
        onOpenChange={setNovaContaOpen}
      />
      </div>
    </div>
  );
}
