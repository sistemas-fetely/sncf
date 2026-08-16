import { Badge } from "@/components/ui/badge";

export type NaturezaRemuneracao =
  | "salario_clt"
  | "pro_labore"
  | "distribuicao_lucros"
  | "pagamento_pj"
  | "bonus"
  | "comissao";

const CONFIG: Record<NaturezaRemuneracao, { label: string; className: string }> = {
  salario_clt: {
    label: "CLT",
    className: "bg-info/10 text-info border-info/20",
  },
  pro_labore: {
    label: "Pró-labore",
    className: "bg-info text-info border-info/40",
  },
  distribuicao_lucros: {
    label: "Distribuição",
    className: "bg-success/10 text-success border-success/20",
  },
  pagamento_pj: {
    label: "PJ",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  bonus: {
    label: "Bônus",
    className: "bg-warning text-warning border-warning/40",
  },
  comissao: {
    label: "Comissão",
    className: "bg-info text-info border-info/40",
  },
};

interface Props {
  natureza: NaturezaRemuneracao | string;
  className?: string;
}

export function NaturezaRemuneracaoBadge({ natureza, className }: Props) {
  const cfg = CONFIG[natureza as NaturezaRemuneracao];
  if (!cfg) {
    return (
      <Badge variant="outline" className={className}>
        {natureza}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`${cfg.className} ${className ?? ""}`}>
      {cfg.label}
    </Badge>
  );
}
