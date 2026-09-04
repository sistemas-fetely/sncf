import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exigirAcao } from "../_shared/permissao-acao.ts";

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

  // AUTORIA-NAO-SE-PERDE: service role não tem auth.uid(), então o evento de
  // estágio nasceria sem autor. Este client carrega o JWT do usuário e é usado
  // SÓ na chamada de transicionar_pedido (bloco 8b).
  const sbUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );


  let pedido_id: string | null = null;
  let payload: Record<string, unknown> | null = null;
  let userId: string | null = null;
  let overrides: string[] = [];
  let rotulosOverride: string[] = [];
  let motivo = "";

  try {
    const body = await req.json().catch(() => ({}));
    pedido_id = body?.pedido_id ?? null;
    if (!pedido_id) return json({ sucesso: false, erro: "pedido_id obrigatório" }, 400);

    // OVERRIDE-TEM-NOME (01/09/2026): `forcar` virou lista de códigos. Boolean
    // ainda chega de frontend em cache — mapeia pro único caminho da UI antiga.
    const rawForcar = body?.forcar;
    if (rawForcar === true) {
      console.warn("[empurrar-pedido-xpm] chamada legada: forcar=true → ['expedicao_existente']");
      overrides = ["expedicao_existente"];
    } else if (Array.isArray(rawForcar)) {
      overrides = rawForcar.filter((c: unknown) => typeof c === "string" && c.trim().length > 0);
    } else {
      overrides = [];
    }

    motivo = typeof body?.motivo === "string" ? body.motivo : "";

    // Permissão nominal de ação (server-side) + autoria da trilha.
    const guarda = await exigirAcao(
      sb,
      req.headers.get("Authorization"),
      "acao.empurrar_xpm",
      "empurrar pedido pra XPM",
    );
    if (!guarda.ok) return json({ sucesso: false, erro: guarda.erro }, guarda.status);
    userId = guarda.userId;

    // DIMENSAO-VIA-TABELA: quem pode furar cada bloqueio mora em xpm_override_dim.
    if (overrides.length > 0) {
      const { data: dims, error: eDim } = await sb
        .from("xpm_override_dim")
        .select("codigo, rotulo, permissao_slug, motivo_min")
        .in("codigo", overrides)
        .eq("ativo", true);
      if (eDim) throw new Error(`xpm_override_dim: ${eDim.message}`);

      const encontrados = (dims ?? []).map((d: { codigo: string }) => d.codigo);
      const faltando = overrides.filter((c) => !encontrados.includes(c));
      if (faltando.length > 0) {
        return json(
          { sucesso: false, erro: `Override inválido ou inativo: ${faltando.join(", ")}` },
          400,
        );
      }

      const motivoMin = Math.max(
        ...(dims ?? []).map((d: { motivo_min: number | null }) => Number(d.motivo_min) || 15),
      );
      // Sem motivo não força: o override precisa deixar rastro legível.
      if (motivo.trim().length < motivoMin) {
        return json(
          { sucesso: false, erro: `Forçar exige motivo com pelo menos ${motivoMin} caracteres` },
          400,
        );
      }

      for (const d of dims ?? []) {
        const g = await exigirAcao(
          sb,
          req.headers.get("Authorization"),
          d.permissao_slug,
          `forçar empurrão: ${d.rotulo}`,
        );
        if (!g.ok) return json({ sucesso: false, erro: g.erro }, g.status);
      }
      rotulosOverride = (dims ?? []).map((d: { rotulo: string }) => d.rotulo);
    }

    // 1. Montador de payload mora no banco (FONTE-ÚNICA). A edge só transporta.
    const { data: montado, error: eMontar } = await sb.rpc("fn_xpm_payload_expedicao", {
      p_pedido_id: pedido_id,
      p_forcar: overrides,
    });
    if (eMontar) throw new Error(`montar payload: ${eMontar.message}`);

    const avisos: string[] = Array.isArray(montado?.avisos) ? montado.avisos : [];

    // 2. Bloqueio pré-voo: não sai pela metade, e o motivo vai pra tela.
    // O prefixo diz de quem é a recusa: aqui a XPM nunca foi chamada.
    if (!montado?.ok) {
      const motivos: string[] = montado?.bloqueios ?? ["Falha desconhecida ao montar payload"];
      const msg = motivos.join(" · ");
      await sb.from("pedidos")
        .update({ xpm_envio_erro: `Bloqueado antes do envio · ${msg}` })
        .eq("id", pedido_id);
      return json({ sucesso: false, erro: msg, bloqueios: motivos, avisos }, 422);
    }

    payload = montado.payload;
    const codigo: string = montado.codigo;
    const ambiente: string = montado.ambiente;

    // 3. Credenciais e base pelo ambiente configurado — nunca hardcode.
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

    // 4. Autenticar (ZENLOG-TENANT-OBRIGATORIO: tenantName é exigido)
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

    // 5. Create
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

    // 6. CREATE-NAO-E-RECIBO: 200 não prova gravação. Confirma por GET.
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

    // 7. Log sempre — sucesso e falha.
    await sb.from("xpm_envios_log").insert({
      pedido_id,
      operacao: "create",
      enviado_por: userId,
      payload_enviado: { ...(payload ?? {}), overrides, motivo, avisos },
      resposta_status: respStatus,
      resposta_body: respBody as Record<string, unknown> | null,
      expedicao_codigo_retornado: sucesso ? codigo : null,
      expedicao_id_zenlog: expedicaoIdZenlog,
      sucesso,
      erro_msg: erroMsg,
      duracao_ms: Date.now() - t0,
    });

    // 8. Estado do pedido (FAIL-LOUD: erro fica gravado e visível)
    if (sucesso) {
      const { error: eUp } = await sb.from("pedidos").update({
        xpm_expedicao_codigo: codigo,
        xpm_enviado_em: new Date().toISOString(),
        xpm_enviado_por: userId,
        xpm_envio_erro: null,
      }).eq("id", pedido_id);
      if (eUp) throw new Error(`gravar pedido: ${eUp.message}`);

      // OVERRIDE deixa rastro no histórico do pedido. FAIL-LOUD.
      if (forcar) {
        const { error: eEv } = await sb.from("pedido_eventos").insert({
          pedido_id,
          tipo_evento: "xpm_push_forcado",
          descricao: `Empurrão para a XPM forçado sobre expedição já existente: ${motivo.trim()}`,
          metadata: {
            expedicao_codigo: codigo,
            motivo: motivo.trim(),
            forcado_por: userId,
          },
          automatico: false,
        });
        if (eEv) throw new Error(`registrar evento de override: ${eEv.message}`);
      }

      // 8b. Transição de estágio — XPM-CONFIRMA-SEPARACAO (21/08/2026): pré-separação
      // → em separação só avança quando a XPM confirma de verdade a expedição
      // (via GetEventosExpedicao acima). O Bling não mexe mais em estágio.
      let avisoTransicao: string | undefined;
      const estagioAtual = montado?.estagio as string | undefined;
      if (estagioAtual && ["pre_faturado", "pre_separacao"].includes(estagioAtual)) {
        const { error: errTransicao } = await sbUser.rpc("transicionar_pedido", {
          p_pedido_id: pedido_id,
          p_para_estagio: "em_separacao",
          p_proxima_acao: "Pedido no armazém — aguardar NF",
          p_motivo: `Expedição confirmada na XPM (${codigo})`,
        });
        if (errTransicao) {
          console.error(`[empurrar-pedido-xpm] transicionar_pedido falhou: ${errTransicao.message}`);
          avisoTransicao = `Empurrado pra XPM mas estágio não avançou automaticamente — ${errTransicao.message}`;
        }
      }

      return json({
        sucesso: true,
        codigo_expedicao: codigo,
        ambiente,
        avisos,
        ...(avisoTransicao ? { aviso_transicao: avisoTransicao } : {}),
        duracao_ms: Date.now() - t0,
      });
    }

    await sb.from("pedidos")
      .update({ xpm_envio_erro: erroMsg })
      .eq("id", pedido_id);

    return json({ sucesso: false, erro: erroMsg, duracao_ms: Date.now() - t0 }, 502);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pedido_id) {
      await sb.from("xpm_envios_log").insert({
        pedido_id,
        operacao: "create",
        enviado_por: userId,
        payload_enviado: payload ?? {},
        sucesso: false,
        erro_msg: msg,
        duracao_ms: Date.now() - t0,
      });
      await sb.from("pedidos").update({ xpm_envio_erro: msg }).eq("id", pedido_id);
    }
    return json({ sucesso: false, erro: msg }, 500);
  }
});
