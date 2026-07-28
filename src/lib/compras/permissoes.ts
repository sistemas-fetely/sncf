/**
 * Espelha a função `fn_eh_comprador` do banco.
 * Uma única regra em um único lugar: quem pode operar o módulo Compras.
 */
export function ehComprador(roles: string[]): boolean {
  return roles.includes("comprador") || roles.includes("super_admin");
}
