import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  resolverEmailCobranca,
  type OrigemEmailCobranca,
} from "@/lib/financeiro/email-cobranca-parceiro";

/**
 * E-mail de cobrança preferido do parceiro (financeiro > email_cobranca > email).
 * Usado para pré-preencher os diálogos de envio.
 */
export function useEmailCobrancaParceiro(parceiro_id: string | null | undefined) {
  return useQuery({
    queryKey: ["email-cobranca-parceiro", parceiro_id],
    enabled: !!parceiro_id,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{
      email: string | null;
      origem: OrigemEmailCobranca;
      razao_social: string | null;
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("email, email_cobranca, contatos, razao_social")
        .eq("id", parceiro_id)
        .maybeSingle();
      const { email, origem } = resolverEmailCobranca(data ?? null);
      return { email, origem, razao_social: data?.razao_social ?? null };
    },
  });
}
