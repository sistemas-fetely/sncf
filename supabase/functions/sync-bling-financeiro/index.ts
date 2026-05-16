import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

var BLING_BASE = "https://api.bling.com.br/Api/v3";

function ok(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: any, status?: any) {
  return new Response(
    JSON.stringify({ sucesso: false, erro: message }),
    { status: status || 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function sleep(ms: number) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Tempo máximo total da execução (Edge tem limite de 150s — paramos antes pra responder).
var MAX_EXEC_MS = 120000;
var execStartTs = 0;
function timeUp() {
  return (Date.now() - execStartTs) > MAX_EXEC_MS;
}

async function blingGet(endpoint: string, accessToken: string): Promise<any> {
  var url = BLING_BASE + endpoint;
  var res = await fetch(url, {
    method: "GET",
    headers: { "Authorization": "Bearer " + accessToken, "Accept": "application/json" }
  });
  if (res.status === 429) {
    await sleep(1200);
    return blingGet(endpoint, accessToken);
  }
  if (!res.ok) {
    var text = await res.text();
    throw new Error("Bling API erro " + res.status + ": " + text);
  }
  return res.json();
}

async function refreshToken(supabase: any, config: any) {
  var credentials = config.client_id + ":" + config.client_secret;
  var encoded = btoa(credentials);
  var params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", config.refresh_token);

  var res = await fetch(BLING_BASE + "/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Authorization": "Basic " + encoded
    },
    body: params
  });
  if (!res.ok) throw new Error("Falha ao renovar token. Reconecte o Bling.");

  var tokens = await res.json();
  await supabase.from("integracoes_config").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + ((tokens.expires_in || 3600) * 1000)).toISOString(),
    updated_at: new Date().toISOString()
  }).eq("sistema", "bling");

  return tokens.access_token;
}

// === SYNC: CONTAS A RECEBER ===
async function syncContasReceber(supabase: any, accessToken: string, ultimaSync: any) {
  var criados = 0, atualizados = 0, erros = 0;
  var pagina = 1;
  var temMais = true;

  while (temMais) {
    if (timeUp()) { temMais = false; break; }
    try {
      var url = "/contas/receber?limite=100&pagina=" + pagina;
      if (ultimaSync) {
        url = url + "&dataEmissao[gte]=" + ultimaSync.split("T")[0];
      }
      var data = await blingGet(url, accessToken);
      var contas = (data && data.data) ? data.data : [];
      if (contas.length === 0) { temMais = false; break; }

      for (var i = 0; i < contas.length; i++) {
        try {
          var conta = contas[i];
          var status = "aberto";
          if (conta.situacao === 2 || conta.situacao === 5) status = "pago";
          else if (conta.situacao === 3) status = "cancelado";
          if (status === "aberto" && conta.vencimento && new Date(conta.vencimento) < new Date()) {
            status = "atrasado";
          }

          var nomeContato = (conta.contato && conta.contato.nome) ? conta.contato.nome : null;
          var blingId = String(conta.id);

          var parceiro_id = null;
          if (conta.contato && conta.contato.id) {
            var parcResult = await supabase
              .from("parceiros_comerciais")
              .select("id")
              .eq("bling_id", String(conta.contato.id))
              .maybeSingle();

            if (parcResult.data) {
              parceiro_id = parcResult.data.id;
            } else if (nomeContato) {
              var novoParceiro = await supabase
                .from("parceiros_comerciais")
                .insert({
                  razao_social: nomeContato,
                  tipo: "pj",
                  tipos: ["cliente"],
                  origem: "bling",
                  bling_id: String(conta.contato.id)
                })
                .select("id")
                .maybeSingle();
              parceiro_id = novoParceiro.data ? novoParceiro.data.id : null;
            }
          }

          var registro = {
            tipo: "receber",
            descricao: conta.historico || conta.nroDocumento || "Sem descricao",
            valor: parseFloat(conta.valor) || 0,
            data_vencimento: conta.vencimento || null,
            data_pagamento: conta.dataPagamento || null,
            status: status,
            fornecedor_cliente: nomeContato,
            parceiro_id: parceiro_id,
            origem: "api_bling",
            bling_id: blingId,
            observacao: conta.ocorrencia || null
          };

          var existing = await supabase
            .from("contas_pagar_receber")
            .select("id")
            .eq("bling_id", blingId)
            .eq("tipo", "receber")
            .maybeSingle();

          if (existing.data) {
            await supabase.from("contas_pagar_receber").update(registro).eq("id", existing.data.id);
            atualizados++;
          } else {
            await supabase.from("contas_pagar_receber").insert(registro);
            criados++;
          }
        } catch (e) { erros++; }
      }
      pagina++;
      await sleep(400);
    } catch (e) { erros++; temMais = false; }
  }
  return { criados: criados, atualizados: atualizados, erros: erros };
}

