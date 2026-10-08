/**
 * "Usar saldo da conta" — quita o portão do pedido com o saldo já lançado na
 * conta do cliente. A RPC `fn_portao_quitar_com_saldo_conta` é a fonte de
 * verdade: simula (p_simular=true) para a prévia e grava com p_simular=false.
 * FAIL-LOUD: erro do banco sai no toast exatamente como veio.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { QK_CONTA_CLIENTE_COBERTURA } from "@/hooks/financeiro/useContaCliente";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LinhaQuitar {
  parcela?: number | string | null;
  sequencia?: number | string | null;
  tipo?: string | null;
  tipo_pagamento?: string | null;
  valor?: number | null;
}

interface RetornoQuitar {
  ok?: boolean;
  erro?: string | null;
  idempotente?: boolean;
  valor_aberto?: number | null;
  lancamento_chave?: string | null;
  nivel_prova?: string | null;
  linhas?: LinhaQuitar[] | null;
  avanca_para?: string | null;
}

async function chamar(pedidoId: string, simular: boolean): Promise<RetornoQuitar> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("fn_portao_quitar_com_saldo_conta", {
    p_pedido_id: pedidoId,
    p_lancamento_id: null,
    p_simular: simular,
  });
  if (error) throw error;
  const res = (data ?? {}) as RetornoQuitar;
  if (res.ok === false) throw new Error(res.erro || JSON.stringify(res));
  return res;
}

export function useUsarSaldoConta(pedidoId: string) {
  const qc = useQueryClient();
  const [previa, setPrevia] = useState<RetornoQuitar | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [gravando, setGravando] = useState(false);

  async function iniciar() {
    setSimulando(true);
    try {
      const res = await chamar(pedidoId, true);
      if (res.idempotente) {
        toast.success("Portão já estava quitado");
        return;
      }
      setPrevia(res);
    } catch (e) {
      console.error("[fn_portao_quitar_com_saldo_conta simular]", e);
      toast.error(rawMessage(e));
    } finally {
      setSimulando(false);
    }
  }

  async function confirmar() {
    setGravando(true);
    try {
      await chamar(pedidoId, false);
      toast.success("Portão quitado com o saldo da conta do cliente");
      setPrevia(null);
      invalidarPedido(qc, pedidoId);
      qc.invalidateQueries({ queryKey: ["pedido-portao-atual"] });
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA] });
    } catch (e) {
      console.error("[fn_portao_quitar_com_saldo_conta]", e);
      toast.error(rawMessage(e));
    } finally {
      setGravando(false);
    }
  }

  const dialogo = (
    <Dialog open={!!previa} onOpenChange={(v) => { if (!v && !gravando) setPrevia(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Usar saldo da conta</DialogTitle>
        </DialogHeader>
        {previa && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Valor em aberto</dt>
              <dd className="font-medium tabular-nums">{formatBRL(previa.valor_aberto ?? 0)}</dd>
              <dt className="text-muted-foreground">Lançamento</dt>
              <dd className="break-all">{previa.lancamento_chave ?? "—"}</dd>
              <dt className="text-muted-foreground">Nível de prova</dt>
              <dd>{previa.nivel_prova ?? "—"}</dd>
            </dl>
            {(previa.linhas ?? []).length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(previa.linhas ?? []).map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.parcela ?? l.sequencia ?? i + 1}</TableCell>
                      <TableCell>{l.tipo ?? l.tipo_pagamento ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(l.valor ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {previa.avanca_para && (
              <p className="font-medium">Pedido avança para: {previa.avanca_para}</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPrevia(null)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={gravando}>
            {gravando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { iniciar, simulando, dialogo };
}
