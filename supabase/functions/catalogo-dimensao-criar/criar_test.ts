import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { criarColecao } from './criar.ts';
import type { ColecaoDim } from '../_shared/catalogo-planilha/colecoes.ts';
const quem = { id: 'usuario', nome: 'Flavio' };
function fake(resposta: unknown, existentes: ColecaoDim[] = []) {
  const log = { inseridas: [] as ColecaoDim[], atualizadas: [] as [string, string[]][], auditorias: 0, chamadas: [] as unknown[] };
  const portas = {
    chamarFop: async (corpo: unknown) => { log.chamadas.push(corpo); if (resposta instanceof Error) throw resposta; return resposta; },
    listar: async () => existentes,
    inserir: async (c: ColecaoDim) => { log.inseridas.push(c); },
    atualizar: async (codigo: string, variantes: string[]) => { log.atualizadas.push([codigo, variantes]); },
    auditar: async () => { log.auditorias++; },
  };
  return { log, portas };
}
Deno.test('FOP ok cria espelho e auditoria somente após confirmar', async () => {
  const { log, portas } = fake({ ok: true, id: 'fop-id', nome: 'Color Gold', criada: true });
  const r = await criarColecao('Cólôr Gold', quem, portas);
  assertEquals(log.chamadas, [{ dimensao: 'colecao', nome: 'Cólôr Gold', quem }]);
  assertEquals(log.inseridas, [{ codigo: 'color_gold', rotulo: 'Color Gold', variantes: ['Cólôr Gold'], ativo: true }]);
  assertEquals([r.criada, log.auditorias], [true, 1]);
});
Deno.test('FOP ok reaproveita variante equivalente e acrescenta grafia', async () => {
  const { log, portas } = fake({ ok: true, id: 'fop-id', nome: 'Color Gold', criada: false }, [{ codigo: 'color_gold', rotulo: 'Color Gold', variantes: ['Ouro'], ativo: true }]);
  const r = await criarColecao('OURO', quem, portas);
  assertEquals(r.criada, false); assertEquals(log.inseridas, []);
  assertEquals(log.atualizadas, [['color_gold', ['Ouro', 'OURO']]]); assertEquals(log.auditorias, 1);
});
Deno.test('repetição da mesma grafia não duplica variantes', async () => {
  const { log, portas } = fake({ ok: true, id: 'fop-id', nome: 'Color Gold', criada: false }, [{ codigo: 'color_gold', rotulo: 'Color Gold', variantes: ['OURO'], ativo: true }]);
  await criarColecao('OURO', quem, portas); assertEquals(log.atualizadas, []);
});
Deno.test('FOP erro não grava nem audita SNCF', async () => {
  const { log, portas } = fake({ ok: false, erro: 'Nome recusado' });
  await assertRejects(() => criarColecao('Nova', quem, portas), Error, 'Nome recusado');
  assertEquals([log.inseridas.length, log.atualizadas.length, log.auditorias], [0, 0, 0]);
});
Deno.test('rede caída não grava SNCF', async () => {
  const { log, portas } = fake(new Error('HTTP 401'));
  await assertRejects(() => criarColecao('Nova', quem, portas), Error, 'HTTP 401'); assertEquals(log.inseridas, []);
});
Deno.test('resposta incompleta não grava SNCF', async () => {
  const { log, portas } = fake({ ok: true, nome: 'Nova' });
  await assertRejects(() => criarColecao('Nova', quem, portas), Error, 'Resposta inválida'); assertEquals(log.inseridas, []);
});
