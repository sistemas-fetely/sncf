import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Inbox } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCancelarTarefaFila, useConcluirTarefaFila, useFilaProcessos, type TarefaFila,
} from "@/hooks/tarefas/useFilaProcessos";

const TODOS = "__todos__";

export default function FilaProcessos() {
  const navigate = useNavigate();
  const [sistema, setSistema] = useState<string>(TODOS);
  const [area, setArea] = useState<string>(TODOS);
  const [soBloqueantes, setSoBloqueantes] = useState(false);
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);

  const { data: tarefas, isLoading, error } = useFilaProcessos({
    sistema: sistema === TODOS ? null : sistema,
    area: area === TODOS ? null : area,
    soBloqueantes,
    soAtrasadas,
    mostrarEncerradas,
  });

  // catálogo de filtros: lista completa (sem filtro de sistema/área) para não travar a escolha
  const { data: universo } = useFilaProcessos({ mostrarEncerradas: true });

  const concluir = useConcluirTarefaFila();
  const cancelar = useCancelarTarefaFila();

  const [alvoConcluir, setAlvoConcluir] = useState<TarefaFila | null>(null);
  const [evidenciaTexto, setEvidenciaTexto] = useState("");
  const [evidenciaUrl, setEvidenciaUrl] = useState("");
  const [alvoCancelar, setAlvoCancelar] = useState<TarefaFila | null>(null);
  const [motivo, setMotivo] = useState("");

  const linhas = tarefas ?? [];

  const resumo = useMemo(() => {
    const abertas = linhas.filter((t) => t.esta_aberta);
    return {
      abertas: abertas.length,
      bloqueantes: abertas.filter((t) => t.bloqueante).length,
      atrasadas: abertas.filter((t) => t.esta_atrasada).length,
    };
  }, [linhas]);

  const sistemas = useMemo(() => {
    const m = new Map<string, string>();
    (universo ?? []).forEach((t) => {
      if (t.sistema_origem) m.set(t.sistema_origem, t.sistema_origem_nome ?? t.sistema_origem);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [universo]);

  const areas = useMemo(() => {
    const m = new Map<string, string>();
    (universo ?? []).forEach((t) => {
      if (t.area_destino) m.set(t.area_destino, t.area_nome ?? t.area_destino);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [universo]);

  function abrirConcluir(t: TarefaFila) {
    setAlvoConcluir(t);
    setEvidenciaTexto("");
    setEvidenciaUrl("");
  }

  function abrirCancelar(t: TarefaFila) {
    setAlvoCancelar(t);
    setMotivo("");
  }

  const exigeEvidencia = !!alvoConcluir?.bloqueante;
  const podeConcluir =
    !exigeEvidencia || !!evidenciaTexto.trim() || !!evidenciaUrl.trim();

  return (
    <PageShell>
      <PageTitle
        titulo="Fila de Processos"
        icone={Inbox}
        estado="Trabalho que o sistema gerou para uma área — vindo de recebimento, onboarding, produto e financeiro. Diferente das suas tarefas pessoais, aqui o dono é a área."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Abertas</p>
            <p className="font-display text-2xl">{resumo.abertas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Bloqueantes</p>
            <p className="font-display text-2xl text-destructive">{resumo.bloqueantes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Atrasadas</p>
            <p className="font-display text-2xl">{resumo.atrasadas}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sistema} onValueChange={setSistema}>
          <SelectTrigger className="h-8 w-[210px]">
            <SelectValue placeholder="Sistema de origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os sistemas</SelectItem>
            {sistemas.map(([valor, nome]) => (
              <SelectItem key={valor} value={valor}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="h-8 w-[210px]">
            <SelectValue placeholder="Área destino" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as áreas</SelectItem>
            {areas.map(([valor, nome]) => (
              <SelectItem key={valor} value={valor}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={soBloqueantes ? "default" : "outline"}
          onClick={() => setSoBloqueantes((v) => !v)}
        >
          Só bloqueantes
        </Button>
        <Button
          size="sm"
          variant={soAtrasadas ? "default" : "outline"}
          onClick={() => setSoAtrasadas((v) => !v)}
        >
          Só atrasadas
        </Button>
        <Button
          size="sm"
          variant={mostrarEncerradas ? "default" : "outline"}
          onClick={() => setMostrarEncerradas((v) => !v)}
        >
          Mostrar encerradas
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar a fila: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando fila…</p>
      ) : linhas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma pendência na fila.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {linhas.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-medium">{t.titulo}</p>
                    {t.bloqueante && (
                      <Badge variant="destructive" className="rounded px-1.5 py-0 text-[10px]">
                        Bloqueante
                      </Badge>
                    )}
                    {t.esta_atrasada && (
                      <Badge variant="outline" className="rounded border-destructive px-1.5 py-0 text-[10px] text-destructive">
                        Atrasada {t.dias_atraso ?? 0}d
                      </Badge>
                    )}
                    {!t.esta_aberta && (
                      <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                        {t.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {t.sistema_origem && (
                      <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                        {t.sistema_origem_nome ?? t.sistema_origem}
                      </Badge>
                    )}
                    {t.area_destino && (
                      <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                        {t.area_nome ?? t.area_destino}
                      </Badge>
                    )}
                    {t.colaborador_nome && <span>· {t.colaborador_nome}</span>}
                    {t.prazo_data && <span>· prazo {t.prazo_data.slice(0, 10).split("-").reverse().join("/")}</span>}
                  </div>
                  {t.bloqueante && t.motivo_bloqueio && (
                    <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {t.motivo_bloqueio}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {t.link_acao && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(t.link_acao!)}>
                      Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                  {t.esta_aberta && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => abrirConcluir(t)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => abrirCancelar(t)}>
                        <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conclusão — a RPC recusa tarefa bloqueante sem evidência */}
      <Dialog open={!!alvoConcluir} onOpenChange={(v) => !v && setAlvoConcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>{alvoConcluir?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Evidência</Label>
              <Textarea
                value={evidenciaTexto}
                onChange={(e) => setEvidenciaTexto(e.target.value)}
                rows={4}
                placeholder="O que foi feito, com número/documento quando houver"
              />
            </div>
            <div className="space-y-1.5">
              <Label>URL da evidência (opcional)</Label>
              <Input
                value={evidenciaUrl}
                onChange={(e) => setEvidenciaUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            {exigeEvidencia && !podeConcluir && (
              <p className="text-xs text-destructive">
                Tarefa bloqueante exige evidência para concluir.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoConcluir(null)}>Voltar</Button>
            <Button
              disabled={!podeConcluir || concluir.isPending}
              onClick={() => {
                if (!alvoConcluir) return;
                concluir.mutate(
                  { id: alvoConcluir.id, evidenciaTexto, evidenciaUrl },
                  { onSuccess: () => setAlvoConcluir(null) },
                );
              }}
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelamento — a RPC exige motivo */}
      <Dialog open={!!alvoCancelar} onOpenChange={(v) => !v && setAlvoCancelar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar tarefa</DialogTitle>
            <DialogDescription>{alvoCancelar?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Por que esta tarefa não precisa mais ser feita"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoCancelar(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim() || cancelar.isPending}
              onClick={() => {
                if (!alvoCancelar) return;
                cancelar.mutate(
                  { id: alvoCancelar.id, motivo },
                  { onSuccess: () => setAlvoCancelar(null) },
                );
              }}
            >
              Cancelar tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
