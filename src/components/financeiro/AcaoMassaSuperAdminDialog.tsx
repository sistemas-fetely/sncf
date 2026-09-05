import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ContaParaProcessar {
  id: string;
  status: string;
}

type Modo = "finalizar_legado" | "definir_meio";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contas: ContaParaProcessar[];
  modo: Modo;
  onDone: () => void;
}

export function AcaoMassaSuperAdminDialog({
  open,
  onOpenChange,
  contas,
  modo,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [formaPagamentoId, setFormaPagamentoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmou, setConfirmou] = useState(false);
  const [executando, setExecutando] = useState(false);

  const { data: formasPagamento } = useQuery({
    queryKey: ["formas-pagamento-ativas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("formas_pagamento")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return data || [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setFormaPagamentoId("");
    setConfirmou(false);
    setObservacao(
      modo === "finalizar_legado"
        ? "Migração de legado - finalizado em massa pulando fluxo"
        : "Meio de pagamento definido em massa",
    );
  }, [open, modo]);

  async function handleExecutar() {
    if (!formaPagamentoId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    if (modo === "finalizar_legado" && !confirmou) {
      toast.error("Confirme a ação clicando no checkbox");
      return;
    }

    setExecutando(true);

    try {
      const ids = contas.map((c) => c.id);

      if (modo === "definir_meio") {
        // Apenas atualiza forma_pagamento_id (sem mexer no status)
        const { error } = await supabase
          .from("contas_pagar_receber")
          .update({ forma_pagamento_id: formaPagamentoId })
          .in("id", ids);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["contas-pagar"] });
        toast.success(`${contas.length} contas atualizadas com forma de pagamento`);
      } else {
        // finalizar_legado: forma de pagamento + transição via RPC do trilho
        const { error: errForma } = await supabase
          .from("contas_pagar_receber")
          .update({ forma_pagamento_id: formaPagamentoId })
          .in("id", ids);
        if (errForma) throw errForma;

        const novoStatus = "finalizado";
        const motivo = observacao || "Ação em massa (legado)";
        let ok = 0;
        const falhas: { id: string; motivo: string }[] = [];

        for (const c of contas) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc("fn_titulo_pagar_transicionar", {
              p_cpr_id: c.id,
              p_para: novoStatus,
              p_motivo: motivo,
              p_data_pretendida: null,
            });
            if (error) throw error;
            if (data && data.ok === false) {
              throw new Error(data.erro || data.mensagem || "Transição não permitida");
            }
            ok++;
          } catch (e) {
            falhas.push({
              id: c.id,
              motivo: e instanceof Error ? e.message : String(e),
            });
          }
        }

        qc.invalidateQueries({ queryKey: ["contas-pagar"] });
        qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
        qc.invalidateQueries({ queryKey: ["titulo-pagar-acoes"] });

        if (falhas.length === 0) {
          toast.success(`${ok} contas finalizadas (legado)`);
        } else {
          const detalhe = falhas
            .slice(0, 5)
            .map((f) => `${f.id.slice(0, 8)}: ${f.motivo}`)
            .join("\n");
          toast.error(`${ok} finalizadas · ${falhas.length} falharam`, {
            description:
              detalhe + (falhas.length > 5 ? `\n… e mais ${falhas.length - 5}` : ""),
          });
        }
      }

      onDone();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setExecutando(false);
    }
  }

  const isFinalizar = modo === "finalizar_legado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFinalizar ? (
              <>
                <Zap className="h-5 w-5 text-warning" />
                Finalizar em massa (pular fluxo)
              </>
            ) : (
              "Definir meio de pagamento em massa"
            )}
          </DialogTitle>
          <DialogDescription>
            {isFinalizar
              ? `${contas.length} contas serão movidas direto para "Finalizado", aparecerão em Caixa e Banco como "Em aberto".`
              : `${contas.length} contas serão atualizadas com a forma de pagamento selecionada (sem mudar status).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isFinalizar && (
            <div className="p-3 rounded-md border border-warning/40 bg-warning/10 flex gap-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Atenção - super ação:</strong> esta ação <em>pula todas as etapas</em> do fluxo (aprovação, envio de e-mail, anexação de documentos). Use apenas para migração de legado ou casos onde o pagamento já foi feito fora do sistema.
              </div>
            </div>
          )}

          {/* Forma de pagamento OBRIGATÓRIA */}
          <div className="space-y-1">
            <Label>Forma de pagamento *</Label>
            <Select value={formaPagamentoId} onValueChange={setFormaPagamentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione (PIX, Boleto, Transferência...)" />
              </SelectTrigger>
              <SelectContent>
                {(formasPagamento || []).map((fp) => (
                  <SelectItem key={fp.id} value={fp.id}>
                    {fp.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observação */}
          <div className="space-y-1">
            <Label>Observação no histórico</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>

          {/* Checkbox de confirmação - só pra finalizar */}
          {isFinalizar && (
            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="confirma-legado"
                checked={confirmou}
                onCheckedChange={(c) => setConfirmou(!!c)}
              />
              <label
                htmlFor="confirma-legado"
                className="text-xs cursor-pointer leading-relaxed"
              >
                Estou ciente que estou pulando o fluxo normal e essa ação ficará registrada no histórico como migração de legado.
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleExecutar}
            disabled={executando || (isFinalizar && !confirmou)}
            className={
              isFinalizar
                ? "bg-warning hover:bg-warning text-white gap-2"
                : "gap-2"
            }
          >
            {executando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {isFinalizar ? "Finalizar em massa" : "Aplicar meio em massa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
