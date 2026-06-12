import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";
import { useNavigate } from "react-router-dom";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ESTAGIO_CORES: Record<string, string> = {
  aguardando_estoque: "bg-yellow-100 text-yellow-800",
  pre_faturado:       "bg-blue-100 text-blue-800",
  cobranca:           "bg-purple-100 text-purple-800",
  em_separacao:       "bg-indigo-100 text-indigo-800",
  faturado:           "bg-green-100 text-green-800",
  em_transporte:      "bg-teal-100 text-teal-800",
  entregue:           "bg-emerald-100 text-emerald-800",
  cancelado:          "bg-red-100 text-red-800",
};

interface Props {
  pedido_id: string;
}

export function SplitsPedidoSection({ pedido_id }: Props) {
  const navigate = useNavigate();

  const { data: splits, isLoading } = useQuery({
    queryKey: ["splits", pedido_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, estagio, valor_liquido, itens_json, data_entrega_prevista")
        .eq("split_de_pedido_id", pedido_id)
        .order("id_externo");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!pedido_id,
  });

  if (isLoading || !splits || splits.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scissors className="h-4 w-4" />
          Pedidos Split
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {splits.map((sp: any) => {
          const itens: any[] = Array.isArray(sp.itens_json) ? sp.itens_json : [];
          const cor = ESTAGIO_CORES[sp.estagio] ?? "bg-gray-100 text-gray-700";
          const label = ESTAGIO_LABELS[sp.estagio as EstagioPedido] ?? sp.estagio;

          return (
            <div key={sp.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className="font-medium inline-flex items-center gap-1 hover:underline"
                    onClick={() => navigate(`/pedidos/${sp.id}`)}
                  >
                    {sp.id_externo}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <Badge className={cor} variant="outline">{label}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {itens.length} {itens.length === 1 ? "item" : "itens"} ·{" "}
                  <span className="font-semibold text-foreground">{fmtBRL.format(sp.valor_liquido ?? 0)}</span>
                </div>
              </div>

              {sp.data_entrega_prevista && (
                <div className="text-xs text-muted-foreground">
                  Previsão: {new Date(sp.data_entrega_prevista + "T12:00:00").toLocaleDateString("pt-BR")}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate(`/pedidos/${sp.id}`)}
              >
                <ExternalLink className="h-3 w-3" />
                Abrir pedido
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
