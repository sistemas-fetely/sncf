import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Eixo prova: onde está o DINHEIRO. */
export type EixoProva = "registrado" | "compensado" | "conciliado" | "devolvido" | "cancelado";

/** Eixo prazo: onde está o CLIENTE em relação ao vencimento. */
export type EixoPrazo = "a_vencer" | "vence_hoje" | "vencido";

export const PROVA_META: Record<
  EixoProva,
  { label: string; ordem: number; classe: string | null; tooltip: string | null }
> = {
  registrado: {
    label: "Registrado",
    ordem: 1,
    classe: null,
    tooltip: "Título existe, ninguém quitou, nada caiu.",
  },
  compensado: {
    label: "Compensado",
    ordem: 2,
    classe: "bg-amber-100 text-amber-800 border-0",
    tooltip:
      "O pagador quitou. O dinheiro ainda não está provado na nossa conta — em cartão está no adquirente.",
  },
  conciliado: {
    label: "Conciliado",
    ordem: 3,
    classe: "bg-emerald-100 text-emerald-800 border-0",
    tooltip: "O dinheiro está na conta e a linha do extrato está vinculada ao título.",
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

export const PRAZO_META: Record<EixoPrazo, { label: string; ordem: number; classe: string | null }> =
  {
    a_vencer: { label: "A vencer", ordem: 1, classe: null },
    vence_hoje: { label: "Vence hoje", ordem: 2, classe: "bg-sky-100 text-sky-800 border-0" },
    vencido: { label: "Vencido", ordem: 3, classe: "bg-amber-100 text-amber-800 border-0" },
  };

export const PROVAS: EixoProva[] = [
  "registrado",
  "compensado",
  "conciliado",
  "devolvido",
  "cancelado",
];
export const PRAZOS: EixoPrazo[] = ["a_vencer", "vence_hoje", "vencido"];
export const PROVA_FORA_KPI: EixoProva[] = ["devolvido", "cancelado"];

/** Badge do eixo prova, com o qualificador "por banco"/"por baixa manual". */
export function BadgeProva({
  eixo,
  compensadoPor,
}: {
  eixo: EixoProva | null;
  compensadoPor?: "banco" | "manual" | null;
}) {
  const meta = eixo ? PROVA_META[eixo] : null;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  const badge = meta.classe ? (
    <Badge className={`${meta.classe} ${meta.tooltip ? "cursor-help" : ""}`}>{meta.label}</Badge>
  ) : (
    <Badge variant="outline" className={meta.tooltip ? "cursor-help" : ""}>
      {meta.label}
    </Badge>
  );
  return (
    <div>
      {meta.tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{badge}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">{meta.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        badge
      )}
      {eixo === "compensado" && compensadoPor && (
        <div className="text-xs text-muted-foreground">
          {compensadoPor === "banco" ? "por banco" : "por baixa manual"}
        </div>
      )}
    </div>
  );
}

/** Badge do eixo prazo, com marca de inadimplência quando aplicável. */
export function BadgePrazo({
  eixo,
  inadimplente,
}: {
  eixo: EixoPrazo | null;
  inadimplente?: boolean;
}) {
  const meta = eixo ? PRAZO_META[eixo] : null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {meta ? (
        meta.classe ? (
          <Badge className={meta.classe}>{meta.label}</Badge>
        ) : (
          <Badge variant="outline">{meta.label}</Badge>
        )
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
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
            <p className="max-w-xs">Vencido, ninguém quitou, e a forma não é garantida.</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
