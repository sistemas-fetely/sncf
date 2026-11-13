import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { transmitirTrs, marcadorEnvio, type NfLida } from "./transmitir.ts";
import type { Registro } from "./gerar.ts";
const entrada = { status: "rascunho", bling_nfe_id: 99, numero: "001024", natureza_conferida: true, erro: null, automatico: true, naturezaId: 123, valorEsperado: 37.5 };
const nf = { situacao: 1, naturezaOperacao: { id: 123 }, valorNota: 37.5 };
function contexto(leituras: NfLida[], falha?: Error) {
  let gets = 0, posts = 0, reservas = 0;
  const registros: Registro[] = [], eventos: string[] = [];
  const deps = {
    bling: { get: async () => ({ data: leituras[Math.min(gets++, leituras.length - 1)] }), post: async (p: string, _b: unknown, opts?: { retry?: boolean }) => { posts++; assertEquals(p, "/nfe/99/enviar"); assertEquals(opts?.retry, false); if (falha) throw falha; return { data: {} }; } },
    reservar: async () => { reservas++; return true; }, registrar: async (r: Registro) => { registros.push(r); }, evento: async (d: string) => { eventos.push(d); },
  };
  return { deps, registros, eventos, chamadas: () => ({ gets, posts, reservas }) };
}
Deno.test("chave desligada nunca transmite nem consulta Bling", async () => {
  const c = contexto([nf]); await transmitirTrs({ ...entrada, automatico: false }, c.deps);
  assertEquals(c.chamadas(), { gets: 0, posts: 0, reservas: 0 });
});
Deno.test("natureza não conferida bloqueia envio e mantém rascunho", async () => {
  const c = contexto([nf]); const r = await transmitirTrs({ ...entrada, natureza_conferida: false }, c.deps);
  assertEquals(c.chamadas().posts, 0); assertEquals(r.status, "rascunho"); assertStringIncludes(c.registros[0].erro ?? "", "bloqueada");
});
Deno.test("valor divergente bloqueia envio", async () => {
  const c = contexto([{ ...nf, valorNota: 40 }]); await transmitirTrs(entrada, c.deps); assertEquals(c.chamadas().posts, 0); assertEquals(c.registros[0].status, "rascunho");
});
Deno.test("natureza divergente no readback bloqueia envio", async () => {
  const c = contexto([{ ...nf, naturezaOperacao: { id: 456 } }]); await transmitirTrs(entrada, c.deps); assertEquals(c.chamadas().posts, 0);
});
Deno.test("NF já autorizada não é reenviada", async () => {
  for (const situacao of [5, 6]) { const c = contexto([{ ...nf, situacao }]); const r = await transmitirTrs(entrada, c.deps); assertEquals(c.chamadas().posts, 0); assertEquals(r.status, "transmitida"); }
});
Deno.test("rejeição SEFAZ vira erro com mensagem", async () => {
  const c = contexto([nf, { ...nf, situacao: 4, mensagemRejeicao: "Rejeição 539: Duplicidade de NF-e" }]);
  const r = await transmitirTrs(entrada, c.deps); assertEquals(r.status, "erro"); assertStringIncludes(r.erro ?? "", "Rejeição 539: Duplicidade de NF-e"); assertEquals(c.chamadas().posts, 1);
});
Deno.test("sucesso confirmado vira transmitida com evento", async () => {
  const c = contexto([nf, { ...nf, situacao: 5 }]); const r = await transmitirTrs(entrada, c.deps); assertEquals(r.status, "transmitida"); assertEquals(c.chamadas().posts, 1); assertStringIncludes(c.eventos[0], "autorizada");
});
Deno.test("marcador durável impede repetir após timeout", async () => {
  const c = contexto([nf]); await transmitirTrs({ ...entrada, status: "erro", erro: `${marcadorEnvio(99)} · timeout` }, c.deps); assertEquals(c.chamadas().posts, 0);
});
Deno.test("reserva concorrente perdida não envia", async () => {
  const c = contexto([nf]); await transmitirTrs(entrada, { ...c.deps, reservar: async () => false }); assertEquals(c.chamadas().posts, 0);
});
Deno.test("falha POST não reenvia e preserva marcador e erro", async () => {
  const c = contexto([nf], new Error("SEFAZ indisponível")); const r = await transmitirTrs(entrada, c.deps); assertEquals(r.status, "erro"); assertEquals(c.chamadas().posts, 1); assertStringIncludes(r.erro ?? "", marcadorEnvio(99)); assertStringIncludes(r.erro ?? "", "SEFAZ indisponível");
});
Deno.test("retorno pendente mantém rascunho com marcador para cron consultar sem reenviar", async () => {
  const c = contexto([nf, { ...nf, situacao: 3 }]); const r = await transmitirTrs(entrada, c.deps); assertEquals(r.status, "rascunho"); assertStringIncludes(r.erro ?? "", marcadorEnvio(99));
  const proxima = contexto([{ ...nf, situacao: 3 }]); await transmitirTrs({ ...entrada, erro: r.erro }, proxima.deps); assertEquals(proxima.chamadas().posts, 0);
});