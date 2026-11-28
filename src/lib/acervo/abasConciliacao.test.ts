import { describe, expect, it } from 'vitest';
import { contadoresConciliacao, resolverAbaConciliacao } from './abasConciliacao';
describe('abas da conciliação', () => {
  it('abre ajustes pelo link antigo mesmo com divergências', () => expect(resolverAbaConciliacao(null, '#atualizacao-do-dia', 0, 20)).toBe('ajustes'));
  it('respeita escolha explícita de saída mesmo com pendências e hash antigo', () => expect(resolverAbaConciliacao('saida', '#atualizacao-do-dia', 770, 20)).toBe('saida'));
  it('converte entrada antiga para ajustes', () => expect(resolverAbaConciliacao('entrada', '', 0, 20)).toBe('ajustes'));
  it('sem parâmetro abre saída somente sem pendência e com divergência', () => expect(resolverAbaConciliacao(null, '', 0, 20)).toBe('saida'));
  it('sem parâmetro prioriza ajustes com 770 pendências', () => expect(resolverAbaConciliacao(null, '', 770, 20)).toBe('ajustes'));
  it('sem nada pendente abre ajustes', () => expect(resolverAbaConciliacao(null, '', 0, 0)).toBe('ajustes'));
  it('respeita URL de novos mesmo com pendências e hash legado', () => expect(resolverAbaConciliacao('novos', '#atualizacao-do-dia', 45, 20)).toBe('novos'));
  it('respeita URL de ajustes', () => expect(resolverAbaConciliacao('ajustes', '', 0, 20)).toBe('ajustes'));
  it('conta 207 nascimentos mais uma reserva sem somar recusas', () => {
    expect(contadoresConciliacao({ propostas: { nascimentos: Array(207).fill({}), cartorio: [{}], recusas: [{}, {}] } }, 45, 20)).toMatchObject({ novos: 208, ajustes: 45, saida: 20 });
  });
  it('v1 não tem propostas novas e preserva contadores de ajustes e saída', () => {
    expect(contadoresConciliacao({}, 37, 0)).toMatchObject({ novos: 0, ajustes: 37, saida: 0 });
  });
});