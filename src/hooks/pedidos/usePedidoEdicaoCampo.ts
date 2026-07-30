import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CampoEdicao = "pagamento" | "itens" | "desconto" | "split";

export interface RegraEdicaoCampo {
  campo: CampoEdicao;
  estagio: string;
  permitido: boolean;
  exige_papel: string[] | null;
  exige_motivo: boolean;
  rotulo: string | null;
  ativo: boolean;
}

/**
 * Dimensão que governa a UI de edição do pedido.
 * As regras NÃO moram no código: moram em public.pedido_edicao_campo.
 * Traz todas as linhas ativas (para derivar "em quais estágios é permitido")
 * e expõe helpers para o estágio atual.
 */
export function usePedidoEdicaoCampo(estagio: string | null | undefined) {
  const q = useQuery({
    queryKey: ["pedido-edicao-campo"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RegraEdicaoCampo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_edicao_campo")
        .select("campo, estagio, permitido, exige_papel, exige_motivo, rotulo, ativo")
        .eq("ativo", true);
      if (error) throw error;
      return (data || []) as RegraEdicaoCampo[];
    },
  });

  const todas = q.data || [];

  const regraDe = (campo: CampoEdicao): RegraEdicaoCampo | undefined =>
    todas.find((r) => r.campo === campo && r.estagio === estagio);

  const estagiosPermitidos = (campo: CampoEdicao): string[] =>
    todas.filter((r) => r.campo === campo && r.permitido).map((r) => r.estagio);

  return { ...q, regras: todas, regraDe, estagiosPermitidos };
}
