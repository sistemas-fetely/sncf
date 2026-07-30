import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Link2, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface Modalidade {
  codigo: string;
  rotulo: string;
  exige_dados_importacao: boolean;
}
interface StatusRow {
  id: number;
  codigo: string;
  descricao: string | null;
  ordem: number;
  exige_nf: boolean | null;
}
interface Centro {
  id: string;
  codigo: string;
  nome: string;
}
interface Fabrica {
  id: number;
  codigo: string;
  nome: string | null;
}
interface Parceiro {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
}

interface PedidoListaRow {
  id: number;
  numero_pedido: string;
  rocabella_ref: string | null;
  modalidade: string | null;
  moeda: string | null;
  data_pedido: string | null;
  etd: string | null;
  eta: string | null;
  fornecedor: string | null;
  centro: string | null;
  status: string | null;
  linhas: number | null;
  kits: number | null;
  custo_total: number | null;
  fase_xpm: number | null;
}

interface ResolucaoRow {
  codigo: string;
  status: "ok" | "nao_mapeado" | "mapeado_inativo" | "qtd_invalida" | "ambiguo";
  tipo: "produto" | "servico" | "ignorar" | null;
  sku: string | null;
  produto: string | null;
  qtd: number;
  preco: number;
  sku_destino_servico: string | null;
}
interface CustoPorSku {
  sku: string;
  qtd: number;
  custo_unitario: number;
  custo_total: number;
}
interface ConferenciaResult {
  pedido_ja_existe: boolean;
  linhas_produto: number;
  linhas_servico: number;
  linhas_com_problema: number;
  skus_resultantes: number;
  custo_total: number;
  resolucao: ResolucaoRow[];
  custo_por_sku: CustoPorSku[];
}

interface HeaderForm {
  numero_pedido: string;
  modalidade: string;
  moeda: string;
  fornecedor_id: string;
  centro_id: string;
  status_id: string;
  fabrica_id: string;
  referencia_fornecedor: string;
  data_pedido: string;
  prazo_entrega_acordado: string;
  condicao_pagamento: string;
  observacao: string;
  etd: string;
  eta: string;
  total_conteineres: string;
  cbm_total: string;
}

const EMPTY_HEADER: HeaderForm = {
  numero_pedido: "",
  modalidade: "",
  moeda: "",
  fornecedor_id: "",
  centro_id: "",
  status_id: "",
  fabrica_id: "",
  referencia_fornecedor: "",
  data_pedido: "",
  prazo_entrega_acordado: "",
  condicao_pagamento: "",
  observacao: "",
  etd: "",
  eta: "",
  total_conteineres: "",
  cbm_total: "",
};

const fmtBRL = (v: number, moeda = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(v || 0);

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy") : "—";

const STATUS_ROTULO: Record<string, string> = {
  ok: "OK",
  nao_mapeado: "Não mapeado",
  mapeado_inativo: "Mapeado inativo",
  qtd_invalida: "Quantidade inválida",
  ambiguo: "Ambíguo — código aponta pra vários SKUs",
};

// ============================================================================
// Parser das linhas coladas
// ============================================================================

function parsearNumero(s: string): number {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) ? NaN : n;
}

interface LinhaParsed {
  codigo: string;
  qtd: number;
  preco: number;
  _erro?: string;
}

function parsearLinhas(texto: string): LinhaParsed[] {
  const linhas = texto.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  return linhas.map((l) => {
    // Aceita TAB ou ponto-e-vírgula. NUNCA vírgula.
    const partes = l.split(/[\t;]/).map((p) => p.trim()).filter(Boolean);
    if (partes.length < 3) {
      return { codigo: l, qtd: NaN, preco: NaN, _erro: "esperado: codigo TAB qtd TAB preco" };
    }
    const [codigo, qtdRaw, precoRaw] = partes;
    const qtd = parsearNumero(qtdRaw);
    const preco = parsearNumero(precoRaw);
    return { codigo, qtd, preco };
  });
}

// ============================================================================
// Combobox de fornecedor
// ============================================================================

