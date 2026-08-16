import { useState } from "react";
import { Cake, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAniversariantesDoMes, type EventoDoMes } from "@/hooks/useAniversariantesDoMes";
import { DrawerUsuario } from "@/components/DrawerUsuario";

function initials(nome: string): string {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// ═══ Item de hoje — destaque dourado compacto ═══
function ItemDestaqueHoje({ evento, onClick }: { evento: EventoDoMes; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full relative rounded-lg bg-gradient-to-br from-warning to-warning border border-warning/40 p-2.5 hover:shadow-sm transition-all hover:-translate-y-0.5 text-left"
    >
      <div className="absolute -top-2 left-3 text-base leading-none">👑</div>
      <div className="flex items-center gap-2.5">
        <Avatar className="h-10 w-10 ring-2 ring-warning ring-offset-2 ring-offset-background shrink-0">
          <AvatarImage src={evento.foto_url ?? undefined} alt={evento.nome} className="object-cover" />
          <AvatarFallback className="bg-warning/15 text-warning font-medium text-xs">
            {initials(evento.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-warning truncate leading-tight">
            {evento.nome}
          </p>
          <p className="text-[11px] text-warning font-medium flex items-center gap-1 leading-tight mt-0.5">
            {evento.tipo_evento === "aniversario" ? (
              <Cake className="h-2.5 w-2.5" />
            ) : (
              <Sparkles className="h-2.5 w-2.5" />
            )}
            {evento.label_destaque}
          </p>
        </div>
      </div>
    </button>
  );
}

// ═══ Item compacto regular (linha) ═══
function ItemCompacto({ evento, onClick }: { evento: EventoDoMes; onClick: () => void }) {
  const Icon = evento.tipo_evento === "aniversario" ? Cake : Sparkles;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-1.5 py-1 px-1 rounded-md hover:bg-muted/50 transition-colors text-left"
      title={`${evento.nome} · dia ${evento.dia} · ${evento.tipo_evento === "aniversario" ? "aniversário" : evento.subtitulo}`}
    >
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={evento.foto_url ?? undefined} alt={evento.nome} className="object-cover" />
        <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-medium">
          {initials(evento.nome)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate leading-tight">
          {evento.nome.split(" ")[0]}
        </p>
        {evento.departamento && (
          <p className="text-[9px] text-muted-foreground/80 truncate leading-tight">
            {evento.departamento}
          </p>
        )}
        <p className="text-[9px] text-muted-foreground flex items-center gap-0.5 leading-tight mt-0.5">
          <Icon className="h-2 w-2 shrink-0" />
          <span className="truncate">dia {evento.dia}</span>
        </p>
      </div>
    </button>
  );
}

export function ListaAniversariantesMes() {
  const { data: eventos, isLoading } = useAniversariantesDoMes();
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);

  const mesAtual = MESES_PT[new Date().getMonth()];

  if (isLoading) {
    return (
      <div className="h-full min-h-[220px] rounded-xl border border-border bg-card p-3">
        <Skeleton className="h-5 w-36 mb-3" />
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      </div>
    );
  }

  if (!eventos || eventos.length === 0) {
    return (
      <div className="h-full min-h-[220px] rounded-xl border border-dashed border-muted-foreground/30 bg-card/50 p-4 flex flex-col items-center justify-center text-center">
        <Cake className="h-5 w-5 text-muted-foreground/60 mb-2" />
        <p className="text-[11px] text-muted-foreground">
          Sem aniversariantes em {mesAtual} — mas sempre tem algo pra comemorar.
        </p>
      </div>
    );
  }

  const deHoje = eventos.filter((e) => e.eh_hoje);
  const demais = eventos.filter((e) => !e.eh_hoje);

  return (
    <>
      <div className="h-full min-h-[220px] rounded-xl border border-border bg-gradient-to-br from-warning via-card to-info p-3 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          <Cake className="h-3.5 w-3.5 text-warning" />
          <h3 className="text-[13px] font-medium">
            Venha Celebrar Comigo! 🎂
          </h3>
        </div>

        {/* Destaque hoje */}
        {deHoje.length > 0 && (
          <div className="mb-2 space-y-1.5 shrink-0">
            {deHoje.map((ev) => (
              <ItemDestaqueHoje
                key={ev.key}
                evento={ev}
                onClick={() => ev.user_id && setDrawerUserId(ev.user_id)}
              />
            ))}
          </div>
        )}

        {/* Separador sutil se tiver ambos */}
        {deHoje.length > 0 && demais.length > 0 && (
          <div className="flex items-center gap-2 my-1.5 shrink-0">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">outros do mês</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Grid adaptável: 1-2-3 colunas conforme largura. Scroll só se não couber. */}
        {demais.length > 0 && (
          <div className="flex-1 overflow-y-auto -mx-1 px-1 min-h-0" style={{ scrollbarWidth: "thin" }}>
            <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {demais.map((ev) => (
                <ItemCompacto
                  key={ev.key}
                  evento={ev}
                  onClick={() => ev.user_id && setDrawerUserId(ev.user_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <DrawerUsuario
        userId={drawerUserId}
        open={!!drawerUserId}
        onOpenChange={(open) => !open && setDrawerUserId(null)}
      />
    </>
  );
}
