import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  CreditCard,
  Plus,
  Search,
  X,
  Eye,
  Printer,
  Trash2,
  Calculator,
  Globe,
  ArrowDownToLine,
  Receipt,
  Clock,
  Sparkles,
  ChevronRight,
  Link2,
  Info,
  Loader2,
} from "lucide-react";
import { exportarFaturaPDF } from "@/lib/exportar-fatura-cartao";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { ImportarFaturaCartaoDialog } from "@/components/financeiro/ImportarFaturaCartaoDialog";
import { AcoesLancamentoCartao } from "@/components/financeiro/AcoesLancamentoCartao";
import { descartarFatura } from "@/lib/financeiro/fatura-cartao-handler";
import {
  SortableTableHead,
  ordenarPor,
  type SortState,
} from "@/components/shared/SortableTableHead";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { CategoriaCombobox } from "@/components/financeiro/CategoriaCombobox";
import {
  useRegrasAtivas,
  sugerirNoClient,
  classificarComAprendizado,
  registrarCorrecao,
  type SugestaoResult,
} from "@/hooks/useEngineClassificacao";

type FaturaRow = {
  id: string;
  cartao_id: string;
  data_vencimento: string;
  data_emissao: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  valor_total: number;
  status: string;
  conta_pagar_id: string | null;
  pdf_storage_path: string | null;
  observacao: string | null;
  created_at: string;
  cartao?: { id: string; nome: string; bandeira: string | null; ultimos_digitos: string | null } | null;
  qtd_lancamentos?: number;
  qtd_pendentes?: number;
  qtd_conciliados?: number;
  qtd_ignorados?: number;
  valor_conciliado?: number;
  valor_pendente?: number;
  valor_ignorado?: number;
};

type LancamentoRow = {
  id: string;
  fatura_id: string;
  data_compra: string;
  descricao: string;
  valor: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  tipo: string;
  natureza: string;
  moeda: string | null;
  valor_original: number | null;
  cotacao: number | null;
  estabelecimento_local: string | null;
  ramo_estabelecimento: string | null;
  cnpj_estabelecimento: string | null;
  parceiro_id: string | null;
  categoria_id: string | null;
  status: string;
  nf_vinculada_id: string | null;
  conta_pagar_id?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  paga: "Paga",
  conciliada: "Conciliada",
  cancelada: "Cancelada",
};

const STATUS_STYLES: Record<string, string> = {
  aberta: "bg-amber-100 text-amber-800 border-amber-200",
  paga: "bg-blue-100 text-blue-800 border-blue-200",
  conciliada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelada: "bg-gray-100 text-gray-700 border-gray-200",
};

const TIPO_LANC_LABELS: Record<string, string> = {
  compra: "Compra",
  estorno: "Estorno",
  iof: "IOF",
  encargo: "Encargo",
  pagamento: "Pagamento",
  taxa: "Taxa",
  outro: "Outro",
};

type FiltroPill = "todas" | "aberta" | "paga" | "conciliada" | "cancelada";

