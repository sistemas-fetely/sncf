import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TarefaItem } from "@/components/tarefas/TarefaItem";
import { QuickAddTarefa } from "@/components/tarefas/QuickAddTarefa";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { STATUS_ABERTOS, type Tarefa, type TarefaStatus } from "@/hooks/tarefas/useTarefas";
import { STATUS_ROTULO } from "@/components/tarefas/detalhe/comuns";

const CAMPOS =
  "id,titulo,descricao,status,prioridade,projeto_id,secao_id,parent_id,responsavel_id,data_inicio,data_limite,hora_limite,data_conclusao,estimativa_horas,acao_url,ordem,criado_em" as const;

type Filtro = "abertas" | TarefaStatus;

function useMinhasTarefas(userId: string | undefined, filtro: Filtro) {
  return useQuery({
    queryKey: ["tarefas", "minhas", userId, filtro],
    enabled: !!userId,
    queryFn: async (): Promise<Tarefa[]> => {
      let q = supabase.from("tarefas").select(CAMPOS).eq("responsavel_id", userId!);
      q = filtro === "abertas" ? q.in("status", STATUS_ABERTOS) : q.eq("status", filtro);
      const { data, error } = await q
        .order("data_limite", { ascending: true, nullsFirst: false })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });
}

export default function MinhasTarefasNovo() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const { data: tarefas, isLoading } = useMinhasTarefas(user?.id, filtro);
  const { data: projetos } = useProjetos();

  const grupos = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const t of tarefas ?? []) {
      const chave = t.projeto_id ?? "__sem__";
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === "__sem__" ? 1 : b === "__sem__" ? -1 : 0));
  }, [tarefas]);

  const nomeProjeto = (id: string) =>
    id === "__sem__" ? "Sem projeto" : projetos?.find((p) => p.id === id)?.nome ?? "Projeto";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Minhas Tarefas</h1>
        <p className="text-sm text-muted-foreground">
          Tudo sob sua responsabilidade, agrupado por projeto.
        </p>
      </header>

      <Card>
        <CardContent className="pt-4">
          <QuickAddTarefa />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="h-8 w-52 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            {Object.entries(STATUS_ROTULO).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{tarefas?.length ?? 0} tarefa(s)</span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && grupos.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada por aqui.</p>
      )}

      <div className="space-y-6">
        {grupos.map(([chave, lista]) => (
          <section key={chave} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {nomeProjeto(chave)} · {lista.length}
            </h2>
            <div className="space-y-2">
              {lista.map((t) => (
                <TarefaItem key={t.id} tarefa={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
