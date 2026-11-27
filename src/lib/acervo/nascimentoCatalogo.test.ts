import { describe, expect, it } from 'vitest';
import { montarLoteNascimento, problemasDaPrevia, type PropostasCatalogo } from './nascimentoCatalogo';

const p: PropostasCatalogo = {
  cartorio: [
    { tipo: 'reservar', linha: 5, ean: 'E1', cod_cadastro: '03100', dun: null, inner_antes: null, inner_qtd: 24 },
    { tipo: 'mudar_inner', linha: 6, ean: 'E2', cod_cadastro: '02001', dun: null, inner_antes: 12, inner_qtd: 10 },
  ],
  nascimentos: [{ linha: 9, cod_cadastro: '03100', ean: 'E1', dun: null, inner_qtd: 24, nome_comercial: 'Vela', origem: 'nacional', reserva_na_planilha: true }],
  recusas: [],
};

describe('montarLoteNascimento', () => {
  it('nascimento selecionado inclui a reserva do mesmo código', () => {
    const l = montarLoteNascimento(p, new Set(), new Set(['03100']));
    expect(l.p_cartorio.map(c => c.ean)).toEqual(['E1']);
    expect(l.p_produtos).toEqual([{ cod_cadastro: '03100', ean: 'E1', inner_qtd: 24, nome_comercial: 'Vela', origem: 'nacional' }]);
    expect([...l.obrigatorias]).toEqual(['E1']);
  });
  it('proposta de cartório avulsa só entra se marcada', () => {
    expect(montarLoteNascimento(p, new Set(['E2']), new Set()).p_cartorio.map(c => c.ean)).toEqual(['E2']);
    expect(montarLoteNascimento(p, new Set(), new Set()).p_cartorio).toEqual([]);
  });
  it('recusas da prévia apontam o código da linha', () => {
    const l = montarLoteNascimento(p, new Set(), new Set(['03100']));
    expect(problemasDaPrevia({ dry_run: true, pode_confirmar: false, nascimento: { problemas: [{ linha: 1, erro: 'cod já é produto' }] } }, l)).toEqual([{ nivel: 'erro', texto: 'Nascimento · 03100: cod já é produto' }]);
  });
});
