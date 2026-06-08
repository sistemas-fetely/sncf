import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, Package, Clock, CheckCircle2, Truck, XCircle } from "lucide-react";
import { useRemessas } from "@/hooks/pedidos/useRemessas";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  aguardando_definicao: { label: "Aguardando definição", color: "bg-gray-100 text-gray-700", icon: <Clock className="h-3 w-3" /> },
  aguardando_estoque:   { label: "Aguardando estoque",   color: "bg-yellow-100 text-yellow-800", icon: <Clock className="h-3 w-3" /> },
  pronta_para_envio:    { label: "Pronta para envio",    color: "bg-blue-100 text-blue-800", icon: <Package className="h-3 w-3" /> },
  enviada_bling:        { label: "Enviada ao Bling",     color: "bg-purple-100 text-purple-800", icon: <Send className="h-3 w-3" /> },
  faturada:             { label: "Faturada",             color: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" /> },
  em_transporte:        { label: "Em transporte",        color: "bg-indigo-100 text-indigo-800", icon: <Truck className="h-3 w-3" /> },
  entregue:             { label: "Entregue",             color: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelada:            { label: "Cancelada",            color: "bg-red-100 text-red-800", icon: <XCircle className="h-3 w-3" /> },
};

interface Props {
  pedido_id: string;
  parceiro_id: string;
  id_externo: string;
}

export function RemessasSection({ pedido_id, id_externo }: Props) {
  const { data: remessas, isLoading } = useRemessas(pedido_id);
  const enviar = useEnviarBling();

  if (isLoading) return null;
  if (!remessas || remessas.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Remessas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {remessas.map((rem: any) => {
          const cfg = STATUS_CONFIG[rem.status] ?? STATUS_CONFIG.aguardando_definicao;
          const codigo = `${id_externo}/${String(rem.sequencia).padStart(2, "0")}`;
          const itens: any[] = Array.isArray(rem.itens_json) ? rem.itens_json : [];
          const podeEnviar = rem.status === "pronta_para_envio" && !rem.bling_pedido_id;

          return (
            <div key={rem.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{codigo}</span>
                  <Badge className={`${cfg.color} gap-1 border-0`} variant="secondary">
                    {cfg.icon} {cfg.label}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {itens.length} {itens.length === 1 ? "item" : "itens"} ·{" "}
                  <span className="font-medium text-foreground">
                    {rem.valor_remessa ? fmtBRL.format(rem.valor_remessa) : "—"}
                  </span>
                </div>
              </div>

              {rem.data_entrega_prevista && (
                <div className="text-xs text-muted-foreground">
                  Previsão: {new Date(rem.data_entrega_prevista + "T12:00:00").toLocaleDateString("pt-BR")}
                </div>
              )}

              {rem.bling_pedido_id && (
                <div className="text-xs text-muted-foreground">Bling ID: #{rem.bling_pedido_id}</div>
              )}

              {rem.delta_financeiro && Number(rem.delta_financeiro) > 0 && (
                <div className="text-xs text-amber-700">
                  ⚠️ Delta financeiro: {fmtBRL.format(rem.delta_financeiro)} acima dos títulos
                </div>
              )}

              {rem.nf_numero && <div className="text-xs">NF: {rem.nf_numero}</div>}

              {podeEnviar && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={enviar.isPending}
                  onClick={() => enviar.mutate({ pedido_id, remessa_id: rem.id })}
                >
                  {enviar.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
                  ) : (
                    <><Send className="h-4 w-4" />Enviar {codigo} pro Bling</>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
