import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePessoasSistema, useProjetos, useTiposExecucaoTarefa } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  usePreviewOcorrencias, useSalvarRecorrencia, type NovaRecorrencia, type Recorrencia,
} from "@/hooks/tarefas/useRecorrencias";
import { useTemplates, useTemplateItens } from "@/hooks/tarefas/useTemplates";
import { DIAS_SEMANA_CURTO, MESES_NOME, dataBR, textoRecorrencia } from "@/lib/tarefas/recorrenciaTexto";


const SEM_VALOR = "__nenhum__";


function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  regra: Recorrencia | null;
}

const VAZIA: NovaRecorrencia = {
  titulo: "",
  descricao: null,
  prioridade: "media",
  projeto_id: null,
  secao_id: null,
  responsavel_id: null,
  template_id: null,
  visibilidade: "publica",
  estimativa_horas: null,
  departamento_destino_id: null,
  frequencia: "semanal",
  intervalo: 1,
  dias_semana: [1],
  dia_mes: null,
  mes: null,
  inicio_em: hojeISO(),
  fim_em: null,
  antecedencia_dias: 0,
  tipo_execucao: "tarefa",
  ativo: true,
};


export function RecorrenciaDialog({ aberto, onOpenChange, regra }: Props) {
  const [f, setF] = useState<NovaRecorrencia>(VAZIA);
  const salvar = useSalvarRecorrencia();
  const { data: pessoas } = usePessoasSistema();
  const { data: projetos } = useProjetos();
  const { data: templates } = useTemplates();
  const { data: templateItens } = useTemplateItens(f.template_id);
  const { data: tiposExecucao } = useTiposExecucaoTarefa();
  const tipoAtual = (tiposExecucao ?? []).find((t) => t.codigo === f.tipo_execucao);
  const instanciaUnica = tipoAtual?.instancia_unica === true;


  useEffect(() => {
    if (!aberto) return;
    if (regra) {
      const { id: _id, criado_em: _c, proxima_geracao: _p, ...resto } = regra;
      setF(resto);
    } else {
      setF({ ...VAZIA, inicio_em: hojeISO() });
    }
  }, [aberto, regra]);

  const preview = usePreviewOcorrencias(
    {
      frequencia: f.frequencia,
      intervalo: f.intervalo,
      dias_semana: f.dias_semana,
      dia_mes: f.dia_mes,
      mes: f.mes,
      inicio_em: f.inicio_em,
    },
    3
  );

  const texto = useMemo(() => textoRecorrencia(f), [f]);

  const alternarDia = (d: number) => {
    const atuais = f.dias_semana ?? [];
    const novos = atuais.includes(d) ? atuais.filter((x) => x !== d) : [...atuais, d].sort();
    setF({ ...f, dias_semana: novos });
  };

  const trocarFrequencia = (freq: string) => {
    setF({
      ...f,
      frequencia: freq,
      dias_semana: freq === "semanal" ? f.dias_semana ?? [1] : null,
      dia_mes: freq === "mensal" || freq === "anual" ? f.dia_mes ?? 1 : null,
      mes: freq === "anual" ? f.mes ?? 1 : null,
    });
  };

  // Rotina vive só no dia corrente — antecedência não faz sentido e é zerada na origem.
  useEffect(() => {
    if (instanciaUnica && f.antecedencia_dias !== 0) setF((a) => ({ ...a, antecedencia_dias: 0 }));
  }, [instanciaUnica, f.antecedencia_dias]);

  const podeSalvar = f.titulo.trim().length > 0 && f.intervalo >= 1;

  const confirmar = () => {
    salvar.mutate(
      {
        id: regra?.id ?? null,
        valores: {
          ...f,
          titulo: f.titulo.trim(),
          visibilidade: f.visibilidade === "privada" ? "privada" : "publica",
        },
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{regra ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
          <DialogDescription>
            Cada ciclo cria uma tarefa nova — a regra não move a data de uma tarefa já existente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título da tarefa</Label>
            <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={f.descricao ?? ""}
              onChange={(e) => setF({ ...f, descricao: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de execução</Label>
            <Select value={f.tipo_execucao} onValueChange={(v) => setF({ ...f, tipo_execucao: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(tiposExecucao ?? []).map((t) => (
                  <SelectItem key={t.codigo} value={t.codigo} disabled={!t.gera_instancia}>
                    {t.nome}
                    {!t.gera_instancia && (
                      <span className="ml-1 text-[10px] text-muted-foreground">· disponível em breve</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipoAtual?.descricao && (
              <p className="text-xs text-muted-foreground">{tipoAtual.descricao}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Frequência</Label>
              <Select value={f.frequencia} onValueChange={trocarFrequencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>A cada</Label>
              <Input
                type="number"
                min={1}
                value={f.intervalo}
                onChange={(e) => setF({ ...f, intervalo: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          </div>

          {f.frequencia === "semanal" && (
            <div className="space-y-1.5">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA_CURTO.map((nome, i) => {
                  const ativo = (f.dias_semana ?? []).includes(i);
                  return (
                    <button
                      key={nome}
                      type="button"
                      onClick={() => alternarDia(i)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs capitalize",
                        ativo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      )}
                    >
                      {nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(f.frequencia === "mensal" || f.frequencia === "anual") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={f.dia_mes ?? 1}
                  onChange={(e) =>
                    setF({ ...f, dia_mes: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
                  }
                />
              </div>
              {f.frequencia === "anual" && (
                <div className="space-y-1.5">
                  <Label>Mês</Label>
                  <Select
                    value={String(f.mes ?? 1)}
                    onValueChange={(v) => setF({ ...f, mes: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES_NOME.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)} className="capitalize">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="h-4 w-4" /> {texto}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Próximas 3:</span>
              {preview.error ? (
                <span className="text-xs text-destructive">
                  {(preview.error as Error).message}
                </span>
              ) : preview.isLoading ? (
                <span className="text-xs text-muted-foreground">calculando…</span>
              ) : (preview.data ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">nenhuma ocorrência futura</span>
              ) : (
                (preview.data ?? []).map((d) => (
                  <Badge key={d} variant="outline" className="text-[10px]">{dataBR(d)}</Badge>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={f.responsavel_id ?? SEM_VALOR}
                onValueChange={(v) => setF({ ...f, responsavel_id: v === SEM_VALOR ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Sem responsável</SelectItem>
                  {(pessoas ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select
                value={f.projeto_id ?? SEM_VALOR}
                onValueChange={(v) => setF({ ...f, projeto_id: v === SEM_VALOR ? null : v, secao_id: null })}
              >
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_VALOR}>Sem projeto</SelectItem>
                  {(projetos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={f.prioridade} onValueChange={(v) => setF({ ...f, prioridade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estimativa (horas)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={f.estimativa_horas ?? ""}
                onChange={(e) =>
                  setF({ ...f, estimativa_horas: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Começa em</Label>
              <Input
                type="date"
                value={f.inicio_em}
                onChange={(e) => setF({ ...f, inicio_em: e.target.value || hojeISO() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Termina em (opcional)</Label>
              <Input
                type="date"
                value={f.fim_em ?? ""}
                onChange={(e) => setF({ ...f, fim_em: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Antecedência de geração (dias)</Label>
              <Input
                type="number"
                min={0}
                disabled={instanciaUnica}
                value={instanciaUnica ? 0 : f.antecedencia_dias}
                onChange={(e) =>
                  setF({ ...f, antecedencia_dias: Math.max(0, Number(e.target.value) || 0) })
                }
              />
              {instanciaUnica && (
                <p className="text-xs text-muted-foreground">
                  Rotina é sempre do dia corrente — não se gera com antecedência.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Visibilidade</Label>
              <Select value={f.visibilidade} onValueChange={(v) => setF({ ...f, visibilidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publica">Pública</SelectItem>
                  <SelectItem value="privada">Privada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Template de subtarefas (opcional)</Label>
            <Select
              value={f.template_id ?? SEM_VALOR}
              onValueChange={(v) => setF({ ...f, template_id: v === SEM_VALOR ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_VALOR}>Nenhum</SelectItem>
                {(templates ?? [])
                  .filter((t) => t.ativo)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cada ocorrência nasce com as subtarefas do template penduradas nela. O prazo de cada subtarefa conta a partir da data da ocorrência.
            </p>
            {f.template_id && templateItens && templateItens.length > 0 && (() => {
              const diretas = templateItens.filter((i) => !i.parent_item_id).length;
              const netas = templateItens.filter((i) => i.parent_item_id).length;
              const total = diretas + netas;
              const plural = total > 1;
              return (
                <p className="text-xs text-muted-foreground">
                  {netas === 0
                    ? `${diretas} subtarefa${diretas > 1 ? "s" : ""} ser${diretas > 1 ? "ão" : "á"} criada${diretas > 1 ? "s" : ""} em cada ocorrência.`
                    : `${diretas} subtarefa${diretas > 1 ? "s" : ""} (mais ${netas} em segundo nível) ser${plural ? "ão" : "á"} criada${plural ? "s" : ""} em cada ocorrência.`}
                </p>
              );
            })()}
          </div>
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!podeSalvar || salvar.isPending}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
