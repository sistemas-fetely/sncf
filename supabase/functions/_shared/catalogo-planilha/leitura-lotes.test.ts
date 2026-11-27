import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { camposDaLeitura, mapearLotes } from './leitura-lotes.ts';
Deno.test('lotes têm no máximo três consultas simultâneas e conservam a ordem', async () => {
  let ativas = 0, maximo = 0;
  const r = await mapearLotes([1,2,3,4,5,6,7], 2, 3, async lote => {
    ativas++; maximo = Math.max(maximo, ativas);
    await new Promise(resolve => setTimeout(resolve, 5)); ativas--;
    return lote;
  });
  assertEquals(maximo, 3); assertEquals(r, [[1,2],[3,4],[5,6],[7]]);
});
Deno.test('falha de consulta não vira lote vazio', async () => {
  let falhou = false;
  try { await mapearLotes([1], 1, 3, async () => { throw new Error('erro real'); }); }
  catch (e) { falhou = e instanceof Error && e.message === 'erro real'; }
  assertEquals(falhou, true);
});
Deno.test('consulta somente campos presentes e comparáveis, sem descrições v2', () => {
  assertEquals(camposDaLeitura(['nome','descricao_produto','ean'], new Set(['descricao_produto']), ['nome','descricao_produto','ean','ausente'].map(campo => ({campo,importavel_planilha:true})), s => s === 'ean').map(c => c.campo), ['nome']);
});