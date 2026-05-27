import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { AnaliseIaJson } from "@/types/credito";
import { cn } from "@/lib/utils";

interface Props {
  iaJson: AnaliseIaJson | null;
  iaResumo: string | null;
  iaConfianca: number | null;
  iaProcessadaEm: string | null;
}

const DECISAO_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  aprovar: { label: "Aprovar", variant: "default" },
  aprovar_com_ressalva: { label: "Aprovar com ressalva", variant: "secondary" },
  reprovar: { label: "Reprovar", variant: "destructive" },
  devolver_analise: { label: "Devolver pra Análise", variant: "outline" },
  devolver_entrada: { label: "Devolver pra Entrada", variant: "outline" },
};

export function PainelIaConsolidado({
  iaJson,
  iaResumo,
  iaConfianca,
  iaProcessadaEm,
}: Props) {
  const [justOpen, setJustOpen] = useState(false);

  if (!iaJson || !iaProcessadaEm) {
    return (
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Análise IA não foi gerada</p>
            <p className="text-sm text-muted-foreground">
              Devolva esta análise pra estágio Análise pra que o time complete o trabalho.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const conf = iaConfianca ?? 0;
  const corConf =
    conf >= 85
      ? "bg-green-600"
      : conf >= 70
      ? "bg-blue-600"
      : conf >= 50
      ? "bg-amber-600"
      : "bg-red-600";
  const labelConf =
    conf >= 85
      ? "Alta — caso claro"
      : conf >= 70
      ? "Boa — sugestão padrão"
      : conf >= 50
      ? "Moderada — sinais conflitantes"
      : "Baixa — discussão recomendada";

  const decisao = DECISAO_LABELS[iaJson.decisao_sugerida] || {
    label: iaJson.decisao_sugerida,
    variant: "outline" as const,
  };

  return (
    <Card className="border-primary/40 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Análise IA
          </CardTitle>
          <Badge variant={decisao.variant} className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Sugere: {decisao.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Confiança da IA</span>
            <span className="font-medium">
              {conf}% · {labelConf}
            </span>
          </div>
          <Progress value={conf} className="h-2" indicatorClassName={corConf} />
        </div>

        {iaResumo && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Resumo
            </p>
            <p className="text-sm leading-relaxed">{iaResumo}</p>
          </div>
        )}

        {iaJson.pontos_atencao && iaJson.pontos_atencao.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Pontos de atenção
            </p>
            <ul className="space-y-1.5">
              {iaJson.pontos_atencao.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Collapsible open={justOpen} onOpenChange={setJustOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                justOpen && "rotate-180",
              )}
            />
            {justOpen ? "Ocultar justificativa" : "Ver justificativa completa"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-md p-3">
              {iaJson.justificativa}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <p className="text-xs text-muted-foreground pt-1 border-t">
          Processado em {new Date(iaProcessadaEm).toLocaleString("pt-BR")}
          {iaJson._modelo && ` · Modelo: ${iaJson._modelo}`}
        </p>
      </CardContent>
    </Card>
  );
}
