import { Card, CardContent } from "@/components/ui/card";
import { useCreditoStats } from "@/hooks/credito/useCreditoStats";
import { Inbox, Search, Gavel, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function CreditoStatsCards() {
  const { data, isLoading } = useCreditoStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={<Inbox className="h-5 w-5" />}
        label="Aguardando liberação (SOps)"
        value={data?.entrada || 0}
        hint="liberação acontece em /pedidos"
      />
      <StatCard
        icon={<Search className="h-5 w-5" />}
        label="Análise (Time)"
        value={data?.analise || 0}
        hint="aguardando anexos+IA"
      />
      <StatCard
        icon={<Gavel className="h-5 w-5" />}
        label="Decisão (Joseph)"
        value={data?.decisao || 0}
        hint="aguardando decisão"
      />
      <StatCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        label="Decididas no mês"
        value={data?.decididasMes || 0}
        hint={
          data ? `${data.aprovadasMes} aprov · ${data.reprovadasMes} reprov` : ""
        }
      />
    </div>
  );
}

function StatCard({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: number; hint?: string }) {
  return (
    <Card className="gold-border gold-border-hover transition-all">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 text-gold flex-shrink-0">
            {icon}
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="font-serif text-3xl leading-none text-foreground">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
