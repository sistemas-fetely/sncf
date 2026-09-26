import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicacoesAtivas } from "@/hooks/useMural";
import { CardCelebracao } from "./CardCelebracao";

interface Props {
  /** Intervalo de rotação em ms. Default 8000. */
  intervalo?: number;
  /** Se true, mostra controles manuais. Default true. */
  controlesManuais?: boolean;
}

export function MuralRotativo({ intervalo = 8000, controlesManuais = true }: Props) {
  const { data: publicacoes, isLoading, isError, error } = usePublicacoesAtivas(20);
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);

  const total = publicacoes?.length || 0;

  useEffect(() => {
    if (pausado || total <= 1) return;
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % total);
    }, intervalo);
    return () => clearInterval(id);
  }, [pausado, total, intervalo]);

  useEffect(() => {
    if (indice >= total && total > 0) setIndice(0);
  }, [total, indice]);

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center">
        <p className="text-sm text-destructive">Não foi possível carregar o mural: {(error as Error)?.message}</p>
      </div>
    );
  }

  if (!publicacoes || publicacoes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-muted-foreground/30 p-6 text-center">
        <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Sem celebrações agora — mas sempre tem algo pra comemorar por aqui. 💚
        </p>
      </div>
    );
  }

  const atual = publicacoes[indice];

  return (
    <div
      className="relative group h-full flex flex-col"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <div className="flex-1 min-h-0">
        <CardCelebracao publicacao={atual} />
      </div>

      {controlesManuais && publicacoes.length > 1 && (
        <>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIndice((i) => (i - 1 + total) % total)}
              className="h-8 w-8 rounded-full bg-background/80 hover:bg-background shadow-sm ml-[-8px]"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIndice((i) => (i + 1) % total)}
              className="h-8 w-8 rounded-full bg-background/80 hover:bg-background shadow-sm mr-[-8px]"
              aria-label="Próximo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-3">
            {publicacoes.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndice(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === indice
                    ? "bg-primary w-6"
                    : "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Ir para card ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
