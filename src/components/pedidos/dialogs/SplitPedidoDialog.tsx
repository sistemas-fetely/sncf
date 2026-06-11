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
import { Loader2, Scissors, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCriarSplit } from "@/hooks/pedidos/useCriarSplit";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const [qtd02, setQtd02] = useState<Record<string, number>>({});
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

  const getQtd02 = (sku: string, total: number) =>
    Math.min(Math.max(0, qtd02[sku] ?? 0), total);

  const itens01 = (itens ?? [])
    .map((it) => ({ ...it, quantidade: it.quantidade - getQtd02(it.sku, it.quantidade) }))
    .filter((it) => it.quantidade > 0);

  const itens02 = (itens ?? [])
    .map((it) => ({ ...it, quantidade: getQtd02(it.sku, it.quantidade) }))
    .filter((it) => it.quantidade > 0);

  const totalBruto = (itens ?? []).reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const fator = totalBruto > 0 ? valor_liquido / totalBruto : 1;

  const bruto01 = itens01.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const bruto02 = itens02.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);
  const valor01 = Math.round(bruto01 * fator * 100) / 100;
  const valor02 = Math.round(bruto02 * fator * 100) / 100;

  const temItens02 = itens02.length > 0;
  const podeConfirmar = temItens02 && itens01.length > 0;

  const handleConfirmar = async () => {
    await criarSplit.mutateAsync({
      pedido_id,
      itens_01: itens01,
      itens_02: itens02,
      valor_01: valor01,
      valor_02: valor02,
      data_entrega_prevista_02: dataEntrega || null,
      observacao: observacao || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!criarSplit.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Split do pedido #{id_externo}
          </DialogTitle>
          <DialogDescription>
            Defina quantas unidades de cada item vão na /02 (aguardando estoque). O restante vai na /01 (pronta entrega).
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
                    <th className="text-right p-2 w-16">/01</th>
                    <th className="text-right p-2 w-28">Qtd /02</th>
                  </tr>
                </thead>
                <tbody>
                  {(itens ?? []).map((it) => {
                    const q02 = getQtd02(it.sku, it.quantidade);
                    const q01 = it.quantidade - q02;
                    return (
                      <tr key={it.sku} className="border-t">
                        <td className="p-2">
                          <div className="font-medium">{it.descricao}</div>
                          <div className="text-xs text-muted-foreground">{it.sku}</div>
                        </td>
                        <td className="p-2 text-right">{it.quantidade}</td>
                        <td className="p-2 text-right">{q01}</td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            max={it.quantidade}
                            value={q02}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setQtd02((prev) => ({ ...prev, [it.sku]: Math.min(val, it.quantidade) }));
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

            {(temItens02 || itens01.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3 bg-blue-50/50">
                  <div className="text-xs font-medium text-blue-900">
                    {id_externo}/01 — Pronta entrega
                  </div>
                  <div className="text-lg font-semibold mt-1">{fmtBRL.format(valor01)}</div>
                  <div className="text-xs text-muted-foreground">
                    {itens01.length} {itens01.length === 1 ? "item" : "itens"}
                  </div>
                </div>
                <div className="rounded-md border p-3 bg-yellow-50/50">
                  <div className="text-xs font-medium text-yellow-900">
                    {id_externo}/02 — Aguardando estoque
                  </div>
                  <div className="text-lg font-semibold mt-1">{fmtBRL.format(valor02)}</div>
                  <div className="text-xs text-muted-foreground">
                    {itens02.length} {itens02.length === 1 ? "item" : "itens"}
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div>
                <Label htmlFor="data-entrega">Data prevista de chegada (/02)</Label>
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

            {!temItens02 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Defina a quantidade de pelo menos um item na coluna /02 para criar o split.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criarSplit.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!podeConfirmar || criarSplit.isPending} className="gap-1.5">
            {criarSplit.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Criando split…</>
            ) : (
              <><Scissors className="h-4 w-4" />Criar split</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
