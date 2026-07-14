import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatBRL } from "@/lib/format-currency";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import type { ReguaEtapa } from "@/hooks/credito/useReguaFila";
import { ProrrogarVencimentoDialog } from "@/components/credito/ProrrogarVencimentoDialog";

type Modalidade = 1 | 2 | 3;
type NovoInstrumento = "pix" | "transferencia";

interface Parcela {
  valor: string;
  data_vencimento: string;
}

interface Props {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  open: boolean;
  onClose: () => void;
}

function amanhaISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function RenegociarTituloDialog({ titulo, etapa, open, onClose }: Props) {
  const qc = useQueryClient();
  const [modalidade, setModalidade] = useState<Modalidade>(2);
  const [justificativa, setJustificativa] = useState("");
  const [parcelas, setParcelas] = useState<Parcela[]>([
    { valor: String(titulo.valor_efetivo ?? 0), data_vencimento: amanhaISO() },
  ]);
  const [novoInstrumento, setNovoInstrumento] = useState<NovoInstrumento>("pix");
  const [showProrrogar, setShowProrrogar] = useState(false);

  const podeProrrogar =
    titulo.tipo_pagamento === "boleto" && titulo.boleto_status === "registrado";

  const somaParcelas = useMemo(
    () => parcelas.reduce((acc, p) => acc + (parseFloat(p.valor.replace(",", ".")) || 0), 0),
    [parcelas],
  );

  const addParcela = () =>
    setParcelas((p) => [...p, { valor: "0", data_vencimento: amanhaISO() }]);
  const removeParcela = (i: number) =>
    setParcelas((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  const updateParcela = (i: number, patch: Partial<Parcela>) =>
    setParcelas((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const registrarAcaoRegua = async () => {
    if (!etapa) return;
    try {
      await (supabase as any).rpc("registrar_acao_regua", {
        p_titulo_id: titulo.id,
        p_etapa_codigo: etapa.codigo,
        p_dias_offset: etapa.dias_offset,
        p_resultado: "abriu_renegociacao",
        p_canal_efetivo: null,
        p_mensagem: null,
        p_observacao: `Modalidade ${modalidade}`,
      });
    } catch {
      // não bloqueia — a renegociação já foi feita
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (modalidade === 1) throw new Error("Prorrogação usa fluxo próprio.");
      if (justificativa.trim().length < 10)
        throw new Error("Justificativa deve ter pelo menos 10 caracteres.");
      if (modalidade === 3 && parcelas.length !== 1)
        throw new Error("Troca de instrumento exige exatamente 1 parcela.");

      const payloadParcelas = parcelas.map((p) => ({
        valor: parseFloat(p.valor.replace(",", ".")) || 0,
        data_vencimento: p.data_vencimento,
      }));

      for (const p of payloadParcelas) {
        if (p.valor <= 0) throw new Error("Todas as parcelas devem ter valor > 0.");
        if (!p.data_vencimento) throw new Error("Toda parcela precisa de data de vencimento.");
      }

      const args: Record<string, unknown> = {
        p_titulo_id: titulo.id,
        p_modalidade: modalidade,
        p_justificativa: justificativa.trim(),
        p_parcelas: payloadParcelas,
      };
      if (modalidade === 3) args.p_novo_tipo_pagamento = novoInstrumento;

      const { data, error } = await (supabase as any).rpc("renegociar_titulo", args);
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao renegociar.");
      return data;
    },
    onSuccess: async (data) => {
      await registrarAcaoRegua();
      const qtd = (data && (data.titulos_criados ?? data.qtd_titulos_criados)) ?? parcelas.length;
      toast.success(`Renegociação concluída — ${qtd} título(s) criado(s).`);
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["regua-log"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao renegociar."),
  });

  const opcaoProrrogarDisabled = !podeProrrogar;

  return (
    <>
      <Dialog open={open && !showProrrogar} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Renegociar título</DialogTitle>
            <DialogDescription>
              {titulo.parceiro_razao_social} · {titulo.numero_titulo} ·{" "}
              {formatBRL(titulo.valor_efetivo)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Modalidade</Label>
              <div className="grid gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <label
                          className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                            opcaoProrrogarDisabled
                              ? "opacity-50 cursor-not-allowed"
                              : "cursor-pointer hover:bg-muted/40"
                          }`}
                        >
                          <input
                            type="radio"
                            className="mt-1"
                            disabled={opcaoProrrogarDisabled}
                            checked={modalidade === 1}
                            onChange={() => {
                              if (opcaoProrrogarDisabled) return;
                              setModalidade(1);
                              setShowProrrogar(true);
                            }}
                          />
                          <div>
                            <div className="font-medium">1 — Prorrogar vencimento (boleto)</div>
                            <div className="text-xs text-muted-foreground">
                              Mesmo boleto, nova data. Não cancela o título.
                            </div>
                          </div>
                        </label>
                      </div>
                    </TooltipTrigger>
                    {opcaoProrrogarDisabled && (
                      <TooltipContent>
                        Disponível apenas para boleto registrado vigente.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={modalidade === 2}
                    onChange={() => setModalidade(2)}
                  />
                  <div>
                    <div className="font-medium">2 — Parcelamento</div>
                    <div className="text-xs text-muted-foreground">
                      Cria novos títulos filhos. Encerra o original como recuperação.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={modalidade === 3}
                    onChange={() => setModalidade(3)}
                  />
                  <div>
                    <div className="font-medium">3 — Troca de instrumento</div>
                    <div className="text-xs text-muted-foreground">
                      1 parcela, novo tipo (PIX / Transferência). Encerra o original.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {(modalidade === 2 || modalidade === 3) && (
              <>
                <Alert className="border-amber-300 bg-amber-50">
                  <AlertDescription className="text-xs text-amber-900">
                    O título original será encerrado como{" "}
                    <b>cancelado_recuperacao</b> e não poderá receber pagamentos. Se houver
                    boleto registrado, a baixa será solicitada automaticamente ao banco.
                  </AlertDescription>
                </Alert>

                {modalidade === 3 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Novo instrumento</Label>
                    <Select
                      value={novoInstrumento}
                      onValueChange={(v) => setNovoInstrumento(v as NovoInstrumento)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {modalidade === 3 ? "Parcela" : "Parcelas"}
                    </Label>
                    {modalidade === 2 && (
                      <Button size="sm" variant="outline" onClick={addParcela}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    )}
                  </div>
                  {parcelas.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Valor"
                        value={p.valor}
                        onChange={(e) => updateParcela(i, { valor: e.target.value })}
                        className="w-32"
                      />
                      <Input
                        type="date"
                        value={p.data_vencimento}
                        onChange={(e) => updateParcela(i, { data_vencimento: e.target.value })}
                        min={amanhaISO()}
                        className="w-44"
                      />
                      {modalidade === 2 && parcelas.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeParcela(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {modalidade === 2 && (
                    <p className="text-xs text-muted-foreground">
                      Soma parcelas: <b>{formatBRL(somaParcelas)}</b> · Em aberto:{" "}
                      <b>{formatBRL(titulo.valor_efetivo)}</b>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Justificativa <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    rows={3}
                    placeholder="Motivo da renegociação (mín. 10 caracteres)."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {justificativa.trim().length}/10
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                modalidade === 1 ||
                mutation.isPending ||
                justificativa.trim().length < 10
              }
            >
              {mutation.isPending ? "Renegociando..." : "Confirmar renegociação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showProrrogar && (
        <ProrrogarVencimentoDialog
          titulo={titulo}
          open={showProrrogar}
          onClose={() => {
            setShowProrrogar(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
