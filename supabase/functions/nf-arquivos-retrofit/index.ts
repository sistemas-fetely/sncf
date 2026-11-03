// Copia XML/PDF das NFs de saída de uma competência para o Storage `contabil`.
// Processa em lotes (padrão 15) só NFs autorizadas/canceladas ainda sem arquivo;
// o front chama de novo enquanto `restantes > 0`. Erro de uma NF fica gravado
// em arquivos_erro e não para o lote.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cachearNfSaida, type NfCacheRow } from "../_shared/nf-cache-storage.ts";

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

    const base = () => admin.from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url, data_emissao, situacao", { count: "exact" })
      .gte("data_emissao", ini).lt("data_emissao", fim)
      .in("situacao", ["autorizada", "cancelada"])
      .is("xml_storage_path", null);
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
    let ok = 0;
    for (const nf of rows) {
      try {
        await cachearNfSaida(admin, nf);
        ok++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        erros.push({ numero: nf.numero, erro: msg });
        await admin.from("nfs_emitidas").update({ arquivos_erro: msg.slice(0, 1000) }).eq("id", nf.id);
      }
    }
    const { count: restantes } = await admin.from("nfs_emitidas").select("id", { count: "exact", head: true })
      .gte("data_emissao", ini).lt("data_emissao", fim).in("situacao", ["autorizada", "cancelada"])
      .is("xml_storage_path", null).is("arquivos_erro", null);
    return json({ ok: true, processadas: rows.length, guardadas: ok, erros, pendentes_antes: count, restantes });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
