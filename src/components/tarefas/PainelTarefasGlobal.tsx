/**
 * PainelTarefasGlobal — trilho fixo na borda direita + Sheet com as tarefas
 * abertas do usuário logado. Montado uma única vez no App.
 * Atalho: Ctrl/Cmd + J.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TarefaItem } from "@/components/tarefas/TarefaItem";
import { QuickAddTarefa } from "@/components/tarefas/QuickAddTarefa";
import { STATUS_ABERTOS, type Tarefa } from "@/hooks/tarefas/useTarefas";

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,motivo_estado,ordem,criado_em" as const;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PainelTarefasGlobal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tarefaId } = useTarefaAberta();
  const [aberto, setAberto] = useState(false);

  const { data: tarefas, isLoading } = useQuery({
    queryKey: ["tarefas", "painel-global", user?.id],
    enabled: !!user?.id,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await supabase
        .from("tarefas")
        .select(CAMPOS)
        .eq("responsavel_id", user!.id)
        .in("status", STATUS_ABERTOS)
        .order("data_limite", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.key === "j" || e.key === "J") || !(e.ctrlKey || e.metaKey)) return;
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || alvo?.isContentEditable) return;
      e.preventDefault();
      setAberto((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (tarefaId) setAberto(false);
  }, [tarefaId]);

  if (!user) return null;

  const hoje = hojeIso();
  const lista = tarefas ?? [];
  const temAtrasada = lista.some((t) => !!t.data_limite && t.data_limite < hoje);

  return (
    <>
      <button
        type="button"
        aria-label="Minhas tarefas"
        onClick={() => setAberto(true)}
        className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg border border-r-0 bg-card px-2 py-3 shadow-sm hover:bg-muted md:flex"
      >
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <span
          className={cn(
            "text-[11px] font-medium tabular-nums",
            temAtrasada ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {lista.length}
        </span>
      </button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Minhas tarefas</SheetTitle>
          </SheetHeader>

          <QuickAddTarefa />

          <div className="flex-1 space-y-2 overflow-y-auto">
            {isLoading && (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            )}

            {!isLoading && lista.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma tarefa aberta. Escreva acima para criar a primeira.
              </p>
            )}

            {!isLoading &&
              lista.map((t) => (
                <TarefaItem
                  key={t.id}
                  tarefa={t}
                  atrasada={!!t.data_limite && t.data_limite < hoje}
                />
              ))}
          </div>

          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAberto(false);
                navigate("/tarefas/minhas");
              }}
            >
              Ver todas
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
