import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

export type FunilFase = {
  sequencia: number;
  codigo: string;
  descricao: string;
  parados_aqui: number;
  ja_passaram: number;
  em_alerta: number;
  volumes_parados: number;
};

// Fases que a XPM grava em lote, depois do fato: nunca acumulam pedido parado.
const FASES_SEM_ACUMULO = new Set(["SEPARADO", "CONFERIDO", "EMBARCADO"]);

const nfInt = new Intl.NumberFormat("pt-BR");

export default function FunilFases({
  estagioAtivo,
  onSelecionar,
}: {
  estagioAtivo?: string | null;
  onSelecionar?: (codigo: string) => void;
}) {
  const funilQ = useQuery({
    queryKey: ["xpm-funil-fases"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_xpm_funil_fases")
        .select("*")
        .order("sequencia");
      if (error) throw error;
      return (data ?? []) as FunilFase[];
    },
  });

  if (funilQ.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          {(funilQ.error as Error)?.message ?? "Erro ao carregar o funil de fases"}
        </CardContent>
      </Card>
    );
  }

  if (funilQ.isLoading) return <Skeleton className="h-28 w-full" />;

  const fases = funilQ.data ?? [];

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {fases.map((f, i) => {
            const semAcumulo = FASES_SEM_ACUMULO.has(String(f.codigo).toUpperCase());
            const parados = Number(f.parados_aqui ?? 0);
            const ativo = estagioAtivo === f.codigo;
            const clicavel = !!onSelecionar && parados > 0;
            return (
              <Fragment key={f.codigo}>
                {i > 0 && (
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/50" />
                )}
                <button
                  type="button"
                  disabled={!clicavel}
                  onClick={clicavel ? () => onSelecionar!(f.codigo) : undefined}
                  className={`relative shrink-0 min-w-[120px] flex-1 rounded-md border px-3 py-2 text-left transition-colors ${
                    semAcumulo
                      ? "opacity-40 bg-background border-border"
                      : ativo
                        ? "bg-primary/20 border-primary"
                        : parados > 0
                          ? "bg-primary/10 border-primary/30"
                          : "bg-background border-border"
                  } ${clicavel ? "cursor-pointer" : "cursor-default"}`}
                >
                  {Number(f.em_alerta ?? 0) > 0 && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  )}
                  <div className="text-[12px] font-medium">{f.descricao}</div>
                  <div className="text-2xl font-semibold tabular-nums leading-tight">
                    {semAcumulo ? "—" : nfInt.format(parados)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {nfInt.format(Number(f.ja_passaram ?? 0))} passaram
                  </div>
                </button>
              </Fragment>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Separado, Conferido e Embarcado não acumulam: a XPM grava esses eventos em lote, depois do
          fato.
        </p>
      </CardContent>
    </Card>
  );
}
