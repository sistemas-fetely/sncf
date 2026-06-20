import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, ArrowRight } from "lucide-react";

const DATA_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
function fmtData(d: string) {
  try { return DATA_FMT.format(new Date(d)); } catch { return d; }
}

const ESTAGIO_CORES: Record<string, string> = {
  recebido:           "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  em_analise_credito: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
  cobranca:           "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  aguardando_pagamento: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  aguardando_estoque: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  pre_faturado:       "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300",
  em_separacao:       "bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300",
  faturado:           "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
  em_transporte:      "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  entregue:           "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200",
};

const ESTAGIO_LABELS: Record<string, string> = {
  recebido:           "Recebido",
  em_analise_credito: "Em análise",
  cobranca:           "Cobrança",
  aguardando_pagamento: "Aguardando PG",
  aguardando_estoque: "Ag. estoque",
  pre_faturado:       "Pré-faturado",
  em_separacao:       "Em separação",
  faturado:           "Faturado",
  em_transporte:      "Em transporte",
  entregue:           "Entregue",
};

export default function CanalCPO() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["canal-cpo-page"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_eventos")
        .select(
          "id, pedido_id, tipo_evento, descricao, metadata, criado_em, pedidos(id_externo, estagio, cliente_nome_snapshot)"
        )
        .in("tipo_evento", ["msg_comercial", "msg_sops"])
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    refetchInterval: 60_000,
  });

  const conversas = useMemo(() => {
    const byPedido = new Map<
      string,
      {
        pedidoId: string; idExterno: string; estagio: string;
        cliente: string; lastTipo: string; lastMsg: string;
        lastAutor: string; lastTime: string;
      }
    >();
    for (const ev of eventos) {
      const pid = ev.pedido_id as string;
      if (!byPedido.has(pid)) {
        byPedido.set(pid, {
          pedidoId:   pid,
          idExterno:  ev.pedidos?.id_externo ?? pid.slice(0, 8).toUpperCase(),
          estagio:    ev.pedidos?.estagio ?? "",
          cliente:    ev.pedidos?.cliente_nome_snapshot ?? "—",
          lastTipo:   ev.tipo_evento as string,
          lastMsg:    (ev.descricao ?? "") as string,
          lastAutor:  (ev.metadata?.autor_nome ?? (ev.tipo_evento === "msg_comercial" ? "Comercial" : "SOPS")) as string,
          lastTime:   ev.criado_em as string,
        });
      }
    }
    return Array.from(byPedido.values());
  }, [eventos]);

  const pendentes = conversas.filter((c) => c.lastTipo === "msg_comercial");
  const lista = filtro === "pendentes" ? pendentes : conversas;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" style={{ color: "#185FA5" }} />
          <h1 className="text-xl font-semibold">Central de Mensagens</h1>
          {pendentes.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white">
              {pendentes.length}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Mensagens do comercial aguardando resposta do SOPS · atualiza a cada 60s
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFiltro("pendentes")}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            filtro === "pendentes"
              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Não respondidas ({pendentes.length})
        </button>
        <button
          onClick={() => setFiltro("todas")}
          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
            filtro === "todas"
              ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Todas as conversas ({conversas.length})
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>
            {filtro === "pendentes"
              ? "Nenhuma mensagem aguardando resposta."
              : "Nenhuma conversa registrada."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <div
              key={c.pedidoId}
              onClick={() => navigate(`/pedidos/${c.pedidoId}`)}
              className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{c.idExterno}</span>
                  {c.estagio && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${ESTAGIO_CORES[c.estagio] ?? "bg-muted text-muted-foreground"}`}>
                      {ESTAGIO_LABELS[c.estagio] ?? c.estagio}
                    </span>
                  )}
                  {c.lastTipo === "msg_comercial" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      aguardando resposta
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.cliente}</div>
                <div className="text-sm mt-2 line-clamp-2">
                  <span className="font-medium">{c.lastAutor}:</span>{" "}
                  {c.lastMsg}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtData(c.lastTime)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); navigate(`/pedidos/${c.pedidoId}`); }}
                >
                  Responder <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
