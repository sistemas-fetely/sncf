import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, AlertTriangle } from "lucide-react";
import type { AnaliseScore } from "@/types/credito";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  scores: AnaliseScore[];
}

const FLAG_LABELS: Record<string, string> = {
  flag_pefin: "PEFIN",
  flag_refin: "REFIN",
  flag_protestos: "Protestos",
  flag_falencia_rj: "Falência/RJ",
  flag_acoes_judiciais: "Ações Judiciais",
  flag_cheque_devolvido: "Cheque Devolvido",
  flag_divida_vencida: "Dívida Vencida",
};

export function ScoresAnexados({ scores }: Props) {
  if (scores.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Nenhum bureau anexado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bureaus anexados ({scores.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scores.map((s) => {
          const flagsAtivas = Object.keys(FLAG_LABELS).filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (key) => (s as any)[key] === true,
          );

          return (
            <div key={s.id} className="border rounded-md p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="uppercase text-xs">
                        {s.fonte}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(s.data_consulta)}
                      </span>
                    </div>
                    {s.score_numerico !== null && s.score_numerico !== undefined && (
                      <p className="text-sm mt-1">
                        <span className="font-medium">Score: {s.score_numerico}</span>
                        {s.score_categorico && (
                          <span className="text-muted-foreground"> · {s.score_categorico}</span>
                        )}
                      </p>
                    )}
                    {s.score_numerico == null && s.score_categorico && (
                      <p className="text-sm mt-1 font-medium">{s.score_categorico}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {flagsAtivas.length === 0 ? (
                  <Badge variant="outline" className="border-emerald-500 text-emerald-700">
                    Sem alertas
                  </Badge>
                ) : (
                  flagsAtivas.map((f) => (
                    <Badge key={f} variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {FLAG_LABELS[f]}
                    </Badge>
                  ))
                )}
                {s.total_dividas && s.total_dividas > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">
                    Dívidas: {fmtBRL.format(s.total_dividas)}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
