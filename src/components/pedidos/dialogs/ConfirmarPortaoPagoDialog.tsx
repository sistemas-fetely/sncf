import { useMemo, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  useConfirmarPagamentoLinha,
  type ProvaTipo,
} from "@/hooks/pedidos/useConfirmarPagamentoLinha";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PROVA_OPCOES: Array<{ value: ProvaTipo; label: string }> = [
  { value: "manual", label: "Manual (sem referência)" },
  { value: "pix_txid", label: "PIX (TXID)" },
  { value: "cartao_nsu", label: "Cartão (NSU/autorização)" },
  { value: "ofx", label: "Extrato bancário (OFX)" },
];

const REF_LABEL: Record<string, string> = {
  pix_txid: "TXID do PIX",
  cartao_nsu: "NSU/autorização do cartão",
  ofx: "Identificador no extrato",
};

interface Props {
  pedido_id: string;
  /** Linha do plano (`provisao_recebimento.id`). Quando ausente, o diálogo
   *  resolve a primeira linha de portão pendente do pedido. */
  provisao_id?: string;
  valor?: number | null;
  forma?: string | null;
  numero_parcela?: number | null;
  rotulo?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  /** "padrao" = botão com rótulo. "discreta" = ícone ghost, para linha de tabela. */
  variante?: "padrao" | "discreta";
}

export function ConfirmarPortaoPagoDialog({
  pedido_id,
  provisao_id,
  valor,
  forma,
  numero_parcela,
  rotulo,
  triggerLabel = "Confirmar pagamento",
  triggerClassName,
  variante = "padrao",
}: Props) {
  const [open, setOpen] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [provaTipo, setProvaTipo] = useState<ProvaTipo>("manual");
  const [provaRef, setProvaRef] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");

  const confirmar = useConfirmarPagamentoLinha();

  // Fallback: consumidores que só conhecem o pedido (fila / detalhe).
  const pendenteQ = useQuery({
    queryKey: ["provisao-portao-pendente", pedido_id],
    enabled: open && !provisao_id && !!pedido_id,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("id, numero_parcela, valor, tipo_pagamento, status, pago_em")
        .eq("pedido_id", pedido_id)
        .eq("eh_portao", true)
        .is("pago_em", null)
        .order("numero_parcela", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        numero_parcela: number | null;
        valor: number | string | null;
        tipo_pagamento: string | null;
      } | null;
    },
  });

  const linha = useMemo(() => {
    if (provisao_id) {
      return {
        id: provisao_id,
        numero_parcela: numero_parcela ?? null,
        valor: Number(valor ?? 0),
        tipo_pagamento: forma ?? null,
      };
    }
    if (pendenteQ.data) {
      return {
        id: pendenteQ.data.id,
        numero_parcela: pendenteQ.data.numero_parcela,
        valor: Number(pendenteQ.data.valor ?? 0),
        tipo_pagamento: pendenteQ.data.tipo_pagamento,
      };
    }
    return null;
  }, [provisao_id, numero_parcela, valor, forma, pendenteQ.data]);

  const refObrigatoria = provaTipo !== "manual";
  const refFaltando = refObrigatoria && !provaRef.trim();

  const handleConfirmar = async () => {
    if (!linha) {
      toast({
        title: "Não foi possível identificar a parcela",
        description:
          "Recarregue a tela e tente de novo. Se persistir, a linha do plano pode ter sido removida.",
        variant: "destructive",
      });
      return;
    }
    try {
      await confirmar.mutateAsync({
        provisao_id: linha.id,
        prova_tipo: provaTipo,
        prova_ref: refObrigatoria ? provaRef : null,
        data_pagamento: dataPagamento,
        observacao,
      });
    } catch {
      // O toast de erro já sai de useConfirmarPagamentoLinha — não duplicar.
      // Mantém o dialog aberto com os dados preenchidos.
      return;
    }
    setOpen(false);
    setObservacao("");
    setProvaRef("");
    setProvaTipo("manual");
    setDataPagamento(new Date().toISOString().slice(0, 10));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!confirmar.isPending) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        {variante === "discreta" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button className={triggerClassName}>{triggerLabel}</Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento da linha de portão</DialogTitle>
          <DialogDescription>
            {rotulo ??
              (linha
                ? `Linha ${linha.numero_parcela ?? "—"}${
                    linha.tipo_pagamento ? ` · ${linha.tipo_pagamento}` : ""
                  } · ${fmtBRL.format(linha.valor)}. O pedido só é liberado quando todas as linhas de portão estiverem pagas.`
                : "Confirma o pagamento de uma linha de portão do plano.")}
          </DialogDescription>
        </DialogHeader>

        {!linha && !pendenteQ.isLoading && (
          <p className="text-sm text-muted-foreground">
            Nenhuma linha de portão pendente para este pedido.
          </p>
        )}

        {linha && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data-pagamento-portao">Data do pagamento</Label>
              <Input
                id="data-pagamento-portao"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prova-tipo-portao">Tipo de prova</Label>
              <Select value={provaTipo} onValueChange={(v) => setProvaTipo(v as ProvaTipo)}>
                <SelectTrigger id="prova-tipo-portao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVA_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {refObrigatoria && (
              <div className="space-y-2">
                <Label htmlFor="prova-ref-portao">{REF_LABEL[provaTipo] ?? "Referência"}</Label>
                <Input
                  id="prova-ref-portao"
                  value={provaRef}
                  onChange={(e) => setProvaRef(e.target.value)}
                  placeholder={REF_LABEL[provaTipo] ?? "Referência"}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="observacao-portao">Observação (opcional)</Label>
              <Textarea
                id="observacao-portao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: PIX recebido na conta Safra"
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={confirmar.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={confirmar.isPending || !dataPagamento || !linha || refFaltando}
          >
            {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
