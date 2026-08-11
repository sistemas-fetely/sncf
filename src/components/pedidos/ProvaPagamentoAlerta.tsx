import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/format-currency";
import type { ProvaPagamento } from "@/hooks/pedidos/useProvaPagamento";

interface Props {
  prova: ProvaPagamento;
  className?: string;
}

/**
 * Mostra a prova de pagamento no momento da decisão. O texto vem pronto do
 * banco (`prova_rotulo` / `prova_frase`) — a tela só escolhe o tom.
 */
export function ProvaPagamentoAlerta({ prova, className }: Props) {
  const tom = prova.prova_tom;

  const Icone =
    tom === "ok" ? ShieldCheck : tom === "alerta" ? Clock : tom === "perigo" ? ShieldAlert : Info;

  const mostrarFonte =
    !!prova.fonte_coberta_ate && (tom === "alerta" || tom === "perigo");

  return (
    <Alert
      variant={tom === "perigo" ? "destructive" : "default"}
      className={cn(
        tom === "ok" &&
          "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200 [&>svg]:text-emerald-600",
        tom === "alerta" &&
          "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200 [&>svg]:text-amber-600",
        className,
      )}
    >
      <Icone className="h-4 w-4" />
      <AlertDescription>
        <span className="block font-semibold">{prova.prova_rotulo}</span>
        <span className="block text-sm">{prova.prova_frase}</span>
        {mostrarFonte && (
          <span className="block text-xs opacity-80 pt-0.5">
            Extrato importado até {formatDateBR(prova.fonte_coberta_ate)}
            {prova.fonte_dias_atras != null ? ` · ${prova.fonte_dias_atras} dias atrás` : ""}.
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
