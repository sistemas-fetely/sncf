import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCw, Loader2, AlertCircle } from "lucide-react";
import { useGerarAnaliseIA } from "@/hooks/credito/useGerarAnaliseIA";
import type { AnaliseIaJson } from "@/types/credito";

interface Props {
  analise_id: string;
  scoresCount: number;
  iaJson: AnaliseIaJson | null;
  iaResumo: string | null;
  iaConfianca: number | null;
  iaProcessadaEm: string | null;
}

export function AnaliseIaCard({
  analise_id,
  scoresCount,
  iaJson,
  iaResumo,
  iaConfianca,
  iaProcessadaEm,
}: Props) {
  const gerarIA = useGerarAnaliseIA();
  const podeGerar = scoresCount > 0;
  const jaTemAnalise = !!iaProcessadaEm;

  const handleGerar = () => {
    gerarIA.mutate(analise_id);
  };

  const corConfianca =
    iaConfianca == null
      ? ""
      : iaConfianca >= 85
      ? "text-green-700 border-green-500"
      : iaConfianca >= 70
      ? "text-blue-700 border-blue-500"
      : iaConfianca >= 50
      ? "text-amber-700 border-amber-500"
      : "text-red-700 border-red-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Análise IA
        </CardTitle>
        {jaTemAnalise && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={handleGerar}
            disabled={gerarIA.isPending}
          >
            {gerarIA.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCw className="h-3.5 w-3.5" />
            )}
            Reprocessar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!podeGerar && !jaTemAnalise && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Anexe pelo menos um bureau (Serasa ou Boa Vista) para gerar a análise.</span>
          </div>
        )}

        {podeGerar && !jaTemAnalise && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bureaus prontos. Gere a análise consolidada — a IA monta o resumo, pontos de
              atenção e sugestão de decisão para o Joseph.
            </p>
            <Button onClick={handleGerar} disabled={gerarIA.isPending} className="gap-2">
              {gerarIA.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {gerarIA.isPending ? "Processando..." : "Gerar Análise IA"}
            </Button>
          </div>
        )}

        {jaTemAnalise && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={corConfianca}>
                Confiança: {iaConfianca}%
              </Badge>
              {iaJson?.decisao_sugerida && (
                <Badge variant="secondary">
                  Sugestão: {iaJson.decisao_sugerida.replace(/_/g, " ")}
                </Badge>
              )}
            </div>

            {iaResumo && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Resumo
                </p>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{iaResumo}</p>
              </div>
            )}

            {iaJson?.pontos_atencao && iaJson.pontos_atencao.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Pontos de atenção
                </p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {iaJson.pontos_atencao.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {iaJson?.sugestao && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Sugestão estruturada
                </p>
                <div className="text-sm space-y-0.5 bg-muted/50 rounded-md p-3">
                  <p><span className="text-muted-foreground">Perfil:</span> {iaJson.sugestao.perfil_aplicado}</p>
                  <p><span className="text-muted-foreground">Limite:</span> R$ {iaJson.sugestao.limite_concedido?.toLocaleString("pt-BR")}</p>
                  <p><span className="text-muted-foreground">Prazo:</span> {iaJson.sugestao.prazo_max_dias} dias</p>
                  <p><span className="text-muted-foreground">Formas:</span> {iaJson.sugestao.formas_aceitas?.join(", ")}</p>
                </div>
                {iaJson.sugestao.parecer_final && (
                  <p className="text-sm italic mt-2 text-muted-foreground">
                    "{iaJson.sugestao.parecer_final}"
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Processado em {new Date(iaProcessadaEm!).toLocaleString("pt-BR")}
              {iaJson?._modelo && ` · Modelo: ${iaJson._modelo}`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
