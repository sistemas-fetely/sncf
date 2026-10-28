// Edge Function: nf-danfe-etiqueta (MESA-SP-DANFE-ETIQUETA, 28/10/2026)
// Lê no SERVIDOR o XML da NF autorizada mais recente do pedido (mesma regra da
// fn_mesa_sp_dados_impressao) e devolve os campos do DANFE Simplificado – Etiqueta
// (Ajuste SINIEF 07/05 cl. 9ª §15/§15-A; NT 2020.004). O navegador nunca busca o XML.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolverLinkPdfFresco, validarXmlNf, NfAnexoError } from "../_shared/bling/nf-anexo.ts";
import { exigirPorta, NaoAutorizado } from "../_shared/autorizacao.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (status: number, msg: string) => {
  console.error(`[nf-danfe-etiqueta] ${status} ${msg}`);
  return json(status, { error: msg });
};

/** Conteúdo do primeiro <tag> dentro de `xml` (ignora prefixo de namespace). */
function tag(xml: string | null, nome: string): string | null {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1].trim() : null;
}
const txt = (xml: string | null, nome: string) => {
  const v = tag(xml, nome);
  return v == null ? null : v.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() || null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Use POST.");
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return err(401, "Não autorizado: token ausente.");
    const { data: u, error: uErr } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u?.user) return err(401, "Não autorizado: sessão inválida.");
    try {
      await exigirPorta(sb, u.user.id, { slugs: ["acao.mesa_baixar_nf"], tabelas: ["nfs_emitidas"] }, "imprimir a DANFE etiqueta");
    } catch (e) {
      if (e instanceof NaoAutorizado) return err(e.status, e.message);
      throw e;
    }

    const body = await req.json().catch(() => ({}));
    const pedidoId = typeof body?.pedido_id === "string" ? body.pedido_id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return err(400, "pedido_id inválido.");

    const { data: nf, error: nfErr } = await sb
      .from("nfs_emitidas")
      .select("id, bling_id, numero, serie, pdf_url, xml_url, chave_acesso")
      .eq("pedido_venda_id", pedidoId)
      .eq("situacao", "autorizada")
      .order("autorizada_em", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (nfErr) return err(500, `Falha ao carregar a NF: ${nfErr.message}`);
    if (!nf) return err(404, "Pedido sem NF autorizada.");

    let xml: string;
    try {
      const r = await resolverLinkPdfFresco(sb, null, nf as any);
      if (!r.xml) return err(502, `O Bling não retornou o XML da NF ${nf.numero}.`);
      if (r.xml.startsWith("http")) {
        const resp = await fetch(r.xml);
        if (!resp.ok) return err(502, `Falha ao baixar o XML da NF ${nf.numero}: HTTP ${resp.status}`);
        xml = validarXmlNf(await resp.text(), { nf_id: nf.id });
      } else xml = validarXmlNf(r.xml, { nf_id: nf.id });
    } catch (e) {
      if (e instanceof NfAnexoError) return err(e.status, e.message);
      throw e;
    }

    const ide = tag(xml, "ide"), emit = tag(xml, "emit"), dest = tag(xml, "dest");
    const infProt = tag(xml, "infProt"), total = tag(xml, "ICMSTot");
    const chave = (txt(infProt, "chNFe") ?? xml.match(/Id="NFe(\d{44})"/)?.[1] ?? nf.chave_acesso ?? "").replace(/\D/g, "");
    const nProt = txt(infProt, "nProt");
    if (chave.length !== 44) return err(422, `Chave de acesso inválida no XML da NF ${nf.numero}.`);
    if (!nProt) return err(422, `XML da NF ${nf.numero} sem protocolo de autorização (protNFe).`);

    return json(200, {
      ok: true,
      nf_id: nf.id,
      chave_acesso: chave,
      protocolo: nProt,
      protocolo_data: txt(infProt, "dhRecbto"),
      tipo_operacao: txt(ide, "tpNF"), // 0 entrada / 1 saída
      tipo_emissao: txt(ide, "tpEmis"), // 1 = normal; ≠1 = contingência
      numero: txt(ide, "nNF"),
      serie: txt(ide, "serie"),
      data_emissao: txt(ide, "dhEmi") ?? txt(ide, "dEmi"),
      emitente: {
        nome: txt(emit, "xNome"),
        cnpj: txt(emit, "CNPJ") ?? txt(emit, "CPF"),
        ie: txt(emit, "IE"),
        uf: txt(tag(emit, "enderEmit"), "UF"),
      },
      destinatario: {
        nome: txt(dest, "xNome"),
        documento: txt(dest, "CNPJ") ?? txt(dest, "CPF") ?? txt(dest, "idEstrangeiro"),
        ie: txt(dest, "IE"),
        uf: txt(tag(dest, "enderDest"), "UF"),
      },
      valor_total: txt(total, "vNF"),
    });
  } catch (e) {
    return err(500, (e as Error).message || String(e));
  }
});
