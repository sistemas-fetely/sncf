// Copia XML/PDF das NFs de saída de uma competência para o Storage `contabil`.
// Processa em lotes (padrão 15) só NFs autorizadas/canceladas ainda sem arquivo;
// o front chama de novo enquanto `restantes > 0`. Erro de uma NF fica gravado
// em arquivos_erro e não para o lote.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cachearNfSaida, cachearNfEntradaXml, type NfCacheRow } from "../_shared/nf-cache-storage.ts";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { gerarResumoNfsePdf } from "../_shared/nfse-resumo-pdf.ts";
import { corsHeaders as cors } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Configuração da função indisponível");
    const admin = createClient(url, serviceKey);
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: eu } = await userClient.auth.getUser();
    if (eu || !u?.user) return json({ ok: false, erro: "Sessão inválida" }, 401);
    const body = await req.json().catch(() => ({}));
    const importacao = body.tipo === "saida_sublimity" && body.chaves !== undefined;
    if (body.chaves !== undefined && (!importacao || !Array.isArray(body.chaves) || !body.chaves.length || body.chaves.length > 40 || !body.chaves.every((c: unknown) => typeof c === "string" && /^\d{44}$/.test(c)))) {
      return json({ ok: false, erro: "Chaves inválidas (1 a 40 chaves de NF-e, somente saída Sublimity)" }, 400);
    }
    const { data: pode, error: ep } = importacao
      ? await userClient.rpc("usuario_tem_acao", { p_slug: "acao.consignado_ciclo_fechar" })
      : await userClient.rpc("pode_ler_tabela", { p_tabela: "remessas_contador" });
    if (ep) return json({ ok: false, erro: "Falha ao validar permissão: " + ep.message }, 500);
    if (!pode) return json({ ok: false, erro: "Sem permissão para o pacote do contador" }, 403);

    const comp = String(body.competencia ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) return json({ ok: false, erro: "Competência inválida (AAAA-MM)" }, 400);
    const lote = Math.min(Math.max(Number(body.lote) || 15, 1), 40);
    const [a, m] = comp.split("-").map(Number);
    const ini = `${comp}-01`;
    const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);

    if (body.tipo === "entrada_bling") return json(await retrofitEntradaBling(admin, ini, fim));
    if (body.tipo === "entrada_qive") return json(await retrofitEntradaQive(admin, ini, fim, body.incluir_falhas === true));
    if (body.tipo === "nfse_resumo") return json(await retrofitNfseResumo(admin, ini, fim, body.refazer === true));

    const base = () => {
      let query = admin.from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url, data_emissao, situacao, origem, xml_storage_path, pdf_storage_path, pdf_origem", { count: "exact" })
      .gte("data_emissao", ini).lt("data_emissao", fim)
      .in("situacao", ["autorizada", "cancelada"])
      .or("xml_storage_path.is.null,pdf_storage_path.is.null");
      if (body.tipo === "saida_sublimity") query = query.eq("origem", "sublimity").eq("serie", "2");
      if (importacao) query = query.in("chave_acesso", body.chaves);
      return query;
    };
    // Primeiro as nunca tentadas; as que já falharam ficam no fim.
    const { data, error, count } = await base().is("arquivos_erro", null).limit(lote);
    if (error) return json({ ok: false, erro: error.message }, 500);
    let rows = (data ?? []) as NfCacheRow[];
    if (rows.length === 0 && body.incluir_falhas) {
      const r2 = await base().not("arquivos_erro", "is", null).limit(lote);
      if (r2.error) return json({ ok: false, erro: r2.error.message }, 500);
      rows = (r2.data ?? []) as NfCacheRow[];
    }

    const erros: { numero: string | null; erro: string }[] = [];
    let ok = 0; let pdfBling = 0; let pdfGerado = 0;
    for (const nf of rows) {
      try {
        const r = await cachearNfSaida(admin, nf);
        ok++;
        if (r.pdfOrigem === "bling") pdfBling++;
        if (r.pdfOrigem === "gerado_xml") pdfGerado++;
        if (r.erroPdf) erros.push({ numero: nf.numero, erro: r.erroPdf });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        erros.push({ numero: nf.numero, erro: msg });
        const { error: erroRegistro } = await admin.from("nfs_emitidas").update({ arquivos_erro: msg.slice(0, 1000) }).eq("id", nf.id);
        if (erroRegistro) throw new Error(`NF ${nf.numero}: falha ao registrar erro: ${erroRegistro.message}`);
      }
    }
    const { count: restantes, error: erroRestantes } = await base().is("arquivos_erro", null);
    if (erroRestantes) throw new Error(erroRestantes.message);
    return json({ ok: true, processadas: rows.length, guardadas: ok, pdf_bling: pdfBling, pdf_gerado_xml: pdfGerado, erros, pendentes_antes: count, restantes });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// NFS-e tomadas: gera o Resumo NFS-e (PDF) do XML guardado e grava resumo_pdf_storage_path.
