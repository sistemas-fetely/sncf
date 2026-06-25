import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownToLine, Inbox, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";


type RecebivelB2B = {
  id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  cliente: string | null;
  meio_pagamento: string | null;
  banco_nome: string | null;
  nf_numero: string | null;
  data_compra: string | null;
  data_vencimento: string | null;
  valor: number | null;
  status_gestao: "pago" | "atrasado" | "em_aberto";
  data_liquidacao: string | null;
  liquidacao_confirmada_banco: boolean | null;
};


const PAGE_SIZE = 25;

type CardKey = "totalReceber" | "vencido" | "vence7" | "recebidoMes" | "liquidar30";

const capitalize = (s: string) =>
  s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

const formatMeio = (m: string | null) => (m ? capitalize(m.replace(/_/g, " ")) : "—");

export default function ContasReceber() {
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroBanco, setFiltroBanco] = useState<string>("todos");
  const [filtroMeio, setFiltroMeio] = useState<string>("todos");
  const [emissaoDe, setEmissaoDe] = useState("");
  const [emissaoAte, setEmissaoAte] = useState("");
  const [cardsAtivos, setCardsAtivos] = useState<Set<CardKey>>(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recebivel-b2b"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_recebivel_b2b")
        .select("*")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecebivelB2B[];
    },
  });

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const em7 = useMemo(() => new Date(hoje.getTime() + 7 * 86400000), [hoje]);
  const em30 = useMemo(() => new Date(hoje.getTime() + 30 * 86400000), [hoje]);
  const inicioMes = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1), [hoje]);
  const fimMes = useMemo(() => new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59), [hoje]);

  const predicados: Record<CardKey, (t: RecebivelB2B) => boolean> = useMemo(
    () => ({
      totalReceber: (t) => t.liquidacao_confirmada_banco === false,
      vencido: (t) => t.status_gestao === "atrasado",
      vence7: (t) => {
        if (t.status_gestao !== "em_aberto" || !t.data_vencimento) return false;
        const v = new Date(t.data_vencimento);
        return v >= hoje && v <= em7;
      },
      recebidoMes: (t) => {
        if (!t.liquidacao_confirmada_banco || !t.data_liquidacao) return false;
        const d = new Date(t.data_liquidacao);
        return d >= inicioMes && d <= fimMes;
      },
      liquidar30: (t) => {
        const ref = t.data_liquidacao ?? t.data_vencimento;
        if (t.status_gestao !== "em_aberto" || !ref) return false;
        const v = new Date(ref);
        return v >= hoje && v <= em30;
      },
    }),
    [hoje, em7, em30, inicioMes, fimMes]
  );

  const kpis = useMemo(() => {
    const titulos = data ?? [];
    let totalReceber = 0;
    let vencido = 0;
    let vence7 = 0;
    let recebidoMes = 0;
    let liquidar30 = 0;
    for (const t of titulos) {
      const v = t.valor ?? 0;
      if (predicados.totalReceber(t)) totalReceber += v;
      if (predicados.vencido(t)) vencido += v;
      if (predicados.vence7(t)) vence7 += v;
      if (predicados.recebidoMes(t)) recebidoMes += v;
      if (predicados.liquidar30(t)) liquidar30 += v;
    }
    const inadimplencia = totalReceber > 0 ? (vencido / totalReceber) * 100 : 0;
    return { totalReceber, vencido, vence7, recebidoMes, liquidar30, inadimplencia };
  }, [data, predicados]);

  const aging = useMemo(() => {
    const titulos = data ?? [];
    const faixas = { a_vencer: 0, f1_7: 0, f8_30: 0, f31_60: 0, f60: 0 };
    for (const t of titulos) {
      if (t.status_gestao !== "em_aberto" && t.status_gestao !== "atrasado") continue;
      if (!t.data_vencimento) continue;
      const venc = new Date(t.data_vencimento);
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
      const valor = t.valor ?? 0;
      if (dias <= 0) faixas.a_vencer += valor;
      else if (dias <= 7) faixas.f1_7 += valor;
      else if (dias <= 30) faixas.f8_30 += valor;
      else if (dias <= 60) faixas.f31_60 += valor;
      else faixas.f60 += valor;
    }
    return faixas;
  }, [data, hoje]);

  const bancosOpcoes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => t.banco_nome && set.add(t.banco_nome));
    return Array.from(set).sort();
  }, [data]);

  const meiosOpcoes = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((t) => t.meio_pagamento && set.add(t.meio_pagamento));
    return Array.from(set).sort();
  }, [data]);

  const filtrados = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe) : null;
    const dAte = dataAte ? new Date(dataAte) : null;
    const eDe = emissaoDe ? new Date(emissaoDe) : null;
    const eAte = emissaoAte ? new Date(emissaoAte) : null;

    let arr = titulos.filter((t) => {
      for (const k of cardsAtivos) {
        if (!predicados[k](t)) return false;
      }
      if (filtroBanco !== "todos" && t.banco_nome !== filtroBanco) return false;
      if (filtroMeio !== "todos" && t.meio_pagamento !== filtroMeio) return false;

      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.cliente ?? "").toLowerCase();
        if (!num.includes(buscaLc) && !cli.includes(buscaLc)) return false;
      }

      if (dDe || dAte) {
        if (!t.data_vencimento) return false;
        const venc = new Date(t.data_vencimento);
        if (dDe && venc < dDe) return false;
        if (dAte && venc > dAte) return false;
      }

      if (emissaoDe || emissaoAte) {
        if (!t.data_compra) return false;
        const emi = new Date(t.data_compra);
        if (eDe && emi < eDe) return false;
        if (eAte && emi > eAte) return false;
      }
      return true;
    });

    if (sort) {
      arr = [...arr].sort((a, b) => {
        const va = (a as any)[sort.key] ?? "";
        const vb = (b as any)[sort.key] ?? "";
        if (typeof va === "string" && typeof vb === "string") {
          return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (typeof va === "number" && typeof vb === "number") {
          return sort.dir === "asc" ? va - vb : vb - va;
        }
        return sort.dir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
    }

    return arr;
  }, [data, cardsAtivos, predicados, filtroBanco, filtroMeio, busca, dataDe, dataAte, emissaoDe, emissaoAte, sort]);

  const breakdownMeio = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe) : null;
    const dAte = dataAte ? new Date(dataAte) : null;
    const eDe = emissaoDe ? new Date(emissaoDe) : null;
    const eAte = emissaoAte ? new Date(emissaoAte) : null;

    const mapa = new Map<string, number>();
    for (const t of titulos) {
      // só a receber
      if (t.liquidacao_confirmada_banco !== false) continue;
      // toggles de KPI
      let ok = true;
      for (const k of cardsAtivos) {
        if (!predicados[k](t)) { ok = false; break; }
      }
      if (!ok) continue;
      // banco (mas NÃO meio)
      if (filtroBanco !== "todos" && t.banco_nome !== filtroBanco) continue;
      // busca
      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.cliente ?? "").toLowerCase();
        if (!num.includes(buscaLc) && !cli.includes(buscaLc)) continue;
      }
      // vencimento
      if (dDe || dAte) {
        if (!t.data_vencimento) continue;
        const venc = new Date(t.data_vencimento);
        if (dDe && venc < dDe) continue;
        if (dAte && venc > dAte) continue;
      }
      // emissão
      if (eDe || eAte) {
        if (!t.data_compra) continue;
        const emi = new Date(t.data_compra);
        if (eDe && emi < eDe) continue;
        if (eAte && emi > eAte) continue;
      }
      const meio = t.meio_pagamento ?? "—";
      mapa.set(meio, (mapa.get(meio) ?? 0) + (t.valor ?? 0));
    }
    const itens = Array.from(mapa.entries())
      .map(([meio, total]) => ({ meio, total }))
      .sort((a, b) => b.total - a.total);
    const totalGeral = itens.reduce((s, i) => s + i.total, 0);
    return { itens, totalGeral };
  }, [data, busca, dataDe, dataAte, emissaoDe, emissaoAte, filtroBanco, cardsAtivos, predicados]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleCard = (k: CardKey) => {
    setCardsAtivos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(1);
  };

  const renderStatusBadge = (s: RecebivelB2B["status_gestao"]) => {
    if (s === "pago") return <Badge className="bg-green-100 text-green-800 border-0">Pago</Badge>;
    if (s === "atrasado")
      return <Badge className="bg-red-100 text-red-800 border-0">Atrasado</Badge>;
    return <Badge className="bg-blue-100 text-blue-800 border-0">Em aberto</Badge>;
  };

  const kpiCard = (
    key: CardKey,
    label: string,
    value: string,
    colorClass: string,
    ringClass: string
  ) => {
    const active = cardsAtivos.has(key);
    return (
      <Card
        onClick={() => toggleCard(key)}
        className={cn(
          "cursor-pointer transition-all hover:shadow-md",
          active && `ring-2 ${ringClass}`
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className={cn("text-sm", colorClass)}>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-semibold", colorClass)}>{value}</div>
        </CardContent>
      </Card>
    );
  };

  const handleExportXLSX = () => {
    const linhas = filtrados.map((t) => ({
      "NF": t.nf_numero ?? "",
      "Cliente": t.cliente ?? "",
      "Título / Parcela":
        (t.numero_titulo ?? "") +
        (t.numero_parcela != null && t.total_parcelas != null
          ? ` ${t.numero_parcela}/${t.total_parcelas}`
          : ""),
      "Banco": t.banco_nome ?? "",
      "Meio": formatMeio(t.meio_pagamento),
      "Data compra": formatDateBR(t.data_compra),
      "Vencimento": formatDateBR(t.data_vencimento),
      "Liquidação": formatDateBR(t.data_liquidacao),
      "Valor": t.valor ?? 0,
      "Status":
        t.status_gestao === "pago"
          ? "Pago"
          : t.status_gestao === "atrasado"
          ? "Atrasado"
          : "Em aberto",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Receber");
    XLSX.writeFile(wb, `contas-a-receber-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ArrowDownToLine className="h-7 w-7 text-admin" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Contas a Receber</h1>
          <p className="text-sm text-muted-foreground">
            Recebíveis B2B por parcela — somente títulos com NF. Visão de gestão (somente leitura).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportXLSX}
          disabled={filtrados.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar XLSX
        </Button>
      </div>


      {/* KPIs */}
      <div className="space-y-4">
        {/* Linha 1 — Fluxo de caixa */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiCard("recebidoMes", "Recebido no mês", formatBRL(kpis.recebidoMes), "text-green-700", "ring-green-500")}
          {kpiCard("totalReceber", "Total a receber", formatBRL(kpis.totalReceber), "text-blue-700", "ring-blue-500")}
          {kpiCard("vence7", "Vence em 7 dias", formatBRL(kpis.vence7), "text-amber-600", "ring-amber-500")}
          {kpiCard("liquidar30", "A liquidar em 30 dias", formatBRL(kpis.liquidar30), "text-cyan-700", "ring-cyan-500")}
        </div>

        {/* Linha 2 — Saúde da carteira + Aging */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {kpiCard("vencido", "Vencido", formatBRL(kpis.vencido), "text-red-700", "ring-red-500")}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-rose-700">Inadimplência</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-rose-700">{kpis.inadimplencia.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-600">1–7 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-amber-600">{formatBRL(aging.f1_7)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-600">8–30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-orange-600">{formatBRL(aging.f8_30)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600">31–60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-red-600">{formatBRL(aging.f31_60)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-800">+60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-red-800">{formatBRL(aging.f60)}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Breakdown por meio */}
      {breakdownMeio.itens.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {breakdownMeio.itens.map((i) => (
            <Card key={i.meio} className="flex-1 min-w-[160px]">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  A receber — {formatMeio(i.meio)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{formatBRL(i.total)}</div>
              </CardContent>
            </Card>
          ))}
          <Card className="flex-1 min-w-[160px] border-blue-200">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-blue-700">A receber — Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold text-blue-700">
                {formatBRL(breakdownMeio.totalGeral)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-7">
          <div className="space-y-1">
            <Label className="text-xs">Busca</Label>
            <Input
              placeholder="Título ou cliente"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Banco</Label>
            <Select
              value={filtroBanco}
              onValueChange={(v) => {
                setFiltroBanco(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {bancosOpcoes.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Meio de pagamento</Label>
            <Select
              value={filtroMeio}
              onValueChange={(v) => {
                setFiltroMeio(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {meiosOpcoes.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMeio(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento de</Label>
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => {
                setDataDe(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento até</Label>
            <Input
              type="date"
              value={dataAte}
              onChange={(e) => {
                setDataAte(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Emissão de</Label>
            <Input
              type="date"
              value={emissaoDe}
              onChange={(e) => {
                setEmissaoDe(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Emissão até</Label>
            <Input
              type="date"
              value={emissaoAte}
              onChange={(e) => {
                setEmissaoAte(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Breakdown por meio */}
      {breakdownMeio.itens.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {breakdownMeio.itens.map((i) => (
            <Card key={i.meio} className="flex-1 min-w-[160px]">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  A receber — {formatMeio(i.meio)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{formatBRL(i.total)}</div>
              </CardContent>
            </Card>
          ))}
          <Card className="flex-1 min-w-[160px] border-blue-200">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-blue-700">A receber — Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold text-blue-700">
                {formatBRL(breakdownMeio.totalGeral)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paginados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p>Nenhum recebível encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortTh label="NF" sortKey="nf_numero" sort={sort} setSort={setSort} />
                  <SortTh label="Cliente" sortKey="cliente" sort={sort} setSort={setSort} />
                  <SortTh label="Título / Parcela" sortKey="numero_titulo" sort={sort} setSort={setSort} />
                  <SortTh label="Banco" sortKey="banco_nome" sort={sort} setSort={setSort} />
                  <SortTh label="Meio" sortKey="meio_pagamento" sort={sort} setSort={setSort} />
                  <SortTh label="Data compra" sortKey="data_compra" sort={sort} setSort={setSort} />
                  <SortTh label="Vencimento" sortKey="data_vencimento" sort={sort} setSort={setSort} />
                  <SortTh label="Liquidação" sortKey="data_liquidacao" sort={sort} setSort={setSort} />
                  <SortTh label="Valor" sortKey="valor" sort={sort} setSort={setSort} align="right" />
                  <SortTh label="Status" sortKey="status_gestao" sort={sort} setSort={setSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginados.map((t) => {
                  const atrasado = t.status_gestao === "atrasado";
                  return (
                    <TableRow key={t.id} className={atrasado ? "bg-red-50/40" : undefined}>
                      <TableCell className="font-mono text-xs">{t.nf_numero ?? "—"}</TableCell>
                      <TableCell className="max-w-[180px] truncate" title={t.cliente ?? ""}>
                        {t.cliente ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono">{t.numero_titulo ?? "—"}</span>
                        {t.numero_parcela != null && t.total_parcelas != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            {t.numero_parcela}/{t.total_parcelas}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{t.banco_nome ?? "—"}</TableCell>
                      <TableCell>{formatMeio(t.meio_pagamento)}</TableCell>
                      <TableCell>{formatDateBR(t.data_compra)}</TableCell>
                      <TableCell>{formatDateBR(t.data_vencimento)}</TableCell>
                      <TableCell>
                        {t.data_liquidacao ? (
                          t.liquidacao_confirmada_banco === true ? (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Badge className="bg-green-100 text-green-700 border-0">REAL</Badge>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-amber-100 text-amber-700 border-0 cursor-help">PREVISTO</Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Previsão de liquidação pelo adquirente</p>
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatBRL(t.valor ?? 0)}</TableCell>
                      <TableCell>{renderStatusBadge(t.status_gestao)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Página {pageSafe} de {totalPages} · {filtrados.length} registros
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  sort,
  setSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: "asc" | "desc" } | null;
  setSort: React.Dispatch<React.SetStateAction<{ key: string; dir: "asc" | "desc" } | null>>;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : ""
      }`}
      onClick={() =>
        setSort((prev) =>
          prev?.key === sortKey
            ? { key: sortKey, dir: prev.dir === "asc" ? "desc" : "asc" }
            : { key: sortKey, dir: "desc" }
        )
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </span>
    </TableHead>
  );
}
