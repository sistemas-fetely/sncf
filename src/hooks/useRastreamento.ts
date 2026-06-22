import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Rastreio {
  id: string;
  codigo_rastreio: string;
  servico: string | null;
  status_atual: string | null;
  empresa_frete: string | null;
  data_ultima_atualizacao: string | null;
  entregue: boolean;
  eventos: unknown[];
  atualizado_em: string;
}

function normalizarStatus(row: any): Rastreio {
  return { ...row, status_atual: row.status_atual ?? null };
}

export function useRastreamento() {
  const [lista, setLista] = useState<Rastreio[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const listar = useCallback(async () => {
    const [{ data, error }, { data: lancs }] = await Promise.all([
      (supabase as any)
        .from("pedido_rastreamento")
        .select("*")
        .order("atualizado_em", { ascending: false }),
      (supabase as any)
        .from("correios_lancamentos")
        .select("etiqueta, empresa_frete"),
    ]);
    if (error) { setErro(error.message); return; }
    const mapaEmpresa = new Map(
      (lancs ?? []).map((l: any) => [l.etiqueta, l.empresa_frete])
    );
    setLista(
      (data ?? []).map((row: any) => normalizarStatus({
        ...row,
        empresa_frete: mapaEmpresa.get(row.codigo_rastreio) ?? null,
      }))
    );
  }, []);

  const adicionar = useCallback(async (codigo: string) => {
    setLoading(true);
    setErro(null);
    try {
      const { error } = await supabase.functions.invoke("correios-rastreio-sync", {
        body: { codigos: [codigo], inserir: true },
      });
      if (error) throw error;
      await listar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [listar]);

  const atualizarTodos = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { error } = await supabase.functions.invoke("correios-rastreio-sync", {
        body: {},
      });
      if (error) throw error;
      await listar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [listar]);

  return { lista, loading, erro, listar, adicionar, atualizarTodos };
}
