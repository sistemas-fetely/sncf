import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Publicacao } from "@/hooks/useMural";

interface Props {
  publicacao: Publicacao;
}

interface Tema {
  bg: string;
  border: string;
  texto: string;
  destaque: string;
}

const temas: Record<string, Tema> = {
  rosa: {
    bg: "bg-info/10",
    border: "border-info/40",
    texto: "text-destructive",
    destaque: "text-destructive",
  },
  verde: {
    bg: "bg-success/10",
    border: "border-success/40",
    texto: "text-success",
    destaque: "text-success",
  },
  creme: {
    bg: "bg-warning/10",
    border: "border-warning/40",
    texto: "text-warning",
    destaque: "text-warning",
  },
  sage: {
    bg: "bg-success/10",
    border: "border-success/40",
    texto: "text-success",
    destaque: "text-success",
  },
  bordo: {
    bg: "bg-destructive/10",
    border: "border-destructive/40",
    texto: "text-destructive",
    destaque: "text-destructive",
  },
};

function initials(nome: string | null): string {
  if (!nome) return "F";
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function CardCelebracao({ publicacao }: Props) {
  const tema = temas[publicacao.cor_tema] || temas.rosa;

  return (
    <div
      className={`relative rounded-2xl border ${tema.bg} ${tema.border} p-5 transition-all duration-500 h-full`}
    >
      <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${tema.destaque} mb-3`}>
        <Sparkles className="h-3 w-3" />
        Celebre o que importa
      </div>

      <div className="flex items-start gap-4">
        {publicacao.pessoa_alvo_nome && (
          <Avatar className="h-16 w-16 shrink-0 ring-2 ring-white dark:ring-white/10 shadow-sm">
            <AvatarImage src={publicacao.foto_url ?? undefined} alt={publicacao.pessoa_alvo_nome} />
            <AvatarFallback className="bg-white/80 text-base font-medium">
              {initials(publicacao.pessoa_alvo_nome)}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="flex-1 min-w-0">
          {publicacao.emoji && (
            <div className="text-2xl mb-1 leading-none">{publicacao.emoji}</div>
          )}
          <h3 className={`text-base font-medium ${tema.texto} leading-tight`}>
            {publicacao.titulo}
          </h3>
          {publicacao.mensagem && (
            <p className={`mt-2 text-sm ${tema.texto} opacity-90 leading-relaxed`}>
              {publicacao.mensagem}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
