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

  const t0 = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let remessa_id: string | null = null;
  let pedido_id: string | null = null;
  let payload: Record<string, unknown> | null = null;
  let userId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    remessa_id = body?.remessa_id ?? null;
    if (!remessa_id) return json({ sucesso: false, erro: "remessa_id obrigatório" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = u?.user?.id ?? null;
    }

    const { data: montado, error: eMontar } = await sb.rpc("fn_xpm_payload_expedicao", {
      p_remessa_id: remessa_id,
    });
    if (eMontar) throw new Error(`montar payload: ${eMontar.message}`);

    pedido_id = montado?.pedido_id ?? null;

    if (!montado?.ok) {
      const motivos: string[] = montado?.bloqueios ?? ["Falha desconhecida ao montar payload"];
      const msg = motivos.join(" · ");
      await sb.from("pedido_remessa").update({ xpm_envio_erro: msg }).eq("id", remessa_id);
      return json({ sucesso: false, erro: msg, bloqueios: motivos }, 422);
    }

    payload = montado.payload;
    const codigo: string = montado.codigo;
    const ambiente: string = montado.ambiente;

    const sistema = ambiente === "producao" ? "zenlog_prd" : "zenlog";
    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config").select("config").eq("sistema", sistema).single();
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

    let respStatus: number | null = null;
    let respBody: unknown = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const r = await fetch(
        `${base}/api/services/app/LayoutUnificadoPedidoExpedicao/Create`,
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
      sucesso = false;
    }

    let expedicaoIdZenlog: number | null = null;
    let confirmado = false;
    if (sucesso) {
      const qs = new URLSearchParams({
        CpfCnpjOperadorLogistico: String(payload!.cpfCnpj),
        CpfCnpjDepositante: String(payload!.cpfCnpjDepositante),
        CodigoExpedicao: codigo,
      });
      const v = await fetch(
        `${base}/api/services/app/Expedicao/GetEventosExpedicao?${qs}`,
        { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } },
      );
      const vj = await v.json().catch(() => null);
      confirmado = v.ok && vj?.success === true && !!vj?.result?.codigoExpedicao;
      if (!confirmado) {
        sucesso = false;
        erroMsg = "Create devolveu OK mas a expedição não foi encontrada na verificação";
      }
    }

    await sb.from("xpm_envios_log").insert({
      pedido_id,
      remessa_id,
      operacao: "create",
      enviado_por: userId,
      payload_enviado: payload,
      resposta_status: respStatus,
      resposta_body: respBody as Record<string, unknown> | null,
      expedicao_codigo_retornado: sucesso ? codigo : null,
      expedicao_id_zenlog: expedicaoIdZenlog,
      sucesso,
      erro_msg: erroMsg,
      duracao_ms: Date.now() - t0,
    });

    if (sucesso) {
      const { error: eUp } = await sb.from("pedido_remessa").update({
        xpm_expedicao_codigo: codigo,
        xpm_enviado_em: new Date().toISOString(),
        xpm_enviado_por: userId,
        xpm_envio_erro: null,
      }).eq("id", remessa_id);
      if (eUp) throw new Error(`gravar remessa: ${eUp.message}`);

      return json({
        sucesso: true,
        codigo_expedicao: codigo,
        ambiente,
        duracao_ms: Date.now() - t0,
      });
    }

    await sb.from("pedido_remessa")
      .update({ xpm_envio_erro: erroMsg })
      .eq("id", remessa_id);

    return json({ sucesso: false, erro: erroMsg, duracao_ms: Date.now() - t0 }, 502);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (remessa_id) {
      await sb.from("xpm_envios_log").insert({
        pedido_id,
        remessa_id,
        operacao: "create",
        enviado_por: userId,
        payload_enviado: payload ?? {},
        sucesso: false,
        erro_msg: msg,
        duracao_ms: Date.now() - t0,
      });
      await sb.from("pedido_remessa").update({ xpm_envio_erro: msg }).eq("id", remessa_id);
    }
    return json({ sucesso: false, erro: msg }, 500);
  }
});
