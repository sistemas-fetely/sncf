import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conferirNfDev, decidirTransmissao, transmitirNfDev, ERRO_DIVERGENCIA, type NfDevLida } from "./transmitir-nf-dev.ts";

const nf = { situacao: 1, numero: "123", naturezaOperacao: { id: 77 }, valorNota: 100 };
function ctx(leituras: NfDevLida[], opts: { reserva?: boolean; falhaPost?: boolean } = {}) {
  let gets = 0, posts = 0; const reg: unknown[][] = [], env: unknown[][] = [];
  const deps = {
    bling: { get: async () => ({ data: leituras[Math.min(gets++, leituras.length - 1)] }), post: async (_p: string, _b: unknown, o?: { retry?: boolean }) => { posts++; assertEquals(o?.retry, false); if (opts.falhaPost) throw new Error("timeout"); return {}; } },
    reservar: async () => opts.reserva ?? true,
    registrar: async (...a: unknown[]) => { reg.push(a); }, gravarEnvio: async (...a: unknown[]) => { env.push(a); },
  };
  return { deps, reg, env, posts: () => posts };
}
const e = { blingNfeId: 9, naturezaId: 77, valorEsperado: 100, numero: null };

Deno.test("conferência: natureza e valor dentro de 0,02 batem", () => {
  assertEquals(conferirNfDev({ ...nf, valorNota: 100.02 }, 77, 100), null);
  assertEquals(conferirNfDev({ ...nf, valorNota: 100.03 }, 77, 100), ERRO_DIVERGENCIA);
  assertEquals(conferirNfDev({ ...nf, naturezaOperacao: { id: 1 } }, 77, 100), ERRO_DIVERGENCIA);
  assertEquals(conferirNfDev(nf, null, 100), ERRO_DIVERGENCIA);
});
Deno.test("decisão: autorizada, impedida, divergente, reservar", () => {
  assertEquals(decidirTransmissao({ ...nf, situacao: 5 }, 77, 100), "registrar_autorizada");
  assertEquals(decidirTransmissao({ ...nf, situacao: 4 }, 77, 100), "erro_impedida");
  assertEquals(decidirTransmissao({ ...nf, valorNota: 90 }, 77, 100), "erro_divergencia");
  assertEquals(decidirTransmissao(nf, 77, 100), "reservar");
});
Deno.test("já autorizada não envia e registra autorizada", async () => {
  const c = ctx([{ ...nf, situacao: 6, chaveAcesso: "K" }]); const r = await transmitirNfDev(e, c.deps);
  assertEquals(r.resultado, "autorizada"); assertEquals(c.posts(), 0); assertEquals(c.reg[0], ["autorizada", "123", null, "K"]);
});
Deno.test("divergência não envia e mantém rascunho com erro", async () => {
  const c = ctx([{ ...nf, valorNota: 50 }]); await transmitirNfDev(e, c.deps);
  assertEquals(c.posts(), 0); assertEquals(c.reg[0], ["rascunho", "123", ERRO_DIVERGENCIA, null]);
});
Deno.test("sem reserva não envia", async () => {
  const c = ctx([nf], { reserva: false }); const r = await transmitirNfDev(e, c.deps);
  assertEquals(r.resultado, "ja_reservado"); assertEquals(c.posts(), 0);
});
Deno.test("enviada e pendente fica aguardando SEFAZ", async () => {
  const c = ctx([nf, nf]); const r = await transmitirNfDev(e, c.deps);
  assertEquals(r.resultado, "aguardando"); assertEquals(c.posts(), 1); assertEquals(c.reg.length, 0);
});
Deno.test("enviada e autorizada registra", async () => {
  const c = ctx([nf, { ...nf, situacao: 5 }]); const r = await transmitirNfDev(e, c.deps); assertEquals(r.resultado, "autorizada");
});
Deno.test("erro no POST relê: autorizada vence; senão erro sem reenvio", async () => {
  const a = ctx([nf, { ...nf, situacao: 5 }], { falhaPost: true }); assertEquals((await transmitirNfDev(e, a.deps)).resultado, "autorizada");
  const b = ctx([nf, nf], { falhaPost: true }); const r = await transmitirNfDev(e, b.deps);
  assertEquals(r.resultado, "erro"); assertEquals(b.posts(), 1);
});
