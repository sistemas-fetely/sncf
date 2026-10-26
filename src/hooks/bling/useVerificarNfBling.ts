import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type ResultadoVerificacao = { bling_id: string; numero: string | null; de: string | null; para: string | null };
type Alvo = { bling_ids: string[] } | { pedido_bling_id: string };

function mensagem(r: ResultadoVerificacao): string {
  const nf = r.numero ? `NF ${r.numero}` : `NF (id ${r.bling_id})`;
  if (r.para === "autorizada") return `${nf} autorizada ✓`;
  if (r.para === "excluida" || r.para === "cancelada") return `${nf}: Excluída no Bling`;
  return `${nf}: Ainda pendente no Bling`;
}

async function chamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("nfe-reconferir", { body });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as any).context; if (ctx?.json) { const j = await ctx.json(); msg = j?.erro ?? msg; } } catch { /* mantém */ }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.erro ?? "Falha ao verificar no Bling.");
  return data as { resultados: ResultadoVerificacao[]; erros_lista: Array<{ numero: string | null; bling_id: string; erro: string }> };
}

/** Pede ao Bling o status atual de NFs (até 10 por chamada; chama em lotes). */
export function useVerificarNfBling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alvo: Alvo) => {
      const resultados: ResultadoVerificacao[] = [];
      const erros: string[] = [];
      if ("pedido_bling_id" in alvo) {
        const d = await chamar({ pedido_bling_id: alvo.pedido_bling_id });
        resultados.push(...(d.resultados ?? []));
        erros.push(...(d.erros_lista ?? []).map((e) => `${e.numero ?? e.bling_id}: ${e.erro}`));
      } else {
        const ids = [...new Set(alvo.bling_ids.filter(Boolean))];
        if (!ids.length) throw new Error("Nenhum rascunho com ID do Bling para verificar.");
        for (let i = 0; i < ids.length; i += 10) {
          const d = await chamar({ bling_ids: ids.slice(i, i + 10) });
          resultados.push(...(d.resultados ?? []));
          erros.push(...(d.erros_lista ?? []).map((e) => `${e.numero ?? e.bling_id}: ${e.erro}`));
        }
      }
      return { resultados, erros, pedido: "pedido_bling_id" in alvo };
    },
    onSuccess: async ({ resultados, erros, pedido }) => {
      if (!resultados.length && !erros.length) toast.info(pedido ? "Nenhuma NF desse pedido no Bling ainda." : "Ainda pendente no Bling");
      for (const r of resultados) {
        const m = mensagem(r);
        if (r.para === "autorizada") toast.success(m); else if (r.para === "excluida" || r.para === "cancelada") toast.warning(m); else toast.info(m);
      }
      for (const e of erros) toast.error(e);
      await qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
