import {
  Folder, Target, Rocket, Sparkles, Flag, Calendar, Box, BarChart3,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Marca visual do projeto — ponto ÚNICO de resolução.
 * Precedência: imagem_url > icone > só a cor.
 * Nome de ícone inválido cai no padrão (Folder) — nunca quebra a tela.
 */
export const ICONES_PROJETO: Record<string, LucideIcon> = {
  folder: Folder,
  target: Target,
  rocket: Rocket,
  sparkles: Sparkles,
  flag: Flag,
  calendar: Calendar,
  box: Box,
  chart: BarChart3,
};

export const NOMES_ICONE_PROJETO = Object.keys(ICONES_PROJETO);

export function iconeProjeto(nome: string | null | undefined): LucideIcon {
  if (!nome) return Folder;
  return ICONES_PROJETO[nome.trim().toLowerCase()] ?? Folder;
}

interface Props {
  nome?: string | null;
  cor?: string | null;
  icone?: string | null;
  imagemUrl?: string | null;
  /** classes de tamanho, ex. "h-10 w-10" */
  className?: string;
  iconeClassName?: string;
}

export function MarcaProjeto({
  nome, cor, icone, imagemUrl, className, iconeClassName,
}: Props) {
  const base = cn("shrink-0 overflow-hidden rounded-xl", className ?? "h-10 w-10");

  if (imagemUrl) {
    return (
      <img
        src={imagemUrl}
        alt={nome ? `Imagem do projeto ${nome}` : "Imagem do projeto"}
        className={cn(base, "object-cover")}
        loading="lazy"
      />
    );
  }

  const Icone = icone ? iconeProjeto(icone) : null;

  return (
    <span
      className={cn(base, "flex items-center justify-center")}
      style={{ backgroundColor: cor ?? "hsl(var(--muted))" }}
      aria-hidden
    >
      {Icone && <Icone className={cn("h-1/2 w-1/2 text-white", iconeClassName)} />}
    </span>
  );
}
