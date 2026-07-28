import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Undo2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { formatBRL, formatDateBR } from "@/lib/format-currency";

type AlocacaoRow = {
  alocacao_id: string | null;
  cpr_id: string | null;
  cpr_status_anterior: string | null;
  created_at: string | null;
  criado_por: string | null;
  mov_banco: string | null;
  mov_contraparte: string | null;
  mov_data: string | null;
  mov_descricao: string | null;
  mov_disponivel: number | null;
  mov_id: string | null;
  mov_meio: string | null;
  mov_valor: number | null;
  origem: string | null;
  pode_reverter_status: boolean | null;
  titulo_saldo: number | null;
  titulo_situacao: string | null;
  titulo_valor: number | null;
  valor_alocado: number | null;
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: "Manual",
  backfill: "Carga inicial",
  sugestao_confirmada: "Sugestão confirmada",
  vinculo_legado: "Vínculo automático",
};

function labelOrigem(o: string | null): string {
  if (!o) return "—";
  return ORIGEM_LABEL[o] ?? o;
}

function labelSituacao(s: string | null): string {
  switch (s) {
    case "pago":
      return "Pago";
    case "parcial":
      return "Parcialmente pago";
    case "nao_pago":
      return "Sem pagamentos";
    case "cancelado":
      return "Cancelado";
    default:
      return s ?? "—";
  }
}

type DesfazerResult = {
  ok?: boolean;
  erro?: string | null;
  valor_removido?: number | null;
  titulo_saldo_agora?: number | null;
  status_antes?: string | null;
  status_depois?: string | null;
  status_revertido?: boolean | null;
  movimentacao_liberada_para_fila?: boolean | null;
  movimentacao_disponivel_agora?: number | null;
  aviso?: string | null;
};

export default function PagamentosAlocacaoSection({
  contaId,
  enabled,
}: {
  contaId: string;
  enabled: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<AlocacaoRow | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["cpr-alocacoes", contaId],
    enabled: enabled && !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pagamento_alocacao_detalhe")
        .select("*")
        .eq("cpr_id", contaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AlocacaoRow[];
    },
  });

  if (isLoading || data.length === 0) return null;

  const totalAlocado = data.reduce((s, r) => s + Number(r.valor_alocado ?? 0), 0);
  const primeiro = data[0];
  const situacao = primeiro?.titulo_situacao ?? null;
  const saldo = Number(primeiro?.titulo_saldo ?? 0);
  const isParcial = situacao === "parcial";

  function fecharDialog() {
    setAlvo(null);
    setMotivo("");
  }

  async function confirmar() {
    if (!alvo?.alocacao_id) return;
    if (!motivo.trim()) return;
    setEnviando(true);
    try {
      const { data: resultado, error } = await supabase.rpc("desfazer_alocacao", {
        p_alocacao_id: alvo.alocacao_id,
        p_user_id: user?.id ?? undefined,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const r = (resultado ?? {}) as DesfazerResult;

      if (r.ok === false) {
        toast.error(r.erro || "Não foi possível desfazer o pagamento.");
        return;
      }

      const partes: string[] = [];
      partes.push(
        `Removidos ${formatBRL(Number(r.valor_removido ?? 0))}. Saldo do título: ${formatBRL(
          Number(r.titulo_saldo_agora ?? 0),
        )}.`,
      );
      if (r.status_revertido && r.status_antes && r.status_depois) {
        partes.push(`Status voltou de ${r.status_antes} para ${r.status_depois}.`);
      }
      if (r.movimentacao_liberada_para_fila) {
        partes.push("Movimentação voltou para a fila de conciliação.");
      }
      toast.success(partes.join(" "));

      if (r.aviso) toast.warning(r.aviso);

      qc.invalidateQueries({ queryKey: ["cpr-alocacoes", contaId] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["conciliacao-furos"] });
      qc.invalidateQueries({ queryKey: ["conciliacao-sug-cpr"] });
      qc.invalidateQueries({ queryKey: ["cp-historico", contaId] });

      fecharDialog();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao desfazer: " + msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          <Badge variant="secondary" className="text-[10px]">
            {data.length} {data.length === 1 ? "alocação" : "alocações"}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>
            Total alocado:{" "}
            <span className="font-semibold">{formatBRL(totalAlocado)}</span>
          </span>
          {isParcial ? (
            <span className="rounded-md px-2 py-0.5 bg-info/10 text-info font-medium">
              Faltam {formatBRL(saldo)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Saldo: {formatBRL(saldo)} · {labelSituacao(situacao)}
            </span>
          )}
        </div>
      </div>

      <ul className="divide-y rounded-md border">
        {data.map((r) => {
          const origemLabel = r.mov_contraparte?.trim() || r.mov_descricao?.trim() || "—";
          return (
            <li
              key={r.alocacao_id ?? Math.random().toString(36)}
              className="flex items-start gap-3 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    {formatBRL(Number(r.valor_alocado ?? 0))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateBR(r.created_at)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {labelOrigem(r.origem)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {formatDateBR(r.mov_data)}
                  {r.mov_banco ? ` · ${r.mov_banco}` : ""}
                  {" · "}
                  {origemLabel}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                title="Desfazer alocação"
                onClick={() => {
                  setAlvo(r);
                  setMotivo("");
                }}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!alvo} onOpenChange={(o) => !o && !enviando && fecharDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer alocação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {alvo && (
                  <div className="rounded-md bg-muted p-2 text-xs space-y-0.5">
                    <div>
                      Valor:{" "}
                      <span className="font-medium">
                        {formatBRL(Number(alvo.valor_alocado ?? 0))}
                      </span>
                    </div>
                    <div>Alocado em: {formatDateBR(alvo.created_at)}</div>
                    <div className="text-muted-foreground">
                      Movimentação: {formatDateBR(alvo.mov_data)}
                      {alvo.mov_banco ? ` · ${alvo.mov_banco}` : ""}
                      {" · "}
                      {alvo.mov_contraparte?.trim() ||
                        alvo.mov_descricao?.trim() ||
                        "—"}
                    </div>
                  </div>
                )}
                <div>
                  Esta ação remove o vínculo entre o pagamento e o título. O saldo do
                  título e a movimentação de origem serão recalculados.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo-desfazer" className="text-sm">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="motivo-desfazer"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que essa alocação está sendo desfeita?"
              rows={3}
              disabled={enviando}
            />
          </div>

          {alvo?.pode_reverter_status === false && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
              <span>
                Esta alocação é da carga inicial e não guarda o estado anterior do
                título. O pagamento será removido, mas o status do título não será
                revertido automaticamente.
              </span>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviando || !motivo.trim()}
              onClick={(e) => {
                e.preventDefault();
                void confirmar();
              }}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Desfazendo...
                </>
              ) : (
                "Desfazer alocação"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
