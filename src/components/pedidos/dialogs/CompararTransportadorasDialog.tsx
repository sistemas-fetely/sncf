import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import type { FreteComparativoOpcao, FreteComparativoResult } from "@/hooks/pedidos/useFreteComparativo";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  data: FreteComparativoResult | undefined;
  valorAtual: number;
  onEscolher: (opcao: FreteComparativoOpcao) => void;
}

const BREAKDOWN_LABEL: Record<string, string> = {
  base: "Base",
  gris: "GRIS",
  fv: "FV",
  pedagio: "Pedágio",
  txa: "TXA",
  adm: "ADM",
  tx_coleta: "Tx. coleta",
  tas: "TAS",
};

function renderBreakdown(b: Record<string, number> | null | undefined): string {
  if (!b) return "";
  return Object.entries(b)
    .filter(([, v]) => Number(v) !== 0)
    .map(([k, v]) => `${BREAKDOWN_LABEL[k] ?? k}: ${formatBRL(Number(v))}`)
    .join(" · ");
}

export function CompararTransportadorasDialog({
  open,
  onOpenChange,
  isLoading,
  data,
  valorAtual,
  onEscolher,
}: Props) {
  const opcoes = (data?.opcoes ?? []).slice().sort((a, b) => {
    const va = a.valor_estimado;
    const vb = b.valor_estimado;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  });

  const menorValor = opcoes.find((o) => !o.erro && o.valor_estimado != null)?.valor_estimado ?? null;
  const erroGeral = data && !isLoading && !data.opcoes ? (data.erro ?? "Não foi possível calcular o comparativo.") : null;

  const mensagemErroAmigavel = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("cep")) return "Pedido sem CEP de destino. Preencha o endereço de entrega antes de comparar.";
    if (m.includes("peso") || m.includes("cubagem")) return "Pedido sem peso bruto nem cubagem. Preencha o peso no card antes de comparar.";
    return msg;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comparar transportadoras</DialogTitle>
          <DialogDescription>
            Cotação em todas as tabelas de preço vigentes. O objetivo é substituir o frete digitado de cabeça.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando tabelas de frete…
          </div>
        )}

        {!isLoading && erroGeral && (
          <div className="py-6 text-sm text-destructive">
            {mensagemErroAmigavel(erroGeral)}
          </div>
        )}

        {!isLoading && data && data.opcoes && (
          <>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                CEP destino <span className="font-medium text-foreground">{data.cep_destino ?? "—"}</span>
                {data.opcoes[0]?.uf_destino && <> · {data.opcoes[0].uf_destino}</>}
              </p>
              <p>
                Peso considerado: <span className="font-medium text-foreground">{data.peso_usado} kg</span>
                {data.peso_fonte === "cubado" && data.peso_cubado != null && data.peso_bruto != null && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">
                    peso cubado ({data.peso_cubado} kg) maior que o bruto ({data.peso_bruto} kg) — a transportadora cobra pelo maior
                  </span>
                )}
                {data.peso_fonte === "bruto" && <span className="ml-2">· peso bruto</span>}
                {data.peso_fonte === "informado" && <span className="ml-2">· peso informado</span>}
              </p>
            </div>

            {opcoes.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground text-center">
                Nenhuma transportadora com tabela de preço vigente.
              </p>
            ) : (
              <div className="rounded-md border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transportadora</TableHead>
                      <TableHead className="text-right">Valor estimado</TableHead>
                      <TableHead className="text-right">Prazo</TableHead>
                      <TableHead className="text-right">% do pedido</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opcoes.map((o, idx) => {
                      const temErro = !!o.erro || o.valor_estimado == null;
                      const isMenor = !temErro && menorValor != null && o.valor_estimado === menorValor;
                      const pct = o.pct_sobre_pedido != null ? Number(o.pct_sobre_pedido) : null;
                      const pctAlto = pct != null && pct > 20;
                      const diff = !temErro && valorAtual > 0 && o.valor_estimado != null ? o.valor_estimado - valorAtual : null;

                      return (
                        <TableRow
                          key={(o.transportadora_id ?? "") + idx}
                          className={cn(
                            temErro && "text-muted-foreground",
                            isMenor && "bg-emerald-50 dark:bg-emerald-950/30",
                          )}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground">{o.transportadora_nome}</span>
                              {isMenor && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-700 dark:text-emerald-400">Mais barata</Badge>}
                            </div>
                            {o.cnpj && <p className="text-[11px] text-muted-foreground">{o.cnpj}</p>}
                          </TableCell>
                          <TableCell className="text-right">
                            {temErro ? (
                              <span className="text-xs italic">{o.erro ?? "sem cotação"}</span>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="font-medium cursor-help">{formatBRL(o.valor_estimado ?? 0)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm text-xs">
                                    {renderBreakdown(o.breakdown) || "sem detalhamento"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {temErro ? "—" : o.prazo_dias != null ? `${o.prazo_dias}d` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {pct != null ? (
                              <Badge variant={pctAlto ? "destructive" : "outline"} className="text-[10px] px-1.5 py-0">
                                {pct.toFixed(1)}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{o.zona ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {!temErro && (
                              <div className="flex items-center justify-end gap-2">
                                {diff != null && Math.abs(diff) >= 0.01 && (
                                  <span className={cn("text-[11px]", diff > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                                    {diff > 0 ? "+" : ""}{formatBRL(diff)} vs atual
                                  </span>
                                )}
                                <Button size="sm" variant="outline" className="h-7" onClick={() => onEscolher(o)}>
                                  Usar esta
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