// deno-lint-ignore no-explicit-any
async function retrofitNfseResumo(admin: any, ini: string, fim: string, refazer: boolean) {
  let q = admin.from("nfs_stage").select("id, nf_numero, nf_chave_acesso, nf_data_emissao, xml_storage_path")
    .eq("tipo_documento", "nfse").not("xml_storage_path", "is", null).gte("nf_data_emissao", ini).lt("nf_data_emissao", fim)
    .not("status", "in", "(descartada,duplicada)");
  if (!refazer) q = q.is("resumo_pdf_storage_path", null);
  const { data, error } = await q.limit(60);
  if (error) return { ok: false, erro: error.message };
  const erros: { numero: string | null; erro: string }[] = [];
  let geradas = 0;
  for (const n of data ?? []) {
    try {
      let xml = "", ultimo = "";
      for (let t = 0; t < 3 && !xml; t++) {
        const { data: b, error: e } = await admin.storage.from("contabil").download(n.xml_storage_path);
        if (b && !e) xml = await b.text(); else { ultimo = e?.message ?? "vazio"; await new Promise((r) => setTimeout(r, 400 * (t + 1))); }
      }
      if (!xml) throw new Error(`XML não lido: ${ultimo}`);
      const pdf = await gerarResumoNfsePdf(xml);
      const path = n.xml_storage_path.replace(/\.xml$/i, "") + ".pdf";
      const up = await admin.storage.from("contabil").upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`upload do PDF: ${up.error.message}`);
      const { error: eu } = await admin.from("nfs_stage").update({ resumo_pdf_storage_path: path, resumo_pdf_gerado_em: new Date().toISOString(), resumo_pdf_pendente: false }).eq("id", n.id);
      if (eu) throw new Error(eu.message);
      geradas++;
    } catch (e) { erros.push({ numero: n.nf_numero, erro: e instanceof Error ? e.message : String(e) }); }
  }
  const { count: restantes, error: er } = await admin.from("nfs_stage").select("id", { count: "exact", head: true })
    .eq("tipo_documento", "nfse").not("xml_storage_path", "is", null).is("resumo_pdf_storage_path", null)
    .gte("nf_data_emissao", ini).lt("nf_data_emissao", fim).not("status", "in", "(descartada,duplicada)");
  if (er) return { ok: false, erro: er.message };
  return { ok: true, tipo: "nfse_resumo", processadas: (data ?? []).length, geradas, erros, restantes };
}

