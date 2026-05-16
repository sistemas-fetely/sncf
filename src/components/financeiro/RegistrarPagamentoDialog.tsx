import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, Upload } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";

type Conta = {
  id: string;
  descricao: string;
  valor: number;
  forma_pagamento_id: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta: Conta;
  onPaid?: () => void;
}

export default function RegistrarPagamentoDialog({ open, onOpenChange, conta, onPaid }: Props) {
  const qc = useQueryClient();
  const [dataPagamento, setDataPagamento] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formaId, setFormaId] = useState<string | null>(conta.forma_pagamento_id);
  const [valorPago, setValorPago] = useState<string>(() => String(conta.valor ?? ""));
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setDataPagamento(new Date().toISOString().slice(0, 10));
      setFormaId(conta.forma_pagamento_id);
      setValorPago(String(conta.valor ?? ""));
      setObservacao("");
      setArquivo(null);
    }
  }, [open, conta]);

  const { data: formas } = useQuery({
    queryKey: ["formas-pagamento-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select("id, codigo, nome")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      let comprovante_url: string | null = null;
      if (arquivo) {
        const ext = arquivo.name.split(".").pop() || "bin";
        const path = `${conta.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("comprovantes-pagamento")
          .upload(path, arquivo, { upsert: false });
        if (upErr) throw upErr;
        comprovante_url = path;
      }

      const valorNum = parseFloat(valorPago.replace(",", ".")) || conta.valor;

      const { error } = await supabase
        .from("contas_pagar_receber")
        .update({
          status: "enviado_para_pagamento",
          data_pagamento: dataPagamento,
          forma_pagamento_id: formaId,
          valor_pago: valorNum,
          observacao_pagamento: observacao || null,
          comprovante_url,
        })
        .eq("id", conta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      const valorNum = parseFloat(valorPago.replace(",", ".")) || conta.valor;
      toast.success("Pagamento registrado!", {
        description: `${formatBRL(valorNum)} em ${new Date(dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}`,
      });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["contas-receber"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-financeiro-lanc"] });
      qc.invalidateQueries({ queryKey: ["dashboard-financeiro-lanc-6m"] });
      qc.invalidateQueries({ queryKey: ["dashboard-financeiro-contas"] });
      qc.invalidateQueries({ queryKey: ["fluxo-caixa"] });
      qc.invalidateQueries({ queryKey: ["dre-lancamentos"] });
      onOpenChange(false);
      onPaid?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao registrar pagamento", { description: e.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription className="truncate">{conta.descricao}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dataPag">Data do pagamento</Label>
              <Input
                id="dataPag"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorPag">Valor pago</Label>
              <Input
                id="valorPag"
                inputMode="decimal"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                placeholder={String(conta.valor)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={formaId ?? undefined} onValueChange={(v) => setFormaId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {(formas || []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obsPag">Observação</Label>
            <Textarea
              id="obsPag"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: pago via transferência conta XYZ"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comprovPag" className="flex items-center gap-2">
              <Upload className="h-3.5 w-3.5" /> Comprovante (PDF/imagem, opcional)
            </Label>
            <Input
              id="comprovPag"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
            {arquivo && <p className="text-xs text-muted-foreground">{arquivo.name}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="bg-green-700 hover:bg-green-800 text-white gap-2"
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
