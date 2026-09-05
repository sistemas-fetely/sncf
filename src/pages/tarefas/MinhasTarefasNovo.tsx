import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TarefaItem } from "@/components/tarefas/TarefaItem";
import { QuickAddTarefa } from "@/components/tarefas/QuickAddTarefa";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { type TarefaStatus } from "@/hooks/tarefas/useTarefas";
import { STATUS_ROTULO } from "@/components/tarefas/detalhe/comuns";
import {
  PAPEL_ROTULO, PAPEL_SO_LEITURA, type Papel, useMinhasTarefasPapel,
  type TarefaComPapel,
} from "@/hooks/tarefas/useMinhasTarefasPapel";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { ChevronDown, ChevronRight, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTarefaAberta } from "@/hooks/tarefas/useTarefaAberta";

const TEXTOS_VAZIO: Record<Papel, string> = {
  r: "Nada sob sua execução.",
  a: "Nada sob sua responsabilidade de aprovação.",
  c: "Ninguém pediu sua opinião ainda.",
  i: "Nada para acompanhar.",
};

const PAPEIS: Papel[] = ["r", "a", "c", "i"];

/** contêiner é agrupador: sem checkbox, fecha pelo progresso das filhas */
function LinhaContainer({
  tarefa,
  filhas,
  somenteLeitura,
}: {
  tarefa: TarefaComPapel;
  filhas: TarefaComPapel[];
  somenteLeitura: boolean;
}) {
  const total = tarefa.filhas_total ?? filhas.length;
  const feitas = tarefa.filhas_concluidas ?? filhas.filter((f) => f.status === "concluida").length;
  const temPendente = feitas < total;
  const [aberto, setAberto] = useState(temPendente);
  const { abrir } = useTarefaAberta();

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={aberto ? "Colapsar subtarefas" : "Expandir subtarefas"}
          aria-expanded={aberto}
        >
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="mt-px shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
          title="Progresso das subtarefas"
        >
          {feitas}/{total}
        </button>

        <div
          className="min-w-0 flex-1 cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => abrir(tarefa.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              abrir(tarefa.id);
            }
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{tarefa.titulo}</span>
            <Badge variant="outline" className="py-0 text-[10px] text-muted-foreground">
              {total} subtarefa{total === 1 ? "" : "s"}
            </Badge>
          </div>
          {tarefa.data_limite && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3 shrink-0" />
              {format(parseISO(tarefa.data_limite), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          )}
        </div>
      </div>

      {aberto && filhas.length > 0 && (
        <div className={cn("space-y-2 border-l border-border/60 pl-4 ml-4")}>
          {filhas.map((f) => (
            <TarefaItem
              key={f.id}
              tarefa={f}
              somenteLeitura={somenteLeitura}
              esconderMae
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MinhasTarefasNovo() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<FiltroStatus>("abertas");
  const [projetoFiltro, setProjetoFiltro] = useState<string>("__todos__");
  const [aba, setAba] = useAbaUrl("r");
  const abaAtual = aba as Papel;
  const { data: tarefas, isLoading } = useMinhasTarefasPapel(user?.id, filtro);
  const { data: projetos } = useProjetos();

  const contarFolhas = (p: Papel) =>
    (tarefas ?? []).filter((t) => t.papeis.includes(p) && !t.eh_container).length;

  /** por projeto, montando a hierarquia: contêiner com filhas dentro; folha solta */
  const grupos = useMemo(() => {
    const recorte = (tarefas ?? []).filter((t) => t.papeis.includes(abaAtual));
    const presentes = new Set(recorte.map((t) => t.id));
    const filhasPorMae = new Map<string, TarefaComPapel[]>();
    for (const t of recorte) {
      const mae = t.parent_id;
      if (mae && presentes.has(mae)) {
        filhasPorMae.set(mae, [...(filhasPorMae.get(mae) ?? []), t]);
      }
    }

    const raizes = recorte.filter((t) => !(t.parent_id && presentes.has(t.parent_id)));
    const mapa = new Map<string, TarefaComPapel[]>();
    for (const t of raizes) {
      const chave = t.projeto_id ?? "__sem__";
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    const ordenado = [...mapa.entries()].sort(([a], [b]) =>
      a === "__sem__" ? 1 : b === "__sem__" ? -1 : 0
    );
    return { ordenado, filhasPorMae };
  }, [tarefas, abaAtual]);

  const nomeProjeto = (id: string) =>
    id === "__sem__" ? "Sem projeto" : projetos?.find((p) => p.id === id)?.nome ?? "Projeto";

  const totalAba = contarFolhas(abaAtual);
  const somenteLeitura = PAPEL_SO_LEITURA.includes(abaAtual);

  return (
    <PageShell variant="dados">
      <PageTitle
        titulo="Minhas tarefas"
        estado="Tudo em que você tem papel — não só o que você executa."
      />

      <Card>
        <CardContent className="pt-4">
          <QuickAddTarefa />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroStatus)}>
          <SelectTrigger className="h-8 w-52 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            {Object.entries(STATUS_ROTULO).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{totalAba} tarefa(s)</span>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          {PAPEIS.map((p) => {
            const n = contarFolhas(p);
            return (
              <TabsTrigger key={p} value={p}>
                {PAPEL_ROTULO[p]}{n > 0 ? ` (${n})` : ""}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PAPEIS.map((p) => (
          <TabsContent key={p} value={p} className="space-y-6 pt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : grupos.ordenado.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{TEXTOS_VAZIO[p]}</p>
            ) : (
              <div className="space-y-6">
                {grupos.ordenado.map(([chave, lista]) => (
                  <section key={chave} className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {nomeProjeto(chave)} · {lista.filter((t) => !t.eh_container).length}
                    </h2>
                    <div className="space-y-2">
                      {lista.map((t) =>
                        t.eh_container ? (
                          <LinhaContainer
                            key={t.id}
                            tarefa={t}
                            filhas={grupos.filhasPorMae.get(t.id) ?? []}
                            somenteLeitura={somenteLeitura}
                          />
                        ) : (
                          <TarefaItem
                            key={t.id}
                            tarefa={t}
                            somenteLeitura={somenteLeitura}
                                          esconderMae
                            subtitulo={t.parent_id ? t.mae_titulo ?? undefined : undefined}
                          />
                        )
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  );
}

type FiltroStatus = "abertas" | TarefaStatus;
