import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useListaPaginada, numeroAgregado } from "@/lib/lista/useListaPaginada";
import { formatError } from "@/lib/format-error";

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
  empresa_frete: string | null;
  nome_cliente: string | null;
  custo_transportadora: number | null;
  rastreio_status?: string | null;
  rastreio_entregue?: boolean | null;
}

export function useLancamentos(opts: { empresa?: string; pagina?: number; tamanho?: number } = {}) {
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSync, setErroSync] = useState<string | null>(null);
  const query = useListaPaginada<Lancamento>({
    relacao: "vw_correios_lancamento_rastreio", pagina: opts.pagina, tamanho: opts.tamanho ?? 20,
    filtros: opts.empresa ? [{ c: "empresa_frete", op: "eq", v: opts.empresa }] : [],
    ordem: [{ c: "data_postagem", dir: "desc" }],
    agregados: [{ id: "totalPostado", fn: "sum", c: "valor_servico" }],
  });
  const listar = useCallback(async () => {
    const resultado = await query.refetch();
    if (resultado.error) throw resultado.error;
  }, [query.refetch]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setErroSync(null);
    try {
      const { data, error } = await supabase.functions.invoke("correios-previa-sync", { body: {} });
      if (error) throw error;
      await listar();
      return data as any;
    } catch (e) {
      setErroSync(formatError(e));
      return null;
    } finally {
      setSincronizando(false);
    }
  }, [listar]);

  return { lista: query.data?.linhas ?? [], total: query.data?.total ?? 0, totalPostado: numeroAgregado(query.data?.agregados, "totalPostado"), loading: query.isLoading || sincronizando, erro: erroSync ?? (query.error ? formatError(query.error) : null), listar, sincronizar };
}
