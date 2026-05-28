import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Clock, CheckCircle2, AlertOctagon } from "lucide-react";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { cn } from "@/lib/utils";

export function PedidosStatsCards() {
  const { data, isLoading } = usePedidosPipeline();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const rows = data || [];
  const ativos = rows
    .filter((r) => !["entregue", "cancelado"].includes(r.estagio))
    .reduce((acc, r) => acc + r.qtd, 0);
  const slaEstourado = rows.reduce((acc, r) => acc + r.qtd_sla_estourado, 0);
  const faturados = rows
    .filter((r) => ["faturado", "em_transporte", "entregue"].includes(r.estagio))
    .reduce((acc, r) => acc + r.qtd, 0);
  const cancelados = rows
    .filter((r) => r.estagio === "cancelado")
    .reduce((acc, r) => acc + r.qtd, 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<ShoppingBag className="h-5 w-5 text-muted-foreground" />}
        label="Em operação"
        value={ativos}
        hint="recebidos a pronto"
      />
      <StatCard
        icon={<Clock className="h-5 w-5 text-red-500" />}
        label="SLA estourado"
        value={slaEstourado}
        hint="passou de 24h"
        emphasize={slaEstourado > 0}
      />
      <StatCard
        icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        label="Faturados+"
        value={faturados}
        hint="já foram pro Bling"
      />
      <StatCard
        icon={<AlertOctagon className="h-5 w-5 text-muted-foreground" />}
        label="Cancelados"
        value={cancelados}
        hint="encerrados"
      />
    </div>
  );
}

function StatCard({
  icon, label, value, hint, emphasize,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", emphasize && "text-red-600")}>
              {value}
            </p>
            {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
