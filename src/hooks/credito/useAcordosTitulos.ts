import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OPCOES_QUERY_RECEBIVEL } from "@/hooks/recebivel/useInvalidarRecebivel";

/** Mapa titulo_id → número do acordo (títulos de origem e parcelas novas do acordo). */
export function useAcordosTitulos() {
  return useQuery({
    // prefixo "titulos-cobranca" para entrar na invalidação do recebível
    queryKey: ["titulos-cobranca", "acordos-por-titulo"],
    ...OPCOES_QUERY_RECEBIVEL,
    queryFn: async (): Promise<Map<string, string>> => {
      const sb = supabase as any;
      const [acordos, origens] = await Promise.all([
        sb.from("acordo_renegociacao").select("id, numero_acordo"),
        sb.from("acordo_titulo").select("acordo_id, titulo_id"),
      ]);
      for (const r of [acordos, origens]) {
        if (r.error) throw new Error(`Falha ao ler acordos: ${r.error.message}`);
      }
      // Títulos filhos lidos por chave (acordo_id), em lotes de 200 — nunca a carteira inteira.
      const idsAcordos: string[] = (acordos.data ?? []).map((a: any) => a.id);
      const filhos = { data: [] as { id: string; acordo_id: string }[] };
      for (let i = 0; i < idsAcordos.length; i += 200) {
        const lote = idsAcordos.slice(i, i + 200);
        const r = await sb.from("titulo_a_receber").select("id, acordo_id").in("acordo_id", lote);
        if (r.error) throw new Error(`Falha ao ler títulos dos acordos: ${r.error.message}`);
        filhos.data.push(...(r.data ?? []));
      }
      const numero = new Map<string, string>(
        (acordos.data ?? []).map((a: any) => [a.id, a.numero_acordo]),
      );
      const mapa = new Map<string, string>();
      for (const o of origens.data ?? []) {
        const n = numero.get(o.acordo_id);
        if (n) mapa.set(o.titulo_id, n);
      }
      for (const f of filhos.data ?? []) {
        const n = numero.get(f.acordo_id);
        if (n) mapa.set(f.id, n);
      }
      return mapa;
    },
  });
}
