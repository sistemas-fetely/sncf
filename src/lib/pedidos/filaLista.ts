import type { FiltroLista, ParamsLista } from "@/lib/lista/useListaPaginada";
import type { Ordenacao } from "./ordenacaoCasa";
export function filtrosOrdemFila({ marcacaoFilter = "todas", formaPgtoFilter = "todas", situacaoFilter = "todas", somenteRiscoAlto = false, somenteComAlerta = false, liberacaoFilter = "todas", cdFilter = "todos", ordenacao }: {
 marcacaoFilter?: string; formaPgtoFilter?: string; situacaoFilter?: string; somenteRiscoAlto?: boolean; somenteComAlerta?: boolean; liberacaoFilter?: string; cdFilter?: string; ordenacao: Ordenacao;
}) {
  const filtrosLista: FiltroLista[] = [];
  if (marcacaoFilter === "sem") filtrosLista.push({ c: "marcacao", op: "is_null" });
  else if (marcacaoFilter === "com") filtrosLista.push({ c: "marcacao", op: "not_null" });
  else if (marcacaoFilter !== "todas") filtrosLista.push({ c: "marcacao", op: "eq", v: marcacaoFilter });
  if (formaPgtoFilter !== "todas") filtrosLista.push({ c: "forma_solicitada", op: "eq", v: formaPgtoFilter });
  if (situacaoFilter === "com_entrada_paga") filtrosLista.push({ c: "adiantado_vivo", op: "gt", v: 0 });
  else if (situacaoFilter === "em_aberto") filtrosLista.push({ c: "situacao_financeira", op: "in", v: ["em_aberto", "parcial_pago"] });
  else if (situacaoFilter !== "todas") filtrosLista.push({ c: "situacao_financeira", op: "eq", v: situacaoFilter });
  if (somenteRiscoAlto) filtrosLista.push({ c: "risco_cor", op: "eq", v: "destructive" });
  if (somenteComAlerta) filtrosLista.push({ c: "alerta_severidade", op: "not_null" });
  if (liberacaoFilter !== "todas") filtrosLista.push({ c: "liberado_expedicao", op: liberacaoFilter === "liberado" ? "is_true" : "not_true" });
  if (cdFilter !== "todos") filtrosLista.push({ c: "cd_expedicao_codigo", op: "eq", v: cdFilter });
  const campoOrdem = { risco: "risco_score", estoque: "pct_coberto", cobranca: "cobranca_gravidade", estagio: "estagio_pipeline", entrega: "previsao_entrega", na_fase: "dias_na_fase", pedido: "id_externo", valor: "valor_liquido" };
  const ordemLista: ParamsLista["ordem"] = ordenacao.tipo === "coluna" ? [{ c: campoOrdem[ordenacao.coluna], dir: ordenacao.dir }]
    : ordenacao.preset === "entrada_paga" ? [{ c: "adiantado_vivo", dir: "desc" }, { c: "recebido_em", dir: "desc" }]
    : ordenacao.preset === "risco" ? [{ c: "risco_score", dir: "desc" }, { c: "dias_na_fase", dir: "desc" }, { c: "recebido_em", dir: "asc" }]
    : [{ c: "recebido_em", dir: "desc" }];
  return { filtrosLista, ordemLista };
}
