import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowUpFromLine, ChevronDown, Clock, Download, Info, Loader2, UploadCloud } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useBaixasPendentes } from "@/hooks/credito/useBaixasPendentes";
import type { BaixaPendenteItem } from "@/hooks/credito/useBaixasPendentes";
import { baixarArquivoRemessa } from "@/lib/financeiro/baixarArquivoRemessa";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { toast } = useToast();
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

  // Selecionados default = todos. Sincroniza quando a lista muda (ex.: refetch).
  const idsSolicitados = useMemo(() => baixaSolicitada.map((i) => i.id).join("|"), [baixaSolicitada]);
  useEffect(() => {
    setSelecionados(new Set(baixaSolicitada.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSolicitados]);

  const toggleOne = (id: string, on: boolean) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  };
  const toggleAll = (on: boolean) => {
    setSelecionados(on ? new Set(baixaSolicitada.map((i) => i.id)) : new Set());
  };

  const nSelecionados = selecionados.size;
  const totalSelecionado = baixaSolicitada.reduce(
    (s, i) => (selecionados.has(i.id) ? s + Number(i.valor ?? 0) : s),
    0,
  );
  const allSelected = countSolicitada > 0 && nSelecionados === countSolicitada;
  const someSelected = nSelecionados > 0 && !allSelected;

  // Agrupa boletos do Bloco 2 por remessa para permitir download por arquivo.
  type GrupoRemessa = {
    remessa_id: string | null;
    arquivo_nome: string | null;
    conteudo: string | null;
    gerado_em: string | null;
    total: number;
    itens: BaixaPendenteItem[];
  };
  const gruposGerada: GrupoRemessa[] = (() => {
    const map = new Map<string, GrupoRemessa>();
    for (const it of remessaGeradaAguardandoEnvio) {
      const key = it.remessa_id ?? `__sem__${it.id}`;
      const g = map.get(key);
      if (g) {
        g.itens.push(it);
        g.total += Number(it.valor ?? 0);
      } else {
        map.set(key, {
          remessa_id: it.remessa_id,
          arquivo_nome: it.remessa_arquivo_nome,
          conteudo: it.remessa_conteudo,
          gerado_em: it.remessa_gerado_em,
          total: Number(it.valor ?? 0),
          itens: [it],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.gerado_em ? new Date(a.gerado_em).getTime() : 0;
      const tb = b.gerado_em ? new Date(b.gerado_em).getTime() : 0;
      return tb - ta;
    });
  })();

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
                {nSelecionados} de {countSolicitada} selecionado{nSelecionados === 1 ? "" : "s"} · {formatBRL(totalSelecionado)}
              </AlertDescription>
            </div>
            <Button
              size="sm"
              onClick={() => onGerarBaixa(Array.from(selecionados))}
              disabled={gerandoBaixa || nSelecionados === 0}
              className="gap-2 shrink-0 bg-orange-700 hover:bg-orange-800 text-white"
            >
              {gerandoBaixa ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
              Gerar Remessa de Baixa ({nSelecionados})
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
              <div className="mt-3 rounded-md border bg-background/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 w-8">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleAll(v === true)}
                          aria-label="Selecionar todos"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Título</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Nosso número</th>
                      <th className="px-3 py-2 font-medium text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baixaSolicitada.map((i) => {
                      const checked = selecionados.has(i.id);
                      return (
                        <tr key={i.id} className="border-t">
                          <td className="px-3 py-1.5">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleOne(i.id, v === true)}
                              aria-label={`Selecionar ${i.numero_titulo ?? i.id}`}
                            />
                          </td>
                          <td className="px-3 py-1.5 font-mono">{i.numero_titulo ?? "—"}</td>
                          <td className="px-3 py-1.5">{i.cliente}</td>
                          <td className="px-3 py-1.5 font-mono">{i.nosso_numero_seq ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(i.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
            Baixe o arquivo abaixo, suba no SafraNet e marque como enviada na sub-aba "Remessas Safra".
            {geradaAtrasada && (
              <span className="ml-1 inline-flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5" />
                gerada há {maxDiasGerada} dias — ainda não enviada
              </span>
            )}
          </AlertDescription>

          {/* Grupos por remessa, com botão de download por remessa */}
          <div className="mt-3 space-y-2">
            {gruposGerada.map((g) => {
              const idade = daysSince(g.gerado_em);
              const semConteudo = !g.conteudo;
              const btn = (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 shrink-0"
                  disabled={semConteudo}
                  onClick={() => {
                    try {
                      baixarArquivoRemessa(g.conteudo, g.arquivo_nome ?? `remessa-${g.remessa_id ?? "sem-id"}.rem`);
                      toast({ title: "Arquivo baixado", description: g.arquivo_nome ?? "remessa" });
                    } catch (e) {
                      toast({
                        title: "Erro ao baixar remessa",
                        description: e instanceof Error ? e.message : String(e),
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Download className="h-4 w-4" />
                  Baixar arquivo
                </Button>
              );
              return (
                <div key={g.remessa_id ?? `sem-${g.itens[0].id}`} className="rounded-md border bg-background/60 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/40 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono">{g.arquivo_nome ?? "— sem arquivo —"}</span>
                      <span className="text-muted-foreground">
                        {g.itens.length} boleto{g.itens.length === 1 ? "" : "s"}
                      </span>
                      <span className="text-muted-foreground tabular-nums">{formatBRL(g.total)}</span>
                      {idade != null && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> gerada há {idade}d
                        </span>
                      )}
                    </div>
                    {semConteudo ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                          <TooltipContent>Arquivo não disponível — remessa anterior ao histórico</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      btn
                    )}
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <button className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/30 inline-flex items-center gap-1">
                        <ChevronDown className="h-3.5 w-3.5" />
                        Ver boletos
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr className="text-left">
                            <th className="px-3 py-1.5 font-medium">Título</th>
                            <th className="px-3 py-1.5 font-medium">Cliente</th>
                            <th className="px-3 py-1.5 font-medium">Nosso número</th>
                            <th className="px-3 py-1.5 font-medium text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.itens.map((i) => (
                            <tr key={i.id} className="border-t">
                              <td className="px-3 py-1.5 font-mono">{i.numero_titulo ?? "—"}</td>
                              <td className="px-3 py-1.5">{i.cliente}</td>
                              <td className="px-3 py-1.5 font-mono">{i.nosso_numero_seq ?? "—"}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(i.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
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
