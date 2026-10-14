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
      const [acordos, origens, filhos] = await Promise.all([
        sb.from("acordo_renegociacao").select("id, numero_acordo"),
        sb.from("acordo_titulo").select("acordo_id, titulo_id"),
        sb.from("titulo_a_receber").select("id, acordo_id").not("acordo_id", "is", null),
      ]);
      for (const r of [acordos, origens, filhos]) {
        if (r.error) throw new Error(`Falha ao ler acordos: ${r.error.message}`);
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
