import { describe, expect, test } from 'bun:test';
import { aplicarComDimensoes, candidatasRenomeacao, type AjusteFop, type DependenciasDimensao, type ResultadoSncf } from '../_shared/catalogo-dimensao/renomear.ts';
import { type CelulaFop } from '../_shared/catalogo-planilha/aplicar-fop.ts';

const quem = { id: '00000000-0000-4000-8000-000000000001', nome: 'Teste' };
const cel = (id: string, extra: Partial<CelulaFop> = {}): CelulaFop => ({ id, cod_cadastro: id, campo: 'grupo', dono: 'produto', tipo: 'mudanca', status: 'pendente', leitura_id: 'leitura', valor_sistema: 'Travessa', valor_planilha: 'Bandeja', ...extra });

function falso(celulas = [cel('1'), cel('2')], opts: { destino?: boolean; parcialFop?: boolean; parcialSncf?: boolean; falharReal?: string } = {}) {
  const categorias: Record<string, string> = { '1': 'mesa', '2': 'infantil', '3': 'mesa', extra: 'mesa' };
  const produtos = new Map(celulas.map(c => [c.cod_cadastro, String(c.valor_sistema)]));
  const locais = new Map(produtos);
  const ativas = new Map(['mesa', 'infantil'].map(cat => [cat, { nome: 'Travessa', ativo: true }]));
  let localNome = 'Travessa', localAtiva = true;
  if (opts.parcialSncf) locais.set('extra', 'Travessa');
  if (opts.parcialFop) produtos.set('extra', 'Travessa');
  const log = { fop: [] as AjusteFop[], sncf: [] as { de: string; para: string; cods: string[]; desfazer: boolean }[], espelho: [] as string[][], concluidas: [] as string[][], produtoAProduto: [] as string[], ordem: [] as string[], inativarLocal: [] as string[] };
  const deps: DependenciasDimensao = {
    categoria: async i => categorias[i.cod_cadastro],
    ajustarFop: async corpo => {
      log.fop.push(structuredClone(corpo));
      log.ordem.push(corpo.acao === 'renomear' ? corpo.dry_run ? 'dry' : 'real' : 'inativar');
      if (corpo.acao === 'inativar_se_vazio') {
        const d = ativas.get(corpo.categoria_id ?? 'mesa');
        if (!d || d.nome !== corpo.nome) return { ok: true, inativado: false, motivo: 'nao_encontrado' };
        const usa = [...produtos].some(([cod, nome]) => nome === corpo.nome && (!corpo.categoria_id || categorias[cod] === corpo.categoria_id));
        if (usa) return { ok: true, inativado: false, motivo: 'tem_produtos' };
        if (!d.ativo) return { ok: true, inativado: false, motivo: 'ja_inativo' };
        d.ativo = false;
        return { ok: true, inativado: true };
      }
      if (opts.destino) return { ok: true, renomeado: false, motivo: 'destino_existe' };
      if (opts.parcialFop) return { ok: true, renomeado: false, motivo: 'parcial' };
      if (!corpo.dry_run && opts.falharReal && corpo.categoria_id === opts.falharReal) throw new Error('Falha no FOP real');
      if (!corpo.dry_run) {
        for (const cod of corpo.cod_cadastros) produtos.set(cod, corpo.para);
        const d = ativas.get(corpo.categoria_id ?? 'mesa');
        if (d) d.nome = corpo.para;
      }
      return { ok: true, renomeado: true, id: `id-${corpo.categoria_id ?? 'colecao'}`, nome: corpo.para, produtos: corpo.cod_cadastros.length };
    },
    renomearSncf: async (_campo, de, para, cods, desfazer) => {
      log.sncf.push({ de, para, cods, desfazer });
      log.ordem.push(desfazer ? 'desfazer' : 'sncf');
      if (opts.parcialSncf) return { renomeado: false, motivo: 'parcial' };
      localNome = desfazer ? de : para;
      for (const cod of cods) locais.set(cod, localNome);
      return { renomeado: true };
    },
    inativarSncf: async (_campo, nome) => {
      log.inativarLocal.push(nome);
      if (localNome !== nome) return { inativado: false, motivo: 'nao_encontrado' };
      if ([...locais.values()].includes(nome)) return { inativado: false, motivo: 'tem_produtos' };
      if (!localAtiva) return { inativado: false, motivo: 'ja_inativo' };
      localAtiva = false;
      return { inativado: true };
    },
    espelhar: async (campo, id, nome) => { log.espelho.push([campo, id, nome]); },
    concluir: async (ids, acao, dono) => { expect(['aplicar', 'resolver']).toContain(acao); expect(dono).toBe('produto'); log.concluidas.push(ids); },
    chamarFop: async corpo => {
      log.ordem.push('produto');
      return { resultados: corpo.celulas.map(i => {
        log.produtoAProduto.push(i.id);
        const jaMudou = produtos.get(i.cod_cadastro) === i.valor_novo;
        produtos.set(i.cod_cadastro, String(i.valor_novo));
        locais.set(i.cod_cadastro, String(i.valor_novo));
        return { id: i.id, status: jaMudou ? 'conflito' : 'aplicada', ...(jaMudou ? { valor_atual: i.valor_novo } : {}) };
      }) };
    },
    registrar: async () => { throw new Error('Não deve deixar erro pendente neste cenário'); },
  };
  return { log, deps, ativas, produtos, executar: () => aplicarComDimensoes(celulas, celulas.map(c => c.id), 'leitura', quem, deps) };
}

