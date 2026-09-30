import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface VincularRascunhoOrigem { nfOrigemNumero: string; pecas: number; valor: number }

export function VincularRascunhoDialog({ retornoId, origem, aberto, onOpenChange, onSuccess }: { retornoId: string; origem?: VincularRascunhoOrigem; aberto: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberto) { setNumero(""); setErro(null); } }, [aberto]);
  const salvar = useMutation({
    mutationFn: async () => {
      const n = numero.trim();
      if (!/^\d+$/.test(n)) throw new Error("Informe o número da NF no Bling (só dígitos).");
      const { data, error } = await supabase.functions.invoke("regularizacao-vincular-rascunho", { body: { retorno_nf_id: retornoId, numero: n } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const corpo = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error(corpo?.erro ?? rawMessage(error));
      }
      if (!data?.ok) throw new Error(data?.erro ?? "A vinculação não foi confirmada.");
      return data as { numero: string };
    },
    onMutate: () => setErro(null),
    onSuccess: (d) => { toast.success(`Rascunho NF ${d.numero} vinculado.`); onOpenChange(false); onSuccess(); },
    onError: (e) => setErro(rawMessage(e)),
  });
  return <Dialog open={aberto} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Vincular rascunho existente</DialogTitle></DialogHeader>
    {origem && <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">Retorno da NF {origem.nfOrigemNumero} · {origem.pecas} peças · {formatBRL(origem.valor)}</div>}
    <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
      <Label htmlFor="nf-bling">Número da NF no Bling</Label>
      <Input id="nf-bling" inputMode="numeric" autoComplete="off" placeholder="000017" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <p className="text-xs text-muted-foreground">O número que aparece na lista de NFs do Bling. O SNCF confere destinatário, valor e itens antes de vincular.</p>
      {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
    </form>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? "Conferindo…" : "Confirmar"}</Button></DialogFooter></DialogContent></Dialog>;
}
