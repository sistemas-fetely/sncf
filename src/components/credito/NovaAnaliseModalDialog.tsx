import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useCriarAnalise } from "@/hooks/credito/useCriarAnalise";
import { useNavigate } from "react-router-dom";

export function NovaAnaliseModalDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const criarAnalise = useCriarAnalise();

  const [form, setForm] = useState({
    cnpj: "",
    id_externo: `manual_${Date.now()}`,
    data_pedido: new Date().toISOString().split("T")[0],
    valor_bruto: "",
    valor_liquido: "",
    desconto_pct: "",
    condicao_solicitada: "30",
    forma_solicitada: "boleto",
    vendedor: "",
    origem: "vendedor",
  });

  const handleSubmit = async () => {
    if (!form.cnpj || !form.valor_bruto || !form.valor_liquido) return;
    const result = await criarAnalise.mutateAsync({
      cnpj: form.cnpj.replace(/\D/g, ""),
      id_externo: form.id_externo,
      data_pedido: form.data_pedido,
      valor_bruto: Number(form.valor_bruto),
      valor_liquido: Number(form.valor_liquido),
      desconto_pct: form.desconto_pct ? Number(form.desconto_pct) : undefined,
      condicao_solicitada: form.condicao_solicitada,
      forma_solicitada: form.forma_solicitada,
      vendedor: form.vendedor || undefined,
      origem: form.origem,
      recebido_via: "csv",
    });
    setOpen(false);
    navigate(`/credito/analises/${result.analise_id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo pedido (manual)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar análise manual</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>ID externo</Label>
            <Input value={form.id_externo} onChange={(e) => setForm({ ...form, id_externo: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Data do pedido</Label>
            <Input
              type="date"
              value={form.data_pedido}
              onChange={(e) => setForm({ ...form, data_pedido: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Valor bruto (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.valor_bruto}
              onChange={(e) => setForm({ ...form, valor_bruto: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Valor líquido (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.valor_liquido}
              onChange={(e) => setForm({ ...form, valor_liquido: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Desconto (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.desconto_pct}
              onChange={(e) => setForm({ ...form, desconto_pct: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Condição</Label>
            <Select
              value={form.condicao_solicitada}
              onValueChange={(v) => setForm({ ...form, condicao_solicitada: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_vista">à vista</SelectItem>
                <SelectItem value="28">28 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="35">35 dias</SelectItem>
                <SelectItem value="42">42 dias</SelectItem>
                <SelectItem value="30_60">30/60 dias</SelectItem>
                <SelectItem value="30_60_90">30/60/90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Forma</Label>
            <Select value={form.forma_solicitada} onValueChange={(v) => setForm({ ...form, forma_solicitada: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Vendedor</Label>
            <Input value={form.vendedor} onChange={(e) => setForm({ ...form, vendedor: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Origem</Label>
            <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="feira">Feira</SelectItem>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={criarAnalise.isPending}>
            {criarAnalise.isPending ? "Criando..." : "Criar análise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
