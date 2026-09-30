import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { SeloBloqueio } from "@/components/tarefas/SeloBloqueio";
import { useBloqueioTarefa } from "@/hooks/tarefas/useTarefaBloqueio";
import { useStatusTarefaDim } from "@/hooks/tarefas/useStatusTarefaDim";
import { useAlterarStatusTarefa } from "@/hooks/tarefas/useTarefaMutations";
import { OPCOES_PRIORIDADE, PontoUrgente } from "@/lib/tarefas/prioridade";
import type { TarefaPrioridade, TarefaStatus } from "@/hooks/tarefas/useTarefas";
import { Campo, Secao, SeletorPessoa } from "./comuns";
import { BlocoDescricao } from "./BlocosBasicos";
import {
  useSalvarCampoTarefa, useSubtarefas, useTarefaDetalhe, type TarefaDetalhe,
} from "@/hooks/tarefas/useTarefaDetalhe";

/**
 * FICHA-DA-TAREFA (30/09/2026): peek = conferir e AJUSTAR. Página = construir.
 * Grava com os mesmos hooks da página (useSalvarCampoTarefa / useAlterarStatusTarefa),
 * que invalidam o prefixo ["tarefas"]. RACI, etiquetas, dependências, tempo,
 * anexos, comentários e histórico ficam só em /tarefas/:id.
 */

