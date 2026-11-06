import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { agrupar, type LinhaCentral } from "@/lib/estoque/centralEstoque";

// vw_central_estoque / estoque_retencao_canal ainda não estão no types gerado
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Chaves de estoque/conciliação que a Central também derruba depois de qualquer ação. */
export async function invalidarEstoque(qc: QueryClient) {
  await Promise.all(
    ["central-estoque", "central-estoque-canais", "estoque-cockpit", "vw_estoque_cockpit", "conciliacao-estoque", "estoque-centro", "shopify-estoque-retido"]
      .map((k) => qc.invalidateQueries({ queryKey: [k] })),
  );
}

/** POSTGREST-CORTA-EM-MIL: lê a view em lotes de 1000 e agrupa por SKU. */
export function useCentralEstoque() {
  const q = useQuery({
    queryKey: ["central-estoque"],
    queryFn: async () => {
      const out: LinhaCentral[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("vw_central_estoque").select("*")
          .order("sku").order("centro").range(de, de + 999);
        if (error) throw error;
        out.push(...((data ?? []) as LinhaCentral[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const agrupado = useMemo(() => agrupar(q.data ?? []), [q.data]);
  return { ...q, ...agrupado };
}

export interface CanaisProduto {
  bling: { centro: string; bling_atual: number | null; sncf_disponivel: number | null; diff: number | null }[];
  shopify: { centro: string; shopify_atual: number | null; sncf_virtual: number | null; diff: number | null }[];
  fop: { estoque_fop: number | null; status_rotulo: string | null } | null;
  retB2c: { id: string; motivo: string; retido_em: string } | null;
  retCanal: { id: string; canal: string; centro_codigo: string | null; motivo: string; retido_em: string }[];
  reposicao: { centro: string | null; origem: string | null; qtd_sugerida: number | null; situacao: string | null; proxima_carga: string | null }[];
}

export function useCanaisProduto(sku: string | null) {
  return useQuery({
    queryKey: ["central-estoque-canais", sku],
    enabled: !!sku,
    queryFn: async (): Promise<CanaisProduto> => {
      const [b, s, f, r1, r2, rp] = await Promise.all([
        sb.from("vw_estoque_bling_sync").select("centro, bling_atual, sncf_disponivel, diff").eq("sku", sku),
        sb.from("vw_estoque_shopify_sync").select("centro, shopify_atual, sncf_virtual, diff").eq("sku", sku),
        sb.from("vw_fop_status_estoque").select("estoque_fop, status_rotulo").eq("sku", sku).maybeSingle(),
        sb.from("shopify_estoque_retencao").select("id, motivo, retido_em").eq("sku", sku).is("liberado_em", null).maybeSingle(),
        sb.from("estoque_retencao_canal").select("id, canal, centro_codigo, motivo, retido_em").eq("sku", sku).is("liberado_em", null),
        sb.from("vw_reposicao_sugerida").select("centro, origem, qtd_sugerida, situacao, proxima_carga").eq("sku", sku),
      ]);
      for (const r of [b, s, f, r1, r2, rp]) if (r.error) throw r.error;
      return { bling: b.data ?? [], shopify: s.data ?? [], fop: f.data ?? null, retB2c: r1.data ?? null, retCanal: r2.data ?? [], reposicao: rp.data ?? [] };
    },
  });
}

/** Reter/liberar estoque por canal. B2C mantém o caminho atual (shopify_estoque_retencao). */
export function useRetencaoCanal() {
  const qc = useQueryClient();
  const reter = useMutation({
    mutationFn: async ({ sku, canal, centro, motivo }: { sku: string; canal: string; centro?: string | null; motivo: string }) => {
      if (motivo.trim().length < 3) throw new Error("Informe o motivo da retenção.");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const { error } = canal === "B2C"
        ? await sb.from("shopify_estoque_retencao").insert({ sku, motivo: motivo.trim(), retido_por: uid })
        : await sb.from("estoque_retencao_canal").insert({ sku, canal, centro_codigo: centro || null, motivo: motivo.trim(), retido_por: uid });
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Estoque retido no canal."); await invalidarEstoque(qc); },
    onError: (e) => toast.error(`Falha ao reter: ${formatError(e)}`),
  });
  const liberar = useMutation({
    mutationFn: async ({ sku, canal, id }: { sku: string; canal: string; id?: string }) => {
      if (canal === "B2C") {
        const { error } = await sb.rpc("fn_shopify_estoque_liberar", { p_skus: [sku] });
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await sb.from("estoque_retencao_canal")
        .update({ liberado_em: new Date().toISOString(), liberado_por: u.user?.id ?? null })
        .eq("id", id).is("liberado_em", null).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nenhuma retenção aberta foi encerrada (sem permissão ou já liberada).");
    },
    onSuccess: async () => { toast.success("Estoque liberado no canal."); await invalidarEstoque(qc); },
    onError: (e) => toast.error(`Falha ao liberar: ${formatError(e)}`),
  });
  return { reter, liberar };
}
