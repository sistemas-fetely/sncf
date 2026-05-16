import { Badge } from "@/components/ui/badge";
import { calcularDiasVencimento } from "@/hooks/useContaWorkflow";

interface Props {
  dataVencimento: string | null;
  status: string;
}

export default function VencimentoBadge({ dataVencimento, status }: Props) {
  if (status === "finalizado" || status === "cancelado" || status === "enviado_para_pagamento" || status === "conciliado") return null;
  const diff = calcularDiasVencimento(dataVencimento);
  if (diff === null) return null;

  if (diff < 0) {
    return (
      <Badge variant="destructive" className="text-[10px] py-0 px-1.5 ml-1">
        {Math.abs(diff)}d atrasado
      </Badge>
    );
  }
  if (diff === 0) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px] py-0 px-1.5 ml-1">
        Vence hoje!
      </Badge>
    );
  }
  if (diff <= 3) {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] py-0 px-1.5 ml-1">
        {diff}d
      </Badge>
    );
  }
  if (diff <= 7) {
    return (
      <Badge className="bg-yellow-50 text-yellow-700 hover:bg-yellow-50 text-[10px] py-0 px-1.5 ml-1">
        {diff}d
      </Badge>
    );
  }
  return null;
}
