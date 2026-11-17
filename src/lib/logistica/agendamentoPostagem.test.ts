import { describe, expect, it } from 'vitest';
import { ordenarDespacho, avisoPostagem } from './agendamentoPostagem';
describe('postagem agendada', () => {
  it('liberados ficam no topo e bloqueados formam o último grupo', () => {
    expect(ordenarDespacho([{ id: 'comum' }, { id: 'espera', postagem_bloqueada: true }, { id: 'liberado', liberado_para_postar: true }]).map(p => p.id)).toEqual(['liberado', 'comum', 'espera']);
  });
  it('usa exclusivamente o bloqueio da view, não compara data no front', () => {
    expect(avisoPostagem({ agendado_para: '2026-12-14', postagem_bloqueada: true })).toBe('Postagem liberada só em 14/12');
    expect(avisoPostagem({ agendado_para: '2026-12-14', postagem_bloqueada: false })).toBeUndefined();
  });
});