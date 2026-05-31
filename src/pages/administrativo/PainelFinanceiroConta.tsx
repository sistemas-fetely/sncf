import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Inbox,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Users,
  AlertTriangle,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

type RecebivelConta = {
  conta_id: string;
  cliente: string | null;
  cnpj: string | null;
  qtd_titulos_abertos: number | null;
  total_a_receber: number | null;
  total_vencido: number | null;
  faixa_a_vencer: number | null;
  faixa_1_15: number | null;
  faixa_16_30: number | null;
  faixa_31_60: number | null;
  faixa_60_mais: number | null;
  dias_atraso_max: number | null;
};

type TituloAberto = {
  id: string;
  numero_titulo: string | null;
  data_vencimento_atual: string | null;
  valor_atual: number | null;
  status: string;
};

type StatusGrupo = "a_receber" | "vencido";

const STATUS_ABERTOS = [
  "aguardando_pagamento",
  "aguardando_envio_bling",
  "aguardando_emissao_nf",
  "vigente",
  "vigente_parcial",
  "vencido",
  "vencido_suspenso",
  "em_juridico",
  "renegociado",
] as const;

const GRUPO_DE_STATUS: Record<string, StatusGrupo> = {
  aguardando_pagamento: "a_receber",
  aguardando_envio_bling: "a_receber",
  aguardando_emissao_nf: "a_receber",
  vigente: "a_receber",
  vigente_parcial: "a_receber",
  renegociado: "a_receber",
  vencido: "vencido",
  vencido_suspenso: "vencido",
  em_juridico: "vencido",
};

const GRUPO_LABEL: Record<StatusGrupo, string> = {
  a_receber: "A receber",
  vencido: "Vencido",
};

const GRUPO_BADGE: Record<StatusGrupo, string> = {
  a_receber: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  vencido: "bg-red-100 text-red-800 hover:bg-red-100",
};

type SortKey = "total_a_receber" | "total_vencido" | "dias_atraso_max";

const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

const diasDeAtraso = (venc: string | null): number => {
  if (!venc) return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(venc + "T00:00:00");
  const diff = Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
};

function FaixaCell({ value, className }: { value: number | null; className?: string }) {
  const v = num(value);
  if (v === 0) {
    return (
      <TableCell className="text-right font-mono text-muted-foreground/60">
        {formatBRL(0)}
      </TableCell>
    );
  }
  return (
    <TableCell className={cn("text-right font-mono font-medium", className)}>
      {formatBRL(v)}
    </TableCell>
  );
}

function TitulosAbertosCliente({ contaId }: { contaId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["titulos-abertos-conta", contaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("titulo_a_receber")
        .select("id, numero_titulo, data_vencimento_atual, valor_atual, status")
        .eq("conta_id", contaId)
        .in("status", STATUS_ABERTOS as unknown as string[])
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TituloAberto[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Erro ao carregar títulos deste cliente.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Nenhum título em aberto.
      </div>
    );
  }

  return (
    <div className="bg-muted/30 p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº título</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Dias de atraso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((t) => {
            const grupo = GRUPO_DE_STATUS[t.status] ?? "a_receber";
            const atraso = diasDeAtraso(t.data_vencimento_atual);
            return (
              <TableRow key={t.id}>
                <TableCell className="font-mono">{t.numero_titulo ?? "—"}</TableCell>
                <TableCell>{formatDateBR(t.data_vencimento_atual)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatBRL(num(t.valor_atual))}
                </TableCell>
                <TableCell>
                  <Badge className={GRUPO_BADGE[grupo]}>{GRUPO_LABEL[grupo]}</Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono",
                    atraso === 0 ? "text-muted-foreground" : "text-destructive font-semibold",
                  )}
                >
                  {atraso}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PainelFinanceiroConta() {
  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_a_receber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["vw-recebivel-por-conta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_recebivel_por_conta" as never)
        .select("*");
      if (error) throw error;
      return (data ?? []) as RecebivelConta[];
    },
  });

  const kpis = useMemo(() => {
    const list = data ?? [];
    const total = list.reduce((s, r) => s + num(r.total_a_receber), 0);
    const vencido = list.reduce((s, r) => s + num(r.total_vencido), 0);
    const inad = total > 0 ? (vencido / total) * 100 : 0;
    return { total, vencido, inad };
  }, [data]);

  const linhas = useMemo(() => {
    let list = (data ?? []).slice();
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => (r.cliente ?? "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const av = num(a[sortKey] as number | null);
      const bv = num(b[sortKey] as number | null);
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return list;
  }, [data, busca, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toggleSort(k)}
      className="h-7 -mr-2 px-2 font-semibold"
    >
      {label}
      <ArrowUpDown
        className={cn(
          "ml-1 h-3 w-3",
          sortKey === k ? "text-foreground" : "text-muted-foreground/50",
        )}
      />
    </Button>
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Vencimentos x Cliente</h1>
        <p className="text-sm text-muted-foreground">
          Quanto cada cliente deve e há quanto tempo. Visão consolidada por aging.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total a receber</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {isLoading ? <Skeleton className="h-8 w-32" /> : formatBRL(kpis.total)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total vencido</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-destructive">
              {isLoading ? <Skeleton className="h-8 w-32" /> : formatBRL(kpis.vencido)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inadimplência</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                `${kpis.inad.toFixed(1)}%`
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca + tabela */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-destructive">
              <AlertTriangle className="h-8 w-8" />
              Não foi possível carregar os recebíveis. Tente novamente.
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : linhas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Inbox className="h-10 w-10" />
              <p className="text-sm">Nenhum cliente com título em aberto.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">
                    <SortBtn k="total_a_receber" label="Total a receber" />
                  </TableHead>
                  <TableHead className="text-right">A vencer</TableHead>
                  <TableHead className="text-right">1–15d</TableHead>
                  <TableHead className="text-right">16–30d</TableHead>
                  <TableHead className="text-right">31–60d</TableHead>
                  <TableHead className="text-right">+60d</TableHead>
                  <TableHead className="text-right">
                    <SortBtn k="total_vencido" label="Vencido" />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortBtn k="dias_atraso_max" label="Atraso máx (dias)" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((r) => {
                  const aberto = expandido === r.conta_id;
                  const atraso = num(r.dias_atraso_max);
                  return (
                    <Fragment key={r.conta_id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          setExpandido((cur) => (cur === r.conta_id ? null : r.conta_id))
                        }
                      >
                        <TableCell className="w-8">
                          {aberto ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.cliente ?? "—"}</div>
                          {r.cnpj && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {r.cnpj}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatBRL(num(r.total_a_receber))}
                        </TableCell>
                        <FaixaCell value={r.faixa_a_vencer} className="text-foreground" />
                        <FaixaCell value={r.faixa_1_15} className="text-yellow-700" />
                        <FaixaCell value={r.faixa_16_30} className="text-orange-600" />
                        <FaixaCell value={r.faixa_31_60} className="text-red-600" />
                        <FaixaCell value={r.faixa_60_mais} className="text-red-900" />
                        <TableCell className="text-right font-mono font-semibold text-destructive">
                          {formatBRL(num(r.total_vencido))}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            atraso === 0
                              ? "text-muted-foreground"
                              : "text-destructive font-semibold",
                          )}
                        >
                          {atraso}
                        </TableCell>
                      </TableRow>
                      {aberto && (
                        <TableRow>
                          <TableCell colSpan={10} className="p-0">
                            <TitulosAbertosCliente contaId={r.conta_id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
