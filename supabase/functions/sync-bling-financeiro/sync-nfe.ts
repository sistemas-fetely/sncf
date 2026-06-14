import type { BlingClient } from "../_shared/bling/bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function resolveParceiroId(supabase: any, contato: any): Promise<string | null> {
  if (!contato?.id) return null;
  const blingId = String(contato.id);
  const { data: found } = await supabase
    .from("parceiros_comerciais").select("id").eq("bling_id", blingId).maybeSingle();
  if (found) return found.id;
  if (!contato.nome) return null;
  const doc = (contato.numeroDocumento || "").replace(/\D/g, "");
  const { data: novo, error: insErr } = await supabase.from("parceiros_comerciais").insert({
    razao_social: contato.nome,
    tipo: "pj",
    tipo_pessoa: doc.length === 11 ? "PF" : "PJ",
    tipos: ["cliente"],
    origem: "bling",
    bling_id: blingId,
    cpf: doc.length === 11 ? doc : null,
    cnpj: doc.length === 14 ? doc : null,
    email: contato.email || null,
    telefone: contato.telefone || null,
  }).select("id").maybeSingle();
  if (insErr) {
    console.error(`resolveParceiroId INSERT failed [bling_id=${blingId}]: ${insErr.message}`);
    return null;
  }
  return novo?.id ?? null;
}

async function resolvePedidoId(supabase: any, ref: any): Promise<string | null> {
  if (ref === null || ref === undefined || ref === "") return null;
  // Remove sufixo de remessa "/NN" (ex: "PED-1780233338599/01" -> "PED-1780233338599")
  const baseId = String(ref).replace(/\/\d+$/, "");
  const { data: pedido } = await supabase
    .from("pedidos").select("id").eq("id_externo", baseId).maybeSingle();
  return pedido?.id ?? null;
}

function parseBlingDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).split(/[T ]/)[0];
  return s.startsWith("0000") ? null : s;
}

const SITUACAO_MAP: Record<number, string> = {
  1: "pendente",
  2: "emitida",
  3: "cancelada",
  4: "rascunho",
  5: "autorizada",
  6: "pendente",
  7: "inutilizada",
  8: "denegada",
  9: "rejeitada",
  10: "emitida",
  11: "bloqueada",
};

export async function syncNfe(
  supabase: any,
  client: BlingClient,
  timeUp: () => boolean,
  cursor: { ultima_pagina: number; ultima_data_corte: string | null },
) {
  let criados = 0, atualizados = 0, erros = 0;
  let pagina = Math.max(cursor.ultima_pagina + 1, 1);
  let ultimoErro = "";

  while (!timeUp()) {
    let data: any;
    try {
      data = await client.get(`/nfe?limite=100&pagina=${pagina}`);
    } catch (e) {
      ultimoErro = `pagina ${pagina}: ${(e as Error).message}`;
      break;
    }
    const items = data?.data || [];
    if (items.length === 0) { pagina = 0; break; }

    for (const nf of items) {
      try {
        const blingId = String(nf.id);
        const parceiro_id = await resolveParceiroId(supabase, nf.contato);
        let pedido_venda_id: string | null = null;
        const sitNum = typeof nf.situacao === "object" ? nf.situacao?.valor : nf.situacao;

        const { data: existing } = await supabase
          .from("nfs_emitidas")
          .select("id, valor_nota, pedido_venda_id")
          .eq("bling_id", blingId)
          .maybeSingle();

        const semValor  = !existing || !existing.valor_nota || Number(existing.valor_nota) === 0;
        const semPedido = !existing?.pedido_venda_id;

        if (semValor || semPedido) {
          try {
            const det = await client.get(`/nfe/${nf.id}`);
            const d = det?.data;
            if (d) {
              // Valor: Bling v3 retorna d.valorNota no endpoint de detalhe
              if (semValor) {
                nf._valorResolvido = Number(
                  d.valorNota ?? d.totalProdutos ?? d.total?.produtos ??
                  d.total?.nota ?? d.totalNota ?? d.valor ?? 0
                ) || 0;
              }
              // Linkage: tenta numeroPedidoLoja (herdado do pedido de venda SNCF)
              if (semPedido) {
                pedido_venda_id = await resolvePedidoId(supabase, d.numeroPedidoLoja);
                // Fallback: pedidoVenda.numero (presente em alguns cenários Bling)
                if (!pedido_venda_id && d.pedidoVenda?.numero) {
                  pedido_venda_id = await resolvePedidoId(supabase, d.pedidoVenda.numero);
                }
                // Fallback: pedidoVenda.id -> pedido_remessa
                if (!pedido_venda_id && d.pedidoVenda?.id) {
                  const { data: rm } = await supabase
                    .from("pedido_remessa").select("pedido_id")
                    .eq("bling_pedido_id", String(d.pedidoVenda.id))
                    .neq("status", "cancelada").maybeSingle();
                  pedido_venda_id = rm?.pedido_id ?? null;
                }
              }
              // Atualiza URLs de XML/PDF a partir do detalhe
              if (d.xml)      nf.xml     = d.xml;
              if (d.linkPDF)  nf.linkPDF = d.linkPDF;
              if (d.linkDanfe && !nf.linkPDF) nf.linkPDF = d.linkDanfe;
              // Frete e transportadora (do detalhe)
              nf._valorFrete        = d.valorFrete != null ? Number(d.valorFrete) : null;
              nf._transportadoraNome = d.transporte?.transportadora?.nome
                ?? d.transporte?.nome
                ?? null;
            }
          } catch (_) { /* detalhe falhou — continua sem valor/link */ }
        }

        // Se NF já tinha pedido_venda_id no banco, preserva
        if (!pedido_venda_id && existing?.pedido_venda_id) {
          pedido_venda_id = existing.pedido_venda_id;
        }

        const registro: any = {
          bling_id:     blingId,
          numero:       nf.numero   != null ? String(nf.numero) : null,
          serie:        nf.serie    != null ? String(nf.serie)  : null,
          chave_acesso: nf.chaveAcesso || null,
          tipo:         nf.tipo === 0 ? "entrada" : "saida",
          situacao:     SITUACAO_MAP[Number(sitNum)] || String(sitNum || ""),
          data_emissao: parseBlingDate(nf.dataEmissao),
          data_saida:   parseBlingDate(nf.dataOperacao),
          valor_nota:   nf._valorResolvido ?? Number(nf.valorNota) ?? 0,
          parceiro_id,
          xml_url:      nf.xml     || null,
          pdf_url:      nf.linkPDF || null,
          raw:          nf,
          origem:       "bling",
          updated_at:   new Date().toISOString(),
        };
        if (pedido_venda_id) registro.pedido_venda_id = pedido_venda_id;

        if (existing) {
          const { error: updErr } = await supabase.from("nfs_emitidas").update(registro).eq("id", existing.id);
          if (updErr) throw new Error("UPDATE nfs_emitidas: " + updErr.message);
          atualizados++;
        } else {
          const { error: insErr } = await supabase.from("nfs_emitidas").insert(registro);
          if (insErr) throw new Error("INSERT nfs_emitidas [bling_id=" + blingId + "]: " + insErr.message);
          criados++;
        }
      } catch (e) {
        erros++;
        ultimoErro = `item ${nf?.id}: ${(e as Error).message}`;
      }
    }

    await supabase.from("integracoes_sync_cursor")
      .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
      .eq("sistema", "bling").eq("entidade", "nfe");

    pagina++;
    await sleep(300);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina };
}
