import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { fmtDataHora } from "@/lib/data";
import { motivoNaoEntregueValido, podeMarcarNaoEntregue, rotuloStatusBoleto, rotuloStatusTitulo } from "@/lib/devolucao/naoEntregue";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type EstadoDevolucaoNE = { pedido_id: string | null; nao_entregue: boolean | null; nao_entregue_em: string | null; recebido_em: string | null; nf_dev_status: string | null };

export const KEY_NAO_ENTREGUE = ["vw_devolucao_funil", "nao-entregue"];

export function useEstadoNaoEntregue(devolucaoId: string | null) {
  return useQuery({
    queryKey: [...KEY_NAO_ENTREGUE, devolucaoId],
    enabled: !!devolucaoId,
    queryFn: async (): Promise<EstadoDevolucaoNE> => {
      const { data, error } = await sb.from("devolucao")
        .select("pedido_id,nao_entregue,nao_entregue_em,recebido_em,nf_dev_status").eq("id", devolucaoId).single();
      if (error) throw error;
      return data as EstadoDevolucaoNE;
    },
  });
}

export function NaoEntregueControle({ devolucaoId, estado }: { devolucaoId: string; estado: EstadoDevolucaoNE | undefined }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (!estado) return null;
  if (estado.nao_entregue) {
    return (
      <TooltipProvider><Tooltip><TooltipTrigger asChild>
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-normal">Não entregue ao cliente</Badge>
      </TooltipTrigger><TooltipContent>{estado.nao_entregue_em ? fmtDataHora(estado.nao_entregue_em) : "Sem data"}</TooltipContent></Tooltip></TooltipProvider>
    );
  }
  if (!podeMarcarNaoEntregue(estado)) return null;
  const confirmar = async () => {
    setSalvando(true);
    try {
      const { data, error } = await sb.rpc("devolucao_marcar_nao_entregue", { p_devolucao_id: devolucaoId, p_motivo: texto.trim() });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro ?? "Não foi possível marcar como não entregue.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vw_devolucao_funil"] }),
        qc.invalidateQueries({ queryKey: ["devolucao-retorno-pendente"] }),
        qc.invalidateQueries({ queryKey: ["processos"] }),
      ]);
      toast.success("Devolução marcada como não entregue ao cliente");
      setAberto(false); setTexto("");
    } catch (e) {
      toast.error(formatError(e));
    } finally { setSalvando(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Não entregue ao cliente</Button>
      <Dialog open={aberto} onOpenChange={(o) => !salvando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não entregue ao cliente</DialogTitle>
            <DialogDescription>Use quando a mercadoria não chegou ao cliente (retida ou devolvida pela transportadora). A Fetely emite a NF de devolução agora, sem etiqueta reversa; no B2B sem pagamento, o desfecho vira 'sem ressarcimento'.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="ne-motivo">O que aconteceu</Label>
            <Textarea id="ne-motivo" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>Voltar</Button>
            <Button onClick={() => void confirmar()} disabled={salvando || !motivoNaoEntregueValido(texto)}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Titulo = { id: string; numero_titulo: string | null; numero_parcela: number | null; valor_atual: number | null; status: string | null; boleto_status: string | null };

export function TitulosPedidoDevolucao({ pedidoId }: { pedidoId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["vw_devolucao_funil", "titulos-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<Titulo[]> => {
      const { data, error } = await sb.from("titulo_a_receber")
        .select("id,numero_titulo,numero_parcela,valor_atual,status,boleto_status").eq("pedido_id", pedidoId).order("numero_parcela");
      if (error) throw error;
      return (data ?? []) as Titulo[];
    },
  });
  if (!pedidoId) return null;
  if (q.isError) return <div className="text-xs text-destructive">{formatError(q.error)}</div>;
  if (!q.data?.length) return null;
  return (
    <div className="space-y-0.5 pt-1">
      {q.data.map((t) => {
        const boleto = rotuloStatusBoleto(t.boleto_status);
        return (
          <div key={t.id} className="text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground">{t.numero_titulo ?? "—"}</span> · {formatBRL(Number(t.valor_atual ?? 0))} · {rotuloStatusTitulo(t.status)}{boleto ? ` · ${boleto}` : ""}
          </div>
        );
      })}
    </div>
  );
}
