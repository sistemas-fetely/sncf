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

const MAX_TENTATIVAS = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const t0 = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const filaId: string | null = body?.fila_id ?? null;

    let q = sb.from("xpm_nf_fila")
      .select("id, nf_id, pedido_id, expedicao_codigo, tentativas")
      .order("enfileirado_em")
      .limit(25);

    if (filaId) {
      q = sb.from("xpm_nf_fila")
        .select("id, nf_id, pedido_id, expedicao_codigo, tentativas")
        .eq("id", filaId);
    } else {
      q = q.in("status", ["pendente", "erro"]).lt("tentativas", MAX_TENTATIVAS);
    }

    const { data: itens, error: eFila } = await q;
    if (eFila) throw new Error(`ler fila: ${eFila.message}`);
    if (!itens || itens.length === 0) {
      return json({ ok: true, processados: 0, duracao_ms: Date.now() - t0 });
    }

    const { data: ambRow } = await sb.from("integracoes_config")
      .select("config").eq("sistema", "zenlog").single();
    const ambiente = (ambRow?.config as any)?.ambiente ?? "homologacao";
    const sistema = ambiente === "producao" ? "zenlog_prd" : "zenlog";

    const { data: cfgRow, error: eCfg } = await sb.from("integracoes_config")
      .select("config").eq("sistema", sistema).single();
    if (eCfg) throw new Error(`config ${sistema}: ${eCfg.message}`);
    const cfg = cfgRow!.config as Record<string, string>;

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", {
      p_name: cfg.pat_vault_key,
    });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;
    const authRes = await fetch(`${base}/api/TokenAuth/AuthenticatePAT`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const authJson = await authRes.json();
    const token = authJson?.result?.accessToken;
    if (!authRes.ok || !token) {
      throw new Error(`auth falhou: ${authJson?.error?.message ?? authRes.status}`);
    }

    let enviados = 0;
    let bloqueados = 0;
    let falhas = 0;

    for (const item of itens) {
      const tIni = Date.now();
      const tentativa = (item.tentativas ?? 0) + 1;

      const { data: montado, error: eM } = await sb.rpc("fn_xpm_payload_atribui_nf", {
        p_nf_id: item.nf_id,
      });

      if (eM || !montado?.ok) {
        const motivo = eM
          ? `montar payload: ${eM.message}`
          : (montado?.bloqueios ?? ["falha desconhecida"]).join(" · ");
        await sb.from("xpm_nf_fila").update({
          status: "erro",
          tentativas: tentativa,
          ultimo_erro: motivo,
          ultima_tentativa_em: new Date().toISOString(),
        }).eq("id", item.id);
        bloqueados++;
        continue;
      }

      const payload = montado.payload;
      let respStatus: number | null = null;
      let respBody: unknown = null;
      let sucesso = false;
      let erroMsg: string | null = null;

      try {
        const r = await fetch(
          `${base}/api/services/app/LayoutUnificadoPedidoExpedicao/AtribuiNfPedidoExpedicao`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
        );
        respStatus = r.status;
        respBody = await r.json().catch(() => null);
        const j = respBody as Record<string, any> | null;
        sucesso = r.ok && j?.success !== false;
        if (!sucesso) {
          erroMsg = j?.error?.message ?? j?.error?.details ?? `HTTP ${r.status}`;
        }
      } catch (e) {
        erroMsg = e instanceof Error ? e.message : String(e);
      }

      await sb.from("xpm_envios_log").insert({
        pedido_id: item.pedido_id,
        operacao: "atribui_nf",
        payload_enviado: payload,
        resposta_status: respStatus,
        resposta_body: respBody as Record<string, unknown> | null,
        expedicao_codigo_retornado: sucesso ? item.expedicao_codigo : null,
        sucesso,
        erro_msg: erroMsg,
        duracao_ms: Date.now() - tIni,
      });

      if (sucesso) {
        await sb.from("xpm_nf_fila").update({
          status: "enviado",
          tentativas: tentativa,
          ultimo_erro: null,
          enviado_em: new Date().toISOString(),
          ultima_tentativa_em: new Date().toISOString(),
        }).eq("id", item.id);
        enviados++;
      } else {
        await sb.from("xpm_nf_fila").update({
          status: "erro",
          tentativas: tentativa,
          ultimo_erro: erroMsg,
          ultima_tentativa_em: new Date().toISOString(),
        }).eq("id", item.id);
        falhas++;

        if (tentativa >= MAX_TENTATIVAS) {
          await sb.from("pedido_eventos").insert({
            pedido_id: item.pedido_id,
            tipo_evento: "erro_automacao",
            descricao:
              `NF nao foi entregue a XPM apos ${MAX_TENTATIVAS} tentativas. ` +
              `A carga pode estar parada na doca. Ultimo erro: ${erroMsg}`,
            metadata: {
              erro_origem: "empurrar-nf-xpm",
              fila_id: item.id,
              nf_id: item.nf_id,
              expedicao_codigo: item.expedicao_codigo,
            },
            automatico: true,
          });
        }
      }
    }

    return json({
      ok: true,
      processados: itens.length,
      enviados,
      bloqueados,
      falhas,
      ambiente,
      duracao_ms: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd",
      tipo: "nf_para_xpm",
      status: "erro",
      registros_erro: 1,
      duracao_ms: Date.now() - t0,
      detalhes: { erro: msg },
    });
    return json({ ok: false, erro: msg }, 500);
  }
});
