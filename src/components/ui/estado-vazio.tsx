import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sistema Visual Fetely §10 — ESTADO-VAZIO-E-CONVITE.
 * Vazio nunca e lamento ("Nenhum registro encontrado"): e instrucao do proximo gesto.
 * Uma frase que diz O QUE FAZER, e quando existir, o botao que faz.
 */
interface EstadoVazioProps {
  icone?: LucideIcon;
  /** frase curta que nomeia o vazio */
  titulo?: string;
  /** o que fazer agora — obrigatorio */
  mensagem: ReactNode;
  /** botao ou link da acao sugerida */
  acao?: ReactNode;
  className?: string;
}

export function EstadoVazio({ icone: Icone, titulo, mensagem, acao, className }: EstadoVazioProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border p-10 text-center", className)}>
      {Icone && <Icone className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
      {titulo && <p className="text-sm font-medium">{titulo}</p>}
      <p className="max-w-[52ch] text-sm text-muted-foreground">{mensagem}</p>
      {acao}
    </div>
  );
}
