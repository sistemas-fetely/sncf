import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  useDecidirAprovacao, useSalvarCampoTarefa, useTarefaDetalhe,
  type TarefaDetalhe,
} from "@/hooks/tarefas/useTarefaDetalhe";
import {
  BlocoCampos, BlocoCamposPersonalizados, BlocoDescricao, BlocoEtiquetas, BlocoRaci, BlocoSubtarefas,
} from "./BlocosBasicos";
import {
  BlocoAnexos, BlocoComentarios, BlocoDependencias, BlocoHistorico, BlocoTempo,
} from "./BlocosExtras";

/** Fallback genérico para link de origem. Novos módulos entram aqui quando existirem. */
function resolverLinkOrigem(tarefa: TarefaDetalhe): string | null {
  if (tarefa.acao_url) return tarefa.acao_url;
  if (tarefa.modulo_origem === "pedidos" && tarefa.entidade_origem_id) {
    return `/pedidos/${tarefa.entidade_origem_id}`;
  }
  return null;
}

interface Props {
  tarefaId: string | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Painel autocontido: recebe só o id e busca todo o resto. */
export function TarefaDetalhePainel({ tarefaId, aberto, onOpenChange }: Props) {
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {tarefaId ? <Conteudo tarefaId={tarefaId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({ tarefaId }: { tarefaId: string }) {
  const { data: tarefa, isLoading, error } = useTarefaDetalhe(tarefaId);
  const { data: projetos } = useProjetos();
  const salvar = useSalvarCampoTarefa(tarefaId);
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState("");

  useEffect(() => setTitulo(tarefa?.titulo ?? ""), [tarefa?.titulo]);

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
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

  const linkOrigem = resolverLinkOrigem(tarefa);

  const salvarTitulo = () => {
    const t = titulo.trim();
    if (!t || t === tarefa.titulo) return setTitulo(tarefa.titulo);
    salvar.mutate({ titulo: t });
  };

  return (
    <div className="space-y-4 pb-10">
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="sr-only">Detalhe da tarefa</SheetTitle>
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={salvarTitulo}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setTitulo(tarefa.titulo);
          }}
          className="h-auto border-transparent px-1 text-lg font-medium shadow-none focus-visible:border-input"
        />
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground" style={{ color: projeto?.cor || undefined }}>
            {projeto ? `#${projeto.nome}` : "Sem projeto"}
          </span>
          {tarefa.tipo_tarefa !== "tarefa" && (
            <Badge variant="outline" className="text-[10px]">
              {tarefa.tipo_tarefa === "marco" ? "Marco" : "Aprovação"}
            </Badge>
          )}
          {linkOrigem && (
            <Button size="sm" variant="outline" onClick={() => navigate(linkOrigem)}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir origem
            </Button>
          )}
        </div>
      </SheetHeader>

      {tarefa.tipo_tarefa === "aprovacao" && <BlocoAprovacao tarefaId={tarefaId} statusAtual={tarefa.aprovacao_status} />}

      {tarefa.status === "cancelada" && tarefa.motivo_cancelamento && (
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Motivo do cancelamento</p>
          <p className="mt-1 text-sm">{tarefa.motivo_cancelamento}</p>
        </div>
      )}

      <BlocoCampos tarefa={tarefa} />
      <BlocoDescricao tarefa={tarefa} />
      <BlocoSubtarefas tarefa={tarefa} />
      <BlocoRaci tarefa={tarefa} />
      <BlocoEtiquetas tarefa={tarefa} />
      <BlocoCamposPersonalizados tarefa={tarefa} />
      <BlocoDependencias tarefa={tarefa} />
      <BlocoTempo tarefa={tarefa} />
      <BlocoAnexos tarefa={tarefa} />
      <BlocoComentarios tarefa={tarefa} />
      <BlocoHistorico tarefa={tarefa} />
    </div>
  );
}

function BlocoAprovacao({ tarefaId, statusAtual }: { tarefaId: string; statusAtual: string | null }) {
  const decidir = useDecidirAprovacao(tarefaId);
  const [comentario, setComentario] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm font-medium">
        Aprovação {statusAtual ? `· ${statusAtual}` : "· pendente"}
      </p>
      <Textarea
        rows={2} placeholder="Comentário da decisão (opcional)"
        value={comentario} onChange={(e) => setComentario(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm" disabled={decidir.isPending}
          onClick={() => decidir.mutate({ decisao: "aprovada", comentario })}
        >
          Aprovar
        </Button>
        <Button
          size="sm" variant="destructive" disabled={decidir.isPending}
          onClick={() => decidir.mutate({ decisao: "rejeitada", comentario })}
        >
          Rejeitar
        </Button>
      </div>
    </div>
  );
}
