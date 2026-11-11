type Get = (path: string) => Promise<any>;
export function entregaConcluida(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return t.includes('entreg') && !['saiu', 'rota', 'tentativa'].some(v => t.includes(v));
}
export async function lerObjetos(blingId: string, get: Get) {
  const pedido = await get(`/pedidos/vendas/${encodeURIComponent(blingId)}`);
  const ids = [...new Set((pedido?.data?.transporte?.volumes ?? []).map((v: any) => v.id).filter((id: unknown) => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))))];
  const objetos: { id: unknown; raw: any }[] = [];
  for (const id of ids) objetos.push({ id, raw: await get(`/logisticas/objetos/${encodeURIComponent(String(id))}`) });
  return { pedido, objetos };
}
export function extrairRastreio(raw: any, agora: string) {
  const objeto = raw?.data ?? raw;
  const r = objeto?.rastreamento ?? objeto?.rastreio;
  if (!r || typeof r !== 'object') return null;
  const codigo = r.codigo ?? r.codigoRastreio ?? objeto.codigoRastreio;
  if (typeof codigo !== 'string' || !codigo.trim()) return null;
  const situacao = r.situacao;
  const descricaoRaw = r.descricao ?? (typeof situacao === 'string' ? situacao : situacao?.descricao) ?? r.status;
  const rotulos: Record<number, string> = { 8: 'Etiqueta gerada', 1: 'Em trânsito', 3: 'Entregue' };
  const descricao = typeof descricaoRaw === 'string' && descricaoRaw.trim()
    ? descricaoRaw
    : typeof situacao === 'number' ? rotulos[situacao] ?? `Situação Bling ${situacao}` : null;
  if (!descricao) return null;
  const dataRaw = r.ultimaAlteracao ?? r.data ?? r.dataHora ?? situacao?.data;
  const dataTexto = typeof dataRaw === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dataRaw) ? `${dataRaw.replace(' ', 'T')}-03:00` : dataRaw;
  const timestamp = typeof dataTexto === 'string' ? Date.parse(dataTexto) : NaN;
  const data = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  const entregue = situacao === 3 || entregaConcluida(descricao);
  return { codigo_rastreio: codigo.trim(), servico: objeto.servico?.descricao ?? objeto.servico?.nome ?? (typeof objeto.servico === 'string' ? objeto.servico : null), status_atual: descricao, data_ultima_atualizacao: data ?? agora, atualizado_em: agora,
    ...(entregue && data ? { entregue: true, entregue_fonte: 'marketplace', entregue_confirmado_em: data } : {}),
  };
}
export async function sincronizarRastreio(sb: any, get: Get) {
  const inicio = Date.now();
  const { data: log, error: eLog } = await sb.from('integracoes_sync_log').insert({ sistema: 'bling', tipo: 'marketplace_rastreio', status: 'executando' }).select('id').single();
  if (eLog) throw new Error(eLog.message);
  const detalhes: unknown[] = []; let atualizados = 0; let erros = 0;
  try {
    const { data, error } = await sb.from('vw_gestao_marketplace').select('pedido_id,bling_pedido_id').eq('estagio', 'em_transporte').order('rastreio_atualizado_em', { ascending: true, nullsFirst: true }).order('pedido_id').limit(50);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      if (Date.now() - inicio > 45_000) break;
      try {
        if (!p.bling_pedido_id) throw new Error('Pedido sem vínculo Bling.');
        const resultado = await lerObjetos(p.bling_pedido_id, get);
        detalhes.push({ pedido_id: p.pedido_id, ...resultado });
        // Persist the raw response before interpreting it, including unfamiliar formats.
        const { error: rawError } = await sb.from('integracoes_sync_log').update({ detalhes: JSON.stringify(detalhes) }).eq('id', log.id);
        if (rawError) throw new Error(rawError.message);
        for (const o of resultado.objetos) {
          const rastreio = extrairRastreio(o.raw, new Date().toISOString());
          if (!rastreio) continue;
          const { error: eUpsert } = await sb.from('pedido_rastreamento').upsert({ pedido_id: p.pedido_id, ...rastreio }, { onConflict: 'codigo_rastreio', defaultToNull: false });
          if (eUpsert) throw new Error(eUpsert.message);
          atualizados++;
        }
      } catch (e) { erros++; detalhes.push({ pedido_id: p.pedido_id, erro: e instanceof Error ? e.message : String(e) }); }
    }
  } catch (e) { erros++; detalhes.push({ erro: e instanceof Error ? e.message : String(e) }); }
  const { error: finalError } = await sb.from('integracoes_sync_log').update({ status: erros ? 'erro' : 'sucesso', registros_atualizados: atualizados, registros_erro: erros, detalhes: JSON.stringify(detalhes), duracao_ms: Date.now() - inicio }).eq('id', log.id);
  if (finalError) throw new Error(finalError.message);
  return { ok: erros === 0, log_id: log.id, atualizados, erros, detalhes };
}