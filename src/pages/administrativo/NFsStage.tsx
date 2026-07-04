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
  ChevronRight,
  AlertCircle,
  FilePlus2,
  RefreshCw,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { descartarStage } from "@/lib/financeiro/stage-handler";
import { useCategoriasPlano } from "@/hooks/useCategoriasPlano";
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
  | "nao_vinculadas"
  | "vinculadas"
  | "descartadas"
  | "sem_categoria"
  | "com_xml"
  | "com_pdf"
  ;

export default function NFsStage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtroPill, setFiltroPill] = useState<FiltroPill>("nao_vinculadas");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [paraDescartar, setParaDescartar] = useState<NFStage[]>([]);
  const [salvandoCategoria, setSalvandoCategoria] = useState<Set<string>>(new Set());
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [gerandoResumo, setGerandoResumo] = useState<Set<string>>(new Set());
  const [classificandoIA, setClassificandoIA] = useState(false);

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
    if (filtroPill === "nao_vinculadas") {
      list = list.filter((n) => n.status === "nao_vinculada");
    } else if (filtroPill === "vinculadas") {
      list = list.filter((n) => n.status === "vinculada");
    } else if (filtroPill === "descartadas") {
      list = list.filter((n) => n.status === "descartada");
    } else if (filtroPill === "sem_categoria") {
      list = list.filter((n) => !n.plano_contas_id && n.status !== "descartada");
    } else if (filtroPill === "com_xml") {
      list = list.filter((n) => n.tem_xml && n.status !== "descartada");
    } else if (filtroPill === "com_pdf") {
      list = list.filter((n) => n.tem_pdf && n.status !== "descartada");
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
  }, [nfs, filtroPill, busca, sort]);

  // KPIs (sempre baseados em todos os dados, não filtered)
  const totals = useMemo(() => {
    const all = nfs || [];
    return {
      naoVinculadas: all.filter((n) => n.status === "nao_vinculada").length,
      vinculadas: all.filter((n) => n.status === "vinculada").length,
      descartadas: all.filter((n) => n.status === "descartada").length,
      semCategoria: all.filter((n) => !n.plano_contas_id && n.status !== "descartada").length,
      comXml: all.filter((n) => n.tem_xml && n.status !== "descartada").length,
      comPdf: all.filter((n) => n.tem_pdf && n.status !== "descartada").length,
      comBoleto: all.filter((n) => n.tem_boleto).length,
      total: all.length,
    };
  }, [nfs]);


  // Soma do valor das selecionadas
  const totalSelecionadas = useMemo(() => {
    if (selecionadas.size === 0) return 0;
    return (nfs || [])
      .filter((n) => selecionadas.has(n.id))
      .reduce((s, n) => s + (n.valor || 0), 0);
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

  async function alterarCategoria(id: string, categoriaId: string) {
    setSalvandoCategoria((prev) => new Set(prev).add(id));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nfs_stage")
        .update({
          plano_contas_id: categoriaId || null,
          categoria_sugerida_ia: false,
        })
        .eq("id", id);
      if (error) throw error;

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

      // Feedback visual
      if (categoriaId) {
        toast.success("Categoria salva");
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

  async function aceitarSugestao(nf: NFStage) {
    const sug = sugestoesPorNf[nf.id];
    if (!sug) return;
    await alterarCategoria(nf.id, sug.plano_contas_id);
    toast.success("Sugestão aplicada");
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

        {/* KPI pills (clicáveis = filtros) */}
        <div className="flex flex-wrap gap-2">
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
            label="Sem categoria"
            count={totals.semCategoria}
            color="violet"
            active={filtroPill === "sem_categoria"}
            onClick={() => setFiltroPill("sem_categoria")}
            icon={<AlertCircle className="h-3 w-3" />}
          />
          <KpiPill
            label="Com XML"
            count={totals.comXml}
            color="emerald"
            active={filtroPill === "com_xml"}
            onClick={() => setFiltroPill("com_xml")}
            icon={<FileCode className="h-3 w-3" />}
          />
          <KpiPill
            label="Com PDF"
            count={totals.comPdf}
            color="blue"
            active={filtroPill === "com_pdf"}
            onClick={() => setFiltroPill("com_pdf")}
            icon={<FileCheck className="h-3 w-3" />}
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
                        filtered
                          .filter((n) => n.status === "pendente" || n.status === "classificada")
                          .length > 0 &&
                        filtered
                          .filter((n) => n.status === "pendente" || n.status === "classificada")
                          .every((n) => selecionadas.has(n.id))
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
                  <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-24">
                    Status
                  </SortableTableHead>
                  <TableHead className="w-24 text-center">Pasta GED</TableHead>
                  <TableHead className="w-24 text-center">Ações</TableHead>
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
                        {podeClassificar ? (
                          <div className="flex items-center gap-1.5">
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
                        <Badge className={STATUS_STYLES[nf.status]}>
                          {nf.status === "parcial" && nf.qtd_boletos
                            ? `Parcial (${despesasPorStage[nf.id] || 0}/${nf.qtd_boletos})`
                            : STATUS_LABELS[nf.status] || nf.status}
                        </Badge>
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
                        <div className="flex items-center justify-center gap-1">
                          {nf.tem_pdf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => abrirDocumento(nf, "pdf_danfe")}
                              title="Ver PDF DANFE"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {nf.tem_xml && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => abrirDocumento(nf, "xml")}
                              title="Ver XML"
                            >
                              <FileCode className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(() => {
                            // Resumo NFe só faz sentido com XML disponível
                            if (!nf.tem_xml) return null;
                            const jaTem = !!nf.resumo_pdf_gerado_em;
                            const loading = gerandoResumo.has(nf.id);
                            if (jaTem) {
                              return (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleGerarResumo(nf, true)}
                                  disabled={loading}
                                  title="Regerar Resumo NFe"
                                >
                                  {loading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              );
                            }
                            return (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => handleGerarResumo(nf, false)}
                                disabled={loading}
                                title="Gerar Resumo NFe"
                              >
                                {loading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FilePlus2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            );
                          })()}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm("Remover esta NF do repositório? Esta ação é permanente.")) {
                                handleRemover(nf.id);
                              }
                            }}
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
