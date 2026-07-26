import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function codCaixa(ean: string): string {
  if (!ean || ean.length < 13) return "";
  const base = "1" + ean.slice(0, 12);
  let s = 0;
  base.split("").reverse().forEach((c, i) => { s += parseInt(c) * (i % 2 === 0 ? 3 : 1); });
  return base + String((10 - (s % 10)) % 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { pedido_ref } = await req.json();
    if (!pedido_ref) return new Response(JSON.stringify({ error: "pedido_ref obrigatório" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.from("vw_xpm_cad_item").select("*").eq("pedido_ref", pedido_ref).order("codigo_material");
    if (error) throw new Error(error.message);
    const rows = (data || []).map((r: any) => ({
      "Codigo Material": r.codigo_material,
      "Categoria": r.categoria || "",
      "Descrição": r.descricao || r.descricao_reduzida || "",
      "Descrição Reduzida": r.descricao_reduzida || "",
      "Unid. med": r.unid_med || "UN",
      "Peso Liquido": r.peso_liquido,
      "codigoBarras": r.codigo_barras || "",
      "Cod. Caixa": codCaixa(r.codigo_barras || ""),
      "camada": "", "lastro": "",
      "classificacaoFiscalNCM": r.ncm || "",
      "qtdItemSKU": r.qtd_item_sku,
      "descricaoEmbalagem": r.descricao_embalagem || "",
      "NF": r.nf || "",
      "Cod. NF": r.cod_nf || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cad_item");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new Response(buf, { headers: { ...cors, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="XPM_Cad_item_${pedido_ref}.xlsx"` } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
