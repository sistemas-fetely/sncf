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
import * as XLSX from "xlsx";

type StatusGestao = "pago" | "atrasado" | "em_aberto" | "cancelado";

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
  status_gestao: StatusGestao;
  data_liquidacao: string | null;
  liquidacao_realizada: boolean | null;
  pago: boolean | null;
  liquidado: boolean | null;
  conciliado: boolean | null;
  liquidacao_confirmada_banco: boolean | null;
};

const PAGE_SIZE = 25;

type DataBase = "vencimento" | "emissao" | "liquidacao";

const SITUACOES: { key: StatusGestao; label: string }[] = [
  { key: "pago", label: "Recebido" },
  { key: "em_aberto", label: "Em aberto" },
  { key: "atrasado", label: "Atrasado" },
  { key: "cancelado", label: "Cancelado" },
];

const SEM_CAIXA = ["haver", "bonificacao", "devolucao", "sem_pagamento"];

const capitalize = (s: string) =>
  s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

const formatMeio = (m: string | null) => (m ? capitalize(m.replace(/_/g, " ")) : "—");

const rotuloStatus = (s: StatusGestao) =>
  s === "pago" ? "Recebido" : s === "atrasado" ? "Atrasado" : s === "cancelado" ? "Cancelado" : "Em aberto";

