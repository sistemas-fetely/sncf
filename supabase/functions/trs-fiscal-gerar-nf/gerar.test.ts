import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CNPJ_MATRIZ, desdeRecuperacao, gerarTrs, payloadTrs, recuperarNfDireta, recusaTrs, transporteTi, valorTrs, type DadosTrs, type Registro } from "./gerar.ts";
import { assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
const d: DadosTrs = { codigo: "TRS-0020", naturezaId: 15110073811, lojaId: 206045757, contato: { id: 18041940230, numeroDocumento: CNPJ_MATRIZ }, itens: [{ sku: "CL-EH-SAC-15-HAL", descricao: "Item", produtoId: 123, quantidade: 3, valor: 12.5 }] };
const nat = { familia_processo: "transferencia", exige_expedicao: false, bling_natureza_id: d.naturezaId };
const nfValida = (dados = d) => ({ numeroPedidoLoja: "", numero: "000141", naturezaOperacao: { id: dados.naturezaId }, loja: { id: dados.lojaId }, contato: { numeroDocumento: CNPJ_MATRIZ }, observacoes: `Transferência ${dados.codigo} via SNCF`, valorNota: valorTrs(dados) });
const criterio = { codigo: d.codigo, naturezaId: d.naturezaId, lojaId: d.lojaId, valorEsperado: 37.5, desde: "2026-11-15" };
const semEspera = async (_ms: number) => {};
Deno.test("payload natureza correta", () => assertEquals(payloadTrs(d).naturezaOperacao.id, 15110073811));
Deno.test("payload destinatário matriz", () => assertEquals(payloadTrs(d).contato, { id: 18041940230, numeroDocumento: "63591078000148" }));
Deno.test("payload loja SC", () => assertEquals(payloadTrs(d).loja.id, 206045757));
Deno.test("TRS mantém transporte e observação originais", () => { assertEquals(payloadTrs(d).transporte, { fretePorConta: 9 }); assertEquals(payloadTrs(d).observacoes, "Transferência fiscal TRS-0020 via SNCF — somente rascunho; transmitir no Bling após conferência."); });
Deno.test("TI usa natureza de remessa, loja SP, referência e transporte próprio", () => {
  const payload = payloadTrs({ ...d, codigo: "TI-0013", naturezaId: 987, lojaId: 206300501, transporte: transporteTi({ volumes: 12, peso_kg: 85.4 }), observacao: "Remessa para venda fora do estabelecimento TI-0013 via SNCF — transmitir no Bling após conferência." });
  assertEquals(payload.naturezaOperacao.id, 987); assertEquals(payload.loja.id, 206300501); assertEquals(payload.numeroPedidoLoja, "TI-0013");
  assertEquals(payload.transporte, { fretePorConta: 3, quantidadeVolumes: 12, pesoBruto: 85.4 }); assertEquals(payload.contato.numeroDocumento, CNPJ_MATRIZ);
  assertEquals(payload.observacoes, "Remessa para venda fora do estabelecimento TI-0013 via SNCF — transmitir no Bling após conferência.");
});
Deno.test("TI sem embalagem é recusada", () => { assertThrows(() => transporteTi(null), Error, "Registre a embalagem na Mesa SP antes de gerar a NF de remessa."); });
Deno.test("TI sem id da natureza no Bling informa Eva", () => assertEquals(recusaTrs({ ...nat, familia_processo: "remessa", exige_expedicao: true, bling_natureza_id: null }, true, null, true), "Natureza da NF de remessa sem id no Bling — a Eva precisa cadastrar a natureza no Bling com o CFOP indicado pelo contador. Nada foi criado."));
Deno.test("TI habilitada aceita natureza da finalidade com expedição", () => assertEquals(recusaTrs({ ...nat, familia_processo: "remessa", exige_expedicao: true }, true, null, true), null));
Deno.test("payload referencia canônica da captura", () => assertEquals(payloadTrs(d).numeroPedidoLoja, "TRS-0020"));
Deno.test("payload itens a custo sem duplicatas", () => { assertEquals(payloadTrs(d).itens[0].valor, 12.5); assertEquals(valorTrs(d), 37.5); assertEquals(payloadTrs(d).parcelas, []); });
Deno.test("recusa transferência física", () => assertStringIncludes(recusaTrs({ ...nat, exige_expedicao: true }, true, null) ?? "", "física"));
Deno.test("recusa sem natureza", () => assertStringIncludes(recusaTrs(null, true, null) ?? "", "natureza"));
Deno.test("recusa sem natureza Bling", () => assertStringIncludes(recusaTrs({ ...nat, bling_natureza_id: null }, true, null) ?? "", "fiscal"));
Deno.test("recusa não habilitada", () => assertStringIncludes(recusaTrs(nat, false, null) ?? "", "habilitada"));
Deno.test("recusa TRS já enviada", () => assertStringIncludes(recusaTrs(nat, true, "27395674379") ?? "", "já enviada"));
Deno.test("aceita fiscal habilitada", () => assertEquals(recusaTrs(nat, true, null), null));
Deno.test("cria só rascunho e confere natureza e total", async () => {
  const chamadas: string[] = [], registros: Registro[] = [];
  const resultado = await gerarTrs(d, false, { bling: { get: async p => { chamadas.push(p); return { data: { numero: "10", naturezaOperacao: { id: d.naturezaId }, valorNota: 37.5 } }; }, post: async (p, _b, opts) => { chamadas.push(p); assertEquals(opts?.retry, false); return { data: { id: 99 } }; } }, registrar: async r => { registros.push(r); }, evento: async e => { assertStringIncludes(e, "próximo passo: transmitir"); } });
  assertEquals(chamadas, ["/nfe", "/nfe/99"]); assertEquals(registros.map(r => r.status), ["gerando", "rascunho"]); assertEquals(resultado.natureza_conferida, true); assertEquals(resultado.alertas, []);
});
Deno.test("retry erro recupera pela observação e valor com numeroPedidoLoja vazio sem POST", async () => {
  let posts = 0;
  const chamadas: string[] = [], registros: Registro[] = [];
  const result = await gerarTrs(d, true, { bling: { get: async p => { chamadas.push(p); return p.startsWith("/nfe?") ? { data: [{ id: 99 }] } : { data: nfValida() }; }, post: async () => { posts++; return {}; } }, registrar: async r => { registros.push(r); }, evento: async () => {}, criadoEm: "2026-11-16T01:00:00Z", esperar: semEspera });
  assertEquals(posts, 0); assertEquals(result.bling_nfe_id, 99);
  assertEquals(chamadas, ["/nfe?tipo=1&dataEmissaoInicial=2026-11-14&limite=100&pagina=1", "/nfe/99", "/nfe/99"]);
  assertEquals(registros.map(r => [r.status, r.bling_nfe_id]), [["gerando", 99], ["rascunho", 99]]);
});
Deno.test("falha leitura preserva id e registra erro", async () => {
  const registros: Registro[] = [];
  await assertRejects(() => gerarTrs(d, false, { bling: { get: async () => { throw new Error("GET falhou"); }, post: async () => ({ data: { id: 99 } }) }, registrar: async r => { registros.push(r); }, evento: async () => {} }), Error, "GET falhou");
  assertEquals(registros.at(-1)?.bling_nfe_id, 99); assertEquals(registros.at(-1)?.status, "erro");
});
Deno.test("divergências retornam alertas sem transmissão", async () => {
  const result = await gerarTrs(d, false, { bling: { get: async () => ({ data: { naturezaOperacao: { id: 1 }, valorNota: 100 } }), post: async () => ({ data: { id: 99 } }) }, registrar: async () => {}, evento: async () => {} });
  assertEquals(result.natureza_conferida, false); assertEquals(result.alertas.length, 2);
});
Deno.test("recuperação ambígua nunca cria", async () => {
  let posts = 0;
  await assertRejects(() => gerarTrs(d, true, { bling: { get: async p => p.startsWith("/nfe?") ? { data: [{ id: 98 }, { id: 99 }] } : { data: nfValida() }, post: async () => { posts++; return {}; } }, registrar: async () => {}, evento: async () => {}, esperar: semEspera }), Error, "Não foi possível confirmar se a NF de TRS-0020 já existe no Bling (ids: 98, 99). Confira no Bling antes de tentar de novo — nada foi criado.");
  assertEquals(posts, 0);
});
Deno.test("data de recuperação usa São Paulo menos um dia inclusive virada de mês", () => {
  assertEquals(desdeRecuperacao("2026-11-16T01:00:00Z"), "2026-11-14");
  assertEquals(desdeRecuperacao(undefined, new Date("2026-03-01T12:00:00Z")), "2026-02-28");
  assertThrows(() => desdeRecuperacao("inválida"), Error, "Data de criação da NF inválida");
});
Deno.test("POST 504 recupera TI-0013 criada sem segundo POST e registra antes da leitura", async () => {
  const ti: DadosTrs = { ...d, codigo: "TI-0013", naturezaId: 987, lojaId: 206300501, transporte: transporteTi({ volumes: 12, peso_kg: 85.4 }), observacao: "Remessa TI-0013 via SNCF" };
  const registros: Registro[] = [], esperas: number[] = [], chamadas: string[] = [], eventos: string[] = [];
  let posts = 0, detalhes = 0;
  const result = await gerarTrs(ti, false, {
    bling: {
      post: async (_p, _body, opts) => { posts++; assertEquals(opts?.retry, false); chamadas.push("POST"); throw Object.assign(new Error("Bling POST /nfe 504: Cloudflare"), { status: 504 }); },
      get: async p => {
        chamadas.push(p);
        if (p.startsWith("/nfe?")) return { data: [{ id: 27427359184 }] };
        detalhes++;
        if (detalhes === 2) assertEquals(registros[0], { status: "gerando", bling_nfe_id: 27427359184, numero: null, natureza_conferida: false, erro: null });
        return { data: nfValida(ti) };
      },
    }, registrar: async r => { registros.push(r); }, evento: async e => { eventos.push(e); }, esperar: async ms => { esperas.push(ms); }, agora: new Date("2026-11-16T20:51:00Z"),
  });
  assertEquals(posts, 1); assertEquals(esperas, [5000]);
  assertEquals(chamadas, ["POST", "/nfe?tipo=1&dataEmissaoInicial=2026-11-15&limite=100&pagina=1", "/nfe/27427359184", "/nfe/27427359184"]);
  assertEquals(result.bling_nfe_id, 27427359184); assertEquals(result.status, "rascunho"); assertEquals(result.alertas, []);
  assertEquals(registros.map(r => r.status), ["gerando", "rascunho"]); assertStringIncludes(eventos[0], "criada apesar do 504");
});
Deno.test("POST 504 sem candidata registra erro pode tentar de novo sem POST extra", async () => {
  const registros: Registro[] = []; let posts = 0, gets = 0;
  await assertRejects(() => gerarTrs(d, false, { bling: {
    post: async () => { posts++; throw Object.assign(new Error("504"), { status: 504 }); }, get: async () => { gets++; return { data: [] }; },
  }, registrar: async r => { registros.push(r); }, evento: async () => { throw new Error("Não deve registrar evento"); }, esperar: semEspera }), Error, "O Bling não respondeu e a NF não foi encontrada — pode tentar de novo.");
  assertEquals(posts, 1); assertEquals(gets, 1); assertEquals(registros.at(-1)?.status, "erro"); assertEquals(registros.at(-1)?.bling_nfe_id, null);
});
Deno.test("POST 504 com duas NFs válidas registra erro para conferência sem POST extra", async () => {
  const registros: Registro[] = []; let posts = 0;
  await assertRejects(() => gerarTrs(d, false, { bling: { post: async () => { posts++; throw Object.assign(new Error("504"), { status: 504 }); }, get: async p => p.startsWith("/nfe?") ? { data: [{ id: 98 }, { id: 99 }] } : { data: nfValida() } }, registrar: async r => { registros.push(r); }, evento: async () => {}, esperar: semEspera }), Error, "O Bling não respondeu; confira no Bling se a NF de TRS-0020 foi criada antes de tentar de novo.");
  assertEquals(posts, 1); assertEquals(registros.at(-1)?.status, "erro"); assertEquals(registros.at(-1)?.bling_nfe_id, null);
});
Deno.test("erro 400 não dispara busca nem espera mesmo com 504 no corpo", async () => {
  const registros: Registro[] = []; let gets = 0, esperas = 0, posts = 0;
  await assertRejects(() => gerarTrs(d, false, { bling: { post: async () => { posts++; throw Object.assign(new Error("Bling POST /nfe 400: validação produto 504"), { status: 400 }); }, get: async () => { gets++; return {}; } }, registrar: async r => { registros.push(r); }, evento: async () => {}, esperar: async () => { esperas++; } }), Error, "Bling POST /nfe 400");
  assertEquals(posts, 1); assertEquals(gets, 0); assertEquals(esperas, 0); assertEquals(registros.at(-1)?.status, "erro");
});
for (const falha of [Object.assign(new Error("503"), { status: 503 }), new TypeError("fetch failed"), Object.assign(new Error("cancelado"), { name: "AbortError" }), Object.assign(new Error("timeout"), { name: "TimeoutError" })]) {
  Deno.test(`falha incerta ${falha.name}/${falha.message} recupera sem repetir POST`, async () => {
    let posts = 0;
    const result = await gerarTrs(d, false, { bling: { post: async () => { posts++; throw falha; }, get: async p => p.startsWith("/nfe?") ? { data: [{ id: 99 }] } : { data: nfValida() } }, registrar: async () => {}, evento: async () => {}, esperar: semEspera });
    assertEquals(posts, 1); assertEquals(result.bling_nfe_id, 99);
  });
}
Deno.test("fluxo normal TI POST 200 mantém payload rascunho e evento sem recuperação", async () => {
  const ti = { ...d, codigo: "TI-0013", naturezaId: 987, lojaId: 206300501, transporte: transporteTi({ volumes: 12, peso_kg: 85.4 }), observacao: "Remessa TI-0013 via SNCF" };
  const chamadas: string[] = [], registros: Registro[] = [];
  const result = await gerarTrs(ti, false, { bling: { post: async (p, body, opts) => { chamadas.push(p); assertEquals(body, payloadTrs(ti, new Date((body as { dataOperacao: string }).dataOperacao.replace(" ", "T") + "-03:00"))); assertEquals(opts?.retry, false); return { data: { id: 99 } }; }, get: async p => { chamadas.push(p); return { data: nfValida(ti) }; } }, registrar: async r => { registros.push(r); }, evento: async e => { assertEquals(e.includes("criada apesar"), false); }, esperar: async () => { throw new Error("Não deve esperar"); } });
  assertEquals(chamadas, ["/nfe", "/nfe/99"]); assertEquals(registros.map(r => r.status), ["gerando", "rascunho"]); assertEquals(result.natureza_conferida, true); assertEquals(result.alertas, []);
});
Deno.test("recuperação filtra listagem antes dos detalhes e espaça GETs em 300ms", async () => {
  const chamadas: string[] = [], esperas: number[] = [];
  const result = await recuperarNfDireta({ get: async p => { chamadas.push(p); return p.startsWith("/nfe?") ? { data: [{ id: 1, naturezaOperacao: { id: 1 } }, { id: 2, loja: { id: 1 } }, { id: 3, contato: { numeroDocumento: "00000000000000" } }, { id: 98 }, { id: 99, naturezaOperacao: { id: d.naturezaId }, loja: { id: d.lojaId }, contato: { numeroDocumento: "63.591.078/0001-48" } }] } : { data: nfValida() }; } }, criterio, async ms => { esperas.push(ms); });
  assertEquals(result, { ambigua: [98, 99] }); assertEquals(chamadas.length, 3); assertEquals(esperas, [300]);
});
for (const [nome, campos] of [
  ["natureza diferente", { naturezaOperacao: { id: 1 } }], ["loja diferente", { loja: { id: 1 } }], ["contato diferente", { contato: { numeroDocumento: "00000000000000" } }], ["sem contato", { contato: null }], ["sem código na observação", { observacoes: "outra NF", numeroPedidoLoja: d.codigo }], ["valor fora da tolerância", { valorNota: 37.53 }], ["valor ausente", { valorNota: null }],
] as const) {
  Deno.test(`detalhe ${nome} não corresponde`, async () => {
    assertEquals(await recuperarNfDireta({ get: async p => p.startsWith("/nfe?") ? { data: [{ id: 99 }] } : { data: { ...nfValida(), ...campos } } }, criterio, semEspera), { nenhuma: true });
  });
}
Deno.test("loja ausente no detalhe é aceita e tolerância inclui 0,02", async () => {
  assertEquals(await recuperarNfDireta({ get: async p => p.startsWith("/nfe?") ? { data: [{ id: 99 }] } : { data: { ...nfValida(), loja: undefined, valorNota: 37.52 } } }, criterio, semEspera), { achou: 99 });
});
Deno.test("limite de duas páginas retorna incompleta sem abrir terceira", async () => {
  const chamadas: string[] = [];
  const result = await recuperarNfDireta({ get: async p => { chamadas.push(p); return { data: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, naturezaOperacao: { id: 1 } })) }; } }, criterio, semEspera);
  assertEquals(result, { incompleta: true }); assertEquals(chamadas, ["/nfe?tipo=1&dataEmissaoInicial=2026-11-15&limite=100&pagina=1", "/nfe?tipo=1&dataEmissaoInicial=2026-11-15&limite=100&pagina=2"]);
});
Deno.test("segunda página completa encontra NF", async () => {
  assertEquals(await recuperarNfDireta({ get: async p => p.endsWith("pagina=1") ? { data: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, naturezaOperacao: { id: 1 } })) } : p.endsWith("pagina=2") ? { data: [{ id: 99 }] } : { data: nfValida() } }, criterio, semEspera), { achou: 99 });
});
Deno.test("limite de 40 GETs impede aceitar resultado parcial", async () => {
  let detalhes = 0;
  const result = await recuperarNfDireta({ get: async p => p.startsWith("/nfe?") ? { data: Array.from({ length: 41 }, (_, i) => ({ id: i + 1 })) } : (detalhes++, { data: nfValida() }) }, criterio, semEspera);
  assertEquals(result, { incompleta: true }); assertEquals(detalhes, 40);
});
Deno.test("recuperação erro com rede incompleta bloqueia POST", async () => {
  let posts = 0;
  await assertRejects(() => gerarTrs(d, true, { bling: { get: async () => { throw new TypeError("fetch failed"); }, post: async () => { posts++; return {}; } }, registrar: async () => {}, evento: async () => {}, esperar: semEspera }), Error, "Confira no Bling antes de tentar de novo — nada foi criado.");
  assertEquals(posts, 0);
});
Deno.test("recuperação completa sem NF libera exatamente um POST", async () => {
  let posts = 0;
  const result = await gerarTrs(d, true, { bling: { get: async p => p.startsWith("/nfe?") ? { data: [] } : { data: nfValida() }, post: async () => { posts++; return { data: { id: 99 } }; } }, registrar: async () => {}, evento: async () => {}, esperar: semEspera });
  assertEquals(posts, 1); assertEquals(result.bling_nfe_id, 99);
});
Deno.test("POST 504 com busca incompleta registra erro de conferência", async () => {
  const registros: Registro[] = []; let posts = 0;
  await assertRejects(() => gerarTrs(d, false, { bling: { post: async () => { posts++; throw Object.assign(new Error("504"), { status: 504 }); }, get: async () => { throw new TypeError("fetch failed"); } }, registrar: async r => { registros.push(r); }, evento: async () => {}, esperar: semEspera }), Error, "O Bling não respondeu; confira no Bling se a NF de TRS-0020 foi criada antes de tentar de novo.");
  assertEquals(posts, 1); assertEquals(registros.at(-1)?.status, "erro"); assertEquals(registros.at(-1)?.bling_nfe_id, null);
});