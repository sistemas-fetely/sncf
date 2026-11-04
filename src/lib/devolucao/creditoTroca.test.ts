import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("troca fora da trava crédito-só-sobre-o-pago (reversão)", () => {
  const pasta = resolve(process.cwd(), "drizzle/migrations");
  const nome = readdirSync(pasta).find(n => n.endsWith("_devolucao_troca_fora_da_trava_credito.sql"));
  if (!nome) throw new Error("Migração de reversão da trava de troca não encontrada");
  const sql = readFileSync(resolve(pasta, nome), "utf8");

  it("criação volta a travar só haver e reembolso; troca fica liberada", () => {
    expect(sql).toContain("'public.registrar_devolucao_parcial(uuid,numeric,text,text,text,uuid,date,text,jsonb,text)'::regprocedure");
    expect(sql).toContain("v_nova := replace(v_atual, 'IF p_desfecho IN (''haver'',''reembolso'',''troca'') THEN', 'IF p_desfecho IN (''haver'',''reembolso'') THEN')");
  });

  it("decisão B2B volta a travar só haver e reembolso; troca fica liberada", () => {
    expect(sql).toContain("'public.decidir_desfecho_devolucao(uuid,text,text,uuid,date)'::regprocedure");
    expect(sql).toContain("v_nova := replace(v_atual, 'if p_desfecho in (''haver'',''reembolso'',''troca'') and d.canal = ''b2b''', 'if p_desfecho in (''haver'',''reembolso'') and d.canal = ''b2b''')");
  });
});
