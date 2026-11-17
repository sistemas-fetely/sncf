import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidarVendaDireta } from "./queryKeys";
import { argsTrocaCdVD, exigeTransportadoraVD, podeConfirmarTrocaCdVD, type PedidoTrocaCdVD } from "./trocarCdVD";

interface Resultado {
  ok: boolean; erro?: string; de: string; para: string;
  frete_estimado?: number | null; prazo_dias?: number | null;
  bling_cancelado?: string | number | null;
  sem_saldo_destino?: { sku: string; quantidade: number; saldo: number }[];
}

export function TrocarCdVDDialog({ pedido, onClose }: { pedido: PedidoTrocaCdVD; onClose: () => void }) {
  const qc = useQueryClient();
  const [centro, setCentro] = useState("");
  const [transportadora, setTransportadora] = useState("");
  const [motivo, setMotivo] = useState("");
  const opcoes = useQuery({
    queryKey: ["vd-trocar-cd-opcoes"],
    queryFn: async () => {
      const [cds, canais, transportadoras] = await Promise.all([
        supabase.from("centro_distribuicao").select("codigo, rotulo_curto").eq("ativo", true).eq("vende", true).order("rotulo_curto"),
        supabase.from("centro_canal").select("centro_codigo").eq("canal", "B2C").eq("habilitado", true),
        supabase.from("parceiros_comerciais").select("id, razao_social").contains("tipos", ["transportadora"]).not("bling_id", "is", null).order("razao_social"),
      ]);
      if (cds.error) throw cds.error;
      if (canais.error) throw canais.error;
      if (transportadoras.error) throw transportadoras.error;
      const habilitados = new Set(canais.data.map((c) => c.centro_codigo));
      return { cds: cds.data.filter((c) => habilitados.has(c.codigo)), transportadoras: transportadoras.data };
    },
  });
  useEffect(() => {
    if (!opcoes.data) return;
    setCentro(opcoes.data.cds.find((c) => c.codigo === "XPM-SC")?.codigo ?? "");
    setTransportadora(opcoes.data.transportadoras.find((t) => t.razao_social?.toUpperCase().includes("BRASPRESS"))?.id ?? "");
  }, [opcoes.data]);
  useEffect(() => { if (opcoes.error) toast.error(rawMessage(opcoes.error)); }, [opcoes.error]);
  const trocar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("vd_trocar_cd" as never, argsTrocaCdVD(pedido.id, centro, motivo, transportadora) as never);
      if (error) throw error;
      const resultado = data as unknown as Resultado | null;
      if (!resultado?.ok) throw new Error(resultado?.erro ?? "Não foi possível trocar o CD.");
      return resultado;
    },
    onSuccess: async (r) => {
      const linhas: string[] = [];
      if (r.frete_estimado != null) linhas.push(`Frete estimado ${formatBRL(r.frete_estimado)}${r.prazo_dias != null ? ` · ${r.prazo_dias} dias` : ""}`);
      if (r.bling_cancelado) linhas.push(`Pedido Bling nº ${r.bling_cancelado} cancelado, desce de novo na loja nova`);
      toast.success(`CD trocado: ${r.de} → ${r.para}`, { description: linhas.join("\n") || undefined, duration: 10000 });
      if (r.sem_saldo_destino?.length) toast.warning("CD de destino sem saldo para alguns itens", {
        description: r.sem_saldo_destino.map((i) => `${i.sku} · quantidade ${i.quantidade} · saldo ${i.saldo}`).join("\n"), duration: 15000,
      });
      await Promise.all([invalidarVendaDireta(qc), invalidarPedido(qc, pedido.id), qc.invalidateQueries({ queryKey: ["vd-gestao-cd-pedido"] })]);
      onClose();
    },
    onError: (erro) => toast.error(rawMessage(erro)),
  });
  const obrigatoria = exigeTransportadoraVD(pedido.modal);
  const habilitado = opcoes.isSuccess && podeConfirmarTrocaCdVD(centro, motivo, pedido.modal, transportadora) && !trocar.isPending;
  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !trocar.isPending) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[480px]">
      <DialogHeader><DialogTitle>Trocar CD — {pedido.id_externo}</DialogTitle><DialogDescription>Centro de saída do pedido</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (habilitado) trocar.mutate(); }}>
        {opcoes.isLoading && <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando opções" />}
        {opcoes.isError && <div className="space-y-2"><p className="text-sm text-destructive">{rawMessage(opcoes.error)}</p><Button type="button" variant="outline" onClick={() => void opcoes.refetch()}>Tentar novamente</Button></div>}
        <div className="space-y-1"><Label htmlFor="vd-troca-cd">Sai de *</Label>
          <Select value={centro} onValueChange={setCentro} disabled={!opcoes.isSuccess || trocar.isPending}>
            <SelectTrigger id="vd-troca-cd"><SelectValue placeholder="Selecione o CD" /></SelectTrigger>
            <SelectContent>{opcoes.data?.cds.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.codigo}</SelectItem>)}</SelectContent>
          </Select>
          {opcoes.isSuccess && !opcoes.data.cds.length && <p className="text-sm text-muted-foreground">Nenhum CD de venda habilitado para B2C.</p>}
        </div>
        <div className="space-y-1"><Label htmlFor="vd-troca-transportadora">Transportadora{obrigatoria ? " *" : ""}</Label>
          <Select value={transportadora || "nenhuma"} onValueChange={(v) => setTransportadora(v === "nenhuma" ? "" : v)} disabled={!opcoes.isSuccess || trocar.isPending}>
            <SelectTrigger id="vd-troca-transportadora"><SelectValue placeholder="Selecione a transportadora" /></SelectTrigger>
            <SelectContent><SelectItem value="nenhuma">Sem transportadora selecionada</SelectItem>{opcoes.data?.transportadoras.map((t) => <SelectItem key={t.id} value={t.id}>{t.razao_social}</SelectItem>)}</SelectContent>
          </Select>
          {obrigatoria && <p className="text-sm text-muted-foreground">Retirada no Site SP vira entrega pela transportadora no endereço do cadastro do cliente.</p>}
        </div>
        <p className="text-sm text-muted-foreground">Frete por conta da Fetely — o total do pedido não muda.</p>
        <div className="space-y-1"><Label htmlFor="vd-troca-motivo">Motivo *</Label><Textarea id="vd-troca-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} disabled={trocar.isPending} /></div>
        <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={trocar.isPending}>Cancelar</Button><Button type="submit" disabled={!habilitado}>{trocar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Trocar CD</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}