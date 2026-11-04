// Opt-in against an authorized session; asserts real accounting rules, never UI copy.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const token = process.env.TEST_ACCESS_TOKEN;
const url = process.env.TEST_BACKEND_URL;
const key = process.env.TEST_PUBLIC_KEY;
const parceiro = "6f8369d7-e826-4ba0-8eff-3ebb1abd1e0f";
const enabled = Boolean(token && url && key);

describe.skipIf(!enabled)("Casa 22 — DRE real de outubro", () => {
  const db = createClient(url ?? "http://localhost", key ?? "not-configured", {
    global: { headers: { Authorization: `Bearer ${token ?? ""}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function lancamentos() {
    const r = await db.from("venda_fora_lancamento_mes").select("tipo,cpr_id,valor")
      .eq("parceiro_id", parceiro).eq("competencia", "2026-10-01").order("tipo");
    if (r.error) throw r.error;
    return r.data;
  }
  it("MDR de R$20,23 entra uma única vez na 2.4", async () => {
    const r = await db.from("vw_dre_mensal").select("codigo,valor").eq("mes", "2026-10-01").eq("codigo", "2.4").single();
    if (r.error) throw r.error;
    expect(Number(r.data.valor)).toBe(818.96);
    expect((await lancamentos()).find(l => l.tipo === "mdr")?.valor).toBe(20.23);
  });
  it("aluguel R$219,14 na 9.2, por competência e ligado à CPR", async () => {
    const lm = (await lancamentos()).find(l => l.tipo === "aluguel");
    expect(lm).toBeDefined();
    const r = await db.from("despesas").select("valor,data_competencia,origem_porta").eq("venda_fora_cpr_id", lm?.cpr_id ?? "").single();
    if (r.error) throw r.error;
    expect(r.data).toMatchObject({ valor: 219.14, data_competencia: "2026-10-01", origem_porta: "venda_fora" });
    const linha = await db.from("vw_dre_mensal").select("valor").eq("mes", "2026-10-01").eq("codigo", "9.2").single();
    if (linha.error) throw linha.error;
    expect(Number(linha.data.valor)).toBe(219.14);
  });
  it("comissão R$87,62 na 7.3", async () => {
    const r = await db.from("vw_dre_mensal").select("valor").eq("mes", "2026-10-01").eq("codigo", "7.3").single();
    if (r.error) throw r.error;
    expect(Number(r.data.valor)).toBe(87.62);
  });
  it("reexecução igual preserva CPRs e mantém somente duas despesas", async () => {
    const before = await lancamentos();
    const r = await db.rpc("fn_venda_fora_lancamentos_mes", { p_parceiro_id: parceiro, p_competencia: "2026-10-01", p_dry_run: false });
    if (r.error) throw r.error;
    expect(r.data.lancamentos.map((l: { tipo: string; acao: string }) => [l.tipo,l.acao])).toEqual([
      ["aluguel","igual"],["comissao_plataforma","igual"],["mdr","igual"],
    ]);
    expect(await lancamentos()).toEqual(before);
    const d = await db.from("despesas").select("id,valor").in("venda_fora_cpr_id", before.map(l => l.cpr_id));
    if (d.error) throw d.error;
    expect(d.data).toHaveLength(2);
    expect(d.data.map(l => Number(l.valor)).sort((a,b) => a-b)).toEqual([87.62,219.14]);
  });
});