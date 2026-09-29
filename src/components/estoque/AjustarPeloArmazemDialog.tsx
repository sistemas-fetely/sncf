/**
 * AJUSTAR-PELO-ARMAZEM (29/09/2026) — diálogo da Conciliação de Estoque que
 * consome a RPC `fn_estoque_ajustar_pelo_armazem` (só super_admin).
 * Fluxo: dry_run=true → prévia ordenada pelo maior |ajuste| → documento
 * obrigatório → dry_run=false (FAIL-LOUD: erro nunca fecha o diálogo).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

interface AjusteItem {
  sku: string; cod_cadastro: string | null; nome: string | null;
  contabil: number; real_xpm: number; ajuste: number; sentido: "entrada" | "saida";
}
interface BloqueadoItem { sku: string; cod_cadastro: string | null; motivo: string }
interface RpcResultado {
  ok: boolean; dry_run: boolean; ajustados: number;
  itens: AjusteItem[]; bloqueados: BloqueadoItem[];
  total_entrada: number; total_saida: number;
}

export interface AjustarPeloArmazemDialogProps {
  aberto: boolean;
  onFechar: () => void;
  skus: string[];
  onAjustado: () => void;
}

export function AjustarPeloArmazemDialog({ aberto, onFechar, skus, onAjustado }: AjustarPeloArmazemDialogProps) {
  const [documento, setDocumento] = useState("");
  const [obs, setObs] = useState("");
  const [bloqueadosAberto, setBloqueadosAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDocumento("");
      setObs("");
      setBloqueadosAberto(false);
      setConfirmando(false);
    }
  }, [aberto]);

  const previa = useQuery({
    queryKey: ["estoque-ajustar-pelo-armazem-previa", aberto ? skus.slice().sort().join(",") : ""],
    enabled: aberto && skus.length > 0,
    queryFn: async (): Promise<RpcResultado> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_estoque_ajustar_pelo_armazem", {
        p_skus: skus,
        p_documento: "(prévia)",
        p_dry_run: true,
      });
      if (error) throw error;
      const r = (data ?? {}) as RpcResultado;
      if (r.ok === false) throw new Error("A RPC recusou a prévia do ajuste.");
      return r;
    },
  });

  const itens = previa.data?.itens ?? [];
  const bloqueados = previa.data?.bloqueados ?? [];
  const ordenados = useMemo(
    () => [...itens].sort((a, b) => Math.abs(b.ajuste) - Math.abs(a.ajuste)),
    [itens],
  );
  const temGrande = itens.some(i => Math.abs(i.ajuste) >= 100);

  async function confirmar() {
    if (!documento.trim()) {
      toast.error("Informe o documento do ajuste (ex.: “Posição XPM 29/09”).");
      return;
    }
    setConfirmando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_estoque_ajustar_pelo_armazem", {
        p_skus: skus,
        p_documento: documento.trim(),
        p_obs: obs.trim() || null,
        p_dry_run: false,
      });
      if (error) throw error;
      const r = (data ?? {}) as RpcResultado;
      if (r.ok === false) throw new Error("A RPC recusou o ajuste.");
      toast.success(`${r.ajustados} ajustes lançados`);
      onAjustado();
      onFechar();
    } catch (e) {
      toast.error(`Não foi possível lançar o ajuste: ${formatError(e)}`);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Ajustar estoque pelo armazém (XPM-SC)</DialogTitle>
          <DialogDescription>
            Prévia dos ajustes entre o contábil SNCF e o real do XPM. Nada é lançado antes da confirmação.
          </DialogDescription>
        </DialogHeader>

        {previa.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Calculando prévia…</p>}
        {previa.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Erro na prévia: {formatError(previa.error)}</AlertDescription>
          </Alert>
        )}

        {previa.data && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{itens.length} a ajustar</span>
              {" · entradas +"}
              {previa.data.total_entrada} un · saídas {previa.data.total_saida} un · {bloqueados.length} bloqueados
            </p>

            {temGrande && (
              <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Há ajustes grandes — confira antes de confirmar (pode ser mercadoria em trânsito, reservada ou recebimento não lançado).
                </AlertDescription>
              </Alert>
            )}

            {ordenados.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <Table className="text-xs">
                  <TableHeader><TableRow className="bg-muted">
                    <TableHead>Cód.</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Contábil SNCF</TableHead>
                    <TableHead className="text-right">Real XPM</TableHead>
                    <TableHead className="text-right">Ajuste</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {ordenados.map(i => (
                      <TableRow key={i.sku}>
                        <TableCell className="font-medium">{i.cod_cadastro ?? "—"}</TableCell>
                        <TableCell className="max-w-56 truncate">{i.nome ?? i.sku}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.contabil}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.real_xpm}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", i.sentido === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                          {i.ajuste > 0 ? `+${i.ajuste}` : i.ajuste}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {bloqueados.length > 0 && (
              <div>
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => setBloqueadosAberto(v => !v)}>
                  {bloqueadosAberto ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                  Bloqueados ({bloqueados.length})
                </Button>
                {bloqueadosAberto && (
                  <div className="mt-2 rounded-md border p-2">
                    <Table className="text-xs">
                      <TableHeader><TableRow>
                        <TableHead>Cód.</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {bloqueados.map(b => (
                          <TableRow key={b.sku}>
                            <TableCell className="font-medium">{b.cod_cadastro ?? "—"}</TableCell>
                            <TableCell>{b.motivo}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <div className="space-y-1">
                <Label htmlFor="ajuste-documento">Documento *</Label>
                <Input id="ajuste-documento" value={documento} onChange={e => setDocumento(e.target.value)} placeholder="Ex.: Posição XPM 29/09" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ajuste-obs">Observação</Label>
                <Input id="ajuste-obs" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={confirmando}>Cancelar</Button>
          <Button size="sm" onClick={confirmar} disabled={confirmando || previa.isLoading || itens.length === 0 || !documento.trim()}>
            Confirmar ajuste ({itens.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AjustarPeloArmazemDialog;
