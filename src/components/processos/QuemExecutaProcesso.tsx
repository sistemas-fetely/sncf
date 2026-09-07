// "Quem executa" — caminho de volta entre processo e atribuição.
// O processo diz COMO se faz; a atribuição diz QUEM faz e QUANTO custa.
// Fonte única: vw_processo_atribuicao (leitura).
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo } from "@/components/ui/selo";
import { formatError } from "@/lib/format-error";

interface LinhaExecutor {
  processo_id: string;
  atribuicao_id: string;
  atribuicao_nome: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  tempo_unitario_min: number | null;
  fluxo_diario_estimado: number | null;
  minutos_fluxo_dia: number | null;
  ativo: boolean | null;
}

function num(v: number | null | undefined, sufixo = "") {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return sufixo ? `${txt} ${sufixo}` : txt;
}

function minutos(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function QuemExecutaProcesso({ processoId }: { processoId: string }) {
  const executores = useQuery({
    queryKey: ["processo-atribuicoes", processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<LinhaExecutor[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_processo_atribuicao")
        .select("*")
        .eq("processo_id", processoId)
        .order("pessoa_nome", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as LinhaExecutor[];
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Quem executa</h2>
          {executores.data && (
            <span className="text-xs text-muted-foreground">({executores.data.length})</span>
          )}
        </div>

        {executores.isLoading && <Skeleton className="h-20 w-full" />}
        {executores.isError && (
          <p className="text-sm text-destructive">{formatError(executores.error)}</p>
        )}

        {!executores.isLoading && (executores.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma atribuição declarada aponta para este processo ainda. Quem liga o processo a uma
            pessoa é o líder, na Mesa do Gestor.
          </p>
        )}

        {(executores.data ?? []).length > 0 && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {(executores.data ?? []).map((e) => (
              <div
                key={e.atribuicao_id}
                className={`space-y-2 rounded-lg border bg-card p-3 ${
                  e.ativo === false ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.pessoa_nome ?? "sem dono"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {e.atribuicao_nome ?? "—"}
                  </p>
                </div>
                {e.ativo === false && <Selo estado="muted">inativa</Selo>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <div>
                    <dt className="text-muted-foreground">Tempo unitário</dt>
                    <dd className="text-sm">{num(e.tempo_unitario_min, "min")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Volume diário</dt>
                    <dd className="text-sm">{num(e.fluxo_diario_estimado, "/dia")}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Carga por dia</dt>
                    <dd className="text-sm">{minutos(e.minutos_fluxo_dia)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
