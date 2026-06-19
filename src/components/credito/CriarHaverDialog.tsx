import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parceiroId: string | null;
}

const MOTIVOS = [
  "Ajuste de pedido",
  "Frete não utilizado",
  "Cancelamento parcial",
  "Cortesia",
  "Outro",
];

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CriarHaverDialog({ open, onOpenChange, parceiroId }: Props) {
  const qc = useQueryClient();

  const [parceiroSel, setParceiroSel] = useState<string | null>(parceiroId);
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [motivo, setMotivo] = useState<string>(MOTIVOS[0]);
  const [observacao, setObservacao] = useState("");
  const [pedidoBusca, setPedidoBusca] = useState("");
  const [origemPedidoId, setOrigemPedidoId] = useState<string | null>(null);
  const [validade, setValidade] = useState<string>(plusDays(180));

  useEffect(() => {
    if (open) {
      setParceiroSel(parceiroId);
      setBusca("");
      setValor(0);
      setMotivo(MOTIVOS[0]);
      setObservacao("");
      setPedidoBusca("");
      setOrigemPedidoId(null);
      setValidade(plusDays(180));
    }
  }, [open, parceiroId]);

  // Busca de parceiros
  const parceirosQ = useQuery({
    queryKey: ["criar-haver-parceiros", busca],
    enabled: open && !parceiroId && busca.length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .ilike("razao_social", `%${busca}%`)
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Nome do parceiro pré-selecionado
  const parceiroFixoQ = useQuery({
    queryKey: ["criar-haver-parceiro-fixo", parceiroId],
    enabled: open && !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, cnpj")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const buscarPedido = async () => {
    if (!pedidoBusca.trim()) {
      setOrigemPedidoId(null);
      return;
    }
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select("id, id_externo")
      .eq("id_externo", pedidoBusca.trim())
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("Pedido não encontrado");
      setOrigemPedidoId(null);
      return;
    }
    setOrigemPedidoId(data.id);
    toast.success(`Pedido ${data.id_externo} vinculado`);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("haver_cliente").insert({
        parceiro_id: parceiroSel,
        valor: valor,
        saldo: valor,
        motivo: motivo + (observacao ? `: ${observacao}` : ""),
        origem_descricao: "Criado manualmente via SNCF",
        origem_pedido_id: origemPedidoId || null,
        data_expiracao: validade,
        status: "disponivel",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Haver criado com sucesso");
      qc.invalidateQueries({ queryKey: ["credito-clientes-haveres"] });
      qc.invalidateQueries({ queryKey: ["haver-disponivel"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhe"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const podeSalvar = !!parceiroSel && valor > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar haver manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Parceiro</Label>
            {parceiroId ? (
              <Input
                value={
                  parceiroFixoQ.data
                    ? `${parceiroFixoQ.data.razao_social}${
                        parceiroFixoQ.data.cnpj ? ` · ${parceiroFixoQ.data.cnpj}` : ""
                      }`
                    : "Carregando…"
                }
                readOnly
                disabled
              />
            ) : (
              <>
                <Input
                  placeholder="Buscar por razão social…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                {parceirosQ.data && parceirosQ.data.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-auto">
                    {parceirosQ.data.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setParceiroSel(p.id);
                          setBusca(p.razao_social);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                          parceiroSel === p.id ? "bg-accent" : ""
                        }`}
                      >
                        <div className="font-medium">{p.razao_social}</div>
                        {p.cnpj && (
                          <div className="text-xs text-muted-foreground">{p.cnpj}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {parceiroSel && (
                  <p className="text-xs text-muted-foreground">
                    Selecionado: {parceiroSel}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={valor || ""}
              onChange={(e) => setValor(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Pedido de origem (opcional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="ID externo do pedido"
                value={pedidoBusca}
                onChange={(e) => setPedidoBusca(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={buscarPedido}>
                Buscar
              </Button>
            </div>
            {origemPedidoId && (
              <p className="text-xs text-muted-foreground">
                Vinculado: {origemPedidoId}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Validade</Label>
            <Input
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!podeSalvar}>
            {mutation.isPending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
