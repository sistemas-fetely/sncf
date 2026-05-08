import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Check,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface MovimentacaoLite {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
}

interface ContaLite {
  id: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  fornecedor_cliente: string | null;
  nf_numero: string | null;
  parceiros_comerciais?: { razao_social: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  movimentacao: MovimentacaoLite | null;
  conta: ContaLite | null;
  onSuccess: () => void;
}

type AcaoDivergencia = "ajustar" | "manter" | null;

export function ConfirmarMatchDialog({
  open,
  onOpenChange,
  movimentacao,
  conta,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [acao, setAcao] = useState<AcaoDivergencia>(null);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!movimentacao || !conta) return null;

  const valorMov = Math.abs(movimentacao.valor);
  const valorConta = Math.abs(conta.valor);
  const diferenca = valorMov - valorConta;
  const diferencaAbs = Math.abs(diferenca);
  const percentDif = (diferencaAbs / valorConta) * 100;

  const isMatchExato = diferencaAbs < 0.01;
  const isMatchAceitavel = percentDif <= 5;

  async function handleConfirmar() {
    if (!isMatchExato && !acao) {
      toast.error("Escolha como tratar a divergência");
      return;
    }

    setSalvando(true);
    try {
      const conciliadoEm = new Date().toISOString();

      const { error: e1 } = await supabase
        .from("movimentacoes_bancarias")
        .update({
          conciliado: true,
          conta_pagar_id: conta!.id,
          conciliado_em: conciliadoEm,
          conciliado_por: user?.id || null,
        })
        .eq("id", movimentacao!.id);
      if (e1) throw e1;

      const updateConta: Record<string, unknown> = {
        movimentacao_bancaria_id: movimentacao!.id,
        conciliado_em: conciliadoEm,
        conciliado_por: user?.id || null,
      };

      if (acao === "ajustar") {
        updateConta.valor = valorMov;
      }

      const obsExtra = isMatchExato
        ? null
        : acao === "ajustar"
          ? "Valor ajustado na conciliacao: R$ " + valorConta.toFixed(2) + " -> R$ " + valorMov.toFixed(2) + (observacao ? " - " + observacao : "")
          : "Conciliado com divergencia de R$ " + diferencaAbs.toFixed(2) + (observacao ? " - " + observacao : "");
      if (obsExtra) {
        updateConta.observacao_pagamento_manual = obsExtra;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: e2 } = await (supabase as any)
        .from("contas_pagar_receber")
        .update(updateConta)
        .eq("id", conta!.id);
      if (e2) throw e2;

      try {
        const obsHistorico = isMatchExato
          ? "Conciliado com extrato bancario"
          : acao === "ajustar"
            ? "Conciliado + valor ajustado: R$ " + valorConta.toFixed(2) + " -> R$ " + valorMov.toFixed(2) + (observacao ? " (" + observacao + ")" : "")
            : "Conciliado com divergencia R$ " + diferencaAbs.toFixed(2) + (observacao ? " (" + observacao + ")" : "");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("contas_pagar_historico").insert({
          conta_id: conta!.id,
          status_anterior: "finalizado",
          status_novo: "finalizado",
          observacao: obsHistorico,
          usuario_id: user?.id || null,
        });
      } catch (e) {
        console.warn("Falha historico (nao bloqueante):", e);
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      toast.success(
        isMatchExato
          ? "Match confirmado"
          : acao === "ajustar"
            ? "Match confirmado com valor ajustado"
            : "Match confirmado com divergencia registrada",
      );
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg = err?.message || err?.details || JSON.stringify(err);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  if (!isMatchExato && !isMatchAceitavel) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Diferença muito grande
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>
              A diferença entre o valor do extrato e da conta a pagar é de{" "}
              <strong className="text-destructive">{formatBRL(diferencaAbs)}</strong>{" "}
              ({percentDif.toFixed(1)}%).
            </p>
            <p className="text-muted-foreground">
              Diferenças acima de 5% normalmente indicam match incorreto. Verifique se selecionou o lançamento certo.
            </p>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extrato:</span>
                <span className="font-mono font-semibold">{formatBRL(valorMov)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conta sistema:</span>
                <span className="font-mono">{formatBRL(valorConta)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Diferença:</span>
                <span className="font-mono font-semibold text-destructive">
                  {formatBRL(diferencaAbs)}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Voltar e revisar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isMatchExato ? (
              <>
                <Check className="h-5 w-5 text-emerald-600" />
                Confirmar conciliação
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Há uma divergência de valor
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isMatchExato
              ? "Os valores batem exatamente. Confirme pra finalizar a conciliação."
              : "Diferença de " + formatBRL(diferencaAbs) + " (" + percentDif.toFixed(1) + "%) entre extrato e sistema."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <div className="rounded-md border p-3 bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                Extrato
              </p>
              <div className="text-xs text-muted-foreground truncate" title={movimentacao.descricao}>
                {movimentacao.descricao}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateBR(movimentacao.data_transacao)}
              </div>
              <div className="text-lg font-mono font-bold mt-1">
                {formatBRL(valorMov)}
              </div>
            </div>
            <div className="hidden md:flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                Sistema
              </p>
              <div className="text-xs text-muted-foreground truncate">
                {conta.parceiros_comerciais?.razao_social || conta.fornecedor_cliente}
                {conta.nf_numero && " - NF " + conta.nf_numero}
              </div>
              <div className="text-xs text-muted-foreground">
                Venc: {formatDateBR(conta.data_vencimento)}
              </div>
              <div className="text-lg font-mono font-bold mt-1">
                {formatBRL(valorConta)}
              </div>
            </div>
          </div>

          {!isMatchExato && (
            <>
              <div
                className={
                  diferenca > 0
                    ? "rounded-md border p-3 text-center bg-amber-50 border-amber-200"
                    : "rounded-md border p-3 text-center bg-blue-50 border-blue-200"
                }
              >
                <p className="text-xs text-muted-foreground">
                  {diferenca > 0
                    ? "Extrato é MAIOR que sistema (diferença a mais)"
                    : "Extrato é MENOR que sistema (diferença a menos)"}
                </p>
                <p className="text-lg font-mono font-bold mt-1">
                  {diferenca > 0 ? "+" : "−"} {formatBRL(diferencaAbs)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Possíveis causas: tarifa bancária, juros, multa, IOF, valor digitado errado.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Como tratar a divergência?</Label>
                <RadioGroup
                  value={acao || ""}
                  onValueChange={(v) => setAcao(v as AcaoDivergencia)}
                >
                  <div className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted/30 cursor-pointer">
                    <RadioGroupItem value="ajustar" id="ajustar" className="mt-0.5" />
                    <Label htmlFor="ajustar" className="cursor-pointer flex-1">
                      <div className="font-medium text-sm">
                        Ajustar valor da conta para {formatBRL(valorMov)}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Sobrescreve o valor da conta a pagar. Use quando o valor do sistema estava errado.
                      </p>
                    </Label>
                  </div>

                  <div className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted/30 cursor-pointer">
                    <RadioGroupItem value="manter" id="manter" className="mt-0.5" />
                    <Label htmlFor="manter" className="cursor-pointer flex-1">
                      <div className="font-medium text-sm">
                        Manter valores e registrar divergência
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Mantém os valores como estão. Use quando a diferença é uma tarifa/juros que será lançada à parte.
                      </p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1">
                <Label className="text-sm">
                  Observação <span className="text-muted-foreground text-xs">(opcional, mas recomendado)</span>
                </Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Tarifa de TED, Juros por atraso, Valor original estava errado no sistema"
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={salvando || (!isMatchExato && !acao)}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Confirmar conciliação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
