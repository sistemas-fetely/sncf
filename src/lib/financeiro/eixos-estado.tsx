import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** @deprecated use EixoInstrumento */
export type EixoProva = "registrado" | "conciliado" | "devolvido" | "cancelado";

/** @deprecated use EixoRecebimento (o valor "a_vencer" aqui significava "não recebido") */
export type EixoStatus = "a_vencer" | "pago" | "compensado" | "devolvido" | "cancelado";

/** O dinheiro chegou? */
export type EixoRecebimento =
  | "em_aberto"
  | "quitado"
  | "compensado"
  | "cancelado"
  | "devolvido";

/** Qual a relação com a data? */
export type EixoPrazo = "a_vencer" | "vence_hoje" | "vencido";

/** Qual a prova? */
export type EixoInstrumento =
  | "sem_instrumento"
  | "registrado"
  | "remessa_gerada"
  | "baixa_solicitada"
  | "liquidado_banco"
  | "conciliado";

type EixoMeta = { label: string; ordem: number; classe: string | null; tooltip: string | null };

export const RECEBIMENTO_META: Record<EixoRecebimento, EixoMeta> = {
  em_aberto: {
    label: "Em aberto",
    ordem: 1,
    classe: "bg-amber-100 text-amber-800 border-0",
    tooltip: "O dinheiro ainda não chegou.",
  },
  quitado: {
    label: "Quitado",
    ordem: 2,
    classe: "bg-emerald-100 text-emerald-800 border-0",
    tooltip: "O cliente pagou; aguarda compensação bancária.",
  },
  compensado: {
    label: "Compensado",
    ordem: 3,
    classe: "bg-emerald-700 text-white border-0",
    tooltip: "O dinheiro está no banco, confirmado.",
  },
  cancelado: {
    label: "Cancelado",
    ordem: 4,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: null,
  },
  devolvido: {
    label: "Devolvido",
    ordem: 5,
    classe: "bg-purple-100 text-purple-800 border-0",
    tooltip: null,
  },
};

export const PRAZO_META: Record<EixoPrazo, EixoMeta> = {
  a_vencer: { label: "A vencer", ordem: 1, classe: null, tooltip: null },
  vence_hoje: {
    label: "Vence hoje",
    ordem: 2,
    classe: "bg-amber-100 text-amber-800 border-0",
    tooltip: null,
  },
  vencido: {
    label: "Vencido",
    ordem: 3,
    classe: "bg-red-100 text-red-800 border-0",
    tooltip: null,
  },
};

/** Cor do texto por prazo — para colunas de data (sem chip). */
export const PRAZO_CLASSE_TEXTO: Record<EixoPrazo, string> = {
  a_vencer: "",
  vence_hoje: "text-amber-700 font-medium",
  vencido: "text-red-700 font-medium",
};

export const INSTRUMENTO_META: Record<EixoInstrumento, EixoMeta> = {
  sem_instrumento: {
    label: "Sem instrumento",
    ordem: 1,
    classe: "bg-muted text-muted-foreground border-0",
    tooltip: "Nenhum instrumento de cobrança emitido.",
  },
  registrado: {
    label: "Registrado",
    ordem: 2,
    classe: null,
    tooltip: "Instrumento registrado no banco.",
  },
  remessa_gerada: {
    label: "Remessa gerada",
    ordem: 3,
    classe: "bg-sky-100 text-sky-800 border-0",
    tooltip: "Remessa enviada ao banco.",
  },
  baixa_solicitada: {
    label: "Baixa solicitada",
    ordem: 4,
    classe: "bg-amber-100 text-amber-800 border-0",
    tooltip: "Baixa pedida ao banco, ainda sem retorno.",
  },
  liquidado_banco: {
    label: "Liquidado no banco",
    ordem: 5,
    classe: "bg-emerald-100 text-emerald-800 border-0",
    tooltip: "O banco confirmou a liquidação do instrumento.",
  },
  conciliado: {
    label: "Conciliado",
    ordem: 6,
    classe: "bg-emerald-700 text-white border-0",
    tooltip: "Instrumento conferido contra o extrato.",
  },
};

export const RECEBIMENTO_EIXOS: EixoRecebimento[] = [
  "em_aberto", "quitado", "compensado", "cancelado", "devolvido",
];
export const PRAZO_EIXOS: EixoPrazo[] = ["a_vencer", "vence_hoje", "vencido"];
export const INSTRUMENTO_EIXOS: EixoInstrumento[] = [
  "sem_instrumento", "registrado", "remessa_gerada", "baixa_solicitada",
  "liquidado_banco", "conciliado",
];

/** @deprecated */

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

/** @deprecated use RECEBIMENTO_META */
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

/** Selo derivado. Só aparece quando eh_inadimplente === true. */
export function SeloInadimplente() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Badge variant="destructive" className="cursor-help">Inadimplente</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">Em aberto, vencido, e a forma de pagamento não é garantida.</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Eixo recebimento: o dinheiro chegou? UM-EIXO-UM-CHIP. */
export function BadgeRecebimento({
  eixo,
  compensadoPor,
}: {
  eixo: EixoRecebimento | null;
  compensadoPor?: "banco" | "manual" | null;
}) {
  const meta = eixo ? RECEBIMENTO_META[eixo] : null;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <BadgeComMeta meta={meta} />
      {eixo === "compensado" && compensadoPor && (
        <div className="text-xs text-muted-foreground">
          {compensadoPor === "banco" ? "por banco" : "por baixa manual"}
        </div>
      )}
    </div>
  );
}

/** Eixo prazo: relação com a data. */
export function BadgePrazo({ eixo }: { eixo: EixoPrazo | null }) {
  const meta = eixo ? PRAZO_META[eixo] : null;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  return <BadgeComMeta meta={meta} />;
}

/** Eixo instrumento: qual a prova? */
export function BadgeInstrumento({ eixo }: { eixo: EixoInstrumento | null }) {
  const meta = eixo ? INSTRUMENTO_META[eixo] : null;
  if (!meta) return <span className="text-muted-foreground">—</span>;
  return <BadgeComMeta meta={meta} />;
}
