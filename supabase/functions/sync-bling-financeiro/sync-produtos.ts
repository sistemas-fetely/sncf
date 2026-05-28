import type { BlingClient } from "./bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function syncProdutos(
  supabase: any,
  client: BlingClient,
  timeUp: () => boolean,
  cursor: { ultima_pagina: number },
) {
  let criados = 0, atualizados = 0, erros = 0;
  let pagina = Math.max(cursor.ultima_pagina + 1, 1);
  let ultimoErro = "";

  while (!timeUp()) {
    let data: any;
    try {
      data = await client.get(`/produtos?limite=100&pagina=${pagina}`);
    } catch (e) {
      ultimoErro = `pagina ${pagina}: ${(e as Error).message}`;
      break;
    }
    const items = data?.data || [];
    if (items.length === 0) { pagina = 0; break; }

    for (const p of items) {
      try {
        const blingId = String(p.id);
        const registro: any = {
          bling_id: blingId,
          codigo: p.codigo || null,
          nome: p.nome || "Sem nome",
          descricao: p.descricaoCurta || null,
          tipo: p.tipo === "S" ? "servico" : "produto",
          peso_bruto: p.pesoBruto != null ? Number(p.pesoBruto) : null,
          peso_liquido: p.pesoLiquido != null ? Number(p.pesoLiquido) : null,
          unidade: p.unidade || "UN",
          ncm: p.ncm || null,
          gtin: p.gtin || null,
          preco_custo: p.precoCusto != null ? Number(p.precoCusto) : null,
          preco_venda: p.preco != null ? Number(p.preco) : null,
          // estoque_atual NÃO vem na listagem /produtos da API v3 — populado pelo syncEstoques.
          estoque_minimo: p.estoque?.minimo != null ? Number(p.estoque.minimo) : null,
          imagem_url: p.midia?.imagens?.externas?.[0]?.link ?? p.imageThumbnail ?? null,
          ativo: p.situacao === "A",
          origem: "api_bling",
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from("produtos").select("id").eq("bling_id", blingId).maybeSingle();

        if (existing) {
          await supabase.from("produtos").update(registro).eq("id", existing.id);
          atualizados++;
        } else {
          await supabase.from("produtos").insert(registro);
          criados++;
        }
      } catch (e) {
        erros++;
        ultimoErro = `item ${p?.id}: ${(e as Error).message}`;
      }
    }

    await supabase.from("integracoes_sync_cursor")
      .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
      .eq("sistema", "bling").eq("entidade", "produtos");

    pagina++;
    await sleep(300);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina };
}
