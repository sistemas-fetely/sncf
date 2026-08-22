import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { BotaoFavoritar } from "@/components/navegacao/BotaoFavoritar";
import { cn } from "@/lib/utils";


/**
 * Sistema Visual Fetely §5 e §6 — cabecalho padrao de toda tela.
 * O subtitulo mostra ESTADO ATUAL ("Braspress · sincronizado ha 12 minutos"),
 * nao descricao generica do modulo.
 * A acao primaria (variant="primary") vai por ULTIMO dentro de `acoes`, mais a direita.
 */
interface PageTitleProps {
  titulo: string;
  estado?: ReactNode;
  icone?: LucideIcon;
  acoes?: ReactNode;
  className?: string;
}

export function PageTitle({ titulo, estado, icone: Icone, acoes, className }: PageTitleProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icone && <Icone className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />}
          <h1 className="truncate font-display text-[27px] font-normal leading-tight text-foreground">
            {titulo}
          </h1>
          <BotaoFavoritar />
        </div>

        {estado && <p className="mt-0.5 text-xs text-muted-foreground">{estado}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