// === SYNC: PEDIDOS DE VENDA ===
async function syncPedidos(supabase: any, accessToken: string, ultimaSync: any) {
  var criados = 0, atualizados = 0, erros = 0;
  var pagina = 1;
  var temMais = true;

  while (temMais) {
    if (timeUp()) { temMais = false; break; }
    try {
      var url = "/pedidos/vendas?limite=100&pagina=" + pagina;
      if (ultimaSync) {
        url = url + "&dataInicial=" + ultimaSync.split("T")[0];
      }
      var data = await blingGet(url, accessToken);
      var pedidos = (data && data.data) ? data.data : [];
      if (pedidos.length === 0) { temMais = false; break; }

      for (var i = 0; i < pedidos.length; i++) {
        try {
          var ped = pedidos[i];
          var blingId = String(ped.id);

          var parceiro_id = null;
          var clienteNome = (ped.contato && ped.contato.nome) ? ped.contato.nome : null;
          if (ped.contato && ped.contato.id) {
            var parcResult = await supabase
              .from("parceiros_comerciais")
              .select("id")
              .eq("bling_id", String(ped.contato.id))
              .maybeSingle();
            if (parcResult.data) {
              parceiro_id = parcResult.data.id;
            } else if (clienteNome) {
              var novoParceiro = await supabase
                .from("parceiros_comerciais")
                .insert({
                  razao_social: clienteNome,
                  tipo: "pj",
                  tipos: ["cliente"],
                  origem: "bling",
                  bling_id: String(ped.contato.id)
                })
                .select("id")
                .maybeSingle();
              parceiro_id = novoParceiro.data ? novoParceiro.data.id : null;
            }
          }

          var registro = {
            bling_id: blingId,
            numero: ped.numero ? String(ped.numero) : null,
            numero_loja: ped.numeroLoja || null,
            data_pedido: ped.data || null,
            data_prevista_entrega: ped.dataPrevista || null,
            data_saida: ped.dataSaida || null,
            parceiro_id: parceiro_id,
            cliente_nome: clienteNome,
            valor_produtos: parseFloat(ped.totalProdutos) || 0,
            valor_frete: parseFloat(ped.frete) || 0,
            valor_desconto: parseFloat(ped.desconto) || 0,
            valor_total: parseFloat(ped.total) || 0,
            situacao: ped.situacao ? ped.situacao.valor : null,
            observacoes: ped.observacoes || null,
            origem: "api_bling",
            updated_at: new Date().toISOString()
          };

          var existing = await supabase
            .from("pedidos_venda")
            .select("id")
            .eq("bling_id", blingId)
            .maybeSingle();

          if (existing.data) {
            await supabase.from("pedidos_venda").update(registro).eq("id", existing.data.id);
            atualizados++;
          } else {
            await supabase.from("pedidos_venda").insert(registro);
            criados++;
          }
        } catch (e) { erros++; }
      }
      pagina++;
      await sleep(400);
    } catch (e) { erros++; temMais = false; }
  }
  return { criados: criados, atualizados: atualizados, erros: erros };
}

