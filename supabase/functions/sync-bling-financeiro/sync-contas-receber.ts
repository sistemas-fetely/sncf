import type { BlingClient } from "./bling-client.ts";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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

export async function syncContasReceber(
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
      const filtro = corteDate ? `&dataEmissao[gte]=${corteDate}` : "";
      data = await client.get(`/contas/receber?limite=100&pagina=${pagina}${filtro}`);
    } catch (e) {
      ultimoErro = `pagina ${pagina}: ${(e as Error).message}`;
      break;
    }
    const items = data?.data || [];
    if (items.length === 0) { pagina = 0; break; }

    for (const conta of items) {
      try {
        const blingId = String(conta.id);
        let status = "aberto";
        if (conta.situacao === 2 || conta.situacao === 5) status = "pago";
        else if (conta.situacao === 3) status = "cancelado";
        if (status === "aberto" && conta.vencimento && new Date(conta.vencimento) < new Date()) {
          status = "atrasado";
        }
        const parceiro_id = await resolveParceiroId(supabase, conta.contato);
        const registro = {
          descricao: conta.historico || conta.nroDocumento || "Sem descrição",
          valor: Number(conta.valor) || 0,
          data_vencimento: conta.vencimento || null,
          data_pagamento: conta.dataPagamento || null,
          status,
          fornecedor_cliente: conta.contato?.nome ?? null,
          parceiro_id,
          bling_id: blingId,
          observacao: conta.ocorrencia || null,
        };
        const { error } = await supabase
          .from("bling_contas_receber_stage")
          .upsert({ ...registro, updated_at: new Date().toISOString() }, { onConflict: "bling_id" });
        if (error) throw error;
        criados++;
      } catch (e) {
        erros++;
        ultimoErro = `item ${conta?.id}: ${(e as Error).message}`;
      }
    }

    await supabase.from("integracoes_sync_cursor")
      .update({ ultima_pagina: pagina, total_processado: criados + atualizados, updated_at: new Date().toISOString() })
      .eq("sistema", "bling").eq("entidade", "contas_receber");

    pagina++;
    await sleep(300);
  }

  return { criados, atualizados, erros, ultimoErro, proximaPagina: pagina };
}
