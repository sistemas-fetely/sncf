import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const QK_TAXAS_PARCELAMENTO = ["safrapay-taxa-parcelamento"];
const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Taxa % total por nº de parcelas (1–12). Ausente = não cadastrada. */
export function useTaxasParcelamento() {
  return useQuery({
    queryKey: QK_TAXAS_PARCELAMENTO,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("safrapay_taxa_parcelamento").select("parcelas, taxa_percentual");
      if (error) throw error;
      const m = new Map<number, number>();
      for (const r of data ?? []) m.set(Number(r.parcelas), Number(r.taxa_percentual));
      return m;
    },
  });
}

export function TaxasParcelamentoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useTaxasParcelamento();
  const [valores, setValores] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open || !q.data) return;
    const v: Record<number, string> = {};
    for (const n of PARCELAS) v[n] = q.data.has(n) ? String(q.data.get(n)) : "";
    setValores(v);
  }, [open, q.data]);

  const salvar = useMutation({
    mutationFn: async () => {
      const upserts: { parcelas: number; taxa_percentual: number }[] = [];
      const remover: number[] = [];
      for (const n of PARCELAS) {
        const s = (valores[n] ?? "").trim().replace(",", ".");
        if (s === "") { if (q.data?.has(n)) remover.push(n); continue; }
        const x = Number(s);
        if (!Number.isFinite(x) || x < 0) throw new Error(`Taxa de ${n}x inválida.`);
        upserts.push({ parcelas: n, taxa_percentual: x });
      }
      if (upserts.length) {
        const { error } = await (supabase as any).from("safrapay_taxa_parcelamento").upsert(upserts, { onConflict: "parcelas" });
        if (error) throw error;
      }
      if (remover.length) {
        const { error } = await (supabase as any).from("safrapay_taxa_parcelamento").delete().in("parcelas", remover);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QK_TAXAS_PARCELAMENTO });
      toast.success("Taxas de parcelamento salvas.");
      onClose();
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !salvar.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Taxas de parcelamento no cartão</DialogTitle>
          <DialogDescription>
            Taxa % total somada ao link SafraPay quando os juros são por conta do cliente. Vazio = não cadastrada.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {PARCELAS.map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm">
                <span className="w-8 text-right tabular-nums">{n}x</span>
                <Input type="number" step="0.01" min="0" className="h-8" value={valores[n] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [n]: e.target.value }))} disabled={salvar.isPending} />
                <span className="text-muted-foreground">%</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || q.isLoading}>
            {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
