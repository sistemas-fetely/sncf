import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, AlertTriangle, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { useAchadosPedido, type AchadoPedido } from "@/hooks/pedidos/useAchadosPedido";

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
  const [achadoDialogo, setAchadoDialogo] = useState<AchadoPedido | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { podeEditar } = usePermissoesTela("tela.pedidos");
  const navigate = useNavigate();

  if (!achados || achados.length === 0) return null;

  const recolhivel = achados.length > 2;
  const mostrar = !recolhivel || aberto;

  function abrirDialogo(a: AchadoPedido) {
    setAchadoDialogo(a);
    setNota("");
  }

  // A RPC e idempotente: achado que ja tem chamado devolve o existente.
  async function confirmar() {
    if (!achadoDialogo) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("abrir_incidente_de_achado", {
        p_achado_id: achadoDialogo.id,
        p_nota: nota.trim() ? nota.trim() : null,
      });
      if (error) throw error;
      toast.success("Chamado aberto.");
      setAchadoDialogo(null);
      navigate(`/chamados/${data as unknown as string}`);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TooltipProvider>
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
                    {a.chamado_id ? (
                      <Link
                        to={`/chamados/${a.chamado_id}`}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Ver chamado →
                      </Link>
                    ) : sev === "bloqueante" && a.pode_abrir_chamado === true ? (
                      (podeEditar ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => abrirDialogo(a)}
                        >
                          <Ticket className="h-3.5 w-3.5" /> Abrir chamado
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 text-xs"
                                disabled
                              >
                                <Ticket className="h-3.5 w-3.5" /> Abrir chamado
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Você tem acesso somente leitura nesta tela
                          </TooltipContent>
                        </Tooltip>
                      ))
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={!!achadoDialogo}
        onOpenChange={(v) => {
          if (!v) setAchadoDialogo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir chamado a partir deste achado</DialogTitle>
            <DialogDescription>
              O chamado nasce ligado a este achado. Se já existir um, você vai para ele.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Regra</p>
              <p className="text-sm font-medium">
                {achadoDialogo?.regra_titulo ?? "Achado sem título"}
              </p>
            </div>
            {achadoDialogo?.detalhe && (
              <div>
                <p className="text-xs text-muted-foreground">Detalhe</p>
                <p className="text-sm">{achadoDialogo.detalhe}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nota-abrir-chamado">Nota de quem abriu (opcional)</Label>
              <Textarea
                id="nota-abrir-chamado"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAchadoDialogo(null)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={enviando}>
              {enviando ? "Abrindo..." : "Abrir chamado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
