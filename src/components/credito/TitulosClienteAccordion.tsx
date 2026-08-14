import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { BadgeStatusGestao } from "@/lib/financeiro/status-gestao";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { TituloCredito } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toDate = (s: string) => new Date(s.length === 10 ? s + "T00:00:00" : s);
const fmtDate = (s: string | null | undefined) =>
  s ? toDate(s).toLocaleDateString("pt-BR") : "—";

const EM_ABERTO = ["a_vencer", "vence_hoje", "atrasado", "aguarda_liquidacao"];
const PAGOS = ["pago", "pago_com_atraso", "pago_judicial"];
const CICATRIZ = ["baixado_por_perda", "devolvido"];

const liquidacao = (t: TituloCredito): string | null =>
  t.data_pagamento_banco ?? t.data_pagamento ?? null;

function atrasoDias(t: TituloCredito): number {
  const liq = liquidacao(t);
  if (!liq || !t.data_vencimento_atual) return 0;
  return Math.floor(
    (toDate(liq).getTime() - toDate(t.data_vencimento_atual).getTime()) / 86400000,
  );
}

function reprogramadoTexto(t: TituloCredito): string | null {
  if (t.data_vencimento_atual === t.data_vencimento_original) return null;
  const diff = Math.floor(
    (toDate(t.data_vencimento_atual).getTime() - toDate(t.data_vencimento_original).getTime()) /
      86400000,
  );
  const sinal = diff > 0 ? `+${diff}d` : `${diff}d`;
  return `Vencimento reprogramado: ${fmtDate(t.data_vencimento_original)} → ${fmtDate(t.data_vencimento_atual)} (${sinal})`;
}

const soma = (arr: TituloCredito[]) =>
  arr.reduce((acc, t) => acc + Number(t.valor_efetivo || 0), 0);

interface Props {
  titulos: TituloCredito[];
  emAbertoCard?: number | null;
}

export function TitulosClienteAccordion({ titulos, emAbertoCard }: Props) {
  if (titulos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic px-1">
        Cliente sem títulos emitidos.
      </p>
    );
  }

  const limite = Date.now() - 365 * 24 * 3600 * 1000;

  const abertos = titulos.filter((t) => EM_ABERTO.includes(t.status_gestao));
  const pagos = titulos.filter((t) => {
    if (!PAGOS.includes(t.status_gestao)) return false;
    const liq = liquidacao(t);
    if (!liq) return true;
    return toDate(liq).getTime() >= limite;
  });
  const cicatriz = titulos.filter((t) => CICATRIZ.includes(t.status_gestao));
  const cancelados = titulos.filter((t) => t.status_gestao === "cancelado");

  const somaAberto = soma(abertos);
  const maiorAtraso = pagos.reduce((acc, t) => Math.max(acc, atrasoDias(t)), 0);
  const temAtrasado = titulos.some((t) => t.status_gestao === "atrasado");
  const pagosReprogramados = pagos.some(
    (t) => t.data_vencimento_atual !== t.data_vencimento_original,
  );

  let resumo = `${abertos.length} em aberto · ${fmtBRL.format(somaAberto)} · ${pagos.length} pagos`;
  if (maiorAtraso > 0) resumo += ` · maior atraso ${maiorAtraso}d`;

  const variantBadge =
    temAtrasado || cicatriz.length > 0 ? ("destructive" as const) : ("secondary" as const);

  const divergencia =
    emAbertoCard != null && Math.abs(somaAberto - emAbertoCard) > 0.01;

  const renderLinha = (t: TituloCredito) => {
    const pago = PAGOS.includes(t.status_gestao);
    const liq = liquidacao(t);
    const atraso = atrasoDias(t);
    const reprogramado = t.data_vencimento_atual !== t.data_vencimento_original;
    const tooltipReprogramado = reprogramadoTexto(t);
    const renegociado =
      t.titulo_renegociado_origem_id !== null || t.modalidade_renegociacao !== null;
    const mostraParcela = t.total_parcelas !== null && t.total_parcelas > 1;

    return (
      <div
        key={t.id}
        className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-medium">{t.numero_titulo}</span>
          {mostraParcela && (
            <span className="text-xs text-muted-foreground">
              {t.numero_parcela}/{t.total_parcelas}
            </span>
          )}
          {t.pedido_id_externo ? (
            t.pedido_id ? (
              <Link
                to={`/pedidos/${t.pedido_id}`}
                className="text-xs underline underline-offset-2 hover:no-underline"
              >
                {t.pedido_id_externo}
              </Link>
            ) : (
              <span className="text-xs">{t.pedido_id_externo}</span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {t.nf_numero ? (
            <span className="text-xs text-muted-foreground">NF {t.nf_numero}</span>
          ) : (
            <span className="text-xs text-amber-600">sem NF</span>
          )}
          {t.tipo_pagamento && (
            <span className="text-xs text-muted-foreground">{t.tipo_pagamento}</span>
          )}
          <span className="text-xs">
            venc. {fmtDate(t.data_vencimento_atual)}
            {reprogramado && tooltipReprogramado && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="ml-1 cursor-help text-muted-foreground">↻</span>
                </TooltipTrigger>
                <TooltipContent>{tooltipReprogramado}</TooltipContent>
              </Tooltip>
            )}
          </span>
          {renegociado && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              renegociado
            </Badge>
          )}
          {pago && (
            <span className="text-xs text-muted-foreground">
              liq. {fmtDate(liq)}{" "}
              {atraso > 0 ? (
                <span className="text-destructive">+{atraso}d</span>
              ) : (
                <span className="text-muted-foreground">em dia</span>
              )}
              {reprogramado && tooltipReprogramado && (
                <span className="text-muted-foreground">
                  {" "}
                  (venc. reprogramado {fmtDate(t.data_vencimento_original)} →{" "}
                  {fmtDate(t.data_vencimento_atual)})
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="tabular-nums text-right">
            {fmtBRL.format(Number(t.valor_efetivo || 0))}
          </span>
          <BadgeStatusGestao status={t.status_gestao} />
        </div>
      </div>
    );
  };

  const renderSecao = (
    label: string,
    linhas: TituloCredito[],
    destaque = false,
    note?: ReactNode,
  ) =>
    linhas.length > 0 ? (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              destaque ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {label}
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmtBRL.format(soma(linhas))}
          </span>
        </div>
        {note}
        <div className="space-y-1.5">{linhas.map(renderLinha)}</div>
      </div>
    ) : null;

  return (
    <Accordion type="single" collapsible defaultValue="titulos" className="border rounded-lg">
      <AccordionItem value="titulos" className="border-b-0">
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="font-medium">Títulos do cliente</span>
            <Badge variant={variantBadge} className="ml-1">
              {resumo}
            </Badge>
            {cicatriz.length > 0 && (
              <Badge variant="destructive">
                {cicatriz.length} cicatriz · {fmtBRL.format(soma(cicatriz))}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 space-y-4">
          {renderSecao("Em aberto", abertos)}
          {renderSecao(
            "Pagos (últimos 12 meses)",
            pagos,
            false,
            pagosReprogramados ? (
              <p className="text-xs text-muted-foreground">
                Atraso medido contra o vencimento vigente, igual ao badge de status.
              </p>
            ) : undefined,
          )}
          {renderSecao("Encerrados / cicatriz", cicatriz, true)}

          {divergencia && (
            <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/50 rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Divergência: lista soma {fmtBRL.format(somaAberto)} e o card indica{" "}
                {fmtBRL.format(emAbertoCard as number)}. Avise o time de sistemas.
              </span>
            </div>
          )}

          {cancelados.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {cancelados.length} títulos cancelados não listados.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
