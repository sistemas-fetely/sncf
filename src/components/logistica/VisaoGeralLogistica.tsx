import { Loader2, Truck, PackageCheck, PackageX, AlertTriangle, RotateCcw, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLogisticaAgregado, type LogisticaAgregadoRow } from "@/hooks/logistica/useLogisticaAgregado";
import { pctClassPersonalizada } from "./pct-util";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");

function n(v: number | null | undefined): number {
  return Number(v ?? 0);
}

function StatCardMini({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "info" | "warning" | "destructive" | "default";
}) {
  const toneCls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "info"
      ? "bg-info/10 text-info"
      : tone === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : "bg-primary/10 text-primary";
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}

export function VisaoGeralLogistica() {
  const { data: rows = [], isLoading } = useLogisticaAgregado();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando visão geral…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
        Nenhum dado logístico ainda.
      </div>
    );
  }

  const totalFrete = rows.reduce((a, r) => a + n(r.frete_total), 0);
  const totalCtes = rows.reduce((a, r) => a + n(r.total_ctes), 0);
  const totalEntregues = rows.reduce((a, r) => a + n(r.entregues), 0);
  const totalTransito = rows.reduce((a, r) => a + n(r.em_transito), 0);
  const totalAtencao = rows.reduce((a, r) => a + n(r.atencao), 0);
  const totalDevolucoes = rows.reduce((a, r) => a + n(r.devolucoes), 0);

  const ordenadas = [...rows].sort((a, b) => n(b.frete_total) - n(a.frete_total));

  return (
    <div className="space-y-6">
      {/* BLOCO 1 — Cards consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCardMini label="Frete total" value={BRL.format(totalFrete)} icon={DollarSign} />
        <StatCardMini label="CTes" value={NUM.format(totalCtes)} icon={Truck} tone="info" />
        <StatCardMini label="Entregues" value={NUM.format(totalEntregues)} icon={PackageCheck} tone="success" />
        <StatCardMini label="Em trânsito" value={NUM.format(totalTransito)} icon={Truck} tone="info" />
        <StatCardMini label="Atenção" value={NUM.format(totalAtencao)} icon={AlertTriangle} tone="warning" />
        <StatCardMini label="Devoluções" value={NUM.format(totalDevolucoes)} icon={RotateCcw} tone="destructive" />
      </div>

      {/* BLOCO 2 — Comparativo por transportadora */}
      <Card className="card-shadow">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-medium">Comparativo por transportadora</div>
            <div className="text-xs text-muted-foreground">Ordenado por frete total</div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transportadora</TableHead>
                  <TableHead className="text-right">CTes</TableHead>
                  <TableHead className="text-right">Frete total</TableHead>
                  <TableHead className="text-right">% Frete/NF</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                  <TableHead className="text-right">Em trânsito</TableHead>
                  <TableHead className="text-right">Atenção</TableHead>
                  <TableHead className="text-right">Devoluções</TableHead>
                  <TableHead className="text-right">Com pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((r) => {
                  const pct = r.pct_frete_nf == null ? null : Number(r.pct_frete_nf);
                  return (
                    <TableRow key={r.transportadora_id}>
                      <TableCell className="font-medium">{r.transportadora ?? "—"}</TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.total_ctes))}</TableCell>
                      <TableCell className="text-right font-medium">{BRL.format(n(r.frete_total))}</TableCell>
                      <TableCell className="text-right">
                        {pct == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-[11px] font-medium",
                              pctClassPersonalizada(pct)
                            )}
                          >
                            {pct.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.entregues))}</TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.em_transito))}</TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.atencao))}</TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.devolucoes))}</TableCell>
                      <TableCell className="text-right">{NUM.format(n(r.com_pedido))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 3 — Participação no custo */}
      <Card className="card-shadow">
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-sm font-medium">Participação no custo de frete</div>
            <div className="text-xs text-muted-foreground">
              Proporção de cada transportadora sobre {BRL.format(totalFrete)}
            </div>
          </div>
          <div className="space-y-2">
            {ordenadas.map((r) => {
              const share = totalFrete > 0 ? (n(r.frete_total) / totalFrete) * 100 : 0;
              return <BarraParticipacao key={r.transportadora_id} row={r} share={share} />;
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BarraParticipacao({ row, share }: { row: LogisticaAgregadoRow; share: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium truncate">{row.transportadora ?? "—"}</span>
        <span className="text-muted-foreground tabular-nums">
          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n(row.frete_total))} ·{" "}
          <span className="font-medium text-foreground">{share.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.max(share, 0.5)}%` }}
        />
      </div>
    </div>
  );
}
