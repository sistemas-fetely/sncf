import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { BoardProjeto } from "@/components/tarefas/projetos/BoardProjeto";
import { PainelProjeto } from "@/components/tarefas/projetos/PainelProjeto";
import { AutomacoesProjeto } from "@/components/tarefas/projetos/AutomacoesProjeto";
import { CamposProjeto } from "@/components/tarefas/projetos/CamposProjeto";
import { PessoasProjeto } from "@/components/tarefas/projetos/PessoasProjeto";
import { SalvarProjetoComoTemplateDialog } from "@/components/tarefas/templates/SalvarProjetoComoTemplateDialog";
import { SAUDE_CLASSE, SAUDE_ROTULO, useProjeto } from "@/hooks/tarefas/useProjetosTarefas";

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { data: projeto, isLoading, error } = useProjeto(id ?? null);
  const nomePessoa = useNomePessoa();
  const [salvarTemplate, setSalvarTemplate] = useState(false);

  if (!id) return null;

  return (
    <PageShell>
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

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-xl"
          style={{ backgroundColor: projeto?.cor ?? "hsl(var(--muted))" }}
        />
        <PageTitle
          className="min-w-0 flex-1"
          titulo={isLoading ? "Carregando…" : projeto?.nome ?? ""}
          estado={
            <>
              {projeto?.responsavel_id ? nomePessoa(projeto.responsavel_id) : "Sem responsável"}
              {projeto?.data_fim_prevista ? ` · fim previsto ${projeto.data_fim_prevista.slice(0, 10).split("-").reverse().join("/")}` : ""}
            </>
          }
          acoes={
            <>
              <Button variant="outline" size="sm" onClick={() => setSalvarTemplate(true)}>
                <Save className="mr-1 h-3.5 w-3.5" /> Salvar como template
              </Button>
              {projeto && (
                <Badge variant="outline" className={cn("text-[10px]", SAUDE_CLASSE[projeto.saude])}>
                  {SAUDE_ROTULO[projeto.saude]}
                </Badge>
              )}
            </>
          }
        />
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="campos">Campos</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
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

      <SalvarProjetoComoTemplateDialog
        projetoId={id}
        nomeSugerido={projeto?.nome ?? ""}
        aberto={salvarTemplate}
        onOpenChange={setSalvarTemplate}
      />
    </PageShell>
  );
}
