import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AgenciaCd } from "@/lib/logistica/agenciaTransportadora";

/** Agências ativas por CD (transportadora_agencia_cd), com nome da agência e rótulo do CD. */
export function useAgenciasTransportadora() {
  return useQuery({
    queryKey: ["transportadora-agencia-cd"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<AgenciaCd[]> => {
      const { data, error } = await (supabase as any)
        .from("transportadora_agencia_cd")
        .select("transportadora_id, centro_codigo, agencia_id, agencia:parceiros_comerciais!transportadora_agencia_cd_agencia_id_fkey(razao_social, nome_fantasia)")
        .eq("ativo", true);
      if (error) throw error;
      const codigos = [...new Set((data ?? []).map((r: any) => r.centro_codigo))];
      const { data: cds, error: e2 } = codigos.length
        ? await (supabase as any).from("centro_distribuicao").select("codigo, rotulo_curto, nome").in("codigo", codigos)
        : { data: [], error: null };
      if (e2) throw e2;
      const rot = new Map((cds ?? []).map((c: any) => [c.codigo, c.rotulo_curto || c.nome || c.codigo]));
      return (data ?? []).map((r: any) => ({
        transportadora_id: r.transportadora_id, centro_codigo: r.centro_codigo, agencia_id: r.agencia_id,
        agencia_nome: curto(r.agencia?.razao_social ?? ""), centro_rotulo: (rot.get(r.centro_codigo) as string) ?? r.centro_codigo,
      }));
    },
  });
}

/** "POWER POST SERVICOS LTDA - EPP" → "Power Post". */
function curto(razao: string): string {
  const base = razao.split(/\s+(SERVICOS|SERVIÇOS|LTDA|EPP|ME|S\/A|SA)\b/i)[0].trim();
  return base.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
