import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Check, ChevronsUpDown, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CategoriaFolhaSelect } from "./CategoriaFolhaSelect";
import { AnexosCompraList, type AnexoPendente } from "./AnexosCompraList";
import { useRegistrarCompraPedido } from "@/hooks/compras/useRegistrarCompraPedido";
import { useAnexosCompraRegistrada } from "@/hooks/compras/useAnexosCompraRegistrada";
import type { PedidoCompraFull, PedidoCompraItemRow } from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

interface ItemEstado {
  selecionado: boolean;
  quantidade_real: number;
  valor_unitario_real: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido: PedidoCompraFull | null;
}

export function RegistrarCompraDialog({ open, onOpenChange, pedido }: Props) {
  const registrar = useRegistrarCompraPedido();

  const [parceiroId, setParceiroId] = useState<string>("");
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [contaId, setContaId] = useState<string>("");
  const [dataCompra, setDataCompra] = useState<Date>(new Date());
  const [valorTotal, setValorTotal] = useState<string>("0");
  const [parcelasCount, setParcelasCount] = useState<number>(1);
  const [primeiraParcelaData, setPrimeiraParcelaData] = useState<Date>(new Date());
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [meioPagamentoId, setMeioPagamentoId] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [itensState, setItensState] = useState<Record<string, ItemEstado>>({});
  const [pendentes, setPendentes] = useState<AnexoPendente[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const itensPendentes = useMemo<PedidoCompraItemRow[]>(
    () => (pedido?.pedidos_compra_itens || []).filter((i) => i.status === "pendente"),
    [pedido],
  );

  // Reset when opens
  useEffect(() => {
    if (!open || !pedido) return;
    const initState: Record<string, ItemEstado> = {};
    let somaEstimada = 0;
    for (const i of itensPendentes) {
      const q = Number(i.quantidade);
      const v = Number(i.valor_estimado_unitario);
      initState[i.id] = { selecionado: true, quantidade_real: q, valor_unitario_real: v };
      somaEstimada += q * v;
    }
    setItensState(initState);
    setParceiroId(pedido.parceiro_preferencial_id || "");
    setContaId("");
    setDataCompra(new Date());
    setPrimeiraParcelaData(new Date());
    setParcelasCount(1);
    setIntervaloDias(30);
    setMeioPagamentoId("");
    setObservacao("");
    setValorTotal(somaEstimada.toFixed(2));
    setPendentes([]);
  }, [open, pedido, itensPendentes]);

  // Lookups
  const { data: parceiros = [] } = useQuery({
    queryKey: ["compras", "parceiros-comprador"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj")
        .eq("ativo", true)
        .order("razao_social");
      return data || [];
    },
  });

  const { data: formas = [] } = useQuery({
    queryKey: ["compras", "formas-pagamento"],
    queryFn: async () => {
      const { data } = await supabase
        .from("formas_pagamento")
        .select("id, nome, tipo")
        .eq("ativo", true)
        .order("ordem");
      return data || [];
    },
  });

  const { upload: uploadAnexo } = useAnexosCompraRegistrada();

  const valorTotalNum = Number(valorTotal) || 0;
  const itensSelecionados = useMemo(
    () =>
      itensPendentes
        .filter((i) => itensState[i.id]?.selecionado)
        .map((i) => ({
          ...i,
          q: itensState[i.id].quantidade_real,
          v: itensState[i.id].valor_unitario_real,
          subtotal:
            Number(itensState[i.id].quantidade_real) * Number(itensState[i.id].valor_unitario_real),
        })),
    [itensPendentes, itensState],
  );
  const somaItens = itensSelecionados.reduce((s, i) => s + i.subtotal, 0);
  const divergenciaItens = Math.abs(somaItens - valorTotalNum) > 0.5;

  // Preview parcelas
  const previewParcelas = useMemo(() => {
    const n = Math.max(1, Math.floor(parcelasCount));
    const intervalo = Math.max(1, Math.floor(intervaloDias));
    const valorParcela = Math.round((valorTotalNum / n) * 100) / 100;
    const ultima = Math.round((valorTotalNum - valorParcela * (n - 1)) * 100) / 100;
    return Array.from({ length: n }, (_, idx) => ({
      n: idx + 1,
      valor: idx === n - 1 ? ultima : valorParcela,
      vencimento: addDays(primeiraParcelaData, idx * intervalo),
    }));
  }, [parcelasCount, valorTotalNum, primeiraParcelaData, intervaloDias]);

  const validacao = (): string | null => {
    if (!parceiroId) return "Selecione o fornecedor";
    if (!contaId) return "Selecione a categoria contábil";
    if (!(valorTotalNum > 0)) return "Valor total deve ser maior que zero";
    if (!dataCompra) return "Data da compra é obrigatória";
    if (!(parcelasCount >= 1)) return "Nº de parcelas inválido";
    if (!primeiraParcelaData) return "Data da primeira parcela é obrigatória";
    if (!(intervaloDias >= 1)) return "Intervalo deve ser ao menos 1 dia";
    if (itensSelecionados.length === 0) return "Selecione ao menos 1 item";
    for (const i of itensSelecionados) {
      if (!(i.q > 0)) return `Item "${i.descricao}": quantidade real inválida`;
      if (!(i.v > 0)) return `Item "${i.descricao}": valor unitário inválido`;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!pedido) return;
    const err = validacao();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const res = await registrar.mutateAsync({
        pedido_id: pedido.id,
        conta_id: contaId,
        parceiro_id: parceiroId,
        valor_total: valorTotalNum,
        data_compra: format(dataCompra, "yyyy-MM-dd"),
        parcelas_count: Math.floor(parcelasCount),
        primeira_parcela_data: format(primeiraParcelaData, "yyyy-MM-dd"),
        intervalo_dias: Math.floor(intervaloDias),
        meio_pagamento_id: meioPagamentoId || null,
        observacao: observacao || null,
        itens: itensSelecionados.map((i) => ({
          pedido_item_id: i.id,
          quantidade_real: i.q,
          valor_unitario_real: i.v,
        })),
      });

      // Upload anexos pendentes
      for (const a of pendentes) {
        try {
          await uploadAnexo({ file: a.file, tipo: a.tipo, compra_id: res.compra_id });
        } catch (e) {
          toast.error(`Falha ao enviar ${a.file.name}: ${(e as Error).message}`);
        }
      }
      onOpenChange(false);
    } catch {
      // toast já mostrado pelo hook
    } finally {
      setSubmitting(false);
    }
  };

  const parceiroSelecionado = parceiros.find((p) => p.id === parceiroId);

  if (!pedido) return null;

  const marcarTodos = (v: boolean) => {
    setItensState((prev) => {
      const next = { ...prev };
      for (const i of itensPendentes) next[i.id] = { ...next[i.id], selecionado: v };
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Pedido: {pedido.descricao_geral || "(sem descrição)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* SEÇÃO 1: Compra */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Dados da compra</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fornecedor *</Label>
                <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between font-normal",
                        !parceiroId && "text-muted-foreground",
                      )}
                    >
                      {parceiroSelecionado ? (
                        <span className="truncate">{parceiroSelecionado.razao_social}</span>
                      ) : (
                        <span>Selecione o fornecedor...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por razão social, fantasia ou CNPJ..." />
                      <CommandList className="max-h-[320px]">
                        <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                        <CommandGroup>
                          {parceiros.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.razao_social} ${p.nome_fantasia || ""} ${p.cnpj || ""}`}
                              onSelect={() => {
                                setParceiroId(p.id);
                                setParceiroOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  parceiroId === p.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">{p.razao_social}</span>
                                <span className="text-xs text-muted-foreground">
                                  {p.nome_fantasia || "—"} · {p.cnpj || "sem CNPJ"}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Categoria contábil *</Label>
                <CategoriaFolhaSelect value={contaId || null} onChange={setContaId} tipo="despesa" />
              </div>

              <div>
                <Label>Data da compra *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(dataCompra, "dd MMM yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataCompra}
                      onSelect={(d) => d && setDataCompra(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Valor total real (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* SEÇÃO 2: Itens cobertos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Itens cobertos *</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => marcarTodos(true)}>
                  Marcar todos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => marcarTodos(false)}>
                  Desmarcar todos
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {itensPendentes.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                  Nenhum item pendente neste pedido.
                </Card>
              )}
              {itensPendentes.map((i) => {
                const st = itensState[i.id];
                if (!st) return null;
                const subtotal = Number(st.quantidade_real) * Number(st.valor_unitario_real);
                return (
                  <Card key={i.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={st.selecionado}
                        onCheckedChange={(v) =>
                          setItensState((prev) => ({
                            ...prev,
                            [i.id]: { ...prev[i.id], selecionado: !!v },
                          }))
                        }
                      />
                      <div className="flex-1 space-y-2">
                        <div className="text-sm font-medium">{i.descricao}</div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <Label className="text-xs">Qtde estimada</Label>
                            <div className="text-sm">{Number(i.quantidade)}</div>
                          </div>
                          <div>
                            <Label className="text-xs">Qtde real</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={st.quantidade_real}
                              onChange={(e) =>
                                setItensState((prev) => ({
                                  ...prev,
                                  [i.id]: {
                                    ...prev[i.id],
                                    quantidade_real: Number(e.target.value),
                                  },
                                }))
                              }
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">V. unit estimado</Label>
                            <div className="text-sm">{fmtBRL(Number(i.valor_estimado_unitario))}</div>
                          </div>
                          <div>
                            <Label className="text-xs">V. unit real</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={st.valor_unitario_real}
                              onChange={(e) =>
                                setItensState((prev) => ({
                                  ...prev,
                                  [i.id]: {
                                    ...prev[i.id],
                                    valor_unitario_real: Number(e.target.value),
                                  },
                                }))
                              }
                              className="h-8"
                            />
                          </div>
                        </div>
                        <div className="text-right text-sm font-medium">
                          Subtotal real: {fmtBRL(subtotal)}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            <div className="text-right text-sm">
              <span className="text-muted-foreground">
                {itensSelecionados.length} item(ns) cobertos · Soma real:{" "}
              </span>
              <span className="font-semibold">{fmtBRL(somaItens)}</span>
            </div>
            {divergenciaItens && itensSelecionados.length > 0 && (
              <Card className="p-3 bg-warning/10 border-warning/30 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="text-xs">
                  Soma dos itens ({fmtBRL(somaItens)}) difere do valor total da compra (
                  {fmtBRL(valorTotalNum)}). Verifique.
                </div>
              </Card>
            )}
          </section>

          {/* SEÇÃO 3: Parcelamento */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Parcelamento</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nº parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={parcelasCount}
                  onChange={(e) => setParcelasCount(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label>Data primeira parcela</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(primeiraParcelaData, "dd MMM yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={primeiraParcelaData}
                      onSelect={(d) => d && setPrimeiraParcelaData(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Intervalo (dias)</Label>
                <Input
                  type="number"
                  min="1"
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(Number(e.target.value) || 30)}
                />
              </div>
            </div>
            <Card className="p-3 bg-muted/30">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Preview das parcelas
              </div>
              <div className="space-y-0.5 text-sm">
                {previewParcelas.map((p) => (
                  <div key={p.n} className="flex justify-between">
                    <span>
                      Parcela {p.n}/{previewParcelas.length}
                    </span>
                    <span>
                      {fmtBRL(p.valor)} — vence{" "}
                      {format(p.vencimento, "dd MMM yyyy", { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* SEÇÃO 4: Meio pagamento */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Meio de pagamento</h3>
            <div>
              <Label>Forma de pagamento (opcional)</Label>
              <Select
                value={meioPagamentoId || "none"}
                onValueChange={(v) => setMeioPagamentoId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <span>{f.nome}</span>
                        <Badge variant="secondary" className="text-xs">
                          {f.tipo}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* SEÇÃO 5: Observação */}
          <section className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Notas internas sobre a compra"
            />
          </section>

          {/* SEÇÃO 6: Anexos */}
          <AnexosCompraList mode="pendente" pendentes={pendentes} onChange={setPendentes} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Registrar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
