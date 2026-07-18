import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Layers,
  Search,
  Trash2,
  CheckCircle2,
  Clock,
  FileText,
  FileCheck,
  FileCode,
  Eye,
  Sparkles,
  Calculator,
  Package,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FilePlus2,
  RefreshCw,
  Loader2,
  FolderOpen,
  Copy,
  FileWarning,
  MoreHorizontal,
  Wand2,
  Send,

} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { descartarStage } from "@/lib/financeiro/stage-handler";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
import { useCentrosCusto } from "@/hooks/financeiro/useCentrosCusto";
import { CategoriaCombobox } from "@/components/financeiro/CategoriaCombobox";
import { gerarResumoNFe, regerarResumoNFe } from "@/lib/financeiro/gerar-resumo-nfe";
import {
  classificarComAprendizado,
  useRegrasAtivas,
  sugerirNoClient,
  type SugestaoResult,
} from "@/hooks/useEngineClassificacao";
import {
  SortableTableHead,
  ordenarPor,
  type SortState,
} from "@/components/shared/SortableTableHead";

type StageDocumento = {
  id: string;
  tipo: "xml" | "pdf_danfe" | "pdf_boleto";
  storage_path: string;
  arquivo_nome: string | null;
  linha_digitavel: string | null;
  criado_em: string;
};

type NFStage = {
  id: string;
  fonte: string;
  fornecedor_cnpj: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  nf_numero: string | null;
  nf_data_emissao: string | null;
  valor: number;
  descricao: string | null;
  plano_contas_id: string | null;
  centro_custo_id: string | null;
  categoria_sugerida_ia?: boolean | null;
  data_vencimento: string | null;
  status: string;
  conta_pagar_existente_id: string | null;
  match_score: number | null;
  importacao_lote_id: string | null;
  created_at: string;
  resumo_pdf_pendente?: boolean | null;
  resumo_pdf_gerado_em?: string | null;
  resumo_pdf_storage_path?: string | null;
  tipo_documento?: string | null;
  numero_parcela?: number | null;
  total_parcelas?: number | null;
  revisada_em?: string | null;
  revisada_por?: string | null;
  revisao_origem?: string | null;
  motivo_descarte?: string | null;
  meio_pagamento?: string | null;
  conta_pagar_id?: string | null;
  completude?: string | null;
  // Flags vindos da view vw_nfs_stage_completude
  tem_xml: boolean;
  tem_pdf: boolean;
  tem_boleto: boolean;
  qtd_boletos: number | null;
  documentos: StageDocumento[] | null;
  itens: Array<{
    codigo_produto?: string;
    descricao?: string;
    ncm?: string;
    cfop?: string;
    unidade?: string;
    quantidade?: number;
    valor_unitario?: number;
    valor_total?: number;
  }> | null;
};

const STATUS_LABELS: Record<string, string> = {
  nao_vinculada: "Não vinculada",
  parcial: "Parcial",
  vinculada: "Vinculada",
};

const STATUS_STYLES: Record<string, string> = {
  nao_vinculada: "bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200",
  parcial: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200",
  vinculada: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200",
};

const FONTE_LABELS: Record<string, string> = {
  pdf_nfe: "PDF DANFE",
  xml_nfe: "XML NF-e",
  csv_qive: "CSV Qive",
};

