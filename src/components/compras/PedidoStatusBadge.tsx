import { Badge } from "@/components/ui/badge";
import type { PedidoCompraStatus } from "@/lib/compras/types";

const config: Record<PedidoCompraStatus, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground border-0" },
  aberto: { label: "Aberto", className: "bg-info/10 text-info border-0" },
  em_compra: { label: "Em compra", className: "bg-warning/10 text-warning border-0" },
  comprado: { label: "Comprado", className: "bg-success/10 text-success border-0" },
  cancelado: { label: "Cancelado", className: "bg-destructive/10 text-destructive border-0" },
};

export function PedidoStatusBadge({ status }: { status: PedidoCompraStatus }) {
  const c = config[status] ?? config.rascunho;
  return <Badge className={c.className}>{c.label}</Badge>;
}