describe('renomeação integral de dimensão com FOP falso', () => {
  test('Travessa → Bandeja em duas categorias: todas as prévias antes do SNCF e do FOP real', async () => {
    const f = falso();
    const r = await f.executar();
    expect(f.log.ordem.slice(0, 5)).toEqual(['dry', 'dry', 'sncf', 'real', 'real']);
    expect(f.log.sncf).toEqual([{ de: 'Travessa', para: 'Bandeja', cods: ['1', '2'], desfazer: false }]);
    expect(f.log.espelho).toEqual([['grupo', 'id-mesa', 'Bandeja'], ['grupo', 'id-infantil', 'Bandeja']]);
    expect(f.log.concluidas).toEqual([['1', '2']]);
    expect(f.log.produtoAProduto).toEqual([]);
    expect(r.renomeadas).toEqual([{ campo: 'grupo', de: 'Travessa', para: 'Bandeja', produtos: 2 }]);
    expect(r.aplicadas).toBe(2);
    expect(r.inativadas).toBe(0); // same lines were renamed, not abandoned
  });
  test('destino existente: não renomeia e segue produto a produto, sem fusão', async () => {
    const f = falso(undefined, { destino: true });
    const r = await f.executar();
    expect(f.log.sncf).toEqual([]);
    expect(f.log.produtoAProduto).toEqual(['1', '2']);
    expect(r.renomeadas).toEqual([]);
    expect(r.aplicadas).toBe(2);
    expect(r.inativadas).toBe(3); // two FOP rows + one SNCF row
  });
  test('parcial no FOP: não toca a linha SNCF e mantém a origem com produto ativa', async () => {
    const f = falso(undefined, { parcialFop: true });
    const r = await f.executar();
    expect(f.log.sncf).toEqual([]);
    expect(f.log.produtoAProduto).toEqual(['1', '2']);
    expect(r.renomeadas).toEqual([]);
    expect(f.ativas.get('mesa')?.ativo).toBe(true);
    expect(f.ativas.get('infantil')?.ativo).toBe(false);
  });
  test('parcial só no SNCF: renomeia só no FOP e preserva produto SNCF fora do lote', async () => {
    const f = falso(undefined, { parcialSncf: true });
    const r = await f.executar();
    expect(f.log.sncf).toHaveLength(1);
    expect(f.log.produtoAProduto).toEqual([]);
    expect(r.renomeadas).toEqual([{ campo: 'grupo', de: 'Travessa', para: 'Bandeja', produtos: 2 }]);
    expect(r.motivos?.join(' ')).toContain('conjunto parcial no SNCF');
    expect(r.inativadas).toBe(0);
  });
  test('falha real na segunda categoria desfaz SNCF e reenvia inclusive a primeira já renomeada', async () => {
    const f = falso(undefined, { falharReal: 'infantil' });
    const r = await f.executar();
    expect(f.log.sncf.map(c => c.desfazer)).toEqual([false, true]);
    expect(f.log.ordem.indexOf('desfazer')).toBeLessThan(f.log.ordem.indexOf('produto'));
    expect(f.log.produtoAProduto).toEqual(['1', '2']);
    expect(r.aplicadas).toBe(2); // conflict with already-applied value is genuine success
    expect(r.renomeadas).toEqual([]);
    expect(r.motivos?.join(' ')).toContain('Falha no FOP real');
    expect(f.log.espelho).toEqual([]);
  });
  test('coleção não subdivide por categoria e mantém o mesmo id do espelho', async () => {
    const f = falso([cel('1', { campo: 'colecao' }), cel('2', { campo: 'colecao' })]);
    f.deps.categoria = async () => { throw new Error('Coleção não depende de categoria'); };
    const r = await f.executar();
    const ren = f.log.fop.filter(c => c.acao === 'renomear');
    expect(ren).toHaveLength(2);
    expect(ren.every(c => !('categoria_id' in c))).toBe(true);
    expect(f.log.espelho).toEqual([['colecao', 'id-colecao', 'Bandeja']]);
    expect(r.renomeadas[0].campo).toBe('colecao');
  });
  test('prévia recusada em uma categoria faz toda a candidata voltar ao fluxo normal', async () => {
    const f = falso();
    const original = f.deps.ajustarFop;
    f.deps.ajustarFop = async c => c.acao === 'renomear' && c.categoria_id === 'infantil' ? { ok: true, renomeado: false, motivo: 'destino_existe' } : original(c);
    const r = await f.executar();
    expect(f.log.sncf).toEqual([]);
    expect(f.log.produtoAProduto).toEqual(['1', '2']);
    expect(r.renomeadas).toEqual([]);
  });
  test('falha da prévia retorna ao fluxo normal com motivo visível', async () => {
    const f = falso();
    const original = f.deps.ajustarFop;
    f.deps.ajustarFop = async c => { if (c.acao === 'renomear') throw new Error('Porta indisponível'); return original(c); };
    const r = await f.executar();
    expect(f.log.sncf).toEqual([]);
    expect(r.aplicadas).toBe(2);
    expect(r.motivos?.join(' ')).toContain('Porta indisponível');
  });
  test('SNCF destino existente impede renomeação real no FOP', async () => {
    const f = falso();
    f.deps.renomearSncf = async () => ({ renomeado: false, motivo: 'destino_existe' });
    await f.executar();
    expect(f.log.fop.some(c => c.acao === 'renomear' && !c.dry_run)).toBe(false);
    expect(f.log.produtoAProduto).toEqual(['1', '2']);
  });
  test('compensação recusada é fatal, não envia produto a produto com SNCF incoerente', async () => {
    const f = falso(undefined, { falharReal: 'mesa' });
    const original = f.deps.renomearSncf;
    f.deps.renomearSncf = async (...args) => args[4] ? { renomeado: false, motivo: 'parcial' } : original(...args);
    await expect(f.executar()).rejects.toThrow('Não foi possível desfazer');
    expect(f.log.produtoAProduto).toEqual([]);
  });
  test('falha ao concluir nunca reenvia uma renomeação confirmada', async () => {
    const f = falso();
    f.deps.concluir = async () => { throw new Error('Registro recusado'); };
    await expect(f.executar()).rejects.toThrow('Registro recusado');
    expect(f.log.produtoAProduto).toEqual([]);
    expect(f.log.sncf.map(c => c.desfazer)).toEqual([false]);
  });
  test('valida seleção inteira antes de qualquer efeito', async () => {
    const f = falso([cel('1'), cel('2', { leitura_id: 'outra' })]);
    await expect(f.executar()).rejects.toThrow('leitura atual');
    expect(f.log.fop).toEqual([]);
    expect(f.log.sncf).toEqual([]);
  });
  test('candidatas respeitam pares exatos, tipo mudança e campo grupo/coleção', () => {
    const cs = [cel('1'), cel('2', { valor_sistema: 'travessa' }), cel('3', { valor_planilha: 'bandeja' }), cel('4', { tipo: 'conflito' }), cel('5', { campo: 'cor' }), cel('6', { valor_sistema: '' })];
    expect(candidatasRenomeacao(cs).map(g => g.map(c => c.id))).toEqual([['1'], ['2'], ['3']]);
  });
});

