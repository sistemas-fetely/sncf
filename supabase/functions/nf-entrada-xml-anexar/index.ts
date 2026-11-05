// Upload manual de XML de entrada (NF-e, CT-e, NFS-e): guarda o original no bucket
// `contabil` pelo mesmo helper da Qive (nfs/AAAA-MM/entrada/<chave>.xml) e marca
// nfs_stage.xml_storage_path. Nunca cria nem altera dados da nota: só anexa o
// arquivo onde o caminho está vazio. Resultado por chave:
//   anexado      → nota existia sem arquivo, arquivo guardado
//   ja_tinha     → nota já tinha arquivo, nada feito
//   nao_existe   → chave ainda não está em nfs_stage (o front cria a nota e chama de novo)
//   erro         → motivo real
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cachearNfEntradaXml } from "../_shared/nf-cache-storage.ts";
import { corsHeaders as cors } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Item = { chave: string; xml: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) throw new Error("Configuração da função indisponível");
    const admin = createClient(url, serviceKey);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: u, error: eu } = await userClient.auth.getUser();
    if (eu || !u?.user) return json({ ok: false, erro: "Sessão inválida" }, 401);
    const { data: pode, error: ep } = await userClient.rpc("usuario_tem_acao", { p_slug: "acao.nf_stage_operar" });
    if (ep) return json({ ok: false, erro: "Falha ao validar permissão: " + ep.message }, 500);
    if (!pode) return json({ ok: false, erro: "Sem permissão para operar o repositório de NFs" }, 403);

    const body = await req.json().catch(() => ({}));
    const itens = body?.itens as Item[];
    if (!Array.isArray(itens) || itens.length === 0 || itens.length > 25 ||
      !itens.every((i) => i && typeof i.chave === "string" && i.chave.trim().length >= 10 && i.chave.length <= 120 &&
        typeof i.xml === "string" && i.xml.length > 0 && i.xml.length < 5_000_000)) {
      return json({ ok: false, erro: "Envie de 1 a 25 itens {chave, xml}" }, 400);
    }

    const resultados: { chave: string; resultado: string; motivo?: string; path?: string }[] = [];
    for (const { chave: bruta, xml } of itens) {
      const chave = bruta.trim();
      try {
        const { data: rows, error } = await admin.from("nfs_stage")
          .select("id, xml_storage_path, nf_data_emissao").eq("nf_chave_acesso", chave);
        if (error) throw new Error(error.message);
        if (!rows || rows.length === 0) { resultados.push({ chave, resultado: "nao_existe" }); continue; }
        if (rows.every((r: any) => r.xml_storage_path)) { resultados.push({ chave, resultado: "ja_tinha" }); continue; }
        const emissao = rows.find((r: any) => r.nf_data_emissao)?.nf_data_emissao ?? null;
        const path = await cachearNfEntradaXml(admin, chave, emissao, xml);
        resultados.push({ chave, resultado: "anexado", path });
      } catch (e) {
        resultados.push({ chave, resultado: "erro", motivo: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, resultados });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