export default function FaturasCartao() {
  const qc = useQueryClient();
  const [importarOpen, setImportarOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroPill, setFiltroPill] = useState<FiltroPill>("todas");
  const [filtroCartao, setFiltroCartao] = useState<string>("__todos__");
  const [faturaExpanded, setFaturaExpanded] = useState<string | null>(null);
  const [paraDescartar, setParaDescartar] = useState<FaturaRow | null>(null);
  const [exportandoPDF, setExportandoPDF] = useState<string | null>(null);

  async function handleExportarPDF(fatura: FaturaRow) {
    setExportandoPDF(fatura.id);
    try {
      await exportarFaturaPDF(fatura);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao gerar PDF: " + msg);
    } finally {
      setExportandoPDF(null);
    }
  }

  type SortColumn = "vencimento" | "cartao" | "valor" | "status" | "lancamentos";
  const [sort, setSort] = useState<SortState<SortColumn> | null>({
    column: "vencimento",
    direction: "desc",
  });

  // Cartões pra filtro + cards do topo
  const { data: cartoes = [] } = useQuery({
    queryKey: ["cartoes-credito-listagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, banco, dia_fechamento, dia_vencimento, limite_credito")
        .eq("tipo", "cartao_credito")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return data || [];
    },
  });

  // Comprometido por cartão (3 queries simples encadeadas)
  const { data: comprometidoMap = new Map<string, number>() } = useQuery({
    queryKey: ["cartoes-comprometido-v4"],
    queryFn: async () => {
      // 1) Todas as contas a pagar de cartão pendentes (não pagas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contas, error: errC } = await (supabase as any)
        .from("contas_pagar_receber_ativas")
        .select("id, valor, parcela_grupo_id")
        .eq("eh_cartao", true)
        .in("status", ["aberto", "aprovado", "aguardando_pagamento"]);
      if (errC) throw errC;
      if (!contas?.length) return new Map<string, number>();

      // 2) Lançamentos de cartão → mapa conta_id → fatura_id
      //    (busca TODAS as contas vinculadas a fatura, não só as pendentes,
      //     porque queremos propagar via parcela_grupo)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lancsTodos } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .select("conta_pagar_id, fatura_id")
        .not("conta_pagar_id", "is", null);

      const contaToFatura = new Map<string, string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lancsTodos || []).forEach((l: any) => {
        if (l.conta_pagar_id && l.fatura_id) {
          contaToFatura.set(l.conta_pagar_id, l.fatura_id);
        }
      });

      // 3) Faturas → conta_bancaria_id
      const faturaIds = Array.from(new Set(contaToFatura.values()));
      const faturaToConta = new Map<string, string>();
      if (faturaIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fats } = await (supabase as any)
          .from("faturas_cartao")
          .select("id, conta_bancaria_id")
          .in("id", faturaIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fats || []).forEach((f: any) => {
          if (f.conta_bancaria_id) faturaToConta.set(f.id, f.conta_bancaria_id);
        });
      }

      // 4) Construir grupoToConta — propaga: se 1 parcela do grupo está
      //    em fatura X (cartão Y), TODAS as parcelas do grupo são do cartão Y
      const grupoToConta = new Map<string, string>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: todasParcelas } = await (supabase as any)
        .from("contas_pagar_receber_ativas")
        .select("id, parcela_grupo_id")
        .eq("eh_cartao", true)
        .not("parcela_grupo_id", "is", null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (todasParcelas || []).forEach((p: any) => {
        if (!p.parcela_grupo_id) return;
        if (grupoToConta.has(p.parcela_grupo_id)) return;
        const fId = contaToFatura.get(p.id);
        if (!fId) return;
        const cbId = faturaToConta.get(fId);
        if (!cbId) return;
        grupoToConta.set(p.parcela_grupo_id, cbId);
      });

      // 5) Soma comprometido por cartão
      const map = new Map<string, number>();
      for (const c of contas) {
        let cbId: string | undefined;
        const fId = contaToFatura.get(c.id);
        if (fId) cbId = faturaToConta.get(fId);

        if (!cbId && c.parcela_grupo_id) {
          cbId = grupoToConta.get(c.parcela_grupo_id);
        }

        if (!cbId) continue;
        map.set(cbId, (map.get(cbId) || 0) + Number(c.valor || 0));
      }

      return map;
    },
  });

  // Faturas (view agregada com KPIs por fatura)
  const { data: faturas, isLoading } = useQuery({
    queryKey: ["faturas-cartao"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_faturas_cartao_resumo")
        .select(`
          *,
          conta_bancaria:conta_bancaria_id ( nome_exibicao, banco )
        `)
        .order("data_vencimento", { ascending: false });
      if (error) throw error;
      return (data || []) as FaturaRow[];
    },
  });

  // Lançamentos da fatura expandida
  const { data: lancamentosExpanded } = useQuery({
    queryKey: ["fatura-lancamentos", faturaExpanded],
    enabled: !!faturaExpanded,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .select("*")
        .eq("fatura_id", faturaExpanded)
        .order("data_compra", { ascending: true });
      if (error) throw error;
      return (data || []) as LancamentoRow[];
    },
  });

  // Engine Universal: carrega regras ativas (qualquer fonte alimenta esta base)
  const { data: regrasEngine } = useRegrasAtivas();

  // Helper: pega sugestão pra um lançamento usando o engine universal
  function obterSugestao(lanc: LancamentoRow): SugestaoResult | null {
    if (lanc.categoria_id) return null; // já classificado
    if (lanc.status === "descartado") return null;

    return sugerirNoClient(
      {
        descricao: lanc.descricao,
        cnpj: lanc.cnpj_estabelecimento,
        parceiro_id: lanc.parceiro_id,
        origem: "cartao",
      },
      regrasEngine,
    );
  }

  const { data: categorias = [] } = useCategoriasPlano();

  // Mapa categorias
  const mapCategorias = useMemo(() => {
    const m: Record<string, string> = {};
    (categorias || []).forEach((c: { id: string; codigo: string; nome: string }) => {
      m[c.id] = `${c.codigo} ${c.nome}`;
    });
    return m;
  }, [categorias]);

  const categoriasDespesa = useMemo(
    () =>
      (categorias || []).filter(
        (c: { codigo: string }) => !c.codigo.startsWith("01"),
      ),
    [categorias],
  );

  // KPIs — totais por mês de vencimento (atual / anterior)
  const totals = useMemo(() => {
    const all = faturas || [];
    const filtradas =
      filtroCartao !== "__todos__"
        ? all.filter((f) => f.conta_bancaria_id === filtroCartao)
        : all;

    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioMesSeguinte = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

    const calcular = (lista: typeof filtradas) => {
      const total = lista.reduce((s, f) => s + (f.valor_total || 0), 0);
      const vinculado = lista.reduce((s, f) => s + (f.valor_conciliado || 0), 0);
      // pega a fatura mais recente do mês (maior data_vencimento) pra "expandir"
      const principal =
        [...lista].sort((a, b) =>
          (b.data_vencimento || "").localeCompare(a.data_vencimento || ""),
        )[0] || null;
      return {
        qtd: lista.length,
        total,
        vinculado,
        naoVinculado: total - vinculado,
        faturaId: principal?.id || null,
        status: (principal?.status as string | undefined) || lista[0]?.status || null,
      };
    };

    const fatMesAtual = filtradas.filter((f) => {
      if (!f.data_vencimento) return false;
      const venc = new Date(f.data_vencimento);
      return venc >= inicioMesAtual && venc < inicioMesSeguinte;
    });

    const fatMesAnterior = filtradas.filter((f) => {
      if (!f.data_vencimento) return false;
      const venc = new Date(f.data_vencimento);
      return venc >= inicioMesAnterior && venc <= fimMesAnterior;
    });

    const faturaFocada = faturaExpanded
      ? all.find((x) => x.id === faturaExpanded) || null
      : null;

    return {
      mesAtual: calcular(fatMesAtual),
      mesAnterior: calcular(fatMesAnterior),
      modoFocado: !!faturaFocada,
      faturaFocada,
    };
  }, [faturas, faturaExpanded, filtroCartao]);

  // Filtragem + Ordenação
  const filtered = useMemo(() => {
    let list = faturas || [];

    if (filtroPill !== "todas") {
      list = list.filter((f) => f.status === filtroPill);
    }
    if (filtroCartao !== "__todos__") {
      list = list.filter((f) => f.conta_bancaria_id === filtroCartao);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter(
        (f) =>
          f.conta_bancaria?.nome_exibicao?.toLowerCase().includes(t) ||
          f.observacao?.toLowerCase().includes(t),
      );
    }

    list = ordenarPor(list, sort, {
      vencimento: (f) => f.data_vencimento || "",
      cartao: (f) => f.conta_bancaria?.nome_exibicao || "",
      valor: (f) => f.valor_total || 0,
      status: (f) => f.status || "",
      lancamentos: (f) => f.qtd_lancamentos || 0,
    });

    return list;
  }, [faturas, filtroPill, filtroCartao, busca, sort]);

  async function handleDescartarConfirmado() {
    if (!paraDescartar) return;
    try {
      await descartarFatura(paraDescartar.id);
      toast.success("Fatura descartada");
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
      setParaDescartar(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    }
  }

  async function visualizarPDF(fatura: FaturaRow) {
    if (!fatura.pdf_storage_path) {
      toast.error("Sem arquivo anexado");
      return;
    }
    const { data } = await supabase.storage
      .from("faturas-cartao")
      .createSignedUrl(fatura.pdf_storage_path, 60 * 5);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Falha ao gerar link");
    }
  }

  async function alterarCategoriaLanc(lancId: string, categoriaId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("fatura_cartao_lancamentos")
        .update({
          categoria_id: categoriaId || null,
          // status do lançamento NÃO muda ao classificar — categorização é dimensão separada
        })
        .eq("id", lancId);
      if (error) throw error;

      // Engine Universal: aprende com a classificação manual
      if (categoriaId) {
        const lanc = lancamentosExpanded?.find((l) => l.id === lancId);
        if (lanc) {
          await classificarComAprendizado({
            descricao: lanc.descricao,
            cnpj: lanc.cnpj_estabelecimento,
            parceiro_id: lanc.parceiro_id,
            categoria_id: categoriaId,
            origem: "cartao",
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["fatura-lancamentos", faturaExpanded] });
      qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
      qc.invalidateQueries({ queryKey: ["engine-regras-ativas"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    }
  }

  // Aplicar todas as sugestões disponíveis na fatura expandida
  async function aplicarTodasSugestoes() {
    if (!lancamentosExpanded) return;
    const lancsParaAplicar = lancamentosExpanded
      .map((l) => ({ l, sug: obterSugestao(l) }))
      .filter((x) => x.sug !== null);

    if (lancsParaAplicar.length === 0) {
      toast.info("Nenhuma sugestão automática disponível");
      return;
    }

    if (
      !confirm(
        `Aplicar sugestão automática em ${lancsParaAplicar.length} lançamento${lancsParaAplicar.length === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }

    let ok = 0;
    for (const { l, sug } of lancsParaAplicar) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("fatura_cartao_lancamentos")
          .update({
            categoria_id: sug!.categoria_id,
            // status NÃO muda ao classificar — categorização é dimensão separada
          })
          .eq("id", l.id);
        if (!error) {
          ok++;
          // aplicar aprendizado em background pra cada um
          await classificarComAprendizado({
            descricao: l.descricao,
            cnpj: l.cnpj_estabelecimento,
            parceiro_id: l.parceiro_id,
            categoria_id: sug!.categoria_id,
            origem: "cartao",
          });
        }
      } catch {
        // ignora individual
      }
    }

    qc.invalidateQueries({ queryKey: ["fatura-lancamentos", faturaExpanded] });
    qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
    qc.invalidateQueries({ queryKey: ["engine-regras-ativas"] });
    toast.success(`${ok} sugestão${ok === 1 ? "" : "ões"} aplicada${ok === 1 ? "" : "s"}`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER FIXO */}
      <div className="px-6 pt-6 pb-3 border-b bg-background/95 backdrop-blur sticky top-0 z-20 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-admin" />
              Faturas de Cartão
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Importe faturas, classifique lançamentos e acompanhe o ciclo de pagamento.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setImportarOpen(true)}
              className="gap-2 bg-admin hover:bg-admin-accent text-admin-foreground"
            >
              <Plus className="h-4 w-4" />
              Importar Fatura
            </Button>
          </div>
        </div>

        {/* KPIs financeiros agregados */}
        {totals.modoFocado && totals.faturaFocada && (
          <div className="flex items-center justify-between text-xs px-1 -mb-1">
            <div className="text-amber-700 font-medium">
              📌 Mostrando dados de:{" "}
              <span className="font-semibold">
                {totals.faturaFocada.conta_bancaria?.nome_exibicao || "fatura"}
              </span>
              {" — venc "}
              {formatDateBR(totals.faturaFocada.data_vencimento)}
            </div>
            <button
              type="button"
              onClick={() => setFaturaExpanded(null)}
              className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Voltar à visão geral
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* CARDS DOS CARTÕES — clique filtra (oculta Safra) */}
          {cartoes
            .filter(
              (c) => !(c.banco || "").toLowerCase().includes("safra") &&
                     !(c.nome_exibicao || "").toLowerCase().includes("safra"),
            )
            .map((cartao) => {
              const comprometido = comprometidoMap.get(cartao.id) || 0;
              const limite = cartao.limite_credito || 0;
              const disponivel = limite - comprometido;
              const percentUsado = limite > 0 ? (comprometido / limite) * 100 : 0;
              const ativo = filtroCartao === cartao.id;

              return (
                <Card key={cartao.id} className="transition bg-card">

                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-admin shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {cartao.nome_exibicao}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {cartao.banco}
                          {cartao.dia_fechamento &&
                            ` · Fecha dia ${cartao.dia_fechamento}`}
                          {cartao.dia_vencimento &&
                            ` · Vence dia ${cartao.dia_vencimento}`}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Limite
                        </div>
                        <div className="text-xs font-semibold font-mono">
                          {formatBRL(limite)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Comprometido
                        </div>
                        <div className="text-xs font-semibold font-mono text-amber-700">
                          {formatBRL(comprometido)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Disponível
                        </div>
                        <div className="text-xs font-semibold font-mono text-emerald-700">
                          {formatBRL(disponivel)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            percentUsado > 90
                              ? "bg-red-500"
                              : percentUsado > 70
                                ? "bg-amber-500"
                                : "bg-emerald-500",
                          )}
                          style={{ width: `${Math.min(100, percentUsado)}%` }}
                        />
                      </div>
                      <div className="text-[9px] text-muted-foreground mt-1">
                        {percentUsado.toFixed(0)}% usado
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

          {/* CARD FATURA MÊS ATUAL */}
          <Card
            className={cn(
              "bg-amber-50/50 border-amber-200 transition",
              totals.mesAtual.faturaId &&
                "cursor-pointer hover:shadow-md hover:border-amber-400",
              totals.mesAtual.faturaId &&
                faturaExpanded === totals.mesAtual.faturaId &&
                "ring-2 ring-amber-400",
            )}
            onClick={() => {
              if (!totals.mesAtual.faturaId) return;
              setFaturaExpanded(
                faturaExpanded === totals.mesAtual.faturaId
                  ? null
                  : totals.mesAtual.faturaId,
              );
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📑</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Fatura mês atual</span>
                    {totals.mesAtual.status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase",
                          totals.mesAtual.status === "paga" && "bg-emerald-50 text-emerald-700 border-emerald-300",
                          totals.mesAtual.status === "aberta" && "bg-amber-50 text-amber-700 border-amber-300",
                          totals.mesAtual.status === "conciliada" && "bg-blue-50 text-blue-700 border-blue-300",
                          totals.mesAtual.status === "cancelada" && "bg-zinc-50 text-zinc-600 border-zinc-300"
                        )}
                      >
                        {totals.mesAtual.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date().toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric",
                    })}
                    {" · "}
                    {totals.mesAtual.qtd}{" "}
                    {totals.mesAtual.qtd === 1 ? "fatura" : "faturas"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Total
                  </div>
                  <div className="text-sm font-bold">
                    {formatBRL(totals.mesAtual.total)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Vinculado
                  </div>
                  <div className="text-sm font-bold text-emerald-700">
                    {formatBRL(totals.mesAtual.vinculado)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Falta
                  </div>
                  <div className="text-sm font-bold text-red-700">
                    {formatBRL(totals.mesAtual.naoVinculado)}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${
                        totals.mesAtual.total > 0
                          ? (totals.mesAtual.vinculado / totals.mesAtual.total) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {totals.mesAtual.total > 0
                    ? (
                        (totals.mesAtual.vinculado / totals.mesAtual.total) *
                        100
                      ).toFixed(0)
                    : 0}
                  % vinculado
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD FATURA MÊS ANTERIOR */}
          <Card
            className={cn(
              "bg-zinc-50 border-zinc-200 transition",
              totals.mesAnterior.faturaId &&
                "cursor-pointer hover:shadow-md hover:border-zinc-400",
              totals.mesAnterior.faturaId &&
                faturaExpanded === totals.mesAnterior.faturaId &&
                "ring-2 ring-zinc-400",
            )}
            onClick={() => {
              if (!totals.mesAnterior.faturaId) return;
              setFaturaExpanded(
                faturaExpanded === totals.mesAnterior.faturaId
                  ? null
                  : totals.mesAnterior.faturaId,
              );
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🗂</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Fatura mês anterior</span>
                    {totals.mesAnterior.status && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase",
                          totals.mesAnterior.status === "paga" && "bg-emerald-50 text-emerald-700 border-emerald-300",
                          totals.mesAnterior.status === "aberta" && "bg-amber-50 text-amber-700 border-amber-300",
                          totals.mesAnterior.status === "conciliada" && "bg-blue-50 text-blue-700 border-blue-300",
                          totals.mesAnterior.status === "cancelada" && "bg-zinc-50 text-zinc-600 border-zinc-300"
                        )}
                      >
                        {totals.mesAnterior.status}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() - 1);
                      return d.toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      });
                    })()}
                    {" · "}
                    {totals.mesAnterior.qtd}{" "}
                    {totals.mesAnterior.qtd === 1 ? "fatura" : "faturas"}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Total
                  </div>
                  <div className="text-sm font-bold">
                    {formatBRL(totals.mesAnterior.total)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Vinculado
                  </div>
                  <div className="text-sm font-bold text-emerald-700">
                    {formatBRL(totals.mesAnterior.vinculado)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">
                    Falta
                  </div>
                  <div className="text-sm font-bold text-red-700">
                    {formatBRL(totals.mesAnterior.naoVinculado)}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${
                        totals.mesAnterior.total > 0
                          ? (totals.mesAnterior.vinculado /
                              totals.mesAnterior.total) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {totals.mesAnterior.total > 0
                    ? (
                        (totals.mesAnterior.vinculado /
                          totals.mesAnterior.total) *
                        100
                      ).toFixed(0)
                    : 0}
                  % vinculado
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros + busca */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[280px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cartão ou observação..."
              className="pl-9"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            <Calculator className="h-3.5 w-3.5" />
            <span>
              <strong className="text-foreground">{filtered.length}</strong> fatura{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* TABELA */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              {faturas?.length === 0
                ? "Nenhuma fatura importada ainda. Clique em \"Importar Fatura\" para começar."
                : "Nenhuma fatura encontrada com esses filtros."}
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <SortableTableHead column="cartao" sort={sort} onSort={setSort}>
                    Cartão
                  </SortableTableHead>
                  <SortableTableHead
                    column="valor"
                    sort={sort}
                    onSort={setSort}
                    className="w-32"
                    align="right"
                  >
                    Valor Total
                  </SortableTableHead>
                  <TableHead className="whitespace-nowrap">Resumo</TableHead>
                  <SortableTableHead
                    column="lancamentos"
                    sort={sort}
                    onSort={setSort}
                    className="w-36 text-center"
                    align="center"
                  >
                    Lançamentos
                  </SortableTableHead>
                  <SortableTableHead
                    column="vencimento"
                    sort={sort}
                    onSort={setSort}
                    className="w-32"
                  >
                    Vencimento
                  </SortableTableHead>
                  <TableHead className="w-44">Período</TableHead>
                  <SortableTableHead
                    column="status"
                    sort={sort}
                    onSort={setSort}
                    className="w-28"
                  >
                    Status
                  </SortableTableHead>
                  <TableHead className="w-24 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => {
                  const isExpanded = faturaExpanded === f.id;
                  return (
                    <>
                      <TableRow
                        key={f.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() =>
                          setFaturaExpanded(isExpanded ? null : f.id)
                        }
                      >
                        <TableCell>
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {f.conta_bancaria?.nome_exibicao || "—"}
                          </div>
                          {f.conta_bancaria?.banco && (
                            <div className="text-[10px] text-muted-foreground">
                              {f.conta_bancaria.banco}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="font-mono text-base font-semibold">{formatBRL(f.valor_total)}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {(f.qtd_conciliados || 0) > 0 && (
                            <div className="text-emerald-700">
                              Conciliado: <span className="font-mono">{formatBRL(f.valor_conciliado || 0)}</span>
                            </div>
                          )}
                          {(f.qtd_pendentes || 0) > 0 && (
                            <div className="text-amber-700">
                              Pendente: <span className="font-mono">{formatBRL(f.valor_pendente || 0)}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="text-base font-semibold">{f.qtd_lancamentos || 0}</div>
                            {(f.qtd_pendentes || 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 px-1 h-4 border-amber-300 text-amber-700"
                              >
                                {f.qtd_pendentes} pend
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateBR(f.data_vencimento)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {f.periodo_inicio && f.periodo_fim
                            ? `${formatDateBR(f.periodo_inicio)} → ${formatDateBR(f.periodo_fim)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_STYLES[f.status]}>
                            {STATUS_LABELS[f.status] || f.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div
                            className="flex items-center justify-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportarPDF(f);
                              }}
                              disabled={exportandoPDF === f.id}
                              title="Baixar extrato em PDF"
                            >
                              {exportandoPDF === f.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {f.pdf_storage_path && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => visualizarPDF(f)}
                                title="Ver PDF"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setParaDescartar(f)}
                              title="Descartar fatura"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Linha expandida com lançamentos */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={9} className="bg-muted/20 p-0">
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold flex items-center gap-2">
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                  Lançamentos detalhados
                                </p>
                                {(() => {
                                  if (!lancamentosExpanded) return null;
                                  const qtdSug = lancamentosExpanded.filter(
                                    (l) => obterSugestao(l) !== null,
                                  ).length;
                                  if (qtdSug === 0) return null;
                                  return (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        aplicarTodasSugestoes();
                                      }}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      Aplicar {qtdSug} sugestão{qtdSug === 1 ? "" : "ões"} automática{qtdSug === 1 ? "" : "s"}
                                    </Button>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2 px-1 py-1 rounded bg-muted/40 border border-dashed">
                                <Info className="h-3 w-3 shrink-0" />
                                <span>
                                  Lançamentos sem categoria serão classificados automaticamente na reconciliação com NF.
                                </span>
                              </div>
                              {!lancamentosExpanded ? (
                                <Skeleton className="h-32 w-full" />
                              ) : lancamentosExpanded.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                  Sem lançamentos detalhados.
                                </p>
                              ) : (
                                <div className="rounded border bg-background overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-muted-foreground">
                                      <tr>
                                        <th className="text-left px-2 py-1.5 font-normal">Data</th>
                                        <th className="text-left px-2 py-1.5 font-normal">Descrição</th>
                                        <th className="text-right px-2 py-1.5 font-normal">Valor</th>
                                        <th className="text-center px-2 py-1.5 font-normal w-[110px]">
                                          Ações
                                        </th>
                                        <th className="text-left px-2 py-1.5 font-normal w-[180px]">
                                          Categoria
                                        </th>
                                        <th className="text-center px-2 py-1.5 font-normal">Tipo</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lancamentosExpanded.map((l) => (
                                        <tr key={l.id} className="border-t">
                                          <td className="px-2 py-1.5 whitespace-nowrap text-[10px]">
                                            {formatDateBR(l.data_compra)}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            <div className="flex items-center gap-1">
                                              <span className="truncate" title={l.descricao}>
                                                {l.descricao}
                                              </span>
                                              {l.parcela_atual && l.parcela_total && (
                                                <Badge
                                                  variant="outline"
                                                  className="text-[9px] py-0 px-1 h-4"
                                                >
                                                  {l.parcela_atual}/{l.parcela_total}
                                                </Badge>
                                              )}
                                              {l.natureza === "INTERNACIONAL" && (
                                                <Globe className="h-3 w-3 text-blue-600" />
                                              )}
                                            </div>
                                            {l.natureza === "INTERNACIONAL" &&
                                              l.valor_original && (
                                                <div className="text-[9px] text-muted-foreground">
                                                  {l.moeda} {l.valor_original?.toFixed(2)} ×{" "}
                                                  {l.cotacao?.toFixed(2)}
                                                </div>
                                              )}
                                          </td>
                                          <td
                                            className={`px-2 py-1.5 text-right font-mono whitespace-nowrap ${
                                              l.valor < 0 ? "text-emerald-700" : ""
                                            }`}
                                          >
                                            {formatBRL(l.valor)}
                                           </td>
                                           <td className="px-2 py-1.5 text-center">
                                             <AcoesLancamentoCartao
                                               lancamento={{
                                                 id: l.id,
                                                 descricao: l.descricao,
                                                 valor: l.valor,
                                                 data_compra: l.data_compra,
                                                 status: l.status,
                                                 conta_pagar_id: l.conta_pagar_id,
                                               }}
                                             />

                                           </td>
                                           <td className="px-2 py-1.5">
                                            <div className="flex items-center gap-1">
                                              <div className="flex-1 min-w-[160px] [&_button]:h-7 [&_button]:text-[10px]">
                                                <CategoriaCombobox
                                                  options={categoriasDespesa}
                                                  value={l.categoria_id || null}
                                                  onChange={(id) =>
                                                    id &&
                                                    alterarCategoriaLanc(
                                                      l.id,
                                                      id,
                                                    )
                                                  }
                                                  placeholder="Definir..."
                                                />
                                              </div>
                                              {(() => {
                                                const sug = obterSugestao(l);
                                                if (!sug) return null;
                                                return (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[9px] gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 px-1.5 shrink-0"
                                                    onClick={() =>
                                                      alterarCategoriaLanc(l.id, sug.categoria_id)
                                                    }
                                                    title={`${mapCategorias[sug.categoria_id]} (${sug.motivo})`}
                                                  >
                                                    <Sparkles className="h-3 w-3" />
                                                    Sugerir
                                                  </Button>
                                                );
                                              })()}
                                            </div>
                                          </td>
                                          <td className="px-2 py-1.5 text-center">
                                            <Badge
                                              variant="outline"
                                              className={
                                                "text-[9px] py-0 px-1 h-4 " +
                                                (l.tipo === "estorno"
                                                  ? "border-emerald-300 text-emerald-700"
                                                  : l.tipo === "iof"
                                                    ? "border-amber-300 text-amber-700"
                                                    : l.tipo === "pagamento"
                                                      ? "border-blue-300 text-blue-700"
                                                      : "")
                                              }
                                            >
                                              {TIPO_LANC_LABELS[l.tipo] || l.tipo}
                                            </Badge>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ImportarFaturaCartaoDialog
        open={importarOpen}
        onOpenChange={setImportarOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["faturas-cartao"] });
        }}
      />

      <AlertDialog
        open={paraDescartar !== null}
        onOpenChange={(v) => !v && setParaDescartar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a descartar a fatura de{" "}
              <strong>{paraDescartar?.conta_bancaria?.nome_exibicao}</strong> com vencimento em{" "}
              <strong>{paraDescartar && formatDateBR(paraDescartar.data_vencimento)}</strong>.
              <br /><br />
              Isso vai remover:
              <ul className="list-disc pl-5 mt-1 text-xs">
                <li>A fatura</li>
                <li>{paraDescartar?.qtd_lancamentos || 0} lançamento(s) detalhado(s)</li>
                <li>A conta a pagar vinculada (se ainda não foi paga)</li>
                <li>O PDF anexado</li>
              </ul>
              <br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDescartarConfirmado();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ====== KpiPill (mesmo padrão do NFsStage) ======
interface KpiPillProps {
  label: string;
  count: number;
  color: "admin" | "amber" | "emerald" | "blue" | "gray";
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  description?: string;
}

function KpiPill({ label, count, color, active, onClick, icon, description }: KpiPillProps) {
  const colorMap: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
    admin: {
      bg: "bg-admin/5",
      text: "text-admin",
      border: "border-admin/20",
      activeBg: "bg-red-50 text-red-700 border-red-300",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      activeBg: "bg-amber-50 text-amber-700 border-amber-300",
    },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      activeBg: "bg-emerald-50 text-emerald-700 border-emerald-300",
    },
    blue: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      activeBg: "bg-blue-50 text-blue-700 border-blue-300",
    },
    gray: {
      bg: "bg-gray-50",
      text: "text-gray-700",
      border: "border-gray-200",
      activeBg: "bg-gray-100 text-gray-800 border-gray-400",
    },
  };
  const c = colorMap[color];
  const cls = active
    ? `${c.activeBg} shadow-md`
    : `${c.bg} ${c.text} ${c.border} hover:shadow-sm`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border-2 px-3 py-2 transition-all text-left min-w-[120px] ${cls}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide opacity-90">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold leading-tight mt-0.5">{count}</div>
      {description && (
        <div className="text-[9px] opacity-75 mt-0.5">{description}</div>
      )}
    </button>
  );
}
