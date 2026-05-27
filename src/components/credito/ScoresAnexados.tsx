import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { useExcluirScore } from "@/hooks/credito/useExcluirScore";
import { getBureauPDFUrl } from "@/lib/credito/bureauUrl";
import type { AnaliseScore } from "@/types/credito";

const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FLAG_LABELS: Record<string, string> = {
  flag_pefin: "PEFIN",
  flag_refin: "REFIN",
  flag_protestos: "Protestos",
  flag_falencia_rj: "Falência/RJ",
  flag_acoes_judiciais: "Ações Judiciais",
  flag_cheque_devolvido: "Cheque Devolvido",
  flag_divida_vencida: "Dívida Vencida",
};

interface Props {
  scores: AnaliseScore[];
  analiseId: string;
}

export function ScoresAnexados({ scores, analiseId }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<AnaliseScore | null>(null);
  const excluir = useExcluirScore();

  const handleVer = async (s: AnaliseScore) => {
    if (!s.documento_storage_path) return;
    const url = await getBureauPDFUrl(s.documento_storage_path);
    if (url) window.open(url, "_blank");
  };

  const handleExcluir = async () => {
    if (!confirmDelete) return;
    await excluir.mutateAsync({
      scoreId: confirmDelete.id,
      storagePath: confirmDelete.documento_storage_path,
      analiseId,
    });
    setConfirmDelete(null);
  };

  if (scores.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Nenhum bureau anexado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Bureaus anexados ({scores.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {scores.map((s) => {
            const flagsAtivas = Object.keys(FLAG_LABELS).filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (key) => (s as any)[key] === true,
            );

            return (
              <div key={s.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="uppercase text-xs">
                          {s.fonte}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(s.data_consulta)}
                        </span>
                        {s.score_numerico != null && (
                          <span className="text-sm">
                            <span className="font-medium">Score: {s.score_numerico}</span>
                            {s.score_categorico && (
                              <span className="text-muted-foreground"> · {s.score_categorico}</span>
                            )}
                          </span>
                        )}
                        {s.score_numerico == null && s.score_categorico && (
                          <span className="text-sm font-medium">{s.score_categorico}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {s.documento_storage_path && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-xs"
                        onClick={() => handleVer(s)}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver PDF
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(s)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
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
                  {s.total_dividas != null && s.total_dividas > 0 && (
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover bureau anexado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o PDF + os dados extraídos pela IA. Você poderá anexar
              um arquivo correto em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
