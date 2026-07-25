import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CaminhoImpacto =
  | "reconcilia_no_lugar"
  | "re_analise"
  | "financeiro"
  | "bloqueado"
  | "condicao_invalida"
  | "erro";

export interface ImpactoEdicao {
  ok: boolean;
  caminho: CaminhoImpacto;
  motivo?: string | null;
  exposicao_nova?: number | null;
  prazo_novo_dias?: number | null;
  limite_concedido?: number | null;
  prazo_max_dias?: number | null;
  tem_analise_aprovada?: boolean | null;
  estagio?: string | null;
}

interface Args {
  pedidoId: string | null | undefined;
  novaCondicao: string | null | undefined;
  novoValorLiquido?: number | null;
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Chama fn_avaliar_impacto_edicao_pedido com debounce.
 * Fail-loud suave: erros retornam undefined; caller esconde o banner.
 */
export function useAvaliarImpactoEdicao({
  pedidoId,
  novaCondicao,
  novoValorLiquido,
  enabled = true,
  debounceMs = 400,
}: Args) {
  const [debounced, setDebounced] = useState({
    condicao: novaCondicao ?? "",
    valor: novoValorLiquido ?? null,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({
        condicao: novaCondicao ?? "",
        valor: novoValorLiquido ?? null,
      });
    }, debounceMs);
    return () => clearTimeout(t);
  }, [novaCondicao, novoValorLiquido, debounceMs]);

  return useQuery<ImpactoEdicao | undefined>({
    queryKey: [
      "avaliar-impacto-edicao",
      pedidoId,
      debounced.condicao,
      debounced.valor,
    ],
    enabled: !!enabled && !!pedidoId && !!debounced.condicao,
    staleTime: 5_000,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "fn_avaliar_impacto_edicao_pedido",
        {
          p_pedido_id: pedidoId,
          p_nova_condicao: debounced.condicao,
          p_novo_valor_liquido: debounced.valor,
        },
      );
      if (error) throw error;
      return data as ImpactoEdicao;
    },
  });
}
