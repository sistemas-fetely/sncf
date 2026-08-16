import { useNavigate, useLocation } from "react-router-dom";
import { Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecentes } from "@/hooks/useRecentes";
import { useFavoritos } from "@/hooks/useFavoritos";

const PILAR_COLORS: Record<string, string> = {
  sncf: "bg-success text-success border-success/40",
  people: "bg-info text-info border-info/40",
  ti: "bg-info text-info border-info/40",
  admin: "bg-warning text-warning border-warning/40",
};

const PILAR_LABELS: Record<string, string> = {
  sncf: "SNCF",
  people: "People",
  ti: "TI",
  admin: "ADM",
};

export function RecentesEFavoritos() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recentes } = useRecentes(8);
  const { favoritos, isFavorito, toggleFavorito } = useFavoritos();

  const handleClick = (rota: string) => {
    navigate(rota);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 gap-2 rounded-xl px-2 md:px-3 hover:bg-accent"
          title="Recentes e favoritos"
        >
          <Clock className="h-4 w-4" />
          <span className="hidden md:inline text-sm font-medium">Recentes</span>
          {favoritos.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <ScrollArea className="max-h-[480px]">
          {/* Favoritos */}
          {favoritos.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 border-b">
                <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Favoritos
                </h4>
              </div>
              <div>
                {favoritos.map((f) => (
                  <div
                    key={f.id}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/50 transition-colors group"
                  >
                    <button
                      onClick={() => handleClick(f.rota)}
                      className="flex-1 flex items-center gap-2 text-left min-w-0"
                    >
                      <span className="text-sm font-medium truncate">{f.titulo}</span>
                    </button>
                    {f.pilar && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 ${PILAR_COLORS[f.pilar] || ""}`}
                      >
                        {PILAR_LABELS[f.pilar] || f.pilar}
                      </Badge>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFavorito(f.rota, f.titulo, f.pilar || undefined);
                      }}
                      className="shrink-0 p-1 hover:bg-muted rounded"
                      aria-label="Remover dos favoritos"
                    >
                      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    </button>
                  </div>
                ))}
              </div>
              <Separator />
            </>
          )}

          {/* Recentes */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recentes
            </h4>
          </div>
          <div>
            {recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                Nenhuma página visitada ainda
              </p>
            ) : (
              recentes.map((r) => (
                <div
                  key={r.id}
                  className={`w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/50 transition-colors group ${
                    location.pathname === r.rota ? "bg-muted/30" : ""
                  }`}
                >
                  <button
                    onClick={() => handleClick(r.rota)}
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
                  {r.pilar && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 ${PILAR_COLORS[r.pilar] || ""}`}
                    >
                      {PILAR_LABELS[r.pilar] || r.pilar}
                    </Badge>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorito(r.rota, r.titulo, r.pilar || undefined);
                    }}
                    className="shrink-0 p-1 hover:bg-muted rounded"
                    aria-label={isFavorito(r.rota) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isFavorito(r.rota)
                          ? "fill-warning text-warning"
                          : "text-muted-foreground/30 hover:text-warning"
                      }`}
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
