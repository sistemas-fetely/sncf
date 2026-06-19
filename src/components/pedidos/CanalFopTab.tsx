import { useState } from "react";
import { useRegistrarEventoPedido } from "@/hooks/pedidos/useRegistrarEventoPedido";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, MessageCircle } from "lucide-react";

interface Props {
  pedidoId: string;
  eventos: any[];
}

const DATA_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtData(d: string): string {
  try { return DATA_FMT.format(new Date(d)); } catch { return d; }
}

export function CanalFopTab({ pedidoId, eventos }: Props) {
  const [texto, setTexto] = useState("");
  const registrar = useRegistrarEventoPedido();

  const canalEventos = (eventos ?? []).filter(
    (ev: any) =>
      ev.tipo_evento === "msg_comercial" || ev.tipo_evento === "msg_sops"
  );

  const handleResponder = async () => {
    const t = texto.trim();
    if (!t || registrar.isPending) return;
    await registrar.mutateAsync({
      pedido_id: pedidoId,
      tipo_evento: "msg_sops",
      descricao: t,
      metadata: {},
    });
    setTexto("");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {canalEventos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma mensagem do comercial ainda.
          </p>
        ) : (
          canalEventos.map((ev: any) => {
            const isCom = ev.tipo_evento === "msg_comercial";
            const autorNome =
              ev.metadata?.autor_nome ?? (isCom ? "Comercial" : "SOPS");
            return (
              <div
                key={ev.id}
                className={`rounded-lg border p-3 text-sm ${
                  isCom
                    ? "bg-blue-50/60 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30"
                    : "bg-emerald-50/60 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30"
                }`}
              >
                <p className="text-foreground whitespace-pre-wrap">
                  {ev.descricao}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {isCom ? "Comercial" : "SOPS"} · {autorNome} ·{" "}
                  {fmtData(ev.criado_em)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleResponder();
            }
          }}
          placeholder="Responder ao Comercial… (Ctrl+Enter para enviar)"
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleResponder}
            disabled={!texto.trim() || registrar.isPending}
          >
            {registrar.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Enviando…
              </>
            ) : (
              "Responder"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
