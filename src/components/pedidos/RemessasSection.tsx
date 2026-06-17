import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Send, Package, Clock, CheckCircle2, Truck, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { DividirRemessaDialog } from "@/components/pedidos/dialogs/DividirRemessaDialog";
import { supabase } from "@/integrations/supabase/client";
import { useRemessas } from "@/hooks/pedidos/useRemessas";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useSyncContato } from "@/hooks/parceiros/useSyncContato";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: JSX.Element }> = {
  aguardando_definicao: { label: "Aguardando definição", color: "bg-gray-100 text-gray-700", icon: <Clock className="h-3 w-3" /> },
  aguardando_estoque:   { label: "Aguardando estoque",   color: "bg-yellow-100 text-yellow-800", icon: <AlertTriangle className="h-3 w-3" /> },
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
  estagio: string;
  bling_id_destino: number | null;
}

export function RemessasSection({ pedido_id, parceiro_id, id_externo, estagio, bling_id_destino }: Props) {
  const { data: remessas, isLoading } = useRemessas(pedido_id);
  const enviar = useEnviarBling();
  const sync = useSyncContato();

  const { data: parceiroBling, refetch: recheckBling } = useQuery({
    queryKey: ["parceiro-bling-check", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("bling_id")
        .eq("id", parceiro_id)
        .maybeSingle();
      return data;
    },
    enabled: !!parceiro_id,
  });

  if (isLoading) return null;

  const semRemessa = !remessas || remessas.length === 0;
  const podeEnviarInicial = estagio === "pre_faturado" && !bling_id_destino;
  const estagioDeEnvio = estagio === "pre_faturado" || estagio === "em_separacao";
  const temBlingId = !!parceiroBling?.bling_id;
  const precisaSincronizar = estagioDeEnvio && !bling_id_destino && !temBlingId;

  if (semRemessa && !podeEnviarInicial) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Remessas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {precisaSincronizar && (
          <Alert variant="default" className="bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Parceiro ainda não cadastrado no Bling. Sincronize antes de enviar.
            </AlertDescription>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1"
              disabled={sync.isPending}
              onClick={async () => { await sync.mutateAsync(parceiro_id); recheckBling(); }}
            >
              {sync.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sincronizando…</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" />Sincronizar parceiro no Bling</>
              )}
            </Button>
          </Alert>
        )}

        {!precisaSincronizar && semRemessa && (
          <>
            <p className="text-sm text-muted-foreground">
              Ainda sem remessa. Ao enviar, a remessa /01 é criada com todos os itens e mandada pro Bling.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={enviar.isPending}
              onClick={() => enviar.mutate({ pedido_id })}
            >
              {enviar.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><Send className="h-4 w-4" />Enviar pro Bling (gera a remessa /01)</>
              )}
            </Button>
          </>
        )}

        {!semRemessa && remessas.map((rem: any) => {
          const cfg = STATUS_CONFIG[rem.status] ?? STATUS_CONFIG.aguardando_definicao;
          const codigo = `${id_externo}/${String(rem.sequencia).padStart(2, "0")}`;
          const itens: any[] = Array.isArray(rem.itens_json) ? rem.itens_json : [];
          const podeEnviar = rem.status === "pronta_para_envio" && !rem.bling_pedido_id && !precisaSincronizar;
          const totalUnidades = itens.reduce((s: number, it: any) => s + (Number(it.quantidade) || 0), 0);
          const podeDividir = !rem.bling_pedido_id && totalUnidades >= 2;

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

              {(podeEnviar || podeDividir) && (
                <div className="flex gap-2">
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
                  {podeDividir && (
                    <DividirRemessaDialog
                      remessaId={rem.id}
                      pedidoId={pedido_id}
                      codigo={codigo}
                      itens={itens}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
