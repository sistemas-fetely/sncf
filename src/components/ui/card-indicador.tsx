import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §3 — numero e indicador, nao paragrafo.
 * KPI nasce NEUTRO: cor so entra quando o numero exige acao.
 * Valor sempre com numeral tabular para comparar coluna a coluna.
 */
export type TomIndicador = "neutro" | "atencao" | "critico" | "positivo";

const TONS: Record<TomIndicador, string> = {
  neutro: "",
  atencao: "text-warning",
  critico: "text-destructive",
  positivo: "text-success",
};

interface CardIndicadorProps {
  rotulo: string;
  valor: ReactNode;
  /** texto miudo abaixo do valor */
  nota?: ReactNode;
  /** selo ou marcador a direita do rotulo */
  adorno?: ReactNode;
  tom?: TomIndicador;
  /** destaque de selecao (cartao que tambem e filtro) */
  ativo?: boolean;
  /** compacto para faixas de 5+ indicadores */
  compacto?: boolean;
  className?: string;
}

export function CardIndicador({
  rotulo,
  valor,
  nota,
  adorno,
  tom = "neutro",
  ativo,
  compacto,
  className,
}: CardIndicadorProps) {
  return (
    <Card className={cn("h-full", ativo && "border-primary bg-primary/10", className)}>
      <CardContent className={cn("space-y-1", compacto ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{rotulo}</span>
          {adorno}
        </div>
        <div className={cn("tabular-nums", compacto ? "text-base" : "text-2xl", TONS[tom])}>
          {valor}
        </div>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}
