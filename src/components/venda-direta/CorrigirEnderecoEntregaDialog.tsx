import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { invalidarVendaDireta } from "./queryKeys";
import { camposEnderecoEntrega, cepEntregaDiferente, motivoCorrecaoPreenchido, type EnderecoEntregaVD } from "./enderecoEntregaVD";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function BotaoCorrigirEnderecoEntrega({ pedido }: { pedido: {
  id: string; cliente_id?: string | null; endereco_entrega?: Record<string, unknown> | null; nf_numero: string | number | null;
} }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [endereco, setEndereco] = useState(() => camposEnderecoEntrega(pedido.endereco_entrega));
  const [motivo, setMotivo] = useState("");
  const [buscandoCadastro, setBuscandoCadastro] = useState(false);
  const original = camposEnderecoEntrega(pedido.endereco_entrega);
  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("vd_corrigir_endereco_entrega" as never, {
        p_pedido_id: pedido.id, p_endereco: endereco, p_motivo: motivo.trim(),
      } as never);
      if (error) throw error;
      const resultado = data as unknown as { ok: boolean; alterado: boolean; erro?: string } | null;
      if (!resultado?.ok) throw new Error(resultado?.erro ?? "Não foi possível corrigir o endereço.");
      return resultado;
    },
    onSuccess: async (resultado) => {
      toast.success(resultado.alterado === false ? "Nada mudou" : "Endereço corrigido");
      setOpen(false);
      await Promise.all([invalidarPedido(qc, pedido.id), invalidarVendaDireta(qc)]);
    },
    onError: (erro) => toast.error(rawMessage(erro)),
  });
  const usarCadastro = async () => {
    if (!pedido.cliente_id) return;
    setBuscandoCadastro(true);
    try {
      const { data, error } = await supabase.from("parceiros_comerciais")
        .select("cep, logradouro, numero, endereco_complemento, bairro, cidade, uf")
        .eq("id", pedido.cliente_id).single();
      if (error) throw error;
      setEndereco(camposEnderecoEntrega({ ...data, complemento: data.endereco_complemento }));
    } catch (erro) { toast.error(rawMessage(erro)); }
    finally { setBuscandoCadastro(false); }
  };
  const campo = (chave: keyof EnderecoEntregaVD, rotulo: string) => (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`vd-entrega-${chave}`}>{rotulo}</Label>
      <Input id={`vd-entrega-${chave}`} value={endereco[chave]} disabled={salvar.isPending || buscandoCadastro}
        inputMode={chave === "cep" ? "numeric" : undefined}
        onChange={(e) => setEndereco((atual) => ({ ...atual, [chave]: e.target.value }))} />
    </div>
  );
  return <>
    <TooltipProvider><Tooltip><TooltipTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Corrigir endereço de entrega"
        onClick={() => { setEndereco(original); setMotivo(""); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
    </TooltipTrigger><TooltipContent>Corrigir endereço de entrega</TooltipContent></Tooltip></TooltipProvider>
    <Dialog open={open} onOpenChange={(valor) => { if (!salvar.isPending) setOpen(valor); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader><DialogTitle>Corrigir endereço de entrega</DialogTitle><DialogDescription>Endereço de entrega do pedido</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (motivoCorrecaoPreenchido(motivo) && !salvar.isPending && !buscandoCadastro) salvar.mutate(); }}>
          <Button type="button" variant="outline" disabled={!pedido.cliente_id || buscandoCadastro || salvar.isPending} onClick={() => void usarCadastro()}>
            {buscandoCadastro && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Usar endereço do cadastro
          </Button>
          <div className="space-y-3 rounded-md border bg-background p-3">
            {campo("cep", "CEP")}{campo("logradouro", "Logradouro")}
            <div className="grid grid-cols-2 gap-3">{campo("numero", "Número")}{campo("complemento", "Complemento")}</div>
            {campo("bairro", "Bairro")}
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
              {campo("cidade", "Cidade")}
              <div className="space-y-1"><Label htmlFor="vd-entrega-uf">UF</Label><Select value={endereco.uf} disabled={salvar.isPending || buscandoCadastro} onValueChange={(uf) => setEndereco((atual) => ({ ...atual, uf }))}>
                <SelectTrigger id="vd-entrega-uf"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select></div>
            </div>
          </div>
          {cepEntregaDiferente(original.cep, endereco.cep) && <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">CEP diferente — o frete foi calculado para o CEP anterior; revise o frete.</p>}
          {pedido.nf_numero != null && String(pedido.nf_numero).trim() !== "" && <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">A NF já foi emitida com o endereço anterior. Se precisar, use Corrigir NF.</p>}
          <div className="space-y-1"><Label htmlFor="vd-entrega-motivo">Motivo *</Label><Textarea id="vd-entrega-motivo" value={motivo} required minLength={3} disabled={salvar.isPending} onChange={(e) => setMotivo(e.target.value)} /></div>
          <DialogFooter><Button type="button" variant="outline" disabled={salvar.isPending} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={!motivoCorrecaoPreenchido(motivo) || salvar.isPending || buscandoCadastro}>{salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}