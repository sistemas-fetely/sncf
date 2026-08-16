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
          "border-success/40 bg-success/10 text-success [&>svg]:text-success",
        tom === "alerta" &&
          "border-warning/40 bg-warning/10 text-warning [&>svg]:text-warning",
        className,
      )}
    >
      <Icone className="h-4 w-4" />
      <AlertDescription>
        <span className="block font-medium">{prova.prova_rotulo}</span>
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
