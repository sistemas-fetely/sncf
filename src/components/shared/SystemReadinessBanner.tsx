import { AlertTriangle, AlertCircle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useProntidaoSistema } from "@/hooks/useProntidaoSistema";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Só mostrar problemas críticos (para barras universais discretas). Default: false (mostra tudo). */
  somenteCriticos?: boolean;
  className?: string;
}

export function SystemReadinessBanner({ somenteCriticos = false, className }: Props) {
  const { data } = useProntidaoSistema();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!data) return null;

  const problemas = data.problemas.filter(
    (p) => !dismissed.has(p.codigo) && (!somenteCriticos || p.severidade === "critico")
  );

  if (problemas.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {problemas.map((p) => {
        const isCritico = p.severidade === "critico";
        const Icon = isCritico ? AlertCircle : AlertTriangle;
        return (
          <div
            key={p.codigo}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm",
              isCritico
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-warning/40 bg-warning/10 text-warning"
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 flex items-center gap-3 flex-wrap">
              <span className="leading-snug">{p.mensagem}</span>
              {p.link && (
                <Button asChild size="sm" variant={isCritico ? "destructive" : "outline"} className="h-7">
                  <Link to={p.link}>Ir para tela</Link>
                </Button>
              )}
            </div>
            {!isCritico && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 -mr-1 -mt-1 flex-shrink-0"
                onClick={() => setDismissed((prev) => new Set([...prev, p.codigo]))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
