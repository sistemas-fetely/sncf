// Edge Function: bling-b2c-corrigir-transportadora
// B2C-TRANSPORTADORA-POR-CD (22/11/2026): corrige a agência Correios (transporte.contato)
// de pedidos B2C que já desceram ao Bling com a agência errada e ainda não têm NF.
// Body: { fila_ids: string[], dry?: boolean (default true) }. Sem gravar em tabela.
// Auth: x-cron-secret (SYNC_CRON_SECRET) ou usuário autenticado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ESPERA_MS = 450;

type Resultado = {
  fila_id: string;
  order_name: string | null;
  bling_pedido_id: string | null;
  de: number | null;
  para: number | null;
  resultado: string;
  erro?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // deno-lint-ignore no-explicit-any
  const supabase: any = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  let autorizado = false;
  if (cronSecret) {
    const { data: esperado } = await supabase.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (esperado && cronSecret === String(esperado)) autorizado = true;
  }
  if (!autorizado) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await userClient.auth.getUser();
      if (data?.user) autorizado = true;
    }
  }
  if (!autorizado) return json({ ok: false, erro: "Não autorizado" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, erro: "Body JSON inválido" }, 400); }
  const filaIds = body?.fila_ids;
  if (!Array.isArray(filaIds) || filaIds.length === 0 || filaIds.length > 200 ||
      !filaIds.every((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x))) {
    return json({ ok: false, erro: "fila_ids deve ser lista (1..200) de UUIDs" }, 400);
  }
  if (body.dry !== undefined && typeof body.dry !== "boolean") return json({ ok: false, erro: "dry deve ser boolean" }, 400);
  const dry = body.dry !== false;

  const { data: cfg, error: eCfg } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (eCfg) return json({ ok: false, erro: `ler integracoes_config: ${eCfg.message}` }, 500);
  if (!cfg?.access_token) return json({ ok: false, erro: "Bling não conectado" }, 503);
  const token = await ensureFreshToken(supabase, cfg);
  const bling = makeBlingClient(supabase, cfg, token);

  const resultados: Resultado[] = [];
  for (const filaId of filaIds as string[]) {
    const r: Resultado = { fila_id: filaId, order_name: null, bling_pedido_id: null, de: null, para: null, resultado: "erro" };
    try {
      const { data: fila, error: eF } = await supabase.from("bling_pedido_fila_b2c")
        .select("id, order_name, status, bling_pedido_id, centro_id_resolvido").eq("id", filaId).maybeSingle();
      if (eF) throw new Error(`ler fila: ${eF.message}`);
      if (!fila) throw new Error("fila_id não encontrado");
      r.order_name = fila.order_name;
      r.bling_pedido_id = fila.bling_pedido_id ? String(fila.bling_pedido_id) : null;
      if (fila.status !== "enviado") throw new Error(`status da fila é "${fila.status}", esperado "enviado"`);
      if (!fila.bling_pedido_id) throw new Error("fila sem bling_pedido_id");

      const { data: ag, error: eAg } = await supabase.rpc("fn_b2c_agencia_correios", { p_centro_id: fila.centro_id_resolvido });
      if (eAg) throw new Error(`Transportadora B2C: ${eAg.message}`);
      const esperado = Number(ag?.bling_id ?? 0);
      if (!Number.isFinite(esperado) || esperado <= 0) throw new Error("Transportadora B2C: agência sem bling_id");
      r.para = esperado;

      const resp = await bling.get(`/pedidos/vendas/${fila.bling_pedido_id}`);
      await dormir(ESPERA_MS);
      const ped = resp?.data;
      if (!ped) throw new Error("GET do pedido sem data");
      const atual = Number(ped.transporte?.contato?.id ?? 0);
      r.de = atual > 0 ? atual : null;

      if (Number(ped.notaFiscal?.id ?? 0) > 0) r.resultado = "pulado_tem_nf";
      else if (!(atual > 0)) r.resultado = "pulado_sem_transportadora";
      else if (atual === esperado) r.resultado = "ok_ja_certo";
      else {
        const novo = { ...ped, transporte: { ...ped.transporte, contato: { id: esperado } } };
        delete novo.id; delete novo.numero; delete novo.situacao; delete novo.notaFiscal;
        if (dry) r.resultado = "dry";
        else {
          await bling.put(`/pedidos/vendas/${fila.bling_pedido_id}`, novo);
          await dormir(ESPERA_MS);
          const conf = (await bling.get(`/pedidos/vendas/${fila.bling_pedido_id}`))?.data;
          await dormir(ESPERA_MS);
          const confId = Number(conf?.transporte?.contato?.id ?? 0);
          if (confId !== esperado) throw new Error(`PUT feito, mas transporte.contato.id ficou ${confId}`);
          if (Number(conf?.total) !== Number(ped.total)) throw new Error(`PUT alterou total: ${ped.total} → ${conf?.total}`);
          r.resultado = "corrigido";
        }
      }
    } catch (e) {
      r.resultado = "erro";
      r.erro = (e as Error).message ?? String(e);
    }
    console.log("[b2c-corrigir-transportadora]", { dry, ...r });
    resultados.push(r);
  }
  return json({ ok: resultados.every((x) => x.resultado !== "erro"), dry, resultados });
});