export default function ContasReceber() {
  const [busca, setBusca] = useState("");
  const [dataBase, setDataBase] = useState<DataBase>("emissao");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroBanco, setFiltroBanco] = useState<string>("todos");
  const [filtroMeio, setFiltroMeio] = useState<string>("todos");
  const [situacoes, setSituacoes] = useState<Set<StatusGestao>>(
    new Set<StatusGestao>(["pago", "em_aberto", "atrasado"])
  );
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "data_compra",
    dir: "desc",
  });

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

  const em30 = useMemo(() => new Date(hoje.getTime() + 30 * 86400000), [hoje]);

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

  /** Conjunto filtrado por tudo EXCETO situação — base dos KPIs e das contagens. */
  const base = useMemo(() => {
    const titulos = data ?? [];
    const buscaLc = busca.trim().toLowerCase();
    const dDe = dataDe ? new Date(dataDe + "T00:00:00") : null;
    const dAte = dataAte ? new Date(dataAte + "T23:59:59") : null;

    return titulos.filter((t) => {
      if (filtroBanco !== "todos" && t.banco_nome !== filtroBanco) return false;
      if (filtroMeio !== "todos" && t.meio_pagamento !== filtroMeio) return false;

      if (buscaLc) {
        const num = (t.numero_titulo ?? "").toLowerCase();
        const cli = (t.cliente ?? "").toLowerCase();
        const nf = (t.nf_numero ?? "").toLowerCase();
        if (!num.includes(buscaLc) && !cli.includes(buscaLc) && !nf.includes(buscaLc)) return false;
      }

      if (dDe || dAte) {
        const ref =
          dataBase === "vencimento"
            ? t.data_vencimento
            : dataBase === "emissao"
            ? t.data_compra
            : t.data_liquidacao;
        if (!ref) return false;
        const d = new Date(ref + "T12:00:00");
        if (dDe && d < dDe) return false;
        if (dAte && d > dAte) return false;
      }
      return true;
    });
  }, [data, busca, dataBase, dataDe, dataAte, filtroBanco, filtroMeio]);

  const contagens = useMemo(() => {
    const c: Record<StatusGestao, number> = { pago: 0, em_aberto: 0, atrasado: 0, cancelado: 0 };
    for (const t of base) c[t.status_gestao] = (c[t.status_gestao] ?? 0) + 1;
    return c;
  }, [base]);

  const kpis = useMemo(() => {
    let recebido = 0;
    let recebidoQtd = 0;
    let aberto = 0;
    let abertoQtd = 0;
    let vencido = 0;
    let vence30 = 0;
    for (const t of base) {
      const v = t.valor ?? 0;
      if (t.status_gestao === "cancelado") continue;
      if (t.status_gestao === "pago") {
        recebido += v;
        recebidoQtd += 1;
        continue;
      }
      aberto += v;
      abertoQtd += 1;
      if (t.status_gestao === "atrasado") vencido += v;
      if (t.status_gestao === "em_aberto") {
        const ref = t.data_liquidacao ?? t.data_vencimento;
        if (ref) {
          const d = new Date(ref + "T12:00:00");
          if (d >= hoje && d <= em30) vence30 += v;
        }
      }
    }
    const inadimplencia = aberto > 0 ? (vencido / aberto) * 100 : 0;
    return {
      recebido,
      recebidoQtd,
      aberto,
      abertoQtd,
      vencido,
      vence30,
      inadimplencia,
      total: recebido + aberto,
      totalQtd: recebidoQtd + abertoQtd,
    };
  }, [base, hoje, em30]);

  const aging = useMemo(() => {
    const faixas = { f1_7: 0, f8_30: 0, f31_60: 0, f60: 0 };
    for (const t of base) {
      if (t.status_gestao !== "em_aberto" && t.status_gestao !== "atrasado") continue;
      if (!t.data_vencimento) continue;
      const venc = new Date(t.data_vencimento + "T12:00:00");
      const dias = Math.floor((hoje.getTime() - venc.getTime()) / 86400000);
      const valor = t.valor ?? 0;
      if (dias <= 0) continue;
      else if (dias <= 7) faixas.f1_7 += valor;
      else if (dias <= 30) faixas.f8_30 += valor;
      else if (dias <= 60) faixas.f31_60 += valor;
      else faixas.f60 += valor;
    }
    return faixas;
  }, [base, hoje]);

  const breakdownMeio = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const t of base) {
      if (t.status_gestao === "cancelado" || t.status_gestao === "pago") continue;
      if (SEM_CAIXA.includes(t.meio_pagamento ?? "")) continue;
      const meio = t.meio_pagamento ?? "—";
      mapa.set(meio, (mapa.get(meio) ?? 0) + (t.valor ?? 0));
    }
    return Array.from(mapa.entries())
      .map(([meio, total]) => ({ meio, total }))
      .filter((i) => i.total >= 1)
      .sort((a, b) => b.total - a.total);
  }, [base]);

  const filtrados = useMemo(() => {
    let arr = base.filter((t) => situacoes.has(t.status_gestao));
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
        return sort.dir === "asc" ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
      });
    }
    return arr;
  }, [base, situacoes, sort]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginados = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleSituacao = (k: StatusGestao) => {
    setSituacoes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPage(1);
  };

  const renderStatusBadge = (s: StatusGestao) => {
    if (s === "pago")
      return <Badge className="bg-emerald-100 text-emerald-800 border-0">Recebido</Badge>;
    if (s === "atrasado") return <Badge variant="destructive">Atrasado</Badge>;
    if (s === "cancelado")
      return <Badge className="bg-muted text-muted-foreground border-0">Cancelado</Badge>;
    return <Badge variant="outline">Em aberto</Badge>;
  };

  const handleExportXLSX = () => {
    const linhas = filtrados.map((t) => ({
      NF: t.nf_numero ?? "",
      Cliente: t.cliente ?? "",
      "Título / Parcela":
        (t.numero_titulo ?? "") +
        (t.numero_parcela != null && t.total_parcelas != null
          ? ` ${t.numero_parcela}/${t.total_parcelas}`
          : ""),
      Banco: t.banco_nome ?? "",
      Meio: formatMeio(t.meio_pagamento),
      "Data compra": formatDateBR(t.data_compra),
      Vencimento: formatDateBR(t.data_vencimento),
      Liquidação: formatDateBR(t.data_liquidacao),
      "Recebido em": t.liquidacao_realizada ? formatDateBR(t.data_liquidacao) : "",
      Valor: t.valor ?? 0,
      Status: rotuloStatus(t.status_gestao),
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
            Recebíveis B2B por parcela — somente títulos com NF. Recebidos, em aberto e vencidos na
            mesma lista. Visão de gestão (somente leitura).
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-green-700">
                {formatBRL(kpis.recebido)}
              </div>
              <p className="text-xs text-muted-foreground">{kpis.recebidoQtd} títulos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-700">Total a receber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-blue-700">
                {formatBRL(kpis.aberto)}
              </div>
              <p className="text-xs text-muted-foreground">{kpis.abertoQtd} títulos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-cyan-700">A vencer em 30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-cyan-700">
                {formatBRL(kpis.vence30)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total no período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{formatBRL(kpis.total)}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.totalQtd} títulos · cancelados fora
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700">Vencido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-700">
                {formatBRL(kpis.vencido)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-rose-700">Inadimplência</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-rose-700">
                {kpis.inadimplencia.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-amber-600">1–7 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-amber-600">
                {formatBRL(aging.f1_7)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-600">8–30 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-orange-600">
                {formatBRL(aging.f8_30)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600">31–60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-600">
                {formatBRL(aging.f31_60)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-800">+60 dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-red-800">
                {formatBRL(aging.f60)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Breakdown por meio */}
      {breakdownMeio.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {breakdownMeio.map((i) => (
            <Card key={i.meio} className="flex-1 min-w-[160px]">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  A receber — {formatMeio(i.meio)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold tabular-nums">{formatBRL(i.total)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1">
            <Label className="text-xs">Situação</Label>
            <div className="flex flex-wrap gap-2">
              {SITUACOES.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={situacoes.has(s.key) ? "default" : "outline"}
                  onClick={() => toggleSituacao(s.key)}
                >
                  {s.label} ({contagens[s.key] ?? 0})
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Busca</Label>
              <Input
                placeholder="Título, NF ou cliente"
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
              <Label className="text-xs">Data base</Label>
              <Select
                value={dataBase}
                onValueChange={(v) => {
                  setDataBase(v as DataBase);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vencimento">Vencimento</SelectItem>
                  <SelectItem value="emissao">Emissão (NF)</SelectItem>
                  <SelectItem value="liquidacao">Liquidação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
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
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={dataAte}
                onChange={(e) => {
                  setDataAte(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <SortTh label="Recebido em" sortKey="liquidacao_realizada" sort={sort} setSort={setSort} />
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
                          t.liquidacao_realizada === true ? (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Badge className="bg-green-100 text-green-700 border-0">REAL</Badge>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {formatDateBR(t.data_liquidacao)}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-amber-100 text-amber-700 border-0 cursor-help">
                                    PREVISTO
                                  </Badge>
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
                      <TableCell>
                        {t.liquidacao_realizada === true ? (
                          formatDateBR(t.data_liquidacao)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(t.valor ?? 0)}
                      </TableCell>
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