function FornecedorCombobox({
  parceiros,
  value,
  onChange,
}: {
  parceiros: Parceiro[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const sel = parceiros.find((p) => p.id === value);
  const label = sel ? sel.nome_fantasia || sel.razao_social || "—" : "Selecione o fornecedor";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", !sel && "text-muted-foreground")}
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar fornecedor..." />
          <CommandList>
            <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
            <CommandGroup>
              {parceiros.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.nome_fantasia ?? ""} ${p.razao_social ?? ""}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span>{p.nome_fantasia || p.razao_social}</span>
                    {p.nome_fantasia && p.razao_social && (
                      <span className="text-xs text-muted-foreground">{p.razao_social}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Página
// ============================================================================

export default function CadastroPedidoCompra() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ---------------- Dimensões ----------------
  const modalidadesQ = useQuery({
    queryKey: ["dim-compra-modalidade"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("compra_modalidade")
        .select("codigo, rotulo, exige_dados_importacao")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as Modalidade[];
    },
  });

  const statusQ = useQuery({
    queryKey: ["dim-importacao-status"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_status")
        .select("id, codigo, descricao, ordem, exige_nf")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as StatusRow[];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["dim-centro-distribuicao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("id, codigo, nome")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as Centro[];
    },
  });

  const fabricasQ = useQuery({
    queryKey: ["dim-importacao-fabrica"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("importacao_fabrica")
        .select("id, codigo, nome")
        .order("codigo");
      if (error) throw error;
      return (data ?? []) as Fabrica[];
    },
  });

  const parceirosQ = useQuery({
    queryKey: ["parceiros-comerciais-lista-lite"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, nome_fantasia, razao_social")
        .order("nome_fantasia");
      if (error) throw error;
      return (data ?? []) as Parceiro[];
    },
  });

  // ---------------- Lista de pedidos existentes ----------------
  const pedidosQ = useQuery({
    queryKey: ["importacao-pedido-lista"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_pedido_detalhe")
        .select(
          "id, numero_pedido, rocabella_ref, modalidade, moeda, data_pedido, etd, eta, fornecedor, centro, status, linhas, kits, custo_total, fase_xpm",
        );
      if (error) throw error;
      return (data ?? []) as PedidoListaRow[];
    },
  });




  // ---------------- Estado do formulário ----------------
  const [header, setHeader] = useState<HeaderForm>(EMPTY_HEADER);
  const [textoLinhas, setTextoLinhas] = useState("");
  const [conferencia, setConferencia] = useState<ConferenciaResult | null>(null);
  const [destinoServico, setDestinoServico] = useState<Record<string, string>>({}); // codigo -> sku destino

  const modalidadeSel = modalidadesQ.data?.find((m) => m.codigo === header.modalidade);
  const exigeImport = modalidadeSel?.exige_dados_importacao ?? false;

  const statusSel = statusQ.data?.find((s) => String(s.id) === header.status_id);

  // Default de status quando lista carrega
  const statusDefault = useMemo(
    () => statusQ.data?.find((s) => s.ordem === 0),
    [statusQ.data],
  );
  if (statusDefault && !header.status_id) {
    // define uma vez
    setHeader((h) => (h.status_id ? h : { ...h, status_id: String(statusDefault.id) }));
  }

  const setModalidade = (codigo: string) => {
    const m = modalidadesQ.data?.find((x) => x.codigo === codigo);
    const moedaDefault = m?.exige_dados_importacao ? "USD" : "BRL";
    setHeader((h) => ({
      ...h,
      modalidade: codigo,
      moeda: h.moeda || moedaDefault,
    }));
  };

  // SKUs de produto disponíveis (para dropdown de destino de serviço)
  const skusProduto = useMemo(() => {
    if (!conferencia) return [] as { sku: string; produto: string | null }[];
    const map = new Map<string, string | null>();
    for (const r of conferencia.resolucao) {
      if (r.tipo === "produto" && r.sku) map.set(r.sku, r.produto);
    }
    return Array.from(map.entries()).map(([sku, produto]) => ({ sku, produto }));
  }, [conferencia]);

  // ---------------- Mutations ----------------

  const conferirMut = useMutation({
    mutationFn: async () => {
      const linhasParsed = parsearLinhas(textoLinhas);
      if (linhasParsed.length === 0) throw new Error("Cole ao menos uma linha.");
      const invalidas = linhasParsed.filter((l) => l._erro);
      if (invalidas.length > 0) {
        throw new Error(
          `${invalidas.length} linha(s) mal formatada(s). Use TAB ou ponto-e-vírgula entre código, quantidade e preço.`,
        );
      }
      const p_linhas = linhasParsed.map((l) => ({
        codigo: l.codigo,
        qtd: l.qtd,
        preco: l.preco,
        ...(destinoServico[l.codigo] ? { sku_destino_servico: destinoServico[l.codigo] } : {}),
      }));
      const p_header = montarHeaderPayload(header);
      const { data, error } = await (supabase as any).rpc("criar_pedido_compra", {
        p_header,
        p_linhas,
        p_confirmar: false,
      });
      if (error) throw error;
      return data as ConferenciaResult;
    },
    onSuccess: (data) => {
      setConferencia(data);
      if (data.pedido_ja_existe) {
        toast.error(`O número de pedido "${header.numero_pedido}" já existe.`);
      } else if (data.linhas_com_problema > 0) {
        toast.warning(`${data.linhas_com_problema} linha(s) com problema. Ajuste antes de gravar.`);
      } else {
        toast.success("Conferência OK. Pronto para gravar.");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Falha na conferência"),
  });

  const gravarMut = useMutation({
    mutationFn: async () => {
      const linhasParsed = parsearLinhas(textoLinhas);
      const p_linhas = linhasParsed.map((l) => ({
        codigo: l.codigo,
        qtd: l.qtd,
        preco: l.preco,
        ...(destinoServico[l.codigo] ? { sku_destino_servico: destinoServico[l.codigo] } : {}),
      }));
      const p_header = montarHeaderPayload(header);
      const { data, error } = await (supabase as any).rpc("criar_pedido_compra", {
        p_header,
        p_linhas,
        p_confirmar: true,
      });
      if (error) throw error;
      return data as { pedido_id: number; numero_pedido: string; linhas_gravadas: number; custo_total: number };
    },
    onSuccess: (data) => {
      toast.success(`Pedido ${data.numero_pedido} gravado (${data.linhas_gravadas} linha(s)).`);
      qc.invalidateQueries({ queryKey: ["importacao-pedido-lista"] });
      setHeader(EMPTY_HEADER);
      setTextoLinhas("");
      setConferencia(null);
      setDestinoServico({});
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao gravar pedido"),
  });

  const podeGravar =
    !!conferencia &&
    !conferencia.pedido_ja_existe &&
    conferencia.linhas_com_problema === 0;

  const headerValido =
    header.numero_pedido.trim().length > 0 &&
    header.modalidade.length > 0 &&
    header.fornecedor_id.length > 0;

  const pedidosOrdenados = useMemo(() => {
    const lista = [...(pedidosQ.data ?? [])];
    lista.sort((a, b) => {
      if (!a.data_pedido && !b.data_pedido) return 0;
      if (!a.data_pedido) return 1;
      if (!b.data_pedido) return -1;
      return b.data_pedido.localeCompare(a.data_pedido);
    });
    return lista;
  }, [pedidosQ.data]);

  // ============================ RENDER ============================
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            to="/compras"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para Compras
          </Link>
          <h1 className="text-2xl font-semibold">Cadastro de pedido de compra</h1>
          <p className="text-sm text-muted-foreground">
            Registra pedidos de importação e compra nacional. Códigos vêm do fornecedor e são
            resolvidos pelo de-para. Sempre confira antes de gravar.
          </p>
        </div>
      </div>

      {/* ============================ LISTA ============================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {pedidosQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : pedidosQ.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
              <div className="text-sm font-medium text-destructive">
                Falha ao carregar os pedidos existentes.
              </div>
              <div className="text-xs text-destructive/90 break-words">
                {formatError(pedidosQ.error)}
              </div>
              <Button size="sm" variant="outline" onClick={() => pedidosQ.refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : pedidosOrdenados.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum pedido cadastrado.</div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead>Modalidade</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Centro</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>ETD</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Custo total</TableHead>
                    <TableHead>Fase XPM</TableHead>
                    <TableHead className="w-10" />

                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidosOrdenados.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/compras/mercadoria/${p.id}`)}
                    >
                      <TableCell className="font-medium">{p.numero_pedido}</TableCell>
                      <TableCell>{p.rocabella_ref ?? "—"}</TableCell>
                      <TableCell>{p.modalidade ?? "—"}</TableCell>
                      <TableCell>{p.fornecedor ?? "—"}</TableCell>
                      <TableCell>{p.centro ?? "—"}</TableCell>
                      <TableCell>{p.status ?? "—"}</TableCell>
                      <TableCell>{fmtDate(p.data_pedido)}</TableCell>
                      <TableCell>{fmtDate(p.etd)}</TableCell>
                      <TableCell>{fmtDate(p.eta)}</TableCell>
                      <TableCell className="text-right">{p.linhas ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {fmtBRL(Number(p.custo_total ?? 0), p.moeda ?? "BRL")}
                      </TableCell>
                      <TableCell>
                        {p.fase_xpm === 2 ? (
                          <Badge variant="secondary">Fase 2 · com NF</Badge>
                        ) : p.fase_xpm === 1 ? (
                          <Badge variant="outline">Fase 1 · sem NF</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Editar pedido"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditarId(p.id);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>

                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

          )}

        </CardContent>
      </Card>

      {/* ============================ FORMULÁRIO ============================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo pedido de mercadoria</CardTitle>
          <p className="text-xs text-muted-foreground">
            Para mercadoria de revenda. Insumo e serviço vão em{" "}
            <Link to="/compras" className="underline underline-offset-2">
              Compras
            </Link>
            .
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Número do pedido *</Label>
              <Input
                value={header.numero_pedido}
                onChange={(e) => setHeader({ ...header, numero_pedido: e.target.value })}
                placeholder="ex: MIRA-2026-0001"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Modalidade *</Label>
              <Select value={header.modalidade} onValueChange={setModalidade}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {modalidadesQ.data?.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Moeda</Label>
              <Input
                value={header.moeda}
                onChange={(e) => setHeader({ ...header, moeda: e.target.value.toUpperCase() })}
                placeholder="BRL / USD"
                maxLength={5}
              />
              <p className="text-xs text-muted-foreground">
                Derivada da modalidade — editável.
              </p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Fornecedor *</Label>
              <FornecedorCombobox
                parceiros={parceirosQ.data ?? []}
                value={header.fornecedor_id}
                onChange={(id) => setHeader({ ...header, fornecedor_id: id })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Centro de destino</Label>
              <Select
                value={header.centro_id}
                onValueChange={(v) => setHeader({ ...header, centro_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {centrosQ.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={header.status_id}
                onValueChange={(v) => setHeader({ ...header, status_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {statusQ.data?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {statusSel?.descricao && (
                <p className="text-xs text-muted-foreground">{statusSel.descricao}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Referência do fornecedor</Label>
              <Input
                value={header.referencia_fornecedor}
                onChange={(e) =>
                  setHeader({ ...header, referencia_fornecedor: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Data do pedido</Label>
              <Input
                type="date"
                value={header.data_pedido}
                onChange={(e) => setHeader({ ...header, data_pedido: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Prazo de entrega acordado</Label>
              <Input
                type="date"
                value={header.prazo_entrega_acordado}
                onChange={(e) =>
                  setHeader({ ...header, prazo_entrega_acordado: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label>Condição de pagamento</Label>
              <Input
                value={header.condicao_pagamento}
                onChange={(e) => setHeader({ ...header, condicao_pagamento: e.target.value })}
                placeholder="ex: 30/60/90 · T/T à vista contra BL"
              />
            </div>

            <div className="space-y-1.5 md:col-span-3">
              <Label>Observação</Label>
              <Textarea
                value={header.observacao}
                onChange={(e) => setHeader({ ...header, observacao: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          {/* Bloco importação */}
          {exigeImport && (
            <div className="rounded-md border border-dashed p-4 space-y-3 bg-muted/20">
              <div className="text-sm font-medium">Dados de importação</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label>Fábrica</Label>
                  <Select
                    value={header.fabrica_id}
                    onValueChange={(v) => setHeader({ ...header, fabrica_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricasQ.data?.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.codigo}
                          {f.nome ? ` — ${f.nome}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ETD</Label>
                  <Input
                    type="date"
                    value={header.etd}
                    onChange={(e) => setHeader({ ...header, etd: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>ETA</Label>
                  <Input
                    type="date"
                    value={header.eta}
                    onChange={(e) => setHeader({ ...header, eta: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Total contêineres</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={header.total_conteineres}
                    onChange={(e) =>
                      setHeader({ ...header, total_conteineres: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CBM total</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={header.cbm_total}
                    onChange={(e) => setHeader({ ...header, cbm_total: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Linhas */}
          <div className="space-y-2">
            <Label>Linhas do pedido</Label>
            <p className="text-xs text-muted-foreground">
              Cole no formato <code>código</code> <code>quantidade</code> <code>preço</code>, um
              por linha. Separadores aceitos: <b>TAB</b> e <b>ponto-e-vírgula</b>. Vírgula é
              tratada como decimal — não use vírgula como separador de coluna.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void baixarTemplate()}
              >
                <Download className="h-4 w-4 mr-1" /> Baixar template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Importar planilha
              </Button>
            </div>

            <Textarea
              value={textoLinhas}
              onChange={(e) => {
                setTextoLinhas(e.target.value);
                setConferencia(null);
              }}
              rows={8}
              className="font-mono text-xs"
              placeholder={"4329372\t12\t4,50\n4329373;30;7.20"}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!headerValido || conferirMut.isPending || !textoLinhas.trim()}
                onClick={() => conferirMut.mutate()}
              >
                {conferirMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Conferir
              </Button>
              {conferencia && (
                <Button
                  type="button"
                  disabled={!podeGravar || gravarMut.isPending}
                  onClick={() => gravarMut.mutate()}
                  style={{ backgroundColor: "#1A4A3A", color: "white" }}
                >
                  {gravarMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Gravar pedido
                </Button>
              )}
            </div>
          </div>

          {/* Resultado da conferência */}
          {conferencia && (
            <ResultadoConferencia
              result={conferencia}
              moeda={header.moeda || "BRL"}
              fornecedorId={header.fornecedor_id}
              skusProduto={skusProduto}
              destinoServico={destinoServico}
              onChangeDestino={(codigo, sku) => {
                setDestinoServico((cur) => ({ ...cur, [codigo]: sku }));
                // recomputa: reconferir para atualizar custo_por_sku
                setTimeout(() => conferirMut.mutate(), 0);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function montarHeaderPayload(h: HeaderForm): Record<string, unknown> {
  const out: Record<string, unknown> = {
    numero_pedido: h.numero_pedido.trim(),
    modalidade: h.modalidade,
    fornecedor_id: h.fornecedor_id,
  };
  if (h.moeda) out.moeda = h.moeda;
  if (h.centro_id) out.centro_id = h.centro_id;
  if (h.status_id) out.status_id = Number(h.status_id);
  if (h.fabrica_id) out.fabrica_id = Number(h.fabrica_id);
  if (h.referencia_fornecedor) out.referencia_fornecedor = h.referencia_fornecedor;
  if (h.data_pedido) out.data_pedido = h.data_pedido;
  if (h.prazo_entrega_acordado) out.prazo_entrega_acordado = h.prazo_entrega_acordado;
  if (h.condicao_pagamento) out.condicao_pagamento = h.condicao_pagamento;
  if (h.observacao) out.observacao = h.observacao;
  if (h.etd) out.etd = h.etd;
  if (h.eta) out.eta = h.eta;
  if (h.total_conteineres) out.total_conteineres = Number(h.total_conteineres);
  if (h.cbm_total) out.cbm_total = Number(h.cbm_total);
  return out;
}

// ============================================================================
// Resultado da conferência
// ============================================================================

function ResultadoConferencia({
  result,
  moeda,
  fornecedorId,
  skusProduto,
  destinoServico,
  onChangeDestino,
}: {
  result: ConferenciaResult;
  moeda: string;
  fornecedorId: string;
  skusProduto: { sku: string; produto: string | null }[];
  destinoServico: Record<string, string>;
  onChangeDestino: (codigo: string, sku: string) => void;
}) {
  const linhasOrdenadas = useMemo(() => {
    const rank = (r: ResolucaoRow) => (r.status === "ok" ? 1 : 0);
    return [...result.resolucao].sort((a, b) => rank(a) - rank(b));
  }, [result.resolucao]);

  const temNaoMapeado = result.resolucao.some((r) => r.status === "nao_mapeado");

  return (
    <div className="space-y-4">
      {/* Alertas de topo */}
      {result.pedido_ja_existe && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <div>
            Já existe pedido com esse número. Escolha outro para gravar.
          </div>
        </div>
      )}

      {/* Contadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="Linhas produto" value={String(result.linhas_produto)} />
        <MiniStat label="Linhas serviço" value={String(result.linhas_servico)} />
        <MiniStat
          label="Problemas"
          value={String(result.linhas_com_problema)}
          tone={result.linhas_com_problema > 0 ? "danger" : "ok"}
        />
        <MiniStat label="SKUs resultantes" value={String(result.skus_resultantes)} />
        <MiniStat label="Custo total" value={fmtBRL(result.custo_total, moeda)} />
      </div>

      {/* Resolução */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Resolução das linhas</div>
          {temNaoMapeado && (
            <Link
              to={`/compras/de-para-fornecedor${fornecedorId ? `?fornecedor=${fornecedorId}` : ""}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Link2 className="h-3 w-3" /> Abrir de-para de fornecedor
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Destino (serviço)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhasOrdenadas.map((r, idx) => {
                const problema = r.status !== "ok";
                return (
                  <TableRow
                    key={`${r.codigo}-${idx}`}
                    className={cn(problema && "bg-destructive/10")}
                  >
                    <TableCell>
                      {problema ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                    <TableCell>
                      <Badge variant={problema ? "destructive" : "secondary"}>
                        {STATUS_ROTULO[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.tipo ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.produto ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.preco, moeda)}</TableCell>
                    <TableCell>
                      {r.tipo === "servico" ? (
                        <Select
                          value={destinoServico[r.codigo] ?? r.sku_destino_servico ?? ""}
                          onValueChange={(v) => onChangeDestino(r.codigo, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Escolher SKU..." />
                          </SelectTrigger>
                          <SelectContent>
                            {skusProduto.length === 0 && (
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                Nenhum SKU de produto disponível
                              </div>
                            )}
                            {skusProduto.map((s) => (
                              <SelectItem key={s.sku} value={s.sku}>
                                <span className="font-mono text-xs">{s.sku}</span>
                                {s.produto ? ` — ${s.produto}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {result.linhas_servico > 0 && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            Custo de serviço entra no custo do produto escolhido, não vira item de estoque.
          </p>
        )}
      </div>

      {/* Custo por SKU */}
      {result.custo_por_sku.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Custo por SKU</div>
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Custo unitário</TableHead>
                  <TableHead className="text-right">Custo total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.custo_por_sku.map((r) => (
                  <TableRow key={r.sku}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-right">{r.qtd}</TableCell>
                    <TableCell className="text-right">
                      {fmtBRL(r.custo_unitario, moeda)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtBRL(r.custo_total, moeda)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "danger" && "border-destructive/40 bg-destructive/10",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
