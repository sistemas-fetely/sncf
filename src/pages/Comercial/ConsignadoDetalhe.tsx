import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, AlertTriangle, Plus, Trash2, ExternalLink, HandCoins, Boxes, Undo2, Copy,
  ClipboardPaste, Search, Gavel, Download, Upload, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { estaVencido } from "@/lib/data";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useContaCorrenteCliente } from "./Consignados";
import { VisaoConsignado } from "./consignado/VisaoConsignado";

/**
 * MESA ÚNICA DO CONSIGNADO.
 * O modelo fiscal (`venda_com_acerto` | `consignacao_fiscal`) é atributo do
 * PARCEIRO, não bifurcação de processo: a mesa é uma só e os blocos que não se
 * aplicam somem por completo. O operador nunca escolhe documento — o banco decide.
 * Todo número vem de view ou de RPC; nada é calculado aqui.
 */

// ── contratos de leitura (espelham as views do banco) ─────────────────────
interface LimiteRow {
  parceiro_id: string;
  consignado_modelo: string | null;
  dia_acerto: number | null;
  saldo_corrido: number | null;
  exposicao_recuperavel: number | null;
  limite_concedido: number | null;
  limite_validade: string | null;
  forma_conta_corrente_aprovada: boolean | null;
  situacao_credito: string | null;
  limite_disponivel: number | null;
  uso_pct: number | null;
  cobertura: number | null;
  dias_estoque_mais_antigo: number | null;
}

interface ExtratoRow {
  parceiro_id: string;
  data: string | null;
  tipo: string | null;
  descricao: string | null;
  valor: number | null;
  ref: string | null;
  pedido_ref: string | null;
  nao_classificado: boolean | null;
  saldo_corrido: number | null;
}

interface DuplicidadeRow {
  nf_id: string;
  numero: string | null;
  data_emissao: string | null;
  valor_nota: number | null;
  pedido: string | null;
  sem_pedido_vinculado: boolean | null;
}

interface EstoqueParceiroRow {
  sku: string | null;
  produto: string | null;
  saldo: number | null;
  dias_no_parceiro: number | null;
  preco_sugerido: number | null;
}

interface EstoqueEstimadoRow {
  sku: string | null;
  qtd_enviada: number | null;
  qtd_devolvida: number | null;
  qtd_vendida_reportada: number | null;
  estoque_estimado: number | null;
}

interface ConsignadoResumoRow {
  parceiro_id: string | null;
  saldo_devedor: number | null;
  documentado: number | null;
  ultimo_pagamento: string | null;
  acerto_vivo_id: string | null;
  acerto_vivo_numero: string | null;
  acerto_vivo_status: string | null;
  acerto_vivo_valor: number | null;
  acerto_vivo_competencia: string | null;
  acerto_vivo_periodo_inicio: string | null;
  acerto_vivo_periodo_fim: string | null;
  total_acertado: number | null;
  total_liquidado: number | null;
  girado_pct: number | null;
  ultima_liquidacao: string | null;
  proximo_acerto_previsto: string | null;
}

interface RemessaRow {
  id: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_nota: number | null;
  itens_json: unknown;
}

interface AcertoRow {
  id: string;
  numero: string | null;
  competencia: string | null;
  status: string | null;
  valor_total: number | null;
  pedido_sintetico_id: string | null;
  data_confirmacao: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  relatorio_path: string | null;
  titulo_acerto_id: string | null;
}

interface AcertoItemRow {
  id: string;
  sku: string | null;
  descricao: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
}

interface PreviaLinha {
  codigo_informado: string | null;
  sku: string | null;
  descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number | null;
  enviado: number | null;
  devolvido: number | null;
  ja_reportado: number | null;
  disponivel: number | null;
  diag: string | null;
}

interface ReportePrevia {
  ok: boolean;
  pronto: boolean;
  n_linhas: number | null;
  valor_total: number | null;
  linhas: PreviaLinha[] | null;
}

const MSG_DIAG: Record<string, string> = {
  ok: "OK",
  codigo_nao_encontrado: "Código não encontrado",
  codigo_ambiguo: "Código ambíguo — mais de um SKU",
  excede_disponivel: "Quantidade acima do disponível",
  sem_remessa_para_este_parceiro: "Sem remessa para este parceiro",
  linha_invalida: "Linha inválida",
};

/**
 * Parser tolerante do relatório colado: tab, espaços múltiplos ou ponto-e-vírgula.
 * Primeiro token = código; quantidade = primeiro token numérico seguinte.
 */
function parsearLinhasColadas(texto: string): { codigo: string; quantidade: number }[] {
  const saida: { codigo: string; quantidade: number }[] = [];
  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    const tokens = linha.split(/[\t;]+|\s{1,}/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) continue;
    const codigo = tokens[0];
    let quantidade = 0;
    for (const t of tokens.slice(1)) {
      const n = Number(t.replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(n) && n !== 0) {
        quantidade = n;
        break;
      }
    }
    saida.push({ codigo, quantidade });
  }
  return saida;
}

const MSG_SITUACAO: Record<string, string> = {
  sem_analise: "Sem análise de crédito aprovada.",
  analise_vencida: "Análise de crédito vencida — reanálise obrigatória.",
  limite_nulo: "Análise aprovada, mas SEM limite arbitrado: o parceiro não embarca.",
};

const num = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

function ErroBloco({ error }: { error: unknown }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      {(error as Error)?.message ?? "Falha ao carregar"}
    </div>
  );
}

