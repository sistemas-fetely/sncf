import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CotacaoFrete {
  coProduto: string;
  nome: string;
  preco: number | null;   // R$
  prazo: number | null;   // dias úteis
  erro: string | null;
}

interface FreteParams {
  cepDestino: string;
  peso: number;           // GRAMAS (não kg)
  comprimento?: number;
  largura?: number;
  altura?: number;
  vlDeclarado?: number;
  cepOrigem?: string;
}

export function useFreteCorreios() {
  const [cotacoes, setCotacoes] = useState<CotacaoFrete[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cotar(params: FreteParams): Promise<CotacaoFrete[]> {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("correios-frete", {
        body: params,
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      const res = (data?.resultado ?? []) as CotacaoFrete[];
      setCotacoes(res);
      return res;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCotacoes([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  return { cotacoes, loading, erro, cotar };
}
