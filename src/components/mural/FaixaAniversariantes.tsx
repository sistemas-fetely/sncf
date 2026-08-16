import { useState } from "react";
import { Cake, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAniversariantesDoMes, type EventoDoMes } from "@/hooks/useAniversariantesDoMes";
import { DrawerUsuario } from "@/components/DrawerUsuario";
import { cn } from "@/lib/utils";

function initials(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function AvatarEvento({ evento, onClick }: { evento: EventoDoMes; onClick: () => void }) {
  const ehHoje = evento.eh_hoje;
  const tamanho = ehHoje ? "h-20 w-20" : "h-14 w-14";
  const anelClasse = ehHoje
    ? "ring-[3px] ring-warning ring-offset-2 ring-offset-background"
    : "ring-1 ring-border hover:ring-primary/50";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 shrink-0 group focus:outline-none"
      aria-label={`${evento.nome} — ${evento.label_destaque}`}
    >
      <div className="relative">
        {ehHoje && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl z-10 drop-shadow-sm">
            👑
          </div>
        )}
        <Avatar className={cn(tamanho, anelClasse, "transition-all")}>
          <AvatarImage
            src={evento.foto_url || undefined}
            alt={evento.nome}
            className="object-cover"
          />
          <AvatarFallback
            className={cn(
              "font-medium",
              ehHoje
                ? "bg-warning/10 text-warning text-base"
                : "bg-primary/10 text-primary text-xs",
            )}
          >
            {initials(evento.nome)}
          </AvatarFallback>
        </Avatar>
        {ehHoje && (
          <div className="absolute -bottom-1 -right-1 bg-warning rounded-full h-7 w-7 flex items-center justify-center shadow">
            {evento.tipo_evento === "aniversario" ? (
              <Cake className="h-3.5 w-3.5 text-warning" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-warning" />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center min-w-0 max-w-[90px]">
        <span
          className={cn(
            "text-xs font-medium truncate w-full text-center group-hover:text-primary transition-colors",
            ehHoje && "text-sm font-medium",
          )}
        >
          {evento.nome.split(" ")[0]}
        </span>
        <span
          className={cn(
            "text-[10px] truncate w-full text-center",
            ehHoje ? "text-warning font-medium" : "text-muted-foreground",
          )}
        >
          {evento.label_destaque}
        </span>
        {!ehHoje && (
          <span className="text-[9px] text-muted-foreground/70 truncate w-full text-center">
            {evento.subtitulo}
          </span>
        )}
      </div>
    </button>
  );
}

export function FaixaAniversariantes() {
  const { data: eventos, isLoading } = useAniversariantesDoMes();
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const mesAtual = MESES_PT[new Date().getMonth()];
  const temEventos = eventos && eventos.length > 0;

  const scrollRef = (dir: "left" | "right") => {
    const el = document.getElementById("faixa-aniv-scroll");
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-lg" />;
  }

  if (!temEventos) {
    return null;
  }

  const temHoje = eventos.some((e) => e.eh_hoje);

  return (
    <>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium capitalize">
              Aniversariantes e marcos de {mesAtual}
            </h3>
            {temHoje && (
              <span className="text-[11px] text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/40">
                celebrando hoje 🎉
              </span>
            )}
          </div>

          {eventos.length > 6 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => scrollRef("left")}
                className="h-7 w-7"
                aria-label="Rolar esquerda"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => scrollRef("right")}
                className="h-7 w-7"
                aria-label="Rolar direita"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div
          id="faixa-aniv-scroll"
          className="flex items-end gap-5 overflow-x-auto pb-2 pt-3 px-1 scrollbar-thin"
        >
          {eventos.map((ev) => (
            <AvatarEvento
              key={ev.key}
              evento={ev}
              onClick={() => {
                if (ev.user_id) setDrawerUserId(ev.user_id);
              }}
            />
          ))}
        </div>
      </div>

      <DrawerUsuario
        userId={drawerUserId}
        open={!!drawerUserId}
        onOpenChange={(open) => !open && setDrawerUserId(null)}
      />
    </>
  );
}
