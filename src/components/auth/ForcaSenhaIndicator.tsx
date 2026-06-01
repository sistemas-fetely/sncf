// Regra de senha desativada — sem critérios de força.
// Mantemos as exportações para não quebrar imports existentes.

interface Props {
  senha: string;
  email?: string;
}

interface Criterio {
  label: string;
  atende: boolean;
}

export function avaliarSenha(_senha: string, _email?: string): Criterio[] {
  return [];
}

export function senhaEhForte(senha: string, _email?: string): boolean {
  return senha.length > 0;
}

export function ForcaSenhaIndicator(_props: Props) {
  return null;
}
