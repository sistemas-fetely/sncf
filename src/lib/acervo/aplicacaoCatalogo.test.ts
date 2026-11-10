import { describe, it, expect } from 'vitest';
import { lotesPorProduto, executarLotesCatalogo, motivosAgrupados, FalhaLoteCatalogo, falhaTransporte } from './aplicacaoCatalogo';

const celulas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), cod_cadastro: String(Math.floor(i / 4)) }));
const ok = (n: number) => ({ ok: true, aplicadas: n, conflitos: 0, erros: 0, lotes: 1 });
describe('aplicação frontal do catálogo', () => {
  it('divide 904 células em dez lotes sem partir produto, mesmo intercalado', () => {
    const cs = celulas(904).sort((a, b) => a.id.localeCompare(b.id));
    const lotes = lotesPorProduto(cs);
    expect(lotes).toHaveLength(10);
    expect(lotes.flat()).toHaveLength(904);
    for (const codigo of new Set(cs.map(c => c.cod_cadastro))) {
      const ids = cs.filter(c => c.cod_cadastro === codigo).map(c => c.id);
      expect(lotes.filter(l => l.some(id => ids.includes(id)))).toHaveLength(1);
    }
  });
  it('mantém inteiro produto maior que 100', () => {
    expect(lotesPorProduto(Array.from({ length: 104 }, (_, i) => ({ id: String(i), cod_cadastro: '01355' })))).toHaveLength(1);
  });
  it('divide 16 células de quatro produtos inteiros e emite passos intermediários', async () => {
    const cs = celulas(16);
    const lotes = lotesPorProduto(cs);
    expect(lotes).toEqual([['0', '1', '2', '3'], ['4', '5', '6', '7'], ['8', '9', '10', '11'], ['12', '13', '14', '15']]);
    const progressos: number[] = [];
    const r = await executarLotesCatalogo(cs, {
      enviar: async ids => ok(ids.length), identificarErros: async () => [], pausa: async () => 'parar',
      progresso: p => progressos.push(p.processadas),
    });
    expect(progressos).toEqual([0, 4, 4, 8, 8, 12, 12, 16]);
    expect(r.aplicadas).toBe(16);
  });
  it('mantém um produto de 16 células inteiro apesar do limite adaptativo de 2', () => {
    const cs = celulas(16).map(c => ({ ...c, cod_cadastro: '01355' }));
    expect(lotesPorProduto(cs)).toEqual([cs.map(c => c.id)]);
  });
  it('permite informar o limite explicitamente', () => {
    expect(lotesPorProduto(celulas(16), 8).map(l => l.length)).toEqual([8, 8]);
  });
  it('envia em sequência e soma progresso por resultados concluídos', async () => {
    const progressos: number[] = []; let ativo = 0;
    const r = await executarLotesCatalogo(celulas(204), {
      enviar: async ids => { expect(ativo++).toBe(0); await Promise.resolve(); ativo--; return ok(ids.length); },
      identificarErros: async () => [], pausa: async () => 'parar', progresso: p => progressos.push(p.processadas),
    });
    expect(progressos).toEqual([0, 24, 24, 48, 48, 72, 72, 96, 96, 120, 120, 144, 144, 168, 168, 192, 192, 204]);
    expect(r.aplicadas).toBe(204); expect(r.lotes).toBe(9);
  });
  it('reenvia o mesmo lote após transporte, sem duplicar contadores', async () => {
    const enviados: string[][] = [];
    const r = await executarLotesCatalogo(celulas(104), {
      enviar: async ids => { enviados.push(ids); if (enviados.length === 1) throw new FalhaLoteCatalogo('FOP indisponível', 502); return ok(ids.length); },
      identificarErros: async () => [], pausa: async () => 'tentar', progresso: () => {},
    });
    expect(enviados[0]).toEqual(enviados[1]); expect(r.aplicadas).toBe(104); expect(r.lotes).toBe(9);
  });
  it('parar inclui lote interrompido e seguintes nas não enviadas', async () => {
    let chamadas = 0;
    const r = await executarLotesCatalogo(celulas(204), {
      enviar: async ids => { if (++chamadas === 2) throw new TypeError('Failed to fetch'); return ok(ids.length); },
      identificarErros: async () => [], pausa: async () => 'parar', progresso: () => {},
    });
    expect(r.aplicadas).toBe(24); expect(r.naoEnviadas).toBe(180); expect(chamadas).toBe(2);
  });
  it('409 de leitura nova interrompe sem pedir tentativa', async () => {
    const r = await executarLotesCatalogo(celulas(204), {
      enviar: async () => { throw new FalhaLoteCatalogo('Mudou', 409, 'leitura_mais_nova'); },
      identificarErros: async () => [], pausa: async () => { throw new Error('não deve pausar'); }, progresso: () => {},
    });
    expect(r.leituraNova).toBe(true); expect(r.naoEnviadas).toBe(204);
  });
  it('reenvio usa só os ids de erro persistidos, nunca conflitos', async () => {
    const r = await executarLotesCatalogo(celulas(4), {
      enviar: async () => ({ ok: true, aplicadas: 2, conflitos: 1, erros: 1, lotes: 1, motivos: ['Inválido'] }),
      identificarErros: async () => ['3'], pausa: async () => 'parar', progresso: () => {},
    });
    const enviados: string[][] = [];
    await executarLotesCatalogo(celulas(4).filter(c => r.idsErro.includes(c.id)), {
      enviar: async ids => { enviados.push(ids); return ok(ids.length); }, identificarErros: async () => [], pausa: async () => 'parar', progresso: () => {},
    });
    expect(enviados).toEqual([['3']]); expect(r.conflitos).toBe(1); expect(r.erros).toBe(1);
  });
  it('agrupa motivos únicos com contagem', () => {
    expect(motivosAgrupados(['A', 'B', 'A'])).toEqual([{ mensagem: 'A', quantidade: 2 }, { mensagem: 'B', quantidade: 1 }]);
  });
  it('reconhece ok:false com falha do FOP como transporte', () => {
    expect(falhaTransporte(new FalhaLoteCatalogo('Falha ao falar com o FOP: timeout'))).toBe(true);
    expect(falhaTransporte(new FalhaLoteCatalogo('Sem permissão', 403))).toBe(false);
  });
});