import { Truck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { usePedidoEntrega } from "@/hooks/pedidos/usePedidoEntrega";
import { cn } from "@/lib/utils";

interface Props {
  pedidoId: string;
  estagio: string;
}

function mesmoDia(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

export function CardEntrega({ pedidoId, estagio }: Props) {
  const { data, isLoading } = usePedidoEntrega(pedidoId, estagio);

  if (estagio !== "entregue") return null;

  const e = data;

  const renderDiasVsPrevisto = () => {
    if (!e || e.dias_vs_previsto === null || e.dias_vs_previsto === undefined) return null;
    const d = Number(e.dias_vs_previsto);
    if (d < 0) {
      return <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{Math.abs(d)} dias antes do previsto</span>;
    }
    if (d === 0) {
      return <span className="text-[11px] text-emerald-600 dark:text-emerald-400">no prazo</span>;
    }
    return <span className="text-[11px] text-amber-600 dark:text-amber-400">{d} dias após o previsto</span>;
  };

  const renderTransportadora = () => {
    if (!e) return <span className="text-sm text-muted-foreground">—</span>;
    if (e.transportadora_nome) {
      return (
        <>
          <p className="text-sm font-medium">{e.transportadora_nome}</p>
          {e.transportadora_cnpj && <p className="text-[11px] text-muted-foreground">{e.transportadora_cnpj}</p>}
        </>
      );
    }
    if (e.transporte_origem === "cliente_retira_ou_propria") {
      return (
        <>
          <p className="text-sm font-medium">Transporte do cliente</p>
          <p className="text-[11px] text-muted-foreground">transportadora não registrada no pedido</p>
        </>
      );
    }
    return <p className="text-sm text-muted-foreground">Não informada</p>;
  };

  const renderFrete = () => {
    if (!e) return <span className="text-sm text-muted-foreground">—</span>;
    const valor = e.valor_frete;
    const temValor = valor !== null && valor !== undefined && Number(valor) !== 0;

    if (temValor) {
      return (
        <>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{formatBRL(Number(valor))}</p>
            {e.frete_tipo && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{e.frete_tipo}</Badge>}
          </div>
          {e.frete_responsavel && <p className="text-[11px] text-muted-foreground">{e.frete_responsavel}</p>}
        </>
      );
    }

    if (e.frete_tipo === "CIF") {
      return (
        <>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">—</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">CIF</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Frete por conta da Fetely — custo apurado nas faturas de frete, não no pedido</p>
        </>
      );
    }
    if (e.frete_tipo === "FOB") {
      return (
        <>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">—</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">FOB</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Sem valor de frete registrado</p>
        </>
      );
    }
    return <p className="text-sm text-muted-foreground">—</p>;
  };

  // Blocos novos (Logística)
  const temCustoReal = e?.custo_frete_real !== null && e?.custo_frete_real !== undefined;
  const temMargem = e?.margem_frete !== null && e?.margem_frete !== undefined;
  const temOcorrencia = !!e?.entrega_ocorrencia_texto;
  const temPesoVolume =
    e?.volumes !== null && e?.volumes !== undefined ||
    e?.peso_real !== null && e?.peso_real !== undefined ||
    e?.peso_taxado !== null && e?.peso_taxado !== undefined;

  const transpDataDivergente =
    !!e?.data_entrega_transportadora &&
    !mesmoDia(e.data_entrega_transportadora, e.data_entrega);

  const pct = e?.pct_frete_nf !== null && e?.pct_frete_nf !== undefined ? Number(e.pct_frete_nf) : null;
  const pctAlto = pct !== null && pct > 20;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          Entrega
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

        {!isLoading && !e && (
          <p className="text-xs text-muted-foreground">Sem dados de entrega.</p>
        )}

        {!isLoading && e && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Data da entrega</label>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-sm font-medium">{e.data_entrega ? formatDateBR(e.data_entrega) : "—"}</p>
                {renderDiasVsPrevisto()}
              </div>
              {e.entregue_metodo && (
                <p className="text-[11px] text-muted-foreground">{e.entregue_metodo}</p>
              )}
              {transpDataDivergente && (
                <p className="text-[11px] text-muted-foreground">
                  Transportadora registrou em {formatDateBR(e.data_entrega_transportadora)}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Transportadora</label>
              {renderTransportadora()}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Frete</label>
              {renderFrete()}
            </div>

            {temCustoReal && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Custo real do frete</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{formatBRL(Number(e.custo_frete_real))}</p>
                  {pct !== null && (
                    <Badge
                      variant={pctAlto ? "destructive" : "outline"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {pct.toFixed(1)}% da NF
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  apurado na fatura da transportadora
                  {e.frete_qtd_ctes && Number(e.frete_qtd_ctes) > 1
                    ? ` · ${e.frete_qtd_ctes} CTes`
                    : e.cte_numero
                      ? ` · CTe ${e.cte_numero}`
                      : ""}
                </p>
              </div>
            )}

            {temMargem && (
              <div className="space-y-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="text-[10px] uppercase tracking-widest text-muted-foreground cursor-help">
                        Margem do frete
                      </label>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Diferença entre o frete cobrado do cliente e o custo real pago à transportadora. Só se aplica a FOB.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p
                  className={cn(
                    "text-sm font-medium",
                    Number(e.margem_frete) < 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatBRL(Number(e.margem_frete))}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {Number(e.margem_frete) < 0 ? "cobrado menos que o custo" : "cobrado acima do custo"}
                </p>
              </div>
            )}

            {temOcorrencia && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Ocorrência</label>
                <div
                  className={cn(
                    "flex items-start gap-1.5 text-[11px]",
                    e.entrega_ocorrencia_problema ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {e.entrega_ocorrencia_problema && (
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  )}
                  <span>{e.entrega_ocorrencia_texto}</span>
                </div>
              </div>
            )}

            {temPesoVolume && (
              <p className="text-[11px] text-muted-foreground">
                {[
                  e.volumes !== null && e.volumes !== undefined ? `${e.volumes} volume(s)` : null,
                  e.peso_real !== null && e.peso_real !== undefined ? `${Number(e.peso_real)} kg real` : null,
                  e.peso_taxado !== null && e.peso_taxado !== undefined ? `${Number(e.peso_taxado)} kg taxado` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {e.nf_numero && (
              <div className={cn("pt-2 border-t border-border/40")}>
                <p className="text-[11px] text-muted-foreground">
                  NF {e.nf_numero}
                  {e.nf_data && ` · ${formatDateBR(e.nf_data)}`}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
