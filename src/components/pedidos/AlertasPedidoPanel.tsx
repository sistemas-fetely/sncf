import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { abrirDetalhe } from "@/lib/navegacao/abrirDetalhe";
import { useQueryClient } from "@tanstack/react-query";
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
import { formatBRL } from "@/lib/format-currency";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import {
  useAchadosPedido,
  chaveCardsPedido,
  type CardAuditoria,
} from "@/hooks/pedidos/useAchadosPedido";

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

type AcaoCard = "assumir" | "resolver" | "nao_e_problema";
const TOAST_ACAO: Record<AcaoCard, string> = {
  assumir: "Assumido",
  resolver: "Resolvido",
  nao_e_problema: "Registrado",
};

/**
 * Canal único de alerta operacional do pedido: um card por problema
 * (vw_auditoria_card agrupa os achados da mesma causa). Texto vem do banco.
 */
export function AlertasPedidoPanel({ pedidoId }: { pedidoId: string }) {
  const { data: cards } = useAchadosPedido(pedidoId);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cardChamado, setCardChamado] = useState<CardAuditoria | null>(null);
  const [dialogoAcao, setDialogoAcao] = useState<{ card: CardAuditoria; acao: AcaoCard } | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { podeEditar } = usePermissoesTela("tela.pedidos");
  const navigate = useNavigate();
  const location = useLocation();

  if (!cards || cards.length === 0) return null;

  const recolhivel = cards.length > 2;
  const mostrar = !recolhivel || aberto;

  async function tratar(card: CardAuditoria, acao: AcaoCard, notaTxt: string | null) {
    setEnviando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_auditoria_tratar_card", {
        p_card_id: card.card_id,
        p_acao: acao,
        p_nota: notaTxt,
      });
      if (error) throw error;
      const r = data as { ok?: boolean; erro?: string } | null;
      if (!r?.ok) {
        toast.error(r?.erro ?? "O banco recusou a ação sem dizer o motivo.");
        return;
      }
      await qc.invalidateQueries({ queryKey: chaveCardsPedido(pedidoId) });
      toast.success(TOAST_ACAO[acao]);
      setDialogoAcao(null);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  // A RPC e idempotente: achado que ja tem chamado devolve o existente.
  async function confirmarChamado() {
    const achadoId = cardChamado?.achado_ids?.[0];
    if (!achadoId) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("abrir_incidente_de_achado", {
        p_achado_id: achadoId,
        p_nota: nota.trim() ? nota.trim() : null,
      });
      if (error) throw error;
      toast.success("Chamado aberto.");
      setCardChamado(null);
      abrirDetalhe(navigate, location, `/chamados/${data as unknown as string}`, { label: "Pedido" });
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setEnviando(false);
    }
  }

  function botao(rotulo: ReactNode, onClick: () => void, chave: string) {
    if (podeEditar) {
      return (
        <Button key={chave} variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onClick} disabled={enviando}>
          {rotulo}
        </Button>
      );
    }
    return (
      <Tooltip key={chave}>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled>
              {rotulo}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Você tem acesso somente leitura nesta tela</TooltipContent>
      </Tooltip>
    );
  }

  const alternarDetalhe = (id: string) =>
    setExpandidos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const notaObrigatoria = dialogoAcao?.acao === "nao_e_problema";

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
              {cards.length} {cards.length === 1 ? "problema" : "problemas"}
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
            {cards.map((c) => {
              const sev = c.severidade ?? "informativo";
              const valor = c.valor_impacto != null && c.valor_impacto > 0 ? c.valor_impacto : null;
              const mostraRota = !!c.rota_acao && !!c.rotulo_acao && !c.rota_acao.startsWith("/pedidos");
              const souDono = !!user?.id && c.dono_user_id === user.id;
              const detalhes = c.detalhes ?? [];
              const temDetalhe = (c.n_achados ?? 0) > 1 || detalhes.length > 0;
              const nRegistros = detalhes.length || c.n_achados || 0;
              const detAberto = expandidos.has(c.card_id);
              return (
                <li key={c.card_id} className="rounded-md border border-border bg-background p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Selo estado={SEV_ESTADO[sev] ?? "muted"}>{SEV_ROTULO[sev] ?? c.severidade_rotulo ?? sev}</Selo>
                    {c.reincidente && <Selo estado="warning">Reincidente</Selo>}
                    {c.situacao === "em_analise" && <Selo estado="muted">Em análise</Selo>}
                    <span className="text-sm font-medium text-foreground">{c.titulo ?? "Problema sem título"}</span>
                  </div>
                  {(c.explicacao || valor) && (
                    <p className="mt-1 text-sm text-foreground">
                      {valor && <span className="tabular-nums">{formatBRL(valor)} · </span>}
                      {c.explicacao}
                    </p>
                  )}
                  {c.o_que_fazer && <p className="mt-1 text-xs text-muted-foreground">{c.o_que_fazer}</p>}

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {c.idade_dias != null && (
                      <span className="tabular-nums">
                        há {c.idade_dias} {c.idade_dias === 1 ? "dia" : "dias"}
                      </span>
                    )}
                    <span>{c.dono_user_id ? `com ${c.dono_nome || "usuário sem nome"}` : "sem dono"}</span>
                    {mostraRota && (
                      <Link to={c.rota_acao!} className="underline underline-offset-2 hover:text-foreground">
                        {c.rotulo_acao}
                      </Link>
                    )}
                    {!souDono && botao("Assumir", () => tratar(c, "assumir", null), "assumir")}
                    {botao("Resolver", () => { setNota(""); setDialogoAcao({ card: c, acao: "resolver" }); }, "resolver")}
                    {botao("Não é problema", () => { setNota(""); setDialogoAcao({ card: c, acao: "nao_e_problema" }); }, "nao")}
                    {c.chamado_id ? (
                      <Link to={`/chamados/${c.chamado_id}`} state={{ from: location.pathname + location.search, fromLabel: "Pedido" }} className="underline underline-offset-2 hover:text-foreground">
                        Ver chamado →
                      </Link>
                    ) : sev === "bloqueante" && c.pode_abrir_chamado === true && (c.achado_ids?.length ?? 0) > 0 ? (
                      botao(<><Ticket className="h-3.5 w-3.5" /> Abrir chamado</>, () => { setNota(""); setCardChamado(c); }, "chamado")
                    ) : null}
                  </div>

                  {temDetalhe && (
                    <div className="mt-1">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        onClick={() => alternarDetalhe(c.card_id)}
                      >
                        {detAberto ? "ocultar detalhe técnico" : `ver detalhe técnico (${nRegistros} ${nRegistros === 1 ? "registro" : "registros"})`}
                      </button>
                      {detAberto && detalhes.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {detalhes.map((d, i) => (
                            <li key={d.achado_id ?? i}>
                              {d.regra && <span className="font-mono">{d.regra}</span>}
                              {d.detalhe && <> — {d.detalhe}</>}
                              {d.valor != null && d.valor !== "" && (
                                <span className="tabular-nums"> · {typeof d.valor === "number" ? formatBRL(d.valor) : String(d.valor)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!dialogoAcao} onOpenChange={(v) => { if (!v) setDialogoAcao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{notaObrigatoria ? "Não é problema" : "Resolver"}</DialogTitle>
            <DialogDescription>
              {notaObrigatoria
                ? "Explique por que isso não é problema. Fica registrado e não volta a aparecer."
                : "Marque como resolvido. A nota é opcional."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{dialogoAcao?.card.titulo ?? "Problema sem título"}</p>
            <div className="space-y-1.5">
              <Label htmlFor="nota-tratar-card">{notaObrigatoria ? "Motivo" : "Nota (opcional)"}</Label>
              <Textarea id="nota-tratar-card" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAcao(null)} disabled={enviando}>Cancelar</Button>
            <Button
              disabled={enviando || !podeEditar || (notaObrigatoria && !nota.trim())}
              onClick={() => dialogoAcao && tratar(dialogoAcao.card, dialogoAcao.acao, nota.trim() || null)}
            >
              {enviando ? "Salvando..." : notaObrigatoria ? "Registrar" : "Resolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cardChamado} onOpenChange={(v) => { if (!v) setCardChamado(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir chamado a partir deste alerta</DialogTitle>
            <DialogDescription>
              O chamado nasce ligado a este alerta. Se já existir um, você vai para ele.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Problema</p>
              <p className="text-sm font-medium">{cardChamado?.titulo ?? "Problema sem título"}</p>
            </div>
            {cardChamado?.explicacao && (
              <div>
                <p className="text-xs text-muted-foreground">Detalhe</p>
                <p className="text-sm">{cardChamado.explicacao}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nota-abrir-chamado">Nota de quem abriu (opcional)</Label>
              <Textarea id="nota-abrir-chamado" value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCardChamado(null)} disabled={enviando}>Cancelar</Button>
            <Button onClick={confirmarChamado} disabled={enviando}>
              {enviando ? "Abrindo..." : "Abrir chamado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
