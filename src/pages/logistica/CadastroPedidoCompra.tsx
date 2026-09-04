import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageShell } from "@/components/layout/PageShell";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Link2,
  ExternalLink,
  Pencil,
  Download,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { apelidoParceiro, nomeCanonico, nomeExibicao } from "@/lib/parceiros/nome";
import { formatError } from "@/lib/format-error";
import { invalidarCompras } from "@/lib/compras/invalidar";
import {
  gerarTemplatePedidoMercadoria,
  type CabecalhoPlanilha,
} from "@/lib/compras/templatePedidoMercadoria";
import ImportarLinhasMercadoriaDialog from "@/components/compras/ImportarLinhasMercadoriaDialog";
import EditarPedidoMercadoriaDialog from "@/components/compras/EditarPedidoMercadoriaDialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CardIndicador } from "@/components/ui/card-indicador";
import { TabelaFetely } from "@/components/ui/tabela-fetely";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


import { Selo } from "@/components/ui/selo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SELECT_PENDENCIAS,
  TIPOS_PENDENCIA,
  totalPendencia,
  type PendenciaPedido,
  type TipoPendencia,
} from "@/lib/compras/pendencias";
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
  prazo_entrega_acordado: string | null;
  etd: string | null;
  eta: string | null;
  fornecedor: string | null;
  apelido: string | null;
  centro: string | null;
  status: string | null;
  linhas: number | null;
  kits: number | null;
  custo_total: number | null;
  fase_xpm: number | null;
}

interface PreviaExclusao {
  pedido_id: number;
  numero_pedido: string | null;
  pode_excluir: boolean;
  bloqueios: string[] | null;
  linhas_que_serao_apagadas: number | null;
  excluido: boolean | null;
}

interface SaldoPedidoLinha {
  pedido_id: number;
  fase_calculada: string | null;
  divergencia_status: string | null;
  data_prevista: string | null;
  data_realizada: string | null;
  dias_atraso: number | null;
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

/** Atraso vem pronto de vw_importacao_saldo_pedido — nada é calculado aqui. */
function rotuloAtraso(diasAtraso?: number | null) {
  if (diasAtraso == null) return <span className="text-muted-foreground">—</span>;
  const dias = Number(diasAtraso);
  if (dias <= 0) return <span className="text-muted-foreground">0</span>;
  return <Selo estado="warning">{dias} {dias === 1 ? "dia" : "dias"}</Selo>;
}

const ROTULO_FASE_CALCULADA: Record<string, string> = {
  sem_nf: "Sem NF",
  nf_parcial: "NF parcial",
  fatia_conferida: "Fatia conferida",
  faturado_nao_conferido: "Faturado, não conferido",
  conferido_parcial: "Conferido parcial",
  conferido_total: "Conferido",
};

function rotuloFaseCalculada(v: string | null | undefined): string {
  if (!v) return "—";
  return ROTULO_FASE_CALCULADA[v] ?? v;
}

/** Saldos de três camadas por pedido (view pronta — nada é calculado aqui). */
interface TresCamadasPedidoLinha {
  pedido_id: number;
  a_faturar: number | null;
  a_confirmar: number | null;
}

/** dd/mm/aaaa ou aaaa-mm-dd vindos da planilha viram aaaa-mm-dd para o input date. */
function normalizarDataPlanilha(v: string): string {
  const t = v.trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

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
    // Aceita TAB, ponto-e-vírgula ou dois-ou-mais espaços. NUNCA vírgula, NUNCA um espaço só.
    const partes = l.split(/[\t;]|[ ]{2,}/).map((p) => p.trim()).filter(Boolean);
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
  const label = sel
    ? nomeExibicao(sel.razao_social, sel.nome_fantasia)
    : "Selecione o fornecedor";
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
                    <span>{nomeCanonico(p.razao_social, p.nome_fantasia ?? "—")}</span>
                    {apelidoParceiro(p.razao_social, p.nome_fantasia) && (
                      <span className="text-xs text-muted-foreground">
                        {apelidoParceiro(p.razao_social, p.nome_fantasia)}
                      </span>
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

export type VistaCompras = "acompanhamento" | "novo";

export default function CadastroPedidoCompra({ vista = "acompanhamento" }: { vista?: VistaCompras }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();

  const irParaPendencia = (tipo: TipoPendencia, pedidoId: number) => {
    const next = new URLSearchParams();
    next.set("aba", "pendencias");
    next.set("tipo", tipo);
    next.set("pedido", String(pedidoId));
    setParams(next, { replace: false });
  };

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
          "id, numero_pedido, rocabella_ref, modalidade, moeda, data_pedido, prazo_entrega_acordado, etd, eta, fornecedor, apelido, centro, status, linhas, kits, custo_total, fase_xpm",
        );
      if (error) throw error;
      return (data ?? []) as PedidoListaRow[];
    },
  });

