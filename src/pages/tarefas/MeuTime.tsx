import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { useCallback, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, UsersRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TarefaItem } from "@/components/tarefas/TarefaItem";
import { useAuth } from "@/contexts/AuthContext";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  usePessoasDoTime, useTarefasAbertasDoTime, useTarefasEntreguesDoTime,
} from "@/hooks/tarefas/useTarefasDoTime";
import type { Tarefa, TarefaPrioridade } from "@/hooks/tarefas/useTarefas";
import { useFiltroNatureza } from "@/hooks/tarefas/useFiltroNatureza";
import { ControleNatureza } from "@/components/tarefas/ControleNatureza";

const PRIORIDADES: { valor: TarefaPrioridade; rotulo: string }[] = [
  { valor: "urgente", rotulo: "Urgente" },
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
];

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function iniciais(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

interface GrupoPessoa {
  userId: string;
  nome: string;
  avatar: string | null;
  tarefas: Tarefa[];
  atrasadas: number;
}

/** Bloco da pessoa — igual ao que já existia, agora reutilizado na árvore. */
function BlocoPessoa({
  g,
  hoje,
  agregado,
}: {
  g: GrupoPessoa;
  hoje: string;
  agregado?: { pessoas: number; abertas: number };
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar className="h-8 w-8">
            {g.avatar && <AvatarImage src={g.avatar} alt={g.nome} />}
            <AvatarFallback className="text-[11px]">{iniciais(g.nome)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{g.nome}</span>
          <span className="text-xs text-muted-foreground">
            {g.tarefas.length} {g.tarefas.length === 1 ? "aberta" : "abertas"}
          </span>
          {g.atrasadas > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {g.atrasadas} atrasada{g.atrasadas === 1 ? "" : "s"}
            </span>
          )}
          {agregado && agregado.pessoas > 0 && (
            <Badge variant="outline" className="text-[11px] font-medium">
              time: {agregado.pessoas} {agregado.pessoas === 1 ? "pessoa" : "pessoas"} ·{" "}
              {agregado.abertas} {agregado.abertas === 1 ? "aberta" : "abertas"}
            </Badge>
          )}
        </div>

        {g.tarefas.length === 0 ? (
          <p className="text-xs text-muted-foreground">nenhuma tarefa aberta</p>
        ) : (
          <div className="space-y-2">
            {g.tarefas.map((t) => (
              <TarefaItem key={t.id} tarefa={t} atrasada={!!t.data_limite && t.data_limite < hoje} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Nó da árvore. Recursão à prova de ciclo via Set de visitados. */
function NoTime({
  userId,
  grupos,
  filhosPorGestor,
  hoje,
  visitados,
}: {
  userId: string;
  grupos: Map<string, GrupoPessoa>;
  filhosPorGestor: Map<string, string[]>;
  hoje: string;
  visitados: Set<string>;
}) {
  if (visitados.has(userId)) return null;
  const proximos = new Set(visitados);
  proximos.add(userId);

  const g = grupos.get(userId);
  if (!g) return null;

  const filhos = filhosPorGestor.get(userId) ?? [];

  // agregado do time abaixo desta pessoa, sem repetir id (ciclo)
  const contados = new Set<string>([userId]);
  let pessoasTime = 0;
  let abertasTime = 0;
  const pilha = [...filhos];
  while (pilha.length > 0) {
    const id = pilha.pop()!;
    if (contados.has(id)) continue;
    contados.add(id);
    pessoasTime += 1;
    abertasTime += grupos.get(id)?.tarefas.length ?? 0;
    for (const f of filhosPorGestor.get(id) ?? []) pilha.push(f);
  }

  return (
    <div className="space-y-2">
      <BlocoPessoa
        g={g}
        hoje={hoje}
        agregado={pessoasTime > 0 ? { pessoas: pessoasTime, abertas: abertasTime } : undefined}
      />
      {filhos.length > 0 && (
        <div className="ml-6 space-y-2 border-l border-border pl-4">
          {filhos.map((f) => (
            <NoTime
              key={f}
              userId={f}
              grupos={grupos}
              filhosPorGestor={filhosPorGestor}
              hoje={hoje}
              visitados={proximos}
            />
          ))}
        </div>
      )}
    </div>
  );
}


export default function MeuTime() {
  const hoje = hojeISO();
  const [aba, setAba] = useAbaUrl("pessoa");
  const [pessoaFiltro, setPessoaFiltro] = useState<string>("todas");
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<string>("todas");
  const { user } = useAuth();

  const { data: time, isLoading: carregandoTime, error: erroTime } = usePessoasDoTime();
  const userIds = time?.ids;
  const membros = useMemo(() => time?.membros ?? [], [time]);
  const { data: abertas, isLoading: carregandoAbertas } = useTarefasAbertasDoTime(userIds);
  const { data: entregues } = useTarefasEntreguesDoTime(userIds);
  const { data: pessoas } = usePessoasSistema();

  const pessoaLogada = pessoas?.find((p) => p.id === user?.id);

  /** fail-loud: id vindo da RPC que não está em v_pessoas_sistema aparece identificado, não escondido */
  const nomeDe = (id: string | null) =>
    pessoas?.find((p) => p.id === id)?.nome ??
    (id ? `Sem cadastro ativo (${id.slice(0, 8)})` : "Sem responsável");
  const avatarDe = (id: string | null) =>
    pessoas?.find((p) => p.id === id)?.avatar_url ?? null;

  const idsVisiveis = useMemo(() => {
    const base = userIds ?? [];
    return pessoaFiltro === "todas" ? base : base.filter((id) => id === pessoaFiltro);
  }, [userIds, pessoaFiltro]);


  const natureza = useFiltroNatureza();
  const filtrarNatureza = natureza.filtrar;

  const filtrar = useCallback(
    (linhas: Tarefa[]) =>
      filtrarNatureza(
        linhas.filter(
          (t) =>
            (!t.responsavel_id || idsVisiveis.includes(t.responsavel_id)) &&
            (prioridadeFiltro === "todas" || t.prioridade === prioridadeFiltro)
        )
      ),
    [idsVisiveis, prioridadeFiltro, filtrarNatureza]
  );

  const agrupar = (linhas: Tarefa[]): GrupoPessoa[] =>
    idsVisiveis
      .map((id) => {
        const doTime = linhas.filter((t) => t.responsavel_id === id);
        return {
          userId: id,
          nome: nomeDe(id),
          avatar: avatarDe(id),
          tarefas: doTime,
          atrasadas: doTime.filter((t) => !!t.data_limite && t.data_limite < hoje).length,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const abertasFiltradas = useMemo(() => filtrar(abertas ?? []), [abertas, filtrar]);
  const entreguesFiltradas = useMemo(() => filtrar(entregues ?? []), [entregues, filtrar]);

  const porPessoa = agrupar(abertasFiltradas);
  const porPessoaEntregues = agrupar(entreguesFiltradas).filter((g) => g.tarefas.length > 0);

  const gruposPorId = new Map(porPessoa.map((g) => [g.userId, g]));

  /** árvore: gestor_user_id -> filhos. Sem gestor (ou gestor fora da lista) vira raiz. */
  const { raizes, filhosPorGestor } = useMemo(() => {
    const presentes = new Set(membros.map((m) => m.user_id));
    const mapa = new Map<string, string[]>();
    const topo: string[] = [];
    for (const m of membros) {
      if (m.gestor_user_id && m.gestor_user_id !== m.user_id && presentes.has(m.gestor_user_id)) {
        const atual = mapa.get(m.gestor_user_id) ?? [];
        atual.push(m.user_id);
        mapa.set(m.gestor_user_id, atual);
      } else {
        topo.push(m.user_id);
      }
    }
    return { raizes: topo, filhosPorGestor: mapa };
  }, [membros]);


  const atrasadas = useMemo(
    () =>
      abertasFiltradas
        .filter((t) => !!t.data_limite && t.data_limite < hoje)
        .sort((a, b) => (a.data_limite! < b.data_limite! ? -1 : 1)),
    [abertasFiltradas, hoje]
  );

  const pessoasDoFiltro = (userIds ?? [])
    .map((id) => ({ id, nome: nomeDe(id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <PageShell>
      <PageTitle
        titulo="Meu time"
        estado="Tarefas de quem reporta a você. Para a empresa toda, veja Carga."
      />

      {erroTime && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar o time: {(erroTime as Error).message}
          </CardContent>
        </Card>
      )}

      {!erroTime && !carregandoTime && (userIds ?? []).length === 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {pessoaLogada ? (
              <>
                <p className="text-sm font-medium">Você não tem liderados diretos</p>
                <p className="text-sm text-muted-foreground">
                  Esta tela mostra as tarefas de quem reporta a você no organograma.
                  Para ver as tarefas de toda a empresa, use a tela de Carga.
                </p>
                <p className="text-sm text-muted-foreground">
                  Conectado como <span className="font-medium">{pessoaLogada.nome}</span> ({user?.email}).
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Esta conta não está vinculada a uma pessoa</p>
                <p className="text-sm text-muted-foreground">
                  A conta {user?.email} não tem ficha ativa no sistema, então não tem liderados nem aparece no organograma.
                  Se você tem mais de um acesso, entre com a conta vinculada ao seu cadastro.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!erroTime && (userIds ?? []).length > 0 && (
        <div className="contents">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={pessoaFiltro} onValueChange={setPessoaFiltro}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Pessoa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as pessoas</SelectItem>
                {pessoasDoFiltro.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as prioridades</SelectItem>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ControleNatureza
              incluirTodas={natureza.incluirTodas}
              onChange={natureza.setIncluirTodas}
              ocultas={natureza.contarOcultas(abertas, entregues)}
            />
          </div>

          <Tabs value={aba} onValueChange={setAba}>
            <TabsList>
              <TabsTrigger value="pessoa">Por pessoa</TabsTrigger>
              <TabsTrigger value="atrasadas">
                Atrasadas
                {atrasadas.length > 0 && (
                  <Badge variant="outline" className="ml-2 border-destructive/40 bg-destructive/10 text-destructive">
                    {atrasadas.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="entregues">Entregues</TabsTrigger>
            </TabsList>

            <TabsContent value="pessoa" className="mt-4 space-y-4">
              {carregandoTime || carregandoAbertas ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : porPessoa.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pessoa no time com esse filtro.</p>
              ) : pessoaFiltro !== "todas" ? (
                porPessoa.map((g) => <BlocoPessoa key={g.userId} g={g} hoje={hoje} />)
              ) : (
                raizes.map((id) => (
                  <NoTime
                    key={id}
                    userId={id}
                    grupos={gruposPorId}
                    filhosPorGestor={filhosPorGestor}
                    hoje={hoje}
                    visitados={new Set()}
                  />
                ))
              )}
            </TabsContent>


            <TabsContent value="atrasadas" className="mt-4 space-y-2">
              {atrasadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada atrasado no time com esse filtro.</p>
              ) : (
                atrasadas.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UsersRound className="h-3.5 w-3.5" />
                      {nomeDe(t.responsavel_id)}
                      {t.data_limite && (
                        <span className="text-destructive">
                          · venceu em {format(parseISO(t.data_limite), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <TarefaItem tarefa={t} atrasada />
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="entregues" className="mt-4 space-y-4">
              {porPessoaEntregues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma entrega nos últimos 7 dias com esse filtro.</p>
              ) : (
                porPessoaEntregues.map((g) => (
                  <Card key={g.userId}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {g.avatar && <AvatarImage src={g.avatar} alt={g.nome} />}
                          <AvatarFallback className="text-[11px]">{iniciais(g.nome)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{g.nome}</span>
                        <span className="text-xs text-muted-foreground">
                          {g.tarefas.length} entregue{g.tarefas.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {g.tarefas.map((t) => (
                          <TarefaItem key={t.id} tarefa={t} />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PageShell>
  );
}
