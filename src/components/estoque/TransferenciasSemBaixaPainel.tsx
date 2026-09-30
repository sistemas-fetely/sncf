/**
 * Transferências é dona do DESTINO. Quando a NF da transferência fica sem baixa
 * de estoque, o destino é declarado aqui via `fn_transferencia_declarar_destino`
 * (prévia dry_run → confirmação) e o motor único lança saída na origem e
 * entrada no destino. `p_sem_controle=true` (centro nulo) = mercadoria foi para
 * lugar sem controle de estoque (ex.: Show Room) — só sai da origem.
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { formatError } from "@/lib/format-error";
import { fmtData } from "@/lib/data";

type Remessa = {
  pedido_id: string; id_externo: string | null; estagio: string | null; data_pedido: string | null;
  destino_pedido: string | null; nf_numero: string | null; nf_data: string | null; nf_chave: string;
  cfops: string | null; itens: number | null; unidades: number | null; destino_pela_regra: string | null;
};
type Previa = {
  ok?: boolean; erro?: string; dry_run?: boolean; gravado?: boolean; pedido?: string;
  notas?: number; itens?: number; unidades?: number;
  travados?: { nf: string; sku: string; qtd: number; porque: string }[];
  previa?: { nf: string; sku: string; qtd: number; origem: string; destino: string }[];
};

export function TransferenciasSemBaixaPainel({ onLancado }: { onLancado?: () => void }) {
  const sb = supabase as any;
  const [sel, setSel] = useState<Remessa | null>(null);
  const [tipo, setTipo] = useState<"centro" | "sem">("centro");
  const [centro, setCentro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [assinaturaPrevia, setAssinaturaPrevia] = useState("");
  const [rodando, setRodando] = useState<"previa" | "gravar" | null>(null);

  const q = useQuery({
    queryKey: ["transferencia-nf-sem-baixa"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_transferencia_nf_sem_baixa")
        .select("pedido_id, id_externo, estagio, data_pedido, destino_pedido, nf_numero, nf_data, nf_chave, cfops, itens, unidades, destino_pela_regra")
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Remessa[];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["centros-ativos-declarar"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("centro_distribuicao")
        .select("codigo, rotulo_curto, nome")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo_curto: string | null; nome: string }[];
    },
  });

  function abrir(r: Remessa) {
    setSel(r);
    setTipo("centro");
    setCentro(r.destino_pedido || r.destino_pela_regra || "");
    setMotivo("");
    setPrevia(null);
    setAssinaturaPrevia("");
    setRodando(null);
  }

  const assinaturaAtual = `${tipo}|${centro}|${motivo.trim()}`;
  const travados = previa?.travados ?? [];
  const podeConfirmar = !!previa && travados.length === 0 && previa.ok !== false && assinaturaPrevia === assinaturaAtual;

  async function chamar(dry: boolean) {
    if (!sel) return;
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    setRodando(dry ? "previa" : "gravar");
    try {
      const { data, error } = await sb.rpc("fn_transferencia_declarar_destino", {
        p_pedido_id: sel.pedido_id,
        p_centro_codigo: tipo === "centro" ? centro || null : null,
        p_sem_controle: tipo === "sem",
        p_motivo: motivo.trim(),
        p_dry_run: dry,
      });
      if (error) throw error;
      const r = (data ?? {}) as Previa;
      if (r.ok === false && !(r.travados?.length)) throw new Error(r.erro ?? "O banco recusou o lançamento.");
      if (dry) { setPrevia(r); setAssinaturaPrevia(assinaturaAtual); return; }
      if (!r.gravado) throw new Error(r.erro ?? "O lançamento não foi gravado.");
      toast.success(`${sel.id_externo ?? ""}: ${r.itens ?? 0} itens lançados`);
      setSel(null);
      await q.refetch();
      onLancado?.();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setRodando(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notas de transferência sem baixa</CardTitle>
        <p className="text-sm text-muted-foreground">A nota da transferência saiu, mas o estoque não foi movimentado. Declare para onde a mercadoria foi: o sistema dá saída da origem e entrada no destino.</p>
      </CardHeader>
      <CardContent className="p-0">
        {q.isError ? <Alert variant="destructive" className="m-4 w-auto"><AlertDescription>{formatError(q.error)}</AlertDescription></Alert> :
          q.isLoading ? <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> :
          (q.data ?? []).length === 0 ? null : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Pedido</TableHead><TableHead>Estágio</TableHead><TableHead>NF</TableHead><TableHead>Data</TableHead>
                <TableHead>CFOP</TableHead><TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Unidades</TableHead>
                <TableHead>Destino no pedido</TableHead><TableHead>Sugestão da regra</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {q.data!.map(r => (
                  <TableRow key={r.nf_chave}>
                    <TableCell className="font-mono">{r.id_externo ?? "—"}</TableCell>
                    <TableCell>{r.estagio ?? "—"}</TableCell>
                    <TableCell className="font-mono">{r.nf_numero ?? "—"}</TableCell>
                    <TableCell>{fmtData(r.nf_data)}</TableCell>
                    <TableCell>{r.cfops ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.itens ?? 0}</TableCell>
                    <TableCell className="text-right">{r.unidades ?? 0}</TableCell>
                    <TableCell>{r.destino_pedido ?? "—"}</TableCell>
                    <TableCell><span className="text-xs text-muted-foreground">{r.destino_pela_regra ?? "—"}</span></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => abrir(r)}>Declarar destino</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>

      <Dialog open={!!sel} onOpenChange={o => { if (!o && !rodando) setSel(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] !flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Declarar destino — NF {sel?.nf_numero ?? ""}</DialogTitle>
            <DialogDescription>Pedido {sel?.id_externo ?? "—"} · {sel?.itens ?? 0} itens · {sel?.unidades ?? 0} unidades</DialogDescription>
          </DialogHeader>
          <div className="shrink-0 space-y-3">
            <div className="space-y-2">
              <Label>Destino</Label>
              <RadioGroup value={tipo} onValueChange={v => { setTipo(v as "centro" | "sem"); setPrevia(null); }}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="centro" id="td-centro" className="mt-1" />
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="td-centro" className="font-normal">Centro</Label>
                    <Select value={centro} onValueChange={v => { setCentro(v); setPrevia(null); }} disabled={tipo !== "centro"}>
                      <SelectTrigger><SelectValue placeholder={centrosQ.isLoading ? "Carregando centros…" : "Selecione o centro"} /></SelectTrigger>
                      <SelectContent>
                        {(centrosQ.data ?? []).map(c => (
                          <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo_curto ?? c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="sem" id="td-sem" className="mt-1" />
                  <Label htmlFor="td-sem" className="font-normal">Sem controle de estoque (ex.: Show Room)</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label>Motivo *</Label>
              <Textarea rows={2} value={motivo} onChange={e => { setMotivo(e.target.value); setPrevia(null); }} />
            </div>
            <Button variant="outline" onClick={() => chamar(true)} disabled={!!rodando || !motivo.trim() || (tipo === "centro" && !centro)}>
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
                          <TableHeader><TableRow>
                            <TableHead className="sticky top-0 bg-background z-10">NF</TableHead>
                            <TableHead className="sticky top-0 bg-background z-10">SKU</TableHead>
                            <TableHead className="sticky top-0 bg-background z-10 text-right">Qtd</TableHead>
                            <TableHead className="sticky top-0 bg-background z-10">Porque</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>{travados.map((t, i) => (
                            <TableRow key={i}><TableCell className="font-mono">{t.nf}</TableCell><TableCell className="font-mono">{t.sku}</TableCell><TableCell className="text-right">{t.qtd}</TableCell><TableCell>{t.porque}</TableCell></TableRow>
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
                  <TableHead className="sticky top-0 bg-background z-10">NF</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">SKU</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10 text-right">Qtd</TableHead>
                  <TableHead className="sticky top-0 bg-background z-10">Origem → destino</TableHead>
                </TableRow></TableHeader>
                <TableBody>{previa.previa!.map((l, i) => (
                  <TableRow key={i}><TableCell className="font-mono">{l.nf}</TableCell><TableCell className="font-mono">{l.sku}</TableCell><TableCell className="text-right">{l.qtd}</TableCell><TableCell>{l.origem} → {l.destino}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setSel(null)} disabled={!!rodando}>Cancelar</Button>
            <BotaoGuardado slug="acao.transferencia_destino_declarar" rotuloAcao="Declarar destino de transferência sem baixa" onClick={() => chamar(false)} disabled={!podeConfirmar || !!rodando}>
              {rodando === "gravar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e lançar
            </BotaoGuardado>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default TransferenciasSemBaixaPainel;
