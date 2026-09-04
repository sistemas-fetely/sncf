import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatusGestao } from "@/hooks/credito/useTitulosCobranca";

interface SeloPontualidadeProps {
  relogio: "cliente" | "adquirente" | null;
  dias: number | null;
  aguardandoCredito: boolean | null;
  statusGestao?: StatusGestao | null;
}

export function SeloPontualidade({
  relogio,
  dias,
  aguardandoCredito,
}: SeloPontualidadeProps) {
  if (relogio === "adquirente") {
    if (aguardandoCredito) {
      if (dias !== null && dias > 0) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge className="bg-warning/10 text-warning border-0 text-[10px] cursor-help">
                    Adquirente atrasou {dias}d
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Cartão: o cliente pagou na autorização. Esta data mede quando a
                adquirente creditou o valor, não a pontualidade do cliente.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="secondary" className="text-[10px] cursor-help">
                  Aguardando crédito da adquirente
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Cartão: o cliente pagou na autorização. Esta data mede quando a
              adquirente creditou o valor, não a pontualidade do cliente.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (dias === null) return null;
    if (dias <= 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge className="bg-success/10 text-success border-0 text-[10px] cursor-help">
                  Adquirente creditou em dia
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Cartão: o cliente pagou na autorização. Esta data mede quando a
              adquirente creditou o valor, não a pontualidade do cliente.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge className="bg-warning/10 text-warning border-0 text-[10px] cursor-help">
                Adquirente atrasou {dias}d
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Cartão: o cliente pagou na autorização. Esta data mede quando a
            adquirente creditou o valor, não a pontualidade do cliente.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (relogio === "cliente") {
    if (dias === null) return null;
    if (dias < 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge className="bg-success/10 text-success border-0 text-[10px] cursor-help">
                  Pago {Math.abs(dias)}d antes
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Mede quando o cliente pagou, contra o vencimento atual do título.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    if (dias === 0) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge className="bg-success/10 text-success border-0 text-[10px] cursor-help">
                  Pago no dia
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Mede quando o cliente pagou, contra o vencimento atual do título.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Badge variant="destructive" className="text-[10px] cursor-help">
                Pago com {dias}d de atraso
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Mede quando o cliente pagou, contra o vencimento atual do título.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}
