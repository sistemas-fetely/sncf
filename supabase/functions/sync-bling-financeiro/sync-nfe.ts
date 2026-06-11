import type { BlingClient } from "./bling-client.ts";

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
    tipo:         "pj",
    tipo_pessoa:  doc.length === 11 ? "PF" : "PJ",
    tipos:        ["cliente"],
    origem:       "api_bling",
    bling_id:     blingId,
    cpf:          doc.length === 11 ? doc : null,
    cnpj:         doc.length === 14 ? doc : null,
    email:        contato.email    || null,
    telefone:     contato.telefone || null,
  }).select("id").maybeSingle();

  if (insErr) {
    // Não derruba o sync de NFe — NF entra sem parceiro vinculado
    console.error(`resolveParceiroId INSERT failed [bling_id=${blingId}]: ${insErr.message}`);
    return null;
  }
  return novo?.id ?? null;
}

async function resolvePedidoId(supabase: any, numeroLoja: any): Promise<string | null> {
  if (numeroLoja === null || numeroLoja === undefined || numeroLoja === "") return null;
  const { data: pedido } = await supabase
    .from("pedidos")
    .select("id")
    .eq("id_externo", String(numeroLoja))
    .maybeSingle();
  return pedido?.id ?? null;
}

/** Converte data do Bling para string ISO (YYYY-MM-DD) ou null.
 *  Rejeita "0000-00-00" — valor MySQL legado retornado pelo Bling quando a data não existe.
 *  Bling retorna tanto "2026-06-10T03:00:00-03:00" quanto "2026-06-10 16:23:32". */
function parseBlingDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).split(/[T ]/)[0];
  return s.startsWith("0000") ? null : s;
}

// Bling v3 — situação como inteiro puro (documentação confirmada)
const SITUACAO_MAP: Record<number, string> = {
  1:  "pendente",
  2:  "emitida",      // Emitida DANFE
  3:  "cancelada",
  4:  "rascunho",
  5:  "autorizada",   // Autorizada (era mapeada errado como "rejeitada")
  6:  "pendente",     // aguardando autorização
  7:  "inutilizada",
  8:  "denegada",
  9:  "rejeitada",
  10: "emitida",      // em digitação
  11: "bloqueada",    // status Bling-específico
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
        const pedido_venda_id = await resolvePedidoId(supabase, nf.numeroLoja);
        const sitNum = typeof nf.situacao === "object" ? nf.situacao?.valor : nf.situacao;

        const { data: existing } = await supabase
          .from("nfs_emitidas").select("id, valor_nota").eq("bling_id", blingId).maybeSingle();

        // Busca detalhe se NF é nova ou ainda sem valor (endpoint lista não retorna valor)
        const semValor = !existing || !existing.valor_nota || Number(existing.valor_nota) === 0;
        if (semValor) {
          try {
            const det = await client.get(`/nfe/${nf.id}`);
            const d = det?.data;
            if (d) {
              nf._valorResolvido = Number(d.totalProdutos ?? d.valor ?? d.totalNota ?? 0) || 0;
            }
          } catch (_) { /* continua sem valor se detalhe falhar */ }
        }

        const registro: any = {
          bling_id: blingId,
          numero: nf.numero != null ? String(nf.numero) : null,
          serie: nf.serie != null ? String(nf.serie) : null,
          chave_acesso: nf.chaveAcesso || null,
          tipo: nf.tipo === 0 ? "entrada" : "saida",
          situacao: SITUACAO_MAP[Number(sitNum)] || String(sitNum || ""),
          data_emissao: parseBlingDate(nf.dataEmissao),
          data_saida:   parseBlingDate(nf.dataOperacao),
          valor_nota: nf._valorResolvido ?? Number(nf.valorNota) ?? 0,
          parceiro_id,
          xml_url: nf.xml || null,
          pdf_url: nf.linkPDF || null,
          raw: nf,
          origem: "api_bling",
          updated_at: new Date().toISOString(),
        };
        if (pedido_venda_id !== null) {
          registro.pedido_venda_id = pedido_venda_id;
        }
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
