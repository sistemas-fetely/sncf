import { Card, CardContent } from "@/components/ui/card";
import { Undo2 } from "lucide-react";
import type { AnaliseTransicao } from "@/types/credito";

interface Props {
  transicoes: AnaliseTransicao[];
  estagioAtual: string;
}

export function BoxDevolucaoRecente({ transicoes, estagioAtual }: Props) {
  const devolucao = [...transicoes]
    .reverse()
    .find((t) => t.acao === "devolvido" && t.estagio_destino === estagioAtual);

  if (!devolucao) return null;

  return (
    <Card className="border-warning/40 bg-warning/10">
      <CardContent className="p-3 flex items-start gap-3">
        <Undo2 className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-warning">
            Análise devolvida pra este estágio
          </p>
          {devolucao.motivo && (
            <p className="text-sm text-warning italic">"{devolucao.motivo}"</p>
          )}
          <p className="text-xs text-warning">
            Em {new Date(devolucao.criado_em).toLocaleString("pt-BR")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
