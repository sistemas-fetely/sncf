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
    <Card className="border-orange-300 bg-orange-50">
      <CardContent className="p-3 flex items-start gap-3">
        <Undo2 className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-orange-900">
            Análise devolvida pra este estágio
          </p>
          {devolucao.motivo && (
            <p className="text-sm text-orange-800 italic">"{devolucao.motivo}"</p>
          )}
          <p className="text-xs text-orange-700">
            Em {new Date(devolucao.criado_em).toLocaleString("pt-BR")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