// NFs de entrada do Bling (nfs_stage.fonte='bling_entrada') sem XML guardado: o stage
// não guarda o id do Bling, então lista as entradas do mês e casa pela chave.
// deno-lint-ignore no-explicit-any
async function retrofitEntradaBling(admin: any, ini: string, fim: string) {
  const { data: pend, error } = await admin.from("nfs_stage")
    .select("nf_chave_acesso, nf_numero, nf_data_emissao")
    .eq("fonte", "bling_entrada").is("xml_storage_path", null)
    .gte("nf_data_emissao", ini).lt("nf_data_emissao", fim);
  if (error) return { ok: false, erro: error.message };
  const falta = new Map<string, any>();
  for (const r of pend ?? []) if (r.nf_chave_acesso) falta.set(r.nf_chave_acesso, r);
  const total = falta.size;
  if (!total) return { ok: true, tipo: "entrada_bling", pendentes_antes: 0, guardadas: 0, erros: [] };
  const { data: cfg } = await admin.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (!cfg?.access_token) return { ok: false, erro: "Bling não conectado" };
  const client = makeBlingClient(admin, cfg, await ensureFreshToken(admin, cfg));
  const ultimo = new Date(Date.parse(`${fim}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const erros: { numero: string | null; erro: string }[] = [];
  let guardadas = 0;
  for (let pagina = 1; pagina <= 10 && falta.size; pagina++) {
    const lista: any = await client.get(`/nfe?tipo=0&limite=100&pagina=${pagina}&dataEmissaoInicial=${ini}&dataEmissaoFinal=${ultimo}`);
    const items = lista?.data ?? [];
    if (!items.length) break;
    for (const it of items) {
      const chave = it.chaveAcesso;
      let alvo = chave ? falta.get(chave) : null;
      let det: any = null;
      if (!alvo) {
        if (chave) continue;
        det = (await client.get(`/nfe/${it.id}`))?.data ?? {};
        alvo = falta.get(det.chaveAcesso); if (!alvo) continue;
      }
      try {
        det = det ?? (await client.get(`/nfe/${it.id}`))?.data ?? {};
        if (!det.xml) throw new Error("Bling não informou o link do XML");
        const r = await fetch(String(det.xml));
        const txt = await r.text();
        if (!r.ok) throw new Error(`download do XML falhou [${r.status}]: ${txt.slice(0, 150)}`);
        await cachearNfEntradaXml(admin, alvo.nf_chave_acesso, alvo.nf_data_emissao, txt);
        guardadas++;
      } catch (e) {
        erros.push({ numero: alvo.nf_numero, erro: e instanceof Error ? e.message : String(e) });
      }
      falta.delete(alvo.nf_chave_acesso);
    }
  }
  const reg = (chave: string, indisp: boolean, erro: string | null) => admin.from("nf_entrada_arquivo_tentativa").upsert({
    nf_chave_acesso: chave.replace(/\D/g, ""), fonte: "bling_entrada", indisponivel_na_origem: indisp, erro, tentado_em: new Date().toISOString() });
  // Sobra da lista do mês: procura pela chave em qualquer data/tipo antes de desistir.
  for (const r of [...falta.values()]) {
    let msg: string;
    try {
      const busca: any = await client.get(`/nfe?chaveAcesso=${r.nf_chave_acesso}`);
      const it = (busca?.data ?? [])[0];
      if (!it) { msg = "Bling não tem NF com esta chave (busca por chave de acesso vazia)"; await reg(r.nf_chave_acesso, true, msg); erros.push({ numero: r.nf_numero, erro: msg }); continue; }
      const det = (await client.get(`/nfe/${it.id}`))?.data ?? {};
      if (!det.xml) throw new Error(`Bling achou a NF (id ${it.id}, tipo ${det.tipo ?? it.tipo}, situação ${det.situacao ?? it.situacao}, emissão ${det.dataEmissao ?? "?"}) mas não informou link do XML`);
      const resp = await fetch(String(det.xml)); const txt = await resp.text();
      if (!resp.ok) throw new Error(`download do XML falhou [${resp.status}]: ${txt.slice(0, 150)}`);
      await cachearNfEntradaXml(admin, r.nf_chave_acesso, r.nf_data_emissao, txt);
      await reg(r.nf_chave_acesso, false, null); guardadas++;
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
      await reg(r.nf_chave_acesso, false, msg); erros.push({ numero: r.nf_numero, erro: msg });
    }
  }
  return { ok: true, tipo: "entrada_bling", pendentes_antes: total, guardadas, erros };
}

// NFs/CT-e de entrada da Qive (nfs_stage.fonte='qive') capturadas antes da cópia
// existir: busca o XML na Qive pela chave (mesma credencial do sync-qive-dfe),
// em lotes de 20 chaves com pausa, e guarda em nfs/<AAAA-MM>/entrada/<chave>.xml.
// O resultado de cada chave fica em nf_entrada_arquivo_tentativa (o manifesto lê).
// deno-lint-ignore no-explicit-any
async function retrofitEntradaQive(admin: any, ini: string, fim: string, incluirFalhas: boolean) {
  const t0 = Date.now();
  const { data: pend, error } = await admin.from("nfs_stage")
    .select("nf_chave_acesso, nf_numero, nf_data_emissao, tipo_documento")
    .eq("fonte", "qive").is("xml_storage_path", null).not("nf_chave_acesso", "is", null)
    .gte("nf_data_emissao", ini).lt("nf_data_emissao", fim);
  if (error) return { ok: false, erro: error.message };
  const porChave = new Map<string, any>();
  for (const r of pend ?? []) porChave.set(String(r.nf_chave_acesso).replace(/\D/g, ""), r);
  if (!incluirFalhas && porChave.size) {
    const { data: tent } = await admin.from("nf_entrada_arquivo_tentativa").select("nf_chave_acesso").in("nf_chave_acesso", [...porChave.keys()]);
    for (const t of tent ?? []) porChave.delete(t.nf_chave_acesso);
  }
  const total = porChave.size;
  if (!total) return { ok: true, tipo: "entrada_qive", processadas: 0, guardadas: 0, erros: [], restantes: 0 };

  const sec = async (n: string) => {
    const { data, error } = await admin.rpc("get_vault_secret", { p_name: n });
    if (error) throw new Error(`Falha ao ler secret ${n}: ${error.message}`);
    return typeof data === "string" ? data.trim() : "";
  };
  const headers = { "X-API-ID": await sec("qive_api_id_prod"), "X-API-KEY": await sec("qive_api_key_prod"), "X-Use-ApiGateway": "always", "Content-Type": "application/json" };
  if (!headers["X-API-ID"] || !headers["X-API-KEY"]) return { ok: false, erro: "Credenciais de produção da Qive ausentes no cofre" };

  const registrar = (chave: string, indisp: boolean, erro: string | null) =>
    admin.from("nf_entrada_arquivo_tentativa").upsert({ nf_chave_acesso: chave, fonte: "qive", indisponivel_na_origem: indisp, erro, tentado_em: new Date().toISOString() });
  const ehCte = (r: any, ch: string) => r.tipo_documento === "cte" || ch.slice(20, 22) === "57";
  const erros: { numero: string | null; tipo: string; erro: string }[] = [];
  let guardadas = 0; let processadas = 0;
  const chaves = [...porChave.keys()];
  for (let i = 0; i < chaves.length && Date.now() - t0 < 110_000; i += 20) {
    const bloco = chaves.slice(i, i + 20);
    for (const cte of [false, true]) {
      const alvo = bloco.filter((c) => ehCte(porChave.get(c), c) === cte);
      if (!alvo.length) continue;
      const qs = new URLSearchParams({ limit: "50" });
      for (const c of alvo) qs.append("access_key[]", c);
      const caminho = cte ? "v1/cte/taker" : "v1/nfe/received";
      let resp: Response | null = null;
      for (let t = 0; t < 4; t++) {
        resp = await fetch(`https://api.arquivei.com.br/${caminho}?${qs}`, { headers });
        if (resp.status !== 429) break;
        await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
      }
      const recebidos = new Map<string, string>();
      if (!resp!.ok) {
        const msg = `Qive recusou [${resp!.status}]: ${(await resp!.text()).slice(0, 200)}`;
        for (const c of alvo) { const r = porChave.get(c); erros.push({ numero: r.nf_numero, tipo: cte ? "cte" : "nfe", erro: msg }); await registrar(c, false, msg); processadas++; }
        continue;
      }
      const payload = await resp!.json();
      for (const d of payload?.data ?? []) if (d?.access_key && typeof d.xml === "string") recebidos.set(String(d.access_key), d.xml);
      for (const c of alvo) {
        const r = porChave.get(c); processadas++;
        const b64 = recebidos.get(c);
        if (!b64) {
          const msg = "Qive não devolveu o documento para esta chave";
          erros.push({ numero: r.nf_numero, tipo: cte ? "cte" : "nfe", erro: msg }); await registrar(c, true, msg); continue;
        }
        try {
          const xml = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
          await cachearNfEntradaXml(admin, r.nf_chave_acesso, r.nf_data_emissao, xml);
          await registrar(c, false, null); guardadas++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          erros.push({ numero: r.nf_numero, tipo: cte ? "cte" : "nfe", erro: msg }); await registrar(c, false, msg);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: true, tipo: "entrada_qive", pendentes_antes: total, processadas, guardadas, erros, restantes: total - processadas };
}
