import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Lancamento {
  id: string;
  etiqueta: string;
  data_postagem: string | null;
  codigo_servico: string | null;
  descricao_servico: string | null;
  peso: number | null;
  valor_servico: number | null;
  municipio_destino: string | null;
  uf_destino: string | null;
  numero_documento: string | null;
  rastreio_status?: string | null;
  rastreio_entregue?: boolean | null;
}

export function useLancamentos() {
  const [lista, setLista] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const listar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data: lancs, error } = await supabase
        .from("correios_lancamentos")
        .select("*")
        .order("data_postagem", { ascending: false });
      if (error) throw error;

      const { data: rastreios } = await supabase
        .from("pedido_rastreamento")
        .select("codigo_rastreio, status_atual, entregue");

      const mapR = new Map((rastreios ?? []).map((r: any) => [r.codigo_rastreio, r]));
      const merged = (lancs ?? []).map((l: any) => {
        const r = mapR.get(l.etiqueta);
        return {
          ...l,
          rastreio_status: r?.status_atual ?? null,
          rastreio_entregue: r?.entregue ?? null,
        };
      });
      setLista(merged as Lancamento[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const sincronizar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("correios-previa-sync", { body: {} });
      if (error) throw error;
      await listar();
      return data as any;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [listar]);

  return { lista, loading, erro, listar, sincronizar };
}
