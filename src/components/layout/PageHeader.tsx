import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotaoFavoritar } from "@/components/navegacao/BotaoFavoritar";
import { CasaBreadcrumb, type CasaBreadcrumbItem } from "@/components/casa/CasaBreadcrumb";

/**
 * PageHeader — cabeçalho ÚNICO de tela. Sistema Visual Fetely §5, §6 e §14.
 *
 * Criado em 22/08/2026 para acabar com três jeitos coexistindo de escrever o
 * topo de uma tela: `PageTitle` (24 telas), `CasaPageHeader` (22 telas) e
 * `<h1>` cru com classes improvisadas (125 telas — 73% do sistema, em 4
 * padrões diferentes de tamanho e peso).
 *
 * É superset dos dois antigos: tem o breadcrumb do CasaPageHeader e o
 * ícone + linha de estado do PageTitle, ambos opcionais. `PageTitle` e
 * `CasaPageHeader` viraram cascas finas em cima deste — as 46 telas que já
 * os usam não precisaram ser tocadas.
 *
 * A estrela de favoritar vem embutida e se resolve sozinha contra a
 * sncf_navegacao. Toda tela que usar este componente ganha favoritos de
 * graça — era essa a cobertura que faltava nas 125.
 *
 * O `estado` mostra ESTADO ATUAL ("Braspress · sincronizado há 12 minutos"),
 * não descrição genérica do módulo (§5).
 * A ação primária vai por ÚLTIMO dentro de `acoes`, mais à direita (§6).
 */
export interface PageHeaderProps {
  /** Título da tela. Único obrigatório. */
  titulo: string;
  /** Trilha de navegação. Omitir quando a tela é raiz de um app. */
  breadcrumb?: CasaBreadcrumbItem[];
  /** Estado atual da tela, não descrição do módulo. */
  estado?: ReactNode;
  /** Ícone à esquerda do título. */
  icone?: LucideIcon;
  /** Botões. A ação primária vai por último. */
  acoes?: ReactNode;
  className?: string;
}

export function PageHeader({
  titulo,
  breadcrumb,
  estado,
  icone: Icone,
  acoes,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-4 flex flex-wrap items-start justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {breadcrumb && breadcrumb.length > 0 && <CasaBreadcrumb items={breadcrumb} />}
        <div className="flex items-center gap-2">
          {Icone && <Icone className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />}
          <h1 className="truncate font-display text-[27px] font-normal leading-tight tracking-tight text-foreground">
            {titulo}
          </h1>
          <BotaoFavoritar />
        </div>
        {estado && <p className="text-xs text-muted-foreground">{estado}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
