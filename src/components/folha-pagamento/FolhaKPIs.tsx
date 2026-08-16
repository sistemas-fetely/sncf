import { DollarSign, Users, TrendingDown, Building } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

type Competencia = Tables<"folha_competencias">;

const fmt = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  competencia: Competencia | null;
}

export function FolhaKPIs({ competencia }: Props) {
  const cards = [
    {
      label: "Total Bruto",
      value: fmt(competencia?.total_bruto ?? 0),
      icon: DollarSign,
      color: "text-info bg-info/10",
    },
    {
      label: "Total Líquido",
      value: fmt(competencia?.total_liquido ?? 0),
      icon: TrendingDown,
      color: "text-success bg-success/10",
    },
    {
      label: "Encargos",
      value: fmt(competencia?.total_encargos ?? 0),
      icon: Building,
      color: "text-warning bg-warning/10",
    },
    {
      label: "Colaboradores",
      value: String(competencia?.total_colaboradores ?? 0),
      icon: Users,
      color: "text-info bg-info/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`rounded-lg p-2.5 ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-lg font-medium">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
