import { describe, expect, test } from 'bun:test';
import { ROTINA_CATALOGO, usuarioAuditoria } from '../_shared/catalogo-dimensao/auditoria.ts';

describe('autoria da auditoria do catálogo', () => {
  test('rotina diária grava sem usuário', () => {
    expect(usuarioAuditoria(ROTINA_CATALOGO, false)).toBeNull();
    expect(usuarioAuditoria(ROTINA_CATALOGO, true)).toBeNull();
  });
  test('usuário real da sessão é preservado', () => {
    expect(usuarioAuditoria({ id: '00000000-0000-4000-8000-000000000001' }, true)).toBe('00000000-0000-4000-8000-000000000001');
  });
});