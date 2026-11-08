import { describe, expect, it } from 'vitest';
import { resolverAbaConciliacao } from './abasConciliacao';
describe('abas da conciliação', () => {
  it('abre entrada pelo link antigo mesmo com divergências', () => expect(resolverAbaConciliacao(null, '#atualizacao-do-dia', 0, 20)).toBe('entrada'));
  it('respeita escolha explícita de saída mesmo com pendências e hash antigo', () => expect(resolverAbaConciliacao('saida', '#atualizacao-do-dia', 770, 20)).toBe('saida'));
  it('respeita escolha explícita de entrada', () => expect(resolverAbaConciliacao('entrada', '', 0, 20)).toBe('entrada'));
  it('sem parâmetro abre saída somente sem pendência e com divergência', () => expect(resolverAbaConciliacao(null, '', 0, 20)).toBe('saida'));
  it('sem parâmetro prioriza entrada com 770 pendências', () => expect(resolverAbaConciliacao(null, '', 770, 20)).toBe('entrada'));
  it('sem nada pendente abre entrada', () => expect(resolverAbaConciliacao(null, '', 0, 0)).toBe('entrada'));
});