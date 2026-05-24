import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Loader2,
  AlertCircle,
  Plus,
  Save,
} from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CategoriaFolhaSelect } from "./CategoriaFolhaSelect";
import { AnexosCompraList, type AnexoPendente } from "./AnexosCompraList";
import { NovoFornecedorRapidoDialog } from "./NovoFornecedorRapidoDialog";
import { LinhasCompraEditor } from "./LinhasCompraEditor";
import { useRegistrarCompraPedido } from "@/hooks/compras/useRegistrarCompraPedido";
import { useAnexosCompraRegistrada } from "@/hooks/compras/useAnexosCompraRegistrada";
import type {
  PedidoCompraFull,
  LinhaCompra,
  StatusAlvo,
  TipoLinha,
  StatusLinha,
} from "@/lib/compras/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function newLocalId() {
  return `l_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido: PedidoCompraFull | null;
  onFinalizadoENova?: (pedidoAtualId: string) => void;
}

export function RegistrarCompraDialog({
  open,
  onOpenChange,
  pedido,
  onFinalizadoENova,
}: Props) {
  const registrar = useRegistrarCompraPedido();

  const [compraIdAtual, setCompraIdAtual] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaCompra[]>([]);
  const [parceiroId, setParceiroId] = useState<string>("");
  const [parceiroOpen, setParceiroOpen] = useState(false);
  const [contaId, setContaId] = useState<string>("");
  const [dataCompra, setDataCompra] = useState<Date>(new Date());
  const [parcelasCount, setParcelasCount] = useState<number>(1);
  const [primeiraParcelaData, setPrimeiraParcelaData] = useState<Date>(new Date());
  const [intervaloDias, setIntervaloDias] = useState<number>(1);
  const [periodicidade, setPeriodicidade] = useState<"dias" | "meses">("meses");
  const [meioPagamentoId, setMeioPagamentoId] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");
  const [jaPago, setJaPago] = useState(false);
  const [pendentes, setPendentes] = useState<AnexoPendente[]>([]);
  const [submitting, setSubmitting] = useState<null | StatusAlvo | "finalizada-nova">(null);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);

  // Busca rascunho existente
  const { data: rascunho } = useQuery({
    queryKey: ["compras", "rascunho-pedido", pedido?.id],
    enabled: !!pedido && open,
    queryFn: async () => {
      if (!pedido) return null;
      const { data: u } = await supabase.auth.getUser();
      const { data } = await (supabase as any)
        .from("compras_registradas")
        .select(
          `id, conta_id, parceiro_id, parceiro_id_pedido_original, data_compra,
           parcelas_count, primeira_parcela_data, intervalo_dias, periodicidade,
           meio_pagamento_id, observacao, valor_total,
           compras_registradas_itens (
             id, tipo_linha, status_linha, pedido_item_id, substitui_pedido_item_id,
             descricao_livre, quantidade_real, valor_unitario_real
           )`,
        )
        .eq("pedido_id", pedido.id)
        .eq("comprador_id", u.user?.id ?? "")
        .eq("status", "rascunho")
        .maybeSingle();
      return data;
    },
  });

  // Inicializar estado quando abre
  useEffect(() => {
    if (!open || !pedido) return;

    const buildDescricao = (
      tipo: TipoLinha,
      pedidoItemId: string | null,
      substituiId: string | null,
      descLivre: string | null,
    ): string => {
      if (descLivre) return descLivre;
      if (pedidoItemId) {
        const it = pedido.pedidos_compra_itens.find((p) => p.id === pedidoItemId);
        if (it) return it.descricao;
      }
      if (substituiId) {
        const it = pedido.pedidos_compra_itens.find((p) => p.id === substituiId);
        if (it) return `Substituto de: ${it.descricao}`;
      }
      return tipo;
    };

    if (rascunho) {
      setCompraIdAtual(rascunho.id);
      setParceiroId(rascunho.parceiro_id || pedido.parceiro_preferencial_id || "");
      setContaId(rascunho.conta_id || "");
      setDataCompra(rascunho.data_compra ? new Date(rascunho.data_compra + "T00:00:00") : new Date());
      setParcelasCount(Number(rascunho.parcelas_count) || 1);
      setPrimeiraParcelaData(
        rascunho.primeira_parcela_data
          ? new Date(rascunho.primeira_parcela_data + "T00:00:00")
          : new Date(),
      );
      setIntervaloDias(Number(rascunho.intervalo_dias) || 1);
      setPeriodicidade((rascunho.periodicidade as "dias" | "meses") || "meses");
      setMeioPagamentoId(rascunho.meio_pagamento_id || "");
      setObservacao(rascunho.observacao || "");
      setJaPago(false);
      setPendentes([]);
      const linhasR: LinhaCompra[] = (rascunho.compras_registradas_itens || []).map((it: any) => {
        const q = Number(it.quantidade_real || 0);
        const v = Number(it.valor_unitario_real || 0);
        return {
          _local_id: newLocalId(),
          tipo_linha: it.tipo_linha,
          status_linha: it.status_linha,
          pedido_item_id: it.pedido_item_id,
          substitui_pedido_item_id: it.substitui_pedido_item_id,
          descricao_livre: it.descricao_livre,
          quantidade_real: q,
          valor_unitario_real: v,
          _descricao_exibicao: buildDescricao(
            it.tipo_linha,
            it.pedido_item_id,
            it.substitui_pedido_item_id,
            it.descricao_livre,
          ),
          _valor_total: q * v,
        };
      });
      setLinhas(linhasR);
    } else {
      setCompraIdAtual(null);
      setParceiroId(pedido.parceiro_preferencial_id || "");
      setContaId("");
      setDataCompra(new Date());
      setPrimeiraParcelaData(new Date());
      setParcelasCount(1);
      setIntervaloDias(1);
      setPeriodicidade("meses");
      setMeioPagamentoId("");
      setObservacao("");
      setJaPago(false);
      setPendentes([]);
      const itensPendentes = pedido.pedidos_compra_itens.filter((i) => i.status === "pendente");
      const linhasInit: LinhaCompra[] = itensPendentes.map((i) => {
        const q = Number(i.quantidade);
        const v = Number(i.valor_estimado_unitario);
        return {
          _local_id: newLocalId(),
          tipo_linha: "produto",
          status_linha: "comprada" as StatusLinha,
          pedido_item_id: i.id,
          substitui_pedido_item_id: null,
          descricao_livre: null,
          quantidade_real: q,
          valor_unitario_real: v,
          _descricao_exibicao: i.descricao,
          _valor_total: q * v,
        };
      });
      setLinhas(linhasInit);
    }
  }, [open, pedido, rascunho]);

  // Lookups
  const { data: parceiros = [] } = useQuery({
    queryKey: ["compras", "parceiros-comprador"],
    queryFn: async () => {
      const { data } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, plano_contas_id")
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
        .select("id, nome")
        .eq("ativo", true)
        .order("ordem");
      return data || [];
    },
  });

  const { upload: uploadAnexo } = useAnexosCompraRegistrada();

const valorTotalCalculado = useMemo(
  () =>
    linhas
      .filter((l) => l.status_linha === "comprada")
      .reduce(
        (s, l) =>
          l.tipo_linha === "desconto" ? s - l._valor_total : s + l._valor_total,
        0,
      ),
  [linhas],
);

  const previewParcelas = useMemo(() => {
    const n = Math.max(1, Math.floor(parcelasCount));
    const intervalo = Math.max(1, Math.floor(intervaloDias));
    const valorParcela = Math.round((valorTotalCalculado / n) * 100) / 100;
    const ultima = Math.round((valorTotalCalculado - valorParcela * (n - 1)) * 100) / 100;
    return Array.from({ length: n }, (_, idx) => ({
      n: idx + 1,
      valor: idx === n - 1 ? ultima : valorParcela,
      vencimento:
        periodicidade === "meses"
          ? addMonths(primeiraParcelaData, idx * intervalo)
          : addDays(primeiraParcelaData, idx * intervalo),
    }));
  }, [parcelasCount, valorTotalCalculado, primeiraParcelaData, intervaloDias, periodicidade]);

  const parceiroSelecionado = parceiros.find((p) => p.id === parceiroId);
  const parceiroDiferente =
    !!pedido?.parceiro_preferencial_id &&
    !!parceiroId &&
    parceiroId !== pedido.parceiro_preferencial_id;
  const parceiroPreferencialNome = pedido?.parceiros_comerciais?.razao_social || "—";

  const handleSelectParceiro = (id: string) => {
    setParceiroId(id);
    const p = parceiros.find((x) => x.id === id);
    if (p?.plano_contas_id && !contaId) {
      setContaId(p.plano_contas_id);
      toast.info("Categoria preenchida automaticamente do fornecedor");
    }
    setParceiroOpen(false);
  };

  const validar = (statusAlvo: StatusAlvo): string | null => {
    if (!pedido) return "Pedido inválido";
    if (!parceiroId) return "Selecione o fornecedor";
    if (!dataCompra) return "Data da compra é obrigatória";

    if (statusAlvo === "rascunho") return null;

    if (!meioPagamentoId) return "Selecione o meio de pagamento";
    if (!(parcelasCount >= 1)) return "Nº de parcelas inválido";
    if (!primeiraParcelaData) return "Data da primeira parcela é obrigatória";
    if (!(intervaloDias >= 1)) return "Intervalo deve ser ao menos 1";
    if (linhas.length === 0) return "Adicione ao menos 1 linha";

    for (const l of linhas) {
      if (l.status_linha === "comprada") {
        if (["produto", "servico"].includes(l.tipo_linha) && !(l.quantidade_real > 0))
          return `Linha "${l._descricao_exibicao}": quantidade deve ser > 0`;
        if (!(l.valor_unitario_real > 0))
          return `Linha "${l._descricao_exibicao}": valor unitário deve ser > 0`;
      }
      if (
        l.tipo_linha === "produto" &&
        !l.pedido_item_id &&
        !l.substitui_pedido_item_id &&
        !l.descricao_livre?.trim()
      ) {
        return "Item novo precisa de descrição";
      if (l.tipo_linha === "desconto" && !l.descricao_livre?.trim()) {
        return "Linha de desconto precisa de motivo (descrição)";
      }
    }
    }

    const itensPendentes = pedido.pedidos_compra_itens.filter((i) => i.status === "pendente");
    const cobertos = new Set<string>();
    for (const l of linhas) {
      if (l.pedido_item_id) cobertos.add(l.pedido_item_id);
      if (l.substitui_pedido_item_id) cobertos.add(l.substitui_pedido_item_id);
    }
    const semDecisao = itensPendentes.filter((i) => !cobertos.has(i.id));
    if (semDecisao.length > 0) {
      return `${semDecisao.length} item(ns) do pedido sem decisão. Marque comprado, não veio ou substituído.`;
    }

    return null;
  };

  const handleSubmit = async (statusAlvo: StatusAlvo, abrirNova: boolean) => {
    if (!pedido) return;
    const err = validar(statusAlvo);
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(abrirNova ? "finalizada-nova" : statusAlvo);
    try {
      const payloadLinhas = linhas.map((l) => ({
        tipo_linha: l.tipo_linha,
        status_linha: l.status_linha,
        pedido_item_id: l.pedido_item_id,
        substitui_pedido_item_id: l.substitui_pedido_item_id,
        descricao_livre: l.descricao_livre,
        quantidade_real: l.quantidade_real,
        valor_unitario_real: l.valor_unitario_real,
      }));

      const res = await registrar.mutateAsync({
        pedido_id: pedido.id,
        status_alvo: statusAlvo,
        linhas: payloadLinhas,
        parceiro_id: parceiroId,
        meio_pagamento_id: meioPagamentoId,
        data_compra: format(dataCompra, "yyyy-MM-dd"),
        parcelas_count: Math.floor(parcelasCount),
        primeira_parcela_data: format(primeiraParcelaData, "yyyy-MM-dd"),
        intervalo_dias: Math.floor(intervaloDias),
        periodicidade,
        plano_contas_id: contaId || null,
        observacao: observacao || null,
        compra_id: compraIdAtual,
        parceiro_id_pedido_original: parceiroDiferente
          ? pedido.parceiro_preferencial_id
          : null,
      });

      // Anexos pendentes
      for (const a of pendentes) {
        try {
          await uploadAnexo({ file: a.file, tipo: a.tipo, compra_id: res.compra_id });
        } catch (e) {
          toast.error(`Falha ao enviar ${a.file.name}: ${(e as Error).message}`);
        }
      }

      // Já paguei → só se finalizada
      if (jaPago && statusAlvo === "finalizada" && res.compra_id) {
        try {
          const { data: marcarRes, error: marcarErr } = await (supabase as any).rpc(
            "marcar_compra_como_realizada",
            {
              p_compra_id: res.compra_id,
              p_observacao: "Marcado como 'já paguei' no registro da compra",
            },
          );
          if (marcarErr || !marcarRes?.ok) {
            toast.warning(
              `Compra registrada, mas falhou marcar como realizada: ${marcarRes?.erro || marcarErr?.message || "erro desconhecido"}`,
            );
          } else {
            toast.success(
              `${marcarRes.cprs_atualizadas} parcela(s) marcada(s) como realizadas (pagamento já efetuado)`,
            );
          }
        } catch (e) {
          toast.warning(
            `Compra registrada, mas falhou marcar como realizada: ${(e as Error).message}`,
          );
        }
      }

      if (statusAlvo === "rascunho") {
        onOpenChange(false);
      } else if (abrirNova && onFinalizadoENova) {
        onFinalizadoENova(pedido.id);
      } else {
        onOpenChange(false);
      }
    } catch {
      // toast já mostrado pelo hook
    } finally {
      setSubmitting(null);
    }
  };

  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {compraIdAtual ? "Continuar rascunho" : "Registrar compra"}
          </DialogTitle>
          <DialogDescription>
            Pedido: {pedido.descricao_geral || "(sem descrição)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fornecedor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fornecedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Popover open={parceiroOpen} onOpenChange={setParceiroOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "flex-1 justify-between font-normal",
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
                      <CommandInput placeholder="Buscar..." />
                      <CommandList className="max-h-[320px]">
                        <CommandGroup>
                          <CommandItem
                            value="__novo__"
                            onSelect={() => {
                              setParceiroOpen(false);
                              setNovoFornecedorOpen(true);
                            }}
                            className="border-b text-primary"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            <span className="font-medium">Cadastrar novo fornecedor…</span>
                          </CommandItem>
                        </CommandGroup>
                        <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
                        <CommandGroup>
                          {parceiros.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.razao_social} ${p.nome_fantasia || ""} ${p.cnpj || ""}`}
                              onSelect={() => handleSelectParceiro(p.id)}
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
              {parceiroDiferente && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Diferente do parceiro indicado no pedido ({parceiroPreferencialNome}). Audit
                    registrado.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Detalhes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detalhes da compra</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data da compra *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal">
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
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Categoria contábil</Label>
                <CategoriaFolhaSelect value={contaId || null} onChange={setContaId} tipo="despesa" />
              </div>
            </CardContent>
          </Card>

          {/* Linhas */}
          <LinhasCompraEditor
            linhas={linhas}
            onChange={setLinhas}
            pedidoItens={pedido.pedidos_compra_itens}
          />

          {/* Pagamento */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/30 p-3 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total da compra</span>
                <span className="text-2xl font-bold">{fmtBRL(valorTotalCalculado)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Meio de pagamento *</Label>
                  <Select value={meioPagamentoId} onValueChange={setMeioPagamentoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formas.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Periodicidade</Label>
                  <Select
                    value={periodicidade}
                    onValueChange={(v) => setPeriodicidade(v as "dias" | "meses")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meses">Meses</SelectItem>
                      <SelectItem value="dias">Dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Intervalo</Label>
                  <Input
                    type="number"
                    min="1"
                    value={intervaloDias}
                    onChange={(e) => setIntervaloDias(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Primeira parcela</Label>
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
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Card className="bg-muted/30">
                <CardContent className="p-3">
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
                </CardContent>
              </Card>

              <label className="flex items-start gap-2 cursor-pointer p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={jaPago}
                  onCheckedChange={(checked) => setJaPago(checked === true)}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-medium">Já paguei (pagamento fora do sistema)</div>
                  <div className="text-xs text-muted-foreground">
                    Marca as parcelas como Realizada direto. Aplicado apenas ao finalizar.
                  </div>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* Observação + Anexos */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label>Observação (opcional)</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Notas internas sobre a compra"
                />
              </div>
              <AnexosCompraList mode="pendente" pendentes={pendentes} onChange={setPendentes} />
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!!submitting}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSubmit("rascunho", false)}
            disabled={!!submitting}
          >
            {submitting === "rascunho" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Salvar rascunho
          </Button>
          <Button
            onClick={() => handleSubmit("finalizada", false)}
            disabled={!!submitting}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {submitting === "finalizada" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Finalizar compra
          </Button>
          <Button
            onClick={() => handleSubmit("finalizada", true)}
            disabled={!!submitting}
            style={{ backgroundColor: "#1A4A3A", color: "white" }}
          >
            {submitting === "finalizada-nova" ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Finalizar e nova
          </Button>
        </DialogFooter>
      </DialogContent>
      <NovoFornecedorRapidoDialog
        open={novoFornecedorOpen}
        onOpenChange={setNovoFornecedorOpen}
        onCriado={(id) => handleSelectParceiro(id)}
      />
    </Dialog>
  );
}
