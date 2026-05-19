import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format-currency";

interface ContaParaPagar {
  id: string;
  descricao: string;
  valor: number;
  fornecedor_cliente: string | null;
  forma_pagamento_id?: string | null;
  data_vencimento?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contas: ContaParaPagar[]; // 1 ou N (massa)
  onSuccess: () => void;
}

export function MarcarPagoDialog({ open, onOpenChange, contas, onSuccess }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [formaPgtoId, setFormaPgtoId] = useState("");
  const [dataPgto, setDataPgto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const isMassa = contas.length > 1;
  const totalValor = contas.reduce((s, c) => s + Number(c.valor || 0), 0);

  const { data: contasBancarias } = useQuery({
    queryKey: ["contas-bancarias-ativas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, tipo, banco")
        .eq("ativo", true)
        .order("nome_exibicao");
      return data || [];
    },
  });

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

    // Data de pagamento: se todas as contas têm o mesmo vencimento, usa esse no input.
    // Senão (vencimentos diferentes), input fica vazio MAS cada conta usa seu próprio
    // vencimento na hora de salvar (a menos que usuário preencha o input).
    const vencimentos = contas.map((c) => c.data_vencimento).filter(Boolean);
    const vencimentosUnicos = new Set(vencimentos);
    if (vencimentosUnicos.size === 1 && vencimentos.length > 0) {
      setDataPgto(vencimentos[0] as string);
    } else {
      // Massa com vencimentos diferentes: input vazio, cada conta usa o seu
      setDataPgto("");
    }

    setObservacao("");
    setContaBancariaId("");
    // Pré-preenche forma de pagamento se todas as contas tiverem a mesma
    if (contas.length > 0) {
      const formas = new Set(contas.map((c) => c.forma_pagamento_id).filter(Boolean));
      if (formas.size === 1) {
        setFormaPgtoId(Array.from(formas)[0] as string);
      } else {
        setFormaPgtoId("");
      }
    }
  }, [open, contas]);

  // Detecta se as contas têm vencimentos diferentes (caso massa)
  const vencimentosUnicos = new Set(
    contas.map((c) => c.data_vencimento).filter(Boolean),
  );
  const vencimentosDiferentes = vencimentosUnicos.size > 1;

  async function handleConfirmar() {
    if (!contaBancariaId) {
      toast.error("Selecione a conta bancária");
      return;
    }
    // Validação: precisa ter dataPgto OU todas as contas precisam ter data_vencimento
    if (!dataPgto) {
      const semVenc = contas.filter((c) => !c.data_vencimento);
      if (semVenc.length > 0) {
        toast.error(
          "Algumas contas não têm vencimento — informe uma data padrão.",
        );
        return;
      }
    }

    setSalvando(true);
    try {
      const dadosBase: Record<string, unknown> = {
        pago_em_conta_id: contaBancariaId,
        pago_em: new Date().toISOString(),
        pago_por: user?.id || null,
        observacao_pagamento_manual: observacao.trim() || null,
      };
      if (formaPgtoId) {
        dadosBase.forma_pagamento_id = formaPgtoId;
      }

      // Se dataPgto preenchido: aplica em todos
      // Se vazio (massa com vencimentos diferentes): cada conta usa seu próprio vencimento
      if (dataPgto) {
        const { error } = await supabase
          .from("contas_pagar_receber")
          .update({ ...dadosBase, data_pagamento: dataPgto })
          .in("id", contas.map((c) => c.id));
        if (error) throw error;
      } else {
        // Atualiza uma a uma com sua própria data_vencimento
        for (const c of contas) {
          const { error } = await supabase
            .from("contas_pagar_receber")
            .update({ ...dadosBase, data_pagamento: c.data_vencimento })
            .eq("id", c.id);
          if (error) throw error;
        }
      }

      // Histórico (best-effort)
      try {
        const historicoRows = contas.map((c) => ({
          conta_id: c.id,
          status_anterior: "finalizado",
          status_novo: "finalizado", // mantém status do CP - mudança é só no Caixa
          observacao: `Pagamento marcado em Caixa e Banco — ${formatBRL(c.valor)}`,
          usuario_id: user?.id || null,
        }));
        await supabase.from("contas_pagar_historico").insert(historicoRows);
      } catch (e) {
        console.warn("Falha no histórico (não bloqueante):", e);
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      toast.success(
        isMassa
          ? `${contas.length} pagamentos registrados (${formatBRL(totalValor)})`
          : "Pagamento registrado",
      );
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Marcar como pago
          </DialogTitle>
          <DialogDescription>
            {isMassa
              ? `${contas.length} pagamentos serão marcados — total ${formatBRL(totalValor)}`
              : `Registrar pagamento de ${contas[0]?.fornecedor_cliente || "fornecedor"} — ${formatBRL(totalValor)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Lista resumida quando é massa */}
          {isMassa && (
            <div className="max-h-32 overflow-y-auto rounded border p-2 space-y-1 text-xs bg-muted/30">
              {contas.map((c) => (
                <div key={c.id} className="flex justify-between gap-2">
                  <span className="truncate">{c.fornecedor_cliente || c.descricao}</span>
                  <span className="font-mono shrink-0">{formatBRL(c.valor)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Conta bancária - OBRIGATÓRIO */}
          <div className="space-y-1">
            <Label>Conta bancária *</Label>
            <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta que pagou..." />
              </SelectTrigger>
              <SelectContent>
                {(contasBancarias || []).map((cb) => (
                  <SelectItem key={cb.id} value={cb.id}>
                    {cb.nome_exibicao}{" "}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({cb.tipo === "cartao_credito" ? "Cartão" : cb.banco})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Forma de pagamento */}
          <div className="space-y-1">
            <Label>Forma de pagamento</Label>
            <Select value={formaPgtoId} onValueChange={setFormaPgtoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione (opcional - já pode estar definida)" />
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

          {/* Data */}
          <div className="space-y-1">
            <Label>
              Data do pagamento {!vencimentosDiferentes && "*"}
            </Label>
            <Input
              type="date"
              value={dataPgto}
              onChange={(e) => setDataPgto(e.target.value)}
              placeholder={vencimentosDiferentes ? "Vazio = usa vencimento de cada conta" : ""}
            />
            {vencimentosDiferentes && (
              <p className="text-[10px] text-muted-foreground">
                As contas selecionadas têm vencimentos diferentes. Deixe vazio pra usar a data de vencimento de cada uma como data de pagamento, ou preencha pra aplicar a mesma data em todas.
              </p>
            )}
          </div>

          {/* Observação */}
          <div className="space-y-1">
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional - ex: 'Pago via PIX, tarifa R$ 0,50'"
              rows={2}
            />
          </div>
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
            disabled={salvando}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
