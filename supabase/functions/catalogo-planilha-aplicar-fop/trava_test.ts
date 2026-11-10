import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pegarTrava, PRAZO_TRAVA } from "../_shared/catalogo-planilha/trava.ts";
import { aplicarNoFop } from "../_shared/catalogo-planilha/aplicar-fop.ts";
import { ErroCatalogo } from "../_shared/catalogo-planilha/mensagens.ts";

function bancoFake(dono: string | null, expira = 300_000) {
  let agora = 0, token: string | null = dono ? "antigo" : null;
  const log: string[] = [];
  return {
    log, avancar: (ms: number) => { agora += ms; },
    rpc: async (nome: string, p: Record<string, unknown>) => {
      log.push(nome);
      if (nome === 'fn_catalogo_trava_pegar') {
        assertEquals(p.p_segundos, 300);
        if (token && expira > agora) return { data: { ok: false, dono }, error: null };
        token = "novo"; dono = String(p.p_dono); expira = agora + Number(p.p_segundos) * 1000;
        return { data: { ok: true, token }, error: null };
      }
      if (nome === 'fn_catalogo_trava_renovar') {
        const ok = token === p.p_token && expira > agora;
        if (ok) expira = agora + Number(p.p_segundos) * 1000;
        return { data: ok, error: null };
      }
      const ok = token === p.p_token;
      if (ok) token = null;
      return { data: ok, error: null };
    },
  };
}

Deno.test('aplicação com leitura ativa recusa antes de chamar o FOP', async () => {
  const b = bancoFake('leitura'); let chamadas = 0;
  const erro = await assertRejects(async () => {
    const trava = await pegarTrava(b.rpc, 'aplicacao', 'ator');
    try { await aplicarNoFop([{ id: 'celula', cod_cadastro: '01888', campo: 'origem_prod', dono: 'produto', tipo: 'mudanca', status: 'pendente', leitura_id: 'leitura', valor_planilha: 'Importado', valor_sistema: null }], ['celula'], 'leitura', { id: 'ator', nome: 'Teste' }, {
      chamarFop: async () => { chamadas++; return { resultados: [{ id: 'celula', status: 'aplicada' }] }; }, concluir: async () => {}, registrar: async () => {},
    }); } finally { await trava.soltar(); }
  }, ErroCatalogo, 'Leitura da planilha em andamento');
  assertEquals(erro.status, 409); assertEquals(chamadas, 0);
  assertEquals(b.log, ['fn_catalogo_trava_pegar']);
});

Deno.test('leitura manual com aplicação ativa recusa sem criar leitura', async () => {
  const b = bancoFake('aplicacao'); let leituras = 0;
  const erro = await assertRejects(async () => {
    const trava = await pegarTrava(b.rpc, 'leitura', 'ator');
    try { leituras++; } finally { await trava.soltar(); }
  }, ErroCatalogo, 'Aplicação em andamento — tente em instantes.');
  assertEquals(erro.status, 409); assertEquals(leituras, 0);
});

Deno.test('trava vencida pode ser tomada e renovada por cinco minutos', async () => {
  const b = bancoFake('leitura'); b.avancar(PRAZO_TRAVA * 1000);
  const trava = await pegarTrava(b.rpc, 'aplicacao', 'ator');
  try { await trava.verificar(); } finally { await trava.soltar(); }
  assertEquals(b.log, ['fn_catalogo_trava_pegar', 'fn_catalogo_trava_renovar', 'fn_catalogo_trava_soltar']);
});

Deno.test('processo que perdeu a trava para antes da próxima gravação', async () => {
  const b = bancoFake(null);
  const trava = await pegarTrava(b.rpc, 'aplicacao', 'ator');
  try {
    b.avancar(300_001);
    await assertRejects(() => trava.verificar(), Error, 'trava do catálogo expirou');
  } finally { await trava.soltar(); }
});

Deno.test('leitura automática pede retentativa durável ao encontrar aplicação', async () => {
  const log: Record<string, unknown>[] = [];
  await assertRejects(() => pegarTrava(async (_nome, p) => { log.push(p); return { data: { ok: false, dono: 'aplicacao' }, error: null }; }, 'leitura', null, true), ErroCatalogo);
  assertEquals(log[0].p_aguardar, true);
});