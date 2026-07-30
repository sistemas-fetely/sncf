import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useCategorias, useVinculosAtivos, useCentrosCusto, usePlanoContas,
  useLancarSolicitacao, formatarBRL, type Categoria,
} from "@/hooks/useReembolso";

const TIPOS_DOCUMENTO = [
  { valor: "cupom", rotulo: "Cupom fiscal" },
  { valor: "nf", rotulo: "Nota fiscal" },
  { valor: "danfe", rotulo: "DANFE" },
  { valor: "recibo_app", rotulo: "Recibo de aplicativo" },
  { valor: "guia", rotulo: "Guia" },
  { valor: "recibo_manuscrito", rotulo: "Recibo manuscrito" },
];

interface RateioLinha {
  centro_custo_id: string;
  percentual: string;
}

interface ItemForm {
  uid: string;
  categoria_codigo: string;
  data_despesa: string;
  descricao: string;
  valor_solicitado: string;
  cnpj_emitente: string;
  tipo_documento: string;
  numero_comprovante: string;
  evento_gerador: string;
  origem_trajeto: string;
  destino_trajeto: string;
  km: string;
  justificativa: string;
  plano_contas_id: string;
  rateioAberto: boolean;
  rateio: RateioLinha[];
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function novoItem(): ItemForm {
  return {
    uid: crypto.randomUUID(),
    categoria_codigo: "",
    data_despesa: hoje(),
    descricao: "",
    valor_solicitado: "",
    cnpj_emitente: "",
    tipo_documento: "",
    numero_comprovante: "",
    evento_gerador: "",
    origem_trajeto: "",
    destino_trajeto: "",
    km: "",
    justificativa: "",
    plano_contas_id: "",
    rateioAberto: false,
    rateio: [{ centro_custo_id: "", percentual: "100" }],
  };
}

function mascararCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function numero(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (solicitacaoId: string) => void;
}

export default function LancarReembolsoSheet({ open, onOpenChange, onCriado }: Props) {
  const vinculosQ = useVinculosAtivos();
  const categoriasQ = useCategorias();
  const centrosQ = useCentrosCusto();
  const planoQ = usePlanoContas();
  const lancar = useLancarSolicitacao();

  const [vinculoId, setVinculoId] = useState("");
  const [emailRemetente, setEmailRemetente] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(hoje());
  const [threadRef, setThreadRef] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);

  const vinculo = (vinculosQ.data ?? []).find((v) => v.vinculo_id === vinculoId) ?? null;

  const pendenciasCadastro = useMemo(() => {
    if (!vinculo) return [];
    const lista: string[] = [];
    if (vinculo.falta_email) lista.push("sem e-mail corporativo");
    if (vinculo.falta_pix) lista.push("sem chave PIX");
    if (vinculo.falta_gestor) lista.push("sem gestor");
    if (vinculo.falta_centro_custo) lista.push("sem centro de custo");
    if (vinculo.falta_previsao_contratual) lista.push("sem previsão contratual de reembolso");
    return lista;
  }, [vinculo]);

  const categoriaPorCodigo = useMemo(() => {
    const m = new Map<string, Categoria>();
    for (const c of categoriasQ.data ?? []) m.set(String(c.codigo), c);
    return m;
  }, [categoriasQ.data]);

  const total = itens.reduce((s, i) => s + numero(i.valor_solicitado), 0);

