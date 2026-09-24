import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, ArrowUpDown, Search } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { fmtBRL, fmtData } from "../comissoes/fmt";
import { lerTudo, fmtPct2, fmtInt, TOOLTIP_SEM_CONTRAPARTE, type Linha } from "./dados";

type Col = { k: string; label: string; tipo: "brl" | "int" | "pct" | "data" };
const COLS: Col[] = [
  { k: "pedidos_total", label: "Pedidos", tipo: "int" },
  { k: "notas_faturadas", label: "Notas", tipo: "int" },
  { k: "clientes_distintos", label: "Clientes", tipo: "int" },
  { k: "valor_vendido_bruto", label: "Vendido", tipo: "brl" },
  { k: "ticket_medio", label: "Ticket médio", tipo: "brl" },
  { k: "desconto_medio_pct", label: "Desconto médio %", tipo: "pct" },
  { k: "pct_efetivo_medio", label: "% efetivo", tipo: "pct" },
  { k: "comissao_apurada", label: "Comissão apurada", tipo: "brl" },
  { k: "comissao_liberada", label: "Liberada", tipo: "brl" },
  { k: "comissao_pendente", label: "Pendente", tipo: "brl" },
  { k: "prev_comissao_30d", label: "Previsto 30d", tipo: "brl" },
  { k: "carteira_a_receber", label: "Carteira a receber", tipo: "brl" },
  { k: "carteira_vencida", label: "Vencida", tipo: "brl" },
  { k: "inadimplencia_pct", label: "Inadimplência %", tipo: "pct" },
  { k: "ultima_venda", label: "Última venda", tipo: "data" },
];

function fmt(c: Col, v: unknown) {
  if (c.tipo === "brl") return fmtBRL(v as number);
  if (c.tipo === "int") return fmtInt(v);
  if (c.tipo === "pct") return fmtPct2(v);
  return fmtData(v as string);
}

export function BadgeApto({ apto }: { apto: boolean }) {
  if (apto) return <Badge className="bg-success/15 text-success border-success/30" variant="outline">Apto</Badge>;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Sem contraparte</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{TOOLTIP_SEM_CONTRAPARTE}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function RepresentantesPainel() {
  const nav = useNavigate();
  const [busca, setBusca] = useState("");
  const [ord, setOrd] = useState<{ k: string; asc: boolean }>({ k: "valor_vendido_bruto", asc: false });

  const q = useQuery({
    queryKey: ["representante-kpi"],
    queryFn: () => lerTudo("vw_representante_kpi", (x) => x.eq("tipo", "representante")),
  });
  useEffect(() => {
    if (q.error) toast.error(`Falha ao carregar representantes: ${formatError(q.error)}`);
  }, [q.error]);

  const linhas = q.data ?? [];
  const tot = useMemo(() => {
    const s = (k: string) => linhas.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      vendido: s("valor_vendido_bruto"),
      apurada: s("comissao_apurada"),
      liberada: s("comissao_liberada"),
      pendente: s("comissao_pendente"),
      prev30: s("prev_comissao_30d"),
      vencida: s("carteira_vencida"),
    };
  }, [linhas]);

  const vis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const f = t ? linhas.filter((r) => String(r.representante ?? "").toLowerCase().includes(t)) : linhas;
    return [...f].sort((a: Linha, b: Linha) => {
      const va = a[ord.k], vb = b[ord.k];
      const cmp = ord.k === "representante" || ord.k === "ultima_venda"
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : Number(va ?? 0) - Number(vb ?? 0);
      return ord.asc ? cmp : -cmp;
    });
  }, [linhas, busca, ord]);

  const th = (k: string, label: string) => (
    <TableHead key={k} className="whitespace-nowrap">
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setOrd((o) => ({ k, asc: o.k === k ? !o.asc : false }))}>
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  const cards = [
    ["Vendido no total", tot.vendido],
    ["Comissão apurada", tot.apurada],
    ["Comissão liberada", tot.liberada],
    ["Comissão pendente", tot.pendente],
    ["Previsto 30 dias", tot.prev30],
    ["Carteira vencida", tot.vencida],
  ] as const;

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Representantes" }]}
        titulo="Gestão de Representantes"
        icone={Users}
        estado="Desempenho, comissão e saúde da carteira de cada representante."
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([l, v]) => (
          <Card key={l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={cn("mt-1 text-lg font-medium tabular-nums",
              l === "Carteira vencida" && v > 0 && "text-destructive")}>{fmtBRL(v)}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="relative mt-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar representante" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="mt-3"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            {th("representante", "Representante")}
            {COLS.map((c) => th(c.k, c.label))}
            <TableHead>Apto a pagamento</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={COLS.length + 2} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : vis.length === 0 ? (
              <TableRow><TableCell colSpan={COLS.length + 2} className="text-center text-muted-foreground py-8">
                {linhas.length === 0 ? "Nenhum representante encontrado na base de indicadores (vw_representante_kpi com tipo 'representante')." : "Nenhum representante bate com a busca."}
              </TableCell></TableRow>
            ) : vis.map((r) => (
              <TableRow key={r.vendedor_id} className="cursor-pointer" onClick={() => nav(`/comercial/representantes/${r.vendedor_id}`)}>
                <TableCell className="font-medium whitespace-nowrap">{r.representante}</TableCell>
                {COLS.map((c) => (
                  <TableCell key={c.k} className={cn("whitespace-nowrap tabular-nums",
                    c.k === "inadimplencia_pct" && Number(r[c.k]) > 0 && "bg-destructive/10 text-destructive")}>
                    {fmt(c, r[c.k])}
                  </TableCell>
                ))}
                <TableCell onClick={(e) => e.stopPropagation()}><BadgeApto apto={!!r.apto_a_pagamento} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
