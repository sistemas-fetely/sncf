import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUpRight, Ban, CheckCircle2, ChevronDown, Download, Pause, Play, Trash2, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";
import type { TarefaDetalhe } from "@/hooks/tarefas/useTarefaDetalhe";
import {
  abrirAnexo, useAnexos, useApontamentos, useComentarios,
  useHistoricoTarefa, useMutarAnexos, useMutarApontamentos, useMutarComentarios,
  useMutarTimer, useTimerAtivo,
} from "@/hooks/tarefas/useTarefaDetalheExtras";
import {
  useDependenciasDetalhe, useMutarDependenciaTarefa,
} from "@/hooks/tarefas/useTarefaBloqueio";
import { SeloBloqueio } from "@/components/tarefas/SeloBloqueio";
import { SeletorTarefaDependencia } from "./SeletorTarefaDependencia";
import { Secao, useNomePessoa, useStatusRotulo } from "./comuns";

function dataHora(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/* ------------------------------------------------------- dependências ----- */

/**
 * Os dois lados do bloqueio. "Depende de" mostra quem trava esta tarefa;
 * "Está travando" mostra quem espera por ela. Resolvidos ficam esmaecidos,
 * nunca escondidos — a história de quem já saiu do caminho também conta.
 */
export function BlocoDependencias({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { abrir } = useTarefaAberta();
  const { data, isLoading, error } = useDependenciasDetalhe(tarefa.id);
  const { adicionar, remover } = useMutarDependenciaTarefa(tarefa.id);

  const dependeDe = data?.dependeDe ?? [];
  const travando = data?.travando ?? [];
  const abertos = dependeDe.filter((d) => !d.bloqueador_resolvido).length;

  return (
    <Secao
      titulo="Dependências"
      acao={
        <SeletorTarefaDependencia
          tarefaId={tarefa.id}
          jaLigados={dependeDe.map((d) => d.depende_de_id)}
          disabled={adicionar.isPending}
          onEscolher={(id) => adicionar.mutate(id)}
        />
      }
    >
      {error && (
        <p className="text-xs text-destructive">
          Não foi possível carregar as dependências: {(error as Error).message}
        </p>
      )}
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

      {abertos > 0 && <SeloBloqueio abertos={abertos} />}

      <div className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Depende de
        </span>
        {dependeDe.length === 0 && (
          <p className="text-xs text-muted-foreground">Não espera nenhuma tarefa.</p>
        )}
        {dependeDe.map((d) => (
          <div
            key={d.id}
            className={cn(
              "flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm",
              d.bloqueador_resolvido && "opacity-55",
            )}
          >
            {d.bloqueador_resolvido ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Ban className="h-3.5 w-3.5 shrink-0 text-destructive" />
            )}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left hover:underline"
              onClick={() => abrir(d.depende_de_id)}
            >
              {d.bloqueador_titulo ?? "(sem título)"}
            </button>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {d.bloqueador_status_nome ?? "—"}
            </Badge>
            <button
              type="button"
              aria-label="Remover dependência"
              disabled={remover.isPending}
              onClick={() => remover.mutate(d.id)}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-1 pt-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Está travando
        </span>
        {travando.length === 0 && (
          <p className="text-xs text-muted-foreground">Ninguém está esperando por esta tarefa.</p>
        )}
        {travando.map((d) => (
          <div
            key={d.id}
            className={cn(
              "flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm",
              d.bloqueada_resolvida && "opacity-55",
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left hover:underline"
              onClick={() => abrir(d.tarefa_id)}
            >
              {d.bloqueada_titulo ?? "(sem título)"}
            </button>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {d.bloqueada_status_nome ?? "—"}
            </Badge>
          </div>
        ))}
      </div>
    </Secao>
  );
}

/* -------------------------------------------------------------- tempo ----- */

export function BlocoTempo({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: apontamentos } = useApontamentos(tarefa.id);
  const { criar, apagar } = useMutarApontamentos(tarefa.id);
  const { data: timer } = useTimerAtivo();
  const { iniciar, parar } = useMutarTimer(tarefa.id);
  const nome = useNomePessoa();
  const { user } = useAuth();

  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const [data, setData] = useState(hojeISO);
  const [horas, setHoras] = useState("");
  const [descricao, setDescricao] = useState("");

  const realizado = (apontamentos ?? []).reduce((s, a) => s + Number(a.horas), 0);
  const rodandoAqui = timer?.tarefa_id === tarefa.id;

  return (
    <Secao
      titulo="Tempo"
      acao={
        rodandoAqui ? (
          <Button size="sm" variant="outline" onClick={() => parar.mutate(timer!.iniciado_em)}>
            <Pause className="mr-1 h-3.5 w-3.5" /> Parar
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => iniciar.mutate()}>
            <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
          </Button>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        Estimado {tarefa.estimativa_horas ?? 0}h · Realizado {realizado.toFixed(2)}h
        {timer && !rodandoAqui && " · cronômetro rodando em outra tarefa"}
        {rodandoAqui && ` · rodando desde ${dataHora(timer!.iniciado_em)}`}
      </p>

      <div className="space-y-1">
        {(apontamentos ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm">
            <span className="w-20 shrink-0 text-muted-foreground">
              {format(parseISO(a.data), "dd/MM/yy")}
            </span>
            <span className="w-14 shrink-0">{Number(a.horas).toFixed(2)}h</span>
            <span className="min-w-0 flex-1 truncate">{a.descricao ?? "—"}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{nome(a.user_id)}</span>
            {a.user_id === user?.id && (
              <button type="button" aria-label="Apagar apontamento" onClick={() => apagar.mutate(a.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
        {(apontamentos ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem apontamentos.</p>}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          criar.mutate(
            { data, horas: Number(horas), descricao },
            { onSuccess: () => { setHoras(""); setDescricao(""); } },
          );
        }}
      >
        <Input type="date" className="h-8 w-36 text-sm" value={data} onChange={(e) => setData(e.target.value)} />
        <Input
          type="number" step="0.25" min="0" placeholder="horas" className="h-8 w-24 text-sm"
          value={horas} onChange={(e) => setHoras(e.target.value)}
        />
        <Input
          className="h-8 flex-1 text-sm" placeholder="descrição (opcional)"
          value={descricao} onChange={(e) => setDescricao(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!Number(horas) || criar.isPending}>
          Apontar
        </Button>
      </form>
    </Secao>
  );
}

/* ------------------------------------------------------------- anexos ----- */

export function BlocoAnexos({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: anexos } = useAnexos(tarefa.id);
  const { enviar, apagar } = useMutarAnexos(tarefa.id);

  return (
    <Secao titulo="Anexos">
      <div className="space-y-1">
        {(anexos ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{a.nome_arquivo}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {a.tamanho_bytes ? `${Math.round(a.tamanho_bytes / 1024)} KB` : ""}
            </span>
            <button type="button" aria-label="Baixar anexo" onClick={() => void abrirAnexo(a.storage_path)}>
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button type="button" aria-label="Apagar anexo" onClick={() => apagar.mutate(a)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
        {(anexos ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem anexos.</p>}
      </div>
      <Input
        type="file" className="h-8 text-sm" disabled={enviar.isPending}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) enviar.mutate(arquivo, { onSuccess: () => { e.target.value = ""; } });
        }}
      />
    </Secao>
  );
}

/* -------------------------------------------------------- comentários ----- */

/** extrai ids das pessoas citadas com @Nome */
function extrairMencionados(texto: string, pessoas: { id: string; nome: string }[]): string[] {
  const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const alvo = chave(texto);
  return pessoas.filter((p) => alvo.includes("@" + chave(p.nome).split(" ")[0])).map((p) => p.id);
}

export function BlocoComentarios({ tarefa }: { tarefa: TarefaDetalhe }) {
  const { data: comentarios } = useComentarios(tarefa.id);
  const { criar, editar, apagar } = useMutarComentarios(tarefa.id);
  const { data: pessoas } = usePessoasSistema();
  const nome = useNomePessoa();
  const { user } = useAuth();
  const [texto, setTexto] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");

  return (
    <Secao titulo="Comentários">
      <div className="space-y-2">
        {(comentarios ?? []).map((c) => (
          <div key={c.id} className="rounded border border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{nome(c.user_id)}</span>
              <span>{dataHora(c.criado_em)}</span>
              {c.editado && <span>(editado)</span>}
              {c.user_id === user?.id && (
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditandoId(c.id); setTextoEdicao(c.conteudo); }}
                  >
                    editar
                  </button>
                  <button type="button" onClick={() => apagar.mutate(c.id)}>apagar</button>
                </span>
              )}
            </div>
            {editandoId === c.id ? (
              <div className="mt-1 space-y-1">
                <Textarea rows={2} value={textoEdicao} onChange={(e) => setTextoEdicao(e.target.value)} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      editar.mutate({ id: c.id, conteudo: textoEdicao }, { onSuccess: () => setEditandoId(null) })
                    }
                  >
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{c.conteudo}</p>
            )}
          </div>
        ))}
        {(comentarios ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum comentário.</p>}
      </div>

      <div className="space-y-1">
        <Textarea
          rows={2} placeholder="Comentar… use @ para mencionar" value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <Button
          size="sm" disabled={!texto.trim() || criar.isPending}
          onClick={() =>
            criar.mutate(
              { conteudo: texto, mencionados: extrairMencionados(texto, pessoas ?? []) },
              { onSuccess: () => setTexto("") },
            )
          }
        >
          Comentar
        </Button>
      </div>
    </Secao>
  );
}

/* ----------------------------------------------------------- histórico ---- */

const ACAO_ROTULO: Record<string, string> = {
  criada: "Tarefa criada",
  criacao: "Tarefa criada",
  status: "Status alterado",
  status_alterado: "Status alterado",
  prioridade: "Prioridade alterada",
  responsavel: "Responsável alterado",
  responsavel_alterado: "Responsável alterado",
  data_limite: "Data limite alterada",
  projeto: "Projeto alterado",
  comentario: "Comentário adicionado",
  anexo: "Anexo adicionado",
  concluida: "Tarefa concluída",
  reaberta: "Tarefa reaberta",
  aprovacao: "Decisão de aprovação",
  atualizada: "Tarefa atualizada",
};

function legivel(
  valor: unknown,
  nome: (id: string | null) => string,
  rotuloStatus: (codigo: string) => string
): string {
  if (valor == null) return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "string") {
    const rotulo = rotuloStatus(valor);
    if (rotulo !== valor) return rotulo;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(valor)) return nome(valor);
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return format(parseISO(valor), "dd/MM/yyyy");
    return valor;
  }
  if (typeof valor === "object") {
    return Object.entries(valor as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${legivel(v, nome, rotuloStatus)}`)
      .join(" · ");
  }
  return String(valor);
}

export function BlocoHistorico({ tarefa }: { tarefa: TarefaDetalhe }) {
  const [aberto, setAberto] = useState(false);
  const { data: linhas } = useHistoricoTarefa(tarefa.id, aberto);
  const nome = useNomePessoa();
  const rotuloStatus = useStatusRotulo();

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <section className="space-y-2 border-t border-border pt-4">
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
          Histórico
          <ChevronDown className={aberto ? "h-4 w-4 rotate-180 transition" : "h-4 w-4 transition"} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1">
          {(linhas ?? []).map((h) => (
            <div key={h.id} className="rounded border border-border/60 px-2 py-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ACAO_ROTULO[h.acao] ?? h.acao.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{dataHora(h.criado_em)}</span>
                <span className="text-muted-foreground">por {nome(h.user_id)}</span>
              </div>
              {(h.de != null || h.para != null) && (
                <p className="text-muted-foreground">
                  de {legivel(h.de, nome, rotuloStatus)} para {legivel(h.para, nome, rotuloStatus)}
                </p>
              )}
            </div>
          ))}
          {(linhas ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
