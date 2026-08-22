import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Clock, GripVertical, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { resolverIcone } from "@/config/iconesNavegacao";
import { useRecentes } from "@/hooks/useRecentes";
import { useFavoritos, type PaginaFavorita } from "@/hooks/useFavoritos";

/**
 * Popover de Recentes e Favoritos — MENU-VIA-TABELA (22/08/2026).
 *
 * Rótulo e app de cada favorito vêm resolvidos da sncf_navegacao pelo hook;
 * aqui não existe mais mapa de pilar hardcoded (o antigo PILAR_LABELS falava
 * o vocabulário morto de 4 pilares).
 *
 * Reordenar é drag-and-drop nativo do HTML5 — a lista é curta e não justifica
 * dependência nova (SIMPLES PRIMEIRO). A ordem só é persistida ao soltar.
 */
export function RecentesEFavoritos() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recentes } = useRecentes(8);
  const { favoritos, isFavorito, toggleFavorito, reordenar } = useFavoritos();

  // Cópia local pra arrastar sem esperar o banco; ressincroniza quando o
  // servidor responde.
  const [ordemLocal, setOrdemLocal] = useState<PaginaFavorita[]>(favoritos);
  const [arrastando, setArrastando] = useState<number | null>(null);

  useEffect(() => {
    setOrdemLocal(favoritos);
  }, [favoritos]);

  const aoSoltar = (destino: number) => {
    if (arrastando === null || arrastando === destino) {
      setArrastando(null);
      return;
    }
    const nova = [...ordemLocal];
    const [movido] = nova.splice(arrastando, 1);
    nova.splice(destino, 0, movido);
    setOrdemLocal(nova);
    setArrastando(null);
    reordenar(nova.map((f) => f.id));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 gap-2 rounded-xl px-2 md:px-3 hover:bg-accent"
          title="Favoritos e recentes"
        >
          <Star className={cn("h-4 w-4", favoritos.length > 0 && "fill-gold text-gold")} />
          <span className="hidden md:inline text-sm font-medium">Favoritos</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <ScrollArea className="max-h-[480px]">
          {/* Favoritos */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Favoritos
            </h4>
            {ordemLocal.length > 1 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                arraste pra reordenar
              </span>
            )}
          </div>

          {ordemLocal.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 px-4">
              Nenhum favorito ainda. Use a estrela ao lado do título de qualquer tela.
            </p>
          ) : (
            <div>
              {ordemLocal.map((f, i) => {
                const Icone = resolverIcone(f.icone);
                return (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={() => setArrastando(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => aoSoltar(i)}
                    onDragEnd={() => setArrastando(null)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 hover:bg-muted/50 transition-colors",
                      arrastando === i && "opacity-40"
                    )}
                  >
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 cursor-grab active:cursor-grabbing" />
                    <button
                      onClick={() => navigate(f.rota)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{f.titulo}</span>
                    </button>
                    {f.appLabel && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {f.appLabel}
                      </Badge>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorito(f.rota);
                      }}
                      className="shrink-0 p-1 hover:bg-muted rounded"
                      aria-label="Remover dos favoritos"
                    >
                      <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          {/* Recentes */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recentes
            </h4>
          </div>
          <div>
            {recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 px-4">
                Nenhuma página visitada ainda
              </p>
            ) : (
              recentes.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/50 transition-colors",
                    location.pathname === r.rota && "bg-muted/30"
                  )}
                >
                  <button
                    onClick={() => navigate(r.rota)}
                    className="flex-1 flex flex-col items-start text-left min-w-0"
                  >
                    <span className="text-sm font-medium truncate w-full">{r.titulo}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.acessado_em).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorito(r.rota);
                    }}
                    className="shrink-0 p-1 hover:bg-muted rounded"
                    aria-label={isFavorito(r.rota) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        isFavorito(r.rota)
                          ? "fill-gold text-gold"
                          : "text-muted-foreground/30 hover:text-gold"
                      )}
                    />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