// === SYNC: PRODUTOS ===
async function syncProdutos(supabase: any, accessToken: string) {
  var criados = 0, atualizados = 0, erros = 0;
  var ultimoErro = "";
  var pagina = 1;
  var temMais = true;

  while (temMais) {
    if (timeUp()) { temMais = false; break; }
    try {
      var url = "/produtos?limite=100&pagina=" + pagina;
      var data = await blingGet(url, accessToken);
      var produtos = (data && data.data) ? data.data : [];
      if (produtos.length === 0) { temMais = false; break; }

      for (var i = 0; i < produtos.length; i++) {
        try {
          var prod = produtos[i];
          var blingId = String(prod.id);

          var registro = {
            bling_id: blingId,
            codigo: prod.codigo || null,
            nome: prod.nome || "Sem nome",
            descricao: prod.descricaoCurta || null,
            tipo: prod.tipo === "S" ? "servico" : "produto",
            peso_bruto: parseFloat(prod.pesoBruto) || null,
            peso_liquido: parseFloat(prod.pesoLiquido) || null,
            unidade: prod.unidade || "UN",
            ncm: prod.ncm || null,
            gtin: prod.gtin || null,
            preco_custo: parseFloat(prod.precoCusto) || null,
            preco_venda: parseFloat(prod.preco) || null,
            imagem_url: (prod.midia && prod.midia.url && prod.midia.url.miniatura) ? prod.midia.url.miniatura : null,
            ativo: prod.situacao === "A",
            origem: "api_bling",
            updated_at: new Date().toISOString()
          };

          var existing = await supabase
            .from("produtos")
            .select("id")
            .eq("bling_id", blingId)
            .maybeSingle();

          if (existing.data) {
            await supabase.from("produtos").update(registro).eq("id", existing.data.id);
            atualizados++;
          } else {
            await supabase.from("produtos").insert(registro);
            criados++;
          }
        } catch (e) {
          erros++;
          ultimoErro = "item: " + ((e instanceof Error) ? e.message : String(e));
          console.error("[syncProdutos][item]", ultimoErro);
        }
      }
      pagina++;
      await sleep(400);
    } catch (e) {
      erros++;
      ultimoErro = "pagina " + pagina + ": " + ((e instanceof Error) ? e.message : String(e));
      console.error("[syncProdutos][page]", ultimoErro);
      temMais = false;
    }
  }
  return { criados: criados, atualizados: atualizados, erros: erros, ultimoErro: ultimoErro };
}