// DocIndicator: bolinha verde (tem) / rosa (não tem). Verde=ok, vermelho=não ok.
function DocIndicator({ label, tem }: { label: string; tem: boolean }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          tem ? "bg-emerald-500" : "bg-rose-500",
        )}
      />
      <span className={tem ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

type FiltroPill =
  | "todas"
  | "a_revisar"
  | "nao_vinculadas"
  | "vinculadas"
  | "incompletas"
  | "docs_incompletos"
  | "descartadas"
  | "motor";

function mesKeyDeNf(nf: NFStage): string | null {
  const d = nf.nf_data_emissao || nf.created_at;
  if (!d) return null;
  return d.slice(0, 7); // YYYY-MM
}

function labelMes(mesKey: string): string {
  const [ano, mes] = mesKey.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = parseInt(mes, 10) - 1;
  return `${nomes[idx] || mes}/${ano.slice(2)}`;
}

export default function NFsStage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtroPill, setFiltroPill] = useState<FiltroPill>("a_revisar");
  const [mesFiltro, setMesFiltro] = useState<string | null>(null);
  // Índice do fim da janela de 12 meses (aponta pro último mês visível dentro de chartData). null = default (mais recentes)
  const [chartWindowEnd, setChartWindowEnd] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [paraDescartar, setParaDescartar] = useState<NFStage[]>([]);
  const [aplicarFonte, setAplicarFonte] = useState<NFStage | null>(null);
  const [aplicandoClassificacao, setAplicandoClassificacao] = useState(false);
  const [salvandoCategoria, setSalvandoCategoria] = useState<Set<string>>(new Set());
  const [salvandoCentroCusto, setSalvandoCentroCusto] = useState<Set<string>>(new Set());
  const [confirmandoRevisao, setConfirmandoRevisao] = useState(false);
  const [reaplicandoRegras, setReaplicandoRegras] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [gerandoResumo, setGerandoResumo] = useState<Set<string>>(new Set());
  const [classificandoIA, setClassificandoIA] = useState(false);
  const [uniformizarOpen, setUniformizarOpen] = useState(false);
  const [uniformizarEscolha, setUniformizarEscolha] = useState<string | null>(null);
  const [uniformizando, setUniformizando] = useState(false);
  // IDs que foram carimbadas como revisadas nesta sessão de filtro "A revisar".
  // Mantém a linha visível para o usuário ver o feedback de progresso.
  // É limpa ao trocar de pill, mês, busca ou recarregar a página.
  const [resolvidasNaSessao, setResolvidasNaSessao] = useState<Set<string>>(new Set());
  const [propagacaoSugerida, setPropagacaoSugerida] = useState<{
    fonte: NFStage;
    irmas: NFStage[];
    campo: "categoria" | "centro";
  } | null>(null);

  // Limpa o Set quando filtro/busca/mês mudam.
  useEffect(() => {
    setResolvidasNaSessao(new Set());
  }, [filtroPill, mesFiltro, busca]);

  function marcarResolvidasNaSessao(ids: string[]) {
    if (ids.length === 0) return;
    setResolvidasNaSessao((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  async function classificarComIA() {
    setClassificandoIA(true);
    try {
      const resp = await supabase.functions.invoke("classificar-nfs-ia", { body: {} });
      if (resp.error) throw new Error(resp.error.message);
      const resultado = resp.data as {
        classificadas: number;
        erros: string[];
        cnpjs_processados: number;
      };
      toast.success(
        `IA classificou ${resultado.classificadas} NFs (${resultado.cnpjs_processados} fornecedores)`,
      );
      if (resultado.erros?.length > 0) {
        console.warn("Erros na classificação:", resultado.erros);
      }
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    } catch (e) {
      toast.error("Erro na classificação: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setClassificandoIA(false);
    }
  }

  const handleGerarResumo = async (nf: NFStage, regerar: boolean) => {
    if (regerar) {
      const ok = window.confirm(
        "Substituir resumo NF-e existente? O PDF anterior será removido.",
      );
      if (!ok) return;
    }
    setGerandoResumo((s) => new Set(s).add(nf.id));
    try {
      const res = regerar ? await regerarResumoNFe(nf.id) : await gerarResumoNFe(nf.id);
      if (res.ok) {
        toast.success("Resumo NFe gerado e anexado");
        qc.invalidateQueries({ queryKey: ["nfs_stage"] });
        qc.invalidateQueries({ queryKey: ["documentos_envio_agrupados"] });
      } else {
        toast.error(`Falha na geração — registrado para revisão${res.erro ? `: ${res.erro}` : ""}`);
      }
    } finally {
      setGerandoResumo((s) => {
        const n = new Set(s);
        n.delete(nf.id);
        return n;
      });
    }
  };

  function toggleExpandir(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  type SortColumn = "fornecedor" | "nf" | "data" | "valor" | "categoria" | "status";
  const [sort, setSort] = useState<SortState<SortColumn> | null>(null);

  const { data: categorias = [] } = useCategoriasPlano();
  const { data: centrosCusto = [] } = useCentrosCusto(true);

  const { data: nfs, isLoading } = useQuery({
    queryKey: ["nfs-stage"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_nfs_stage_completude")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NFStage[];
    },
  });

  const { data: pastaIdPorParceiro = new Map<string, string>() } = useQuery({
    queryKey: ["pastas-por-parceiro"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ged_pastas")
        .select("parceiro_id, id")
        .eq("ativa", true)
        .not("parceiro_id", "is", null);
      const m = new Map<string, string>();
      (data ?? []).forEach((p: { parceiro_id: string; id: string }) => {
        m.set(p.parceiro_id, p.id);
      });
      return m;
    },
  });

  // Contagem de despesas vinculadas por stage (modelo N:1: nfs_stage.conta_pagar_id).
  // Como cada NF aponta no máximo para 1 CPR, a contagem aqui é 0 ou 1.
  const { data: despesasPorStage = {} } = useQuery({
    queryKey: ["despesas-por-stage", nfs?.length || 0],
    enabled: (nfs?.length || 0) > 0,
    queryFn: async () => {
      const ids = (nfs || [])
        .filter((n) => n.status === "parcial")
        .map((n) => n.id);
      if (ids.length === 0) return {} as Record<string, number>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select("id, conta_pagar_id")
        .in("id", ids)
        .not("conta_pagar_id", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const k = (row as { id: string }).id;
        counts[k] = (counts[k] || 0) + 1;
      }
      return counts;
    },
  });

  // Filtro + Ordenação
  const filtered = useMemo(() => {
    let list = nfs || [];
    if (filtroPill === "todas") {
      list = list.filter((n) => n.status !== "descartada" && !n.motivo_descarte);
    } else if (filtroPill === "a_revisar") {
      list = list.filter(
        (n) =>
          n.status !== "descartada" &&
          !n.motivo_descarte &&
          (!n.revisada_em || resolvidasNaSessao.has(n.id)),
      );
    } else if (filtroPill === "nao_vinculadas") {
      list = list.filter((n) => n.status === "nao_vinculada");
    } else if (filtroPill === "vinculadas") {
      list = list.filter((n) => n.status === "vinculada");
    } else if (filtroPill === "descartadas") {
      list = list.filter((n) => n.status === "descartada");
    } else if (filtroPill === "incompletas") {
      list = list.filter(
        (n) => (!n.plano_contas_id || !n.centro_custo_id) && n.status !== "descartada",
      );
    } else if (filtroPill === "docs_incompletos") {
      list = list.filter(
        (n) => (n.completude || "") !== "completo" && n.status !== "descartada",
      );
    } else if (filtroPill === "motor") {
      list = list.filter(
        (n) =>
          !!n.revisada_em &&
          n.revisao_origem === "motor" &&
          n.status !== "descartada" &&
          !n.motivo_descarte,
      );
    }
    if (mesFiltro) {
      list = list.filter((n) => mesKeyDeNf(n) === mesFiltro);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      list = list.filter(
        (n) =>
          n.fornecedor_razao_social?.toLowerCase().includes(t) ||
          n.fornecedor_cliente?.toLowerCase().includes(t) ||
          n.fornecedor_cnpj?.includes(t) ||
          n.nf_numero?.toLowerCase().includes(t),
      );
    }

    // Ordenação
    list = ordenarPor(list, sort, {
      fornecedor: (n) => n.fornecedor_razao_social || n.fornecedor_cliente || "",
      nf: (n) => n.nf_numero || "",
      data: (n) => n.nf_data_emissao || "",
      valor: (n) => n.valor || 0,
      categoria: (n) => n.plano_contas_id || "",
      status: (n) => n.status || "",
    });

    return list;
  }, [nfs, filtroPill, mesFiltro, busca, sort, resolvidasNaSessao]);

  // KPIs — refletem filtro de mês ativo (mas ignoram a pill, senão eram sempre iguais)
  const totals = useMemo(() => {
    const base = (nfs || []).filter((n) => !mesFiltro || mesKeyDeNf(n) === mesFiltro);
    return {
      todas: base.filter((n) => n.status !== "descartada" && !n.motivo_descarte).length,
      aRevisar: base.filter(
        (n) => !n.revisada_em && n.status !== "descartada" && !n.motivo_descarte,
      ).length,
      naoVinculadas: base.filter((n) => n.status === "nao_vinculada").length,
      vinculadas: base.filter((n) => n.status === "vinculada").length,
      descartadas: base.filter((n) => n.status === "descartada").length,
      incompletas: base.filter(
        (n) => (!n.plano_contas_id || !n.centro_custo_id) && n.status !== "descartada",
      ).length,
      docsIncompletos: base.filter(
        (n) => (n.completude || "") !== "completo" && n.status !== "descartada",
      ).length,
      motor: base.filter(
        (n) =>
          !!n.revisada_em &&
          n.revisao_origem === "motor" &&
          n.status !== "descartada" &&
          !n.motivo_descarte,
      ).length,
      total: base.length,
    };
  }, [nfs, mesFiltro]);

  // Dados do gráfico por mês (eixo contínuo — meses sem NF aparecem com valor 0)
  const chartData = useMemo(() => {
    const map = new Map<string, { valor: number; qtd: number }>();
    for (const n of nfs || []) {
      if (n.status === "descartada") continue;
      const k = mesKeyDeNf(n);
      if (!k) continue;
      const prev = map.get(k) || { valor: 0, qtd: 0 };
      prev.valor += Number(n.valor || 0);
      prev.qtd += 1;
      map.set(k, prev);
    }
    if (map.size === 0) return [] as Array<{ mesKey: string; label: string; valor: number; qtd: number }>;
    const keys = Array.from(map.keys()).sort();
    const [firstY, firstM] = keys[0].split("-").map(Number);
    const [lastY, lastM] = keys[keys.length - 1].split("-").map(Number);
    const out: Array<{ mesKey: string; label: string; valor: number; qtd: number }> = [];
    let y = firstY;
    let m = firstM;
    while (y < lastY || (y === lastY && m <= lastM)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      const info = map.get(k) || { valor: 0, qtd: 0 };
      out.push({ mesKey: k, label: labelMes(k), valor: info.valor, qtd: info.qtd });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }, [nfs]);

  // Janela de 12 meses do gráfico
  const CHART_WINDOW = 12;
  const chartWindow = useMemo(() => {
    if (chartData.length === 0) {
      return { data: [] as typeof chartData, hasPrev: false, hasNext: false, endIdx: 0 };
    }
    const endIdx = chartWindowEnd ?? chartData.length - 1;
    const clampedEnd = Math.min(Math.max(endIdx, Math.min(CHART_WINDOW - 1, chartData.length - 1)), chartData.length - 1);
    const startIdx = Math.max(0, clampedEnd - CHART_WINDOW + 1);
    return {
      data: chartData.slice(startIdx, clampedEnd + 1),
      hasPrev: startIdx > 0,
      hasNext: clampedEnd < chartData.length - 1,
      endIdx: clampedEnd,
    };
  }, [chartData, chartWindowEnd]);


  // Soma do valor das selecionadas
  const totalSelecionadas = useMemo(() => {
    if (selecionadas.size === 0) return 0;
    return (nfs || [])
      .filter((n) => selecionadas.has(n.id))
      .reduce((s, n) => s + (n.valor || 0), 0);
  }, [selecionadas, nfs]);

  // Combinações distintas de classificação entre as selecionadas (para diálogo Uniformizar)
  const combosSelecionadas = useMemo(() => {
    const selNfs = (nfs || []).filter((n) => selecionadas.has(n.id));
    let semClass = 0;
    const map = new Map<string, { plano_contas_id: string | null; centro_custo_id: string | null; count: number }>();
    for (const n of selNfs) {
      if (!n.plano_contas_id) {
        semClass++;
        continue;
      }
      const key = `${n.plano_contas_id}||${n.centro_custo_id ?? "null"}`;
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { plano_contas_id: n.plano_contas_id, centro_custo_id: n.centro_custo_id ?? null, count: 1 });
    }
    const combos = Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
    combos.sort((a, b) => b.count - a.count);
    return { combos, semClass, total: selNfs.length };
  }, [selecionadas, nfs]);


  // Soma das filtradas (independente de seleção)
  const totalFiltradas = useMemo(
    () => filtered.reduce((s, n) => s + (n.valor || 0), 0),
    [filtered],
  );

  // ENGINE UNIVERSAL: regras ativas (alimentadas por NF, cartão, manual…)
  const { data: regrasEngine } = useRegrasAtivas();

  // Sugestões por NF usando engine universal (não mais só por CNPJ)
  const sugestoesPorNf = useMemo(() => {
    const map: Record<string, SugestaoResult> = {};
    for (const nf of nfs || []) {
      if (nf.plano_contas_id) continue;
      if (nf.status === "descartada") continue;
      const sug = sugerirNoClient(
        {
          descricao: nf.fornecedor_razao_social || nf.fornecedor_cliente || nf.descricao,
          cnpj: nf.fornecedor_cnpj,
          parceiro_id: nf.parceiro_id,
          origem: "nf",
        },
        regrasEngine,
      );
      if (sug) map[nf.id] = sug;
    }
    return map;
  }, [nfs, regrasEngine]);

  // Map de id pra label de categoria
  const mapCategorias = useMemo(() => {
    const m: Record<string, string> = {};
    (categorias || []).forEach((c: { id: string; codigo: string; nome: string }) => {
      m[c.id] = `${c.codigo} ${c.nome}`;
    });
    return m;
  }, [categorias]);

  function toggleSel(id: string) {
    const next = new Set(selecionadas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelecionadas(next);
  }

  function toggleTodas() {
    const ids = filtered.map((n) => n.id);
    const todasSel = ids.length > 0 && ids.every((id) => selecionadas.has(id));
    if (todasSel) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(ids));
    }
  }

  // Só carimba revisada se, APÓS a edição, a NF tiver plano_contas_id E centro_custo_id preenchidos.
  // overrides descrevem os campos que estão sendo editados nesta chamada.
  async function stampRevisadaIfComplete(
    id: string,
    overrides: { plano_contas_id?: string | null; centro_custo_id?: string | null },
  ): Promise<Record<string, string> | null> {
    const nf = nfs?.find((n) => n.id === id);
    if (!nf) return null;
    if (nf.revisada_em) return null;
    const nextPlano =
      "plano_contas_id" in overrides ? overrides.plano_contas_id : nf.plano_contas_id;
    const nextCentro =
      "centro_custo_id" in overrides ? overrides.centro_custo_id : nf.centro_custo_id;
    if (!nextPlano || !nextCentro) return null;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    return { revisada_em: new Date().toISOString(), revisada_por: uid, revisao_origem: "humano" };
  }

  async function enviarParaPagamento(nf: NFStage) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("enviar_stage_para_pagamento", {
        p_stage_id: nf.id,
        p_user_id: uid,
      });
      if (error) throw error;

      const r = Array.isArray(data) ? data[0] : data;
      if (!r?.ok) {
        toast.error(r?.motivo || "Não foi possível enviar para pagamento");
        return;
      }

      const qtd = r.qtd_parcelas ?? 1;
      toast.success(
        qtd > 1
          ? `${qtd} parcelas criadas em Contas a Pagar`
          : "Pagamento criado em Contas a Pagar",
      );
      marcarResolvidasNaSessao([nf.id]);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao enviar para pagamento: " + msg);
    }
  }

  async function confirmarRevisao(ids: string[]) {
    if (ids.length === 0) return;
    setConfirmandoRevisao(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({ revisada_em: new Date().toISOString(), revisada_por: uid, revisao_origem: "humano" })
        .in("id", ids);
      if (error) throw error;
      marcarResolvidasNaSessao(ids);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      toast.success(
        `${ids.length} NF${ids.length === 1 ? "" : "s"} confirmada${ids.length === 1 ? "" : "s"} como revisada${ids.length === 1 ? "" : "s"}`,
      );
      if (ids.length > 1) setSelecionadas(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao confirmar revisão: " + msg);
    } finally {
      setConfirmandoRevisao(false);
    }
  }

  async function reaplicarRegras(ids: string[]) {
    if (ids.length === 0) return;
    setReaplicandoRegras(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("reaplicar_regras_stage_em_lote", {
        p_ids: ids,
      });
      if (error) throw error;
      const rows = (data || []) as Array<{ stage_id: string; acao: string; categoria_id: string | null }>;
      if (rows.length === 0) {
        toast.info(
          "Todas as selecionadas já possuem classificação. Para igualá-las, use o botão Uniformizar.",
        );
      } else {
        const classificadas = rows.filter((r) => r.categoria_id).length;
        const semRegra = rows.length - classificadas;
        toast.success(`${classificadas} NFs classificadas pelas regras, ${semRegra} sem regra conhecida`);
      }
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao reaplicar regras: " + msg);
    } finally {
      setReaplicandoRegras(false);
    }
  }

  async function uniformizarClassificacao() {
    if (!uniformizarEscolha) return;
    const ids = Array.from(selecionadas);
    if (ids.length === 0) return;
    const [pcRaw, ccRaw] = uniformizarEscolha.split("||");
    const plano_contas_id = pcRaw === "null" ? null : pcRaw;
    const centro_custo_id = ccRaw === "null" ? null : ccRaw;
    setUniformizando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({
          plano_contas_id,
          centro_custo_id,
          categoria_sugerida_ia: false,
          revisada_em: new Date().toISOString(),
          revisada_por: uid,
          revisao_origem: "humano",
        })
        .in("id", ids);
      if (error) throw error;
      marcarResolvidasNaSessao(ids);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      toast.success(`${ids.length} NF${ids.length === 1 ? "" : "s"} uniformizada${ids.length === 1 ? "" : "s"}`);
      setUniformizarOpen(false);
      setUniformizarEscolha(null);
      setSelecionadas(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao uniformizar: " + msg);
    } finally {
      setUniformizando(false);
    }
  }



  function detectarIrmasDivergentes(
    nfFonte: NFStage,
    campo: "categoria" | "centro",
    novoValor: string | null
  ): NFStage[] {
    if (!nfFonte.fornecedor_cnpj || !novoValor) return [];

    // Prefixo NCM da NF fonte (4 dígitos) — null se não tiver itens com NCM
    const ncmFonte = nfFonte.itens?.[0]?.ncm ?? null;
    const prefixoFonte = ncmFonte ? ncmFonte.slice(0, 4) : null;

    return (nfs || []).filter((n) => {
      if (n.id === nfFonte.id) return false;
      if (n.fornecedor_cnpj !== nfFonte.fornecedor_cnpj) return false;
      if (n.status === "descartada" || n.motivo_descarte) return false;

      // Se a fonte tem NCM, só agrupa com irmãs do mesmo prefixo NCM (4 dígitos)
      // ou irmãs sem NCM (não excluir NFs que vieram sem item detalhado)
      if (prefixoFonte) {
        const ncmIrma = n.itens?.[0]?.ncm ?? null;
        if (ncmIrma && ncmIrma.slice(0, 4) !== prefixoFonte) return false;
      }

      const valorAtual = campo === "categoria" ? n.plano_contas_id : n.centro_custo_id;
      return valorAtual !== novoValor;
    });
  }

  async function alterarCategoria(id: string, categoriaId: string) {
    setSalvandoCategoria((prev) => new Set(prev).add(id));
    try {
      const stamp = await stampRevisadaIfComplete(id, { plano_contas_id: categoriaId || null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({
          plano_contas_id: categoriaId || null,
          categoria_sugerida_ia: false,
          ...(stamp || {}),
        })
        .eq("id", id);
      if (error) throw error;
      if (stamp) marcarResolvidasNaSessao([id]);

      // Engine Universal: aprende com a classificação manual
      if (categoriaId) {
        const nf = nfs?.find((n) => n.id === id);
        if (nf) {
          await classificarComAprendizado({
            descricao: nf.fornecedor_razao_social || nf.fornecedor_cliente,
            cnpj: nf.fornecedor_cnpj,
            parceiro_id: nf.parceiro_id,
            plano_contas_id: categoriaId,
            origem: "nf",
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      qc.invalidateQueries({ queryKey: ["engine-regras-ativas"] });

      // Feedback visual — checa irmãs divergentes do mesmo CNPJ
      if (categoriaId) {
        const nfFonte = nfs?.find((n) => n.id === id);
        const irmas = nfFonte
          ? detectarIrmasDivergentes(nfFonte, "categoria", categoriaId)
          : [];
        if (nfFonte && irmas.length > 0) {
          setPropagacaoSugerida({
            fonte: { ...nfFonte, plano_contas_id: categoriaId },
            irmas,
            campo: "categoria",
          });
        } else {
          toast.success("Categoria salva");
        }
      } else {
        toast.success("Categoria removida");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvandoCategoria((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function alterarCentroCusto(id: string, centroCustoId: string | null) {
    setSalvandoCentroCusto((prev) => new Set(prev).add(id));
    try {
      const stamp = await stampRevisadaIfComplete(id, { centro_custo_id: centroCustoId || null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({ centro_custo_id: centroCustoId || null, ...(stamp || {}) })
        .eq("id", id);
      if (error) throw error;
      if (stamp) marcarResolvidasNaSessao([id]);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      // Sugestão de propagação para irmãs divergentes
      const nfAtual = nfs?.find((n) => n.id === id);
      if (nfAtual && centroCustoId) {
        const irmas = detectarIrmasDivergentes(nfAtual, "centro", centroCustoId);
        if (irmas.length > 0) {
          setPropagacaoSugerida({
            fonte: { ...nfAtual, centro_custo_id: centroCustoId },
            irmas,
            campo: "centro",
          });
          return;
        }
      }
      toast.success(centroCustoId ? "Centro de custo salvo" : "Centro de custo removido");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    } finally {
      setSalvandoCentroCusto((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function aplicarPropagacaoIrmas() {
    if (!propagacaoSugerida) return;
    const { fonte, irmas, campo } = propagacaoSugerida;
    const ids = irmas.map((n) => n.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");

      const updatePayload =
        campo === "categoria"
          ? {
              plano_contas_id: fonte.plano_contas_id,
              categoria_sugerida_ia: false,
              revisada_em: new Date().toISOString(),
              revisada_por: uid,
              revisao_origem: "humano",
            }
          : {
              centro_custo_id: fonte.centro_custo_id,
              revisada_em: new Date().toISOString(),
              revisada_por: uid,
              revisao_origem: "humano",
            };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update(updatePayload)
        .in("id", ids);

      if (error) throw error;
      marcarResolvidasNaSessao(ids);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      toast.success(
        `${campo === "categoria" ? "Categoria" : "Centro de custo"} propagado para ${ids.length} NF${ids.length === 1 ? "" : "s"} da mesma empresa`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao propagar: " + msg);
    } finally {
      setPropagacaoSugerida(null);
    }
  }

  async function aceitarSugestao(nf: NFStage) {
    const sug = sugestoesPorNf[nf.id];
    if (!sug) return;
    await alterarCategoria(nf.id, sug.plano_contas_id);
    toast.success("Sugestão aplicada");
  }

  async function aplicarClassificacaoASelecionadas(fonte: NFStage) {
    if (!fonte.plano_contas_id) return;
    const alvos = Array.from(selecionadas).filter((id) => id !== fonte.id);
    if (alvos.length === 0) return;
    setAplicandoClassificacao(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({
          plano_contas_id: fonte.plano_contas_id,
          centro_custo_id: fonte.centro_custo_id,
          categoria_sugerida_ia: false,
          revisada_em: new Date().toISOString(),
          revisada_por: uid,
          revisao_origem: "humano",
        })
        .in("id", alvos);
      if (error) throw error;
      marcarResolvidasNaSessao(alvos);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      toast.success(`Classificação aplicada a ${alvos.length} NF${alvos.length === 1 ? "" : "s"}`);
      setAplicarFonte(null);
      setSelecionadas(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao aplicar classificação: " + msg);
    } finally {
      setAplicandoClassificacao(false);
    }
  }

  async function aceitarTodasSugestoes() {
    if (!nfs) return;
    const aplicar = nfs.filter(
      (n) => !n.plano_contas_id && sugestoesPorNf[n.id],
    );
    if (aplicar.length === 0) {
      toast.info("Nenhuma sugestão automática disponível.");
      return;
    }
    if (!confirm(`Aplicar sugestão automática em ${aplicar.length} NF${aplicar.length === 1 ? "" : "s"}?`)) return;

    let ok = 0;
    for (const nf of aplicar) {
      try {
        const sug = sugestoesPorNf[nf.id];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("nfs_stage")
          .update({ plano_contas_id: sug.plano_contas_id })
          .eq("id", nf.id);
        if (!error) {
          ok++;
          // Engine Universal: aprende
          await classificarComAprendizado({
            descricao: nf.fornecedor_razao_social || nf.fornecedor_cliente,
            cnpj: nf.fornecedor_cnpj,
            parceiro_id: nf.parceiro_id,
            plano_contas_id: sug.plano_contas_id,
            origem: "nf",
          });
        }
      } catch {
        // ignora
      }
    }
    qc.invalidateQueries({ queryKey: ["nfs-stage"] });
    qc.invalidateQueries({ queryKey: ["engine-regras-ativas"] });
    toast.success(`${ok} sugestão${ok === 1 ? "" : "ões"} aplicada${ok === 1 ? "" : "s"}`);
  }

  async function handleRemover(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("nfs_stage")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }

    toast.success("NF removida do repositório");
    qc.invalidateQueries({ queryKey: ["nfs-stage"] });
  }

  async function handleDescartarConfirmado() {
    const ids = paraDescartar.map((n) => n.id);
    try {
      const count = await descartarStage(ids);
      toast.success(`${count} NF${count === 1 ? "" : "s"} removida${count === 1 ? "" : "s"} do repositório`);
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      setParaDescartar([]);
      setSelecionadas(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro: " + msg);
    }
  }

  async function abrirDocumento(
    nf: NFStage,
    tipo: "xml" | "pdf_danfe" | "pdf_boleto",
  ) {
    const doc = nf.documentos?.find((d) => d.tipo === tipo);
    if (!doc) {
      toast.error("Documento não disponível");
      return;
    }
    const { data } = await supabase.storage
      .from("nfs-stage")
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Falha ao gerar link do arquivo");
    }
  }

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignora se está num input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selecionadas.size > 0) {
          e.preventDefault();
          const lista = filtered.filter((n) => selecionadas.has(n.id));
          setParaDescartar(lista);
        }
      } else if (e.key === "Escape") {
        if (selecionadas.size > 0) {
          setSelecionadas(new Set());
        }
      } else if (e.key === "/") {
        e.preventDefault();
        const input = document.getElementById("nfs-stage-busca") as HTMLInputElement | null;
        input?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadas, filtered]);

  const sugestoesDisponiveis = (nfs || []).filter(
    (n) => n.status === "nao_vinculada" && sugestoesPorNf[n.id],
  ).length;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER FIXO - Título, KPIs como filtros, busca */}
      <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-3 border-b space-y-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6 text-admin" />
              NFs aguardando vínculo
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Notas fiscais importadas que ainda não foram vinculadas a uma despesa.{" "}
              <span className="text-[11px] opacity-70">
                Atalhos: <kbd className="px-1 py-0.5 border rounded text-[10px]">/</kbd> buscar ·{" "}
                <kbd className="px-1 py-0.5 border rounded text-[10px]">Del</kbd> remover ·{" "}
                <kbd className="px-1 py-0.5 border rounded text-[10px]">Esc</kbd> limpar
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={classificarComIA}
              disabled={classificandoIA}
              className="gap-2"
            >
              {classificandoIA ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {classificandoIA ? "Classificando..." : "Classificar com IA"}
            </Button>
            {sugestoesDisponiveis > 0 && (
              <Button
                variant="outline"
                onClick={aceitarTodasSugestoes}
                className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <Sparkles className="h-4 w-4" />
                Aplicar {sugestoesDisponiveis} sugestão{sugestoesDisponiveis === 1 ? "" : "ões"} automática{sugestoesDisponiveis === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>

        {/* KPI pills (clicáveis = filtros) + Gráfico por mês */}
        <div className="flex gap-4 items-start flex-wrap">
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            <KpiPill
              label="Todas"
              count={totals.todas}
              color="gray"
              active={filtroPill === "todas"}
              onClick={() => setFiltroPill("todas")}
              icon={<Layers className="h-3 w-3" />}
            />
            <KpiPill
              label="A revisar"
              count={totals.aRevisar}
              color="admin"
              active={filtroPill === "a_revisar"}
              onClick={() => setFiltroPill("a_revisar")}
              icon={<AlertCircle className="h-3 w-3" />}
            />
            <KpiPill
              label="Aguardando vínculo"
              count={totals.naoVinculadas}
              color="amber"
              active={filtroPill === "nao_vinculadas"}
              onClick={() => setFiltroPill("nao_vinculadas")}
              icon={<Clock className="h-3 w-3" />}
            />
            <KpiPill
              label="Vinculadas"
              count={totals.vinculadas}
              color="emerald"
              icon={<CheckCircle2 className="h-4 w-4" />}
              active={filtroPill === "vinculadas"}
              onClick={() => setFiltroPill("vinculadas")}
            />
            <KpiPill
              label="Motor"
              count={totals.motor}
              color="blue"
              active={filtroPill === "motor"}
              onClick={() => setFiltroPill("motor")}
              icon={<Wand2 className="h-3 w-3" />}
              description="carimbadas automaticamente"
            />
            <KpiPill
              label="Incompletas"
              count={totals.incompletas}
              color="violet"
              active={filtroPill === "incompletas"}
              onClick={() => setFiltroPill("incompletas")}
              icon={<AlertCircle className="h-3 w-3" />}
              description="sem plano ou centro"
            />
            <KpiPill
              label="Docs incompletos"
              count={totals.docsIncompletos}
              color="blue"
              active={filtroPill === "docs_incompletos"}
              onClick={() => setFiltroPill("docs_incompletos")}
              icon={<FileWarning className="h-3 w-3" />}
              description="XML/PDF/boleto faltando"
            />
            <KpiPill
              label="Descartadas"
              count={totals.descartadas}
              color="gray"
              active={filtroPill === "descartadas"}
              onClick={() => setFiltroPill("descartadas")}
              icon={<Trash2 className="h-3 w-3" />}
            />
          </div>

          {chartData.length > 0 && (
            <div
              className="w-full max-w-[420px] md:w-[320px] md:max-w-[320px] md:shrink-0 min-w-0 overflow-hidden flex flex-col"
              style={{ height: 96 }}
            >

              <div className="flex items-center gap-1 min-w-0">
                {chartData.length > CHART_WINDOW && (
                  <button
                    type="button"
                    onClick={() => {
                      setChartWindowEnd((prev) => {
                        const cur = prev ?? chartData.length - 1;
                        return Math.max(CHART_WINDOW - 1, cur - CHART_WINDOW);
                      });
                    }}
                    disabled={!chartWindow.hasPrev}
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="12 meses anteriores"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex-1 min-w-0 overflow-hidden" style={{ height: 72 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartWindow.data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9 }}
                        interval="preserveStartEnd"
                        minTickGap={4}
                        height={14}
                      />
                      <RTooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        formatter={(v: number, _n, p) => [
                          `${formatBRL(Number(v))} · ${(p?.payload as { qtd: number })?.qtd || 0} NF${(p?.payload as { qtd: number })?.qtd === 1 ? "" : "s"}`,
                          "Total",
                        ]}
                        labelFormatter={(l) => `Mês: ${l}`}
                        contentStyle={{ fontSize: 11, borderRadius: 6 }}
                      />
                      <Bar
                        dataKey="valor"
                        maxBarSize={16}
                        onClick={(d) => {
                          const k = (d as { mesKey?: string })?.mesKey;
                          if (!k) return;
                          setMesFiltro((prev) => (prev === k ? null : k));
                        }}
                        cursor="pointer"
                      >

                        {chartWindow.data.map((d) => (
                          <Cell
                            key={d.mesKey}
                            fill={
                              mesFiltro === null
                                ? "hsl(var(--admin))"
                                : mesFiltro === d.mesKey
                                  ? "hsl(var(--admin))"
                                  : "hsl(var(--muted-foreground) / 0.25)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {chartData.length > CHART_WINDOW && (
                  <button
                    type="button"
                    onClick={() => {
                      setChartWindowEnd((prev) => {
                        const cur = prev ?? chartData.length - 1;
                        return Math.min(chartData.length - 1, cur + CHART_WINDOW);
                      });
                    }}
                    disabled={!chartWindow.hasNext}
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="12 meses seguintes"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              {chartData.length > CHART_WINDOW && chartWindow.data.length > 0 && (
                <div className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">
                  {chartWindow.data[0].label} – {chartWindow.data[chartWindow.data.length - 1].label}
                </div>
              )}
            </div>
          )}

        </div>


        {/* Busca + Ações */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[280px] max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="nfs-stage-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar fornecedor, CNPJ ou nº NF... (atalho: /)"
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

          {mesFiltro && (() => {
            const info = chartData.find((d) => d.mesKey === mesFiltro);
            return (
              <Badge
                variant="outline"
                className="gap-1 text-xs border-admin/40 bg-admin/5 text-admin"
              >
                Mês: {info?.label || mesFiltro} ({info?.qtd || 0})
                <button
                  onClick={() => setMesFiltro(null)}
                  className="ml-1 hover:text-foreground"
                  title="Limpar filtro de mês"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })()}

          {/* Resumo de valores */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" />
            <span>
              <strong className="text-foreground">{filtered.length}</strong> NF{filtered.length === 1 ? "" : "s"} ·{" "}
              <strong className="text-foreground font-mono">{formatBRL(totalFiltradas)}</strong>
            </span>
          </div>

          {selecionadas.size > 0 && (
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1 text-xs">
                <strong>{selecionadas.size}</strong> selecionadas ·{" "}
                <span className="font-mono">{formatBRL(totalSelecionadas)}</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => confirmarRevisao(Array.from(selecionadas))}
                disabled={confirmandoRevisao}
                className="gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                title="Marcar as selecionadas como revisadas"
              >
                {confirmandoRevisao ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirmar revisão ({selecionadas.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reaplicarRegras(Array.from(selecionadas))}
                disabled={reaplicandoRegras}
                className="gap-1"
                title="Aplicar regras aprendidas nas selecionadas sem classificação"
              >
                {reaplicandoRegras ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Reaplicar regras ({selecionadas.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // pré-seleciona o combo mais frequente
                  const first = combosSelecionadas.combos[0];
                  setUniformizarEscolha(first ? first.key : null);
                  setUniformizarOpen(true);
                }}
                disabled={selecionadas.size < 2 || uniformizando}
                className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                title="Igualar plano de contas e centro de custo de todas as selecionadas"
              >
                <Wand2 className="h-4 w-4" />
                Uniformizar ({selecionadas.size})
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const lista = filtered.filter((n) => selecionadas.has(n.id));
                  setParaDescartar(lista);
                }}
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                title="Remover (Del)"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* TABELA - área que rola */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
              {nfs?.length === 0
                ? "Nenhuma NF no stage ainda. Importe arquivos em \"Importar Dados\"."
                : "Nenhuma NF encontrada com esses filtros."}
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-md overflow-auto max-h-[calc(100vh-280px)]">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        filtered.length > 0 &&
                        filtered.every((n) => selecionadas.has(n.id))
                      }
                      onCheckedChange={toggleTodas}
                    />
                  </TableHead>
                  <SortableTableHead column="fornecedor" sort={sort} onSort={setSort}>
                    Fornecedor
                  </SortableTableHead>
                  <SortableTableHead column="nf" sort={sort} onSort={setSort} className="w-20">
                    NF
                  </SortableTableHead>
                  <SortableTableHead column="data" sort={sort} onSort={setSort} className="w-28">
                    Data
                  </SortableTableHead>
                  <SortableTableHead column="valor" sort={sort} onSort={setSort} className="w-28" align="right">
                    Valor
                  </SortableTableHead>
                  <SortableTableHead column="categoria" sort={sort} onSort={setSort} className="min-w-[220px]">
                    Categoria
                  </SortableTableHead>
                  <TableHead className="min-w-[240px]">Centro de custo</TableHead>
                  <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-16">
                    Status
                  </SortableTableHead>
                  <TableHead className="w-24 text-center">Pasta GED</TableHead>
                  <TableHead className="w-[110px] text-center">Ações</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((nf) => {
                  const isSel = selecionadas.has(nf.id);
                  const podeSel = nf.status === "nao_vinculada";
                  const podeClassificar = nf.status === "nao_vinculada";
                  const salvando = salvandoCategoria.has(nf.id);
                  const sugestao =
                    !nf.plano_contas_id ? sugestoesPorNf[nf.id] : null;

                  const temItens = !!(nf.itens && Array.isArray(nf.itens) && nf.itens.length > 0);
                  const isExpandida = expandidas.has(nf.id);

                  return (
                    <Fragment key={nf.id}>
                      <TableRow className={isSel ? "bg-admin/5" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleSel(nf.id)}
                          />
                          {temItens && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0"
                              onClick={() => toggleExpandir(nf.id)}
                              title={`${nf.itens!.length} ite${nf.itens!.length === 1 ? "m" : "ns"}`}
                            >
                              {isExpandida ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="text-sm truncate font-medium" title={nf.fornecedor_razao_social || ""}>
                          {nf.fornecedor_razao_social || nf.fornecedor_cliente || "—"}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {nf.fornecedor_cnpj && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {nf.fornecedor_cnpj}
                            </span>
                          )}
                          <div className="flex items-center gap-2 ml-1">
                            <DocIndicator label="XML" tem={!!nf.tem_xml} />
                            <DocIndicator label="PDF" tem={!!nf.tem_pdf} />
                            
                          </div>
                          {nf.numero_parcela && nf.total_parcelas && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 h-4 font-normal">
                              {nf.numero_parcela}/{nf.total_parcelas}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{nf.nf_numero || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateBR(nf.nf_data_emissao)}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap text-sm">
                        {formatBRL(nf.valor)}
                      </TableCell>
                      <TableCell>
                        <div className="mb-1">
                          {nf.status === "descartada" || nf.motivo_descarte ? null : nf.revisada_em ? (
                            nf.revisao_origem === "motor" ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 h-4 border-blue-300 text-blue-700 bg-blue-50"
                                title="Classificada automaticamente — padrão confirmado por você anteriormente"
                              >
                                Motor
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] py-0 h-4 border-emerald-300 text-emerald-700 bg-emerald-50"
                              >
                                Revisada
                              </Badge>
                            )
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 h-4 border-amber-300 text-amber-700 bg-amber-50"
                            >
                              A revisar
                            </Badge>
                          )}
                        </div>
                        {podeClassificar ? (
                          <div
                            className="flex items-center gap-1.5"
                            title={nf.plano_contas_id ? mapCategorias[nf.plano_contas_id] : undefined}
                          >
                            <CategoriaCombobox
                              options={categorias}
                              value={nf.plano_contas_id || null}
                              onChange={(id) =>
                                alterarCategoria(nf.id, id || "")
                              }
                              placeholder="Classificar..."
                              disabled={salvando}
                            />

                            {nf.categoria_sugerida_ia && nf.plano_contas_id && (
                              <Sparkles
                                className="h-3 w-3 text-purple-500 shrink-0"
                                aria-label="Categoria sugerida pela IA — revise e confirme"
                              />
                            )}
                            {sugestao && (() => {
                              const conf = sugestao.confianca || 0;
                              const corBadge =
                                conf >= 80
                                  ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                                  : conf >= 50
                                    ? "border-amber-400 text-amber-700 bg-amber-50"
                                    : "border-violet-300 text-violet-700 bg-violet-50";
                              const labelConf = conf >= 80 ? "Alta" : conf >= 50 ? "Média" : "Baixa";
                              return (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`h-8 text-[10px] gap-1 px-2 ${corBadge}`}
                                  onClick={() => aceitarSugestao(nf)}
                                  disabled={salvando}
                                  title={`${mapCategorias[sugestao.plano_contas_id]} · Confiança ${labelConf} · ${sugestao.motivo}`}
                                >
                                  <Sparkles className="h-3 w-3" />
                                  Sugerir
                                  <span className="text-[8px] opacity-70 ml-0.5">{labelConf}</span>
                                </Button>
                              );
                            })()}
                          </div>
                        ) : nf.plano_contas_id ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            {mapCategorias[nf.plano_contas_id] || "—"}
                            {nf.categoria_sugerida_ia && (
                              <Sparkles className="h-3 w-3 text-purple-500" />
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {podeClassificar ? (
                          <Select
                            value={nf.centro_custo_id || "__none__"}
                            onValueChange={(v) =>
                              alterarCentroCusto(nf.id, v === "__none__" ? null : v)
                            }
                            disabled={salvandoCentroCusto.has(nf.id)}
                          >
                            <SelectTrigger
                              className="h-8 text-xs"
                              title={
                                nf.centro_custo_id
                                  ? centrosCusto.find((c) => c.id === nf.centro_custo_id)?.nome
                                  : undefined
                              }
                            >
                              <SelectValue placeholder="Selecionar..." />
                            </SelectTrigger>

                            <SelectContent>
                              <SelectItem value="__none__">— Sem centro —</SelectItem>
                              {centrosCusto.map((cc) => (
                                <SelectItem key={cc.id} value={cc.id}>
                                  {cc.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : nf.centro_custo_id ? (
                          <span
                            className="text-xs text-muted-foreground block truncate"
                            title={centrosCusto.find((c) => c.id === nf.centro_custo_id)?.nome || ""}
                          >
                            {centrosCusto.find((c) => c.id === nf.centro_custo_id)?.nome || "—"}
                          </span>

                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const fullLabel =
                            nf.status === "parcial" && nf.qtd_boletos
                              ? `Parcial (${despesasPorStage[nf.id] || 0}/${nf.qtd_boletos})`
                              : STATUS_LABELS[nf.status] || nf.status;
                          const shortLabel =
                            nf.status === "parcial" && nf.qtd_boletos
                              ? `${despesasPorStage[nf.id] || 0}/${nf.qtd_boletos}`
                              : (STATUS_LABELS[nf.status] || nf.status).slice(0, 3);
                          return (
                            <Badge
                              className={`${STATUS_STYLES[nf.status]} text-[10px] py-0 h-4 px-1.5`}
                              title={fullLabel}
                            >
                              {shortLabel}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {nf.parceiro_id && pastaIdPorParceiro.get(nf.parceiro_id) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => navigate(`/administrativo-fetely/ged?pasta=${pastaIdPorParceiro.get(nf.parceiro_id!)}`)}
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Abrir
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const podeRevisar =
                            !nf.revisada_em &&
                            nf.status !== "descartada" &&
                            !nf.motivo_descarte;
                          const loadingResumo = gerandoResumo.has(nf.id);
                          const jaTemResumo = !!nf.resumo_pdf_gerado_em;
                          const podeAplicar =
                            !!nf.plano_contas_id &&
                            selecionadas.size > 0 &&
                            !(selecionadas.size === 1 && selecionadas.has(nf.id));
                          return (
                            <div className="flex items-center justify-center gap-1">
                              {podeRevisar ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                  onClick={() => confirmarRevisao([nf.id])}
                                  disabled={confirmandoRevisao}
                                  title="Confirmar revisão"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <span className="w-7" />
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Mais ações"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  {nf.tem_pdf && (
                                    <DropdownMenuItem
                                      onClick={() => abrirDocumento(nf, "pdf_danfe")}
                                    >
                                      <Eye className="h-3.5 w-3.5 mr-2" />
                                      Ver PDF DANFE
                                    </DropdownMenuItem>
                                  )}
                                  {nf.tem_xml && (
                                    <DropdownMenuItem
                                      onClick={() => abrirDocumento(nf, "xml")}
                                    >
                                      <FileCode className="h-3.5 w-3.5 mr-2" />
                                      Ver XML
                                    </DropdownMenuItem>
                                  )}
                                  {nf.tem_xml && (
                                    <DropdownMenuItem
                                      onClick={() => handleGerarResumo(nf, jaTemResumo)}
                                      disabled={loadingResumo}
                                    >
                                      {loadingResumo ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                      ) : jaTemResumo ? (
                                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
                                      ) : (
                                        <FilePlus2 className="h-3.5 w-3.5 mr-2" />
                                      )}
                                      {jaTemResumo ? "Regerar Resumo NFe" : "Gerar Resumo NFe"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    disabled={!podeAplicar}
                                    onClick={() => setAplicarFonte(nf)}
                                  >
                                    <Copy className="h-3.5 w-3.5 mr-2" />
                                    Aplicar classificação às selecionadas
                                  </DropdownMenuItem>
                                  {!nf.conta_pagar_id &&
                                    nf.status !== "descartada" &&
                                    !nf.motivo_descarte &&
                                    (() => {
                                      const faltaClass =
                                        !nf.plano_contas_id || !nf.centro_custo_id;
                                      return (
                                        <DropdownMenuItem
                                          disabled={faltaClass}
                                          onClick={() => enviarParaPagamento(nf)}
                                          title={
                                            faltaClass
                                              ? "Complete a classificação antes de enviar"
                                              : undefined
                                          }
                                        >
                                          <Send className="h-3.5 w-3.5 mr-2" />
                                          Enviar para pagamento
                                        </DropdownMenuItem>
                                      );
                                    })()}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                    onClick={() => {
                                      if (
                                        confirm(
                                          "Remover esta NF do repositório? Esta ação é permanente.",
                                        )
                                      ) {
                                        handleRemover(nf.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Remover
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          );
                        })()}
                      </TableCell>

                    </TableRow>
                    {isExpandida && temItens && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={99} className="p-0">
                          <div className="px-6 py-3 border-t border-b">
                            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                              <Package className="h-3.5 w-3.5" />
                              Itens da NF ({nf.itens!.length})
                            </div>
                            <div className="space-y-1">
                              {nf.itens!.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-12 gap-2 text-xs py-1 px-2 rounded hover:bg-background"
                                >
                                  <div className="col-span-6 font-medium truncate" title={item.descricao}>
                                    {item.descricao || "—"}
                                  </div>
                                  <div className="col-span-1 text-muted-foreground text-[10px] font-mono">
                                    NCM {item.ncm || "—"}
                                  </div>
                                  <div className="col-span-1 text-muted-foreground text-[10px] font-mono">
                                    CFOP {item.cfop || "—"}
                                  </div>
                                  <div className="col-span-1 text-right text-[10px] text-muted-foreground">
                                    {item.quantidade || 0} {item.unidade || ""}
                                  </div>
                                  <div className="col-span-1 text-right text-[10px] text-muted-foreground font-mono">
                                    {item.valor_unitario ? formatBRL(item.valor_unitario) : "—"}
                                  </div>
                                  <div className="col-span-2 text-right font-mono">
                                    {formatBRL(item.valor_total || 0)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* AlertDialog remover */}
      <AlertDialog
        open={paraDescartar.length > 0}
        onOpenChange={(v) => !v && setParaDescartar([])}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover NFs do repositório?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover {paraDescartar.length} NF{paraDescartar.length === 1 ? "" : "s"} do repositório.
              Os arquivos PDF/XML serão apagados do storage.
              <br /><br />
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
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog aplicar classificação às selecionadas */}
      <AlertDialog
        open={!!aplicarFonte}
        onOpenChange={(v) => !v && !aplicandoClassificacao && setAplicarFonte(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar classificação às selecionadas?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div>
                  Você vai <strong>sobrescrever</strong> plano de contas e centro de custo em{" "}
                  <strong>{Array.from(selecionadas).filter((id) => id !== aplicarFonte?.id).length}</strong>{" "}
                  NF{Array.from(selecionadas).filter((id) => id !== aplicarFonte?.id).length === 1 ? "" : "s"} selecionada
                  {Array.from(selecionadas).filter((id) => id !== aplicarFonte?.id).length === 1 ? "" : "s"}.
                </div>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Classificação fonte</div>
                  <div>
                    <span className="text-muted-foreground text-xs">Plano de contas: </span>
                    <strong>{aplicarFonte?.plano_contas_id ? mapCategorias[aplicarFonte.plano_contas_id] || "—" : "—"}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Centro de custo: </span>
                    <strong>
                      {aplicarFonte?.centro_custo_id
                        ? centrosCusto.find((c) => c.id === aplicarFonte.centro_custo_id)?.nome || "—"
                        : "— sem centro —"}
                    </strong>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  As NFs de destino também serão marcadas como revisadas.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoClassificacao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={aplicandoClassificacao}
              onClick={(e) => {
                e.preventDefault();
                if (aplicarFonte) void aplicarClassificacaoASelecionadas(aplicarFonte);
              }}
              className="bg-admin text-admin-foreground hover:bg-admin/90"
            >
              {aplicandoClassificacao && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Aplicar a {Array.from(selecionadas).filter((id) => id !== aplicarFonte?.id).length} NF
              {Array.from(selecionadas).filter((id) => id !== aplicarFonte?.id).length === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Uniformizar classificação */}
      <Dialog
        open={uniformizarOpen}
        onOpenChange={(v) => {
          if (uniformizando) return;
          setUniformizarOpen(v);
          if (!v) setUniformizarEscolha(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-violet-600" />
              Uniformizar classificação
            </DialogTitle>
            <DialogDescription>
              Escolha a combinação de plano de contas + centro de custo que será aplicada a todas as{" "}
              <strong>{selecionadas.size}</strong> NFs selecionadas. Todas serão marcadas como revisadas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {combosSelecionadas.combos.length === 0 ? (
              <div className="rounded-md border bg-amber-50 border-amber-200 p-3 text-sm text-amber-800">
                Nenhuma das selecionadas tem classificação. Classifique ao menos uma NF antes de uniformizar.
              </div>
            ) : combosSelecionadas.combos.length === 1 && combosSelecionadas.semClass === 0 ? (
              <div className="rounded-md border bg-emerald-50 border-emerald-200 p-3 text-sm text-emerald-800">
                Todas as selecionadas já compartilham a mesma classificação — nada a uniformizar.
              </div>
            ) : (
              <>
                <RadioGroup
                  value={uniformizarEscolha ?? ""}
                  onValueChange={setUniformizarEscolha}
                  className="space-y-2"
                >
                  {combosSelecionadas.combos.map((c) => {
                    const catLabel = c.plano_contas_id
                      ? mapCategorias[c.plano_contas_id] || "—"
                      : "— sem plano —";
                    const ccLabel = c.centro_custo_id
                      ? centrosCusto.find((x) => x.id === c.centro_custo_id)?.nome || "—"
                      : "— sem centro —";
                    return (
                      <label
                        key={c.key}
                        htmlFor={`combo-${c.key}`}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                          uniformizarEscolha === c.key
                            ? "border-violet-500 bg-violet-50"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        <RadioGroupItem value={c.key} id={`combo-${c.key}`} className="mt-1" />
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="font-medium truncate">{catLabel}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            Centro de custo: {ccLabel}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          {c.count} de {combosSelecionadas.total}
                        </Badge>
                      </label>
                    );
                  })}
                </RadioGroup>
                {combosSelecionadas.semClass > 0 && (
                  <div className="text-xs text-muted-foreground rounded border border-dashed p-2">
                    <strong>{combosSelecionadas.semClass}</strong> das selecionadas está sem
                    classificação — receberá a combinação escolhida.
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUniformizarOpen(false)}
              disabled={uniformizando}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void uniformizarClassificacao()}
              disabled={
                uniformizando ||
                !uniformizarEscolha ||
                combosSelecionadas.combos.length === 0
              }
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              {uniformizando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Aplicar a todas ({selecionadas.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Sugestão de propagação para irmãs */}
      <AlertDialog
        open={!!propagacaoSugerida}
        onOpenChange={(open) => {
          if (!open) {
            if (propagacaoSugerida) {
              toast.success(
                propagacaoSugerida.campo === "categoria"
                  ? "Categoria salva"
                  : "Centro de custo salvo"
              );
            }
            setPropagacaoSugerida(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Propagar para NFs do mesmo fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {propagacaoSugerida && (
                <>
                  Encontrei{" "}
                  <strong>
                    {propagacaoSugerida.irmas.length} outra
                    {propagacaoSugerida.irmas.length === 1 ? "" : "s"} NF
                    {propagacaoSugerida.irmas.length === 1 ? "" : "s"}
                  </strong>{" "}
                  de{" "}
                  <strong>
                    {propagacaoSugerida.fonte.fornecedor_razao_social ||
                      propagacaoSugerida.fonte.fornecedor_cliente ||
                      propagacaoSugerida.fonte.fornecedor_cnpj}
                  </strong>{" "}
                  com{" "}
                  {propagacaoSugerida.campo === "categoria"
                    ? "categoria diferente"
                    : "centro de custo diferente"}
                  . Deseja aplicar a mesma classificação para todas?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ignorar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarPropagacaoIrmas}>
              Aplicar para todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}

// =====================================================
// KpiPill - Cards de KPI clicáveis (viram filtros)
// =====================================================
interface KpiPillProps {
  label: string;
  count: number;
  color: "admin" | "amber" | "emerald" | "blue" | "gray" | "violet";
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
      activeBg: "bg-admin text-admin-foreground border-admin",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      activeBg: "bg-amber-600 text-white border-amber-600",
    },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      activeBg: "bg-emerald-600 text-white border-emerald-600",
    },
    blue: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      activeBg: "bg-blue-600 text-white border-blue-600",
    },
    gray: {
      bg: "bg-gray-50",
      text: "text-gray-700",
      border: "border-gray-200",
      activeBg: "bg-gray-700 text-white border-gray-700",
    },
    violet: {
      bg: "bg-violet-50",
      text: "text-violet-700",
      border: "border-violet-200",
      activeBg: "bg-violet-600 text-white border-violet-600",
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
