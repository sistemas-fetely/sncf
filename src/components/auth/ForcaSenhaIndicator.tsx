import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Fonte ÚNICA da regra de senha no front.
 * Espelha a política do servidor de Auth. A política hospedada não pôde ser
 * lida automaticamente; adotado mínimo de 8 caracteres, sem exigência de tipos.
 * Se a política do servidor mudar, mude SÓ aqui.
 */
export const POLITICA_SENHA = {
  minimo: 8,
} as const;

export const REGRA_SENHA_TEXTO = `A senha precisa ter no mínimo ${POLITICA_SENHA.minimo} caracteres.`;

interface Props {
  senha: string;
  email?: string;
}

export interface Criterio {
  label: string;
  atende: boolean;
}

export function avaliarSenha(senha: string, _email?: string): Criterio[] {
  return [
    { label: `Mínimo de ${POLITICA_SENHA.minimo} caracteres`, atende: senha.length >= POLITICA_SENHA.minimo },
  ];
}

export function senhaEhForte(senha: string, email?: string): boolean {
  return avaliarSenha(senha, email).every((c) => c.atende);
}

/** Regra escrita + checklist que marca ✓ conforme digita. Mostrar ACIMA do campo. */
export function ForcaSenhaIndicator({ senha, email }: Props) {
  return (
    <ul className="space-y-1 text-xs">
      {avaliarSenha(senha, email).map((c) => (
        <li
          key={c.label}
          className={cn("flex items-center gap-1.5", c.atende ? "text-success" : "text-muted-foreground")}
        >
          {c.atende ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {c.label}
        </li>
      ))}
    </ul>
  );
}