// === MAIN HANDLER ===
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    var supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    var authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Nao autorizado");

    var jwt = authHeader.replace("Bearer ", "");
    var authResult = await supabase.auth.getUser(jwt);
    if (authResult.error || !authResult.data.user) throw new Error("Nao autorizado");
    var user = authResult.data.user;

    var roleResult = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleResult.data) throw new Error("Apenas super_admin");

    var body = await req.json().catch(function () { return { tipo: "ping" }; });
    var tipo = body.tipo || "ping";

    if (tipo === "ping") {
      return ok({ sucesso: true, mensagem: "Edge Function ativa!" });
    }

    if (tipo === "token_exchange" && body.code) {
      var cfgResult = await supabase
        .from("integracoes_config")
        .select("client_id, client_secret")
        .eq("sistema", "bling")
        .maybeSingle();

      if (!cfgResult.data || !cfgResult.data.client_id || !cfgResult.data.client_secret) {
        throw new Error("Client ID/Secret nao cadastrados");
      }

      var credentials = cfgResult.data.client_id + ":" + cfgResult.data.client_secret;
      var encoded = btoa(credentials);
      var params = new URLSearchParams();
      params.set("grant_type", "authorization_code");
      params.set("code", body.code);
      params.set("redirect_uri", body.redirect_uri || "https://people-fetely.lovable.app/administrativo/bling-callback");

      var tokenRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "Authorization": "Basic " + encoded
        },
        body: params
      });

      if (!tokenRes.ok) {
        var errText = await tokenRes.text();
        throw new Error("Bling rejeitou: " + tokenRes.status + " " + errText);
      }

      var tokens = await tokenRes.json();
      await supabase.from("integracoes_config").update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + ((tokens.expires_in || 3600) * 1000)).toISOString(),
        ativo: true,
        updated_at: new Date().toISOString()
      }).eq("sistema", "bling");

      return ok({ sucesso: true, mensagem: "Bling conectado com sucesso!" });
    }

    if (tipo === "limpar_travados") {
      // Marca como "cancelado" qualquer log "executando" há mais de 3 minutos
      var limite = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      var upd = await supabase.from("integracoes_sync_log")
        .update({ status: "cancelado", detalhes: "Cancelado automaticamente (timeout)" })
        .eq("status", "executando")
        .lt("created_at", limite)
        .select("id");
      return ok({ sucesso: true, cancelados: upd.data ? upd.data.length : 0 });
    }

    if (tipo === "contas_receber" || tipo === "pedidos" || tipo === "produtos") {
      var configResult = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();

      if (!configResult.data || !configResult.data.access_token) {
        throw new Error("Bling nao configurado. Conecte primeiro.");
      }

      var config = configResult.data;
      var accessToken = config.access_token;

      if (config.token_expires_at) {
        var expiresDate = new Date(config.token_expires_at);
        if (expiresDate < new Date()) {
          accessToken = await refreshToken(supabase, config);
        }
      }

      // Limpa logs travados antes de iniciar (>3 min em "executando")
      var limiteTravado = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      await supabase.from("integracoes_sync_log")
        .update({ status: "cancelado", detalhes: "Cancelado automaticamente (timeout)" })
        .eq("status", "executando")
        .lt("created_at", limiteTravado);

      var logResult = await supabase.from("integracoes_sync_log").insert({
        sistema: "bling", tipo: tipo, status: "executando", iniciado_por: user.id
      }).select("id").maybeSingle();
      var logId = logResult.data ? logResult.data.id : null;

      var startTime = Date.now();
      execStartTs = startTime;
      var result = { criados: 0, atualizados: 0, erros: 0 };

      try {
        if (tipo === "contas_receber") {
          result = await syncContasReceber(supabase, accessToken, config.ultima_sync_at);
        } else if (tipo === "pedidos") {
          result = await syncPedidos(supabase, accessToken, config.ultima_sync_at);
        } else if (tipo === "produtos") {
          result = await syncProdutos(supabase, accessToken);
        }
      } catch (eSync) {
        var msgSync = (eSync instanceof Error) ? eSync.message : String(eSync);
        if (logId) {
          await supabase.from("integracoes_sync_log").update({
            status: "erro",
            detalhes: "Falha: " + msgSync,
            duracao_ms: Date.now() - startTime
          }).eq("id", logId);
        }
        throw eSync;
      }

      var duracao = Date.now() - startTime;
      var statusFinal = (result.erros > 0) ? "parcial" : "sucesso";
      var ultimoErro = (result as any).ultimoErro || "";
      var detalhe = tipo + ": " + result.criados + " novos, " + result.atualizados + " atualizados"
        + (ultimoErro ? " | erro: " + ultimoErro.slice(0, 500) : "");

      if (logId) {
        await supabase.from("integracoes_sync_log").update({
          status: statusFinal, registros_criados: result.criados,
          registros_atualizados: result.atualizados, registros_erro: result.erros,
          detalhes: detalhe, duracao_ms: duracao
        }).eq("id", logId);
      }

      await supabase.from("integracoes_config").update({
        ultima_sync_at: new Date().toISOString(),
        ultima_sync_status: statusFinal,
        ultima_sync_detalhes: detalhe,
        updated_at: new Date().toISOString()
      }).eq("sistema", "bling");

      return ok({
        sucesso: true, criados: result.criados,
        atualizados: result.atualizados, erros: result.erros,
        detalhes: detalhe, duracao_ms: duracao,
        ultimo_erro: ultimoErro || null
      });
    }

    throw new Error("Tipo nao reconhecido: " + tipo);

  } catch (e) {
    var msg = (e instanceof Error) ? e.message : String(e);
    return err(msg, 400);
  }
});
