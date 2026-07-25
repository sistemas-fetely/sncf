import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowUpFromLine, ChevronDown, Info, Loader2, UploadCloud } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import type { BaixaPendenteItem } from "@/hooks/credito/useBaixasPendentes";

function ListaBaixas({ itens }: { itens: BaixaPendenteItem[] }) {
  return (
    <div className="mt-3 rounded-md border bg-background/60 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Título</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Nosso número</th>
            <th className="px-3 py-2 font-medium text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="px-3 py-1.5 font-mono">{i.numero_titulo ?? "—"}</td>
              <td className="px-3 py-1.5">{i.cliente}</td>
              <td className="px-3 py-1.5 font-mono">{i.nosso_numero_seq ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(i.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BaixasPendentesAlert({
  onGerarBaixa,
  gerandoBaixa,
}: {
  onGerarBaixa: () => void;
  gerandoBaixa: boolean;
}) {
  const { data, isLoading, error, refetch } = useBaixasPendentes();
  const [openSolicitada, setOpenSolicitada] = useState(false);
  const [openGerada, setOpenGerada] = useState(false);

  if (isLoading) return null;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Falha ao consultar baixas pendentes</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{(error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { baixaSolicitada, baixaRemessaGerada, totalSolicitada, totalRemessaGerada } = data;
  const nSol = baixaSolicitada.length;
  const nGer = baixaRemessaGerada.length;

  if (nSol === 0 && nGer === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">Nenhuma baixa pendente.</div>
    );
  }

  return (
    <div className="space-y-3">
      {nSol > 0 && (
        <Alert className={cn("border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900")}>
          <AlertTriangle className="h-4 w-4 text-orange-700 dark:text-orange-300" />
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <AlertTitle className="text-orange-900 dark:text-orange-100">
                {nSol} {nSol === 1 ? "boleto aguardando" : "boletos aguardando"} remessa de baixa
                <span className="ml-2 font-normal text-orange-800/80 dark:text-orange-200/80">
                  ({formatBRL(totalSolicitada)} total)
                </span>
              </AlertTitle>
              <AlertDescription className="text-orange-800 dark:text-orange-200 mt-1">
                Gere a remessa de baixa para que esses títulos não fiquem vivos no SafraNet.
              </AlertDescription>
            </div>
            <Button
              size="sm"
              onClick={onGerarBaixa}
              disabled={gerandoBaixa}
              className="gap-2 shrink-0 bg-orange-700 hover:bg-orange-800 text-white"
            >
              {gerandoBaixa ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              Gerar Remessa de Baixa
            </Button>
          </div>
          <Collapsible open={openSolicitada} onOpenChange={setOpenSolicitada}>
            <CollapsibleTrigger asChild>
              <button className="mt-2 inline-flex items-center gap-1 text-xs text-orange-900 dark:text-orange-100 hover:underline">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openSolicitada && "rotate-180")} />
                {openSolicitada ? "Esconder detalhes" : "Ver detalhes"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ListaBaixas itens={baixaSolicitada} />
            </CollapsibleContent>
          </Collapsible>
        </Alert>
      )}

      {nGer > 0 && (
        <Alert className={cn("border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-900")}>
          <Info className="h-4 w-4 text-purple-700 dark:text-purple-300" />
          <AlertTitle className="text-purple-900 dark:text-purple-100">
            {nGer} {nGer === 1 ? "boleto" : "boletos"} em remessa de baixa aguardando envio no SafraNet
            <span className="ml-2 font-normal text-purple-800/80 dark:text-purple-200/80">
              ({formatBRL(totalRemessaGerada)} total)
            </span>
          </AlertTitle>
          <AlertDescription className="text-purple-800 dark:text-purple-200 mt-1 flex items-center gap-1.5">
            <UploadCloud className="h-3.5 w-3.5" />
            Lembre-se de subir o arquivo de remessa no SafraNet.
          </AlertDescription>
          <Collapsible open={openGerada} onOpenChange={setOpenGerada}>
            <CollapsibleTrigger asChild>
              <button className="mt-2 inline-flex items-center gap-1 text-xs text-purple-900 dark:text-purple-100 hover:underline">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openGerada && "rotate-180")} />
                {openGerada ? "Esconder detalhes" : "Ver detalhes"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ListaBaixas itens={baixaRemessaGerada} />
            </CollapsibleContent>
          </Collapsible>
        </Alert>
      )}
    </div>
  );
}
