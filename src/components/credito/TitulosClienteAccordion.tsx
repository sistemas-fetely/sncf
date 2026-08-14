import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { BadgeStatusGestao } from "@/lib/financeiro/status-gestao";
import { cn } from "@/lib/utils";
import type { TituloAnaliseCredito } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR") : "—";

const STATUS_ABERTO = ["a_vencer", "vence_hoje", "atrasado", "aguarda_liquidacao"];
const STATUS_PAGO = ["pago", "pago_com_atraso", "pago_judicial"];
const STATUS_ENCERRADO = ["baixado_por_perda", "devolvido"];

const dataLiquidacao = (t: TituloAnaliseCredito) =>
  t.data_liquidacao_real ?? t.data_pagamento_banco ?? t.data_pagamento ?? null;

function toDate(s: string): Date {
  return new Date(s.length === 10 ? s + "T00:00:00" : s);
}

function atrasoDias(t: TituloAnaliseCredito): number {
  const liq = dataLiquidacao(t);
  if (!liq || !t.data_vencimento_original) return 0;
  const diff = Math.floor(
    (toDate(liq).getTime() - toDate(t.data_vencimento_original).getTime()) / 86400000,
  );
  return diff > 0 ? diff : 0;
}

interface Props {
  titulos: TituloAnaliseCredito[];
}

export function TitulosClienteAccordion({ titulos }: Props) {
  if (titulos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic px-1">
        Cliente sem títulos emitidos. Nenhum faturamento até agora.
      </p>
    );
  }

  const limite = Date.now() - 365 * 86400000;

  const encerrados = titulos.filter(
    (t) =>
      STATUS_ENCERRADO.includes(t.status_gestao) ||
      t.titulo_renegociado_origem_id != null ||
      t.modalidade_renegociacao != null,
  );
  const idsEncerrados = new Set(encerrados.map((t) => t.id));

  const abertos = titulos.filter(
    (t) => !idsEncerrados.has(t.id) && STATUS_ABERTO.includes(t.status_gestao),
  );

  const pagos = titulos.filter((t) => {
    if (idsEncerrados.has(t.id)) return false;
    if (!STATUS_PAGO.includes(t.status_gestao)) return false;
    const liq = dataLiquidacao(t);
    if (!liq) return true;
    return toDate(liq).getTime() >= limite;
  });

  const somaAberto = abertos.reduce((acc, t) => acc + Number(t.valor_efetivo || 0), 0);
  const maiorAtraso = pagos.reduce((acc, t) => Math.max(acc, atrasoDias(t)), 0);
  const temAtrasado = titulos.some((t) => t.status_gestao === "atrasado");

  const partes = [
    `${abertos.length} em aberto`,
    fmtBRL.format(somaAberto),
    `${pagos.length} pagos`,
  ];
  if (maiorAtraso > 0) partes.push(`maior atraso ${maiorAtraso}d`);
  if (encerrados.length > 0) partes.push(`${encerrados.length} encerrados`);

  const variantBadge = temAtrasado || encerrados.length > 0 ? "destructive" : "secondary";

  const renderLinha = (t: TituloAnaliseCredito, cicatriz = false) => {
    const pago = STATUS_PAGO.includes(t.status_gestao);
    const liq = dataLiquidacao(t);
    const atraso = atrasoDias(t);
    const prorrogado =
      t.data_vencimento_atual !== t.data_vencimento_original;

    return (
      <div
        key={t.id}
        className={cn(
          "flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-2",
          cicatriz && "border-destructive/50",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={cn("font-medium", cicatriz && "text-destructive")}>
            {t.numero_titulo}
          </span>
          <span className="text-xs text-muted-foreground">
            {t.numero_parcela}/{t.total_parcelas}
          </span>
          {t.pedido_id_externo ? (
            <Link
              to={`/pedidos/${t.pedido_id}`}
              className="text-xs underline underline-offset-2 hover:no-underline"
            >
              {t.pedido_id_externo}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {t.nf_numero ? (
            <span className="text-xs text-muted-foreground">NF {t.nf_numero}</span>
          ) : (
            <span className="text-xs text-amber-600">sem NF</span>
          )}
          <span className="text-xs text-muted-foreground">{t.tipo_pagamento}</span>
          <span className="text-xs">
            venc. {fmtDate(t.data_vencimento_atual)}
            {prorrogado && (
              <span className="text-xs text-muted-foreground"> (prorrogado)</span>
            )}
          </span>
          {pago && (
            <span className="text-xs text-muted-foreground">
              liq. {fmtDate(liq)}{" "}
              {atraso > 0 ? (
                <span className="text-destructive">+{atraso}d</span>
              ) : (
                <span className="text-emerald-600">em dia</span>
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

  return (
    <Accordion type="single" collapsible defaultValue="titulos" className="border rounded-lg">
      <AccordionItem value="titulos" className="border-b-0">
        <AccordionTrigger className="px-4 hover:no-underline">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="font-medium">Títulos do cliente</span>
            <Badge variant={variantBadge} className="ml-1">
              {partes.join(" · ")}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 space-y-4">
          {abertos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Em aberto
              </p>
              <div className="space-y-1.5">{abertos.map((t) => renderLinha(t))}</div>
            </div>
          )}

          {pagos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pagos (últimos 12 meses)
              </p>
              <div className="space-y-1.5">{pagos.map((t) => renderLinha(t))}</div>
            </div>
          )}

          {encerrados.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                Encerrados / cicatriz
              </p>
              <div className="space-y-1.5">{encerrados.map((t) => renderLinha(t, true))}</div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
