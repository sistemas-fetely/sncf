import { useQuery } from "@tanstack/react-query";
import { useListaPaginada, chamarLista, numeroAgregado, type ParamsLista, type FiltroLista } from "@/lib/lista/useListaPaginada";
import { recortarSegmentos } from "@/lib/lista/segmentos";
import type { AnaliseListItem, EstagioAnalise, PreAprovacaoPayload } from "@/types/credito";

interface UseAnalisesFilaOptions {
  estagio?: EstagioAnalise;
  apenasAbertas?: boolean;
  busca?: string;
  decididas?: boolean;
  pagina?: number;
  tamanho?: number;
}

type LinhaAnalise = Omit<AnaliseListItem, "parceiro_razao" | "pedido_condicao" | "foi_devolvida" | "pre_aprovacao_regra_nome"> & {
  parceiro_razao_social: string | null;
  pedido_condicao_solicitada: string | null;
  transicoes_acoes: string[] | null;
  regra_nome: string | null;
  pre_aprovacao_payload: PreAprovacaoPayload | null;
};

export function useAnalisesFila(opts: UseAnalisesFilaOptions = {}) {
  const filtros: FiltroLista[] = [];
  if (opts.estagio) filtros.push({ c: "estagio_atual", op: "eq", v: opts.estagio });
  if (opts.apenasAbertas !== false) filtros.push({ c: "aberta", op: "is_true" });
  if (opts.decididas) filtros.push({ c: "status_final", op: "not_null" });
  const params: ParamsLista = { relacao: "vw_analise_credito_fila", filtros, busca: opts.busca };
  const resumo = useListaPaginada<LinhaAnalise>({ ...params, tamanho: 1,
    agregados: [{ id: "pre", fn: "count", onde: [{ c: "pre_aprovado_regra_id", op: "not_null" }] }],
  });
  const pagina = opts.pagina ?? 1;
  const tamanho = opts.tamanho ?? 20;
  const pre = numeroAgregado(resumo.data?.agregados, "pre");
  const total = resumo.data?.total ?? 0;
  const linhas = useQuery({
    queryKey: ["lista", params.relacao, "pagina-analises", params, pagina, tamanho, pre, total],
    enabled: !!resumo.data,
    queryFn: async () => {
      const recortes = recortarSegmentos([{ chave: true, total: pre }, { chave: false, total: total - pre }], pagina, tamanho);
      const resultado: LinhaAnalise[] = [];
      for (const recorte of recortes) {
        const filtroPre: FiltroLista = { c: "pre_aprovado_regra_id", op: recorte.chave ? "not_null" : "is_null" };
        const primeiro = Math.floor(recorte.inicio / tamanho) + 1;
        const deslocamento = recorte.inicio % tamanho;
        const lista = await chamarLista<LinhaAnalise>({ ...params, filtros: [...filtros, filtroPre], ordem: [{ c: "criado_em", dir: "asc" }], pagina: primeiro, tamanho });
        let itens = lista.linhas.slice(deslocamento, deslocamento + recorte.quantidade);
        if (itens.length < recorte.quantidade) {
          const proxima = await chamarLista<LinhaAnalise>({ ...params, filtros: [...filtros, filtroPre], ordem: [{ c: "criado_em", dir: "asc" }], pagina: primeiro + 1, tamanho });
          itens = [...itens, ...proxima.linhas.slice(0, recorte.quantidade - itens.length)];
        }
        resultado.push(...itens);
      }
      return resultado.map((r): AnaliseListItem => ({ ...r,
        parceiro_razao: r.parceiro_razao_social,
        pedido_condicao: r.pedido_condicao_solicitada ?? "",
        pedido_id_externo: r.pedido_id_externo ?? "",
        pedido_valor_liquido: Number(r.pedido_valor_liquido ?? 0),
        foi_devolvida: r.transicoes_acoes?.includes("devolvido") ?? false,
        pre_aprovacao_regra_nome: r.regra_nome ?? r.pre_aprovacao_payload?.regra_nome ?? null,
      }));
    },
  });
  return { ...linhas, total, isLoading: resumo.isLoading || linhas.isLoading,
    error: resumo.error ?? linhas.error, isError: resumo.isError || linhas.isError };
}
