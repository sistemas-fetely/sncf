import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Eixo prova: a VENDA foi validada no banco? */
export type EixoProva = "registrado" | "conciliado" | "devolvido" | "cancelado";

/** Eixo status: onde está o dinheiro DESTA parcela. */
export type EixoStatus = "a_vencer" | "pago" | "compensado" | "devolvido" | "cancelado";

export const PROVA_META: Record<
  EixoProva,
  { label: string; ordem: number; classe: string | null; tooltip: string | null }
> = {
  registrado: {
    label: "Registrado",
    ordem: 1,
    classe: null,
    tooltip: "Materializado do pedido. A venda não foi validada no banco.",
  },
  conciliado: {
    label: "Conciliado",
    ordem: 2,
    classe: "bg-emerald-100 text-emerald-800 border-0",
    tooltip:
      "A venda foi validada no banco pelo mecanismo de conciliação. Em cartão, um NSU casado vale para todas as parcelas.",
  },
  devolvido: {
    label: "Devolvido",
    ordem: 3,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: null,
  },
  cancelado: {
    label: "Cancelado",
    ordem: 4,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: null,
  },
};

export const STATUS_META: Record<
  EixoStatus,
  { label: string; ordem: number; classe: string | null; tooltip: string | null }
> = {
  a_vencer: {
    label: "A vencer",
    ordem: 1,
    classe: null,
    tooltip: "Ainda não houve baixa.",
  },
  pago: {
    label: "Pago",
    ordem: 2,
    classe: "bg-amber-100 text-amber-800 border-0",
    tooltip:
      "Baixa dada, sem confirmação bancária desta parcela. O pagador quitou; o dinheiro pode estar no adquirente.",
  },
  compensado: {
    label: "Compensado",
    ordem: 3,
    classe: "bg-emerald-100 text-emerald-800 border-0",
    tooltip: "O dinheiro desta parcela está no banco, confirmado.",
  },
  devolvido: {
    label: "Devolvido",
    ordem: 4,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: null,
  },
  cancelado: {
    label: "Cancelado",
    ordem: 5,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: null,
  },
};

export const PROVAS: EixoProva[] = ["registrado", "conciliado", "devolvido", "cancelado"];
export const STATUS_EIXOS: EixoStatus[] = [
  "a_vencer",
  "pago",
  "compensado",
  "devolvido",
  "cancelado",
];

/** Encerramento não entra em KPI. */
export const PROVA_FORA_KPI: EixoProva[] = ["devolvido", "cancelado"];
export const STATUS_FORA_KPI: EixoStatus[] = ["devolvido", "cancelado"];

function BadgeComMeta({
  meta,
}: {
  meta: { label: string; classe: string | null; tooltip: string | null };
}) {
  const badge = meta.classe ? (
    <Badge className={`${meta.classe} ${meta.tooltip ? "cursor-help" : ""}`}>{meta.label}</Badge>
  ) : (
    <Badge variant="outline" className={meta.tooltip ? "cursor-help" : ""}>
      {meta.label}
    </Badge>
  );
  if (!meta.tooltip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{meta.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Badge do eixo prova: a venda foi validada no banco? */
export function BadgeProva({ eixo }: { eixo: EixoProva | null }) {
  const meta = eixo ? PROVA_META[eixo] : null;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  return <BadgeComMeta meta={meta} />;
}

/** Badge do eixo status: onde está o dinheiro desta parcela. */
export function BadgeStatus({
  eixo,
  compensadoPor,
  inadimplente,
}: {
  eixo: EixoStatus | null;
  compensadoPor?: "banco" | "manual" | null;
  inadimplente?: boolean;
}) {
  const meta = eixo ? STATUS_META[eixo] : null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {meta ? <BadgeComMeta meta={meta} /> : <span className="text-muted-foreground">—</span>}
        {inadimplente && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Badge variant="destructive" className="cursor-help">
                  Inadimplente
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Sem baixa, vencimento no passado, e a forma não é garantida.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {eixo === "compensado" && compensadoPor && (
        <div className="text-xs text-muted-foreground">
          {compensadoPor === "banco" ? "por banco" : "por baixa manual"}
        </div>
      )}
    </div>
  );
}
