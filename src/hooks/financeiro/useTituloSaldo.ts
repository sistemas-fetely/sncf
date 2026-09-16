import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * SALDO-NAO-SE-CALCULA-NO-FRONT (16/09/2026) — `vw_titulo_saldo` é a ÚNICA fonte
 * do saldo a receber de um título. O front NUNCA subtrai nada: no regime
 * consignado o título rotativo carrega a NF cheia e cada acerto vira um título
 * FILHO cobrável; o saldo do pai é valor − alocado do razão − filhos abertos,
 * sempre calculado no banco, nunca gravado.
 */
export type TituloSaldo = {
  titulo_id: string;
  titulo_pai_id: string | null;
  valor_documento: number | null;
  alocado_conta: number | null;
  filhos_abertos: number | null;
  n_filhos_abertos: number | null;
  saldo_a_receber: number | null;
  tem_abatimento: boolean | null;
};

const COLUNAS =
  "titulo_id,titulo_pai_id,valor_documento,alocado_conta,filhos_abertos,n_filhos_abertos,saldo_a_receber,tem_abatimento";

/** Mapa titulo_id → saldo. Uma linha por título. */
export function useTituloSaldos() {
  const q = useQuery({
    queryKey: ["vw-titulo-saldo"],
    queryFn: async (): Promise<TituloSaldo[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_titulo_saldo")
        .select(COLUNAS);
      if (error) throw new Error(`vw_titulo_saldo: ${error.message}`);
      return (data ?? []) as TituloSaldo[];
    },
    staleTime: 30_000,
  });
  const porTitulo = new Map<string, TituloSaldo>(
    (q.data ?? []).map((s) => [s.titulo_id, s]),
  );
  return { ...q, porTitulo };
}

export type FilhoAberto = {
  id: string;
  numero_titulo: string | null;
  valor: number | null;
  data_vencimento_atual: string | null;
};

/** Parcelas de acerto em aberto de um título pai. */
export function useFilhosAbertos(tituloId: string | undefined, ativo = true) {
  return useQuery({
    queryKey: ["titulo-filhos-abertos", tituloId],
    enabled: !!tituloId && ativo,
    staleTime: 30_000,
    queryFn: async (): Promise<FilhoAberto[]> => {
      if (!tituloId) return [];
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id,numero_titulo,valor_atual,valor_bruto,data_vencimento_atual")
        .eq("titulo_pai_id", tituloId)
        .eq("status", "aberto")
        .order("data_vencimento_atual", { ascending: true });
      if (error) throw new Error(`Falha ao ler as parcelas de acerto: ${error.message}`);
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        numero_titulo: r.numero_titulo ?? null,
        valor: r.valor_atual != null ? Number(r.valor_atual) : Number(r.valor_bruto ?? 0),
        data_vencimento_atual: r.data_vencimento_atual ?? null,
      }));
    },
  });
}

/** Número do título pai — só para exibir sob o filho. */
export function useNumeroTitulo(tituloId: string | null | undefined) {
  return useQuery({
    queryKey: ["titulo-numero", tituloId],
    enabled: !!tituloId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      if (!tituloId) return null;
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("numero_titulo")
        .eq("id", tituloId)
        .maybeSingle();
      if (error) throw new Error(`Falha ao ler o título pai: ${error.message}`);
      return (data?.numero_titulo as string | null) ?? null;
    },
  });
}
