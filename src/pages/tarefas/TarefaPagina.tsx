import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, RotateCcw, Check } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useProjetos, useSecoes } from "@/hooks/tarefas/useTarefasCatalogos";
import { LinkOrigemTarefa } from "@/components/tarefas/LinkOrigemTarefa";
import { SeloBloqueio } from "@/components/tarefas/SeloBloqueio";
import { useBloqueioTarefa } from "@/hooks/tarefas/useTarefaBloqueio";
import { useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import { useStatusRotulo } from "@/components/tarefas/detalhe/comuns";
import {
  useDecidirAprovacao, useSalvarCampoTarefa, useTarefaDetalhe,
  type TarefaDetalhe,
} from "@/hooks/tarefas/useTarefaDetalhe";
import type { TarefaStatus } from "@/hooks/tarefas/useTarefas";
import {
  BlocoCampos, BlocoCamposPersonalizados, BlocoDescricao, BlocoEtiquetas, BlocoRaci, BlocoSubtarefas,
} from "@/components/tarefas/detalhe/BlocosBasicos";
import {
  BlocoAnexos, BlocoComentarios, BlocoDependencias, BlocoHistorico, BlocoTempo,
} from "@/components/tarefas/detalhe/BlocosExtras";

/**
 * FICHA-DA-TAREFA (19/09/2026): a tarefa tem página própria. A gaveta virou peek
 * de leitura. Os 11 blocos são os mesmos e continuam recebendo só `tarefa` —
 * aqui muda a casca, o arranjo e o tratamento visual, nunca a lógica do bloco.
 * Não existe botão Salvar: tudo grava em onBlur/onChange.
 */

/** Fallback genérico para link de origem. Novos módulos entram aqui quando existirem. */
function resolverLinkOrigem(tarefa: TarefaDetalhe): string | null {
  if (tarefa.acao_url) return tarefa.acao_url;
  if (tarefa.modulo_origem === "pedidos" && tarefa.entidade_origem_id) {
    return `/pedidos/${tarefa.entidade_origem_id}`;
  }
  return null;
}

export default function TarefaPagina() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tarefa, isLoading, error, refetch } = useTarefaDetalhe(id ?? null);
  const { data: projetos } = useProjetos();
  const { data: statusDim } = useStatusTarefaDim();
  const { data: bloqueio } = useBloqueioTarefa(id ?? null);
  const rotuloStatus = useStatusRotulo();
  const salvar = useSalvarCampoTarefa(id ?? "");
  const [titulo, setTitulo] = useState("");

  useEffect(() => setTitulo(tarefa?.titulo ?? ""), [tarefa?.titulo]);

  if (isLoading) {
    return (
      <PageShell>
        <div className="space-y-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-28 w-full" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Skeleton className="h-64 w-full xl:col-span-2" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </PageShell>
    );
  }

  // 404: id não existe (ou foi removido) — o single() do detalhe devolve erro sem linha.
  const semLinha =
    !!error && /no rows|0 rows|PGRST116/i.test((error as Error).message ?? "");

  if (semLinha || (!error && !tarefa)) {
    return (
      <PageShell variant="foco">
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Esta tarefa não existe ou foi removida.
          </p>
          <Button className="mt-3" variant="outline" onClick={() => navigate("/tarefas/minhas")}>
            Ver minhas tarefas
          </Button>
        </div>
      </PageShell>
    );
  }

  if (error || !tarefa) {
    return (
      <PageShell variant="foco">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            Não foi possível carregar a tarefa: {(error as Error)?.message ?? "erro desconhecido"}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      </PageShell>
    );
  }

  const projeto = projetos?.find((p) => p.id === tarefa.projeto_id);
  const linkOrigem = resolverLinkOrigem(tarefa);
  const statusAtual = (statusDim ?? []).find((s) => s.codigo === tarefa.status);
  const terminal = !!statusAtual?.e_terminal;
  // DIMENSÃO-VIA-TABELA: concluir/reabrir levam ao status da dimensão, nunca a
  // um código escrito no front.
  const alvoConcluir =
    (statusDim ?? []).find((s) => s.e_terminal && !s.exige_motivo) ??
    (statusDim ?? []).find((s) => s.e_terminal);
  const alvoReabrir =
    (statusDim ?? []).find((s) => s.e_aberto && !s.exige_motivo) ??
    (statusDim ?? []).find((s) => s.e_aberto);

  const salvarTitulo = () => {
    const t = titulo.trim();
    if (!t || t === tarefa.titulo) return setTitulo(tarefa.titulo);
    salvar.mutate({ titulo: t });
  };

  return (
    <PageShell>
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voltar"
          className="mt-1 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={salvarTitulo}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setTitulo(tarefa.titulo);
            }}
            aria-label="Título da tarefa"
            className="h-auto border-transparent px-1 text-2xl font-medium shadow-none focus-visible:border-input"
          />
          <div className="flex flex-wrap items-center gap-2 px-1">
            {/* Projeto é SELO: cor do dado como fundo tingido, texto legível. */}
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
            {tarefa.secao_id && <SeloSecao tarefa={tarefa} />}
            {bloqueio?.bloqueada && <SeloBloqueio abertos={bloqueio.bloqueadores_abertos} />}
            {tarefa.tipo_tarefa !== "tarefa" && (
              <Badge variant="outline" className="text-[10px]">
                {tarefa.tipo_tarefa === "marco" ? "Marco" : "Aprovação"}
              </Badge>
            )}
            <LinkOrigemTarefa acaoUrl={linkOrigem} moduloOrigem={tarefa.modulo_origem} />
            {linkOrigem && (
              <Button size="sm" variant="ghost" onClick={() => navigate(linkOrigem)}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir origem
              </Button>
            )}
          </div>
        </div>

        {/* Única ação primary da página. Salvar não existe: tudo grava no blur. */}
        {terminal ? (
          <Button
            variant="outline"
            className="shrink-0"
            disabled={salvar.isPending || !alvoReabrir}
            onClick={() => alvoReabrir && salvar.mutate({ status: alvoReabrir.codigo as TarefaStatus })}
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Reabrir tarefa
          </Button>
        ) : (
          <Button
            className="shrink-0"
            disabled={salvar.isPending || !alvoConcluir}
            onClick={() => alvoConcluir && salvar.mutate({ status: alvoConcluir.codigo as TarefaStatus })}
          >
            <Check className="mr-1 h-4 w-4" /> Concluir tarefa
          </Button>
        )}
      </div>

      {tarefa.tipo_tarefa === "aprovacao" && (
        <BlocoAprovacao tarefaId={tarefa.id} statusAtual={tarefa.aprovacao_status} />
      )}

      {tarefa.motivo_estado && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">Motivo · {rotuloStatus(tarefa.status)}</p>
          <p className="mt-1 text-sm">{tarefa.motivo_estado}</p>
        </div>
      )}

      {/* (a) faixa de propriedades, largura cheia */}
      <div className="rounded-lg border border-border bg-card p-4">
        <BlocoCampos tarefa={tarefa} />
      </div>

      {/* (b) duas colunas; em tela estreita colapsa na ordem da leitura */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <BlocoDescricao tarefa={tarefa} />
          <BlocoSubtarefas tarefa={tarefa} />
          <BlocoComentarios tarefa={tarefa} />
          <BlocoAnexos tarefa={tarefa} />
        </div>
        <div className="space-y-4 xl:col-span-1">
          <BlocoRaci tarefa={tarefa} />
          <BlocoEtiquetas tarefa={tarefa} />
          <BlocoCamposPersonalizados tarefa={tarefa} />
          <BlocoDependencias tarefa={tarefa} />
          <BlocoTempo tarefa={tarefa} />
          <BlocoHistorico tarefa={tarefa} />
        </div>
      </div>
    </PageShell>
  );
}

/** Seção como selo — rótulo sempre do catálogo do projeto, nunca texto fixo. */
function SeloSecao({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: secoes } = useSecoes(tarefa.projeto_id);
  const secao = secoes?.find((s) => s.id === tarefa.secao_id);
  if (!secao) return null;
  return (
    <Badge variant="secondary" className="text-[11px]">
      {secao.nome}
    </Badge>
  );
}

function BlocoAprovacao({ tarefaId, statusAtual }: { tarefaId: string; statusAtual: string | null }) {
  const decidir = useDecidirAprovacao(tarefaId);
  const [comentario, setComentario] = useState("");

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <p className="text-sm font-medium">
        Aprovação {statusAtual ? `· ${statusAtual}` : "· pendente"}
      </p>
      <Textarea
        rows={2}
        placeholder="Comentário da decisão (opcional)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={decidir.isPending}
          onClick={() => decidir.mutate({ decisao: "aprovada", comentario })}
        >
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={decidir.isPending}
          onClick={() => decidir.mutate({ decisao: "rejeitada", comentario })}
        >
          Rejeitar
        </Button>
      </div>
    </div>
  );
}
