import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Rótulos e tons de `status_gestao` (view vw_titulos_cobranca).
 * `devolvido` e `baixado_por_perda` são TERMINAIS e NÃO são inadimplência —
 * tom neutro, nunca vermelho.
 */
export const STATUS_GESTAO_LABEL: Record<string, string> = {
  a_vencer: "A vencer",
  vence_hoje: "Vence hoje",
  atrasado: "Atrasado",
  aguarda_liquidacao: "Aguarda liquidação",
  pago: "Pago",
  pago_com_atraso: "Pago c/ atraso",
  pago_judicial: "Pago (judicial)",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
  baixado_por_perda: "Baixado por perda",
};

const STATUS_GESTAO_COR: Record<string, string> = {
  a_vencer: "bg-info/10 text-info",
  vence_hoje: "bg-warning/10 text-warning",
  atrasado: "bg-destructive/10 text-destructive",
  aguarda_liquidacao: "bg-warning/10 text-warning",
  pago: "bg-success/10 text-success",
  pago_com_atraso: "bg-success/10 text-success",
  pago_judicial: "bg-success/10 text-success",
  cancelado: "bg-muted text-muted-foreground",
  devolvido: "bg-muted text-muted-foreground",
  baixado_por_perda: "bg-muted text-muted-foreground",
};

/** Nunca some: valor desconhecido aparece cru. */
export function rotuloStatusGestao(status: string | null | undefined): string {
  if (!status) return "—";
  return STATUS_GESTAO_LABEL[status] ?? status;
}

/** Terminais que não são dívida — fora de atraso/inadimplência. */
export const STATUS_GESTAO_ENCERRADOS = ["cancelado", "devolvido", "baixado_por_perda"];

export function BadgeStatusGestao({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px]",
        STATUS_GESTAO_COR[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {rotuloStatusGestao(status)}
    </Badge>
  );
}
