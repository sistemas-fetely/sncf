import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, ShieldAlert, AlertOctagon, RefreshCw, Sparkles } from "lucide-react";
import { useReanalisarPedido } from "@/hooks/pedidos/useReanalisarPedido";
import { cn } from "@/lib/utils";

interface Props {
  pedido_id: string;
  status: "ok" | "desvio" | "erro" | null;
  motivo: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detalhes: any | null;
  executada_em: string | null;
}

const fmtDateTime = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR") : "—";

export function CardAnalisePedido({
  pedido_id, status, motivo, detalhes, executada_em,
}: Props) {
  const reanalisar = useReanalisarPedido();

  const corBorda =
    status === "ok" ? "border-l-emerald-500"
    : status === "desvio" ? "border-l-amber-500"
    : status === "erro" ? "border-l-destructive"
    : "border-l-muted";

  return (
    <Card className={cn("border-l-4", corBorda)}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Análise do Pedido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === null ? (
          <p className="text-sm text-muted-foreground">
            Aguardando análise automática.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {status === "ok" && (
                <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Condição compatível
                </Badge>
              )}
              {status === "desvio" && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Desvio
                </Badge>
              )}
              {status === "erro" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertOctagon className="h-3 w-3" />
                  Erro na análise
                </Badge>
              )}
            </div>

            {motivo && (
              <p className="text-sm leading-relaxed">{motivo}</p>
            )}

            {detalhes && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {detalhes.nivel_nome && (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Nível efetivo</p>
                      <p className="font-medium capitalize">{detalhes.nivel_nome}</p>
                    </div>
                  )}
                  {detalhes.prazo_solicitado_dias != null && detalhes.prazo_permitido_dias != null && (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Prazo</p>
                      <p className="font-medium">
                        {detalhes.prazo_solicitado_dias}d solicitado
                        {" / "}
                        {detalhes.prazo_permitido_dias}d permitido
                      </p>
                    </div>
                  )}
                  {detalhes.cartao_sem_juros_max_parcelas != null && (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Cartão s/ juros</p>
                      <p className="font-medium">até {detalhes.cartao_sem_juros_max_parcelas}x</p>
                    </div>
                  )}
                  {detalhes.desconto_pct_aplicavel != null && Number(detalhes.desconto_pct_aplicavel) > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">Desconto aplicável</p>
                      <p className="font-medium">{detalhes.desconto_pct_aplicavel}%</p>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Analisado em {fmtDateTime(executada_em)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => reanalisar.mutate({ pedido_id })}
                disabled={reanalisar.isPending}
              >
                <RefreshCw className={cn("h-3 w-3", reanalisar.isPending && "animate-spin")} />
                Reanalisar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
