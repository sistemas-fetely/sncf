import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const URL_SISCOMEX =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO";

const MINIMO_CODIGOS = 5000;
const LOTE = 1000;

// O Siscomex ja mudou a caixa dos campos entre versoes do arquivo; le por chave normalizada.
function campo(linha: Record<string, unknown>, ...nomes: string[]): string | null {
  const mapa = new Map<string, unknown>();
  for (const [k, v] of Object.entries(linha)) mapa.set(k.toLowerCase().replace(/[_\s-]/g, ""), v);
  for (const n of nomes) {
    const v = mapa.get(n.toLowerCase().replace(/[_\s-]/g, ""));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function dataBr(valor: string | null): string | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const t0 = Date.now();
  let total_lido = 0;
  let gravados = 0;
  let removidos = 0;

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      throw new Error(`metodo ${req.method} nao aceito; use POST`);
    }

    const res = await fetch(URL_SISCOMEX, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`download Siscomex falhou: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    const bruto = await res.json();
    const lista: Record<string, unknown>[] =
      (Array.isArray(bruto?.Nomenclaturas) && bruto.Nomenclaturas) ||
      (Array.isArray(bruto?.nomenclaturas) && bruto.nomenclaturas) ||
      (Array.isArray(bruto) ? bruto : []);
    if (!Array.isArray(lista) || lista.length === 0) {
      throw new Error("JSON do Siscomex sem lista de Nomenclaturas");
    }
    total_lido = lista.length;

    const porCodigo = new Map<string, Record<string, unknown>>();
    for (const linha of lista) {
      const cru = campo(linha, "Codigo", "codigo", "co_ncm");
      if (!cru) continue;
      const digitos = cru.replace(/\D/g, "");
      if (digitos.length !== 8) continue;

      const codigo = `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}.${digitos.slice(6, 8)}`;
      const descricaoCrua = campo(linha, "Descricao", "descricao", "no_ncm_por") ?? "";
      const descricao = descricaoCrua.replace(/^(\s*-\s*)+/, "").trim();

      const tipo = campo(linha, "Tipo_Ato_Ini", "TipoAtoIni", "tipo_ato_ini");
      const numero = campo(linha, "Numero_Ato_Ini", "NumeroAtoIni", "numero_ato_ini");
      const ano = campo(linha, "Ano_Ato_Ini", "AnoAtoIni", "ano_ato_ini");
      const ato_legal =
        tipo || numero || ano
          ? [tipo, [numero, ano].filter(Boolean).join("/")].filter(Boolean).join(" ").trim() || null
          : null;

      porCodigo.set(codigo, {
        codigo,
        descricao: descricao || null,
        data_inicio: dataBr(campo(linha, "Data_Inicio", "DataInicio", "data_inicio")),
        data_fim: dataBr(campo(linha, "Data_Fim", "DataFim", "data_fim")),
        ato_legal,
        atualizado_em: new Date().toISOString(),
      });
    }

    const registros = [...porCodigo.values()];
    if (registros.length < MINIMO_CODIGOS) {
      throw new Error(
        `carga suspeita: ${registros.length} codigos de 8 digitos (minimo ${MINIMO_CODIGOS}); nada foi gravado`,
      );
    }

    for (let i = 0; i < registros.length; i += LOTE) {
      const lote = registros.slice(i, i + LOTE);
      const { error } = await sb.from("ncm_oficial").upsert(lote, { onConflict: "codigo" });
      if (error) throw new Error(`upsert lote ${i / LOTE + 1}: ${error.message}`);
      gravados += lote.length;
    }

    // Remove os codigos que sairam da nomenclatura (le em paginas: PostgREST corta em 1.000).
    const existentes: string[] = [];
    for (let de = 0; ; de += LOTE) {
      const { data, error } = await sb
        .from("ncm_oficial")
        .select("codigo")
        .order("codigo", { ascending: true })
        .range(de, de + LOTE - 1);
      if (error) throw new Error(`leitura de codigos existentes: ${error.message}`);
      existentes.push(...(data ?? []).map((r: { codigo: string }) => r.codigo));
      if (!data || data.length < LOTE) break;
    }

    const aRemover = existentes.filter((c) => !porCodigo.has(c));
    for (let i = 0; i < aRemover.length; i += LOTE) {
      const lote = aRemover.slice(i, i + LOTE);
      const { error } = await sb.from("ncm_oficial").delete().in("codigo", lote);
      if (error) throw new Error(`remocao de codigos fora da carga: ${error.message}`);
      removidos += lote.length;
    }

    const { error: eLog } = await sb.from("integracoes_sync_log").insert({
      sistema: "siscomex",
      tipo: "ncm",
      status: "sucesso",
      registros_atualizados: gravados,
      duracao_ms: Date.now() - t0,
      detalhes: { total_lido, gravados, removidos },
    });
    if (eLog) throw new Error(`log sync ncm: ${eLog.message}`);

    return new Response(JSON.stringify({ ok: true, total_lido, gravados, removidos }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const { error: eLog } = await sb.from("integracoes_sync_log").insert({
      sistema: "siscomex",
      tipo: "ncm",
      status: "erro",
      registros_erro: 1,
      duracao_ms: Date.now() - t0,
      detalhes: { erro: msg, total_lido, gravados, removidos },
    });
    if (eLog) console.error("falha ao logar erro do sync ncm:", eLog.message);
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