  function atualizar(uid: string, patch: Partial<ItemForm>) {
    setItens((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  }

  function atualizarRateio(uid: string, idx: number, patch: Partial<RateioLinha>) {
    setItens((prev) =>
      prev.map((i) =>
        i.uid === uid
          ? { ...i, rateio: i.rateio.map((r, k) => (k === idx ? { ...r, ...patch } : r)) }
          : i,
      ),
    );
  }

  function resetar() {
    setVinculoId("");
    setEmailRemetente("");
    setDataRecebimento(hoje());
    setThreadRef("");
    setItens([novoItem()]);
  }

  async function enviar() {
    if (!vinculoId) {
      toast.error("Escolha a pessoa do reembolso.");
      return;
    }
    for (const [idx, item] of itens.entries()) {
      if (!item.categoria_codigo) {
        toast.error(`Item ${idx + 1}: escolha a categoria.`);
        return;
      }
      if (numero(item.valor_solicitado) <= 0) {
        toast.error(`Item ${idx + 1}: informe um valor maior que zero.`);
        return;
      }
      if (item.rateioAberto) {
        const soma = item.rateio.reduce((s, r) => s + numero(r.percentual), 0);
        if (Math.abs(soma - 100) > 0.001) {
          toast.error(`Item ${idx + 1}: o rateio soma ${soma}%. Precisa somar exatamente 100%.`);
          return;
        }
        if (item.rateio.some((r) => !r.centro_custo_id)) {
          toast.error(`Item ${idx + 1}: escolha o centro de custo de cada linha do rateio.`);
          return;
        }
      }
    }

    const payload = {
      vinculo_id: vinculoId,
      origem: "email",
      email_remetente: emailRemetente.trim() || null,
      email_thread_ref: threadRef.trim() || null,
      data_recebimento: dataRecebimento,
      itens: itens.map((i) => {
        const cat = categoriaPorCodigo.get(i.categoria_codigo);
        return {
          categoria_codigo: Number(i.categoria_codigo),
          data_despesa: i.data_despesa,
          descricao: i.descricao.trim() || null,
          evento_gerador: cat?.exige_evento_gerador ? i.evento_gerador.trim() || null : null,
          origem_trajeto: cat?.exige_origem_destino ? i.origem_trajeto.trim() || null : null,
          destino_trajeto: cat?.exige_origem_destino ? i.destino_trajeto.trim() || null : null,
          km: cat?.exige_origem_destino && i.km.trim() ? numero(i.km) : null,
          valor_solicitado: numero(i.valor_solicitado),
          cnpj_emitente: i.cnpj_emitente.replace(/\D/g, "") || null,
          tipo_documento: i.tipo_documento || null,
          numero_comprovante: i.numero_comprovante.trim() || null,
          justificativa: cat?.exige_justificativa_central ? i.justificativa.trim() || null : null,
          plano_contas_id: cat?.plano_contas_por_item ? i.plano_contas_id || null : null,
          ...(i.rateioAberto
            ? {
                rateio: i.rateio.map((r) => ({
                  centro_custo_id: r.centro_custo_id,
                  percentual: numero(r.percentual),
                })),
              }
            : {}),
        };
      }),
    };

    try {
      const resultado = await lancar.mutateAsync(payload);
      const pend = resultado?.apontamentos ?? 0;
      toast.success(
        pend > 0
          ? `${resultado.numero} lançado. ${pend} pendência${pend === 1 ? "" : "s"} para resolver.`
          : `${resultado.numero} lançado sem pendências.`,
      );
      resetar();
      onOpenChange(false);
      onCriado(resultado.id);
    } catch {
      // erro já exibido pelo hook (toast com a mensagem do banco)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Lançar reembolso recebido</SheetTitle>
          <SheetDescription>
            Registre o que chegou por e-mail. Cadastro incompleto não impede o lançamento.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {vinculosQ.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Não foi possível carregar as pessoas. {(vinculosQ.error as Error)?.message}
              <Button size="sm" variant="outline" className="ml-2" onClick={() => vinculosQ.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Pessoa</Label>
              <Select value={vinculoId} onValueChange={setVinculoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {(vinculosQ.data ?? []).map((v) => (
                    <SelectItem key={v.vinculo_id} value={v.vinculo_id}>
                      {v.nome_completo ?? v.vinculo_id} · {v.tipo_vinculo ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vinculo && pendenciasCadastro.length > 0 && (
              <div className="col-span-2 flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Cadastro incompleto ({pendenciasCadastro.join(", ")}). Dá para lançar assim. O que
                  faltar vai aparecer como pendência resolvível depois de lançar.
                </span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">E-mail do remetente</Label>
              <Input
                type="email"
                value={emailRemetente}
                onChange={(e) => setEmailRemetente(e.target.value)}
                placeholder="pessoa@dominio.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data de recebimento</Label>
              <Input
                type="date"
                value={dataRecebimento}
                onChange={(e) => setDataRecebimento(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Referência da thread (opcional)</Label>
              <Input value={threadRef} onChange={(e) => setThreadRef(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            {itens.map((item, idx) => {
              const cat = categoriaPorCodigo.get(item.categoria_codigo);
              const somaRateio = item.rateio.reduce((s, r) => s + numero(r.percentual), 0);
              return (
                <Card key={item.uid} className="card-shadow">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Item {idx + 1}</span>
                      {itens.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setItens((prev) => prev.filter((i) => i.uid !== item.uid))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Categoria</Label>
                        <Select
                          value={item.categoria_codigo}
                          onValueChange={(v) => atualizar(item.uid, { categoria_codigo: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {(categoriasQ.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={String(c.codigo)}>
                                {c.codigo} · {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data da despesa</Label>
                        <Input
                          type="date"
                          value={item.data_despesa}
                          onChange={(e) => atualizar(item.uid, { data_despesa: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Valor</Label>
                        <Input
                          inputMode="decimal"
                          value={item.valor_solicitado}
                          placeholder="0,00"
                          onChange={(e) => atualizar(item.uid, { valor_solicitado: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo de documento</Label>
                        <Select
                          value={item.tipo_documento}
                          onValueChange={(v) => atualizar(item.uid, { tipo_documento: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPOS_DOCUMENTO.map((t) => (
                              <SelectItem key={t.valor} value={t.valor}>
                                {t.rotulo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Descrição</Label>
                        <Input
                          value={item.descricao}
                          onChange={(e) => atualizar(item.uid, { descricao: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CNPJ do emitente</Label>
                        <Input
                          value={item.cnpj_emitente}
                          placeholder="00.000.000/0000-00"
                          onChange={(e) =>
                            atualizar(item.uid, { cnpj_emitente: mascararCnpj(e.target.value) })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nº do comprovante</Label>
                        <Input
                          value={item.numero_comprovante}
                          onChange={(e) =>
                            atualizar(item.uid, { numero_comprovante: e.target.value })
                          }
                        />
                      </div>

                      {cat?.exige_evento_gerador && (
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Evento que gerou</Label>
                          <Input
                            value={item.evento_gerador}
                            onChange={(e) => atualizar(item.uid, { evento_gerador: e.target.value })}
                          />
                        </div>
                      )}

                      {cat?.exige_origem_destino && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Origem</Label>
                            <Input
                              value={item.origem_trajeto}
                              onChange={(e) =>
                                atualizar(item.uid, { origem_trajeto: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Destino</Label>
                            <Input
                              value={item.destino_trajeto}
                              onChange={(e) =>
                                atualizar(item.uid, { destino_trajeto: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Km (opcional)</Label>
                            <Input
                              inputMode="decimal"
                              value={item.km}
                              onChange={(e) => atualizar(item.uid, { km: e.target.value })}
                            />
                          </div>
                        </>
                      )}

                      {cat?.plano_contas_por_item && (
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Plano de contas</Label>
                          <Select
                            value={item.plano_contas_id}
                            onValueChange={(v) => atualizar(item.uid, { plano_contas_id: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a conta" />
                            </SelectTrigger>
                            <SelectContent>
                              {(planoQ.data ?? []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.codigo} · {p.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {cat?.exige_justificativa_central && (
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">
                            Por que não foi comprado de forma centralizada
                          </Label>
                          <Textarea
                            rows={2}
                            value={item.justificativa}
                            onChange={(e) => atualizar(item.uid, { justificativa: e.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-xs"
                        onClick={() => atualizar(item.uid, { rateioAberto: !item.rateioAberto })}
                      >
                        <span className="flex items-center gap-1 font-medium">
                          {item.rateioAberto ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Rateio de centro de custo
                        </span>
                        <span className="text-muted-foreground">
                          {item.rateioAberto
                            ? `Total ${somaRateio}%`
                            : "Fechado — usa o centro de custo do vínculo"}
                        </span>
                      </button>

                      {item.rateioAberto && (
                        <div className="space-y-2 border-t p-3">
                          {item.rateio.map((r, k) => (
                            <div key={k} className="flex items-center gap-2">
                              <Select
                                value={r.centro_custo_id}
                                onValueChange={(v) =>
                                  atualizarRateio(item.uid, k, { centro_custo_id: v })
                                }
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Centro de custo" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(centrosQ.data ?? []).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.codigo} · {c.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="w-24"
                                inputMode="decimal"
                                value={r.percentual}
                                onChange={(e) =>
                                  atualizarRateio(item.uid, k, { percentual: e.target.value })
                                }
                              />
                              <span className="text-xs text-muted-foreground">%</span>
                              {item.rateio.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    atualizar(item.uid, {
                                      rateio: item.rateio.filter((_, j) => j !== k),
                                    })
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center justify-between">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                atualizar(item.uid, {
                                  rateio: [...item.rateio, { centro_custo_id: "", percentual: "" }],
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" /> Adicionar centro
                            </Button>
                            <span
                              className={cn(
                                "text-xs font-medium tabular-nums",
                                Math.abs(somaRateio - 100) > 0.001
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              Soma {somaRateio}% {Math.abs(somaRateio - 100) > 0.001 && "— precisa dar 100%"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setItens((prev) => [...prev, novoItem()])}
            >
              <Plus className="h-4 w-4" /> Adicionar item
            </Button>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Total dos itens </span>
              <span className="font-semibold tabular-nums">{formatarBRL(total)}</span>
              <Badge variant="outline" className="ml-2">
                {itens.length} item{itens.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <Button onClick={enviar} disabled={lancar.isPending}>
              {lancar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lançar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
