// INSPECAO SOMENTE LEITURA DA API DA ZENLOG (XPM).
//
// Esta edge function faz APENAS GET contra a ZenLOG, com uma unica excecao: o POST
// de autenticacao em config.auth_endpoint (AuthenticatePAT), necessario quando o
// swagger exige token. NENHUMA operacao descoberta e chamada — nem POST, nem PUT,
// nem AtualizaSituacao (proibida: dominio do campo desconhecido). A doutrina em
// integracoes_config continua valendo: escrita em producao so com OK explicito
// nomeando o pedido. Aqui a gente so descobre o contrato real pra decidir depois.
//
// URL e credencial NUNCA vem do codigo: base_url, auth_endpoint, tenant_name e
// pat_vault_key saem de integracoes_config; o PAT sai do vault via get_vault_secret.

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

const METODOS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 0. Autenticacao + super_admin. Funcao administrativa nao fica aberta.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ ok: false, erro: "Nao autorizado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: u, error: eUser } = await sb.auth.getUser(token);
    const userId = u?.user?.id ?? null;
    if (eUser || !userId) return json({ ok: false, erro: "Nao autorizado" }, 401);

    const { data: ehSuper, error: eRole } = await sb.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (eRole) return json({ ok: false, erro: `Falha ao checar permissao: ${eRole.message}` }, 500);
    if (ehSuper !== true) {
      return json({ ok: false, erro: "Requer super_admin para inspecionar a API da XPM." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const ambiente: string = body?.ambiente === "homologacao" ? "homologacao" : "producao";

    // 1. Config: producao usa zenlog_prd com fallback zenlog; homologacao usa zenlog.
    let cfg: Record<string, string> | null = null;
    let sistemaUsado = "";
    if (ambiente === "producao") {
      const { data: prd } = await sb.from("integracoes_config")
        .select("config").eq("sistema", "zenlog_prd").maybeSingle();
      if (prd?.config) {
        cfg = prd.config as Record<string, string>;
        sistemaUsado = "zenlog_prd";
      } else {
        const { data: hml, error: eH } = await sb.from("integracoes_config")
          .select("config").eq("sistema", "zenlog").maybeSingle();
        if (eH) throw new Error(`config zenlog: ${eH.message}`);
        if (!hml?.config) throw new Error("Nenhuma config encontrada (zenlog_prd nem zenlog).");
        cfg = hml.config as Record<string, string>;
        sistemaUsado = "zenlog (fallback)";
      }
    } else {
      const { data: hml, error: eH } = await sb.from("integracoes_config")
        .select("config").eq("sistema", "zenlog").maybeSingle();
      if (eH) throw new Error(`config zenlog: ${eH.message}`);
      if (!hml?.config) throw new Error("Config zenlog nao encontrada.");
      cfg = hml.config as Record<string, string>;
      sistemaUsado = "zenlog";
    }

    const base = cfg.base_url ?? null;

    // 2. Candidatas do swagger.
    const candidatas: string[] = [];
    if (ambiente === "producao") {
      if (!base) throw new Error(`base_url ausente na config ${sistemaUsado}.`);
      candidatas.push(`${base}/swagger/v1/swagger.json`);
    } else {
      const sw = cfg.swagger_homologacao;
      if (!sw) throw new Error("config.swagger_homologacao ausente na linha zenlog.");
      candidatas.push(sw);
    }

    // 3. GET simples; se 401/403, autentica (unico POST permitido) e repete.
    let tokenXpm: string | null = null;
    const obterToken = async (): Promise<string> => {
      if (tokenXpm) return tokenXpm;
      const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", {
        p_name: cfg!.pat_vault_key,
      });
      if (ePat) throw new Error(`vault: ${ePat.message}`);
      if (!pat) throw new Error("PAT ausente no vault");
      const authUrl = cfg!.auth_endpoint ?? `${base}/api/TokenAuth/AuthenticatePAT`;
      const r = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg!.tenant_name }),
      });
      const j = await r.json().catch(() => null);
      const t = (j as Record<string, any> | null)?.result?.accessToken;
      if (!r.ok || !t) {
        throw new Error(
          `auth falhou em ${authUrl}: ${(j as any)?.error?.message ?? `HTTP ${r.status}`}`,
        );
      }
      tokenXpm = t as string;
      return tokenXpm;
    };

    const tentativas: string[] = [];
    let doc: Record<string, any> | null = null;
    let urlUsada: string | null = null;

    for (const url of candidatas) {
      try {
        let r = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
        if (r.status === 401 || r.status === 403) {
          const t = await obterToken();
          r = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${t}` },
          });
        }
        const texto = await r.text();
        if (!r.ok) {
          tentativas.push(`${url} -> HTTP ${r.status}: ${texto.slice(0, 300)}`);
          continue;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(texto);
        } catch {
          tentativas.push(`${url} -> HTTP ${r.status} mas resposta nao e JSON: ${texto.slice(0, 300)}`);
          continue;
        }
        if (!parsed || typeof parsed !== "object") {
          tentativas.push(`${url} -> JSON invalido (nao e objeto)`);
          continue;
        }
        doc = parsed as Record<string, any>;
        urlUsada = url;
        break;
      } catch (e) {
        tentativas.push(`${url} -> ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // FAIL-LOUD: sem documento nao existe inventario.
    if (!doc || !urlUsada) {
      return json({
        ok: false,
        erro: "Nenhuma URL de swagger respondeu com JSON valido.",
        ambiente,
        tentativas,
      }, 502);
    }

    const paths = doc.paths;
    if (!paths || typeof paths !== "object") {
      return json({
        ok: false,
        erro: `Swagger de ${urlUsada} nao tem objeto 'paths'. Nao ha operacoes a gravar.`,
        ambiente,
        tentativas,
      }, 502);
    }

    // 4. Grava o documento inteiro.
    const { error: eSw } = await sb.from("xpm_api_swagger").upsert({
      ambiente,
      base_url: base,
      swagger_url: urlUsada,
      documento: doc,
      coletado_em: new Date().toISOString(),
    }, { onConflict: "ambiente" });
    if (eSw) throw new Error(`gravar xpm_api_swagger (${urlUsada}): ${eSw.message}`);

    // 5. Inventario e coleta atual, nao acumulado.
    const linhas: Record<string, unknown>[] = [];
    for (const [path, item] of Object.entries(paths as Record<string, any>)) {
      if (!item || typeof item !== "object") continue;
      for (const metodo of METODOS) {
        const op = (item as Record<string, any>)[metodo];
        if (!op || typeof op !== "object") continue;
        linhas.push({
          ambiente,
          path,
          metodo: metodo.toUpperCase(),
          operation_id: op.operationId ?? null,
          summary: op.summary ?? null,
          tags: Array.isArray(op.tags) ? op.tags : null,
          coletado_em: new Date().toISOString(),
        });
      }
    }

    if (linhas.length === 0) {
      return json({
        ok: false,
        erro: `Swagger de ${urlUsada} tem 'paths' mas nenhuma operacao HTTP reconhecida.`,
        ambiente,
        tentativas,
      }, 502);
    }

    const { error: eDel } = await sb.from("xpm_api_operacao").delete().eq("ambiente", ambiente);
    if (eDel) throw new Error(`limpar inventario de ${ambiente}: ${eDel.message}`);

    // LOTE-QUE-FALHA-TEM-NOME: swagger de producao tem ~487 paths e ~1000 operacoes.
    // Insert unico estoura; e lote que falha em silencio deixa inventario parcial
    // passando por completo. Cada lote e nomeado no erro.
    const TAM_LOTE = 500;
    let gravadas = 0;
    for (let i = 0; i < linhas.length; i += TAM_LOTE) {
      const lote = linhas.slice(i, i + TAM_LOTE);
      const nLote = Math.floor(i / TAM_LOTE) + 1;
      const { error: eIns } = await sb
        .from("xpm_api_operacao")
        .upsert(lote, { onConflict: "ambiente,path,metodo" });
      if (eIns) {
        return json({
          ok: false,
          erro: `Falha ao gravar o lote ${nLote} de ${
            Math.ceil(linhas.length / TAM_LOTE)
          } (linhas ${i + 1}-${i + lote.length}) do inventario de ${ambiente}: ${eIns.message}`,
          ambiente,
          swagger_url: urlUsada,
          gravadas_antes_da_falha: gravadas,
        }, 500);
      }
      gravadas += lote.length;
    }

    const relevantes = linhas
      .filter((l) => /Expedicao|Pedido/i.test(String(l.path)))
      .map((l) => `${l.metodo} ${l.path}${l.operation_id ? ` (${l.operation_id})` : ""}`);

    return json({
      ok: true,
      ambiente,
      sistema_config: sistemaUsado,
      swagger_url: urlUsada,
      // A aba XPM em ConfiguracaoIntegracao le `total`. `operacoes_gravadas` fica
      // por compatibilidade com quem ja lia esse nome.
      total: gravadas,
      operacoes_gravadas: gravadas,
      expedicao_e_pedido: relevantes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inspecionar-api-xpm]", msg);
    return json({ ok: false, erro: msg }, 500);
  }
});
