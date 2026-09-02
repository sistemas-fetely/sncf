import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatusCprMeta } from "@/lib/financeiro/status-cpr";

/**
 * Barra de progresso do TÍTULO A PAGAR.
 *
 * TRANSITÓRIO (02/09/2026): os fluxos abaixo espelham `titulo_pagar_estado_dim`
 * na mão. A reforma ESTADO × PROVAS troca isto por um hook que lê a dimensão
 * (rótulo, cor e ordem vêm do banco — "opção A: o banco manda").
 * Enquanto isso, manter em sincronia com a tabela.
 */

// Família A (não-cartão): trilho completo
const FLOW_PADRAO = [
  { key: "aberto", label: "A aprovar" },
  { key: "aprovado", label: "Aprovado" },
  { key: "programado", label: "Programado" },
  { key: "pago", label: "Pago" },
  { key: "conciliado", label: "Provado" },
] as const;

// Família B (cartão): paga via fatura mensal.
// `aprovado` está aqui porque é onde 88 títulos de cartão realmente estão hoje
// (02/09/2026) — o meio manda pular aprovação, mas ninguém os move. Omitir o
// passo faria findIndex devolver -1 e a barra renderizar vazia para todos eles.
const FLOW_CARTAO = [
  { key: "aberto", label: "A aprovar" },
  { key: "aprovado", label: "Aprovado" },
  { key: "pago", label: "Pago" },
  { key: "conciliado", label: "Provado" },
] as const;

/** Estados fora da linha: não têm posição no trilho, mostram badge próprio. */
const FORA_DO_TRILHO = ["cancelado", "contestado"];

/**
 * Aposentados: existem no CHECK e ainda têm produtores vivos (Fatia 1c).
 * Mapeados para a posição mais próxima só para a barra não quebrar.
 */
const POSICAO_APOSENTADO: Record<string, string> = {
  enviado_para_pagamento: "programado",
  doc_pendente: "aberto",
  previsto: "aberto",
  // legado de código velho — não deveria chegar aqui
  agendado: "programado",
  rascunho: "aberto",
  atrasado: "aberto",
};

interface Props {
  statusAtual: string;
  isCartao?: boolean;
}

export default function StatusProgressBar({ statusAtual, isCartao }: Props) {
  if (FORA_DO_TRILHO.includes(statusAtual)) {
    const meta = getStatusCprMeta(statusAtual);
    return (
      <div className="flex justify-center py-2">
        <Badge variant="outline" className={meta.className}>
          {meta.label}
        </Badge>
      </div>
    );
  }

  const FLOW = isCartao ? FLOW_CARTAO : FLOW_PADRAO;

  const statusEffective = POSICAO_APOSENTADO[statusAtual] ?? statusAtual;
  const idxEncontrado = FLOW.findIndex((s) => s.key === statusEffective);
  // FAIL-SOFT: status fora deste fluxo (ex.: novo estado ainda não mapeado)
  // cai na posição 0 em vez de deixar a barra inteira apagada.
  const idxAtual = idxEncontrado === -1 ? 0 : idxEncontrado;

  return (
    <div className="flex items-center gap-1 w-full">
      {FLOW.map((step, idx) => {
        const isAtivo = idx <= idxAtual;
        const isAtual = step.key === statusEffective;

        return (
          <div key={step.key} className="flex flex-col items-center flex-1 min-w-0">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={cn("h-0.5 flex-1 -ml-1 -mr-1", isAtivo ? "bg-admin" : "bg-muted")} />
              )}
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-medium border-2 transition-colors",
                  isAtivo
                    ? "bg-admin border-admin text-admin-foreground"
                    : "bg-background border-muted text-muted-foreground",
                  isAtual && "ring-2 ring-admin/30",
                )}
              >
                {isAtivo && idx < idxAtual ? <Check className="h-3 w-3" /> : idx + 1}
              </div>
              {idx < FLOW.length - 1 && (
                <div className={cn("h-0.5 flex-1 -ml-1 -mr-1", idx < idxAtual ? "bg-admin" : "bg-muted")} />
              )}
            </div>
            <span
              className={cn(
                "text-[10px] mt-1 truncate w-full text-center",
                isAtual ? "text-admin font-medium" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
