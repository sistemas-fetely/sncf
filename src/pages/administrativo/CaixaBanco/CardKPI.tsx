/**
 * Cards KPI compartilhados entre as abas (extraídos de CaixaBanco.tsx).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface CardKPIDuploProps {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: "fetely" | "blue" | "green" | "amber" | "red" | "purple";
  total: number;
  qtdTem: number;
  qtdFalta: number;
  ativoTem: boolean;
  ativoFalta: boolean;
  onClickTem: () => void;
  onClickFalta: () => void;
}

export function CardKPIDuplo({
  titulo,
  icone: Icone,
  total,
  qtdTem,
  qtdFalta,
  ativoTem,
  ativoFalta,
  onClickTem,
  onClickFalta,
}: CardKPIDuploProps) {
  const pctTem = total > 0 ? Math.round((qtdTem / total) * 100) : 0;
  const pctFalta = total > 0 ? Math.round((qtdFalta / total) * 100) : 0;
  return (
    <div className="border border-success/40 bg-success/10 rounded-lg overflow-hidden">
      <div className="px-3 pt-1.5 pb-0.5 flex items-center gap-1.5">
        <Icone className="h-3.5 w-3.5 text-success" />
        <span className="text-[11px] font-medium text-success">{titulo}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-success/40">
        <button
          type="button"
          onClick={onClickTem}
          className={`px-3 py-1.5 text-left transition-colors ${
            ativoTem
              ? "bg-success/10 ring-2 ring-inset ring-success"
              : "hover:bg-success/10"
          }`}
        >
          <div className="text-[10px] text-success font-medium">Tem</div>
          <div className="text-lg font-medium text-success leading-tight">{pctTem}%</div>
          <div className="text-[10px] text-success">{qtdTem}/{total}</div>
        </button>
        <button
          type="button"
          onClick={onClickFalta}
          className={`px-3 py-1.5 text-left transition-colors ${
            ativoFalta
              ? "bg-destructive/10 ring-2 ring-inset ring-destructive"
              : "hover:bg-destructive/60"
          }`}
        >
          <div className="text-[10px] text-destructive font-medium">Falta</div>
          <div className="text-lg font-medium text-destructive leading-tight">{pctFalta}%</div>
          <div className="text-[10px] text-destructive">{qtdFalta}/{total}</div>
        </button>
      </div>
    </div>
  );
}

export function CardKPI({
  titulo,
  valor,
  sublinha,
  cor,
  ativo,
  onClick,
  icone: Icon,
}: {
  titulo: string;
  valor: string;
  sublinha: string;
  cor: "red" | "amber" | "blue" | "purple" | "teal" | "fetely";
  ativo: boolean;
  onClick: () => void;
  icone?: LucideIcon;
}) {
  const corBase: Record<string, string> = {
    red: "bg-destructive/70 border-destructive/40",
    amber: "bg-warning/70 border-warning/40",
    blue: "bg-info/70 border-info/40",
    purple: "bg-info/70 border-info/40",
    teal: "bg-success/70 border-success/40",
    fetely: "bg-success/70 border-success/40",
  };
  const corAtivo: Record<string, string> = {
    red: "bg-destructive/10 border-destructive/40 ring-2 ring-destructive",
    amber: "bg-warning/10 border-warning/40 ring-2 ring-warning",
    blue: "bg-info/10 border-info/40 ring-2 ring-info",
    purple: "bg-info/10 border-info/40 ring-2 ring-info",
    teal: "bg-success/10 border-success/40 ring-2 ring-success",
    fetely: "bg-success/10 border-success/40 ring-2 ring-success",
  };
  const textMap: Record<string, string> = {
    red: "text-destructive",
    amber: "text-warning",
    blue: "text-info",
    purple: "text-info",
    teal: "text-success",
    fetely: "text-success",
  };
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        ativo ? corAtivo[cor] : corBase[cor],
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-0.5 pt-2 px-3">
        <CardTitle
          className={cn(
            "text-[11px] font-normal flex items-center gap-1",
            ativo ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {Icon && <Icon className="h-3 w-3" />}
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2 px-3">
        <div className={cn("text-lg font-medium", textMap[cor])}>{valor}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{sublinha}</div>
      </CardContent>
    </Card>
  );
}
