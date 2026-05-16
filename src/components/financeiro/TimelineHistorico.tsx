import { useHistoricoConta } from "@/hooks/useContaWorkflow";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Circle } from "lucide-react";

interface Props {
  contaId: string;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aberto: "Aberto",
  atrasado: "Atrasado",
  aprovado: "Aprovado",
  agendado: "Enviado",
  enviado_para_pagamento: "Enviado para Pagamento",
  aguardando_pagamento: "Enviado para Pagamento",
  pago: "Pago",
  cancelado: "Cancelado",
  conciliado: "Conciliado",
};

export default function TimelineHistorico({ contaId }: Props) {
  const { data: historico, isLoading } = useHistoricoConta(contaId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando histórico…</p>;
  }

  if (!historico || historico.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada</p>;
  }

  return (
    <div className="space-y-3">
      {historico.map((h) => {
        const lblAnt = h.status_anterior ? STATUS_LABEL[h.status_anterior] || h.status_anterior : null;
        const lblNovo = STATUS_LABEL[h.status_novo] || h.status_novo;
        return (
          <div key={h.id} className="flex gap-3 text-xs">
            <Circle className="h-2 w-2 fill-admin text-admin mt-1.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">
                {lblAnt ? `${lblAnt} → ${lblNovo}` : lblNovo}
              </p>
              {h.observacao && (
                <p className="text-muted-foreground break-words">{h.observacao}</p>
              )}
              <p className="text-muted-foreground text-[10px]">
                {formatDistanceToNow(new Date(h.created_at), { locale: ptBR, addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
