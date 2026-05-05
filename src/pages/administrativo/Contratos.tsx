import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSignature,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { ContratoComKPIs, ContratosKPIs } from "@/types/contratos";
import { NovoContratoSheet } from "@/components/contratos/NovoContratoSheet";

function KpiCard({
  label,
  value,
  sub,
  urgencia,
}: {
  label: string;
  value: string | number;
  sub?: string;
  urgencia?: "ok" | "atencao" | "critico";
}) {
  const cor =
    urgencia === "critico"
      ? "border-red-200 bg-red-50"
      : urgencia === "atencao"
        ? "border-yellow-200 bg-yellow-50"
        : "border-border bg-card";

  return (
    <div className={cn("rounded-lg border p-4", cor)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function AlertaBadge({ alerta }: { alerta: string }) {
  if (alerta === "vencido")
    return <Badge variant="destructive">Vencido</Badge>;
  if (alerta === "critico")
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Vence em 30d</Badge>;
  if (alerta === "atencao")
    return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Vence em 60d</Badge>;
  if (alerta === "sem_fim")
    return <Badge variant="outline">Sem fim</Badge>;
  return null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ativo: { label: "Ativo", className: "bg-green-100 text-green-700 hover:bg-green-100" },
    encerrado: { label: "Encerrado", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
    suspenso: { label: "Suspenso", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
    renovando: { label: "Renovando", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
    rascunho: { label: "Rascunho", className: "bg-gray-100 text-gray-500 hover:bg-gray-100" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

export default function Contratos() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["contratos"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_contratos_kpis")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContratoComKPIs[];
    },
  });

  const kpis: ContratosKPIs = {
    total_ativos: contratos.filter((c) => c.status === "ativo").length,
    valor_comprometido_mes: contratos
      .filter((c) => c.status === "ativo")
      .reduce((acc, c) => acc + (c.valor_mensal_recorrente ?? 0), 0),
    valor_comprometido_ano: contratos
      .filter((c) => c.status === "ativo")
      .reduce((acc, c) => acc + (c.valor_mensal_recorrente ?? 0) * 12, 0),
    vencendo_60_dias: contratos.filter(
      (c) => c.alerta_vencimento === "critico" || c.alerta_vencimento === "atencao",
    ).length,
    sem_documento: contratos.filter((c) => c.doc_pendente).length,
    parcelas_atrasadas: contratos.reduce(
      (acc, c) => acc + (c.parcelas_atrasadas ?? 0),
      0,
    ),
    taxa_boletos_vinculados: 0,
    divergencias_pendentes: 0,
  };

  const filtrados = contratos.filter((c) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      c.objeto?.toLowerCase().includes(q) ||
      c.numero?.toLowerCase().includes(q) ||
      c.parceiro_nome?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileSignature className="h-6 w-6" />
            Contratos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sem contrato cadastrado, pagamento recorrente não existe.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Contrato
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Contratos ativos" value={kpis.total_ativos} />
        <KpiCard
          label="Comprometido/mês"
          value={formatBRL(kpis.valor_comprometido_mes)}
        />
        <KpiCard
          label="Comprometido/ano"
          value={formatBRL(kpis.valor_comprometido_ano)}
        />
        <KpiCard
          label="Vencendo em 60d"
          value={kpis.vencendo_60_dias}
          urgencia={kpis.vencendo_60_dias > 0 ? "atencao" : "ok"}
        />
        <KpiCard
          label="Sem documento"
          value={kpis.sem_documento}
          urgencia={kpis.sem_documento > 0 ? "critico" : "ok"}
        />
        <KpiCard
          label="Parcelas atrasadas"
          value={kpis.parcelas_atrasadas}
          urgencia={kpis.parcelas_atrasadas > 0 ? "critico" : "ok"}
        />
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por número, objeto ou parceiro..."
          className="pl-9"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Objeto</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead className="text-right">Valor/mês</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead className="text-center">Doc</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum contrato cadastrado.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.numero}</TableCell>
                <TableCell className="max-w-[280px] truncate">{c.objeto}</TableCell>
                <TableCell>{c.parceiro_nome ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {c.area}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {formatDateBR(c.data_inicio)}
                  {c.data_fim ? ` → ${formatDateBR(c.data_fim)}` : " → ∞"}
                </TableCell>
                <TableCell className="text-right">
                  {c.valor_mensal_recorrente > 0
                    ? formatBRL(c.valor_mensal_recorrente)
                    : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <AlertaBadge alerta={c.alerta_vencimento} />
                </TableCell>
                <TableCell className="text-center">
                  {c.doc_pendente ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 inline" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NovoContratoSheet
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: ["contratos"] });
          setNovoOpen(false);
        }}
      />
    </div>
  );
}
