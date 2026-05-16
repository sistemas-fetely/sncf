import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Família A (não-cartão): fluxo completo com aprovação, doc pendente e aguardando pagamento
const FLOW_PADRAO = [
  { key: "aberto", label: "Aberto" },
  { key: "aprovado", label: "Aprovado" },
  { key: "doc_pendente", label: "Doc. Pendente" },
  { key: "enviado_para_pagamento", label: "Aguardando" },
  { key: "finalizado", label: "Finalizado" },
] as const;

// Família B (cartão): pula aprovação e doc pendente — paga via fatura mensal
const FLOW_CARTAO = [
  { key: "aberto", label: "Aberto" },
  { key: "enviado_para_pagamento", label: "Aguardando" },
  { key: "finalizado", label: "Finalizado" },
] as const;

interface Props {
  statusAtual: string;
  isCartao?: boolean;
}

export default function StatusProgressBar({ statusAtual, isCartao }: Props) {
  if (statusAtual === "cancelado") {
    return (
      <div className="flex justify-center py-2">
        <Badge variant="outline" className="bg-gray-100 text-gray-700">Cancelado</Badge>
      </div>
    );
  }

  const FLOW = isCartao ? FLOW_CARTAO : FLOW_PADRAO;

  // Mapear status legados (de registros antigos) pro fluxo atual
  let statusEffective = statusAtual;
  if (statusAtual === "rascunho") statusEffective = "aberto";
  if (statusAtual === "agendado") statusEffective = "enviado_para_pagamento";
  if (["enviado_para_pagamento", "conciliado"].includes(statusAtual)) statusEffective = "finalizado";

  let idxAtual = FLOW.findIndex((s) => s.key === statusEffective);
  if (statusAtual === "atrasado") idxAtual = FLOW.findIndex((s) => s.key === "aberto");

  return (
    <div className="flex items-center gap-1 w-full">
      {FLOW.map((step, idx) => {
        const isAtivo = idx <= idxAtual;
        const isAtual =
          step.key === statusEffective ||
          (statusAtual === "atrasado" && step.key === "aberto");

        return (
          <div key={step.key} className="flex flex-col items-center flex-1 min-w-0">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 -ml-1 -mr-1",
                    isAtivo ? "bg-admin" : "bg-muted",
                  )}
                />
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
                {isAtivo && idx < idxAtual ? (
                  <Check className="h-3 w-3" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < FLOW.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 -ml-1 -mr-1",
                    idx < idxAtual ? "bg-admin" : "bg-muted",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-[10px] mt-1 truncate w-full text-center",
                isAtual ? "text-admin font-semibold" : "text-muted-foreground",
              )}
            >
              {statusAtual === "atrasado" && step.key === "aberto" ? "Atrasado" : step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
