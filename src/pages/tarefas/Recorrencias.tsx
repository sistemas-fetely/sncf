import { PageTitle } from "@/components/layout/PageTitle";
import { PageShell } from "@/components/layout/PageShell";
import { useState } from "react";
import { Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { useTiposExecucaoTarefa } from "@/hooks/tarefas/useTarefasCatalogos";
import { RecorrenciaDialog } from "@/components/tarefas/recorrencias/RecorrenciaDialog";
import { dataBR, textoRecorrencia } from "@/lib/tarefas/recorrenciaTexto";
import {
  useAlternarRecorrencia, useExcluirRecorrencia, useGerarRecorrentesAgora, useRecorrencias,
  type Recorrencia,
} from "@/hooks/tarefas/useRecorrencias";

export default function Recorrencias() {
  const { data: regras, isLoading, error } = useRecorrencias();
  const alternar = useAlternarRecorrencia();
  const excluir = useExcluirRecorrencia();
  const gerar = useGerarRecorrentesAgora();
  const nomePessoa = useNomePessoa();
  const { data: tiposExecucao } = useTiposExecucaoTarefa();
  const nomeTipo = (codigo: string) =>
    (tiposExecucao ?? []).find((t) => t.codigo === codigo)?.nome ?? null;

  const [editando, setEditando] = useState<Recorrencia | null>(null);
  const [aberto, setAberto] = useState(false);

  const abrirNova = () => { setEditando(null); setAberto(true); };
  const abrirEdicao = (r: Recorrencia) => { setEditando(r); setAberto(true); };

  return (
    <PageShell>
      <PageTitle
        titulo="Recorrências"
        estado={
          <>
            <strong>Tarefa recorrente</strong> acumula: cada ocorrência nasce nova e tem valor
            próprio, então o que não foi feito continua em aberto como dívida.{" "}
            <strong>Rotina</strong> mantém uma única ocorrência viva por vez — ao chegar a
            seguinte, a anterior não cumprida é cancelada e fica registrada como não-aderência.
          </>
        }
        acoes={
          <>
            <Button variant="outline" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              <Play className="mr-1 h-4 w-4" /> Gerar agora
            </Button>
            <Button onClick={abrirNova}>
              <Plus className="mr-1 h-4 w-4" /> Nova recorrência
            </Button>
          </>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as recorrências: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando recorrências…</p>
      ) : (regras ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Repeat className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma recorrência ainda. Crie a primeira e o sistema passa a gerar a tarefa em cada ciclo.
            </p>
            <Button onClick={abrirNova}>Nova recorrência</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(regras ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{r.titulo}</p>
                    {nomeTipo(r.tipo_execucao) && (
                      <Badge variant="secondary" className="text-[10px]">{nomeTipo(r.tipo_execucao)}</Badge>
                    )}
                    {!r.ativo && <Badge variant="outline" className="text-[10px]">Pausada</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {textoRecorrencia(r)}
                    {r.responsavel_id ? ` · ${nomePessoa(r.responsavel_id)}` : " · sem responsável"}
                    {` · próxima geração ${dataBR(r.proxima_geracao)}`}
                  </p>
                </div>
                <Switch
                  checked={r.ativo}
                  onCheckedChange={(v) => alternar.mutate({ id: r.id, ativo: v })}
                  aria-label="Ativa"
                />
                <Button variant="ghost" size="icon" onClick={() => abrirEdicao(r)} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => excluir.mutate(r.id)}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RecorrenciaDialog aberto={aberto} onOpenChange={setAberto} regra={editando} />
    </PageShell>
  );
}
