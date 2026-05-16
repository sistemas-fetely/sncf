import { useMemo, useState } from "react";
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
import { Link } from "react-router-dom";
import { ArrowDownToLine, Search, Upload } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

// KPI CANDIDATO: Prazo médio de recebimento (dias entre emissão e recebimento)
// KPI CANDIDATO: % de contas recebidas em atraso
// KPI CANDIDATO: Concentração de clientes (top 3 = X% do total)
// KPI CANDIDATO: Ticket médio por cliente
// KPI CANDIDATO: Inadimplência (% atrasado / a receber)

type Conta = {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  conta_id: string | null;
  plano_contas?: { nome: string } | null;
  parceiros_comerciais?: { razao_social: string | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  atrasado: "bg-red-100 text-red-800 hover:bg-red-100",
  enviado_para_pagamento: "bg-green-100 text-green-800 hover:bg-green-100",
  cancelado: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

const PAGE_SIZE = 20;

export default function ContasReceber() {
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["contas-receber"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_receber")
        .select("*, plano_contas:conta_id(nome), parceiros_comerciais:parceiro_id(razao_social)")
        .eq("tipo", "receber")
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as Conta[];
    },
  });

  const filtered = useMemo(() => {
    let list = data || [];
    if (statusFilter !== "todos") list = list.filter((c) => c.status === statusFilter);
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter(
        (c) =>
          c.descricao?.toLowerCase().includes(t) ||
          c.fornecedor_cliente?.toLowerCase().includes(t) ||
          c.parceiros_comerciais?.razao_social?.toLowerCase().includes(t)
      );
    }
    if (dataDe) list = list.filter((c) => (c.data_vencimento || "") >= dataDe);
    if (dataAte) list = list.filter((c) => (c.data_vencimento || "") <= dataAte);
    return list;
  }, [data, statusFilter, busca, dataDe, dataAte]);

  const totals = useMemo(() => {
    const all = data || [];
    const aReceber = all
      .filter((c) => c.status === "aberto" || c.status === "atrasado")
      .reduce((s, c) => s + Number(c.valor || 0), 0);
    const atrasado = all
      .filter((c) => c.status === "atrasado")
      .reduce((s, c) => s + Number(c.valor || 0), 0);
    const recebidoPeriodo = (filtered || [])
      .filter((c) => c.status === "enviado_para_pagamento")
      .reduce((s, c) => s + Number(c.valor || 0), 0);
    return { aReceber, atrasado, recebidoPeriodo };
  }, [data, filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ArrowDownToLine className="h-6 w-6 text-admin" />
          Contas a Receber
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Faturas e recebimentos previstos — por canal e cliente.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Total a receber</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{formatBRL(totals.aReceber)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Total atrasado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{formatBRL(totals.atrasado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Recebido no período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{formatBRL(totals.recebidoPeriodo)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição ou cliente..."
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Input
              type="date"
              value={dataDe}
              onChange={(e) => {
                setDataDe(e.target.value);
                setPage(1);
              }}
              className="w-full lg:w-44"
            />
            <Input
              type="date"
              value={dataAte}
              onChange={(e) => {
                setDataAte(e.target.value);
                setPage(1);
              }}
              className="w-full lg:w-44"
            />
            <div className="flex flex-wrap gap-1">
              {(["todos", "aberto", "atrasado", "enviado_para_pagamento", "cancelado"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
              <p className="text-lg font-semibold">Sem contas a receber importadas</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Sincronize com o Bling para importar contas a receber.
              </p>
              <Button asChild className="bg-admin hover:bg-admin-accent text-admin-foreground">
                <Link to="/administrativo/importar">
                  <Upload className="h-4 w-4 mr-2" />
                  Ir para importação
                </Link>
              </Button>
            </div>
          ) : pageData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado para os filtros aplicados.
            </div>
          ) : (
            <>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageData.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{formatDateBR(c.data_vencimento)}</TableCell>
                        <TableCell className="max-w-xs truncate" title={c.descricao}>{c.descricao}</TableCell>
                        <TableCell>{c.parceiros_comerciais?.razao_social || c.fornecedor_cliente || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.plano_contas?.nome || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">
                          {formatBRL(c.valor)}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_STYLES[c.status] || "bg-muted"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  {filtered.length} registro{filtered.length === 1 ? "" : "s"} • Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
