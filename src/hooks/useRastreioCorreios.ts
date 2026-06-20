import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EventoRastreio {
  codigo?: string;
  descricao?: string;
  dtHrCriado?: string;
  unidade?: unknown;
  [k: string]: unknown;
}
export interface ObjetoRastreio {
  codigo: string;
  eventos: EventoRastreio[];
  mensagem?: string | null;
  erro?: string;
}

export function useRastreioCorreios() {
  const [objetos, setObjetos] = useState<ObjetoRastreio[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function rastrear(codigos: string[]): Promise<ObjetoRastreio[]> {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("correios-rastreio", {
        body: { codigos },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(data.erro);
      const res = (data?.objetos ?? []) as ObjetoRastreio[];
      setObjetos(res);
      return res;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setObjetos([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  return { objetos, loading, erro, rastrear };
}
