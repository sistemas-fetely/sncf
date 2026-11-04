/**
 * Bloco K — "estoque em poder de" e CNPJ do participante por centro de estoque.
 * Rótulos da posse vêm de estoque_posse_dim; gravação só pela fn_contabil_centro_posse_salvar.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Selo } from "@/components/ui/selo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { rawMessage } from "@/lib/format-error";

type Centro = { id: string; codigo: string; nome: string | null; posse: string | null; participante_cnpj: string | null };
type Posse = { codigo: string; rotulo: string; ordem: number };
const A_CONFIRMAR = "__a_confirmar";

export function PosseCentros() {
  const qc = useQueryClient();
  const { permitido } = usePermissaoAcao("acao.contabil_centro_posse.editar");
  const q = useQuery({
    queryKey: ["contabil-posse-centros"],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        (supabase as any).from("centro_distribuicao").select("id,codigo,nome,posse,participante_cnpj").eq("ativo", true).eq("contabil", true).order("ordem"),
        (supabase as any).from("estoque_posse_dim").select("*").order("ordem"),
      ]);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      return { centros: (c.data ?? []) as Centro[], posses: (p.data ?? []) as Posse[] };
    },
  });
  const [rasc, setRasc] = useState<Record<string, { posse: string; cnpj: string }>>({});
  const salvar = useMutation({
    mutationFn: async (c: Centro) => {
      const r = rasc[c.id];
      const { error } = await (supabase as any).rpc("fn_contabil_centro_posse_salvar", {
        p_centro_id: c.id, p_posse: r.posse === A_CONFIRMAR ? null : r.posse, p_participante_cnpj: r.cnpj || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, c) => {
      toast.success(`Posse de ${c.codigo} salva`);
      setRasc((m) => { const n = { ...m }; delete n[c.id]; return n; });
      qc.invalidateQueries({ queryKey: ["contabil-posse-centros"] });
      qc.invalidateQueries({ queryKey: ["contabil-bloco-k"] });
    },
    onError: (e) => toast.error(rawMessage(e), { duration: Infinity, closeButton: true }),
  });

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm" aria-label="Estoque em poder de">
      <div>
        <h2 className="text-sm font-medium">Bloco K · estoque em poder de</h2>
        <p className="text-xs text-muted-foreground">Define a coluna "Estoque em poder de" e o CNPJ do participante de cada centro na planilha.</p>
      </div>
      {q.error ? <p className="text-sm text-destructive">{rawMessage(q.error)}</p> : q.isLoading ? <p className="text-sm text-muted-foreground">Carregando centros…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-left font-normal">Centro</th><th className="text-left font-normal">Estoque em poder de</th><th className="text-left font-normal">CNPJ do participante</th><th /></tr></thead>
            <tbody>
              {q.data!.centros.map((c) => {
                const r = rasc[c.id] ?? { posse: c.posse ?? A_CONFIRMAR, cnpj: c.participante_cnpj ?? "" };
                const mudou = !!rasc[c.id];
                const aviso = !c.posse ? "a confirmar" : c.posse !== "proprio" && !c.participante_cnpj ? "sem CNPJ" : null;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 pr-3"><div className="font-medium">{c.codigo}</div>{aviso && <Selo estado="warning">{aviso}</Selo>}</td>
                    <td className="pr-3">
                      <Select value={r.posse} disabled={!permitido} onValueChange={(v) => setRasc((m) => ({ ...m, [c.id]: { ...r, posse: v } }))}>
                        <SelectTrigger className="h-8 w-60" aria-label={`Posse de ${c.codigo}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={A_CONFIRMAR}>A confirmar</SelectItem>
                          {q.data!.posses.map((p) => <SelectItem key={p.codigo} value={p.codigo}>{p.rotulo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="pr-3"><Input className="h-8 w-44" inputMode="numeric" disabled={!permitido} value={r.cnpj} aria-label={`CNPJ do participante de ${c.codigo}`}
                      onChange={(e) => setRasc((m) => ({ ...m, [c.id]: { ...r, cnpj: e.target.value } }))} /></td>
                    <td className="text-right"><Button size="sm" variant="outline" disabled={!permitido || !mudou || salvar.isPending} onClick={() => salvar.mutate(c)}>Salvar</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
