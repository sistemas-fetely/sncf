import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const num = (x: any) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };

const campos = ["file", "termo", "data_recebimento", "centro"];
const required = (form: FormData) => {
  for (const c of campos) {
    const v = form.get(c);
    if (!v || String(v).trim() === "") return c;
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const form = await req.formData();
    const missing = required(form);
    if (missing) {
      return new Response(
        JSON.stringify({ error: `${missing} é obrigatório` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const file = form.get("file") as File;
    const termo = String(form.get("termo")).trim();
    const dataRecebimento = String(form.get("data_recebimento")).trim();
    const centro = String(form.get("centro")).trim();

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    let rows: any[] = [];
    for (const sn of wb.SheetNames) {
      const json = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 }) as any[][];
      const hIdx = json.findIndex((r) => r.some((c: any) => String(c).toUpperCase().includes("DECLARADO")));
      if (hIdx < 0) continue;
      const H = json[hIdx].map((c: any) => String(c).toUpperCase().trim());
      const col = (name: string) => H.findIndex((h) => h.includes(name));
      const ci = { doc: col("DOCUMENTO"), item: col("ITEM"), dec: col("DECLARADO"), rec: col("RECEBIDO"), fal: col("FALTA"), exc: col("EXCESSO"), nc: col("CONFORME") };
      for (let i = hIdx + 1; i < json.length; i++) {
        const r = json[i]; const sku = String(r[ci.item] ?? "").trim();
        if (!/^[A-Z]{3,}/.test(sku)) continue;
        rows.push({ nf: String(r[ci.doc] ?? "").split(".")[0], sku, declarado: num(r[ci.dec]), recebido: num(r[ci.rec]), falta: num(r[ci.fal]), excesso: num(r[ci.exc]), nao_conforme: num(r[ci.nc]) });
      }
      if (rows.length) break;
    }
    if (!rows.length) throw new Error("Nenhuma linha de conferência (DECLARADO/RECEBIDO) encontrada no arquivo.");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.rpc("ingerir_termo_conferencia", {
      p_termo: termo,
      p_rows: rows,
      p_data_recebimento: dataRecebimento,
      p_centro_codigo: centro,
    });
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
