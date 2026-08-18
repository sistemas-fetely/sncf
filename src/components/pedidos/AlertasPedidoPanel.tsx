import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { Button } from "@/components/ui/button";
import { useAchadosPedido } from "@/hooks/pedidos/useAchadosPedido";

const SEV_ESTADO: Record<string, EstadoSelo> = {
  bloqueante: "destructive",
  atencao: "warning",
  informativo: "muted",
};

const SEV_ROTULO: Record<string, string> = {
  bloqueante: "Bloqueante",
  atencao: "Atenção",
  informativo: "Informativo",
};

/**
 * Canal único de alerta operacional do pedido: os achados vivos da auditoria.
 * Regra nova no banco acende aqui sozinha, sem tocar em tela.
 */
export function AlertasPedidoPanel({ pedidoId }: { pedidoId: string }) {
  const { data: achados } = useAchadosPedido(pedidoId);
  const [aberto, setAberto] = useState(true);

  if (!achados || achados.length === 0) return null;

  const recolhivel = achados.length > 2;
  const mostrar = !recolhivel || aberto;

  return (
    <div className="mx-6 mb-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Alertas da auditoria
          </p>
          <span className="text-xs text-muted-foreground tabular-nums">
            {achados.length} {achados.length === 1 ? "achado" : "achados"}
          </span>
        </div>
        {recolhivel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs text-muted-foreground"
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {aberto ? "Recolher" : "Ver todos"}
          </Button>
        )}
      </div>

      {mostrar && (
        <ul className="mt-2 space-y-2">
          {achados.map((a) => {
            const sev = a.severidade ?? "informativo";
            return (
              <li key={a.id} className="rounded-md border border-border bg-background p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Selo estado={SEV_ESTADO[sev] ?? "muted"}>{SEV_ROTULO[sev] ?? sev}</Selo>
                  {a.reincidente && <Selo estado="warning">Reincidente</Selo>}
                  <span className="text-sm font-medium text-foreground">
                    {a.regra_titulo ?? "Achado sem título"}
                  </span>
                </div>
                {a.detalhe && <p className="mt-1 text-sm text-foreground">{a.detalhe}</p>}
                {a.o_que_significa && (
                  <p className="mt-1 text-xs text-muted-foreground">{a.o_que_significa}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {a.idade_dias != null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      há {a.idade_dias} {a.idade_dias === 1 ? "dia" : "dias"}
                    </span>
                  )}
                  {a.rota_acao && a.rotulo_acao && (
                    <Link
                      to={a.rota_acao}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {a.rotulo_acao}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
