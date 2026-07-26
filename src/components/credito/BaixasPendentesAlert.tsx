import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowUpFromLine, ChevronDown, Clock, Info, Loader2, UploadCloud } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import type { BaixaPendenteItem } from "@/hooks/credito/useBaixasPendentes";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}


function ListaBaixas({ itens, mostrarIdade }: { itens: BaixaPendenteItem[]; mostrarIdade?: "gerado" | "enviado" }) {
  return (
    <div className="mt-3 rounded-md border bg-background/60 overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Título</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Nosso número</th>
            <th className="px-3 py-2 font-medium text-right">Valor</th>
            {mostrarIdade && <th className="px-3 py-2 font-medium text-right">Idade</th>}
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => {
            const dias =
              mostrarIdade === "gerado"
                ? daysSince(i.remessa_gerado_em)
                : mostrarIdade === "enviado"
                  ? daysSince(i.remessa_enviada_em)
                  : null;
            return (
              <tr key={i.id} className="border-t">
                <td className="px-3 py-1.5 font-mono">{i.numero_titulo ?? "—"}</td>
                <td className="px-3 py-1.5">{i.cliente}</td>
                <td className="px-3 py-1.5 font-mono">{i.nosso_numero_seq ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(i.valor)}</td>
                {mostrarIdade && (
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {dias == null ? "—" : `${dias}d`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BaixasPendentesAlert({
  onGerarBaixa,
  gerandoBaixa,
}: {
  onGerarBaixa: (tituloIds: string[]) => void;
  gerandoBaixa: boolean;
}) {
  const { data, isLoading, error, refetch } = useBaixasPendentes();
  const [openSolicitada, setOpenSolicitada] = useState(true);
  const [openGerada, setOpenGerada] = useState(false);
  const [openEnviada, setOpenEnviada] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());


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

  const {
    baixaSolicitada,
    totalSolicitada,
    countSolicitada,
    remessaGeradaAguardandoEnvio,
    totalRemessaGeradaAguardandoEnvio,
    countRemessaGeradaAguardandoEnvio,
    remessaEnviadaAguardandoRetorno,
    totalRemessaEnviadaAguardandoRetorno,
    countRemessaEnviadaAguardandoRetorno,
  } = data;

  if (
    countSolicitada === 0 &&
    countRemessaGeradaAguardandoEnvio === 0 &&
    countRemessaEnviadaAguardandoRetorno === 0
  ) {
    return <div className="text-xs text-muted-foreground italic">Nenhuma baixa pendente.</div>;
  }

  // Envelhecimento: idade máxima entre os itens do bloco
  const maxDiasGerada = Math.max(
    0,
    ...remessaGeradaAguardandoEnvio.map((i) => daysSince(i.remessa_gerado_em) ?? 0),
  );
  const maxDiasEnviada = Math.max(
    0,
    ...remessaEnviadaAguardandoRetorno.map((i) => daysSince(i.remessa_enviada_em) ?? 0),
  );
  const geradaAtrasada = countRemessaGeradaAguardandoEnvio > 0 && maxDiasGerada > 2;
  const enviadaAtrasada = countRemessaEnviadaAguardandoRetorno > 0 && maxDiasEnviada > 5;

  return (
    <div className="space-y-3">
      {/* 🟠 BLOCO 1 — AGUARDANDO GERAR */}
      {countSolicitada > 0 && (
        <Alert className={cn("border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900")}>
          <AlertTriangle className="h-4 w-4 text-orange-700 dark:text-orange-300" />
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <AlertTitle className="text-orange-900 dark:text-orange-100">
                {countSolicitada} {countSolicitada === 1 ? "boleto aguardando" : "boletos aguardando"} remessa de baixa
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

      {/* 🟣 BLOCO 2 — GERADA, AGUARDANDO ENVIO */}
      {countRemessaGeradaAguardandoEnvio > 0 && (
        <Alert
          className={cn(
            geradaAtrasada
              ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
              : "border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-900",
          )}
        >
          {geradaAtrasada ? (
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          ) : (
            <UploadCloud className="h-4 w-4 text-purple-700 dark:text-purple-300" />
          )}
          <AlertTitle
            className={cn(
              geradaAtrasada
                ? "text-amber-900 dark:text-amber-100"
                : "text-purple-900 dark:text-purple-100",
            )}
          >
            {countRemessaGeradaAguardandoEnvio}{" "}
            {countRemessaGeradaAguardandoEnvio === 1 ? "boleto" : "boletos"} em remessa gerada aguardando envio no SafraNet
            <span
              className={cn(
                "ml-2 font-normal",
                geradaAtrasada
                  ? "text-amber-800/80 dark:text-amber-200/80"
                  : "text-purple-800/80 dark:text-purple-200/80",
              )}
            >
              ({formatBRL(totalRemessaGeradaAguardandoEnvio)} total)
            </span>
          </AlertTitle>
          <AlertDescription
            className={cn(
              "mt-1 flex items-center gap-1.5",
              geradaAtrasada ? "text-amber-800 dark:text-amber-200" : "text-purple-800 dark:text-purple-200",
            )}
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Baixe o arquivo e marque como enviada na sub-aba "Remessas Safra".
            {geradaAtrasada && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5" />
                gerada há {maxDiasGerada} dias — ainda não enviada
              </span>
            )}
          </AlertDescription>
          <Collapsible open={openGerada} onOpenChange={setOpenGerada}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-xs hover:underline",
                  geradaAtrasada
                    ? "text-amber-900 dark:text-amber-100"
                    : "text-purple-900 dark:text-purple-100",
                )}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openGerada && "rotate-180")} />
                {openGerada ? "Esconder detalhes" : "Ver detalhes"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ListaBaixas itens={remessaGeradaAguardandoEnvio} mostrarIdade="gerado" />
            </CollapsibleContent>
          </Collapsible>
        </Alert>
      )}

      {/* 🔵 BLOCO 3 — ENVIADA, AGUARDANDO RETORNO (informativo) */}
      {countRemessaEnviadaAguardandoRetorno > 0 && (
        <Alert
          className={cn(
            enviadaAtrasada
              ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
              : "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900",
          )}
        >
          {enviadaAtrasada ? (
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          ) : (
            <Info className="h-4 w-4 text-blue-700 dark:text-blue-300" />
          )}
          <AlertTitle
            className={cn(
              enviadaAtrasada
                ? "text-amber-900 dark:text-amber-100"
                : "text-blue-900 dark:text-blue-100",
            )}
          >
            {countRemessaEnviadaAguardandoRetorno}{" "}
            {countRemessaEnviadaAguardandoRetorno === 1 ? "boleto enviado" : "boletos enviados"} ao SafraNet aguardando retorno
            <span
              className={cn(
                "ml-2 font-normal",
                enviadaAtrasada
                  ? "text-amber-800/80 dark:text-amber-200/80"
                  : "text-blue-800/80 dark:text-blue-200/80",
              )}
            >
              ({formatBRL(totalRemessaEnviadaAguardandoRetorno)} total)
            </span>
          </AlertTitle>
          <AlertDescription
            className={cn(
              "mt-1",
              enviadaAtrasada ? "text-amber-800 dark:text-amber-200" : "text-blue-800 dark:text-blue-200",
            )}
          >
            {enviadaAtrasada ? (
              <span className="inline-flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5" />
                enviada há {maxDiasEnviada} dias sem retorno do banco — verificar no SafraNet
              </span>
            ) : (
              <>Aguardando processamento do banco. Nenhuma ação necessária por enquanto.</>
            )}
          </AlertDescription>
          <Collapsible open={openEnviada} onOpenChange={setOpenEnviada}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-xs hover:underline",
                  enviadaAtrasada
                    ? "text-amber-900 dark:text-amber-100"
                    : "text-blue-900 dark:text-blue-100",
                )}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openEnviada && "rotate-180")} />
                {openEnviada ? "Esconder detalhes" : "Ver detalhes"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ListaBaixas itens={remessaEnviadaAguardandoRetorno} mostrarIdade="enviado" />
            </CollapsibleContent>
          </Collapsible>
        </Alert>
      )}
    </div>
  );
}
