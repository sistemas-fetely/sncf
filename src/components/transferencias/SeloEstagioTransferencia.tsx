import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EstagioBadge } from "@/components/pedidos/BadgesPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { estadoEnvioTransferencia, type SeloEstagioTransferenciaProps } from "./estagioTransferencia";

export function SeloEstagioTransferencia(props: SeloEstagioTransferenciaProps) {
  const { estagio, blingIdDestino, blingEnvioErro } = props;
  const estado = estadoEnvioTransferencia(props);
  if (estado !== "estagio") {
    const erro = estado === "erro";
    return <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={erro ? "destructive" : "outline"} className={erro ? undefined : "bg-warning/10 text-warning border-warning/20"} tabIndex={0}>
          {erro ? "Erro no envio ao Bling" : "No Bling · aguardando NF"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-words">
        {erro ? blingEnvioErro : `Enviado ao Bling (id ${blingIdDestino}). Próximo passo: Eva gera e transmite a NF no Bling.`}
      </TooltipContent>
    </Tooltip>;
  }
  if (!estagio) return <span className="text-sm text-muted-foreground">—</span>;
  if (estagio in ESTAGIO_LABELS) return <EstagioBadge estagio={estagio as EstagioPedido} />;
  return <Badge variant="outline">{estagio}</Badge>;
}