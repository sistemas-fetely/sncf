import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";

/* eslint-disable @typescript-eslint/no-explicit-any */
// CORRIGIR-NF / REFATURAR (27/10/2026): a tela só declara o motivo; o banco escolhe o caminho fiscal.
const sb = supabase as any;
const dataHora = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const ddMMHHmm = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Previa = {
  pedido?: string; nf_numero?: string; nf_valor?: number; emitida_em?: string; prazo_cancelamento?: string;
  carga_saiu?: boolean; estagio?: string; fiscal_acao?: "cancelar_nf" | "nf_devolucao";
};

export function caminhoCorrecaoTexto(acao: string | undefined, prazo: string | null | undefined): string {
  if (acao === "cancelar_nf")
    return `A NF ainda pode ser cancelada (até ${ddMMHHmm(prazo)}). O Fiscal cancela no Bling; o sistema reenvia o pedido e vincula a NF nova sozinho.`;
  if (acao === "nf_devolucao")
    return "Prazo de cancelamento vencido ou mercadoria já saiu. O sistema gera a NF de entrada (sem retorno físico) na Mesa de Devoluções; o Fiscal autoriza no Bling; o sistema reenvia o pedido e vincula a NF nova sozinho.";
  return "Caminho fiscal não informado pelo banco.";
}

export function CorrigirNfDialog({ pedidoId, open, onOpenChange }: { pedidoId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [previaErro, setPreviaErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erroExec, setErroExec] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrevia(null); setPreviaErro(null); setMotivo(""); setErroExec(null);
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const { data, error } = await sb.rpc("abrir_correcao_nf", { p_pedido_id: pedidoId, p_motivo: "", p_dry_run: true });
        if (error) throw new Error(error.message);
        if (vivo) setPrevia(data as Previa);
      } catch (e) {
        if (vivo) setPreviaErro(rawMessage(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [open, pedidoId]);

  const motivoOk = motivo.trim().length >= 5;

  const confirmar = async () => {
    setExecutando(true); setErroExec(null);
    try {
      const { data, error } = await sb.rpc("abrir_correcao_nf", { p_pedido_id: pedidoId, p_motivo: motivo.trim(), p_dry_run: false });
      if (error) throw new Error(error.message);
      const r = data as any;
      const chamado = r?.chamado ? (typeof r.chamado === "object" ? (r.chamado.numero ?? r.chamado.protocolo ?? r.chamado.id) : r.chamado) : null;
      toast.success(`Correção ${r?.devolucao_numero ?? ""} aberta${chamado ? ` · chamado ${chamado}` : ""}`);
      await Promise.all([
        invalidarPedido(qc, pedidoId),
        qc.invalidateQueries({ queryKey: ["vw_devolucao_funil"] }),
        qc.invalidateQueries({ queryKey: ["devolucao-aberta-pedido", pedidoId] }),
      ]);
      onOpenChange(false);
    } catch (e) {
      const m = rawMessage(e);
      setErroExec(m);
      toast.error(m);
    } finally {
      setExecutando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!executando) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Corrigir NF{previa?.pedido ? ` — ${previa.pedido}` : ""}</DialogTitle>
          <DialogDescription>Abre uma correção fiscal para refaturar o pedido com uma NF nova.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {carregando && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando o caminho fiscal…</div>}
          {previaErro && <Alert variant="destructive"><AlertDescription>{previaErro}</AlertDescription></Alert>}
          {previa && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-card p-3">
                <div className="text-muted-foreground">NF</div><div className="font-medium">nº {previa.nf_numero ?? "—"} · {previa.nf_valor != null ? formatBRL(Number(previa.nf_valor)) : "—"}</div>
                <div className="text-muted-foreground">Emitida em</div><div>{dataHora(previa.emitida_em)}</div>
                <div className="text-muted-foreground">Etapa do pedido</div><div>{previa.estagio ?? "—"}</div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Caminho escolhido pelo sistema</div>
                <div>{caminhoCorrecaoTexto(previa.fiscal_acao, previa.prazo_cancelamento)}</div>
              </div>
              <p className="text-xs text-muted-foreground">A venda não é desfeita: títulos, etapa e expedição continuam. Abre um chamado para o Fiscal.</p>
              <div className="space-y-1">
                <Label htmlFor="corrigir-nf-motivo">Motivo *</Label>
                <Textarea id="corrigir-nf-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O que saiu errado na NF" />
                {motivo.length > 0 && !motivoOk && <p className="text-xs text-destructive">Mínimo de 5 caracteres.</p>}
              </div>
            </>
          )}
          {erroExec && <Alert variant="destructive"><AlertDescription>{erroExec}</AlertDescription></Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!previa || !motivoOk || executando}>
            {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Abrir correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão + diálogo. Aparece só em pedido B2B, não cancelado, já faturado (etapa) e sem devolução aberta. */
export function BotaoCorrigirNf({ pedido }: { pedido: { id: string; canal?: string | null; estagio?: string | null; cancelado_em?: string | null; nf_numero?: string | null } }) {
  const [aberto, setAberto] = useState(false);
  const perm = usePermissoesTela("tela.devolucoes");
  // NF pode estar autorizada com pedido.nf_numero nulo (ex.: PED-2352) — a etapa é o sinal, e a prévia do banco é o juiz final.
  const elegivelBase = pedido.canal === "B2B" && pedido.estagio !== "cancelado" && !pedido.cancelado_em && ["faturado", "em_transporte", "entregue"].includes(pedido.estagio ?? "");
  const abertaQ = useQuery({
    queryKey: ["devolucao-aberta-pedido", pedido.id],
    enabled: elegivelBase && perm.podeVer,
    queryFn: async () => {
      const [dR, sR] = await Promise.all([
        sb.from("devolucao").select("id,status").eq("pedido_id", pedido.id),
        sb.from("devolucao_status").select("codigo,eh_final"),
      ]);
      if (dR.error) throw dR.error;
      if (sR.error) throw sR.error;
      const finais = new Set(((sR.data ?? []) as any[]).filter((s) => s.eh_final).map((s) => s.codigo));
      return ((dR.data ?? []) as any[]).some((d) => !finais.has(d.status));
    },
  });
  if (!elegivelBase || !perm.podeVer || abertaQ.data !== false) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setAberto(true)}>Corrigir NF</Button>
      <CorrigirNfDialog pedidoId={pedido.id} open={aberto} onOpenChange={setAberto} />
    </>
  );
}