function Carregando() {
  return (
    <div className="p-6 flex justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ConsignadoDetalhe() {
  const { parceiroId } = useParams<{ parceiroId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [buscaEstoque, setBuscaEstoque] = useState("");
  const [soComMovimento, setSoComMovimento] = useState(true);

  const invalidarTudo = async () => {
    await Promise.all([
      "consignados-conta-corrente",
      "consignado-limite",
      "consignado-resumo",
      "consignado-remessas",
      "consignado-extrato",
      "consignado-duplicidades",
      "consignado-estoque-parceiro",
      "consignado-estoque-estimado",
      "consignado-acertos",
      "consignado-acerto-itens",
      "consignado-acerto-detalhe-itens",
      "consignado-itens-acertos",
      "consignado-parceiro",
    ].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };

  const parceiroQ = useQuery({
    queryKey: ["consignado-parceiro", parceiroId],
    enabled: !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, consignado_cadencia_dias")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; consignado_cadencia_dias: number | null } | null;
    },
  });

  const contaQ = useContaCorrenteCliente(parceiroId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cc = contaQ.data?.[0] as any;

  const resumoQ = useQuery({
    queryKey: ["consignado-resumo", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ConsignadoResumoRow | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_parceiro_resumo")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ConsignadoResumoRow | null;
    },
  });
  const resumo = resumoQ.data;

  const remessasQ = useQuery({
    queryKey: ["consignado-remessas", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<RemessaRow[]> => {
      const { data, error } = await (supabase as any)
        .from("nfs_emitidas")
        .select("id, numero, serie, data_emissao, valor_nota, itens_json")
        .eq("tipo", "saida")
        .eq("parceiro_id", parceiroId)
        .order("data_emissao", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RemessaRow[];
    },
  });

  const limiteQ = useQuery({
    queryKey: ["consignado-limite", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<LimiteRow | null> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_limite")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LimiteRow | null;
    },
  });
  const limite = limiteQ.data;

  // FONTE DO MODELO: a conta corrente manda; a view de limite é o espelho.
  const modelo: string | null = cc?.consignado_modelo ?? limite?.consignado_modelo ?? null;
  const ehConsignacaoFiscal = modelo === "consignacao_fiscal";
  const diaAcerto = cc?.dia_acerto ?? limite?.dia_acerto ?? null;

  const extratoQ = useQuery({
    queryKey: ["consignado-extrato", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<ExtratoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_conta_corrente_extrato_cliente")
        .select("*")
        .eq("parceiro_id", parceiroId)
        .order("data", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ExtratoRow[];
    },
  });

  const nDuplicidades = Number(cc?.n_docs_duplicidade_suspeita ?? 0);
  const valorDuplicidade = Number(cc?.documentado_em_duplicidade_suspeita ?? 0);

  const duplicidadesQ = useQuery({
    queryKey: ["consignado-duplicidades", parceiroId],
    enabled: !!parceiroId && valorDuplicidade > 0,
    queryFn: async (): Promise<DuplicidadeRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_nf_duplicidade_suspeita")
        .select("nf_id, numero, data_emissao, valor_nota, pedido, sem_pedido_vinculado")
        .eq("parceiro_id", parceiroId)
        .order("data_emissao", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as DuplicidadeRow[];
    },
  });

  const estoqueParceiroQ = useQuery({
    queryKey: ["consignado-estoque-parceiro", parceiroId],
    enabled: !!parceiroId && ehConsignacaoFiscal,
    queryFn: async (): Promise<EstoqueParceiroRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_consignado_estoque_parceiro")
        .select("sku, produto, saldo, dias_no_parceiro, preco_sugerido")
        .eq("parceiro_id", parceiroId)
        .order("dias_no_parceiro", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EstoqueParceiroRow[];
    },
  });

  const estoqueEstimadoQ = useQuery({
    queryKey: ["consignado-estoque-estimado", parceiroId],
    enabled: !!parceiroId && modelo === "venda_com_acerto",
    queryFn: async (): Promise<EstoqueEstimadoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_estimado_parceiro")
        .select("sku, qtd_enviada, qtd_devolvida, qtd_vendida_reportada, estoque_estimado")
        .eq("parceiro_id", parceiroId)
        .order("qtd_vendida_reportada", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as EstoqueEstimadoRow[];
    },
  });

  const skusEstimados = useMemo(
    () => (estoqueEstimadoQ.data ?? []).map((e) => e.sku).filter((sku): sku is string => !!sku),
    [estoqueEstimadoQ.data],
  );

  const produtosEstimadosQ = useQuery({
    queryKey: ["consignado-estoque-produtos", skusEstimados],
    enabled: modelo === "venda_com_acerto" && skusEstimados.length > 0,
    queryFn: async (): Promise<Array<{ sku: string; nome: string }>> => {
      const { data, error } = await (supabase as any)
        .from("sncf_produtos")
        .select("sku, nome_completo, nome_comercial")
        .in("sku", skusEstimados);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        sku: p.sku,
        nome: p.nome_completo ?? p.nome_comercial,
      }));
    },
  });

  const acertosQ = useQuery({
    queryKey: ["consignado-acertos", parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<AcertoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("consignado_acerto")
        .select("id, numero, competencia, status, valor_total, pedido_sintetico_id, data_confirmacao, periodo_inicio, periodo_fim, relatorio_path, titulo_acerto_id")
        .eq("parceiro_id", parceiroId)
        .order("competencia", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AcertoRow[];
    },
  });

  const rascunho = useMemo(
    () => (acertosQ.data ?? []).find((a) => a.status === "rascunho") ?? null,
    [acertosQ.data],
  );

  const itensRascunhoQ = useQuery({
    queryKey: ["consignado-acerto-itens", rascunho?.id],
    enabled: !!rascunho?.id,
    queryFn: async (): Promise<AcertoItemRow[]> => {
      if (!rascunho?.id) return [];
      const { data, error } = await (supabase as any)
        .from("consignado_acerto_item")
        .select("id, sku, descricao, quantidade, valor_unitario, valor_total")
        .eq("acerto_id", rascunho.id)
        .order("sku");
      if (error) throw error;
      return (data ?? []) as AcertoItemRow[];
    },
  });

  // ── acerto de primeira classe: dialog de detalhe ───────────────────────
  const [acertoAbertoId, setAcertoAbertoId] = useState<string | null>(null);
  const acertoAberto = useMemo(
    () => (acertosQ.data ?? []).find((a) => a.id === acertoAbertoId) ?? null,
    [acertosQ.data, acertoAbertoId],
  );

  const itensAcertoQ = useQuery({
    queryKey: ["consignado-acerto-detalhe-itens", acertoAbertoId],
    enabled: !!acertoAbertoId,
    queryFn: async (): Promise<AcertoItemRow[]> => {
      const { data, error } = await (supabase as any)
        .from("consignado_acerto_item")
        .select("id, sku, descricao, quantidade, valor_unitario, valor_total")
        .eq("acerto_id", acertoAbertoId)
        .order("valor_total", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AcertoItemRow[];
    },
  });

  // ── inteligência de reposição: itens de todos os acertos do parceiro ────
  const itensAcertosQ = useQuery({
    queryKey: ["consignado-itens-acertos", parceiroId],
    enabled: !!parceiroId && modelo === "venda_com_acerto",
    queryFn: async (): Promise<Array<{ sku: string | null; descricao: string | null; quantidade: number | null }>> => {
      const { data, error } = await (supabase as any)
        .from("consignado_acerto_item")
        .select("sku, descricao, quantidade, consignado_acerto!inner(parceiro_id, status)")
        .eq("consignado_acerto.parceiro_id", parceiroId)
        .neq("consignado_acerto.status", "cancelado");
      if (error) throw error;
      return (data ?? []) as Array<{ sku: string | null; descricao: string | null; quantidade: number | null }>;
    },
  });

  // ── ciclo de acerto ───────────────────────────────────────────────────
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [itens, setItens] = useState<{ sku: string; quantidade: string; valor_unitario: string }[]>([
    { sku: "", quantidade: "", valor_unitario: "" },
  ]);
  const [confirmacao, setConfirmacao] = useState<Record<string, unknown> | null>(null);

  const abrirAcerto = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("abrir_acerto_consignado", {
        p_parceiro_id: parceiroId,
        p_competencia: `${competencia}-01`,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      toast.success("Acerto do mês aberto", {
        description: "Idempotente: se já existia acerto nesta competência, é o mesmo.",
      });
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao abrir acerto", { description: e.message }),
  });

  const salvarItens = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      const payload = itens
        .filter((l) => l.sku.trim() && Number(l.quantidade) > 0)
        .map((l) => ({
          sku: l.sku.trim(),
          quantidade: Number(l.quantidade),
          valor_unitario: Number(l.valor_unitario || 0),
        }));
      if (payload.length === 0) throw new Error("Informe pelo menos um SKU com quantidade.");
      const { data, error } = await (supabase as any).rpc("registrar_venda_reportada_consignado", {
        p_acerto_id: rascunho.id,
        p_itens: payload,
      });
      // FAIL-LOUD: a mensagem do banco vai pra tela EXATAMENTE como veio.
      // A função recusa o reporte inteiro se um item exceder o saldo em poder
      // do parceiro — suavizar isso esconderia a razão da recusa.
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      toast.success(`Reporte salvo — ${num(d?.itens)} item(ns)`, {
        description: `Valor do acerto: ${formatBRL(Number(d?.valor_total ?? 0))}`,
      });
      setItens([{ sku: "", quantidade: "", valor_unitario: "" }]);
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Reporte recusado pelo banco", { description: e.message }),
  });

  const confirmarAcerto = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      const { data, error } = await (supabase as any).rpc("confirmar_acerto_consignado", {
        p_acerto_id: rascunho.id,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      setConfirmacao(d);
      toast.success("Acerto confirmado");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao confirmar acerto", { description: e.message }),
  });

  const [descartarAberto, setDescartarAberto] = useState(false);
  const descartarRascunho = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      const { data, error } = await (supabase as any).rpc("descartar_acerto_rascunho", {
        p_acerto_id: rascunho.id,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      const raw = d as unknown;
      const desc =
        typeof raw === "string" && raw.trim()
          ? raw
          : raw && typeof raw === "object" && Object.keys(raw).length > 0
            ? JSON.stringify(raw)
            : undefined;
      toast.success("Rascunho descartado", { description: desc });
      setDescartarAberto(false);
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao descartar o rascunho", { description: e.message }),
  });

  // ── retorno de consignação ────────────────────────────────────────────
  const [retornoAberto, setRetornoAberto] = useState(false);
  const [retornoItens, setRetornoItens] = useState<{ sku: string; quantidade: string }[]>([
    { sku: "", quantidade: "" },
  ]);
  const [retornoDoc, setRetornoDoc] = useState("");
  const [retornoObs, setRetornoObs] = useState("");

  const registrarRetorno = useMutation({
    mutationFn: async () => {
      const payload = retornoItens
        .filter((l) => l.sku.trim() && Number(l.quantidade) > 0)
        .map((l) => ({ sku: l.sku.trim(), quantidade: Number(l.quantidade) }));
      if (payload.length === 0) throw new Error("Informe pelo menos um SKU com quantidade.");
      const { data, error } = await (supabase as any).rpc("registrar_retorno_consignacao", {
        p_parceiro_id: parceiroId,
        p_itens: payload,
        p_documento: retornoDoc.trim() || null,
        p_obs: retornoObs.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      toast.success(`Retorno registrado — ${num(d?.unidades)} unidade(s)`, {
        description: String(d?.nota ?? ""),
      });
      setRetornoAberto(false);
      setRetornoItens([{ sku: "", quantidade: "" }]);
      setRetornoDoc("");
      setRetornoObs("");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao registrar retorno", { description: e.message }),
  });

  // ── importar relatório do parceiro (colar → prévia → importar) ─────────
  // PRECO-VEM-DA-NOTA: a prévia é leitura pura; o valor unitário é o resolvido
  // pela remessa, nunca digitado aqui.
  const [importAberto, setImportAberto] = useState(false);
  const [importTexto, setImportTexto] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [previa, setPrevia] = useState<ReportePrevia | null>(null);
  // Do PDF: a IA só escreve as linhas; a validação e a gravação são as mesmas.
  const [importModo, setImportModo] = useState<"pdf" | "texto">("pdf");
  const [importArquivo, setImportArquivo] = useState<File | null>(null);
  const [origemPdf, setOrigemPdf] = useState<string | null>(null);

  const fecharImport = () => {
    setImportAberto(false);
    setImportTexto("");
    setPeriodoInicio("");
    setPeriodoFim("");
    setPrevia(null);
    setImportModo("pdf");
    setImportArquivo(null);
    setOrigemPdf(null);
  };

  const lerPdf = useMutation({
    mutationFn: async () => {
      if (!importArquivo) throw new Error("Escolha o arquivo do relatório.");
      const buf = new Uint8Array(await importArquivo.arrayBuffer());
      let bin = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
      }
      const { data, error } = await supabase.functions.invoke("ler-relatorio-consignado", {
        body: {
          arquivo_base64: btoa(bin),
          mime_type: importArquivo.type || "application/pdf",
          nome_arquivo: importArquivo.name,
        },
      });
      if (error) {
        const detalhe = await (error as any)?.context?.text?.().catch(() => "");
        let msg = error.message;
        try {
          const j = JSON.parse(detalhe || "{}");
          if (j?.error) msg = String(j.error);
        } catch { /* mensagem crua serve */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error(String((data as any).error));
      return data as { periodo_inicio: string | null; periodo_fim: string | null; itens: { codigo: string; quantidade: number }[] };
    },
    onSuccess: (d) => {
      const itens = d.itens ?? [];
      if (itens.length === 0) {
        toast.error("A IA não encontrou itens vendidos neste arquivo", {
          description: "Confira o arquivo ou use o modo Colar texto.",
        });
        return;
      }
      const linhas = itens.map((it) => `${it.codigo}\t${it.quantidade}`).join("\n");
      setImportTexto(linhas);
      if (d.periodo_inicio) setPeriodoInicio(d.periodo_inicio);
      if (d.periodo_fim) setPeriodoFim(d.periodo_fim);
      setOrigemPdf(importArquivo?.name ?? null);
      analisar.mutate(linhas);
    },
    onError: (e: Error) => toast.error("Falha ao ler o arquivo", { description: e.message }),
  });

  const analisar = useMutation({
    mutationFn: async (textoOpcional?: string) => {
      const itensColados = parsearLinhasColadas(textoOpcional ?? importTexto);
      if (itensColados.length === 0) throw new Error("Nada para analisar: cole ao menos uma linha com código e quantidade.");
      const { data, error } = await (supabase as any).rpc("resolver_reporte_consignado", {
        p_parceiro_id: parceiroId,
        p_itens: itensColados,
      });
      if (error) throw new Error(error.message);
      return data as ReportePrevia;
    },
    onSuccess: (d) => setPrevia(d),
    onError: (e: Error) => toast.error("Falha ao analisar o relatório", { description: e.message }),
  });

  const importarPrevia = useMutation({
    mutationFn: async () => {
      if (!rascunho) throw new Error("Não há acerto em rascunho.");
      if (!previa?.pronto) throw new Error("A prévia ainda tem linhas com problema.");
      const payload = (previa.linhas ?? []).map((l) => ({
        sku: l.sku,
        quantidade: l.quantidade,
        valor_unitario: l.valor_unitario,
      }));
      const { data, error } = await (supabase as any).rpc("registrar_venda_reportada_consignado", {
        p_acerto_id: rascunho.id,
        p_itens: payload,
        p_periodo_inicio: periodoInicio || null,
        p_periodo_fim: periodoFim || null,
      });
      if (error) throw new Error(error.message);

      // UM-GESTO-SÓ: o mesmo PDF que alimentou a importação vira o anexo do acerto.
      // Anexo é acessório: falha aqui não desfaz a importação já gravada.
      let avisoAnexo: string | null = null;
      if (origemPdf && importArquivo) {
        try {
          const nomeLimpo = importArquivo.name.replace(/[^\w.\-]+/g, "-");
          const caminho = `${rascunho.id}/${nomeLimpo}`;
          const up = await supabase.storage
            .from("consignado-acertos")
            .upload(caminho, importArquivo, { upsert: true });
          if (up.error) throw new Error(up.error.message);
          const anexo = await (supabase as any).rpc("anexar_relatorio_acerto", {
            p_acerto_id: rascunho.id,
            p_path: caminho,
          });
          if (anexo.error) throw new Error(anexo.error.message);
        } catch (e) {
          avisoAnexo = e instanceof Error ? e.message : String(e);
        }
      }
      return { retorno: data as Record<string, unknown>, avisoAnexo };
    },
    onSuccess: async ({ retorno: d, avisoAnexo }) => {
      toast.success(`Relatório importado — ${num(d?.itens)} item(ns)`, {
        description: `Valor do acerto: ${formatBRL(Number(d?.valor_total ?? 0))}`,
      });
      if (avisoAnexo) {
        toast.warning("O arquivo não ficou anexado ao acerto", {
          description: `${avisoAnexo} — a importação foi mantida; você pode anexar o arquivo na tela do acerto.`,
        });
      }
      fecharImport();
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Importação recusada pelo banco", { description: e.message }),
  });

  // ── arbitrar limite ────────────────────────────────────────────────────
  // A RPC é guardada por acao.credito_decidir; o botão só aparece pra quem tem.
  const { permitido: podeArbitrar } = usePermissaoAcaoOuSuperAdmin("acao.credito_decidir");
  const [arbitrarAberto, setArbitrarAberto] = useState(false);
  const [arbLimite, setArbLimite] = useState("");
  const [arbValidade, setArbValidade] = useState("");
  const [arbParecer, setArbParecer] = useState("");

  const arbitrarLimite = useMutation({
    mutationFn: async () => {
      const valor = Number(arbLimite);
      if (!Number.isFinite(valor)) throw new Error("Informe o limite em reais.");
      const { data, error } = await (supabase as any).rpc("arbitrar_limite_conta_corrente", {
        p_parceiro_id: parceiroId,
        p_limite: valor,
        p_validade: arbValidade || null,
        p_parecer: arbParecer.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async (d) => {
      toast.success("Limite arbitrado", {
        description: `${formatBRL(Number(d?.antes ?? 0))} → ${formatBRL(Number(d?.depois ?? 0))}`,
      });
      setArbitrarAberto(false);
      setArbLimite("");
      setArbValidade("");
      setArbParecer("");
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao arbitrar limite", { description: e.message }),
  });

  // ── anexo do relatório do acerto ───────────────────────────────────────
  const [arquivoAnexo, setArquivoAnexo] = useState<File | null>(null);

  const anexarRelatorio = useMutation({
    mutationFn: async () => {
      if (!acertoAberto) throw new Error("Nenhum acerto selecionado.");
      if (!arquivoAnexo) throw new Error("Escolha um arquivo.");
      const nomeLimpo = arquivoAnexo.name.replace(/[^\w.\-]+/g, "-");
      const caminho = `${acertoAberto.id}/${nomeLimpo}`;
      const up = await supabase.storage
        .from("consignado-acertos")
        .upload(caminho, arquivoAnexo, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { error } = await (supabase as any).rpc("anexar_relatorio_acerto", {
        p_acerto_id: acertoAberto.id,
        p_path: caminho,
      });
      if (error) throw new Error(error.message);
      return caminho;
    },
    onSuccess: async () => {
      toast.success("Relatório anexado ao acerto");
      setArquivoAnexo(null);
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao anexar o relatório", { description: e.message }),
  });

  const baixarRelatorio = useMutation({
    mutationFn: async (caminho: string) => {
      const { data, error } = await supabase.storage
        .from("consignado-acertos")
        .createSignedUrl(caminho, 60 * 10);
      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error("O banco não devolveu o link do arquivo.");
      return data.signedUrl;
    },
    onSuccess: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e: Error) => toast.error("Falha ao baixar o relatório", { description: e.message }),
  });

  // ── liquidação manual ──────────────────────────────────────────────────
  // CRÉDITO GUARDA EMBARQUE, NÃO RECEBIMENTO: receber dinheiro nunca trava.
  const [liqData, setLiqData] = useState(() => new Date().toISOString().slice(0, 10));
  const [liqNota, setLiqNota] = useState("");

  const liquidarManual = useMutation({
    mutationFn: async () => {
      if (!acertoAberto) throw new Error("Nenhum acerto selecionado.");
      const { data, error } = await (supabase as any).rpc("liquidar_acerto_manual", {
        p_acerto_id: acertoAberto.id,
        p_data: liqData || null,
        p_nota: liqNota.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: async () => {
      toast.success("Acerto marcado como liquidado");
      setLiqNota("");
      setAcertoAbertoId(null);
      await invalidarTudo();
    },
    onError: (e: Error) => toast.error("Falha ao liquidar o acerto", { description: e.message }),
  });



  const nome = parceiroQ.data?.razao_social ?? "Parceiro";
  const rotuloModelo = ehConsignacaoFiscal
    ? "Consignação fiscal"
    : modelo === "venda_com_acerto"
      ? "Venda com acerto"
      : "Modelo não definido";

  const situacao = limite?.situacao_credito ?? null;
  const situacaoRuim = !!situacao && situacao !== "ok";
  const formaNaoAprovada = limite?.forma_conta_corrente_aprovada === false;
  const operacaoBloqueada = situacaoRuim || formaNaoAprovada;
  const creditoOk = situacao === "ok" && limite?.forma_conta_corrente_aprovada === true;
  const cadencia = diaAcerto
    ? `acerto todo dia ${diaAcerto}`
    : parceiroQ.data?.consignado_cadencia_dias
      ? `acerto a cada ${parceiroQ.data.consignado_cadencia_dias} dias`
      : "cadência não definida";
  const secoes = ehConsignacaoFiscal
    ? ["visao", "ciclo", "remessas", "estoque", "retorno"]
    : ["visao", "ciclo", "remessas", "estoque"];
  const secaoParam = searchParams.get("secao") ?? "visao";
  const secao = secoes.includes(secaoParam) ? secaoParam : "visao";
  const mudarSecao = (valor: string) => {
    const next = new URLSearchParams(searchParams);
    if (valor === "visao") next.delete("secao");
    else next.set("secao", valor);
    setSearchParams(next, { replace: true });
  };
  const nomesEstimados = new Map(
    (produtosEstimadosQ.data ?? []).map((produto) => [produto.sku, produto.nome]),
  );
  const termoEstoque = buscaEstoque.trim().toLocaleLowerCase("pt-BR");
  const estoqueEstimadoFiltrado = (estoqueEstimadoQ.data ?? [])
    .filter((item) => !soComMovimento || Number(item.qtd_vendida_reportada ?? 0) > 0)
    .filter((item) => {
      if (!termoEstoque) return true;
      const nomeProduto = item.sku ? nomesEstimados.get(item.sku) ?? "" : "";
      return `${item.sku ?? ""} ${nomeProduto}`.toLocaleLowerCase("pt-BR").includes(termoEstoque);
    })
    .sort((a, b) => Number(b.qtd_vendida_reportada ?? 0) - Number(a.qtd_vendida_reportada ?? 0));
  const estoqueRealFiltrado = (estoqueParceiroQ.data ?? [])
    .filter((item) => {
      if (!termoEstoque) return true;
      return `${item.sku ?? ""} ${item.produto ?? ""}`.toLocaleLowerCase("pt-BR").includes(termoEstoque);
    })
    .sort((a, b) => Number(b.dias_no_parceiro ?? 0) - Number(a.dias_no_parceiro ?? 0));
  const totaisEstimados = estoqueEstimadoFiltrado.reduce(
    (acc, item) => ({
      enviado: acc.enviado + Number(item.qtd_enviada ?? 0),
      vendido: acc.vendido + Number(item.qtd_vendida_reportada ?? 0),
      estimado: acc.estimado + Number(item.estoque_estimado ?? 0),
    }),
    { enviado: 0, vendido: 0, estimado: 0 },
  );
  const totalEstoqueReal = estoqueRealFiltrado.reduce((total, item) => total + Number(item.saldo ?? 0), 0);
  const nItensRemessa = (itens: unknown) => Array.isArray(itens) ? itens.length : 0;
  const duplicidadesIds = new Set((duplicidadesQ.data ?? []).map((item) => item.nf_id));
  const statusAcerto = resumo?.acerto_vivo_status === "rascunho"
    ? "em preparação"
    : resumo?.acerto_vivo_status === "confirmado"
      ? "aguardando pagamento"
      : resumo?.acerto_vivo_status ?? null;

  // ── inteligência de reposição (cálculo de leitura, no front) ────────────
  // Réplica da seção de reposição do relatório do parceiro: vendido nos acertos
  // ÷ semanas do período apurado do último acerto = ritmo semanal.
  const vendidoPorSku = useMemo(() => {
    const mapa = new Map<string, { sku: string; descricao: string | null; quantidade: number }>();
    for (const item of itensAcertosQ.data ?? []) {
      if (!item.sku) continue;
      const atual = mapa.get(item.sku);
      const qtd = Number(item.quantidade ?? 0);
      if (atual) {
        atual.quantidade += qtd;
        if (!atual.descricao) atual.descricao = item.descricao;
      } else {
        mapa.set(item.sku, { sku: item.sku, descricao: item.descricao, quantidade: qtd });
      }
    }
    return mapa;
  }, [itensAcertosQ.data]);

  const topVendidos = useMemo(
    () => [...vendidoPorSku.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5),
    [vendidoPorSku],
  );

  const ultimoPeriodo = useMemo(
    () => (acertosQ.data ?? []).find((a) => a.periodo_inicio && a.periodo_fim) ?? null,
    [acertosQ.data],
  );

  const semanasPeriodo = useMemo(() => {
    if (!ultimoPeriodo?.periodo_inicio || !ultimoPeriodo?.periodo_fim) return 1;
    const dias =
      (new Date(ultimoPeriodo.periodo_fim).getTime() - new Date(ultimoPeriodo.periodo_inicio).getTime())
      / 86_400_000;
    return Math.max(1, dias / 7);
  }, [ultimoPeriodo]);

  const cobertura = useMemo(() => {
    const estimadoPorSku = new Map(
      (estoqueEstimadoQ.data ?? [])
        .filter((e) => !!e.sku)
        .map((e) => [e.sku as string, Number(e.estoque_estimado ?? 0)]),
    );
    return [...vendidoPorSku.values()]
      .filter((v) => v.quantidade > 0)
      .map((v) => {
        const estimado = estimadoPorSku.get(v.sku) ?? 0;
        const porSemana = v.quantidade / semanasPeriodo;
        return {
          sku: v.sku,
          descricao: v.descricao,
          estimado,
          porSemana,
          semanas: porSemana > 0 ? estimado / porSemana : null,
        };
      })
      .sort((a, b) => (a.semanas ?? Infinity) - (b.semanas ?? Infinity));
  }, [vendidoPorSku, estoqueEstimadoQ.data, semanasPeriodo]);

  const acabaPrimeiro = cobertura.filter((c) => c.semanas !== null && c.semanas < 8);



  return (
    <PageShell>
      <CasaPageHeader
        breadcrumb={[
          { label: "Comercial" },
          { label: "Consignados", to: "/comercial/consignados" },
          { label: nome },
        ]}
        title={nome}
        subtitle={[
          parceiroQ.data?.cnpj ? `CNPJ ${parceiroQ.data.cnpj}` : null,
          rotuloModelo,
          cadencia,
        ].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant={creditoOk ? "outline" : "destructive"}
              className={cn(creditoOk && "border-success/40 bg-success/10 text-success")}
            >
              {creditoOk ? "Crédito ok" : "Crédito bloqueado"}
            </Badge>
            {podeArbitrar && (
              <Button variant="outline" size="sm" onClick={() => setArbitrarAberto(true)}>
                <Gavel className="h-4 w-4" /> Arbitrar limite
              </Button>
            )}
            {limite && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {formatBRL(limite.limite_disponivel)} disponíveis · {limite.uso_pct ?? "—"}% usado
              </span>
            )}
          </div>
        }
      />

      {operacaoBloqueada && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-1 text-sm">
            {situacaoRuim && (
              <p className="font-medium">
                {situacao ? MSG_SITUACAO[situacao] ?? `Situação de crédito: ${situacao}` : ""}
              </p>
            )}
            {formaNaoAprovada && (
              <p className="font-medium">
                A análise de crédito não aprovou a forma conta corrente para este parceiro.
              </p>
            )}
            <p>Enquanto isso valer, o parceiro não embarca — este bloqueio é operacional, não é aviso.</p>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Resumo de gestão">
        {resumoQ.isError ? (
          <ErroBloco error={resumoQ.error} />
        ) : resumoQ.isLoading ? (
          <Carregando />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Saldo devedor</p>
                <p className="mt-1 text-2xl font-medium tabular-nums">{formatBRL(resumo?.saldo_devedor)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Acerto do ciclo</p>
                <p className="mt-1 text-2xl font-medium tabular-nums">
                  {resumo?.acerto_vivo_id ? formatBRL(resumo.acerto_vivo_valor) : "—"}
                </p>
                <p className={cn("mt-1 text-xs text-muted-foreground", resumo?.acerto_vivo_status === "confirmado" && "text-warning")}>
                  {resumo?.acerto_vivo_id
                    ? `${resumo.acerto_vivo_numero ?? "Acerto"} · ${statusAcerto ?? "—"}`
                    : "nenhum ciclo aberto"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Girado da remessa</p>
                <p className="mt-1 text-2xl font-medium tabular-nums">
                  {resumo?.girado_pct === null || resumo?.girado_pct === undefined ? "—" : `${resumo.girado_pct}%`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBRL(resumo?.total_acertado)} de {formatBRL(resumo?.documentado)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Último pagamento</p>
                <p className="mt-1 text-2xl font-medium tabular-nums">{formatDateBR(resumo?.ultimo_pagamento)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Próximo acerto</p>
                <p className={cn("mt-1 text-2xl font-medium tabular-nums", estaVencido(resumo?.proximo_acerto_previsto) && "text-warning")}>
                  {formatDateBR(resumo?.proximo_acerto_previsto)}
                </p>
                {estaVencido(resumo?.proximo_acerto_previsto) && <p className="mt-1 text-xs text-warning">atrasado</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <Tabs value={secao} onValueChange={mudarSecao} className="space-y-4">
        <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="visao">Visão</TabsTrigger>
          <TabsTrigger value="ciclo">Ciclo de acerto</TabsTrigger>
          <TabsTrigger value="remessas">Remessas e extrato</TabsTrigger>
          <TabsTrigger value="estoque">Estoque no parceiro</TabsTrigger>
          {ehConsignacaoFiscal && <TabsTrigger value="retorno">Retorno</TabsTrigger>}
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <VisaoConsignado parceiroId={parceiroId} />
        </TabsContent>

        <TabsContent value="ciclo" className="space-y-4">
          {/* ═══ CICLO DE ACERTO ═══ */}
          <section className="space-y-3">
            <h2 className="font-serif text-xl flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-gold" /> Ciclo de acerto
            </h2>
    
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {rascunho ? `Acerto em rascunho — ${rascunho.numero ?? ""}` : "Abrir acerto do mês"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!rascunho && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="competencia">Competência</Label>
                      <Input
                        id="competencia"
                        type="month"
                        value={competencia}
                        onChange={(e) => setCompetencia(e.target.value)}
                        className="w-44"
                      />
                    </div>
                    <Button
                      disabled={abrirAcerto.isPending || !competencia}
                      onClick={() => abrirAcerto.mutate()}
                    >
                      {abrirAcerto.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Abrir acerto do mês
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Idempotente: reabrir a mesma competência devolve o mesmo acerto.
                    </p>
                  </div>
                )}
    
                {rascunho && (
                  <>
                    <div className="space-y-2">
                      {itens.map((l, i) => (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <div className="space-y-1 flex-1 min-w-[10rem]">
                            {i === 0 && <Label className="text-xs">SKU</Label>}
                            <Input
                              list={ehConsignacaoFiscal ? "skus-em-poder" : undefined}
                              value={l.sku}
                              placeholder="SKU"
                              onChange={(e) =>
                                setItens((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
                              }
                            />
                          </div>
                          <div className="space-y-1 w-28">
                            {i === 0 && <Label className="text-xs">Qtd</Label>}
                            <Input
                              type="number"
                              min="0"
                              value={l.quantidade}
                              onChange={(e) =>
                                setItens((p) => p.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))
                              }
                            />
                          </div>
                          <div className="space-y-1 w-36">
                            {i === 0 && <Label className="text-xs">Valor unitário</Label>}
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.valor_unitario}
                              onChange={(e) =>
                                setItens((p) => p.map((x, j) => (j === i ? { ...x, valor_unitario: e.target.value } : x)))
                              }
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setItens((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))}
                            title="Remover linha"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
    
                      {ehConsignacaoFiscal && (
                        <datalist id="skus-em-poder">
                          {(estoqueParceiroQ.data ?? []).map((e) => (
                            <option key={e.sku ?? ""} value={e.sku ?? ""}>
                              {`${e.produto ?? ""} · saldo ${num(e.saldo)}`}
                            </option>
                          ))}
                        </datalist>
                      )}
    
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setItens((p) => [...p, { sku: "", quantidade: "", valor_unitario: "" }])}
                        >
                          <Plus className="h-4 w-4" /> Linha
                        </Button>
                        <Button
                          size="sm"
                          disabled={salvarItens.isPending}
                          onClick={() => salvarItens.mutate()}
                        >
                          {salvarItens.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Salvar reporte
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setImportAberto(true)}
                        >
                          <ClipboardPaste className="h-4 w-4" /> Importar relatório
                        </Button>
                      </div>
    
                      {ehConsignacaoFiscal && (
                        <p className="text-xs text-muted-foreground">
                          O banco recusa o reporte inteiro se qualquer item exceder o saldo em poder do parceiro.
                        </p>
                      )}
                    </div>
    
                    {(itensRascunhoQ.data ?? []).length > 0 && (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="text-right">Qtd</TableHead>
                              <TableHead className="text-right">Unitário</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(itensRascunhoQ.data ?? []).map((it) => (
                              <TableRow key={it.id}>
                                <TableCell className="text-xs font-mono">{it.sku ?? "—"}</TableCell>
                                <TableCell className="text-xs">{it.descricao ?? "—"}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{num(it.quantidade)}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{formatBRL(it.valor_unitario)}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{formatBRL(it.valor_total)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
    
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        disabled={
                          confirmarAcerto.isPending
                          || (itensRascunhoQ.data ?? []).length === 0
                        }
                        onClick={() => confirmarAcerto.mutate()}
                      >
                        {confirmarAcerto.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmar acerto
                      </Button>
                      <Button variant="outline" onClick={() => setAcertoAbertoId(rascunho.id)}>
                        Ver acerto
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={descartarRascunho.isPending}
                        onClick={() => setDescartarAberto(true)}
                      >
                        <Trash2 className="h-4 w-4" /> Descartar rascunho
                      </Button>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        Valor do acerto: {formatBRL(rascunho.valor_total)}
                      </span>
                    </div>

                    <AlertDialog open={descartarAberto} onOpenChange={setDescartarAberto}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Descartar rascunho</AlertDialogTitle>
                          <AlertDialogDescription>
                            Descartar o rascunho {rascunho.numero ?? ""}? Ele nunca foi confirmado — nada
                            aconteceu no mundo. A competência fica livre para reabrir.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={descartarRascunho.isPending}>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={descartarRascunho.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              descartarRascunho.mutate();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {descartarRascunho.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Descartar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
    
                {confirmacao && (
                  <Alert className="border-success/50 bg-success/10">
                    <AlertTriangle className="h-4 w-4 text-success" />
                    <AlertDescription className="space-y-1 text-sm">
                      <p className="font-medium text-success">
                        Próximo passo: {String(confirmacao.proximo_passo ?? "—")}
                      </p>
                      <p>
                        Pedido sintético <strong>{String(confirmacao.pedido_sintetico ?? "—")}</strong>
                        {confirmacao.pedido_id && (
                          <Link
                            to={`/pedidos/${String(confirmacao.pedido_id)}`}
                            className="ml-2 inline-flex items-center gap-1 underline"
                          >
                            abrir <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
    
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Acertos anteriores</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {acertosQ.isError ? (
                  <ErroBloco error={acertosQ.error} />
                ) : acertosQ.isLoading ? (
                  <Carregando />
                ) : (acertosQ.data ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">Nenhum acerto registrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Pedido sintético</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(acertosQ.data ?? []).map((a) => (
                        <TableRow key={a.id} className="cursor-pointer" onClick={() => setAcertoAbertoId(a.id)}>
                          <TableCell className="text-xs font-mono underline">{a.numero ?? "—"}</TableCell>
                          <TableCell className="text-xs">{formatDateBR(a.competencia)}</TableCell>
                          <TableCell>
                            <Badge variant={a.status === "rascunho" ? "outline" : "secondary"} className="text-[10px]">
                              {a.status ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatBRL(a.valor_total)}</TableCell>
                          <TableCell className="text-xs">
                            {a.pedido_sintetico_id ? (
                              <Link
                                to={`/pedidos/${a.pedido_sintetico_id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 underline"
                              >
                                abrir <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="remessas" className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal">Remessas</h2>
            {valorDuplicidade > 0 && (
              <Alert className="border-warning/50 bg-warning/10">
                <Copy className="h-4 w-4 text-warning" />
                <AlertDescription className="text-sm text-warning">
                  {nDuplicidades || "Algumas"} nota(s) com valor e itens idênticos a outra(s) — o saldo conta as duas ({formatBRL(valorDuplicidade)}), alguém precisa decidir.
                </AlertDescription>
              </Alert>
            )}
            <Card>
              <CardContent className="overflow-x-auto p-0">
                {remessasQ.isError ? <ErroBloco error={remessasQ.error} /> : remessasQ.isLoading ? <Carregando /> : (remessasQ.data ?? []).length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma remessa encontrada.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>NF</TableHead><TableHead>Emissão</TableHead><TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(remessasQ.data ?? []).map((nf) => (
                        <TableRow key={nf.id}>
                          <TableCell className="text-xs tabular-nums">
                            <div className="flex items-center gap-2">
                              <span>{nf.numero ?? "—"}{nf.serie ? ` / ${nf.serie}` : ""}</span>
                              {duplicidadesIds.has(nf.id) && <Badge variant="outline" className="border-warning/40 text-warning">duplicidade?</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{formatDateBR(nf.data_emissao)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{nItensRemessa(nf.itens_json)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatBRL(nf.valor_nota)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl font-normal">Extrato de conta corrente</h2>
            <Card>
              <CardContent className="p-0">
                {extratoQ.isError ? <ErroBloco error={extratoQ.error} /> : extratoQ.isLoading ? <Carregando /> : (extratoQ.data ?? []).length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Sem lançamentos.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Saldo corrido</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(extratoQ.data ?? []).map((l, i) => {
                        // ACERTO É EVENTO, NÃO MOVIMENTO: valor NULL não vira R$ 0,00.
                        const ehAcerto = l.tipo === "acerto";
                        const ehRecebimento = l.tipo === "recebimento";
                        const v = Number(l.valor ?? 0);
                        const credito = v < 0;
                        return (
                          <TableRow key={`${l.ref ?? "l"}-${i}`} className={cn(l.nao_classificado && "bg-warning/10")}>
                            <TableCell className="whitespace-nowrap text-xs">{formatDateBR(l.data)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={ehRecebimento ? "outline" : "outline"}
                                className={cn(
                                  "text-[10px]",
                                  ehAcerto && "border-gold/50 text-gold",
                                  ehRecebimento && "border-success/40 bg-success/10 text-success",
                                )}
                              >
                                {l.tipo ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{l.descricao ?? "—"}{l.pedido_ref && <span className="block text-muted-foreground">{l.pedido_ref}</span>}{l.nao_classificado && <span className="mt-0.5 flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> NF sem pedido vinculado</span>}</TableCell>
                            {l.valor === null || l.valor === undefined ? (
                              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">—</TableCell>
                            ) : (
                              <TableCell className={cn("text-right text-sm tabular-nums", credito ? "text-success" : "text-destructive")}>{credito ? "− " : "+ "}{formatBRL(Math.abs(v))}</TableCell>
                            )}
                            <TableCell className="text-right text-sm tabular-nums">{formatBRL(l.saldo_corrido)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="estoque" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-normal">{ehConsignacaoFiscal ? "Estoque em poder do parceiro" : "Estoque no parceiro — estimativa"}</h2>
              <p className="text-sm text-muted-foreground">{ehConsignacaoFiscal ? "Mercadoria da Fetely em poder do parceiro." : "Referência para o acerto; não é controle patrimonial."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative w-64 max-w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={buscaEstoque} onChange={(e) => setBuscaEstoque(e.target.value)} placeholder="Buscar SKU ou produto" className="pl-9" />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="so-movimento" checked={ehConsignacaoFiscal ? true : soComMovimento} disabled={ehConsignacaoFiscal} onCheckedChange={setSoComMovimento} />
                <Label htmlFor="so-movimento" className="text-sm">Só com movimento</Label>
              </div>
            </div>
          </div>

          {!ehConsignacaoFiscal && (topVendidos.length > 0 || cobertura.length > 0) && (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top vendidos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {topVendidos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem venda reportada.</p>
                  ) : topVendidos.map((t) => (
                    <div key={t.sku} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate">{t.descricao ?? t.sku}</span>
                      <span className="tabular-nums font-medium">{t.quantidade}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Cobertura</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  <p className="text-[11px] text-muted-foreground">
                    Ritmo do período apurado ({semanasPeriodo.toFixed(1)} semana(s)).
                  </p>
                  {cobertura.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem itens com venda.</p>
                  ) : cobertura.slice(0, 8).map((c) => (
                    <div key={c.sku} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate">{c.descricao ?? c.sku}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.semanas === null ? "—" : `${c.semanas.toFixed(1)} sem`}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Acaba primeiro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {acabaPrimeiro.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nada abaixo de 8 semanas.</p>
                  ) : acabaPrimeiro.slice(0, 8).map((c) => (
                    <div key={c.sku} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate">{c.descricao ?? c.sku}</span>
                      {c.estimado === 0 ? (
                        <Badge variant="destructive" className="text-[10px]">esgotado</Badge>
                      ) : (
                        <span className="tabular-nums text-warning">{c.semanas?.toFixed(1)} sem</span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              {ehConsignacaoFiscal ? (
                estoqueParceiroQ.isError ? <ErroBloco error={estoqueParceiroQ.error} /> : estoqueParceiroQ.isLoading ? <Carregando /> : estoqueRealFiltrado.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nada em poder do parceiro.</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">Dias no parceiro</TableHead><TableHead className="text-right">Preço sugerido</TableHead></TableRow></TableHeader>
                    <TableBody>{estoqueRealFiltrado.map((e) => { const velho = Number(e.dias_no_parceiro ?? 0) > 90; return <TableRow key={e.sku ?? e.produto ?? "item"} className={cn(velho && "bg-destructive/10")}><TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell><TableCell className="text-xs">{e.produto ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{num(e.saldo)}</TableCell><TableCell className={cn("text-right tabular-nums", velho && "text-destructive font-medium")}>{num(e.dias_no_parceiro)}</TableCell><TableCell className="text-right tabular-nums">{formatBRL(e.preco_sugerido)}</TableCell></TableRow>; })}</TableBody>
                    <TableFooter><TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{totalEstoqueReal}</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
                  </Table>
                )
              ) : estoqueEstimadoQ.isError || produtosEstimadosQ.isError ? <ErroBloco error={estoqueEstimadoQ.error ?? produtosEstimadosQ.error} /> : estoqueEstimadoQ.isLoading || produtosEstimadosQ.isLoading ? <Carregando /> : estoqueEstimadoFiltrado.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Sem itens para os filtros atuais.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Enviado</TableHead><TableHead className="text-right">Devolvido</TableHead><TableHead className="text-right">Vendido</TableHead><TableHead className="text-right">Estimado</TableHead></TableRow></TableHeader>
                  <TableBody>{estoqueEstimadoFiltrado.map((e) => <TableRow key={e.sku ?? "item"}><TableCell className="font-mono text-xs">{e.sku ?? "—"}</TableCell><TableCell className="text-xs">{e.sku ? nomesEstimados.get(e.sku) ?? "—" : "—"}</TableCell><TableCell className="text-right tabular-nums">{num(e.qtd_enviada)}</TableCell><TableCell className="text-right tabular-nums">{num(e.qtd_devolvida)}</TableCell><TableCell className="text-right tabular-nums">{num(e.qtd_vendida_reportada)}</TableCell><TableCell className="text-right tabular-nums">{num(e.estoque_estimado)}</TableCell></TableRow>)}</TableBody>
                  <TableFooter><TableRow><TableCell colSpan={2}>Totais</TableCell><TableCell className="text-right tabular-nums">{totaisEstimados.enviado}</TableCell><TableCell /><TableCell className="text-right tabular-nums">{totaisEstimados.vendido}</TableCell><TableCell className="text-right tabular-nums">{totaisEstimados.estimado}</TableCell></TableRow></TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {ehConsignacaoFiscal && <TabsContent value="retorno" className="space-y-4">
          {/* ═══ RETORNO DE MERCADORIA (só consignação fiscal) ═══ */}
          {ehConsignacaoFiscal && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h2 className="font-serif text-xl flex items-center gap-2">
                  <Undo2 className="h-4 w-4 text-gold" /> Retorno de consignação
                </h2>
                <Button variant="outline" size="sm" onClick={() => setRetornoAberto(true)}>
                  Registrar retorno
                </Button>
              </div>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Retorno não é devolução.</strong> A mercadoria nunca foi vendida: não houve
                  receita, não há o que estornar e isso <strong>não passa pela fila de Devolução</strong>.
                  É só a volta física do que sempre foi da Fetely.
                </AlertDescription>
              </Alert>
    
              <Dialog open={retornoAberto} onOpenChange={setRetornoAberto}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Registrar retorno de consignação — {nome}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    {retornoItens.map((l, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <div className="space-y-1 flex-1">
                          {i === 0 && <Label className="text-xs">SKU</Label>}
                          <Input
                            list="skus-em-poder-retorno"
                            value={l.sku}
                            onChange={(e) =>
                              setRetornoItens((p) => p.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div className="space-y-1 w-28">
                          {i === 0 && <Label className="text-xs">Qtd</Label>}
                          <Input
                            type="number"
                            min="0"
                            value={l.quantidade}
                            onChange={(e) =>
                              setRetornoItens((p) => p.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))
                            }
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRetornoItens((p) => (p.length === 1 ? p : p.filter((_, j) => j !== i)))}
                          title="Remover linha"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <datalist id="skus-em-poder-retorno">
                      {(estoqueParceiroQ.data ?? []).map((e) => (
                        <option key={e.sku ?? ""} value={e.sku ?? ""}>
                          {`${e.produto ?? ""} · saldo ${num(e.saldo)}`}
                        </option>
                      ))}
                    </datalist>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRetornoItens((p) => [...p, { sku: "", quantidade: "" }])}
                    >
                      <Plus className="h-4 w-4" /> Linha
                    </Button>
                    <div className="space-y-1">
                      <Label htmlFor="retorno-doc">Documento</Label>
                      <Input id="retorno-doc" value={retornoDoc} onChange={(e) => setRetornoDoc(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="retorno-obs">Observação</Label>
                      <Textarea id="retorno-obs" value={retornoObs} onChange={(e) => setRetornoObs(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button disabled={registrarRetorno.isPending} onClick={() => registrarRetorno.mutate()}>
                      {registrarRetorno.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Registrar retorno
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </section>
          )}
        </TabsContent>}
      </Tabs>
      {/* ═══ IMPORTAR RELATÓRIO DO PARCEIRO ═══ */}
      <Dialog open={importAberto} onOpenChange={(o) => (o ? setImportAberto(true) : fecharImport())}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar relatório de vendas — {nome}</DialogTitle>
          </DialogHeader>

          {!previa ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={importModo === "pdf" ? "secondary" : "ghost"}
                  onClick={() => setImportModo("pdf")}
                >
                  Do PDF
                </Button>
                <Button
                  size="sm"
                  variant={importModo === "texto" ? "secondary" : "ghost"}
                  onClick={() => setImportModo("texto")}
                >
                  Colar texto
                </Button>
              </div>

              {importModo === "pdf" ? (
                <div className="space-y-2 rounded-md border border-dashed p-4">
                  <Label htmlFor="import-arquivo" className="text-xs">Relatório do parceiro (PDF ou imagem)</Label>
                  <Input
                    id="import-arquivo"
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setImportArquivo(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    A IA lê só código e quantidade vendida. Nada é gravado até você confirmar a importação na prévia.
                  </p>
                  <Button
                    size="sm"
                    disabled={!importArquivo || lerPdf.isPending || analisar.isPending}
                    onClick={() => lerPdf.mutate()}
                  >
                    {(lerPdf.isPending || analisar.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                    {lerPdf.isPending ? "Lendo o arquivo..." : analisar.isPending ? "Analisando..." : "Ler arquivo"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="import-texto">Relatório colado</Label>
                  <Textarea
                    id="import-texto"
                    className="min-h-[16rem] font-mono text-xs"
                    value={importTexto}
                    onChange={(e) => setImportTexto(e.target.value)}
                    placeholder={
                      "Uma linha por item: código e quantidade.\n" +
                      "O código pode ser o SKU completo ou o código curto do parceiro (ex: 01846).\n" +
                      "Aceita tabulação, espaços ou ponto-e-vírgula — pode colar direto da planilha.\n\n" +
                      "01846\t12\n01847;3\nLUM-VELA-0 5"
                    }
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label htmlFor="periodo-inicio" className="text-xs">Período apurado — início</Label>
                  <Input
                    id="periodo-inicio"
                    type="date"
                    className="w-44"
                    value={periodoInicio}
                    onChange={(e) => setPeriodoInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="periodo-fim" className="text-xs">Período apurado — fim</Label>
                  <Input
                    id="periodo-fim"
                    type="date"
                    className="w-44"
                    value={periodoFim}
                    onChange={(e) => setPeriodoFim(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O ciclo do parceiro não é mês-calendário — as datas são opcionais.
              </p>
              {importModo === "texto" && (
                <DialogFooter>
                  <Button disabled={analisar.isPending || !importTexto.trim()} onClick={() => analisar.mutate(undefined)}>
                    {analisar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Analisar
                  </Button>
                </DialogFooter>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {origemPdf && (
                <p className="text-xs text-muted-foreground">
                  Linhas lidas por IA a partir de {origemPdf}. Confira antes de importar.
                </p>
              )}
              <div className="rounded-md border max-h-[24rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código informado</TableHead>
                      <TableHead>SKU resolvido</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Disponível</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(previa.linhas ?? []).map((l, i) => (
                      <TableRow
                        key={`${l.codigo_informado ?? "sem-codigo"}-${i}`}
                        className={cn(l.diag !== "ok" && "bg-destructive/10")}
                      >
                        <TableCell className="font-mono text-xs">{l.codigo_informado ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                        <TableCell className="text-sm">{l.descricao ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(l.quantidade)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(l.valor_unitario)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(l.disponivel)}</TableCell>
                        <TableCell className="text-xs">
                          {l.diag ? MSG_DIAG[l.diag] ?? l.diag : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm tabular-nums">
                  {num(previa.n_linhas)} itens · Total {formatBRL(previa.valor_total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  O preço vem da NF de remessa — não é editável aqui.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPrevia(null)}>
                  Voltar
                </Button>
                <Button
                  disabled={previa.pronto !== true || importarPrevia.isPending}
                  onClick={() => importarPrevia.mutate()}
                >
                  {importarPrevia.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {`Importar ${num(previa.n_linhas)} itens — ${formatBRL(previa.valor_total)}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Arbitrar limite — a RPC é guardada por acao.credito_decidir */}
      <Dialog open={arbitrarAberto} onOpenChange={setArbitrarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arbitrar limite da conta corrente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="arb-limite">Limite (R$)</Label>
              <Input
                id="arb-limite"
                type="number"
                inputMode="decimal"
                value={arbLimite}
                onChange={(e) => setArbLimite(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arb-validade">Validade</Label>
              <Input id="arb-validade" type="date" value={arbValidade} onChange={(e) => setArbValidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arb-parecer">Parecer</Label>
              <Textarea id="arb-parecer" value={arbParecer} onChange={(e) => setArbParecer(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArbitrarAberto(false)}>Cancelar</Button>
            <Button disabled={!arbLimite || arbitrarLimite.isPending} onClick={() => arbitrarLimite.mutate()}>
              {arbitrarLimite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Arbitrar limite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acerto de primeira classe — detalhe, anexo e liquidação manual */}
      <Dialog open={!!acertoAbertoId} onOpenChange={(o) => !o && setAcertoAbertoId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Acerto {acertoAberto?.numero ?? "—"}</DialogTitle>
          </DialogHeader>
          {acertoAberto && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Badge variant={acertoAberto.status === "rascunho" ? "outline" : "secondary"} className="text-[10px]">
                  {acertoAberto.status ?? "—"}
                </Badge>
                <span>Competência {formatDateBR(acertoAberto.competencia)}</span>
                {(acertoAberto.periodo_inicio || acertoAberto.periodo_fim) && (
                  <span>
                    Período apurado {formatDateBR(acertoAberto.periodo_inicio)} — {formatDateBR(acertoAberto.periodo_fim)}
                  </span>
                )}
                <span className="tabular-nums text-foreground">{formatBRL(acertoAberto.valor_total)}</span>
              </div>

              <div className="max-h-[45vh] overflow-auto rounded-md border">
                {itensAcertoQ.isError ? <ErroBloco error={itensAcertoQ.error} /> : itensAcertoQ.isLoading ? <Carregando /> : (itensAcertoQ.data ?? []).length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Sem itens neste acerto.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(itensAcertoQ.data ?? []).map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                          <TableCell className="text-sm">{it.descricao ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(it.quantidade)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(it.valor_unitario)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(it.valor_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Relatório do parceiro</p>
                {acertoAberto.relatorio_path ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={baixarRelatorio.isPending}
                    onClick={() => baixarRelatorio.mutate(acertoAberto.relatorio_path as string)}
                  >
                    {baixarRelatorio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Baixar relatório
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,.csv,.xls,.xlsx,application/pdf"
                      className="w-auto"
                      onChange={(e) => setArquivoAnexo(e.target.files?.[0] ?? null)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!arquivoAnexo || anexarRelatorio.isPending}
                      onClick={() => anexarRelatorio.mutate()}
                    >
                      {anexarRelatorio.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Anexar
                    </Button>
                  </div>
                )}
              </div>

              {acertoAberto.status === "confirmado" && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Marcar liquidado</p>
                  <p className="text-[11px] text-muted-foreground">
                    Caminho manual para quando o valor recebido não bateu exato.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="liq-data">Data</Label>
                      <Input id="liq-data" type="date" value={liqData} onChange={(e) => setLiqData(e.target.value)} className="w-auto" />
                    </div>
                    <div className="min-w-[14rem] flex-1 space-y-1.5">
                      <Label htmlFor="liq-nota">Nota</Label>
                      <Input id="liq-nota" value={liqNota} onChange={(e) => setLiqNota(e.target.value)} placeholder="opcional" />
                    </div>
                    <Button disabled={liquidarManual.isPending} onClick={() => liquidarManual.mutate()}>
                      {liquidarManual.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Marcar liquidado
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
