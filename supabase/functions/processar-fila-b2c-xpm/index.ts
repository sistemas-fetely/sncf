import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const resultado = { processados: 0, sucesso: 0, erro: 0, detalhes: [] as unknown[] };

  try {
    const { data: fila, error: eFila } = await sb
      .from("xpm_pedido_fila_b2c")
      .select("id, nf_id, pedido_id, tentativas")
      .eq("status", "pendente")
      .not("pedido_id", "is", null)
      .order("enfileirado_em", { ascending: true })
      .limit(20);

    if (eFila) throw new Error(`ler fila: ${eFila.message}`);

    for (const item of fila ?? []) {
      resultado.processados++;
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/empurrar-pedido-xpm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ pedido_id: item.pedido_id }),
        });
        const rj = await r.json().catch(() => null);

        if (r.ok && rj?.sucesso) {
          // NF e expedicao juntas: liga a NF ao pedido AGORA, so depois do Create
          // confirmado. Isso dispara fn_trg_nf_enfileira_xpm sozinho (ja existente).
          const { data: pedido } = await sb
            .from("pedidos")
            .select("id_externo")
            .eq("id", item.pedido_id)
            .maybeSingle();

          const { error: eLink } = await sb
            .from("nfs_emitidas")
            .update({
              pedido_venda_id: item.pedido_id,
              vinculo_origem: "b2c_auto",
              vinculo_pedido_ref: pedido?.id_externo ?? null,
              vinculo_em: new Date().toISOString(),
            })
            .eq("id", item.nf_id)
            .is("pedido_venda_id", null);
          if (eLink) throw new Error(`ligar NF ao pedido: ${eLink.message}`);

          await sb
            .from("xpm_pedido_fila_b2c")
            .update({
              status: "concluido",
              concluido_em: new Date().toISOString(),
              ultima_tentativa_em: new Date().toISOString(),
            })
            .eq("id", item.id);

          resultado.sucesso++;
        } else {
          const msg = rj?.erro ?? `HTTP ${r.status}`;
          const tentativas = (item.tentativas ?? 0) + 1;
          await sb
            .from("xpm_pedido_fila_b2c")
            .update({
              status: tentativas >= 5 ? "erro" : "pendente",
              tentativas,
              ultimo_erro: msg,
              ultima_tentativa_em: new Date().toISOString(),
            })
            .eq("id", item.id);
          resultado.erro++;
          resultado.detalhes.push({ nf_id: item.nf_id, pedido_id: item.pedido_id, erro: msg });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const tentativas = (item.tentativas ?? 0) + 1;
        await sb
          .from("xpm_pedido_fila_b2c")
          .update({
            status: tentativas >= 5 ? "erro" : "pendente",
            tentativas,
            ultimo_erro: msg,
            ultima_tentativa_em: new Date().toISOString(),
          })
          .eq("id", item.id);
        resultado.erro++;
        resultado.detalhes.push({ nf_id: item.nf_id, pedido_id: item.pedido_id, erro: msg });
      }
    }

    return json({ sucesso: true, ...resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ sucesso: false, erro: msg, ...resultado }, 500);
  }
});