interface Props {
  tarefaId: string | null;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TarefaDetalhePainel({ tarefaId, aberto, onOpenChange }: Props) {
  return (
    <Sheet open={aberto} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {tarefaId ? <Conteudo tarefaId={tarefaId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Conteudo({ tarefaId }: { tarefaId: string }) {
  const { data: tarefa, isLoading, error, refetch } = useTarefaDetalhe(tarefaId);
  const navigate = useNavigate();

  const rodape = (
    <div className="border-t bg-background p-4">
      <Button variant="outline" className="w-full" onClick={() => navigate(`/tarefas/${tarefaId}`)}>
        <ExternalLink className="mr-1 h-4 w-4" /> Abrir tarefa completa
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <>
        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        {rodape}
      </>
    );
  }
  if (error || !tarefa) {
    return (
      <>
        <div className="flex-1 space-y-3 p-6">
          <p className="text-sm text-destructive">
            Não foi possível carregar a tarefa{error ? `: ${(error as Error).message}` : "."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar de novo</Button>
        </div>
        {rodape}
      </>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Cabecalho tarefa={tarefa} />
        <BlocoAjuste tarefa={tarefa} />
        <BlocoDescricao tarefa={tarefa} />
        <SubtarefasCompactas tarefaId={tarefa.id} />
      </div>
      {rodape}
    </>
  );
}

function Cabecalho({ tarefa }: { tarefa: TarefaDetalhe }) {
  const salvar = useSalvarCampoTarefa(tarefa.id);
  const { data: projetos } = useProjetos();
  const { data: bloqueio } = useBloqueioTarefa(tarefa.id);
  const { data: statusDim } = useStatusTarefaDim();
  const [titulo, setTitulo] = useState(tarefa.titulo);
  useEffect(() => setTitulo(tarefa.titulo), [tarefa.titulo]);

  const projeto = projetos?.find((p) => p.id === tarefa.projeto_id);
  const terminal = !!(statusDim ?? []).find((s) => s.codigo === tarefa.status)?.e_terminal;
  // Mesma regra da página: status vem da dimensão, nunca código escrito no front.
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
    <SheetHeader className="space-y-2 pr-6 text-left">
      <SheetTitle className="sr-only">{tarefa.titulo}</SheetTitle>
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={salvarTitulo}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setTitulo(tarefa.titulo);
        }}
        aria-label="Título da tarefa"
        className="h-auto border-transparent px-1 text-lg font-medium shadow-none focus-visible:border-input"
      />
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
          style={projeto?.cor ? { backgroundColor: `${projeto.cor}26`, color: projeto.cor } : undefined}
        >
          {projeto ? projeto.nome : "Sem projeto"}
        </span>
        {bloqueio?.bloqueada && <SeloBloqueio abertos={bloqueio.bloqueadores_abertos} />}
        {tarefa.tipo_tarefa !== "tarefa" && (
          <Badge variant="outline" className="text-[10px]">
            {tarefa.tipo_tarefa === "marco" ? "Marco" : "Aprovação"}
          </Badge>
        )}
        <div className="ml-auto">
          {terminal ? (
            <Button size="sm" variant="outline" disabled={salvar.isPending || !alvoReabrir}
              onClick={() => alvoReabrir && salvar.mutate({ status: alvoReabrir.codigo as TarefaStatus })}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reabrir
            </Button>
          ) : (
            <Button size="sm" disabled={salvar.isPending || !alvoConcluir}
              onClick={() => alvoConcluir && salvar.mutate({ status: alvoConcluir.codigo as TarefaStatus })}>
              <Check className="mr-1 h-4 w-4" /> Concluir tarefa
            </Button>
          )}
        </div>
      </div>
    </SheetHeader>
  );
}

function BlocoAjuste({ tarefa }: { tarefa: TarefaDetalhe }) {
  const salvar = useSalvarCampoTarefa(tarefa.id);
  const { data: statusDim } = useStatusTarefaDim();

  return (
    <Secao titulo="Ajuste rápido">
      <div className="space-y-3">
        <Campo rotulo="Status">
          <Select value={tarefa.status} onValueChange={(v) => salvar.mutate({ status: v as TarefaStatus })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(statusDim ?? []).map((s) => (
                <SelectItem key={s.codigo} value={s.codigo}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo rotulo="Prioridade">
          <Select value={tarefa.prioridade} onValueChange={(v) => salvar.mutate({ prioridade: v as TarefaPrioridade })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCOES_PRIORIDADE.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo rotulo="Data limite">
          <Input
            type="date" className="h-9 text-sm" value={tarefa.data_limite ?? ""}
            onChange={(e) => salvar.mutate({ data_limite: e.target.value || null })}
          />
        </Campo>
        {/* Responsável = R do RACI (responsavel_id); mesmo gravador do BlocoRaci. */}
        <Campo rotulo="Responsável">
          <SeletorPessoa valor={tarefa.responsavel_id} onChange={(id) => salvar.mutate({ responsavel_id: id })} />
        </Campo>
      </div>
    </Secao>
  );
}

function SubtarefasCompactas({ tarefaId }: { tarefaId: string }) {
  const { data: filhas } = useSubtarefas(tarefaId);
  const alterar = useAlterarStatusTarefa();
  const { data: statusDim } = useStatusTarefaDim();
  const lista = filhas ?? [];
  if (lista.length === 0) return null;

  const ehTerminal = (c: string) => !!(statusDim ?? []).find((s) => s.codigo === c)?.e_terminal;
  const alvoConcluir =
    (statusDim ?? []).find((s) => s.e_terminal && !s.exige_motivo) ??
    (statusDim ?? []).find((s) => s.e_terminal);
  const alvoReabrir =
    (statusDim ?? []).find((s) => s.e_aberto && !s.exige_motivo) ??
    (statusDim ?? []).find((s) => s.e_aberto);
  const feitas = lista.filter((t) => ehTerminal(t.status)).length;

  return (
    <Secao titulo="Subtarefas" acao={<span>{feitas}/{lista.length}</span>}>
      <div className="space-y-1">
        {lista.map((t) => {
          const feita = ehTerminal(t.status);
          const alvo = feita ? alvoReabrir : alvoConcluir;
          return (
            <label key={t.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-sm">
              <Checkbox
                checked={feita}
                disabled={alterar.isPending || !alvo}
                onCheckedChange={() => alvo && alterar.mutate({ id: t.id, status: alvo.codigo as TarefaStatus })}
                aria-label={feita ? "Reabrir subtarefa" : "Concluir subtarefa"}
              />
              {t.prioridade === "urgente" && <PontoUrgente className="mt-0" label="Urgente" />}
              <span className={feita ? "truncate line-through text-muted-foreground" : "truncate"}>{t.titulo}</span>
            </label>
          );
        })}
      </div>
    </Secao>
  );
}
