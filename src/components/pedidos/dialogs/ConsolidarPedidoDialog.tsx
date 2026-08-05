import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Merge, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCandidatosConsolidacao, useConsolidarPedido, type CandidatoConsolidacao } from "@/hooks/pedidos/useConsolidarPedido";
import { ESTAGIO_LABELS, type EstagioPedido } from "@/types/pedido";

const rotuloEstagio = (e: string) => ESTAGIO_LABELS[e as EstagioPedido] ?? e.replace(/_/g, " ");

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string;
  parceiroId: string;
  naturezaId: string | null;
  valorBruto: number;
  valorFrete: number;
  valorLiquido: number;
  condicao: string | null;
  qtdTitulosAtivos: number;
}

export function ConsolidarPedidoDialog({
  open, onOpenChange, pedidoId, idExterno, parceiroId, naturezaId,
  valorBruto, valorFrete, valorLiquido, condicao, qtdTitulosAtivos,
}: Props) {
  const [selecionado, setSelecionado] = useState<CandidatoConsolidacao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const navigate = useNavigate();
  const { data: candidatos, isLoading } = useCandidatosConsolidacao(pedidoId, parceiroId, naturezaId, open);
  const consolidar = useConsolidarPedido();

  const elegiveis = (candidatos ?? []).filter((c) => c.recebivel_reversivel);
  const bloqueados = (candidatos ?? []).filter((c) => !c.recebivel_reversivel);

  const titulosDoCandidato = selecionado?.qtd_titulos_ativos ?? 0;
  const precisaAutorizar = qtdTitulosAtivos > 0 || titulosDoCandidato > 0;
  const candidatoMaior = !!selecionado && Number(selecionado.valor_liquido) > valorLiquido;
  const podeConfirmar =
    !!selecionado && motivo.trim().length >= 5 && (!precisaAutorizar || autoriza) && !consolidar.isPending;

  const novoBruto   = valorBruto + (selecionado?.valor_bruto ?? 0);
  const novoFrete   = valorFrete + (selecionado?.valor_frete ?? 0);
  const novoLiquido = valorLiquido + (selecionado?.valor_liquido ?? 0);

  const fechar = (v: boolean) => {
    if (!v) { setSelecionado(null); setMotivo(""); setAutoriza(false); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4" />
            Consolidar outro pedido em {idExterno}
          </DialogTitle>
          <DialogDescription>
            Os itens do pedido escolhido passam para {idExterno}, os valores somam e o pedido de origem é cancelado. Só pedidos do mesmo cliente e mesma natureza aparecem aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Buscando candidatos…</p>
          ) : elegiveis.length === 0 ? (
            bloqueados.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum outro pedido pré-NF deste cliente. Pedidos com NF emitida ou remessa viva não podem ser fundidos.
              </p>
            ) : null
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {elegiveis.map((c) => (
                <button
                  key={c.pedido_id}
                  onClick={() => setSelecionado(c)}
                  className={cn(
                    "w-full text-left rounded-md border px-3 py-2 transition",
                    selecionado?.pedido_id === c.pedido_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{c.id_externo}</span>
                    <span className="text-sm">{fmtBRL.format(Number(c.valor_liquido) || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{rotuloEstagio(c.estagio)}</Badge>
                    <span className="text-[11px] text-muted-foreground">{c.itens} {c.itens === 1 ? "item" : "itens"}</span>
                    {c.venda_origem_id_externo && (
                      <span className="text-[11px] text-muted-foreground">· remessa da venda {c.venda_origem_id_externo}</span>
                    )}
                  </div>
                  {c.condicao_solicitada && c.condicao_solicitada !== condicao && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      Condição diferente: {c.condicao_solicitada} → passa a {condicao ?? "condição deste pedido"}
                    </p>
                  )}
                  {c.qtd_titulos_ativos > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      Tem {c.qtd_titulos_ativos} título(s) ativo(s) — serão cancelados junto com os de {idExterno}.
                    </p>
                  )}
                  {Number(c.valor_liquido) > valorLiquido && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      Maior que {idExterno}. Quem sobrevive à fusão costuma ser o pedido maior — confira a direção.
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {bloqueados.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Outros pedidos deste cliente
              </p>
              {bloqueados.map((b) => (
                <div key={b.pedido_id} className="rounded-md border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{b.id_externo}</span>
                    <span className="text-sm">{fmtBRL.format(Number(b.valor_liquido) || 0)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {rotuloEstagio(b.estagio)} · {b.itens} {b.itens === 1 ? "item" : "itens"}
                    {b.qtd_titulos_ativos > 0 ? ` · ${b.qtd_titulos_ativos} título(s) ativo(s)` : ""}
                  </p>
                  <p className="text-[11px] text-amber-900 dark:text-amber-200">
                    Não pode ser fundido: {b.motivo_bloqueio ?? "recebível não reversível"}.
                  </p>
                </div>
              ))}
            </div>
          )}

          {selecionado && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Resultado</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor bruto</span><span>{fmtBRL.format(valorBruto)} → {fmtBRL.format(novoBruto)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{fmtBRL.format(novoFrete)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border/60 pt-1"><span>Valor líquido</span><span>{fmtBRL.format(valorLiquido)} → {fmtBRL.format(novoLiquido)}</span></div>
              <p className="text-[11px] text-muted-foreground pt-1">{selecionado.id_externo} será cancelado, com itens e valores zerados e trilha nos dois pedidos.</p>
              {candidatoMaior && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 gap-1.5 text-xs mt-1"
                  onClick={() => { const alvo = selecionado.pedido_id; fechar(false); navigate(`/pedidos/${alvo}`); }}
                >
                  <ArrowRight className="h-3 w-3" />
                  Prefiro manter {selecionado.id_externo} — abrir e consolidar de lá
                </Button>
              )}
            </div>
          )}

          {precisaAutorizar && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  Serão <strong>cancelados</strong>: {qtdTitulosAtivos} título(s) de {idExterno}{titulosDoCandidato > 0 && selecionado ? ` e ${titulosDoCandidato} título(s) de ${selecionado.id_externo}` : ""}. Os pedidos voltam para Cobrança e a cobrança precisa ser reoperada sobre o novo total. Títulos não são editados no lugar.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={autoriza} onCheckedChange={(v) => setAutoriza(v === true)} />
                <span className="text-xs">Autorizo cancelar e reemitir a cobrança</span>
              </label>
            </div>
          )}

          {selecionado && (
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Motivo (fica na timeline)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ex.: cliente pediu entrega e cobrança única"
              className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {motivo.trim().length > 0 && motivo.trim().length < 5 && (
              <p className="text-[10px] text-destructive">Mínimo de 5 caracteres.</p>
            )}
          </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={consolidar.isPending}>Cancelar</Button>
          {elegiveis.length > 0 && (
          <Button
            disabled={!podeConfirmar}
            onClick={() =>
              selecionado && consolidar.mutate(
                { idManter: pedidoId, idDescartar: selecionado.pedido_id, motivo: motivo.trim(), cancelarRecebivel: precisaAutorizar },
                { onSuccess: () => fechar(false) }
              )
            }
          >
            {consolidar.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Consolidando…</> : "Consolidar"}
          </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
