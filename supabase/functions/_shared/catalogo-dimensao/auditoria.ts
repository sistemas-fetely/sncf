/** Audit FK accepts only real auth users: the daily routine is identified by name, with a null user id. */
export const ROTINA_CATALOGO = { id: '00000000-0000-4000-8000-00000000ca7a', nome: 'Rotina diária do catálogo' } as const;

export function usuarioAuditoria(quem: { id: string }, usuarioReal: boolean): string | null {
  return usuarioReal && quem.id !== ROTINA_CATALOGO.id ? quem.id : null;
}