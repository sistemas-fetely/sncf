import { describe, expect, it } from 'vitest';
import { normalizarColecao, slugColecao, detectarColecoesNovas, colecaoNaoCadastrada, encontrarColecao, type ColecaoDim } from './colecoesCatalogo';
const dims: ColecaoDim[] = [{ codigo: 'color_gold', rotulo: 'Color Gold', variantes: ['Ouro'], ativo: true }, { codigo: 'petale', rotulo: 'Pétale', variantes: [], ativo: true }, { codigo: 'antiga', rotulo: 'Antiga', variantes: [], ativo: false }];
const cel = (id: string, nome: string, cod = id) => ({ id, campo: 'colecao', status: 'pendente', tipo: 'mudanca', cod_cadastro: cod, valor_planilha: nome });
describe('coleções novas', () => {
  it('equivalência ignora caixa, acentos e espaços', () => { expect(normalizarColecao(' PÉ tale ')).toBe(normalizarColecao('petale')); });
  it('slug do nome devolvido pelo FOP', () => { expect(slugColecao(' Cólôr Gold ')).toBe('color_gold'); });
  it('reconhece código e variantes ativos', () => { expect(encontrarColecao('color gold', dims)?.codigo).toBe('color_gold'); expect(encontrarColecao('OURO', dims)?.codigo).toBe('color_gold'); });
  it('detecta só pendentes desconhecidas e conta produtos distintos', () => {
    expect(detectarColecoesNovas([cel('1', ' Nova '), cel('2', 'Nóva', '1'), cel('3', 'nova'), cel('4', 'Ouro'), { ...cel('5', 'Outra'), status: 'aplicada' }, { ...cel('6', 'Outra'), tipo: 'sem_cadastro' }], dims)).toEqual([{ nome: ' Nova ', produtos: 2, parecida: undefined }]);
  });
  it('sugere coleção próxima até três edições, não quatro', () => {
    expect(detectarColecoesNovas([cel('1', 'Petall'), cel('2', 'PetaXYZ'), cel('3', 'PetWXYZ')], dims).map(c => [c.nome, c.parecida])).toEqual([['Petall', 'Pétale'], ['PetaXYZ', 'Pétale'], ['PetWXYZ', undefined]]);
  });
  it('bloqueia coleção nova e inativa, libera equivalente ativa e outro campo', () => {
    expect([cel('1', 'Nova'), cel('2', 'Antiga'), cel('3', 'PÉTALE'), { ...cel('4', 'Nova'), campo: 'categoria' }].map(c => colecaoNaoCadastrada(c, dims))).toEqual([true, true, false, false]);
  });
});
