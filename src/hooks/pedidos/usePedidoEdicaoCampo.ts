import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CampoEdicao = "pagamento" | "itens" | "desconto" | "split" | "conversao_custo";

/**
 * Campos que o painel "Editar pedido" realmente oferece.
 * `split` NÃO entra: é a ação separada "Dividir pedido".
 */
export const CAMPOS_PAINEL_EDICAO: readonly CampoEdicao[] = [
  "pagamento",
  "itens",
  "desconto",
  "conversao_custo",
] as const;

export interface RegraEdicaoCampo {
  campo: CampoEdicao;
  estagio: string;
  permitido: boolean;
  exige_papel: string[] | null;
  exige_motivo: boolean;
  rotulo: string | null;
  observacao: string | null;
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
        .select("campo, estagio, permitido, exige_papel, exige_motivo, rotulo, observacao, ativo")
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

  // Derivação única de "o painel de edição tem algo a oferecer neste estágio".
  const camposEditaveisNoEstagio = (est?: string | null): CampoEdicao[] => {
    const alvo = String(est ?? estagio ?? "");
    return CAMPOS_PAINEL_EDICAO.filter((c) =>
      todas.some((r) => r.campo === c && r.estagio === alvo && r.ativo && r.permitido),
    );
  };

  const painelEditavel = (est?: string | null): boolean =>
    camposEditaveisNoEstagio(est).length > 0;

  // Motivo declarado na dimensão, quando houver. Nunca inventar motivo.
  const observacaoBloqueio = (est?: string | null): string | null => {
    const alvo = String(est ?? estagio ?? "");
    const r = todas.find(
      (x) =>
        x.estagio === alvo &&
        (CAMPOS_PAINEL_EDICAO as readonly string[]).includes(x.campo) &&
        !x.permitido &&
        !!x.observacao,
    );
    return r?.observacao ?? null;
  };

  return {
    ...q,
    regras: todas,
    regraDe,
    estagiosPermitidos,
    camposEditaveisNoEstagio,
    painelEditavel,
    observacaoBloqueio,
  };
}

