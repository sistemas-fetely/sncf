// Read-only regression against an authorized session, using the real numbering RPC.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resumirNumeracao, type LinhaNumeracao } from "./numeracaoNf";

const token = process.env.TEST_ACCESS_TOKEN;
const url = process.env.TEST_BACKEND_URL;
const key = process.env.TEST_PUBLIC_KEY;
const enabled = Boolean(token && url && key);

describe.skipIf(!enabled)("Numeração compartilhada — outubro de 2026", () => {
  const db = createClient(url ?? "http://localhost", key ?? "not-configured", {
    global: { headers: { Authorization: `Bearer ${token ?? ""}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function numeracao(): Promise<LinhaNumeracao[]> {
    const r = await db.rpc("fn_contabil_nf_numeracao", { p_competencia: "2026-10-01" });
    if (r.error) throw r.error;
    return r.data ?? [];
  }
  it("NF 921 de entrada própria ocupa a série 1 do emitente 63591078000229", async () => {
    const stage = await db.from("nfs_stage").select("nf_chave_acesso,nf_data_emissao,fonte")
      .eq("nf_chave_acesso", "42261063591078000229550010000009211376088362");
    if (stage.error) throw stage.error;
    expect(stage.data?.length).toBeGreaterThan(0);
    expect(stage.data?.[0]).toMatchObject({ fonte: "bling_entrada", nf_data_emissao: "2026-10-27" });
    const linhas = (await numeracao()).filter(l => l.emitente_cnpj === "63591078000229" && l.serie === "1" && Number(l.numero) === 921);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ ocorrencia: "entrada_propria", data_emissao: "2026-10-27", prazo_inutilizacao: null, dentro_prazo: null });
    expect(resumirNumeracao(linhas).buracos).toBe(0);
    expect(resumirNumeracao(linhas).pendentesNoPrazo).toBe(0);
  });
  it("697 e 732 também ocupam a série compartilhada sem duplicação", async () => {
    const linhas = (await numeracao()).filter(l => l.emitente_cnpj === "63591078000229" && l.serie === "1" && [697, 732].includes(Number(l.numero)));
    expect(linhas.map(l => [Number(l.numero), l.ocorrencia])).toEqual([[697, "entrada_propria"], [732, "entrada_propria"]]);
  });
  it("restam somente os oito buracos indicados por emitente e série", async () => {
    const linhas = (await numeracao()).filter(l => l.ocorrencia === "buraco");
    expect(linhas.map(l => [l.emitente_cnpj, l.serie, Number(l.numero)])).toEqual([
      ...[43, 44, 55, 70].map(n => ["63591078000148", "1", n]),
      ...[669, 778, 792, 941].map(n => ["63591078000229", "1", n]),
    ]);
  });
});