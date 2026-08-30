import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ESTAGIO_LABELS } from "@/types/pedido";
import type { EstagioPedido } from "@/types/pedido";

const EVENTO_LABELS: Record<string, string> = {
  recebido: "📥 Pedido recebido",
  triado: "✓ Pedido triado",
  mudou_estagio: "🔄 Mudou estágio",
  mudou_area: "👤 Mudou área",
  alterado: "✏️ Alterado",
  cancelado: "❌ Cancelado",
  anotacao: "💬 Anotação",
  alerta_disparado: "⚠️ Alerta",
  pagamento_solicitado: "💳 Pagamento solicitado",
  pagamento_confirmado: "✅ Pagamento confirmado",
  exportado_bling: "📤 Exportado pro Bling",
  faturado: "🧾 Faturado",
  msg_comercial: "📩 do Comercial",
  msg_sops: "💬 do SOPS",
  outro: "•",
};

/**
 * Autoria do evento (view `vw_pedido_evento`). FAIL-LOUD: eventos sem autor
 * registrado aparecem em cor de alerta — marcam caminhos que perdem autoria.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Autoria({ ev }: { ev: any }) {
  if (ev.ator_tipo === "humano") {
    return <span>👤 {ev.ator_nome || "usuário removido"}</span>;
  }
  if (ev.ator_tipo === "sistema") {
    return (
      <span>
        ⚙️ Sistema
        {ev.ator_origem ? ` · ${ev.ator_origem}` : ""}
      </span>
    );
  }
  return <span className="text-warning">⚠️ autor não registrado</span>;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventos: any[];
}

export function PedidoTimeline({ eventos }: Props) {
  if (eventos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Timeline</span>
          <Badge variant="outline">{eventos.length} eventos</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative border-l border-border ml-3 space-y-4">
          {eventos.map((ev) => {
            const isCanalMsg =
              ev.tipo_evento === "msg_comercial" || ev.tipo_evento === "msg_sops";

            if (isCanalMsg) {
              const isCom = ev.tipo_evento === "msg_comercial";
              const autorNome =
                ev.metadata?.autor_nome ?? (isCom ? "Comercial" : "SOPS");
              return (
                <li key={ev.id} className="ml-4">
                  <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-info" />
                  <div className="text-xs text-muted-foreground">
                    {new Date(ev.criado_em).toLocaleString("pt-BR")}
                  </div>
                  <div className="text-sm font-medium text-info">
                    {isCom ? "📩 do Comercial" : "💬 do SOPS"} · {autorNome}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {ev.descricao_efetiva ?? ev.descricao}
                  </div>
                </li>
              );
            }

            return (
              <li key={ev.id} className="ml-4">
                <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                  <span>{new Date(ev.criado_em).toLocaleString("pt-BR")}</span>
                  <span>·</span>
                  <Autoria ev={ev} />
                  {ev.automatico && <span>· automático</span>}
                </div>
                <div className="text-sm font-medium">
                  {EVENTO_LABELS[ev.tipo_evento] || ev.tipo_evento}
                </div>
                {ev.estagio_de && ev.estagio_para && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {ESTAGIO_LABELS[ev.estagio_de as EstagioPedido] ||
                      ev.estagio_de}
                    {" → "}
                    <span className="font-medium text-foreground">
                      {ESTAGIO_LABELS[ev.estagio_para as EstagioPedido] ||
                        ev.estagio_para}
                    </span>
                  </div>
                )}
                {ev.forcado_sem_lastro && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">
                      forçado sem lastro
                    </Badge>
                    {ev.lastro_faltante && (
                      <span className="text-[11px] text-muted-foreground">
                        {String(ev.lastro_faltante)}
                      </span>
                    )}
                  </div>
                )}
                {ev.descricao_efetiva && (
                  <div className="text-sm text-muted-foreground mt-1 italic">
                    “{ev.descricao_efetiva}”
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
