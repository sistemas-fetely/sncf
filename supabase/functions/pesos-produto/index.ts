import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalizarHeader(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parsePeso(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  if (!s) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return isFinite(n) ? n : null;
}

async function autenticarUsuario(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return data.claims.sub as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const userId = await autenticarUsuario(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const contentType = req.headers.get("Content-Type") ?? "";

    // Ação MODELO — JSON in, XLSX out
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const acao = String(body.acao ?? "").trim();
      if (acao !== "modelo") return json({ error: "acao inválida" }, 400);
      const pedidoRef = body.pedido_ref ? String(body.pedido_ref).trim() : null;

      type Linha = { sku: string; nome: string };
      const linhas: Linha[] = [];

      if (pedidoRef) {
        const { data, error } = await svc
          .from("vw_xpm_cad_item")
          .select("codigo_material, nome_comercial, peso_sku")
          .eq("pedido_ref", pedidoRef);
        if (error) throw new Error(error.message);
        const seen = new Set<string>();
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const sku = String(r.codigo_material ?? "").trim();
          const peso = Number(r.peso_sku ?? 0);
          if (!sku || seen.has(sku)) continue;
          if (peso && peso > 0) continue;
          seen.add(sku);
          linhas.push({ sku, nome: String(r.nome_comercial ?? "").trim() });
        }
      } else {
        const { data, error } = await svc
          .from("sncf_produtos")
          .select("sku, nome_comercial, peso_g")
          .or("peso_g.is.null,peso_g.eq.0");
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const sku = String(r.sku ?? "").trim();
          if (!sku) continue;
          linhas.push({ sku, nome: String(r.nome_comercial ?? "").trim() });
        }
      }

      linhas.sort((a, b) => a.sku.localeCompare(b.sku));

      const aoa: Array<Array<string | number>> = [
        ["SKU", "Nome", "Peso (g)"],
        ...linhas.map((l) => [l.sku, l.nome, ""] as Array<string | number>),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 18 }, { wch: 50 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pesos");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const filename = `Pesos_${pedidoRef ?? "catalogo"}.xlsx`;
      return new Response(buf, {
        headers: {
          ...cors,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Ação IMPORTAR — multipart in, JSON out
    const form = await req.formData();
    const acao = String(form.get("acao") ?? "").trim();
    if (acao !== "importar") return json({ error: "acao inválida" }, 400);
    const file = form.get("file") as File | null;
    if (!file) return json({ error: "Arquivo .xlsx obrigatório" }, 400);
    const confirmar = String(form.get("confirmar") ?? "false") === "true";
    const permitirSobrescrita =
      String(form.get("permitir_sobrescrita") ?? "false") === "true";

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });
    const nomeAba =
      wb.SheetNames.find((n) => n.trim().toLowerCase() === "pesos") ??
      wb.SheetNames[0];
    if (!nomeAba) return json({ error: "Planilha vazia" }, 400);
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (matriz.length === 0) return json({ error: "Planilha vazia" }, 400);

    const headers = (matriz[0] as unknown[]).map(normalizarHeader);
    const idxSku = headers.findIndex((h) => h === "sku");
    const idxNome = headers.findIndex((h) => h === "nome");
    const idxPeso = headers.findIndex(
      (h) => h === "peso (g)" || h === "peso g" || h === "peso" || h === "peso_g",
    );
    const faltando: string[] = [];
    if (idxSku < 0) faltando.push("SKU");
    if (idxNome < 0) faltando.push("Nome");
    if (idxPeso < 0) faltando.push("Peso (g)");
    if (faltando.length) {
      return json(
        { error: `Coluna obrigatória ausente: ${faltando.join(", ")}` },
        400,
      );
    }

    const rows: Array<{ sku: string; peso_g: number | null }> = [];
    for (let i = 1; i < matriz.length; i++) {
      const row = matriz[i] as unknown[];
      const sku = String(row[idxSku] ?? "").trim();
      if (!sku) continue;
      rows.push({ sku, peso_g: parsePeso(row[idxPeso]) });
    }

    const { data, error } = await svc.rpc("atualizar_peso_produto_lote", {
      p_rows: rows,
      p_confirmar: confirmar,
      p_permitir_sobrescrita: permitirSobrescrita,
    });
    if (error) throw new Error(error.message);
    return json(data);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
