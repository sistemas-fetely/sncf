// Copia XML/PDF das NFs de saída de uma competência para o Storage `contabil`.
// Processa em lotes (padrão 15) só NFs autorizadas/canceladas ainda sem arquivo;
// o front chama de novo enquanto `restantes > 0`. Erro de uma NF fica gravado
// em arquivos_erro e não para o lote.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cachearNfSaida, cachearNfEntradaXml, type NfCacheRow } from "../_shared/nf-cache-storage.ts";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: eu } = await userClient.auth.getUser();
    if (eu || !u?.user) return json({ ok: false, erro: "Sessão inválida" }, 401);
    const { data: pode, error: ep } = await userClient.rpc("pode_ler_tabela", { p_tabela: "remessas_contador" });
    if (ep) return json({ ok: false, erro: "Falha ao validar permissão: " + ep.message }, 500);
    if (!pode) return json({ ok: false, erro: "Sem permissão para o pacote do contador" }, 403);

    const body = await req.json().catch(() => ({}));
    const comp = String(body.competencia ?? "");
    if (!/^\d{4}-\d{2}$/.test(comp)) return json({ ok: false, erro: "Competência inválida (AAAA-MM)" }, 400);
    const lote = Math.min(Math.max(Number(body.lote) || 15, 1), 40);
    const [a, m] = comp.split("-").map(Number);
    const ini = `${comp}-01`;
    const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);

    if (body.tipo === "entrada_bling") return json(await retrofitEntradaBling(admin, ini, fim));

    const base = () => admin.from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url, data_emissao, situacao", { count: "exact" })
      .gte("data_emissao", ini).lt("data_emissao", fim)
      .in("situacao", ["autorizada", "cancelada"])
      .or("xml_storage_path.is.null,pdf_storage_path.is.null");
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
        await admin.from("nfs_emitidas").update({ arquivos_erro: msg.slice(0, 1000) }).eq("id", nf.id);
      }
    }
    const { count: restantes } = await admin.from("nfs_emitidas").select("id", { count: "exact", head: true })
      .gte("data_emissao", ini).lt("data_emissao", fim).in("situacao", ["autorizada", "cancelada"])
      .or("xml_storage_path.is.null,pdf_storage_path.is.null").is("arquivos_erro", null);
    return json({ ok: true, processadas: rows.length, guardadas: ok, pdf_bling: pdfBling, pdf_gerado_xml: pdfGerado, erros, pendentes_antes: count, restantes });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});

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
  for (const r of falta.values()) erros.push({ numero: r.nf_numero, erro: "NF não encontrada na lista de entradas do Bling no mês" });
  return { ok: true, tipo: "entrada_bling", pendentes_antes: total, guardadas, erros };
}
