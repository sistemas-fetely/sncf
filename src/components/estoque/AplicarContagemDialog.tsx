/**
 * APLICAR-CONTAGEM (ESTOQUE v5 F2) — diálogo da Conciliação de Estoque que
 * consome `fn_contagem_aplicar` (só super_admin) para centros manuais
 * (regra `estoque_furo_fiscal_fisico`). Prévia dry_run=true → documento
 * obrigatório → dry_run=false. FAIL-LOUD: erro do banco inteiro no toast.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { CodProduto } from "@/components/produto/CodProduto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";
import { cn } from "@/lib/utils";

interface ItemContagem {
  sku: string; cod_cadastro: string | null; nome: string | null; condicao: string | null;
  contabil_na_contagem: number | null; contado: number; contabil_hoje: number; ajuste: number;
  sentido: "entrada" | "saida"; data_contagem: string | null; mov_pos_contagem: number | null;
}
interface Bloqueado { sku: string; cod_cadastro: string | null; motivo: string }
interface Resultado {
  ok: boolean; dry_run: boolean; centro: string; ajustados: number;
  itens: ItemContagem[]; bloqueados: Bloqueado[]; total_entrada: number; total_saida: number;
}

function documentoPadrao() {
  const d = new Date();
  return `contagem ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function chamar(centro: string, skus: string[], documento: string, obs: string | null, dry: boolean): Promise<Resultado> {
  const { data, error } = await supabase.rpc("fn_contagem_aplicar", {
    p_centro_codigo: centro, p_skus: skus, p_documento: documento, p_obs: obs ?? undefined, p_dry_run: dry,
  });
  if (error) throw error;
  const r = (data ?? {}) as unknown as Resultado;
  if (r.ok === false) throw new Error("O banco recusou a aplicação da contagem.");
  return r;
}

export function AplicarContagemDialog({ aberto, onFechar, centro, centroNome, skus, onAplicado }: {
  aberto: boolean; onFechar: () => void; centro: string | null; centroNome?: string | null; skus: string[]; onAplicado: () => void;
}) {
  const qc = useQueryClient();
  const [documento, setDocumento] = useState("");
  const [obs, setObs] = useState("");
  const [bloqAberto, setBloqAberto] = useState(true);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => { if (aberto) { setDocumento(documentoPadrao()); setObs(""); setAplicando(false); } }, [aberto]);

  const previa = useQuery({
    queryKey: ["contagem-aplicar-previa", centro, aberto ? [...skus].sort().join(",") : ""],
    enabled: aberto && !!centro && skus.length > 0,
    queryFn: () => chamar(centro!, skus, "(prévia)", null, true),
  });
  const itens = useMemo(() => [...(previa.data?.itens ?? [])].sort((a, b) => Math.abs(b.ajuste) - Math.abs(a.ajuste)), [previa.data]);
  const bloqueados = previa.data?.bloqueados ?? [];

  async function aplicar() {
    if (!centro || !documento.trim()) return;
    setAplicando(true);
    try {
      const r = await chamar(centro, skus, documento.trim(), obs.trim() || null, false);
      toast.success(`${r.ajustados} ajustes de contagem aplicados`);
      await qc.invalidateQueries({ predicate: (q) => /estoque|conciliacao|contagem/.test(JSON.stringify(q.queryKey)) });
      onAplicado();
      onFechar();
    } catch (e) {
      toast.error(`Não foi possível aplicar a contagem: ${formatError(e)}`, { duration: 12000 });
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Aplicar contagem — {centroNome ?? centro}</DialogTitle>
          <DialogDescription>Prévia do ajuste do contábil pela última contagem. Nada é lançado antes de aplicar.</DialogDescription>
        </DialogHeader>

        {previa.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Calculando prévia…</p>}
        {previa.error && (
          <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Erro na prévia: {formatError(previa.error)}</AlertDescription></Alert>
        )}

        {previa.data && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{itens.length} a ajustar</span> · entradas +{previa.data.total_entrada} un · saídas {previa.data.total_saida} un · {bloqueados.length} bloqueados
            </p>
            {itens.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <Table className="text-xs">
                  <TableHeader><TableRow className="bg-muted">
                    <TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Condição</TableHead>
                    <TableHead className="text-right">Contábil</TableHead><TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Ajuste</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {itens.map((i) => (
                      <TableRow key={`${i.sku}|${i.condicao}`}>
                        <TableCell><CodProduto chave={i.sku} variant="compacto" /></TableCell>
                        <TableCell className="max-w-56">
                          <div className="truncate">{i.nome ?? i.sku}</div>
                          {i.data_contagem && <div className="text-[10px] text-muted-foreground">contado em {fmtData(i.data_contagem)}{i.mov_pos_contagem ? ` · ${i.mov_pos_contagem} mov. depois` : ""}</div>}
                        </TableCell>
                        <TableCell>{i.condicao ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.contabil_hoje}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.contado}</TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", i.ajuste > 0 ? "text-success" : "text-destructive")}>
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
                <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => setBloqAberto((v) => !v)}>
                  {bloqAberto ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}Bloqueados ({bloqueados.length})
                </Button>
                {bloqAberto && (
                  <div className="mt-2 rounded-md border p-2">
                    <Table className="text-xs">
                      <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {bloqueados.map((b) => (
                          <TableRow key={b.sku}><TableCell><CodProduto chave={b.sku} variant="compacto" /></TableCell><TableCell>{b.motivo}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="contagem-doc">Documento *</Label>
                <Input id="contagem-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contagem-obs">Observação</Label>
                <Input id="contagem-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onFechar} disabled={aplicando}>Cancelar</Button>
          <Button size="sm" onClick={aplicar} disabled={aplicando || previa.isLoading || itens.length === 0 || !documento.trim()}>
            Aplicar ({itens.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AplicarContagemDialog;
