// Sincroniza estoque (saldo) dos produtos via /estoques/saldos.
// O endpoint /produtos (lista) NÃO devolve estoque na v3 da API — por isso
// rodamos esse passo dedicado, em lotes de até 100 IDs por chamada.
import type { BlingClient } from "./bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const BATCH = 100;

export async function syncEstoques(
  supabase: any,
  client: BlingClient,
  timeUp: () => boolean,
  cursor: { ultima_pagina: number },
) {
  let atualizados = 0, erros = 0, ultimoErro = "";
  // ultima_pagina aqui = offset (qtde de produtos já processados nessa rodada full)
  let offset = Math.max(cursor.ultima_pagina, 0);

  while (!timeUp()) {
    // Pega próximo lote de produtos que tenham bling_id, ordenado estável por id.
    const { data: lote, error: loteErr } = await supabase
      .from("produtos")
      .select("id, bling_id")
      .not("bling_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (loteErr) {
      ultimoErro = `lote offset ${offset}: ${loteErr.message}`;
      break;
    }
    if (!lote || lote.length === 0) {
      offset = 0; // sinaliza fim → cursor reseta
      break;
    }

    // Monta query string idsProdutos[]=X&idsProdutos[]=Y...
    const qs = lote
      .map((p: any) => `idsProdutos[]=${encodeURIComponent(p.bling_id)}`)
      .join("&");

    let data: any;
    try {
      data = await client.get(`/estoques/saldos?${qs}`);
    } catch (e) {
      erros++;
      ultimoErro = `offset ${offset}: ${(e as Error).message}`;
      // não avança offset — tenta de novo na próxima execução
      break;
    }

    const saldos: any[] = data?.data || [];
    // Index por bling_id pra update rápido
    const porBlingId = new Map<string, any>();
    for (const s of saldos) {
      const bid = String(s?.produto?.id ?? "");
      if (bid) porBlingId.set(bid, s);
    }

    for (const p of lote) {
      const s = porBlingId.get(String(p.bling_id));
      if (!s) continue; // produto sem registro de estoque no Bling — não mexe
      const fisico = s.saldoFisicoTotal != null ? Number(s.saldoFisicoTotal) : null;
      const virtual = s.saldoVirtualTotal != null ? Number(s.saldoVirtualTotal) : null;
      // Prioriza virtual (= físico - reservas), cai pra físico se virtual ausente.
      const saldo = virtual ?? fisico;
      if (saldo == null) continue;

      const { error: updErr } = await supabase
        .from("produtos")
        .update({ estoque_atual: saldo, updated_at: new Date().toISOString() })
        .eq("id", p.id);

      if (updErr) {
        erros++;
        ultimoErro = `update ${p.id}: ${updErr.message}`;
      } else {
        atualizados++;
      }
    }

    offset += lote.length;

    await supabase.from("integracoes_sync_cursor")
      .update({
        ultima_pagina: offset,
        total_processado: atualizados,
        updated_at: new Date().toISOString(),
      })
      .eq("sistema", "bling").eq("entidade", "estoques");

    if (lote.length < BATCH) { offset = 0; break; } // último lote
    await sleep(350); // respeita rate-limit (~3 req/s)
  }

  return { criados: 0, atualizados, erros, ultimoErro, proximaPagina: offset };
}
