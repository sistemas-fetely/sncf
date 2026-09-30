/**
 * Modelo venda_fora: retorno (1904) do que não vendeu. Lança via
 * `fn_consignado_retorno_lancar` (prévia dry_run → confirmação).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { fmtData } from "@/lib/data";

type Retorno = {
  stage_id: string; nf_numero: string | null; nf_data: string | null; nf_chave_acesso: string | null; valor_nota: number | null;
  destinatario_nf: string | null; cfops: string | null; itens: number | null; unidades: number | null; destino_pela_regra: string | null;
};
type Previa = {
  ok?: boolean; erro?: string; gravado?: boolean; nf?: string; itens?: number; unidades?: number;
  travados?: { sku: string; qtd: number; porque: string }[];
  previa?: { sku: string; qtd: number; origem: string; destino: string; saldo_antes: number | null }[];
};
const TH = "sticky top-0 bg-background z-10";

export function RetornosALancarPainel({ parceiroId, parceiroNome }: { parceiroId: string; parceiroNome: string }) {
  const sb = supabase as any;
  const [sel, setSel] = useState<Retorno | null>(null);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [rodando, setRodando] = useState<"previa" | "gravar" | null>(null);

  const q = useQuery({
    queryKey: ["consignado-retorno-sem-baixa"],
    queryFn: async () => {
      const { data, error } = await sb.from("vw_consignado_retorno_sem_baixa").select("*").order("nf_data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Retorno[];
    },
  });
  const centrosQ = useQuery({
    queryKey: ["centros-ativos-retorno-consignado"],
    queryFn: async () => {
      const { data, error } = await sb.from("centro_distribuicao").select("codigo, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { codigo: string; nome: string }[];
    },
  });

  function abrir(r: Retorno) { setSel(r); setDestino(r.destino_pela_regra ?? ""); setMotivo(""); setPrevia(null); setRodando(null); }

  async function chamar(dry: boolean) {
    if (!sel) return;
    if (!destino) { toast.error("Escolha o destino."); return; }
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    setRodando(dry ? "previa" : "gravar");
    try {
      const { data, error } = await sb.rpc("fn_consignado_retorno_lancar", {
        p_stage_id: sel.stage_id, p_parceiro_id: parceiroId, p_centro_destino: destino, p_motivo: motivo.trim(), p_dry_run: dry,
      });
      if (error) throw error;
      const r = (data ?? {}) as Previa;
      if (r.ok === false && !(r.travados?.length)) throw new Error(r.erro ?? "O banco recusou o retorno.");
      if (dry) { setPrevia(r); return; }
      if (!r.gravado) throw new Error(r.erro ?? "O retorno não foi gravado.");
      toast.success(`Retorno NF ${r.nf ?? sel.nf_numero ?? ""} lançado: ${r.itens ?? 0} itens · ${r.unidades ?? 0} unidades`);
      setSel(null);
      await q.refetch();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setRodando(null);
    }
  }

  const travados = previa?.travados ?? [];
  const podeConfirmar = !!previa && travados.length === 0 && previa.ok !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notas de retorno a lançar</CardTitle>
        <p className="text-sm text-muted-foreground">Retorno (1904) do que não vendeu. Ao lançar: sai do centro do parceiro e entra no destino.</p>
      </CardHeader>
      <CardContent className="p-0">
        {q.isError ? <Alert variant="destructive" className="m-4 w-auto"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert> :
          q.isLoading ? <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
          (q.data ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma nota de retorno pendente.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>NF</TableHead><TableHead>Data</TableHead><TableHead>CFOP</TableHead>
                <TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Valor</TableHead>
                <TableHead>Sugestão da regra</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {q.data!.map(r => (
                  <TableRow key={r.stage_id}>
                    <TableCell className="font-mono">{r.nf_numero ?? "—"}</TableCell>
                    <TableCell>{fmtData(r.nf_data)}</TableCell>
                    <TableCell>{r.cfops ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.itens ?? 0}</TableCell>
                    <TableCell className="text-right">{r.unidades ?? 0}</TableCell>
                    <TableCell className="text-right">{r.valor_nota != null ? formatBRL(r.valor_nota) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.destino_pela_regra ?? "—"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => abrir(r)}>Lançar retorno</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>

      <Dialog open={!!sel} onOpenChange={o => { if (!o && !rodando) setSel(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] !flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Lançar retorno NF {sel?.nf_numero ?? ""}</DialogTitle>
            <DialogDescription>Sai do centro de {parceiroNome} e entra no destino.</DialogDescription>
          </DialogHeader>
          <div className="shrink-0 space-y-3">
            <div className="space-y-1">
              <Label>Destino *</Label>
              {centrosQ.isError ? <p className="text-sm text-destructive">{formatError(centrosQ.error)}</p> : (
                <Select value={destino} onValueChange={v => { setDestino(v); setPrevia(null); }}>
                  <SelectTrigger><SelectValue placeholder="Escolha o centro" /></SelectTrigger>
                  <SelectContent>{(centrosQ.data ?? []).map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome} ({c.codigo})</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label>Motivo *</Label>
              <Textarea rows={2} value={motivo} onChange={e => { setMotivo(e.target.value); setPrevia(null); }} />
            </div>
            <Button variant="outline" onClick={() => chamar(true)} disabled={!!rodando || !motivo.trim() || !destino}>
              {rodando === "previa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver prévia
            </Button>
            {previa && (
              <>
                <p className="text-sm font-medium">{previa.itens ?? 0} itens · {previa.unidades ?? 0} unidades</p>
                {travados.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTitle>Não dá para lançar ainda</AlertTitle>
                    <AlertDescription>
                      <div className="max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead className={TH}>SKU</TableHead><TableHead className={`${TH} text-right`}>Qtd</TableHead><TableHead className={TH}>Porque</TableHead></TableRow></TableHeader>
                          <TableBody>{travados.map((t, i) => (
                            <TableRow key={i}><TableCell className="font-mono">{t.sku}</TableCell><TableCell className="text-right">{t.qtd}</TableCell><TableCell>{t.porque}</TableCell></TableRow>
                          ))}</TableBody>
                        </Table>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {previa.ok === false && travados.length === 0 && previa.erro && <p className="text-sm text-destructive">{previa.erro}</p>}
              </>
            )}
          </div>
          {previa && (previa.previa ?? []).length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto border-t pt-3">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className={TH}>SKU</TableHead><TableHead className={`${TH} text-right`}>Qtd</TableHead>
                  <TableHead className={TH}>Origem → destino</TableHead><TableHead className={`${TH} text-right`}>Saldo antes</TableHead>
                </TableRow></TableHeader>
                <TableBody>{previa.previa!.map((l, i) => (
                  <TableRow key={i}><TableCell className="font-mono">{l.sku}</TableCell><TableCell className="text-right">{l.qtd}</TableCell><TableCell>{l.origem} → {l.destino}</TableCell><TableCell className="text-right">{l.saldo_antes ?? "—"}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setSel(null)} disabled={!!rodando}>Cancelar</Button>
            <BotaoGuardado slug="acao.consignado_ciclo_fechar" rotuloAcao="Lançar retorno de consignado" onClick={() => chamar(false)} disabled={!podeConfirmar || !!rodando}>
              {rodando === "gravar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar retorno
            </BotaoGuardado>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default RetornosALancarPainel;
