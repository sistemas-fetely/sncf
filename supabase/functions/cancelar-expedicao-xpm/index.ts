// CANCELAMENTO DE EXPEDICAO NA ZENLOG (XPM) — POST /api/services/app/Expedicao/CancelaExpedicao.
//
// AUTORIZACAO EXPLICITA: liberado em 09/09/2026 por Flavio, registrado na doutrina em
// integracoes_config, apos leitura do Swagger de producao (o DTO CancelaExpedicaoDto exige
// apenas `codigo` mais os CNPJs; nao tem campo de situacao nem enum). A proibicao de
// AtualizaSituacao continua valendo e NAO e tocada aqui.
//
// ORDEM IMPORTA: primeiro a XPM, depois o SNCF. Se a XPM recusar, nada muda por aqui.
// Se a XPM cancelar e a RPC do SNCF falhar, a resposta e ERRO nomeando esse estado.

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

const MIN_MOTIVO = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const t0 = Date.now();
  const authHeader = req.headers.get("Authorization");

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // AUTORIA-NAO-SE-PERDE: fn_xpm_declarar_cancelamento resolve o autor por auth.uid().
  // Chamada com service role, a autoria sairia vazia. Este client leva o JWT do usuario.
  const sbUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader ?? "" } } },
  );

  let expedicaoCodigo = "";
  let motivo = "";
  let userId: string | null = null;
  let pedidoId: string | null = null;
  let payload: Record<string, unknown> | null = null;

  const gravarLog = async (campos: {
    resposta_status: number | null;
    resposta_body: unknown;
    sucesso: boolean;
    erro_msg: string | null;
  }) => {
    // pedido_id e NOT NULL na tabela: sem pedido resolvido, o log vai pro console
    // em vez de derrubar a operacao (que ja aconteceu na XPM).
    if (!pedidoId) {
      console.warn("[cancelar-expedicao-xpm] sem pedido_id para o log", {
        expedicao_codigo: expedicaoCodigo,
        ...campos,
      });
      return;
    }
    const { error } = await sb.from("xpm_envios_log").insert({
      pedido_id: pedidoId,
      operacao: "cancela",
      enviado_por: userId,
      payload_enviado: { ...(payload ?? {}), motivo },
      resposta_status: campos.resposta_status,
      resposta_body: (campos.resposta_body ?? null) as Record<string, unknown> | null,
      expedicao_codigo_retornado: campos.sucesso ? expedicaoCodigo : null,
      sucesso: campos.sucesso,
      erro_msg: campos.erro_msg,
      duracao_ms: Date.now() - t0,
    });
    if (error) console.error(`[cancelar-expedicao-xpm] gravar log: ${error.message}`);
  };

  try {
    const body = await req.json().catch(() => ({}));
    expedicaoCodigo = typeof body?.expedicao_codigo === "string" ? body.expedicao_codigo.trim() : "";
    motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";

    if (!expedicaoCodigo) {
      return json({ sucesso: false, erro: "expedicao_codigo obrigatório" }, 400);
    }
    if (motivo.length < MIN_MOTIVO) {
      return json(
        { sucesso: false, erro: `motivo obrigatório, com pelo menos ${MIN_MOTIVO} caracteres` },
        400,
      );
    }

    const guarda = await exigirAcao(
      sb,
      authHeader,
      "acao.empurrar_xpm",
      "cancelar expedição na XPM",
    );
    if (!guarda.ok) return json({ sucesso: false, erro: guarda.erro }, guarda.status);
    userId = guarda.userId;

    // Pedido só para rastreio do log — ausência não impede o cancelamento.
    const { data: ped } = await sb
      .from("pedidos").select("id").eq("xpm_expedicao_codigo", expedicaoCodigo).maybeSingle();
    pedidoId = ped?.id ?? null;

    // Credenciais e base SEMPRE da config; PAT só do vault.
    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config").select("config").eq("sistema", "zenlog_prd").maybeSingle();
    let cfg = cfgRow?.config as Record<string, string> | undefined;
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    if (!cfg) {
      const { data: alt, error: eAlt } = await sb
        .from("integracoes_config").select("config").eq("sistema", "zenlog").maybeSingle();
      if (eAlt) throw new Error(`config zenlog: ${eAlt.message}`);
      if (!alt?.config) throw new Error("Config da ZenLOG não encontrada (zenlog_prd nem zenlog).");
      cfg = alt.config as Record<string, string>;
    }

    const base = cfg.base_url;
    if (!base) throw new Error("base_url ausente na config da ZenLOG.");

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", {
      p_name: cfg.pat_vault_key,
    });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    // Autenticacao (ZENLOG-TENANT-OBRIGATORIO)
    const authEndpoint = cfg.auth_endpoint ?? "/api/TokenAuth/AuthenticatePAT";
    const authUrl = authEndpoint.startsWith("http") ? authEndpoint : `${base}${authEndpoint}`;
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    // deno-lint-ignore no-explicit-any
    const authJson: any = await authRes.json().catch(() => null);
    const token = authJson?.result?.accessToken;
    if (!authRes.ok || !token) {
      throw new Error(`auth falhou: ${authJson?.error?.message ?? `HTTP ${authRes.status}`}`);
    }

    // ZenLOG casa entidade pelo CNPJ MASCARADO. Aprendizado de 09/09/2026:
    // 1) cpfCnpjOperadorLogistico com dígitos crus (08898687000136) → HTTP 500
    //    "Nenhuma Entidade encontrada para o CPF/CNPJ informado (08898687000136)".
    // 2) Remover cpfCnpjOperadorLogistico → HTTP 400
    //    "OperadorLogisticoId ou CpfCnpj devem estar preenchidos".
    // O Create de expedição já envia os documentos mascarados (08.898.687/0001-36)
    // e o maxLength 18 do DTO confirma a máscara. Portanto usamos fn_mascara_cnpj_cpf.
    const { data: depMask, error: eDepMask } = await sb.rpc("fn_mascara_cnpj_cpf", {
      p_doc: cfg.cpf_cnpj_depositante,
    });
    if (eDepMask || !depMask) {
      throw new Error(
        `Não foi possível mascarar o CNPJ do depositante (${cfg.cpf_cnpj_depositante}): ${eDepMask?.message ?? "retorno vazio"}`,
      );
    }
    const { data: opMask, error: eOpMask } = await sb.rpc("fn_mascara_cnpj_cpf", {
      p_doc: cfg.cpf_cnpj_operador_logistico,
    });
    if (eOpMask || !opMask) {
      throw new Error(
        `Não foi possível mascarar o CNPJ do operador logístico (${cfg.cpf_cnpj_operador_logistico}): ${eOpMask?.message ?? "retorno vazio"}`,
      );
    }

    payload = {
      codigo: expedicaoCodigo,
      cpfCnpjDepositante: depMask,
      cpfCnpjOperadorLogistico: opMask,
    };

    let respStatus: number | null = null;
    let respBody: unknown = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const r = await fetch(`${base}/api/services/app/Expedicao/CancelaExpedicao`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      respStatus = r.status;
      const texto = await r.text();
      try {
        respBody = texto ? JSON.parse(texto) : null;
      } catch {
        respBody = { raw: texto };
      }
      // deno-lint-ignore no-explicit-any
      const j = respBody as any;
      sucesso = r.ok && j?.success !== false;
      if (!sucesso) {
        erroMsg = `HTTP ${r.status} · ${
          j?.error?.message ?? j?.error?.details ?? (texto || "sem corpo")
        }`;
      }
    } catch (e) {
      erroMsg = e instanceof Error ? e.message : String(e);
      sucesso = false;
    }

    if (!sucesso) {
      // XPM recusou: o SNCF não é tocado. O corpo da XPM vai inteiro na mensagem.
      await gravarLog({ resposta_status: respStatus, resposta_body: respBody, sucesso: false, erro_msg: erroMsg });
      return json({
        sucesso: false,
        erro: `A XPM recusou o cancelamento de ${expedicaoCodigo}: ${erroMsg}`,
        resposta_xpm: respBody,
        duracao_ms: Date.now() - t0,
      }, 502);
    }

    await gravarLog({ resposta_status: respStatus, resposta_body: respBody, sucesso: true, erro_msg: null });

    // Confirmado na XPM: agora o SNCF. RPC com o JWT do usuário (autoria).
    const motivoRpc = `${motivo} · cancelado via API CancelaExpedicao`;
    // deno-lint-ignore no-explicit-any
    const { data: rpcData, error: eRpc } = await (sbUser.rpc as any)(
      "fn_xpm_declarar_cancelamento",
      { p_expedicao_codigo: expedicaoCodigo, p_motivo: motivoRpc },
    );
    // deno-lint-ignore no-explicit-any
    const rpc = (rpcData ?? {}) as any;
    if (eRpc || rpc?.ok !== true) {
      const detalhe = eRpc?.message ?? rpc?.erro ?? "RPC não confirmou o cancelamento";
      const msg =
        `A expedição ${expedicaoCodigo} FOI CANCELADA na XPM (HTTP ${respStatus}), mas o SNCF NÃO foi atualizado: ` +
        `${detalhe}. O pedido continua apontando para a expedição — resolva no SNCF, não repita o cancelamento na XPM.`;
      console.error(`[cancelar-expedicao-xpm] ${msg}`);
      return json({
        sucesso: false,
        cancelado_na_xpm: true,
        sncf_atualizado: false,
        resposta_status: respStatus,
        erro: msg,
        resposta_xpm: respBody,
        duracao_ms: Date.now() - t0,
      }, 500);
    }

    return json({
      sucesso: true,
      expedicao_codigo: expedicaoCodigo,
      resposta_status: respStatus,
      rpc: rpc,
      duracao_ms: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cancelar-expedicao-xpm]", msg);
    return json({ sucesso: false, erro: msg, duracao_ms: Date.now() - t0 }, 500);
  }
});
