import { useLocation } from "react-router-dom";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useFavoritos, useRotaNavegavel } from "@/hooks/useFavoritos";

/**
 * Estrela de favoritar a tela atual — FAVORITO-NASCE-NA-TELA (22/08/2026).
 *
 * Auto-contido de propósito: não recebe props. Descobre sozinho a rota atual e
 * resolve rótulo/app contra a sncf_navegacao. Por isso pode ser embutido nos
 * cabeçalhos padrão (PageTitle e CasaPageHeader) e toda tela ganha a estrela
 * sem edição individual.
 *
 * Não renderiza nada quando a rota não está declarada na sncf_navegacao —
 * coerente com a guarda de nascimento: tela não declarada não existe pro
 * sistema, então não pode ser favoritada.
 */
export function BotaoFavoritar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const alvo = useRotaNavegavel(pathname);
  const { isFavorito, toggleFavorito, salvando } = useFavoritos();

  if (!alvo) return null;

  const marcado = isFavorito(alvo.rota);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={salvando}
          onClick={() => toggleFavorito(alvo.rota)}
          aria-label={marcado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={marcado}
          className={cn("h-8 w-8 shrink-0", className)}
        >
          <Star
            className={cn(
              "h-4 w-4 transition-colors",
              marcado ? "fill-gold text-gold" : "text-muted-foreground/50 hover:text-gold"
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {marcado ? "Remover dos favoritos" : "Fixar nos favoritos"}
      </TooltipContent>
    </Tooltip>
  );
}