describe('inativação só de valores antigos efetivamente aplicados', () => {
  test('cor/cor_nome deduplicam o valor antigo e não chamam inativação SNCF de cor', async () => {
    const f = falso([cel('1', { campo: 'cor' }), cel('2', { campo: 'cor_nome' })]);
    await f.executar();
    expect(f.log.fop.filter(c => c.acao === 'inativar_se_vazio')).toEqual([{ quem, acao: 'inativar_se_vazio', kind: 'cor', nome: 'Travessa' }]);
    expect(f.log.inativarLocal).toEqual([]);
  });
  test('célula em erro ou conflito real não dispara limpeza; aplicada dispara', async () => {
    const f = falso([cel('1', { campo: 'cor', valor_sistema: 'Branco' }), cel('2', { campo: 'cor', valor_sistema: 'Azul' }), cel('3', { campo: 'cor', valor_sistema: 'Verde' })]);
    const pendentes: string[] = [];
    f.deps.chamarFop = async () => ({ resultados: [{ id: '1', status: 'aplicada' }, { id: '2', status: 'erro', erro: 'Recusada' }, { id: '3', status: 'conflito', valor_atual: 'Outro' }] });
    f.deps.registrar = async rs => { pendentes.push(...rs.map(r => r.id)); };
    const r = await f.executar();
    expect(pendentes).toEqual(['2', '3']);
    expect(f.log.fop.filter(c => c.acao === 'inativar_se_vazio').map(c => 'nome' in c ? c.nome : '')).toEqual(['Branco']);
    expect([r.aplicadas, r.erros, r.conflitos]).toEqual([1, 1, 1]);
  });
  test('só último produto removido permite inativação, não limpa sobras preexistentes', async () => {
    const f = falso([cel('1')], { destino: true, parcialFop: true, parcialSncf: true });
    f.ativas.set('sobras', { nome: 'Sem produtos antes', ativo: true });
    const r = await f.executar();
    expect(r.inativadas).toBe(0);
    expect(f.ativas.get('mesa')?.ativo).toBe(true);
    expect(f.ativas.get('sobras')?.ativo).toBe(true);
    expect(f.log.fop.filter(c => c.acao === 'inativar_se_vazio').map(c => 'nome' in c ? c.nome : '')).toEqual(['Travessa']);
  });
  test('erro de limpeza não derruba aplicação e consta no resumo; SNCF é verificado mesmo com FOP indisponível', async () => {
    const f = falso(undefined, { destino: true });
    const original = f.deps.ajustarFop;
    f.deps.ajustarFop = async c => { if (c.acao === 'inativar_se_vazio') throw new Error('Limpeza FOP indisponível'); return original(c); };
    const r = await f.executar();
    expect(r.aplicadas).toBe(2);
    expect(r.inativadas).toBe(1);
    expect(f.log.inativarLocal).toEqual(['Travessa']);
    expect(r.motivos?.join(' ')).toContain('Limpeza FOP indisponível');
  });
  test('seleção parcial não considera células não selecionadas na renomeação ou limpeza', async () => {
    const cs = [cel('1', { campo: 'cor', valor_sistema: 'Branco' }), cel('2', { campo: 'cor', valor_sistema: 'Azul' })];
    const f = falso(cs);
    await aplicarComDimensoes(cs, ['1'], 'leitura', quem, f.deps);
    expect(f.log.produtoAProduto).toEqual(['1']);
    expect(f.log.fop.filter(c => c.acao === 'inativar_se_vazio').map(c => 'nome' in c ? c.nome : '')).toEqual(['Branco']);
  });
  test('troca sem valor antigo e valor idêntico nunca inativa', async () => {
    const f = falso([cel('1', { campo: 'cor', valor_sistema: null }), cel('2', { campo: 'cor', valor_sistema: 'Bandeja' })]);
    await f.executar();
    expect(f.log.fop).toEqual([]);
  });
  test('recusa JSON ok=false da inativação fica visível, sem sucesso falso', async () => {
    const f = falso([cel('1', { campo: 'cor' })]);
    f.deps.ajustarFop = async () => ({ ok: false, erro: 'Inativação recusada' });
    const r = await f.executar();
    expect(r.inativadas).toBe(0);
    expect(r.motivos).toContain('Inativação FOP cor Travessa: Inativação recusada');
  });
  test('erro local na inativação também vira motivo', async () => {
    const f = falso(undefined, { destino: true });
    f.deps.inativarSncf = async (): Promise<ResultadoSncf> => { throw new Error('Auditoria indisponível'); };
    const r = await f.executar();
    expect(r.aplicadas).toBe(2);
    expect(r.motivos?.join(' ')).toContain('Auditoria indisponível');
  });
});