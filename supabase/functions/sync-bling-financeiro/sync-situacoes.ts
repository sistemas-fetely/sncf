function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function syncSituacoes(
  supabase: any,
  client: any,
  timeUp: () => boolean,
  _cursor: any,
) {
  let criados = 0, atualizados = 0, erros = 0;
  let ultimoErro = "";

  let mods: any;
  try {
    mods = await client.get("/situacoes/modulos");
  } catch (e) {
    return { criados, atualizados, erros: 1, ultimoErro: `modulos: ${(e as Error).message}`, proximaPagina: 0 };
  }
  const modulos = mods?.data || [];

  for (const mod of modulos) {
    if (timeUp()) break;
    const modId = mod?.id;
    if (!modId) continue;

    let sits: any;
    try {
      sits = await client.get(`/situacoes/modulos/${modId}`);
    } catch (e) {
      erros++; ultimoErro = `modulo ${modId}: ${(e as Error).message}`;
      continue;
    }
    const situacoes = sits?.data || [];

    for (const s of situacoes) {
      try {
        const sid = s?.id ?? null;
        if (sid === null) continue;
        const registro = {
          bling_situacao_id: sid,
          valor: (s?.valor ?? null),
          id_modulo: modId,
          modulo_nome: mod?.nome ?? null,
          nome: s?.nome ?? null,
          cor: s?.cor ?? null,
          raw: s,
          updated_at: new Date().toISOString(),
        };
        const { data: existing } = await supabase
          .from("bling_situacoes").select("id").eq("bling_situacao_id", sid).maybeSingle();
        if (existing) {
          const { error } = await supabase.from("bling_situacoes").update(registro).eq("id", existing.id);
          if (error) { erros++; ultimoErro = `update ${sid}: ${error.message}`; continue; }
          atualizados++;
        } else {
          const { error } = await supabase.from("bling_situacoes").insert(registro);
          if (error) { erros++; ultimoErro = `insert ${sid}: ${error.message}`; continue; }
          criados++;
        }
      } catch (e) {
        erros++; ultimoErro = `sit ${s?.id}: ${(e as Error).message}`;
      }
    }
    await sleep(200);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: 0 };
}
