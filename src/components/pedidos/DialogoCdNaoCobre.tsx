import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PedidoFilaItem } from "@/types/pedido";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";



function useCdsHabilitados(enabled: boolean) {

  return useQuery({
    queryKey: ["expedicao-b2b-cds-habilitados"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ codigo: string; nome: string }[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: cds, error } = await sb.from("expedicao_b2b_cd").select("centro_codigo").eq("habilitado", true);
      if (error) throw error;
      const codigos = (cds ?? []).map((c: { centro_codigo: string }) => c.centro_codigo);
      if (codigos.length === 0) return [];
      const { data: nomes, error: e2 } = await sb.from("centro_distribuicao").select("codigo, nome").in("codigo", codigos);
      if (e2) throw e2;
      const mapa = new Map<string, string>((nomes ?? []).map((n: { codigo: string; nome: string }) => [n.codigo, n.nome]));
      return codigos.map((c: string) => ({ codigo: c, nome: (mapa.get(c) ?? c).split(" — ")[0] }));
    },
  });
}

export function DialogoCdNaoCobre({
  p,
  open,
  onOpenChange,
}: {
  p: PedidoFilaItem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const cds = useCdsHabilitados(open);
  const [cdNovo, setCdNovo] = useState("");
  const [motivoTroca, setMotivoTroca] = useState("");
  const [motivoSeguir, setMotivoSeguir] = useState("");

  /** A regra de quando a troca vale vive no banco (v_pedidos_fila.cd_pode_trocar). */
  const podeTrocar = p.cd_pode_trocar === true;


  const concluir = async () => {
    await qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
    onOpenChange(false);
  };

  const trocar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_pedido_cd_trocar", {
        p_pedido_id: p.id,
        p_centro_codigo: cdNovo,
        p_motivo: motivoTroca.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("CD trocado");
      await concluir();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seguir = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_pedido_cd_seguir_estoque_errado", {
        p_pedido_id: p.id,
        p_motivo: motivoSeguir.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Decisão registrada; pendência de correção de saldo aberta");
      await concluir();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const opcoes = (cds.data ?? []).filter((c) => c.codigo !== p.cd_expedicao_codigo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>CD não cobre o pedido {p.id_externo}</DialogTitle>
        </DialogHeader>
        {p.cd_expedicao_nome && <p className="text-xs text-muted-foreground">CD {p.cd_expedicao_nome}</p>}
        <div className="rounded-md border text-xs">
          <div className="grid grid-cols-3 gap-2 px-2 py-1 font-medium text-muted-foreground border-b">
            <span>SKU</span><span className="text-right">Pede</span><span className="text-right">Livre no CD</span>
          </div>
          {(p.cd_faltas ?? []).map((f, i) => (
            <div key={`${f.sku}-${i}`} className="grid grid-cols-3 gap-2 px-2 py-1 tabular-nums">
              <span className="truncate">{f.sku}</span>
              <span className="text-right">{f.pedido}</span>
              <span className="text-right">{f.livre_cd}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Trocar CD</p>
            {!podeTrocar && (
              <p className="text-xs text-muted-foreground">
                {p.cd_troca_bloqueio ?? "Troca de CD indisponível para este pedido"}
              </p>
            )}
            <Select value={cdNovo} onValueChange={setCdNovo} disabled={!podeTrocar}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o CD" /></SelectTrigger>
              <SelectContent>
                {opcoes.map((c) => (
                  <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="text-xs">Motivo</Label>
            <Textarea rows={2} value={motivoTroca} onChange={(e) => setMotivoTroca(e.target.value)} disabled={!podeTrocar} />
            <Button
              size="sm"
              className="w-full"
              disabled={!podeTrocar || !cdNovo || !motivoTroca.trim() || trocar.isPending}
              onClick={() => trocar.mutate()}
            >
              {trocar.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Trocar CD
            </Button>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Seguir — saldo do CD está errado</p>
            <Label className="text-xs">Motivo (mín. 15 caracteres)</Label>
            <Textarea rows={3} value={motivoSeguir} onChange={(e) => setMotivoSeguir(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={motivoSeguir.trim().length < 15 || seguir.isPending}
              onClick={() => seguir.mutate()}
            >
              {seguir.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Seguir mesmo assim
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
