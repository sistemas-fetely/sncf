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
} from "@/hooks/tarefas/useMinhasTarefasPapel";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { useFiltroNatureza } from "@/hooks/tarefas/useFiltroNatureza";
import { ControleNatureza } from "@/components/tarefas/ControleNatureza";

const TEXTOS_VAZIO: Record<Papel, string> = {
  r: "Nada sob sua execução.",
  a: "Nada sob sua responsabilidade de aprovação.",
  c: "Ninguém pediu sua opinião ainda.",
  i: "Nada para acompanhar.",
};

const PAPEIS: Papel[] = ["r", "a", "c", "i"];

export default function MinhasTarefasNovo() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<FiltroStatus>("abertas");
  const [aba, setAba] = useAbaUrl("r");
  const abaAtual = aba as Papel;
  const { data: tarefas, isLoading } = useMinhasTarefasPapel(user?.id, filtro);
  const { data: projetos } = useProjetos();

  const natureza = useFiltroNatureza();
  const visiveis = useMemo(() => natureza.filtrar(tarefas ?? []), [tarefas, natureza]);
  const ocultas = natureza.contarOcultas(tarefas);

  const grupos = useMemo(() => {
    const recorte = visiveis.filter((t) => t.papeis.includes(abaAtual));
    const mapa = new Map<string, typeof tarefas>();
    for (const t of recorte) {
      const chave = t.projeto_id ?? "__sem__";
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === "__sem__" ? 1 : b === "__sem__" ? -1 : 0));
  }, [visiveis, abaAtual]);

  const nomeProjeto = (id: string) =>
    id === "__sem__" ? "Sem projeto" : projetos?.find((p) => p.id === id)?.nome ?? "Projeto";

  const totalAba = visiveis.filter((t) => t.papeis.includes(abaAtual)).length;
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
        <div className="flex flex-wrap items-center gap-4">
          <ControleNatureza
            incluirTodas={natureza.incluirTodas}
            onChange={natureza.setIncluirTodas}
            incluirPassos={natureza.incluirPassos}
            onChangePassos={natureza.setIncluirPassos}
            ocultas={ocultas}
          />
          <span className="text-xs text-muted-foreground">{totalAba} tarefa(s)</span>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          {PAPEIS.map((p) => {
            const n = visiveis.filter((t) => t.papeis.includes(p)).length;
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
            ) : grupos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{TEXTOS_VAZIO[p]}</p>
            ) : (
              <div className="space-y-6">
                {grupos.map(([chave, lista]) => (
                  <section key={chave} className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {nomeProjeto(chave)} · {lista.length}
                    </h2>
                    <div className="space-y-2">
                      {lista.map((t) => (
                        <TarefaItem key={t.id} tarefa={t} somenteLeitura={somenteLeitura} />
                      ))}
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
