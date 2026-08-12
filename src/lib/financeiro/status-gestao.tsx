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
  a_vencer: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  vence_hoje: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  atrasado: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  aguarda_liquidacao: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  pago: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  pago_com_atraso: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  pago_judicial: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
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
