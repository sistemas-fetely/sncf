import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, ChevronDown, ChevronRight, Clock3, Inbox, Loader2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatError } from "@/lib/format-error";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCancelarTarefaFila, useConcluirTarefaFila, useFilaProcessos, type TarefaFila,
  controlesTarefaFila, ordenarFilaPorCaso, podeConcluirTarefaFila,
} from "@/hooks/tarefas/useFilaProcessos";
import { linkDoCaso, useProcessoTarefas } from "@/hooks/processos/useProcessoTarefas";
import {
  podeConfirmarDecisao, tarefaPermiteDecisao, useProcessoDecidir, useProcessoDecisaoPrevia,
  type DecisaoProcesso, type DesfechoProcesso,
} from "@/hooks/processos/useProcessoDecisao";

const TODOS = "__todos__";

export default function FilaProcessos() {
  const navigate = useNavigate();
  const [sistema, setSistema] = useState<string>(TODOS);
  const [area, setArea] = useState<string>(TODOS);
  const [processo, setProcesso] = useState<string>(TODOS);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const alternar = (id: string) => setExpandidas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const { data: procMap, isLoading: processosLoading, error: processosError } = useProcessoTarefas();
  const [soBloqueantes, setSoBloqueantes] = useState(false);
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);

  const { data: tarefas, isLoading, error } = useFilaProcessos({
    sistema: sistema === TODOS ? null : sistema,
    area: area === TODOS ? null : area,
    processo: processo === TODOS ? null : processo,
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
  const [alvoDecidir, setAlvoDecidir] = useState<TarefaFila | null>(null);
  const [motivo, setMotivo] = useState("");

  const linhas = useMemo(() => ordenarFilaPorCaso(tarefas ?? [], procMap), [tarefas, procMap]);

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

  const processos = useMemo(() => {
    const m = new Map<string, string>();
    (universo ?? []).forEach((t) => {
      if (t.tipo_processo) m.set(t.tipo_processo, t.tipo_processo_nome ?? t.tipo_processo);
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

  const processoConcluir = alvoConcluir ? procMap?.get(alvoConcluir.id) : undefined;
  const exigeTexto = processoConcluir?.fecha_por === "pessoa";
  const exigeEvidencia = exigeTexto || !!alvoConcluir?.bloqueante;
  const podeConcluir = podeConcluirTarefaFila(alvoConcluir, processoConcluir, evidenciaTexto, evidenciaUrl);

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

        <Select value={processo} onValueChange={setProcesso}>
          <SelectTrigger className="h-8 w-[210px]">
            <SelectValue placeholder="Processo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os processos</SelectItem>
            {processos.map(([valor, nome]) => (
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

      {error || processosError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar a fila: {formatError(error ?? processosError)}
        </p>
      ) : isLoading || processosLoading ? (
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
          {linhas.map((t) => {
            const proc = procMap?.get(t.id);
            const controles = controlesTarefaFila(t.esta_aberta, proc);
            const destino = (proc && linkDoCaso(proc)) || t.link_acao;
            const aberta = expandidas.has(t.id);
            return (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-start gap-3 p-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => alternar(t.id)}
                      aria-expanded={aberta}
                      className="flex min-w-0 items-center gap-1 text-left"
                    >
                      {aberta ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate font-medium">{t.titulo}</span>
                    </button>
                    {t.esta_aberta && proc && (proc.caso_abertas ?? 0) > 1 && proc.caso_posicao != null && (
                      <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                        {proc.caso_posicao} de {proc.caso_abertas}
                      </Badge>
                    )}
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
                    {proc && (
                      <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                        {proc.processo_nome} · {proc.passo_nome}
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
                  {proc?.fecha_por === "sistema" && proc.o_que_falta && (
                    <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
                      <Clock3 className="mt-0.5 h-3 w-3 shrink-0" />{proc.o_que_falta}
                    </p>
                  )}
                  {aberta && (
                    <div className="space-y-1 pt-1">
                      <p className="whitespace-pre-line text-sm">{t.descricao?.trim() || "Sem descrição."}</p>
                      {proc?.fecha_por === "sistema" && proc.o_que_falta && (
                        <p className="whitespace-pre-line text-xs text-muted-foreground">{proc.o_que_falta}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {destino && (
                    <Button size="sm" variant="ghost" onClick={() => navigate(destino)}>
                      Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                  {t.esta_aberta && (
                    <>
                      {tarefaPermiteDecisao(t.esta_aberta, proc) && (
                        <Button size="sm" variant="default" onClick={() => setAlvoDecidir(t)}>Decidir</Button>
                      )}
                      {controles.concluir && <Button size="sm" variant="outline" onClick={() => abrirConcluir(t)}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                      </Button>}
                      {controles.cancelar && <Button size="sm" variant="ghost" onClick={() => abrirCancelar(t)}>
                        <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar
                      </Button>}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {alvoDecidir && <DecisaoClienteDialog key={alvoDecidir.id} tarefa={alvoDecidir} fechar={() => setAlvoDecidir(null)} />}

      {/* Conclusão — a RPC recusa tarefa bloqueante sem evidência */}
      <Dialog open={!!alvoConcluir} onOpenChange={(v) => !v && setAlvoConcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>{alvoConcluir?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {exigeTexto && processoConcluir?.o_que_falta && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{processoConcluir.o_que_falta}</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="concluir-evidencia">{exigeTexto ? "O que foi feito" : "Evidência"}</Label>
              <Textarea
                id="concluir-evidencia"
                required={exigeTexto}
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
                {exigeTexto ? "Informe o que foi feito para concluir." : "Tarefa bloqueante exige evidência para concluir."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoConcluir(null)}>Voltar</Button>
            <Button
              disabled={!podeConcluir || concluir.isPending}
              onClick={() => {
                if (!alvoConcluir || !podeConcluir) return;
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

const valorDecisao = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DecisaoClienteDialog({ tarefa, fechar }: { tarefa: TarefaFila; fechar: () => void }) {
  const previaQ = useProcessoDecisaoPrevia(tarefa.id, true);
  const decidir = useProcessoDecidir();
  const [escolha, setEscolha] = useState<DecisaoProcesso | "">("");
  const [desfecho, setDesfecho] = useState<DesfechoProcesso | "">("");
  const [combinado, setCombinado] = useState("");
  const previa = previaQ.isError ? undefined : previaQ.data;
  const confirmar = podeConfirmarDecisao(previa, escolha, combinado, desfecho, decidir.isPending || previaQ.isFetching);

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !decidir.isPending) fechar(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Decidir com o cliente</DialogTitle>
          <DialogDescription className="break-words">{tarefa.titulo}</DialogDescription>
        </DialogHeader>
        {previaQ.isPending && <Skeleton className="h-32 w-full" />}
        {previaQ.isError && <p className="text-sm text-destructive">{formatError(previaQ.error)}</p>}
        {previa && (
          <div className="space-y-4">
            <p className="text-sm">Pedido {previa.pedido ?? "—"} · {previa.momento ?? "—"}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-auto min-h-16 whitespace-normal" variant={escolha === "reenviar" ? "default" : "outline"}
                aria-pressed={escolha === "reenviar"} disabled={decidir.isPending} onClick={() => setEscolha("reenviar")}>
                Reenviar
              </Button>
              <Button className="h-auto min-h-16 whitespace-normal" variant={escolha === "cancelar" ? "default" : "outline"}
                aria-pressed={escolha === "cancelar"} disabled={decidir.isPending} onClick={() => setEscolha("cancelar")}>
                Cancelar o pedido
              </Button>
            </div>
            {escolha === "reenviar" && <p className="text-sm text-muted-foreground">A tarefa é concluída com a decisão registrada. O reenvio segue pelo fluxo normal do pedido.</p>}
            {escolha === "cancelar" && (
              <div className="space-y-3">
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p className="font-medium">O que vai acontecer</p>
                  <p className="whitespace-pre-line">{previa.o_que_acontece}</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>{previa.financeiro.titulos_abertos} título(s) em aberto · R$ {valorDecisao(previa.financeiro.valor_aberto)}</li>
                    <li>{previa.financeiro.boletos_a_baixar} boleto(s) com baixa pedida ao banco</li>
                    {previa.financeiro.titulos_pagos > 0 && <li>{previa.financeiro.titulos_pagos} título(s) já pago(s) · R$ {valorDecisao(previa.financeiro.valor_pago)}</li>}
                  </ul>
                </div>
                <p className="text-xs text-destructive">O boleto baixado no banco não volta: se o cliente mudar de ideia será preciso emitir outro.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="decisao-desfecho">Desfecho</Label>
                  <Select value={desfecho} onValueChange={(valor) => {
                    if (valor === "haver" || valor === "troca" || valor === "reembolso") setDesfecho(valor);
                  }} disabled={decidir.isPending}>
                    <SelectTrigger id="decisao-desfecho" aria-required="true"><SelectValue placeholder="Escolha o desfecho" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="haver">Crédito para o cliente</SelectItem>
                      <SelectItem value="troca">Troca</SelectItem>
                      <SelectItem value="reembolso">Reembolso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!previa.pode_cancelar && <ul className="space-y-1 text-xs text-destructive">{previa.pendencias.map((pendencia, i) => <li key={i}>{pendencia}</li>)}</ul>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="decisao-combinado">O que foi combinado com o cliente</Label>
              <Textarea id="decisao-combinado" required minLength={5} rows={3} value={combinado}
                disabled={decidir.isPending} onChange={(e) => setCombinado(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={decidir.isPending} onClick={fechar}>Voltar</Button>
          <Button variant={escolha === "cancelar" ? "destructive" : "default"} disabled={!confirmar} onClick={() => {
            if (!confirmar || !escolha) return;
            decidir.mutate({ tarefaId: tarefa.id, decisao: escolha, motivo: combinado, desfecho: desfecho || null }, { onSuccess: fechar });
          }}>
            {decidir.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
