import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, ArrowRight, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ESTAGIO_SELO } from "@/components/pedidos/BadgesPedido";
import KpiPill from "@/pages/administrativo/CaixaBanco/KpiPill";
import type { EstagioPedido } from "@/types/pedido";
import {
  SOLICITACAO_TIPO_ROTULO,
  useAtenderSolicitacao,
  useContagemSolicitacoesPorStatus,
  useDescartarSolicitacao,
  useSolicitacoesPorStatus,
  type SolicitacaoComercial,
  type SolicitacaoStatus,
} from "@/hooks/pedidos/useSolicitacoesComercial";

/**
 * Central de Mensagens — fila de trabalho do SOPS.
 *
 * A AÇÃO MORA ONDE O OBJETO MORA: a fila lê `solicitacao_comercial`, que tem
 * ciclo de vida (`aberta`/`atendida`/`cancelada`), e nunca `pedido_eventos`,
 * que é log imutável de timeline. Consequência desejada: eventos informativos
 * automáticos (comprovante de pagamento) não aparecem mais aqui.
 *
 * RESPONDER NÃO CONCLUI: responder registra `msg_sops` no pedido; concluir é
 * `atender_solicitacao_comercial`. Dá para responder "estou vendo" sem resolver.
 */

const DATA_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
function fmtData(d: string) {
  try { return DATA_FMT.format(new Date(d)); } catch { return d; }
}

const ESTAGIO_LABELS: Record<string, string> = {
  recebido:             "Recebido",
  em_analise_credito:   "Em análise",
  cobranca:             "Cobrança",
  aguardando_pagamento: "Aguardando PG",
  aguardando_estoque:   "Ag. estoque",
  pre_separacao:        "Pré-Separação",
  pre_faturamento:      "Pré-Faturamento",
  em_separacao:         "Em separação",
  faturado:             "Faturado",
  em_transporte:        "Em transporte",
  entregue:             "Entregue",
};

const VAZIO: Record<SolicitacaoStatus, string> = {
  aberta: "Nenhuma solicitação aberta.",
  atendida: "Nenhuma solicitação concluída.",
  cancelada: "Nenhuma solicitação descartada.",
};

export default function CanalCPO() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SolicitacaoStatus>("aberta");
  const [concluir, setConcluir] = useState<SolicitacaoComercial | null>(null);
  const [descartar, setDescartar] = useState<SolicitacaoComercial | null>(null);
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: lista = [], isLoading } = useSolicitacoesPorStatus(status);
  const { data: contagens } = useContagemSolicitacoesPorStatus();
  const atender = useAtenderSolicitacao();
  const descartarMut = useDescartarSolicitacao();

  return (
    <PageShell>
      <PageHeader
        titulo="Central de Mensagens"
        icone={MessageCircle}
        estado="Solicitações do comercial ao SOPS · concluir e descartar registram na timeline do pedido"
      />

      <div className="flex flex-wrap gap-2">
        <KpiPill
          label="Abertas"
          count={contagens?.aberta ?? 0}
          color="blue"
          active={status === "aberta"}
          onClick={() => setStatus("aberta")}
        />
        <KpiPill
          label="Concluídas"
          count={contagens?.atendida ?? 0}
          color="emerald"
          active={status === "atendida"}
          onClick={() => setStatus("atendida")}
        />
        <KpiPill
          label="Descartadas"
          count={contagens?.cancelada ?? 0}
          color="gray"
          active={status === "cancelada"}
          onClick={() => setStatus("cancelada")}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>{VAZIO[status]}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-card transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate(`/pedidos/${s.pedido_id}`)}
                    className="font-mono text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
                  >
                    {s.pedido_id_externo || s.pedido_id.slice(0, 8).toUpperCase()}
                  </button>
                  {s.pedido_estagio && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        ESTAGIO_SELO[s.pedido_estagio as EstagioPedido] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {ESTAGIO_LABELS[s.pedido_estagio] ?? s.pedido_estagio}
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/10 text-info">
                    {SOLICITACAO_TIPO_ROTULO[s.tipo] ?? s.tipo}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.cliente_razao || "—"}
                </div>
                <div className="text-sm mt-2 whitespace-pre-wrap break-words">
                  {s.detalhe || "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Aberta por {s.criado_por_nome || "—"} · {fmtData(s.criado_em)}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/pedidos/${s.pedido_id}`)}
                >
                  Responder <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
                {s.status === "aberta" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => { setConcluir(s); setNota(""); }}
                    >
                      <Check className="h-3 w-3 mr-1" /> Concluir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => { setDescartar(s); setMotivo(""); }}
                    >
                      <X className="h-3 w-3 mr-1" /> Descartar
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Concluir — observação OPCIONAL */}
      <AlertDialog open={!!concluir} onOpenChange={(o) => !o && setConcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir solicitação</AlertDialogTitle>
            <AlertDialogDescription>
              {concluir
                ? `${SOLICITACAO_TIPO_ROTULO[concluir.tipo] ?? concluir.tipo} · pedido ${
                    concluir.pedido_id_externo ?? ""
                  }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Observação (opcional)</label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={atender.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!concluir) return;
                try {
                  await atender.mutateAsync({
                    solicitacaoId: concluir.id,
                    nota: nota.trim() || null,
                  });
                  setConcluir(null);
                } catch {
                  /* toast já exibido pelo hook */
                }
              }}
            >
              {atender.isPending ? "Salvando..." : "Concluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Descartar — motivo OBRIGATÓRIO */}
      <AlertDialog open={!!descartar} onOpenChange={(o) => !o && setDescartar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar solicitação</AlertDialogTitle>
            <AlertDialogDescription>
              {descartar
                ? `${SOLICITACAO_TIPO_ROTULO[descartar.tipo] ?? descartar.tipo} · pedido ${
                    descartar.pedido_id_externo ?? ""
                  }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">Motivo (obrigatório)</label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={descartarMut.isPending || !motivo.trim()}
              onClick={async (e) => {
                e.preventDefault();
                if (!descartar || !motivo.trim()) return;
                try {
                  await descartarMut.mutateAsync({
                    solicitacaoId: descartar.id,
                    motivo: motivo.trim(),
                  });
                  setDescartar(null);
                } catch {
                  /* toast já exibido pelo hook */
                }
              }}
            >
              {descartarMut.isPending ? "Salvando..." : "Descartar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