  // Saldo por pedido (view pronta — nada e calculado aqui)
  const saldoQ = useQuery({
    queryKey: ["importacao-saldo-pedido-lista"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_importacao_saldo_pedido")
        .select(
          "pedido_id, fase_calculada, divergencia_status, data_prevista, data_realizada, dias_atraso",
        );
      if (error) throw error;
      return (data ?? []) as SaldoPedidoLinha[];
    },
  });

  const saldoPorPedido = useMemo(() => {
    const m = new Map<number, SaldoPedidoLinha>();
    (saldoQ.data ?? []).forEach((s) => m.set(Number(s.pedido_id), s));
    return m;
  }, [saldoQ.data]);

  // Três camadas por pedido: A faturar (fornecedor deve NF) e A confirmar (XPM deve conferência)
  const tresCamadasQ = useQuery({
    queryKey: ["compra-tres-camadas-pedido-lista"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_compra_tres_camadas_pedido")
        .select("pedido_id, a_faturar, a_confirmar");
      if (error) throw error;
      return (data ?? []) as TresCamadasPedidoLinha[];
    },
  });

  const tresCamadasPorPedido = useMemo(() => {
    const m = new Map<number, TresCamadasPedidoLinha>();
    (tresCamadasQ.data ?? []).forEach((s) => m.set(Number(s.pedido_id), s));
    return m;
  }, [tresCamadasQ.data]);

