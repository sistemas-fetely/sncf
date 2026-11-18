import { BlingHttpError, type BlingClient } from "./bling-client.ts";

export const MIN_MOTIVO_REENVIO = 10;
export const ERRO_NF_REENVIO = "Pedido já tem NF — corrija pela NF, não reenviando o pedido";

export function validarMotivoReenvio(motivo: unknown): string {
  if (typeof motivo !== "string" || motivo.trim().length < MIN_MOTIVO_REENVIO) {
    throw new Error("Motivo obrigatório (mínimo 10 caracteres).");
  }
  return motivo.trim();
}

/** Nunca interpreta falha de consulta como ausência nem admite confirmação manual. */
export async function conferirPedidoCancelado(client: Pick<BlingClient, "get">, id: string): Promise<string> {
  let pedido;
  try {
    pedido = (await client.get(`/pedidos/vendas/${id}`))?.data;
  } catch (e) {
    if (e instanceof BlingHttpError && e.status === 404) return "Excluído (404)";
    throw e;
  }
  if (!pedido) throw new Error("Bling retornou pedido sem dados — reenvio não liberado.");
  if (Number(pedido.notaFiscal?.id ?? 0) > 0) throw new Error(ERRO_NF_REENVIO);
  const situacaoId = Number(pedido.situacao?.id ?? 0);
  if (!situacaoId) throw new Error("Situação do pedido não informada pelo Bling — reenvio não liberado.");
  const modulos = (await client.get("/situacoes/modulos"))?.data;
  const vendas = Array.isArray(modulos) ? modulos.filter(m => /^(pedidos de )?vendas$/i.test(String(m.nome ?? "").trim())) : [];
  if (vendas.length !== 1 || !vendas[0].id) throw new Error("Módulo Vendas não identificado no Bling — reenvio não liberado.");
  const situacoes = (await client.get(`/situacoes/modulos/${vendas[0].id}`))?.data;
  const canceladas = Array.isArray(situacoes) ? situacoes.filter(s => /^cancelado$/i.test(String(s.nome ?? "").trim())) : [];
  if (canceladas.length !== 1 || !canceladas[0].id) throw new Error("Situação Cancelado não identificada no Bling — reenvio não liberado.");
  if (situacaoId !== Number(canceladas[0].id)) {
    const atual = situacoes.find((s: { id: number }) => Number(s.id) === situacaoId);
    throw new Error(`Pedido ainda ativo no Bling (situação ${atual?.nome ?? situacaoId}). Cancele lá primeiro.`);
  }
  return String(canceladas[0].nome);
}

// A RPC bloqueia o pedido e grava evento/limpeza juntos; somente esta conferência
// server-side pode chamá-la. O envio recebe o mesmo Request do fluxo normal.
export async function reenviarVerificado(deps: {
  db: any; client: Pick<BlingClient, "get">; pedidoId: string; usuario: string;
  motivo: unknown; enviar: () => Promise<Response>;
}): Promise<Response> {
  const motivo = validarMotivoReenvio(deps.motivo);
  const { data: p, error: pe } = await deps.db.from("pedidos").select("bling_id_destino").eq("id", deps.pedidoId).single();
  if (pe) throw new Error(pe.message);
  if (!p?.bling_id_destino) throw new Error("Pedido ainda não tem id do Bling — use o envio normal, não o reenvio");
  const anterior = String(p.bling_id_destino);
  const { data: nfs, error: ne } = await deps.db.from("nfs_emitidas").select("id")
    .or(`pedido_venda_id.eq.${deps.pedidoId},bling_pedido_venda_id.eq.${anterior}`)
    .eq("tipo", "saida").not("situacao", "in", "(cancelada,rejeitada,denegada)")
    .is("anulada_por_devolucao_em", null).is("substituida_por_nf_id", null).limit(1);
  if (ne) throw new Error(ne.message);
  if (nfs?.length) throw new Error(ERRO_NF_REENVIO);
  const situacao = await conferirPedidoCancelado(deps.client, anterior);
  const { data: prep, error: prepErr } = await deps.db.rpc("fn_bling_reenvio_verificado_preparar", {
    p_pedido_id: deps.pedidoId, p_bling_id_anterior: anterior, p_situacao_bling: situacao,
    p_motivo: motivo, p_usuario: deps.usuario,
  });
  if (prepErr) throw new Error(prepErr.message);
  if (!prep?.evento_id) throw new Error("Preparação do reenvio não retornou evento.");
  let resposta: Response;
  try { resposta = await deps.enviar(); }
  catch (e) { resposta = new Response(JSON.stringify({ sucesso: false, erro: e instanceof Error ? e.message : String(e) }), { status: 500 }); }
  const resultado = await resposta.clone().json().catch(() => ({}));
  const sucesso = resposta.ok && resultado.sucesso === true && !!resultado.bling_id;
  if (!sucesso) {
    const erro = String(resultado.erro ?? `Falha ao reenviar: HTTP ${resposta.status}`);
    // Não apaga um id novo que o envio tenha confirmado antes de falhar no retorno.
    const { error } = await deps.db.from("pedidos").update({ bling_envio_erro: erro }).eq("id", deps.pedidoId).is("bling_id_destino", null);
    if (error) throw new Error(`${erro} · Falha ao registrar erro: ${error.message}`);
  }
  const { error: evErr } = await deps.db.from("pedido_eventos").update({
    descricao: `Reenvio ao Bling: ${anterior} → ${sucesso ? resultado.bling_id : "não enviado"} · ${motivo}`,
    metadata: { bling_id_anterior: anterior, bling_id_novo: sucesso ? String(resultado.bling_id) : null,
      situacao_bling: situacao, motivo, usuario: deps.usuario, erro: sucesso ? null : resultado.erro },
  }).eq("id", prep.evento_id);
  if (evErr) throw new Error(`Falha ao atualizar histórico do reenvio: ${evErr.message}`);
  return resposta;
}