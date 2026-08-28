import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, AlertTriangle, Lock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";
import { ImpactoEdicaoBanner } from "@/components/pedidos/ImpactoEdicaoBanner";
import { ReabrirAnaliseAction } from "@/components/pedidos/ReabrirAnaliseAction";
import { usePedidoEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { useFreteTipos } from "@/hooks/pedidos/useFreteTipos";
import { useAuth } from "@/contexts/AuthContext";
import { ESTAGIO_LABELS } from "@/types/pedido";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno?: string | null;
  valorBruto: number;
  bonusPixValor?: number | null;
  condicaoAtual?: string | null;
  /** Estágio do pedido — necessário para consultar a dimensão pedido_edicao_campo. */
  estagio?: string | null;
  freteTipo?: string | null;
  valorFrete?: number | null;
  descontoAtualValor?: number | null;
  descontoAtualPct?: number | null;
}

type Tipo = "pct" | "valor";

const rotuloEstagio = (e: string) =>
  (ESTAGIO_LABELS as Record<string, string>)[e] ?? e.replace(/_/g, " ");

export function AjustarDescontoDialog({
  open, onClose, pedidoId, idExterno, valorBruto, bonusPixValor, condicaoAtual,
  estagio, freteTipo, valorFrete, descontoAtualValor, descontoAtualPct,
}: Props) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Tipo>("pct");
  const [valorStr, setValorStr] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  // A regra de o-que-pode-ser-editado mora na dimensão, nunca no TSX.
  const dim = usePedidoEdicaoCampo(estagio ?? null);
  const regra = dim.regraDe("desconto");
  const estagiosPermitidos = dim.estagiosPermitidos("desconto");
  const { roles } = useAuth();
  const papeis = (roles ?? []) as string[];
  const exigePapel = regra?.exige_papel ?? null;
  const temPapel =
    !exigePapel || exigePapel.length === 0 || exigePapel.some((p) => papeis.includes(p));
  const exigeMotivo = !!regra?.exige_motivo;
  const permitido = !!regra?.permitido;

  const { getFreteTipo, freteEntraNoLiquido } = useFreteTipos();
  const freteDim = getFreteTipo(freteTipo);
  const freteConta = freteEntraNoLiquido(freteTipo);
  const frete = Number(valorFrete || 0);
  const freteEfetivo = freteConta ? frete : 0;

  const bonus = Number(bonusPixValor || 0);
  const bruto = Number(valorBruto || 0);
  const preenchido = String(valorStr).trim() !== "";
  const valorNum = Number(String(valorStr).replace(",", ".")) || 0;

  const novoDesconto = useMemo(() => {
    if (tipo === "pct") return (bruto * valorNum) / 100;
    return valorNum;
  }, [tipo, bruto, valorNum]);

  const novoLiquido = bruto - novoDesconto - bonus + freteEfetivo;
  const liquidoNegativo = novoLiquido < 0;

  const mutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("alterar_desconto_pedido", {
        p_pedido_id: pedidoId,
        p_tipo: tipo,
        p_valor: valorNum,
        p_motivo: motivo.trim() || null,
      });
      if (error) throw error;
      if (data && typeof data === "object" && data.ok === false) {
        throw new Error(data.erro || "Erro ao ajustar desconto.");
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Desconto ajustado com sucesso.");
      invalidarPedido(qc, pedidoId);
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
      handleClose();
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível ajustar o desconto.");
    },
  });

  function handleClose() {
    if (mutation.isPending) return;
    setTipo("pct");
    setValorStr("");
    setMotivo("");
    onClose();
  }

  const motivoOk = !exigeMotivo || motivo.trim().length >= 3;
  const bloqueado = !dim.isLoading && !permitido;
  const podeConfirmar =
    preenchido && valorNum >= 0 && !liquidoNegativo && motivoOk && temPapel &&
    permitido && !dim.isLoading && !mutation.isPending;

  const tooltipPapel = !temPapel ? `Requer papel: ${(exigePapel || []).join(", ")}` : null;

  const botaoConfirmar = (
    <Button onClick={() => mutation.mutate()} disabled={!podeConfirmar}>
      {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
      Confirmar
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar desconto{idExterno ? ` — ${idExterno}` : ""}</DialogTitle>
          <DialogDescription>
            Altera o desconto do pedido. Bloqueado se houver título a receber ativo ou remessa não cancelada.
          </DialogDescription>
        </DialogHeader>

        {bloqueado ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              {regra?.observacao
                ? regra.observacao
                : `Desconto não é editável com o pedido em ${rotuloEstagio(String(estagio ?? ""))}.`}
              {estagiosPermitidos.length > 0 && (
                <> Permitido em: {estagiosPermitidos.map(rotuloEstagio).join(", ")}.</>
              )}
            </AlertDescription>
          </Alert>
        ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de desconto</Label>
            <RadioGroup
              value={tipo}
              onValueChange={(v) => setTipo(v as Tipo)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="pct" id="tipo-pct" />
                <span className="text-sm">Percentual (%)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="valor" id="tipo-valor" />
                <span className="text-sm">Valor (R$)</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor-desconto">
              {tipo === "pct" ? "Percentual (%)" : "Valor (R$)"}
            </Label>
            <Input
              id="valor-desconto"
              type="number"
              inputMode="decimal"
              min="0"
              step={tipo === "pct" ? "0.01" : "0.01"}
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder={tipo === "pct" ? "Ex.: 5" : "Ex.: 150,00"}
            />
          </div>

          <div className="text-sm">
            {Number(descontoAtualValor || 0) > 0 ? (
              <>
                <span className="text-muted-foreground">Desconto atual: </span>
                <span className="font-medium">
                  {Number(descontoAtualPct || 0).toFixed(2)}% · {formatBRL(Number(descontoAtualValor || 0))}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Sem desconto aplicado</span>
            )}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
            <div className="text-xs text-muted-foreground border-b pb-1.5 mb-1.5">
              Projeção com o valor digitado
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor bruto</span>
              <span className="font-medium">{formatBRL(bruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="font-medium text-destructive">− {formatBRL(novoDesconto)}</span>
            </div>
            {bonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bônus PIX</span>
                <span className="font-medium text-destructive">− {formatBRL(bonus)}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Frete
                {!freteConta && (
                  <span className="ml-1 text-xs text-muted-foreground/70">
                    não cobrado do cliente{freteDim?.rotulo ? ` (${freteDim.rotulo})` : ""}
                  </span>
                )}
              </span>
              {freteConta ? (
                <span className="font-medium">+ {formatBRL(frete)}</span>
              ) : (
                <span className="text-muted-foreground/60 line-through">{formatBRL(frete)}</span>
              )}
            </div>
            <div className="flex justify-between border-t pt-1.5 mt-1.5">
              <span className="text-muted-foreground">Novo líquido</span>
              <span className={`font-medium text-base ${liquidoNegativo ? "text-destructive" : ""}`}>
                {formatBRL(novoLiquido)}
              </span>
            </div>
          </div>

          {liquidoNegativo && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>O líquido não pode ser negativo.</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="motivo">
              {exigeMotivo ? (
                <>Motivo <span className="text-destructive">*</span></>
              ) : (
                "Motivo (opcional)"
              )}
            </Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: alinhamento com cliente"
              rows={2}
            />
            {exigeMotivo && (
              <p className={`text-xs ${motivoOk ? "text-muted-foreground" : "text-destructive"}`}>
                {motivo.trim().length}/3 caracteres mínimos
              </p>
            )}
          </div>

          {condicaoAtual && (
            <>
              <ImpactoEdicaoBanner
                pedidoId={pedidoId}
                novaCondicao={condicaoAtual}
                novoValorLiquido={novoLiquido}
                enabled={preenchido && !liquidoNegativo}
              />
              <ReabrirAnaliseAction
                pedidoId={pedidoId}
                novaCondicao={condicaoAtual}
                novoValorLiquido={novoLiquido}
                enabled={preenchido && !liquidoNegativo}
                onSuccess={handleClose}
              />
            </>
          )}
        </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          {!bloqueado && (
            <Button
              variant="outline"
              onClick={() => { setTipo("valor"); setValorStr("0"); }}
              disabled={mutation.isPending}
            >
              Zerar desconto
            </Button>
          )}
          {tooltipPapel ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{botaoConfirmar}</span>
                </TooltipTrigger>
                <TooltipContent>{tooltipPapel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            botaoConfirmar
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
