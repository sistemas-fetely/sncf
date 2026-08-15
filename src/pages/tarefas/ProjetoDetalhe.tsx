import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { BoardProjeto } from "@/components/tarefas/projetos/BoardProjeto";
import { PainelProjeto } from "@/components/tarefas/projetos/PainelProjeto";
import { AutomacoesProjeto } from "@/components/tarefas/projetos/AutomacoesProjeto";
import { CamposProjeto } from "@/components/tarefas/projetos/CamposProjeto";
import { SAUDE_CLASSE, SAUDE_ROTULO, useProjeto } from "@/hooks/tarefas/useProjetosTarefas";

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data: projeto, isLoading, error } = useProjeto(id ?? null);
  const nomePessoa = useNomePessoa();

  if (!id) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/tarefas/projetos">
            <ArrowLeft className="mr-1 h-4 w-4" /> Projetos
          </Link>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Não foi possível carregar o projeto: {(error as Error).message}
        </p>
      )}

      <header className="flex flex-wrap items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-xl"
          style={{ backgroundColor: projeto?.cor ?? "hsl(var(--muted))" }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {isLoading ? "Carregando…" : projeto?.nome}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {projeto?.responsavel_id ? nomePessoa(projeto.responsavel_id) : "Sem responsável"}
            {projeto?.data_fim_prevista ? ` · fim previsto ${projeto.data_fim_prevista.slice(0, 10).split("-").reverse().join("/")}` : ""}
          </p>
        </div>
        {projeto && (
          <Badge variant="outline" className={cn("text-[10px]", SAUDE_CLASSE[projeto.saude])}>
            {SAUDE_ROTULO[projeto.saude]}
          </Badge>
        )}
      </header>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="campos">Campos</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="pt-4">
          <BoardProjeto projetoId={id} />
        </TabsContent>
        <TabsContent value="painel" className="pt-4">
          <PainelProjeto projetoId={id} />
        </TabsContent>
        <TabsContent value="automacoes" className="pt-4">
          <AutomacoesProjeto projetoId={id} />
        </TabsContent>
        <TabsContent value="campos" className="pt-4">
          <CamposProjeto projetoId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
