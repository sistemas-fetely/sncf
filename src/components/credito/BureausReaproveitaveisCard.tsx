import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileSearch, Loader2, RefreshCw } from "lucide-react";
import { useReaproveitarBureaus } from "@/hooks/credito/useReaproveitarBureaus";
import { useGerarAnaliseIA } from "@/hooks/credito/useGerarAnaliseIA";
import type { BureauReaproveitavel } from "@/types/credito";

const fmtDate = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("pt-BR");

interface Props {
  bureaus: BureauReaproveitavel[];
  analiseId: string;
  parceiroId: string;
}

export function BureausReaproveitaveisCard({ bureaus, analiseId, parceiroId }: Props) {
  const [selecionados, setSelecionados] = useState<string[]>(() => bureaus.map((b) => b.id));
  const reaproveitar = useReaproveitarBureaus();
  const gerarIA = useGerarAnaliseIA();

  if (bureaus.length === 0) return null;

  const ocupado = reaproveitar.isPending || gerarIA.isPending;

  const toggle = (id: string) =>
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleUsar = async () => {
    const escolhidos = bureaus.filter((b) => selecionados.includes(b.id));
    if (!escolhidos.length) return;
    await reaproveitar.mutateAsync({ analiseId, parceiroId, bureaus: escolhidos });
    await gerarIA.mutateAsync(analiseId);
  };

  return (
    <Card className="border-info/40 bg-info/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-info">
          <FileSearch className="h-4 w-4" />
          Bureaus do cliente ainda válidos ({bureaus.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {bureaus.map((b) => (
          <label
            key={b.id}
            className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer"
          >
            <Checkbox
              checked={selecionados.includes(b.id)}
              onCheckedChange={() => toggle(b.id)}
              disabled={ocupado}
              className="mt-0.5"
            />
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Badge variant="secondary" className="uppercase text-xs">
                {b.fonte}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Consulta {fmtDate(b.data_consulta)} · {b.idade_dias} dia
                {b.idade_dias === 1 ? "" : "s"}
              </span>
              {b.score_numerico != null && (
                <span className="text-sm font-medium">Score: {b.score_numerico}</span>
              )}
              {b.score_numerico == null && b.score_categorico && (
                <span className="text-sm font-medium">{b.score_categorico}</span>
              )}
            </div>
          </label>
        ))}

        <div className="flex flex-col items-start gap-1.5">
          <Button
            size="sm"
            className="gap-2"
            disabled={ocupado || selecionados.length === 0}
            onClick={handleUsar}
          >
            {ocupado ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {reaproveitar.isPending ? "Copiando bureaus..." : "Gerando análise IA..."}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Usar os bureaus do cliente
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Copia a prova para esta análise e roda a análise IA em seguida.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
