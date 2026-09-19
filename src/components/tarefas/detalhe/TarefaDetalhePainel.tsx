import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { SeloBloqueio } from "@/components/tarefas/SeloBloqueio";
import { useBloqueioTarefa } from "@/hooks/tarefas/useTarefaBloqueio";
import { useNomePessoa, useStatusRotulo } from "./comuns";
import { useSubtarefas, useTarefaDetalhe } from "@/hooks/tarefas/useTarefaDetalhe";

/**
 * FICHA-DA-TAREFA (19/09/2026): a edição mora em /tarefas/:id. Este painel é
 * PEEK DE LEITURA — espiada rápida onde a tarefa é acessório de outro módulo
 * (ficha do pedido, título, notificação). Quem edita, abre a página.
 * Ele não é mais montado globalmente: cada superfície monta com estado local.
 */

interface Props {
  tarefaId: string | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TarefaDetalhePainel({ tarefaId, aberto, onOpenChange }: Props) {
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {tarefaId ? <Conteudo tarefaId={tarefaId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({ tarefaId }: { tarefaId: string }) {
  const { data: tarefa, isLoading, error } = useTarefaDetalhe(tarefaId);
  const { data: projetos } = useProjetos();
  const { data: filhas } = useSubtarefas(tarefaId);
  const { data: bloqueio } = useBloqueioTarefa(tarefaId);
  const rotuloStatus = useStatusRotulo();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error || !tarefa) {
    return (
      <p className="py-6 text-sm text-destructive">
        Não foi possível carregar a tarefa{error ? `: ${(error as Error).message}` : "."}
      </p>
    );
  }

  const projeto = projetos?.find((p) => p.id === tarefa.projeto_id);
  const lista = filhas ?? [];
  const feitas = lista.filter((t) => t.status === "concluida").length;

  return (
    <div className="space-y-4 pb-8">
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="text-lg font-medium">{tarefa.titulo}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
            style={
              projeto?.cor
                ? { backgroundColor: `${projeto.cor}26`, color: projeto.cor }
                : undefined
            }
          >
            {projeto ? projeto.nome : "Sem projeto"}
          </span>
          {bloqueio?.bloqueada && <SeloBloqueio abertos={bloqueio.bloqueadores_abertos} />}
          {tarefa.tipo_tarefa !== "tarefa" && (
            <Badge variant="outline" className="text-[10px]">
              {tarefa.tipo_tarefa === "marco" ? "Marco" : "Aprovação"}
            </Badge>
          )}
        </div>
      </SheetHeader>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="space-y-1">
          <span className="block text-xs text-muted-foreground">Status</span>
          <span>{rotuloStatus(tarefa.status)}</span>
        </div>
        <div className="space-y-1">
          <span className="block text-xs text-muted-foreground">Data limite</span>
          <span>{tarefa.data_limite ?? "—"}</span>
        </div>
        <div className="col-span-2 space-y-1">
          <span className="block text-xs text-muted-foreground">Responsável</span>
          <NomeResponsavel id={tarefa.responsavel_id} />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-4">
        <h3 className="text-[15px] font-medium">Descrição</h3>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {tarefa.descricao?.trim() || "Sem descrição."}
        </p>
      </div>

      {lista.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          Subtarefas: {feitas}/{lista.length} concluídas
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => navigate(`/tarefas/${tarefaId}`)}>
        <ExternalLink className="mr-1 h-4 w-4" /> Abrir tarefa
      </Button>
    </div>
  );
}

function NomeResponsavel({ id }: { id: string | null }) {
  const nome = useNomePessoa();
  return <span>{nome(id)}</span>;
}
