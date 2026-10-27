import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Remessa = { numero: string; serie?: string | null; chave: string | null; data: string | null; origem: string };
type Candidata = {
  stage_id: string; numero: string; serie: string | null; chave: string | null; data: string | null;
  valor: number | null; status: string; qtd_itens: number; qtd_acerto: number; valor_acerto: number;
  vinculada_a: string | null; remessas: Remessa[];
};

interface Props {
  acertoId: string;
  acertoNumero: string;
  vinculoStageId: string | null;
}

/** NF de retorno simbólico (5919/6919) do parceiro vinculada ao acerto modelo 2. */
export function NfRetornoAcertoBloco({ acertoId, acertoNumero, vinculoStageId }: Props) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string>("");
  const q = useQuery({
    queryKey: ["consignado-nf-retorno-candidatas", acertoId],
    queryFn: async (): Promise<Candidata[]> => {
      const { data, error } = await (supabase.rpc as any)("fn_consignado_nf_retorno_candidatas", { p_acerto_id: acertoId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Candidata[];
    },
  });
  const vincular = useMutation({
    mutationFn: async (stageId: string) => {
      const { data, error } = await (supabase.rpc as any)("fn_consignado_vincular_nf_retorno", { p_acerto_id: acertoId, p_stage_id: stageId });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async () => {
      toast.success(`NF de retorno vinculada ao ${acertoNumero}`);
      setSel("");
      await qc.invalidateQueries({ queryKey: ["consignado-acertos"] });
      await qc.invalidateQueries({ queryKey: ["consignado-nf-retorno-candidatas", acertoId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const lista = q.data ?? [];
  const vinculada = vinculoStageId ? lista.find((c) => c.stage_id === vinculoStageId) ?? null : null;
  const livres = lista.filter((c) => !c.vinculada_a);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">NF de retorno simbólico</p>
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : q.isError ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : vinculoStageId ? (
        vinculada ? <Conferencia c={vinculada} /> : <p className="text-sm text-muted-foreground">NF vinculada (detalhe indisponível).</p>
      ) : livres.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma NF de retorno simbólico (CFOP 5919/6919) do parceiro disponível.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sel} onValueChange={setSel}>
            <SelectTrigger className="w-[22rem]"><SelectValue placeholder="Escolha a NF de retorno" /></SelectTrigger>
            <SelectContent>
              {livres.map((c) => (
                <SelectItem key={c.stage_id} value={c.stage_id}>
                  NF {c.numero} · {formatDateBR(c.data)} · {formatBRL(c.valor)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!sel || vincular.isPending} onClick={() => vincular.mutate(sel)}>
            {vincular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Vincular
          </Button>
          {sel && <Conferencia c={livres.find((c) => c.stage_id === sel)!} previa />}
        </div>
      )}
    </div>
  );
}

function Conferencia({ c, previa }: { c: Candidata; previa?: boolean }) {
  const difValor = Math.round((Number(c.valor ?? 0) - Number(c.valor_acerto ?? 0)) * 100) / 100;
  const difQtd = Number(c.qtd_itens ?? 0) - Number(c.qtd_acerto ?? 0);
  const bate = Math.abs(difValor) < 0.01 && difQtd === 0;
  return (
    <div className="w-full space-y-1 text-sm">
      {!previa && (
        <p>
          NF <strong>{c.numero}</strong>{c.serie ? `/${c.serie}` : ""} de {formatDateBR(c.data)} · {formatBRL(c.valor)}
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">{c.chave}</span>
        </p>
      )}
      {bate ? (
        <p className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />Valor e quantidade batem com o acerto.</p>
      ) : (
        <p className="flex items-center gap-1 text-warning">
          <AlertTriangle className="h-4 w-4" />
          Diverge do acerto:
          {Math.abs(difValor) >= 0.01 && <> valor NF {formatBRL(c.valor)} × acerto {formatBRL(c.valor_acerto)};</>}
          {difQtd !== 0 && <> quantidade NF {c.qtd_itens} × acerto {c.qtd_acerto}</>}
        </p>
      )}
      {!previa && c.remessas?.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Remessas referenciadas: {c.remessas.map((r) => `NF ${r.numero} de ${formatDateBR(r.data)}`).join(", ")}
          {c.remessas[0]?.origem === "remessas_do_parceiro" && " (a NF de retorno não trouxe a referência — usadas as remessas do parceiro)"}
        </p>
      )}
    </div>
  );
}
