import type { BlingClient } from "./bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function digits(s: any): string | null {
  if (!s) return null;
  const d = String(s).replace(/\D/g, "");
  return d || null;
}

export async function syncContatos(
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
      data = await client.get(`/contatos?limite=100&pagina=${pagina}`);
    } catch (e) {
      ultimoErro = `pagina ${pagina}: ${(e as Error).message}`;
      break;
    }
    const items = data?.data || [];
    if (items.length === 0) { pagina = 0; break; }

    for (const c of items) {
      try {
        const blingId = String(c.id);
        const cnpj = digits(c.numeroDocumento && c.tipo === "J" ? c.numeroDocumento : null);
        const cpf = digits(c.numeroDocumento && c.tipo === "F" ? c.numeroDocumento : null);
        const tipoPessoa = c.tipo === "F" ? "pf" : "pj";

        const registro: any = {
          bling_id: blingId,
          razao_social: c.nome || c.fantasia || "Sem nome",
          nome_fantasia: c.fantasia || null,
          cnpj,
          cpf,
          tipo_pessoa: tipoPessoa,
          tipo: tipoPessoa,
          tipos: ["cliente"],
          email: c.email || null,
          telefone: c.telefone || c.celular || null,
          cep: digits(c.endereco?.cep),
          logradouro: c.endereco?.endereco || null,
          numero: c.endereco?.numero || null,
          bairro: c.endereco?.bairro || null,
          cidade: c.endereco?.municipio || null,
          uf: c.endereco?.uf || null,
          ativo: c.situacao !== "I",
          origem: "api_bling",
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
          .from("parceiros_comerciais")
          .select("id")
          .eq("bling_id", blingId)
          .maybeSingle();

        if (existing) {
          // PAPEL-NAO-SE-SOBRESCREVE: `tipos` de cadastro existente e verdade do
          // SNCF (pode ter mais de um papel). Sync so define papel em cadastro novo.
          const { tipos: _papelIgnorado, ...atualizacao } = registro;
          await supabase.from("parceiros_comerciais").update(atualizacao).eq("id", existing.id);
          atualizados++;
        } else {
          await supabase.from("parceiros_comerciais").insert(registro);
          criados++;
        }
      } catch (e) {
        erros++;
        ultimoErro = `item ${c?.id}: ${(e as Error).message}`;
      }
    }

    await supabase.from("integracoes_sync_cursor")
      .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
      .eq("sistema", "bling").eq("entidade", "contatos");

    pagina++;
    await sleep(300);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina };
}
