import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Scissors, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCriarSplit } from "@/hooks/pedidos/useCriarSplit";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type EstagioSplit = "aguardando_estoque" | "pre_faturado" | "cobranca";

const ESTAGIO_OPTIONS: { value: EstagioSplit; label: string; desc: string }[] = [
  { value: "aguardando_estoque", label: "Aguardando estoque", desc: "Item sem estoque no momento" },
  { value: "pre_faturado",       label: "Pré-faturado",       desc: "Item disponível, atraso só logístico" },
  { value: "cobranca",           label: "Cobrança",           desc: "Precisa renegociar condições de pagamento" },
];

interface ItemPedido {
  descricao: string;
  sku: string;
  quantidade: number;
  valor_unitario: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido_id: string;
  id_externo: string;
  valor_liquido: number;
  valor_bruto: number;
}

export function SplitPedidoDialog({ open, onOpenChange, pedido_id, id_externo, valor_liquido }: Props) {
  const criarSplit = useCriarSplit();
  const [qtdSplit, setQtdSplit] = useState<Record<string, number>>({});
  const [estagio, setEstagio] = useState<EstagioSplit>("aguardando_estoque");
  const [dataEntrega, setDataEntrega] = useState("");
  const [observacao, setObservacao] = useState("");

  const { data: itens, isLoading } = useQuery({
    queryKey: ["pedido-itens-split", pedido_id],
    queryFn: async (): Promise<ItemPedido[]> => {
      const { data, error } = await (supabase as any)
        .from("pedido_itens")
        .select("descricao, sku, quantidade, valor_unitario")
        .eq("pedido_id", pedido_id)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!pedido_id,
  });

  const getQtdSplit = (sku: string, total: number) =>
    Math.min(Math.max(0, qtdSplit[sku] ?? 0), total);

  const itensOriginal = (itens ?? [])
    .map((it) => ({ ...it, quantidade: it.quantidade - getQtdSplit(it.sku, it.quantidade) }))
    .filter((it) => it.quantidade > 0);

  const itensSplit = (itens ?? [])
    .map((it) => ({ ...it, quantidade: getQtdSplit(it.sku, it.quantidade) }))
    .filter((it) => it.quantidade > 0);

  const totalBruto = (itens ?? []).reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const fator = totalBruto > 0 ? valor_liquido / totalBruto : 1;
  const brutoOrig = itensOriginal.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const brutoSplit = itensSplit.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const valorOrig = Math.round(brutoOrig * fator * 100) / 100;
  const valorSplit = Math.round(brutoSplit * fator * 100) / 100;

  const temItensSplit = itensSplit.length > 0;
  const podeConfirmar = temItensSplit && itensOriginal.length > 0;

  const handleConfirmar = async () => {
    await criarSplit.mutateAsync({
      pedido_id,
      itens_original:        itensOriginal,
      itens_split:           itensSplit,
      valor_original:        valorOrig,
      valor_split:           valorSplit,
      estagio_inicial:       estagio,
      data_entrega_prevista: dataEntrega || null,
      observacao:            observacao || null,
    });
    onOpenChange(false);
  };

  const estagioSelecionado = ESTAGIO_OPTIONS.find((e) => e.value === estagio);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!criarSplit.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split do pedido {id_externo}
          </DialogTitle>
          <DialogDescription>
            Defina quantas unidades de cada item vão no novo pedido split.
            O pedido original {id_externo} mantém o número — o split recebe {id_externo}/01 (ou próxima sequência).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando itens...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-right p-2 w-16">Total</th>
                      <th className="text-right p-2 w-16">Original</th>
                      <th className="text-right p-2 w-28">Qtd Split</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(itens ?? []).map((it) => {
                      const qSplit = getQtdSplit(it.sku, it.quantidade);
                      const qOrig = it.quantidade - qSplit;
                      return (
                        <tr key={it.sku} className="border-t">
                          <td className="p-2">
                            <div className="font-medium">{it.descricao}</div>
                            <div className="text-xs text-muted-foreground">{it.sku}</div>
                          </td>
                          <td className="p-2 text-right">{it.quantidade}</td>
                          <td className="p-2 text-right">{qOrig}</td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={it.quantidade}
                              value={qSplit}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setQtdSplit((prev) => ({ ...prev, [it.sku]: Math.min(val, it.quantidade) }));
                              }}
                              className="h-8 w-20 ml-auto text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(temItensSplit || itensOriginal.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3 bg-blue-50/50">
                    <div className="text-xs font-medium text-blue-900">
                      {id_externo} — Pedido original (fica)
                    </div>
                    <div className="text-lg font-semibold mt-1">{fmtBRL.format(valorOrig)}</div>
                    <div className="text-xs text-muted-foreground">
                      {itensOriginal.length} {itensOriginal.length === 1 ? "item" : "itens"}
                    </div>
                  </div>
                  <div className="rounded-md border p-3 bg-yellow-50/50">
                    <div className="text-xs font-medium text-yellow-900">
                      {id_externo}/01 — Novo pedido (split)
                    </div>
                    <div className="text-lg font-semibold mt-1">{fmtBRL.format(valorSplit)}</div>
                    <div className="text-xs text-muted-foreground">
                      {itensSplit.length} {itensSplit.length === 1 ? "item" : "itens"}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Estágio inicial do novo pedido</Label>
                <Select value={estagio} onValueChange={(v) => setEstagio(v as EstagioSplit)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTAGIO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {estagioSelecionado && (
                  <p className="text-xs text-muted-foreground">{estagioSelecionado.desc}</p>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="data-entrega">Data prevista de chegada / entrega</Label>
                  <Input
                    id="data-entrega"
                    type="date"
                    value={dataEntrega}
                    onChange={(e) => setDataEntrega(e.target.value)}
                    className="w-48 mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="obs">Observação</Label>
                  <Textarea
                    id="obs"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>

              {!temItensSplit && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Defina a quantidade de pelo menos um item na coluna "Qtd Split" para criar o pedido.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criarSplit.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!podeConfirmar || criarSplit.isPending} className="gap-1.5">
            {criarSplit.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Criando…</>
            ) : (
              <><Scissors className="h-4 w-4" />Criar pedido split</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
