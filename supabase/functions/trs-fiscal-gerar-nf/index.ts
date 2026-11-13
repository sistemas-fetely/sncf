import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { resolverProdutoBling } from "../_shared/bling/resolver-produto.ts";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { CNPJ_MATRIZ, gerarTrs, recusaTrs, type Registro } from "./gerar.ts";
import { transmitirTrs } from "./transmitir.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ ok: false, erro: "Configuração interna incompleta" }, 500);
  const db = createClient(url, service);
  try {
    const gate = await exigirAcao(db, req.headers.get("Authorization"), "acao.enviar_bling", "gerar NF de transferência");
    if (!gate.ok) return json({ ok: false, erro: gate.erro }, gate.status);
    if (gate.userId) {
      const { data: roles, error } = await db.from("user_roles").select("role").eq("user_id", gate.userId);
      if (error) throw error;
      if (!roles?.some(r => ["super_admin", "admin_rh", "sops"].includes(r.role))) return json({ ok: false, erro: "Sem permissão (sops, admin_rh ou super_admin)" }, 403);
    }
    const parsed = z.object({ pedido_id: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ ok: false, erro: "pedido_id deve ser um UUID válido" }, 400);
    const pedidoId = parsed.data.pedido_id;
    const { data: pedido, error: pedErro } = await db.from("pedidos").select("id,id_externo,parceiro_id,natureza_operacao_id,bling_id_destino").eq("id", pedidoId).maybeSingle();
    if (pedErro) throw pedErro;
    if (!pedido) return json({ ok: false, erro: "Pedido não encontrado" }, 404);
    // Recusa antes de qualquer escrita, token ou chamada ao Bling.
    if (pedido.bling_id_destino != null) return json({ ok: false, erro: recusaTrs(null, false, pedido.bling_id_destino) }, 409);
    if (!pedido.natureza_operacao_id) return json({ ok: false, erro: recusaTrs(null, false, null) }, 409);
    const [{ data: nat, error: ne }, { data: dim, error: de }, { data: anterior, error: ae }] = await Promise.all([
      db.from("naturezas_operacao").select("familia_processo,exige_expedicao,bling_natureza_id").eq("id", pedido.natureza_operacao_id).maybeSingle(),
      db.from("natureza_nf_direta").select("gera_nf_direta,transmite_automatico").eq("natureza_operacao_id", pedido.natureza_operacao_id).maybeSingle(),
      db.from("trs_nf_direta").select("*").eq("pedido_id", pedidoId).maybeSingle(),
    ]);
    if (ne || de || ae) throw ne ?? de ?? ae;
    const recusa = recusaTrs(nat, dim?.gera_nf_direta === true, pedido.bling_id_destino);
    if (recusa) return json({ ok: false, erro: recusa }, 409);
    const evento = async (descricao: string) => {
      const { error } = await db.from("pedido_eventos").insert({ pedido_id: pedidoId, tipo_evento: "bling_enviado", descricao, operador_id: gate.userId, automatico: !gate.userId, ator_tipo: gate.userId ? "humano" : "sistema", ator_origem: "trs-fiscal-gerar-nf" });
      if (error) throw error;
    };
    const transmitir = async (registro: Registro) => {
      if (dim?.transmite_automatico !== true) return { ok: true, ...registro, idempotente: true };
      const [{ data: cfg, error: ce }, { data: itens, error: ie }] = await Promise.all([
        db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
        db.from("pedido_itens").select("quantidade,valor_unitario").eq("pedido_id", pedidoId),
      ]);
      if (ce || ie) throw ce ?? ie;
      if (!cfg?.access_token || !nat || !itens?.length) throw new Error("Bling, natureza ou itens indisponíveis para conferir transmissão.");
      const valorEsperado = Math.round(itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0) * 100) / 100;
      let erroEsperado = registro.erro;
      return transmitirTrs({ ...registro, automatico: true, naturezaId: Number(nat.bling_natureza_id), valorEsperado }, {
        bling: makeBlingClient(db, cfg, await ensureFreshToken(db, cfg)), evento,
        reservar: async marcador => {
          // CAS sobre o erro atual: marcador permanece em rascunho/erro até autorização.
          let q = db.from("trs_nf_direta").update({ erro: marcador, atualizado_em: new Date().toISOString() }).eq("pedido_id", pedidoId).eq("bling_nfe_id", registro.bling_nfe_id).eq("status", "rascunho");
          q = registro.erro == null ? q.is("erro", null) : q.eq("erro", registro.erro);
          const { data, error } = await q.select("pedido_id");
          if (error) throw error;
          if (data?.length) erroEsperado = marcador;
          return Boolean(data?.length);
        },
        registrar: async r => {
          let q = db.from("trs_nf_direta").update({ ...r, ...(r.status === "erro" ? { tentativas: Number(anterior?.tentativas ?? 0) + 1 } : {}), atualizado_em: new Date().toISOString() }).eq("pedido_id", pedidoId).eq("bling_nfe_id", registro.bling_nfe_id);
          q = erroEsperado == null ? q.is("erro", null) : q.eq("erro", erroEsperado);
          const { data, error } = await q.select("pedido_id");
          if (error) throw error;
          if (!data?.length) throw new Error("Registro da NF mudou em outra chamada; reserva de envio preservada, atualize antes de continuar.");
          erroEsperado = r.erro;
        },
      });
    };
    if (anterior?.bling_nfe_id) return json(await transmitir(anterior));
    if (anterior?.status === "gerando" && Date.now() - Date.parse(anterior.atualizado_em) < 180000) return json({ ok: false, erro: "Geração em andamento — aguarde antes de tentar novamente." }, 409);
    // Compare-and-swap/PK serializam concorrência sem migration; registro velho permite recuperação.
    const tentativas = Number(anterior?.tentativas ?? 0) + 1;
    const lease = new Date().toISOString();
    const claim = anterior
      ? await db.from("trs_nf_direta").update({ status: "gerando", erro: null, atualizado_em: lease }).eq("pedido_id", pedidoId).eq("atualizado_em", anterior.atualizado_em).is("bling_nfe_id", null).select("pedido_id")
      : await db.from("trs_nf_direta").insert({ pedido_id: pedidoId, status: "gerando", atualizado_em: lease }).select("pedido_id");
    if (claim.error || !claim.data?.length) return json({ ok: false, erro: claim.error?.code === "23505" || !claim.error ? "Geração já iniciada por outra chamada — aguarde." : claim.error.message }, 409);
    const registrar = async (r: Registro) => {
      const { error } = await db.from("trs_nf_direta").update({ ...r, tentativas: r.status === "erro" ? tentativas : Number(anterior?.tentativas ?? 0), atualizado_em: new Date().toISOString() }).eq("pedido_id", pedidoId);
      if (error) throw error;
    };
    try {
      const [{ data: itens, error: ie }, { data: parceiro, error: pe }, { data: sc, error: se }, { data: cfg, error: ce }, { data: ref, error: re }] = await Promise.all([
        db.from("pedido_itens").select("sku,descricao,quantidade,valor_unitario").eq("pedido_id", pedidoId).order("ordem"),
        db.from("parceiros_comerciais").select("bling_id,cnpj").eq("id", pedido.parceiro_id).maybeSingle(),
        db.from("expedicao_b2b_cd").select("loja_bling_id").eq("centro_codigo", "XPM-SC").maybeSingle(),
        db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
        db.rpc("fn_resolver_pedido_por_ref_bling", { p_ref: pedido.id_externo }),
      ]);
      if (ie || pe || se || ce || re) throw ie ?? pe ?? se ?? ce ?? re;
      if (ref !== pedidoId) throw new Error("Código canônico da TRS não resolve para este pedido; nada foi criado.");
      if (!parceiro?.bling_id || String(parceiro.cnpj).replace(/\D/g, "") !== CNPJ_MATRIZ) throw new Error("Destinatário da TRS não é a matriz Fetely ou não possui contato no Bling.");
      if (!sc?.loja_bling_id || !cfg?.access_token) throw new Error("Filial SC sem loja configurada ou Bling não conectado.");
      if (!nat || !itens?.length) throw new Error("Transferência sem natureza ou itens.");
      const resolvidos = [];
      for (const item of itens) {
        const produto = await resolverProdutoBling(db, item.sku);
        if (!produto.ok || !produto.bling_id) throw new Error(`Produto ${item.sku}: ${produto.motivo ?? "sem vínculo ativo no Bling"}`);
        resolvidos.push({ sku: produto.sku ?? item.sku, descricao: item.descricao ?? item.sku, quantidade: Number(item.quantidade), valor: Number(item.valor_unitario), produtoId: Number(produto.bling_id) });
      }
      const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
      const rascunho = await gerarTrs({ codigo: pedido.id_externo, naturezaId: Number(nat.bling_natureza_id), lojaId: Number(sc.loja_bling_id), contato: { id: Number(parceiro.bling_id), numeroDocumento: CNPJ_MATRIZ }, itens: resolvidos }, anterior?.status === "erro" || anterior?.status === "gerando", { bling, registrar, evento });
      // Falhas de transmissão nunca passam pelo catch de geração (que limparia a reserva).
      try { return json(dim?.transmite_automatico === true ? await transmitir({ ...rascunho, erro: null }) : rascunho); }
      catch (e) { return json({ ok: false, erro: msg(e) }, 502); }
    } catch (e) {
      // Preparação também registra falha; preservar eventual id já confirmado por gerarTrs.
      const { error } = await db.from("trs_nf_direta").update({ status: "erro", erro: msg(e), tentativas, atualizado_em: new Date().toISOString() }).eq("pedido_id", pedidoId);
      return json({ ok: false, erro: `${msg(e)}${error ? ` · Falha ao registrar: ${error.message}` : ""}` }, 502);
    }
  } catch (e) { return json({ ok: false, erro: msg(e) }, 500); }
});