import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { NovoProjetoDialog } from "@/components/tarefas/projetos/NovoProjetoDialog";
import { useMeusPapeisProjeto, usePapeisProjeto } from "@/hooks/tarefas/useProjetoMembros";
import { useAuth } from "@/contexts/AuthContext";
import {
  SAUDE_CLASSE, SAUDE_ROTULO, useContagemAbertasPorProjeto, useProjetosLista,
} from "@/hooks/tarefas/useProjetosTarefas";

export default function ProjetosGrid() {
  const { data: projetos, isLoading } = useProjetosLista();
  const { data: contagem } = useContagemAbertasPorProjeto();
  const nomePessoa = useNomePessoa();
  const { user } = useAuth();
  const { data: meusPapeis } = useMeusPapeisProjeto();
  const { data: papeis } = usePapeisProjeto();
  const [novo, setNovo] = useState(false);

  /** Vínculo do usuário logado com o projeto: responsável vence o papel de membro. */
  const vinculo = (projetoId: string, responsavelId: string | null): string | null => {
    if (user?.id && responsavelId === user.id) return "Responsável";
    const codigo = meusPapeis?.[projetoId];
    if (!codigo) return null;
    return papeis?.find((p) => p.codigo === codigo)?.nome ?? codigo;
  };

  return (
    <PageShell>
      <PageTitle
        titulo="Projetos"
        estado="Onde o trabalho ganha seção, responsável e prazo."
        acoes={
          <Button onClick={() => setNovo(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo projeto
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando projetos…</p>
      ) : (projetos ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <LayoutGrid className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum projeto ainda. Crie o primeiro e comece a organizar as tarefas em seções.
            </p>
            <Button onClick={() => setNovo(true)}>Novo projeto</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(projetos ?? []).map((p) => (
            <Link key={p.id} to={`/tarefas/projetos/${p.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 h-9 w-9 shrink-0 rounded-xl"
                      style={{ backgroundColor: p.cor }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.responsavel_id ? nomePessoa(p.responsavel_id) : "Sem responsável"}
                      </p>
                    </div>
                  </div>
                  {p.descricao && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{p.descricao}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", SAUDE_CLASSE[p.saude])}>
                      {SAUDE_ROTULO[p.saude]}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {vinculo(p.id, p.responsavel_id) && (
                        <Badge variant="secondary" className="text-[10px]">
                          {vinculo(p.id, p.responsavel_id)}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {contagem?.[p.id] ?? 0} abertas
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NovoProjetoDialog aberto={novo} onOpenChange={setNovo} />
    </PageShell>
  );
}
