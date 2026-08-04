import { AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { KpiFinanceiro } from "@/types/credito";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  kpis: KpiFinanceiro | null;
}

/**
 * Aviso de recebível espelhado do Bling sem título no SNCF.
 *
 * Contexto: o sync do Bling mantém linhas em `contas_pagar_receber` que nunca
 * recebem baixa (a baixa acontece em `titulo_a_receber`). Essas linhas ficaram
 * FORA dos KPIs principais de propósito — não são prova de nada. Mas também não
 * podem ficar invisíveis para quem está decidindo crédito.
 *
 * Não renderiza nada quando não há resíduo.
 */
export function AvisoResiduoBling({ kpis }: Props) {
  const qtd = kpis?.qtd_bling_sem_titulo ?? 0;
  if (!kpis || qtd <= 0) return null;

  const aberto = Number(kpis.em_aberto_bling_sem_titulo ?? 0);
  const vencido = Number(kpis.vencidos_bling_sem_titulo ?? 0);

  return (
    <>
      <Separator className="my-2" />
      <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2.5 dark:bg-amber-950/30 dark:border-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            {fmtBRL.format(aberto)} em recebível Bling sem título
          </p>
          <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-snug">
            {qtd} {qtd === 1 ? "linha" : "linhas"} espelhadas do Bling, sem contrapartida no SNCF
            {vencido > 0 ? ` · ${fmtBRL.format(vencido)} já vencido` : ""}. Não conferido — fora dos
            números acima.
          </p>
        </div>
      </div>
    </>
  );
}
