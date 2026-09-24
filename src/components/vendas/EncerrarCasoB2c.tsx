import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArchiveX, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { formatError } from "@/lib/format-error";
import type { PedidoB2cRow } from "@/hooks/vendas/useB2c";

const ESTAGIOS_SEM_ENCERRAR = ["entregue", "cancelado", "encerrado"];
const MIN_MOTIVO = 5;

/**
 * Encerrar / reabrir caso B2C. A RPC decide e recusa com mensagem em português;
 * a tela só mostra o que o banco devolveu (FAIL-LOUD, sem estado otimista).
 */
export function EncerrarCasoB2c({
  pedido,
  variante = "icone",
  onFeito,
}: {
  pedido: PedidoB2cRow;
  variante?: "icone" | "botao";
  onFeito?: () => void;
}) {
  const qc = useQueryClient();
  const { permitido, carregando } = usePermissaoAcaoOuSuperAdmin("acao.encerrar_pedido_b2c");
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);

  const encerrado = pedido.estagio === "encerrado";
  const podeEncerrar = !ESTAGIOS_SEM_ENCERRAR.includes(pedido.estagio ?? "");
  if (!pedido.order_name || (!encerrado && !podeEncerrar)) return null;

  const rotulo = encerrado ? "Reabrir caso" : "Encerrar caso";
  const Icone = encerrado ? ArchiveRestore : ArchiveX;
  const dica = carregando ? "Verificando permissão…" : permitido ? rotulo : `Sem permissão para ${rotulo.toLowerCase()}`;
  const motivoOk = motivo.trim().length >= MIN_MOTIVO;

  async function confirmar() {
    if (!motivoOk || gravando) return;
    setGravando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        encerrado ? "fn_b2c_reabrir_pedido" : "fn_b2c_encerrar_pedido",
        { p_order_name: pedido.order_name, p_motivo: motivo.trim() },
      );
      if (error) throw error;
      if (!data || data.ok !== true) throw new Error(data?.erro ?? data?.mensagem ?? "O banco não confirmou a operação.");
      await qc.invalidateQueries({ queryKey: ["b2c-pedidos"] });
      await qc.invalidateQueries({ queryKey: ["b2c-pipeline"] });
      toast.success(encerrado ? `Caso ${pedido.order_name} reaberto.` : `Caso ${pedido.order_name} encerrado.`);
      setAberto(false);
      setMotivo("");
      onFeito?.();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setGravando(false);
    }
  }

  const gatilho =
    variante === "icone" ? (
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={carregando || !permitido}
        aria-label={`${rotulo} ${pedido.order_name}`} onClick={() => setAberto(true)}>
        <Icone className="h-3.5 w-3.5" />
      </Button>
    ) : (
      <Button size="sm" variant="outline" disabled={carregando || !permitido} onClick={() => setAberto(true)}>
        <Icone className="mr-2 h-3.5 w-3.5" />
        {rotulo}
      </Button>
    );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{gatilho}</span></TooltipTrigger>
        <TooltipContent>{dica}</TooltipContent>
      </Tooltip>
      <Dialog open={aberto} onOpenChange={(v) => { if (gravando) return; setAberto(v); if (!v) setMotivo(""); }}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{rotulo} {pedido.order_name}?</DialogTitle>
            <DialogDescription>
              {encerrado
                ? "O pedido volta para a carteira ativa e retoma o acompanhamento normal."
                : "Isto encerra o caso SEM confirmação de entrega. O pedido sai da carteira ativa e passa a aparecer como “Encerrado sem entrega”."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`motivo-encerrar-${pedido.order_name}`}>Motivo (obrigatório, mínimo {MIN_MOTIVO} caracteres)</Label>
            <Textarea id={`motivo-encerrar-${pedido.order_name}`} rows={3} value={motivo}
              onChange={(e) => setMotivo(e.target.value)} disabled={gravando} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={gravando} onClick={() => { setAberto(false); setMotivo(""); }}>Cancelar</Button>
            <Button variant={encerrado ? "default" : "destructive"} disabled={!motivoOk || gravando} onClick={() => void confirmar()}>
              {gravando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {rotulo}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
