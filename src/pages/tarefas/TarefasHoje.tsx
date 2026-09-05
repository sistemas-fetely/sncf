import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  PermissaoTelaProvider, usePermissaoTelaContext, AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";
import { QuickAddTarefa } from "@/components/tarefas/QuickAddTarefa";
import { InboxFilas } from "@/components/tarefas/InboxFilas";
import { TarefaItem } from "@/components/tarefas/TarefaItem";
import {
  useTarefasConcluidas, useTarefasContadores, useTarefasHoje,
  useTarefasProximos7, useTarefasSemData, type Tarefa,
} from "@/hooks/tarefas/useTarefas";
import { useRespondoPor } from "@/hooks/tarefas/useMinhasTarefasPapel";
import { useFiltroNatureza } from "@/hooks/tarefas/useFiltroNatureza";
import { ControleNatureza } from "@/components/tarefas/ControleNatureza";

function Vazio({ texto }: { texto: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{texto}</p>;
}

function Lista({ tarefas, atrasada, somenteLeitura }: { tarefas: Tarefa[]; atrasada?: boolean; somenteLeitura?: boolean }) {
  return (
    <div className="space-y-2">
      {tarefas.map((t) => (
        <TarefaItem key={t.id} tarefa={t} atrasada={atrasada} somenteLeitura={somenteLeitura} />
      ))}
    </div>
  );
}

export default function TarefasHoje() {
  return (
    <PermissaoTelaProvider slug="tela.tarefas">
      <TarefasHojeConteudo />
    </PermissaoTelaProvider>
  );
}

function TarefasHojeConteudo() {
  const { user } = useAuth();
  const userId = user?.id;
  const { podeCriar, podeEditar } = usePermissaoTelaContext();
  const [aba, setAba] = useAbaUrl("hoje");

  const hoje = useTarefasHoje(userId);
  const proximos = useTarefasProximos7(userId);
  const semData = useTarefasSemData(userId);
  const concluidas = useTarefasConcluidas(userId);
  const { data: contadores } = useTarefasContadores(userId);
  const { data: respondoPor } = useRespondoPor(userId);

  const natureza = useFiltroNatureza();
  const atrasadas = natureza.filtrar(hoje.data?.atrasadas ?? []);
  const doDia = natureza.filtrar(hoje.data?.hoje ?? []);
  const respondoPorFiltrado = natureza.filtrar(respondoPor ?? []);
  const semDataFiltrado = natureza.filtrar(semData.data ?? []);
  const ocultas = natureza.contarOcultas(
    hoje.data?.atrasadas, hoje.data?.hoje, respondoPor, semData.data,
    (proximos.data ?? []).flatMap((d) => d.tarefas)
  );
  const vazioHoje = !hoje.isLoading && atrasadas.length === 0 && doDia.length === 0 && respondoPorFiltrado.length === 0;

  return (
    <PageShell>
      <PageTitle
        titulo="Hoje"
        estado={format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      {podeCriar && (
        <Card>
          <CardContent className="pt-4">
            <QuickAddTarefa />
          </CardContent>
        </Card>
      )}

      <ControleNatureza
        incluirTodas={natureza.incluirTodas}
        onChange={natureza.setIncluirTodas}
        ocultas={ocultas}
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="hoje">
            Hoje{contadores?.hoje ? ` (${contadores.hoje})` : ""}
          </TabsTrigger>
          <TabsTrigger value="proximos">Próximos 7 dias</TabsTrigger>
          <TabsTrigger value="semData">
            Sem data{contadores?.semData ? ` (${contadores.semData})` : ""}
          </TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje" className="space-y-6 pt-4">
          <InboxFilas />

          {respondoPorFiltrado.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Respondo por ({respondoPorFiltrado.length})</h2>
              <p className="text-xs text-muted-foreground">
                Você é o A destas tarefas. A execução é de outra pessoa.
              </p>
              <Lista tarefas={respondoPorFiltrado} somenteLeitura />
            </section>
          )}

          {vazioHoje ? (
            <Vazio texto="Nenhuma tarefa sua para hoje. Use a caixa acima para capturar uma tarefa — dá para escrever tudo numa linha." />
          ) : (
            <>
              {atrasadas.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium text-destructive">
                    Atrasadas ({atrasadas.length})
                  </h2>
                  <Lista tarefas={atrasadas} atrasada />
                </section>
              )}
              {doDia.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium">Hoje ({doDia.length})</h2>
                  <Lista tarefas={doDia} />
                </section>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="proximos" className="space-y-5 pt-4">
          {(proximos.data ?? []).map((dia) => natureza.filtrar(dia.tarefas)).map((tarefasDia, i) => ({ data: (proximos.data ?? [])[i].data, tarefas: tarefasDia })).map((dia) => (
            <section key={dia.data} className="space-y-2">
              <h2 className="text-sm font-medium capitalize">
                {format(parseISO(dia.data), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </h2>
              {dia.tarefas.length === 0 ? (
                <p className="text-sm text-muted-foreground/70">—</p>
              ) : (
                <Lista tarefas={dia.tarefas} />
              )}
            </section>
          ))}
        </TabsContent>

        <TabsContent value="semData" className="pt-4">
          {semDataFiltrado.length === 0 ? (
            <Vazio texto="Caixa de entrada vazia." />
          ) : (
            <Lista tarefas={semDataFiltrado} />
          )}
        </TabsContent>

        <TabsContent value="concluidas" className="space-y-5 pt-4">
          {(concluidas.data ?? []).length === 0 ? (
            <Vazio texto="Nada concluído nos últimos 30 dias." />
          ) : (
            (concluidas.data ?? []).map((dia) => (
              <section key={dia.data} className="space-y-2">
                <h2 className="text-sm font-medium capitalize">
                  {format(parseISO(dia.data), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h2>
                <Lista tarefas={dia.tarefas} />
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
