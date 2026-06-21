import type { BlingClient } from "./bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function safeDate(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s.startsWith("0000")) return null;
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

async function resolveParceiroId(supabase: any, contato: any): Promise<string | null> {
  if (!contato?.id) return null;
  const blingId = String(contato.id);
  const { data: found } = await supabase
    .from("parceiros_comerciais").select("id").eq("bling_id", blingId).maybeSingle();
  if (found) return found.id;
  if (!contato.nome) return null;
  const { data: novo } = await supabase.from("parceiros_comerciais").insert({
    razao_social: contato.nome,
    tipo: "pj",
    tipos: ["cliente"],
    origem: "api_bling",
    bling_id: blingId,
  }).select("id").maybeSingle();
  return novo?.id ?? null;
}

export async function syncPedidos(
  supabase: any,
  client: BlingClient,
  timeUp: () => boolean,
  cursor: { ultima_pagina: number; ultima_data_corte: string | null },
  ultimaSync: string | null,
) {
  let criados = 0, atualizados = 0, erros = 0;
  let pagina = Math.max(cursor.ultima_pagina + 1, 1);
  let ultimoErro = "";
  const corteISO = cursor.ultima_data_corte || ultimaSync || null;
  const corteDate = corteISO ? corteISO.split("T")[0] : null;

  while (!timeUp()) {
    let data: any;
    try {
      const filtro = corteDate ? `&dataInicial=${corteDate}` : "";
      data = await client.get(`/pedidos/vendas?limite=100&pagina=${pagina}${filtro}`);
    } catch (e) {
      ultimoErro = `pagina ${pagina}: ${(e as Error).message}`;
      break;
    }
    const items = data?.data || [];
    if (items.length === 0) { pagina = 0; break; }

    for (const ped of items) {
      try {
        const blingId = String(ped.id);
        const parceiro_id = await resolveParceiroId(supabase, ped.contato);
        const registro = {
          bling_id: blingId,
          numero: ped.numero ? String(ped.numero) : null,
          numero_loja: ped.numeroLoja || null,
          data_pedido: safeDate(ped.data),
          data_prevista_entrega: safeDate(ped.dataPrevista),
          data_saida: safeDate(ped.dataSaida),
          parceiro_id,
          cliente_nome: ped.contato?.nome ?? null,
          valor_produtos: Number(ped.totalProdutos) || 0,
          valor_frete: Number(ped.frete) || 0,
          valor_desconto: Number(ped.desconto) || 0,
          valor_total: Number(ped.total) || 0,
          situacao: ped.situacao?.valor ?? null,
          situacao_nome: ped.situacao?.nome ?? null,
          situacao_raw: ped.situacao ?? null,
          transporte_raw: ped.transporte ?? null,
          observacoes: ped.observacoes || null,
          origem: "api_bling",
          updated_at: new Date().toISOString(),
        };
        const { data: existing } = await supabase
          .from("pedidos_venda").select("id").eq("bling_id", blingId).maybeSingle();
        if (existing) {
          const { error: upErr } = await supabase.from("pedidos_venda").update(registro).eq("id", existing.id);
          if (upErr) { erros++; ultimoErro = `update ${blingId}: ${upErr.message}`; continue; }
          atualizados++;
        } else {
          const { error: insErr } = await supabase.from("pedidos_venda").insert(registro);
          if (insErr) { erros++; ultimoErro = `insert ${blingId}: ${insErr.message}`; continue; }
          criados++;
        }
      } catch (e) {
        erros++;
        ultimoErro = `item ${ped?.id}: ${(e as Error).message}`;
      }
    }

    await supabase.from("integracoes_sync_cursor")
      .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
      .eq("sistema", "bling").eq("entidade", "pedidos");

    pagina++;
    await sleep(300);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina };
}
