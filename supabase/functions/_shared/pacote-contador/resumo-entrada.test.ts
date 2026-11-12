import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { gerarResumoEntrada, pdfResumoEntrada } from "./resumo-entrada.ts";
const assert = (v: boolean, m: string) => { if (!v) throw new Error(m); };
Deno.test("resumo de entrada: três tentativas, PDF no contabil e stage atualizado", async () => {
  const path = Deno.env.get("CTE_XML_TEST_PATH") ?? new URL("../fixtures/cte-real-anonimizado.xml", import.meta.url);
  const xml = await Deno.readTextFile(path);
  let attempts = 0; let upload = ""; let patch: Record<string, unknown> = {}; let id = "";
  const fake = {
    storage: { from: (bucket: string) => { assert(bucket === "contabil", "bucket errado"); return {
      download: async () => { attempts++; return attempts < 3 ? { data: null, error: { message: "temporário" } } : { data: new Blob([xml]), error: null }; },
      upload: async (p: string, bytes: Uint8Array, options: { upsert: boolean }) => { upload = p; assert(options.upsert && bytes.length > 500, "upload inválido"); return { error: null }; },
    }; } },
    from: (table: string) => { assert(table === "nfs_stage", "tabela errada"); return { update: (p: Record<string, unknown>) => { patch = p; return { eq: async (key: string, value: string) => { assert(key === "id", "chave errada"); id = value; return { error: null }; } }; } }; },
  } as unknown as SupabaseClient;
  const result = await gerarResumoEntrada(fake, { id: "nota", tipo_documento: "cte", xml_storage_path: "entrada/cte.xml" });
  assert(attempts === 3 && upload === "entrada/cte.pdf" && result === upload && id === "nota", "fluxo incorreto");
  assert(patch.resumo_pdf_storage_path === upload && patch.resumo_pdf_pendente === false && typeof patch.resumo_pdf_gerado_em === "string", "stage incorreto");
});
Deno.test("tipo desconhecido falha sem gravar", async () => {
  try { await pdfResumoEntrada("outro", "<xml/>"); throw new Error("aceitou tipo desconhecido"); }
  catch (e) { assert(e instanceof Error && e.message === "tipo sem resumo", "erro incorreto"); }
});
