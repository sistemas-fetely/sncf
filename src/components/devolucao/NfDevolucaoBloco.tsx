import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";

const sb = supabase as any;
type Estado = { nf_dev_status: "gerando" | "rascunho" | "autorizada" | "erro" | null; nf_dev_numero: string | null; nf_dev_erro: string | null };

async function chamar(devolucao_id: string, acao: "gerar" | "verificar") {
  const { data, error } = await supabase.functions.invoke("devolucao-gerar-rascunho-nf", { body: { devolucao_id, acao } });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as any).context; if (ctx?.json) { const b = await ctx.json(); if (b?.erro) msg = b.erro; } } catch { /* mantém msg */ }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha sem mensagem");
  return data;
}

export function NfDevolucaoBloco({ devolucaoId, nf, onMudou }: { devolucaoId: string; nf: string; onMudou: () => void }) {
  const qc = useQueryClient();
  const key = ["devolucao-nf-dev", devolucaoId];
  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Estado> => {
      const { data, error } = await sb.from("devolucao").select("nf_dev_status,nf_dev_numero,nf_dev_erro").eq("id", devolucaoId).single();
      if (error) throw error;
      return data;
    },
  });
  const mut = useMutation({
    mutationFn: (acao: "gerar" | "verificar") => chamar(devolucaoId, acao),
    onSuccess: (d, acao) => {
      if (acao === "gerar") toast.success(`Rascunho NF nº ${d.numero ?? "?"} criado no Bling`);
      else if (d.autorizada) toast.success(`NF de devolução ${d.numero} autorizada`);
      else toast.info(`Ainda não autorizada (situação ${d.situacao}${d.cancelada ? ", cancelada" : ""})`);
    },
    onError: (e) => toast.error(rawMessage(e)),
    onSettled: () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["devolucoes"] }); onMudou(); },
  });

  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (q.isError) return <div className="text-sm text-destructive">{rawMessage(q.error)}</div>;
  const s = q.data!;
  const ocupado = mut.isPending;
  const spin = ocupado ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null;

  return (
    <div className="space-y-2 text-sm">
      <div><span className="font-medium">Eva:</span> NF de devolução (entrada) referenciando a NF nº {nf}</div>
      {s.nf_dev_status === "autorizada" ? (
        <div className="text-success">NF de devolução {s.nf_dev_numero ?? "?"} autorizada ✓</div>
      ) : s.nf_dev_status === "rascunho" ? (
        <>
          <div>Rascunho NF nº {s.nf_dev_numero ?? "?"} criado — <span className="font-medium">Eva: transmitir no Bling</span></div>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => mut.mutate("verificar")}>{spin}Verificar autorização</Button>
        </>
      ) : s.nf_dev_status === "gerando" ? (
        <div className="text-muted-foreground">Gerando rascunho no Bling…</div>
      ) : s.nf_dev_status === "erro" ? (
        <>
          <div className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{s.nf_dev_erro ?? "Erro sem mensagem"}</div>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => mut.mutate("gerar")}>{spin}Tentar de novo</Button>
        </>
      ) : (
        <Button size="sm" disabled={ocupado} onClick={() => mut.mutate("gerar")}>{spin}Gerar NF de devolução (rascunho no Bling)</Button>
      )}
    </div>
  );
}