  // Pendências por pedido (view pronta — nada e calculado aqui)
  const pendenciasQ = useQuery({
    queryKey: ["compras-pendencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_compras_pendencias" as never)
        .select(SELECT_PENDENCIAS);
      if (error) throw error;
      return (data ?? []) as unknown as PendenciaPedido[];
    },
  });

  const pendenciaPorPedido = useMemo(() => {
    const m = new Map<number, PendenciaPedido>();
    (pendenciasQ.data ?? []).forEach((r) => m.set(Number(r.pedido_id), r));
    return m;
  }, [pendenciasQ.data]);

  // ---------------- Exclusão de pedido ----------------
  const [excluirAlvo, setExcluirAlvo] = useState<PedidoListaRow | null>(null);
  const [previaExclusao, setPreviaExclusao] = useState<PreviaExclusao | null>(null);
  const [checandoExclusao, setChecandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const abrirExclusao = async (p: PedidoListaRow) => {
    setExcluirAlvo(p);
    setPreviaExclusao(null);
    setChecandoExclusao(true);
    try {
      const { data, error } = await supabase.rpc("excluir_pedido_importacao", {
        p_pedido_id: p.id,
        p_confirmar: false,
      });
      if (error) throw error;
      const raw = Array.isArray(data) ? data[0] : data;
      setPreviaExclusao((raw as unknown as PreviaExclusao | null) ?? null);


    } catch (e) {
      toast.error(`Não foi possível checar a exclusão: ${formatError(e)}`);
      setExcluirAlvo(null);
    } finally {
      setChecandoExclusao(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluirAlvo) return;
    setExcluindo(true);
    try {
      const { data, error } = await supabase.rpc("excluir_pedido_importacao", {
        p_pedido_id: excluirAlvo.id,
        p_confirmar: true,
      });
      if (error) throw error;
      const linha = (Array.isArray(data) ? data[0] : data) as unknown as PreviaExclusao | null;


      if (linha && linha.excluido === false) {
        toast.error(
          linha.bloqueios?.length
            ? `Exclusão barrada: ${linha.bloqueios.join(" · ")}`
            : "O banco não confirmou a exclusão.",
        );
        setPreviaExclusao(linha);
        return;
      }
      toast.success(`Pedido ${excluirAlvo.numero_pedido} excluído.`);
      setExcluirAlvo(null);
      setPreviaExclusao(null);
      invalidarCompras(qc);
    } catch (e) {
      toast.error(`Falha ao excluir: ${formatError(e)}`);
    } finally {
      setExcluindo(false);
    }
  };





  // ---------------- Estado do formulário ----------------
  const [header, setHeader] = useState<HeaderForm>(EMPTY_HEADER);
  const [textoLinhas, setTextoLinhas] = useState("");
  const [conferencia, setConferencia] = useState<ConferenciaResult | null>(null);
  const [destinoServico, setDestinoServico] = useState<Record<string, string>>({}); // codigo -> sku destino
  const [importOpen, setImportOpen] = useState(false);
  const [editarId, setEditarId] = useState<number | null>(null);

  const baixarTemplate = async () => {
    try {
      await gerarTemplatePedidoMercadoria();
    } catch (e) {
      toast.error(`Falha ao gerar o template: ${formatError(e)}`);
    }
  };


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

  // Cabeçalho vindo da planilha: só preenche o que a planilha trouxe.
  const aplicarCabecalhoPlanilha = (cab: CabecalhoPlanilha) => {
    const norm = (v: string) =>
      v
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const modalidade = cab.modalidade
      ? modalidadesQ.data?.find(
          (m) => norm(m.codigo) === norm(cab.modalidade!) || norm(m.rotulo) === norm(cab.modalidade!),
        )
      : undefined;
    const fornecedor = cab.fornecedor
      ? parceirosQ.data?.find(
          (x) =>
            norm(x.nome_fantasia ?? "") === norm(cab.fornecedor!) ||
            norm(x.razao_social ?? "") === norm(cab.fornecedor!),
        )
      : undefined;
    const centro = cab.centro_destino
      ? centrosQ.data?.find(
          (c) => norm(c.codigo) === norm(cab.centro_destino!) || norm(c.nome) === norm(cab.centro_destino!),
        )
      : undefined;
    const status = cab.status
      ? statusQ.data?.find((st) => norm(st.codigo) === norm(cab.status!))
      : undefined;

    const naoResolvidos: string[] = [];
    if (cab.modalidade && !modalidade) naoResolvidos.push(`modalidade "${cab.modalidade}"`);
    if (cab.fornecedor && !fornecedor) naoResolvidos.push(`fornecedor "${cab.fornecedor}"`);
    if (cab.centro_destino && !centro) naoResolvidos.push(`centro "${cab.centro_destino}"`);
    if (cab.status && !status) naoResolvidos.push(`status "${cab.status}"`);

    setHeader((h) => ({
      ...h,
      ...(cab.numero_pedido ? { numero_pedido: cab.numero_pedido } : {}),
      ...(modalidade ? { modalidade: modalidade.codigo } : {}),
      ...(cab.moeda ? { moeda: cab.moeda.toUpperCase() } : {}),
      ...(fornecedor ? { fornecedor_id: fornecedor.id } : {}),
      ...(centro ? { centro_id: centro.id } : {}),
      ...(status ? { status_id: String(status.id) } : {}),
      ...(cab.referencia_fornecedor
        ? { referencia_fornecedor: cab.referencia_fornecedor }
        : {}),
      ...(cab.data_pedido ? { data_pedido: normalizarDataPlanilha(cab.data_pedido) } : {}),
      ...(cab.prazo_entrega_acordado
        ? { prazo_entrega_acordado: normalizarDataPlanilha(cab.prazo_entrega_acordado) }
        : {}),
      ...(cab.condicao_pagamento ? { condicao_pagamento: cab.condicao_pagamento } : {}),
      ...(cab.observacao ? { observacao: cab.observacao } : {}),
    }));
    setConferencia(null);

    if (naoResolvidos.length > 0) {
      toast.warning(`Não reconheci: ${naoResolvidos.join(" · ")}. Preencha na mão.`);
    }
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
          `${invalidas.length} linha(s) mal formatada(s). Use TAB, ponto-e-vírgula ou dois espaços entre código, quantidade e preço.`,
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
      invalidarCompras(qc);
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
    <PageShell>



      {/* ============================ LISTA ============================ */}
      {vista === "acompanhamento" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos existentes</CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaFetely
            carregando={pedidosQ.isLoading}
            erro={pedidosQ.isError ? formatError(pedidosQ.error) : null}
            aoTentarNovamente={() => void pedidosQ.refetch()}
            vazio={{
              mensagem:
                "Nenhum pedido de mercadoria cadastrado. Comece pela aba “Novo pedido” — ou baixe o template e importe a planilha do fornecedor.",
              acao: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams();
                    next.set("aba", "novo");
                    setParams(next, { replace: false });
                  }}
                >
                  Abrir “Novo pedido”
                </Button>
              ),
            }}
            total={pedidosOrdenados.length}
            exibidos={pedidosOrdenados.length}
            rotulo="pedidos"
          >
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
                    <TableHead>Previsto</TableHead>
                    <TableHead>Realizado</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Custo FOB</TableHead>
                    <TableHead>Fase XPM</TableHead>
                    <TableHead>Andamento</TableHead>
                    <TableHead className="text-right">A faturar</TableHead>
                    <TableHead className="text-right">A confirmar</TableHead>
                    <TableHead className="text-right">Atraso</TableHead>
                    <TableHead className="text-right">Pendências</TableHead>

                    <TableHead className="w-20" />

                  </TableRow>

                </TableHeader>
                <TableBody>
                  {pedidosOrdenados.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/logistica/chegada-mercadoria/${p.id}`)}
                    >
                      <TableCell className="font-medium">{p.numero_pedido}</TableCell>
                      <TableCell>{p.rocabella_ref ?? "—"}</TableCell>
                      <TableCell>{p.modalidade ?? "—"}</TableCell>
                      <TableCell>
                        <div>{p.fornecedor ?? "—"}</div>
                        {p.apelido && (
                          <div className="text-xs text-muted-foreground">{p.apelido}</div>
                        )}
                      </TableCell>
                      <TableCell>{p.centro ?? "—"}</TableCell>
                      <TableCell>{p.status ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{fmtDate(p.data_pedido)}</TableCell>
                      <TableCell className="tabular-nums">
                        {fmtDate(saldoPorPedido.get(Number(p.id))?.data_prevista)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtDate(saldoPorPedido.get(Number(p.id))?.data_realizada)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.linhas ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(Number(p.custo_total ?? 0), p.moeda ?? "BRL")}
                      </TableCell>
                      <TableCell>
                        {p.fase_xpm === 2 ? (
                          <Selo estado="info">Fase 2 · com NF</Selo>
                        ) : p.fase_xpm === 1 ? (
                          <Selo estado="muted">Fase 1 · sem NF</Selo>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {(() => {
                        const s = saldoPorPedido.get(Number(p.id));
                        const tc = tresCamadasPorPedido.get(Number(p.id));
                        const aFaturar = Number(tc?.a_faturar ?? 0);
                        const aConfirmar = Number(tc?.a_confirmar ?? 0);
                        const NUM_BR = new Intl.NumberFormat("pt-BR");
                        return (
                          <>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">
                                  {rotuloFaseCalculada(s?.fase_calculada)}
                                </span>
                                {s?.divergencia_status && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertTriangle
                                          className="h-4 w-4 shrink-0 text-warning"
                                          aria-label={s.divergencia_status}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>{s.divergencia_status}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={
                                aFaturar > 0
                                  ? "text-right tabular-nums text-warning"
                                  : "text-right tabular-nums text-muted-foreground"
                              }
                            >
                              {aFaturar > 0 ? NUM_BR.format(aFaturar) : "0"}
                            </TableCell>
                            <TableCell
                              className={
                                aConfirmar > 0
                                  ? "text-right tabular-nums text-warning"
                                  : "text-right tabular-nums text-muted-foreground"
                              }
                            >
                              {aConfirmar > 0 ? NUM_BR.format(aConfirmar) : "0"}
                            </TableCell>
                          </>
                        );
                      })()}

                      <TableCell className="text-right tabular-nums">
                        {rotuloAtraso(saldoPorPedido.get(Number(p.id))?.dias_atraso)}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {TIPOS_PENDENCIA.map((t) => {
                            const pend = pendenciaPorPedido.get(Number(p.id));
                            const n = pend ? totalPendencia(pend, t.tipo) : 0;
                            return (
                              <button
                                key={t.tipo}
                                type="button"
                                title={`${t.rotulo} — ${t.descricao}`}
                                aria-label={`${t.rotulo}: ${n} no pedido ${p.numero_pedido}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  irParaPendencia(t.tipo, p.id);
                                }}
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Selo estado={n > 0 ? "warning" : "muted"}>
                                  {t.rotuloCurto} {n}
                                </Selo>
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Editar pedido"
                            aria-label={`Editar pedido ${p.numero_pedido}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditarId(p.id);
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            title="Excluir pedido"
                            aria-label={`Excluir pedido ${p.numero_pedido}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void abrirExclusao(p);
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>

                    </TableRow>
                  ))}

                </TableBody>
              </Table>
              </div>
          </TabelaFetely>

        </CardContent>
      </Card>

      )}


      {/* ============================ FORMULÁRIO ============================ */}
      {vista === "novo" && (
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
              por linha. Separadores aceitos: <b>TAB</b>, <b>ponto-e-vírgula</b> e{" "}
              <b>dois ou mais espaços</b>. Um espaço só não separa, porque descrição tem espaço.
              Vírgula é tratada como decimal — não use vírgula como separador de coluna.
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
                variant="outline"
                disabled={!headerValido || conferirMut.isPending || !textoLinhas.trim()}
                onClick={() => conferirMut.mutate()}
              >
                {conferirMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                Conferir antes de gravar
              </Button>
            </div>
            {conferencia && (
              <div className="space-y-2">
                {podeGravar && (
                  <p className="text-sm text-warning">
                    A conferência passou, mas o pedido ainda não foi criado. Clique em Gravar
                    pedido.
                  </p>
                )}
                <Button
                  type="button"
                  disabled={!podeGravar || gravarMut.isPending}
                  onClick={() => gravarMut.mutate()}
                >
                  {gravarMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                  Gravar pedido
                </Button>
              </div>
            )}

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

      )}

      <ImportarLinhasMercadoriaDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        temTextoAtual={textoLinhas.trim().length > 0}
        onImportarCabecalho={(cab) => aplicarCabecalhoPlanilha(cab)}
        onImportar={(texto, modo) => {
          setTextoLinhas((cur) =>
            modo === "substituir" || !cur.trim() ? texto : `${cur.replace(/\s*$/, "")}\n${texto}`,
          );
          setConferencia(null);
        }}
      />

      <Dialog
        open={excluirAlvo !== null}
        onOpenChange={(v) => {
          if (!v && !excluindo) {
            setExcluirAlvo(null);
            setPreviaExclusao(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pedido {excluirAlvo?.numero_pedido}</DialogTitle>
            <DialogDescription>
              Nada foi apagado ainda. O banco checa primeiro se o pedido pode sair.
            </DialogDescription>
          </DialogHeader>

          {checandoExclusao ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checando o pedido...
            </div>
          ) : previaExclusao ? (
            previaExclusao.pode_excluir ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                {Number(previaExclusao.linhas_que_serao_apagadas ?? 0)} linha(s) serão apagadas
                junto com o pedido. Isso não volta atrás.
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <div>Este pedido não pode ser excluído:</div>
                <ul className="list-disc pl-5">
                  {(previaExclusao.bloqueios ?? []).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                  {(previaExclusao.bloqueios ?? []).length === 0 && (
                    <li>O banco recusou a exclusão sem detalhar o motivo.</li>
                  )}
                </ul>
              </div>
            )
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={excluindo}
              onClick={() => {
                setExcluirAlvo(null);
                setPreviaExclusao(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!previaExclusao?.pode_excluir || excluindo || checandoExclusao}
              onClick={() => void confirmarExclusao()}
            >
              {excluindo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditarPedidoMercadoriaDialog
        open={editarId != null}
        onOpenChange={(v) => !v && setEditarId(null)}
        pedidoId={editarId}
        onSaved={() => {
          invalidarCompras(qc);
        }}
      />
    </PageShell>

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
        <CardIndicador compacto rotulo="Linhas produto" valor={result.linhas_produto} />
        <CardIndicador compacto rotulo="Linhas serviço" valor={result.linhas_servico} />
        <CardIndicador
          compacto
          rotulo="Problemas"
          valor={result.linhas_com_problema}
          tom={result.linhas_com_problema > 0 ? "critico" : "neutro"}
        />
        <CardIndicador compacto rotulo="SKUs resultantes" valor={result.skus_resultantes} />
        <CardIndicador compacto rotulo="Custo total" valor={fmtBRL(result.custo_total, moeda)} />
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
              <Link2 className="h-3 w-3" aria-hidden="true" /> Abrir de-para de fornecedor
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
        <TabelaFetely
          total={linhasOrdenadas.length}
          exibidos={linhasOrdenadas.length}
          rotulo="linhas"
          vazio={{
            mensagem:
              "Nenhuma linha conferida. Cole as linhas do pedido e clique em “Conferir antes de gravar”.",
          }}
        >
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
                          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                      <TableCell>
                        <Selo estado={problema ? "destructive" : "success"}>
                          {STATUS_ROTULO[r.status] ?? r.status}
                        </Selo>
                      </TableCell>
                      <TableCell>{r.tipo ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.produto ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.qtd}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.preco, moeda)}
                      </TableCell>
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
        </TabelaFetely>
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
          <TabelaFetely
            total={result.custo_por_sku.length}
            exibidos={result.custo_por_sku.length}
            rotulo="SKUs"
            vazio={{
              mensagem:
                "Nenhum SKU resultante. Confira se as linhas coladas têm código, quantidade e preço.",
            }}
          >
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
                      <TableCell className="text-right tabular-nums">{r.qtd}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtBRL(r.custo_unitario, moeda)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtBRL(r.custo_total, moeda)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabelaFetely>
        </div>
      )}

    </div>
  );
}

