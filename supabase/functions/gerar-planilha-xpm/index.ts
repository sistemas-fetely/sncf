import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { pedido_ref, fase } = await req.json();
    if (!pedido_ref) return new Response(JSON.stringify({ error: "pedido_ref obrigatório" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let q = supabase.from("vw_xpm_cad_item").select("*").eq("pedido_ref", pedido_ref).order("codigo_material");
    if (fase === 1 || fase === 2) q = q.eq("fase", fase);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const tipoRow = ["Caracter","Caracter","Caracter","Caracter","Caracter","Numerico","Caracter","","","Numerico","Numerico","Numerico","","","Numerico","Caracter","Numerico","Numerico","Numerico","Numerico","Numerico","Numerico","Numerico"];
    const unidRow = ["","","","","","Kg","","","","","","","","","","","Kg","Metro","Metro","Metro","","",""];
    const headerRow = ["Codigo Material","Categoria","Descrição","Descrição Reduzida","Unid. med","Peso Liquido","codigoBarras","Cod. Caixa","NF","Cod. NF","lastro","classificacaoFiscalNCM","Quantida de Caixas Master","Quantida de Caixas Inner","qtdItemSKU","descricaoEmbalagem","pesoSku","alturaSKU","larguraSKU","comprimentoSKU","Lote","Validade","Serie"];

    const dataRows = (data || []).map((r: any) => [
      r.codigo_material,
      r.categoria ?? "",
      r.descricao ?? "",
      r.descricao_reduzida ?? "",
      r.unid_med,
      "",
      r.codigo_barras ?? "",
      r.cod_caixa ?? "",
      r.nf ?? "",
      r.cod_nf ?? "",
      "",
      r.ncm ?? "",
      r.qtd_caixas_master,
      r.qtd_caixas_inner,
      r.qtd_item_sku,
      r.descricao_embalagem ?? "",
      r.peso_sku,
      r.altura_m,
      r.largura_m,
      r.comprimento_m,
      r.lote ?? "",
      "",
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([tipoRow, unidRow, headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cad_item");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new Response(buf, { headers: { ...cors, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="XPM_Cad_item_${pedido_ref}.xlsx"` } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
