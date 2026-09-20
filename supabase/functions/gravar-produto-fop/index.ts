// Escrita do bloco tecnico do produto no FOP.
// O SNCF e o mestre da linha tecnica; o FOP continua sendo a tela do Thomer para os campos dele.
// A whitelist NAO vive aqui: vem de produto_ficha_nascimento (dono='fetely'). Se a matriz
// mudar o dono de um campo, esta funcao muda de comportamento sozinha (DIMENSAO-VIA-TABELA).
// Nenhum caminho devolve ok sem o PATCH no FOP ter dado 2xx.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";

// Identidade nao se escreve por aqui nem sendo dono='fetely': quem aloca codigo,
// EAN e DUN e o cartorio (fn_pi_efetivar_lote), que marca o codigo e grava o vinculo.
const CAMPOS_IDENTIDADE = new Set(["cod_cadastro", "sku", "ean", "dun"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Auth por sessao
    const auth = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ ok: false, erro: "Não autorizado" }, 401);

    let body: any = null;
    try {
      body = await req.json();
    } catch (_) {
      return json({ ok: false, erro: "Body JSON inválido" }, 400);
    }

    const codCadastro = typeof body?.cod_cadastro === "string" ? body.cod_cadastro.trim() : "";
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    const campos = body?.campos;

    if (!codCadastro) return json({ ok: false, erro: "cod_cadastro obrigatório" }, 400);
    // 5) motivo obrigatorio
    if (!motivo) return json({ ok: false, erro: "motivo obrigatório" }, 400);
    if (!campos || typeof campos !== "object" || Array.isArray(campos)) {
      return json({ ok: false, erro: "campos obrigatório (objeto campo → valor)" }, 400);
    }

    const pedidos = Object.keys(campos as Record<string, unknown>);
    if (pedidos.length === 0) {
      return json({ ok: false, erro: "campos vazio: nada para gravar" }, 400);
    }

    console.log("[gravar-produto-fop] pedido", {
      cod_cadastro: codCadastro,
      campos: pedidos,
      motivo,
      usuario: userData.user.id,
    });

    // fase tem regras proprias (um degrau por vez, saldo) e mora na outra funcao
    if (pedidos.includes("fase")) {
      console.error("[gravar-produto-fop] recusa: fase não se grava por aqui", codCadastro);
      return json(
        {
          ok: false,
          erro: "fase não se grava por aqui — use a função promover-fase-produto, que tem as regras de degrau e de saldo",
        },
        400,
      );
    }

    // 2) Whitelist vem da matriz, nunca de lista no codigo
    const { data: matriz, error: errMatriz } = await supabase
      .from("produto_ficha_nascimento")
      .select("campo, dono");
    if (errMatriz) {
      console.error("[gravar-produto-fop] erro lendo produto_ficha_nascimento", errMatriz);
      return json({ ok: false, erro: errMatriz.message }, 500);
    }
    const donoDoCampo = new Map<string, string>(
      (matriz ?? []).map((m: any) => [String(m.campo), String(m.dono ?? "")]),
    );

    // 3) e 4) — ou grava tudo que foi pedido, ou recusa a chamada inteira
    for (const campo of pedidos) {
      if (CAMPOS_IDENTIDADE.has(campo)) {
        console.error("[gravar-produto-fop] recusa: identidade", { codCadastro, campo });
        return json(
          { ok: false, campo, erro: `campo \`${campo}\` é campo de identidade — só muda pelo cartório` },
          403,
        );
      }
      const dono = donoDoCampo.get(campo);
      if (dono === undefined) {
        console.error("[gravar-produto-fop] recusa: fora da matriz", { codCadastro, campo });
        return json(
          { ok: false, campo, erro: `campo \`${campo}\` não existe na matriz produto_fase_ficha` },
          403,
        );
      }
      if (dono !== "fetely") {
        console.error("[gravar-produto-fop] recusa: dono", { codCadastro, campo, dono });
        return json(
          { ok: false, campo, dono, erro: `campo \`${campo}\` pertence a \`${dono}\` e não se escreve por aqui` },
          403,
        );
      }
    }

    // 6) Produto precisa existir — e os valores atuais viram o de_para
    const { data: atual, error: errAtual } = await (supabase as any)
      .from("sncf_produtos")
      .select("*")
      .eq("cod_cadastro", codCadastro)
      .maybeSingle();
    if (errAtual) {
      console.error("[gravar-produto-fop] erro lendo sncf_produtos", errAtual);
      return json({ ok: false, erro: errAtual.message }, 500);
    }
    if (!atual) {
      return json({ ok: false, erro: `Produto não encontrado: ${codCadastro}` }, 404);
    }

    const patch: Record<string, unknown> = {};
    const dePara: Record<string, { de: unknown; para: unknown }> = {};
    for (const campo of pedidos) {
      const valor = (campos as Record<string, unknown>)[campo];
      patch[campo] = valor;
      dePara[campo] = { de: (atual as Record<string, unknown>)[campo] ?? null, para: valor };
    }

    // 7) Escrita no mestre do cadastro: FOP, via endpoint inbound que ja autentica.
    //    A autorizacao (whitelist, dono, identidade) continua sendo decidida AQUI —
    //    o FOP e so o braco de escrita. Credencial do vault, nunca do env.
    //    (A chave de servico do REST nunca foi preenchida — placeholder de template;
    //    o token inbound e o compartilhado valido nos dois lados.)
    const { data: fopToken, error: errVault } = await supabase.rpc("get_vault_secret", {
      p_name: "FOP_INBOUND_TOKEN",
    });
    if (errVault || !fopToken) {
      console.error("[gravar-produto-fop] vault falhou", errVault);
      return json(
        {
          ok: false,
          erro: `FOP_INBOUND_TOKEN indisponível no vault${errVault ? `: ${errVault.message}` : ""}`,
        },
        500,
      );
    }

    const respFop = await fetch(`${FOP_URL}/functions/v1/sincronizar-catalogo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fopToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modo: "gravar_produto",
        cod_cadastro: codCadastro,
        campos: patch,
        motivo,
      }),
    });

    const corpoFop = await respFop.text();
    let fopJson: Record<string, unknown> | null = null;
    try {
      fopJson = JSON.parse(corpoFop) as Record<string, unknown>;
    } catch {
      fopJson = null;
    }

    if (respFop.status === 401) {
      // Falha de configuracao (token recusado), nao do usuario.
      console.error("[gravar-produto-fop] FOP recusou o token inbound", corpoFop);
      return json(
        { ok: false, erro: "O token de entrada do FOP foi recusado — configuração a revisar, não é erro do cadastro.", fop_status: 401, fop_body: corpoFop },
        502,
      );
    }

    if (respFop.status === 403) {
      console.error("[gravar-produto-fop] FOP recusou campos", corpoFop);
      return json(
        { ok: false, erro: "FOP recusou campos da gravação", campos_recusados: fopJson?.campos_recusados ?? null, fop_body: corpoFop },
        403,
      );
    }

    if (respFop.status === 404) {
      console.error("[gravar-produto-fop] produto nao encontrado no FOP", corpoFop);
      return json(
        { ok: false, erro: "Produto não encontrado no FOP", fop_body: corpoFop },
        404,
      );
    }

    if (!respFop.ok || fopJson?.ok !== true) {
      // 502 do FOP traz erro_banco das triggers (gate_fase, gate_dimensoes,
      // derivar_sku): devolve CRU, sem mastigar.
      console.error("[gravar-produto-fop] FOP recusou", respFop.status, corpoFop);
      return json(
        {
          ok: false,
          erro: "FOP recusou a gravação",
          fop_status: respFop.status,
          fop_body: typeof fopJson?.erro_banco === "string" ? fopJson.erro_banco : corpoFop,
        },
        502,
      );
    }

    const fopRepresentacao = fopJson;
    console.log("[gravar-produto-fop] FOP aceitou", { codCadastro, campos: pedidos });

    // 8) Espelho local — o sync reconcilia, mas a falha nao pode ficar muda
    const { error: errEspelho } = await (supabase as any)
      .from("sncf_produtos")
      .update(patch)
      .eq("cod_cadastro", codCadastro);
    if (errEspelho) {
      console.error("[gravar-produto-fop] falha no espelho local", errEspelho);
      return json(
        {
          ok: false,
          erro: `FOP aceitou, mas o espelho local falhou: ${errEspelho.message}`,
          gravados: pedidos,
        },
        500,
      );
    }

    console.log("[gravar-produto-fop] gravado", { codCadastro, gravados: pedidos, motivo });

    return json({
      ok: true,
      cod_cadastro: codCadastro,
      gravados: pedidos,
      de_para: dePara,
      fop: Array.isArray(fopRepresentacao) ? fopRepresentacao[0] ?? null : fopRepresentacao,
    });
  } catch (e) {
    console.error("[gravar-produto-fop] erro inesperado", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
