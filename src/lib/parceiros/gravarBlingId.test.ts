import { describe, expect, it } from "vitest";
import { gravarBlingIdConfirmado } from "../../../supabase/functions/sync-contato-bling/gravar-bling-id";

type Resp = { data: unknown; error: { code?: string; message: string } | null };

function fakeSupabase(update: Resp, dono: Resp = { data: [], error: null }) {
  const chain = (resp: Resp) => {
    const c: Record<string, unknown> = {};
    for (const m of ["update", "eq", "neq", "select"]) c[m] = () => c;
    c.limit = () => Promise.resolve(resp);
    c.then = (res: (v: Resp) => unknown) => Promise.resolve(resp).then(res);
    return c;
  };
  return {
    from: () => ({
      update: () => chain(update),
      select: () => chain(dono),
    }),
  };
}

describe("gravarBlingIdConfirmado", () => {
  it("confirma quando a linha volta com o mesmo bling_id", async () => {
    const sb = fakeSupabase({ data: [{ id: "p1", bling_id: "18193608916" }], error: null });
    expect(await gravarBlingIdConfirmado(sb, "p1", "18193608916")).toEqual({ ok: true });
  });

  it("conflito no índice único identifica o outro parceiro e não é sucesso", async () => {
    const sb = fakeSupabase(
      { data: null, error: { code: "23505", message: "duplicate key ux_parceiros_bling_id" } },
      { data: [{ id: "p-antigo", razao_social: "GABRIELA MARKUS", cpf: "014.260.910-28", cnpj: null }], error: null },
    );
    const r = await gravarBlingIdConfirmado(sb, "p1", "18193608916");
    expect(r.ok).toBe(false);
    const falha = r as Extract<typeof r, { ok: false }>;
    {
      expect(falha.conflito).toEqual({ parceiro_id: "p-antigo", razao_social: "GABRIELA MARKUS", documento: "01426091028" });
      expect(falha.erro).toContain("p-antigo");
    }
  });

  it("nenhuma linha atualizada não é sucesso", async () => {
    const sb = fakeSupabase({ data: [], error: null });
    const r = await gravarBlingIdConfirmado(sb, "p1", "1");
    expect(r.ok).toBe(false);
  });

  it("erro qualquer do banco devolve a mensagem real", async () => {
    const sb = fakeSupabase({ data: null, error: { code: "42501", message: "permission denied" } });
    const r = await gravarBlingIdConfirmado(sb, "p1", "1");
    expect(r).toEqual({ ok: false, erro: "Falha ao gravar bling_id no SNCF: permission denied" });
  });
});
