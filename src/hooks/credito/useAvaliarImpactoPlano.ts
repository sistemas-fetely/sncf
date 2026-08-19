import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CaminhoImpacto } from "@/hooks/credito/useAvaliarImpactoEdicao";

export type { CaminhoImpacto };

/** Linha do plano em tela — os nomes das chaves importam: a RPC lê por eles. */
export interface LinhaImpacto {
  numero_parcela: number;
  tipo_pagamento: string;
  valor: number;
  /** ISO YYYY-MM-DD */
  data_vencimento: string;
  eh_entrada: boolean;
  eh_portao: boolean;
}

export interface ImpactoPlano {
  ok: boolean;
  caminho: CaminhoImpacto;
  motivo?: string | null;
  exposicao_nova?: number | null;
  prazo_novo_dias?: number | null;
  exposicao_atual?: number | null;
  prazo_atual_dias?: number | null;
  limite_concedido?: number | null;
  prazo_max_dias?: number | null;
  tem_analise_aprovada?: boolean | null;
  estagio?: string | null;
  direcao?: string | null;
  direcao_rotulo?: string | null;
  papeis_com_alcada?: string[] | null;
  pode_aplicar?: boolean | null;
  venc_mais_longo?: string | null;
  linhas_que_expoem?: number | null;
  prazo_referencia?: number | null;
}

interface Args {
  pedidoId: string | null | undefined;
  linhas: LinhaImpacto[];
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Chama fn_avaliar_impacto_plano com debounce sobre as linhas serializadas.
 * Fail-loud suave: erros retornam undefined; caller esconde o banner.
 */
export function useAvaliarImpactoPlano({
  pedidoId,
  linhas,
  enabled = true,
  debounceMs = 400,
}: Args) {
  const serializadas = JSON.stringify(linhas ?? []);
  const [debounced, setDebounced] = useState(serializadas);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(serializadas), debounceMs);
    return () => clearTimeout(t);
  }, [serializadas, debounceMs]);

  const linhasDebounced: LinhaImpacto[] = (() => {
    try {
      return JSON.parse(debounced) as LinhaImpacto[];
    } catch {
      return [];
    }
  })();

  return useQuery<ImpactoPlano | undefined>({
    queryKey: ["avaliar-impacto-plano", pedidoId, debounced],
    enabled: !!enabled && !!pedidoId && linhasDebounced.length > 0,
    staleTime: 5_000,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "fn_avaliar_impacto_plano",
        { p_pedido_id: pedidoId, p_linhas: linhasDebounced },
      );
      if (error) throw error;
      return data as ImpactoPlano;
    },
  });
}
