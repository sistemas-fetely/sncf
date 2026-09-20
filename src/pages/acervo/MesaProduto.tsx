// Mesa do Produto — a fila de quem cuida do ciclo de vida do produto.
// FONTE ÚNICA: a view vw_produto_mesa_lista (1 linha por SKU) já traz
// classificação (coluna `sugestao`), fase e a ficha inteira. O frontend NÃO
// classifica, não recalcula pendência e não deduz fase: só conta, recorta,
// ordena e mostra. A promoção e a descontinuação continuam passando pela edge
// function promover-fase-produto, que é quem manda no FOP (mestre do dado).
import { useMemo, useState, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, ArrowUpCircle, AlertTriangle, PackageX, Search, Ban,
  Check, X, Columns3, Download, ChevronLeft, ChevronRight, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtData, fmtDataHora } from "@/lib/data";

type Linha = Record<string, any> & {
  sku: string;
  cod_cadastro: string | null;
  nome_comercial: string | null;
  nome_operacional: string | null;
  fase: string | null;
  fase_nome: string | null;
  fase_ordem: number | null;
  sugestao: string | null;
  tem_bling: boolean | null;
  saldo_disponivel: number | null;
  falta_fase_atual: string[] | null;
  falta_proxima_fase: string[] | null;
  donos_pendencia: string[] | null;
  campos_fora_do_espelho: string[] | null;
  qtd_falta_atual: number | null;
  qtd_falta_proxima: number | null;
  atualizado_em: string | null;
};

type AbaId = "prontos" | "falta_ficha" | "bloqueados" | "ativo_sem_bling" | "furo" | "todos" | "conciliacao";

const ABAS: { id: AbaId; label: string; sugestao: string | null }[] = [
  { id: "prontos", label: "Prontos para promover", sugestao: "pronto_para_ativo" },
  { id: "falta_ficha", label: "Falta ficha no Bling", sugestao: "falta_ficha_bling" },
  { id: "bloqueados", label: "Bloqueados", sugestao: "bloqueado" },
  { id: "ativo_sem_bling", label: "Ativo sem Bling", sugestao: "ativo_sem_bling" },
  { id: "furo", label: "Furo em produto ativo", sugestao: "ativo_com_furo" },
  { id: "todos", label: "Todos", sugestao: null },
  // A última aba não recorta por `sugestao`: lê vw_produto_conciliacao.
  { id: "conciliacao", label: "Conciliação", sugestao: null },
];

const fmtNum = (v: number | null | undefined) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";

type TipoCol = "texto" | "num" | "bool" | "chips" | "badge" | "data" | "datahora";

type ColDef = { key: string; rotulo: string; tipo: TipoCol; alinharDireita?: boolean };

/** As 53 colunas da view. As 11 primeiras são as visíveis por padrão. */
const COLUNAS_PADRAO = [
  "cod_cadastro", "sku", "nome_comercial", "fase_nome", "grupo", "colecao",
  "qtd_falta_proxima", "falta_proxima_fase", "tem_bling", "saldo_disponivel", "atualizado_em",
];

const COLUNAS: ColDef[] = [
  { key: "cod_cadastro", rotulo: "Código", tipo: "texto" },
  { key: "sku", rotulo: "SKU", tipo: "texto" },
  { key: "nome_comercial", rotulo: "Nome comercial", tipo: "texto" },
  { key: "fase_nome", rotulo: "Fase", tipo: "badge" },
  { key: "grupo", rotulo: "Grupo", tipo: "texto" },
  { key: "colecao", rotulo: "Coleção", tipo: "texto" },
  { key: "qtd_falta_proxima", rotulo: "Falta (qtd) próxima", tipo: "num", alinharDireita: true },
  { key: "falta_proxima_fase", rotulo: "Falta para a próxima fase", tipo: "chips" },
  { key: "tem_bling", rotulo: "Bling", tipo: "bool" },
  { key: "saldo_disponivel", rotulo: "Saldo disponível", tipo: "num", alinharDireita: true },
  { key: "atualizado_em", rotulo: "Atualizado em", tipo: "datahora" },
  // opcionais
  { key: "nome_operacional", rotulo: "Nome operacional", tipo: "texto" },
  { key: "nome_completo", rotulo: "Nome completo", tipo: "texto" },
  { key: "fase", rotulo: "Fase (código)", tipo: "texto" },
  { key: "fase_ordem", rotulo: "Ordem da fase", tipo: "num", alinharDireita: true },
  { key: "proxima_fase", rotulo: "Próxima fase", tipo: "texto" },
  { key: "sugestao", rotulo: "Sugestão", tipo: "texto" },
  { key: "falta_fase_atual", rotulo: "Falta na fase atual", tipo: "chips" },
  { key: "qtd_falta_atual", rotulo: "Falta (qtd) atual", tipo: "num", alinharDireita: true },
  { key: "donos_pendencia", rotulo: "Quem resolve", tipo: "chips" },
  { key: "campos_fora_do_espelho", rotulo: "Campos fora do espelho", tipo: "chips" },
  { key: "ficha_completa", rotulo: "Ficha completa", tipo: "bool" },
  { key: "pronto_proxima_fase", rotulo: "Pronto p/ próxima fase", tipo: "bool" },
  { key: "ativo", rotulo: "Ativo", tipo: "bool" },
  { key: "ean", rotulo: "EAN", tipo: "texto" },
  { key: "dun", rotulo: "DUN", tipo: "texto" },
  { key: "ncm", rotulo: "NCM", tipo: "texto" },
  { key: "cest", rotulo: "CEST", tipo: "texto" },
  { key: "peso_g", rotulo: "Peso (g)", tipo: "num", alinharDireita: true },
  { key: "altura_cm", rotulo: "Altura (cm)", tipo: "num", alinharDireita: true },
  { key: "largura_cm", rotulo: "Largura (cm)", tipo: "num", alinharDireita: true },
  { key: "profundidade_cm", rotulo: "Profundidade (cm)", tipo: "num", alinharDireita: true },
  { key: "material", rotulo: "Material", tipo: "texto" },
  { key: "material_descritivo", rotulo: "Material descritivo", tipo: "texto" },
  { key: "tipo_embalagem", rotulo: "Tipo de embalagem", tipo: "texto" },
  { key: "origem_fisc", rotulo: "Origem fiscal", tipo: "texto" },
  { key: "origem_prod", rotulo: "Origem de produção", tipo: "texto" },
  { key: "preco_atacado", rotulo: "Preço atacado", tipo: "num", alinharDireita: true },
  { key: "preco_varejo", rotulo: "Preço varejo", tipo: "num", alinharDireita: true },
  { key: "preco_custo", rotulo: "Preço custo", tipo: "num", alinharDireita: true },
  { key: "multiplos", rotulo: "Múltiplos", tipo: "num", alinharDireita: true },
  { key: "qtd_kit", rotulo: "Qtd kit", tipo: "num", alinharDireita: true },
  { key: "familia", rotulo: "Família", tipo: "texto" },
  { key: "tipo", rotulo: "Tipo", tipo: "texto" },
  { key: "marca", rotulo: "Marca", tipo: "texto" },
  { key: "linha", rotulo: "Linha", tipo: "texto" },
  { key: "cor", rotulo: "Cor (código)", tipo: "texto" },
  { key: "cor_nome", rotulo: "Cor", tipo: "texto" },
  { key: "estampa", rotulo: "Estampa", tipo: "texto" },
  { key: "tamanho_numero", rotulo: "Tamanho / número", tipo: "texto" },
  { key: "departamento", rotulo: "Departamento", tipo: "texto" },
  { key: "categoria", rotulo: "Categoria", tipo: "texto" },
  { key: "descricao_produto", rotulo: "Descrição do produto", tipo: "texto" },
];

const ORDENAVEIS = new Set([
  "cod_cadastro", "sku", "nome_comercial", "fase_ordem", "qtd_falta_proxima", "atualizado_em",
]);

const TAMANHOS = [50, 100, 200, 500];

// ================= Conciliação (aba própria) =================
// Fonte: view vw_produto_conciliacao (1 linha por SKU). Compara o cadastro do
// SNCF com Bling, XPM e o cartório. Não existe tabela de regras: o dicionário
// das divergências vive AQUI, e só aqui. Slug novo na view sem rótulo aparece
// cru — nunca escondido.
type SevDiv = "critico" | "atencao";
const DIC_DIV: Record<string, { rotulo: string; sev: SevDiv; explicacao: string }> = {
  sem_cartorio: { rotulo: "Sem registro no cartório", sev: "critico", explicacao: "Produto existe mas o código não está no cartório." },
  cartorio_nao_alocado: { rotulo: "Código não alocado", sev: "critico", explicacao: "Produto usa código que o cartório não marcou como alocado." },
  cartorio_sem_inner: { rotulo: "Cartório sem Inner", sev: "atencao", explicacao: "Código alocado sem a quantidade do Inner. Vem do packing list." },
  cartorio_sku_diverge: { rotulo: "SKU diverge do cartório", sev: "critico", explicacao: "O SKU do produto não bate com o registrado no cartório." },
  sem_bling: { rotulo: "Sem produto no Bling", sev: "critico", explicacao: "Não fatura: não existe no ERP." },
  bling_duplicado: { rotulo: "Código duplicado no Bling", sev: "critico", explicacao: "Mais de uma linha no Bling com o mesmo código." },
  bling_ean_diverge: { rotulo: "EAN diverge do Bling", sev: "critico", explicacao: "O GTIN do Bling não bate com o EAN do cadastro." },
  bling_ncm_diverge: { rotulo: "NCM diverge do Bling", sev: "critico", explicacao: "NCM diferente entre cadastro e ERP: risco fiscal na NF-e." },
  bling_inativo_com_ativo: { rotulo: "Inativo no Bling", sev: "critico", explicacao: "Produto ativo aqui e inativo no ERP." },
  sem_ficha_bling: { rotulo: "Sem ficha no Bling", sev: "critico", explicacao: "Ativo sem ficha criada no ERP." },
  sem_xpm: { rotulo: "Sem cadastro no XPM", sev: "critico", explicacao: "Não expede: o armazém não conhece o produto." },
  xpm_ean_diverge: { rotulo: "EAN diverge do XPM", sev: "critico", explicacao: "Etiqueta do armazém não bate com o EAN do cadastro." },
  xpm_ncm_vazio: { rotulo: "NCM vazio no XPM", sev: "atencao", explicacao: "Cadastrado no armazém sem NCM." },
  xpm_ncm_diverge: { rotulo: "NCM diverge do XPM", sev: "critico", explicacao: "NCM diferente entre cadastro e armazém." },
  xpm_peso_padrao: { rotulo: "Peso padrão no XPM (10,11 kg)", sev: "critico", explicacao: "Valor default que ninguém corrigiu. Peso errado = cubagem e frete errados." },
  xpm_peso_diverge: { rotulo: "Peso diverge do XPM", sev: "atencao", explicacao: "Peso do armazém fora de 10% do cadastro." },
};
// Slug desconhecido do dicionário conta como crítico (não pode passar batido).
const sevDoSlug = (slug: string): SevDiv => DIC_DIV[slug]?.sev ?? "critico";
const rotuloDoSlug = (slug: string) => DIC_DIV[slug]?.rotulo ?? slug;

type ConcLinha = {
  cod_cadastro: string | null;
  sku: string;
  nome_comercial: string | null;
  colecao: string | null;
  grupo: string | null;
  fase: string | null;
  ean: string | null;
  dun: string | null;
  ncm: string | null;
  peso_g: number | null;
  qtd_kit: number | null;
  multiplos: number | null;
  preco_varejo: number | null;
  atualizado_em: string | null;
  cartorio_estado: string | null;
  cartorio_inner: number | null;
  cartorio_sku: string | null;
  bling_codigo: string | null;
  bling_gtin: string | null;
  bling_ncm: string | null;
  bling_ativo: boolean | null;
  bling_preco: number | null;
  bling_n_linhas: number | null;
  xpm_codigo: string | null;
  xpm_ean: string | null;
  xpm_ncm: string | null;
  xpm_peso_kg: number | null;
  tem_ficha_bling: boolean | null;
  divergencias: string[] | null;
  qtd_divergencias: number | null;
  existe_bling: boolean | null;
  existe_xpm: boolean | null;
};

/** Erro estruturado devolvido pela edge function (409/422/502). */
type ErroFuncao = { status: number; corpo: any };

async function chamarPromocao(payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("promover-fase-produto", {
    body: payload,
  });

  if (error) {
    const resp = (error as any)?.context as Response | undefined;
    if (resp && typeof resp.json === "function") {
      let corpo: any = null;
      try {
        corpo = await resp.json();
      } catch (_) {
        try { corpo = { erro: await resp.text() }; } catch (_e) { corpo = null; }
      }
      throw { status: resp.status, corpo } as ErroFuncao;
    }
    throw { status: 0, corpo: { erro: error.message } } as ErroFuncao;
  }

  if (!data || data.ok !== true) {
    throw { status: 0, corpo: data ?? { erro: "Resposta vazia da função" } } as ErroFuncao;
  }
  return data;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" | ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function MesaProduto() {
  const [aba, setAba] = useState<AbaId>("prontos");
  const [fase, setFase] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [emAcao, setEmAcao] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<string[]>(COLUNAS_PADRAO);
  const [ordem, setOrdem] = useState<{ coluna: string; dir: "asc" | "desc" }>({
    coluna: "cod_cadastro", dir: "asc",
  });
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(100);

  // Diálogos de erro / confirmação
  const [confirmSaldo, setConfirmSaldo] = useState<{ sku: string; saldo: number } | null>(null);
  const [faltando, setFaltando] = useState<{ sku: string; campos: string[] } | null>(null);
  const [erroFop, setErroFop] = useState<{ sku: string; corpo: string } | null>(null);

  const lista = useQuery({
    queryKey: ["mesa-produto-lista"],
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_produto_mesa_lista")
        .select("*")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
  });

  const conc = useQuery({
    queryKey: ["mesa-produto-conciliacao"],
    queryFn: async (): Promise<ConcLinha[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_produto_conciliacao")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ConcLinha[];
    },
  });

  const linhas = lista.data ?? [];
  const concLinhas = conc.data ?? [];

  // Fases vindas da própria view (rótulo de fase_nome, ordem de fase_ordem).
  const fases = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nome: string; ordem: number }>();
    for (const l of linhas) {
      const codigo = l.fase ?? "sem_fase";
      if (!mapa.has(codigo)) {
        mapa.set(codigo, {
          codigo,
          nome: l.fase_nome ?? codigo,
          ordem: typeof l.fase_ordem === "number" ? l.fase_ordem : 999,
        });
      }
    }
    return [...mapa.values()].sort((a, b) => a.ordem - b.ordem);
  }, [linhas]);

  // Contagem por aba: direto sobre `sugestao` da view (cruzada com a fase escolhida).
  const porFase = useMemo(
    () => (fase === "todas" ? linhas : linhas.filter((l) => (l.fase ?? "sem_fase") === fase)),
    [linhas, fase],
  );

  // Conciliação: mesmo filtro de fase da Mesa, sobre a view própria.
  const porFaseConc = useMemo(
    () => (fase === "todas" ? concLinhas : concLinhas.filter((l) => (l.fase ?? "sem_fase") === fase)),
    [concLinhas, fase],
  );
  const concBase = useMemo(
    () => porFaseConc.filter((l) => (l.qtd_divergencias ?? 0) > 0),
    [porFaseConc],
  );

  const contagemAba = useMemo(() => {
    const c = {} as Record<AbaId, number>;
    for (const a of ABAS) {
      if (a.id === "conciliacao") {
        c[a.id] = concBase.length;
      } else {
        c[a.id] = a.sugestao === null
          ? porFase.length
          : porFase.filter((l) => l.sugestao === a.sugestao).length;
      }
    }
    return c;
  }, [porFase, concBase]);

  const contagemFase = useMemo(() => {
    if (aba === "conciliacao") {
      const base = concLinhas.filter((l) => (l.qtd_divergencias ?? 0) > 0);
      const m = new Map<string, number>();
      for (const l of base) {
        const k = l.fase ?? "sem_fase";
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return { total: base.length, porCodigo: m };
    }
    const sug = ABAS.find((a) => a.id === aba)?.sugestao ?? null;
    const base = sug === null ? linhas : linhas.filter((l) => l.sugestao === sug);
    const m = new Map<string, number>();
    for (const l of base) {
      const k = l.fase ?? "sem_fase";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return { total: base.length, porCodigo: m };
  }, [linhas, aba, concLinhas]);

  const recorte = useMemo(() => {
    const sug = ABAS.find((a) => a.id === aba)?.sugestao ?? null;
    let base = sug === null ? porFase : porFase.filter((l) => l.sugestao === sug);
    const q = busca.trim().toLowerCase();
    if (q) {
      base = base.filter((l) =>
        [l.cod_cadastro, l.sku, l.nome_comercial, l.ean]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const mult = ordem.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[ordem.coluna];
      const vb = b[ordem.coluna];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * mult;
    });
  }, [porFase, aba, busca, ordem]);

  // ---- Recorte da aba Conciliação ----
  // filtroDiv: "todas" | "criticas" | slug de divergência
  const [filtroDiv, setFiltroDiv] = useState<string>("todas");
  const [expandido, setExpandido] = useState<string | null>(null);

  const concContagemSlugs = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of concBase) {
      for (const s of l.divergencias ?? []) m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([slug, n]) => ({ slug, n, sev: sevDoSlug(slug) }))
      .sort((a, b) => (a.sev === b.sev ? b.n - a.n : a.sev === "critico" ? -1 : 1));
  }, [concBase]);

  const concCriticas = useMemo(
    () => concBase.filter((l) => (l.divergencias ?? []).some((s) => sevDoSlug(s) === "critico")).length,
    [concBase],
  );

  const concRecorte = useMemo(() => {
    let base = concBase;
    if (filtroDiv === "criticas") {
      base = base.filter((l) => (l.divergencias ?? []).some((s) => sevDoSlug(s) === "critico"));
    } else if (filtroDiv !== "todas") {
      base = base.filter((l) => (l.divergencias ?? []).includes(filtroDiv));
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      base = base.filter((l) =>
        [l.cod_cadastro, l.sku, l.nome_comercial, l.ean]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return [...base].sort((a, b) => {
      const d = (b.qtd_divergencias ?? 0) - (a.qtd_divergencias ?? 0);
      if (d !== 0) return d;
      return String(a.cod_cadastro ?? "").localeCompare(String(b.cod_cadastro ?? ""), "pt-BR", { numeric: true });
    });
  }, [concBase, filtroDiv, busca]);

  useEffect(() => { setPagina(1); setExpandido(null); }, [aba, fase, busca, tamanho, filtroDiv]);

  const ehConc = aba === "conciliacao";
  const recorteAtivo: unknown[] = ehConc ? concRecorte : recorte;
  const totalPaginas = Math.max(1, Math.ceil(recorteAtivo.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visivelNaPagina = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  const visivelConc = concRecorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

  const colunasVisiveis = COLUNAS.filter((c) => visiveis.includes(c.key));
  const abaLabel = ABAS.find((a) => a.id === aba)?.label ?? "";
  const faseLabel = fase === "todas" ? "Todas" : (fases.find((f) => f.codigo === fase)?.nome ?? fase);

  function alternarColuna(key: string) {
    setVisiveis((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));
  }

  function ordenar(key: string) {
    if (!ORDENAVEIS.has(key)) return;
    setOrdem((o) =>
      o.coluna === key
        ? { coluna: key, dir: o.dir === "asc" ? "desc" : "asc" }
        : { coluna: key, dir: "asc" },
    );
  }

  function exportarCsvConciliacao() {
    const cab = ["Código", "SKU", "Nome comercial", "Fase", "Cartório", "Bling", "XPM", "Divergências (qtd)", "Divergências"];
    const simNao = (v: boolean | null) => (v === null || v === undefined ? "" : v ? "sim" : "não");
    const corpo = concRecorte.map((l) => [
      l.cod_cadastro, l.sku, l.nome_comercial, l.fase,
      l.cartorio_estado ? "sim" : "não",
      simNao(l.existe_bling), simNao(l.existe_xpm),
      l.qtd_divergencias ?? 0,
      (l.divergencias ?? []).map(rotuloDoSlug).join("; "),
    ].map(csvCelula).join(";")).join("\n");
    const conteudo = "\uFEFF" + cab.map(csvCelula).join(";") + "\n" + corpo;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesa-produto-conciliacao-${fmtData(new Date(), "").split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarCsv() {
    if (aba === "conciliacao") {
      exportarCsvConciliacao();
      return;
    }
    const cols = colunasVisiveis;
    const cabecalho = cols.map((c) => csvCelula(c.rotulo)).join(";");
    const corpo = recorte.map((l) => cols.map((c) => csvCelula(l[c.key])).join(";")).join("\n");
    const conteudo = "\uFEFF" + cabecalho + "\n" + corpo;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mesa-produto-${aba}-${fmtData(new Date(), "").split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function tratarErro(sku: string, e: unknown) {
    const err = e as ErroFuncao;
    const corpo = err?.corpo ?? {};
    if (err?.status === 409) {
      setConfirmSaldo({ sku, saldo: Number(corpo.saldo_disponivel ?? 0) });
      return;
    }
    if (err?.status === 422) {
      setFaltando({ sku, campos: Array.isArray(corpo.campos_faltando) ? corpo.campos_faltando : [] });
      return;
    }
    if (err?.status === 502) {
      const bruto = typeof corpo.fop_body === "string"
        ? corpo.fop_body
        : JSON.stringify(corpo.fop_body ?? corpo, null, 2);
      setErroFop({ sku, corpo: bruto });
      return;
    }
    toast.error(`Falha em ${sku}`, { description: corpo?.erro ?? "Erro sem detalhe." });
  }

  async function agir(sku: string, faseDestino: string, confirmarSaldo = false) {
    setEmAcao(sku);
    try {
      const r = await chamarPromocao({
        sku,
        fase_destino: faseDestino,
        ...(confirmarSaldo ? { confirmar_saldo: true } : {}),
      });
      toast.success(`${r.cod_cadastro ?? sku} — ${r.de ?? "?"} → ${r.para}`, {
        description: "Fase gravada no FOP e espelhada aqui.",
      });
      await lista.refetch();
    } catch (e) {
      tratarErro(sku, e);
    } finally {
      setEmAcao(null);
    }
  }

  const Chips = ({ itens, variante = "outline" as const }: { itens: string[] | null; variante?: "outline" | "secondary" }) => {
    if (!itens || itens.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const primeiros = itens.slice(0, 3);
    const resto = itens.length - primeiros.length;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {primeiros.map((c) => (
          <Badge key={c} variant={variante} className="text-[11px] font-normal">{c}</Badge>
        ))}
        {resto > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-[11px] font-normal">+{resto}</Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{itens.slice(3).join(", ")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  function celula(l: Linha, c: ColDef) {
    const v = l[c.key];
    switch (c.tipo) {
      case "chips":
        return <Chips itens={Array.isArray(v) ? v : null} variante={c.key === "donos_pendencia" ? "secondary" : "outline"} />;
      case "badge":
        return <Badge variant="outline">{v ?? l.fase ?? "—"}</Badge>;
      case "bool":
        if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                {v
                  ? <Check className="h-4 w-4 text-success" />
                  : <X className="h-4 w-4 text-destructive" />}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {c.key === "tem_bling"
                ? (v ? "Com ficha no Bling" : "Sem ficha no Bling")
                : (v ? "Sim" : "Não")}
            </TooltipContent>
          </Tooltip>
        );
      case "num": {
        if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
        const zeroPositivo = c.key === "qtd_falta_proxima" && Number(v) === 0;
        return (
          <span className={zeroPositivo ? "font-medium text-success" : "tabular-nums"}>
            {fmtNum(Number(v))}
          </span>
        );
      }
      case "data":
        return <span className="text-sm">{fmtData(v)}</span>;
      case "datahora":
        return <span className="text-sm text-muted-foreground">{fmtDataHora(v)}</span>;
      default: {
        if (v === null || v === undefined || String(v).trim() === "") {
          return <span className="text-muted-foreground">—</span>;
        }
        const texto = String(v);
        if (c.key === "cod_cadastro") {
          const fora = Array.isArray(l.campos_fora_do_espelho) ? l.campos_fora_do_espelho : [];
          return (
            <div className="flex items-center gap-1.5">
              <Link
                to={`/vendas/produto/ficha/${encodeURIComponent(texto)}`}
                className="font-medium tracking-tight underline-offset-2 hover:underline"
              >
                {texto}
              </Link>
              {fora.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    campo exigido pela matriz que não existe na tabela do SNCF: {fora.join(", ")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        }
        return <span className="text-sm">{texto}</span>;
      }
    }
  }

  // Rodapé de paginação compartilhado pelas abas (Mesa e Conciliação).
  const rodape = (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Mostrando{" "}
        <span className="font-medium text-foreground tabular-nums">
          {recorteAtivo.length === 0 ? 0 : (paginaAtual - 1) * tamanho + 1}–{Math.min(paginaAtual * tamanho, recorteAtivo.length)}
        </span>{" "}
        de <span className="font-medium text-foreground tabular-nums">{recorteAtivo.length}</span>
      </span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {TAMANHOS.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={n === tamanho ? "default" : "outline"}
              className="h-8 px-2 tabular-nums"
              onClick={() => setTamanho(n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={paginaAtual <= 1}
          onClick={() => setPagina(paginaAtual - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">{paginaAtual} / {totalPaginas}</span>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          disabled={paginaAtual >= totalPaginas}
          onClick={() => setPagina(paginaAtual + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
    <PageShell>
      <PageHeader
        titulo="Mesa do Produto"
        icone={PackageX}
        estado={
          lista.isLoading
            ? "Carregando fila…"
            : `${recorteAtivo.length} de ${ehConc ? concLinhas.length : linhas.length} produtos · aba ${abaLabel} · fase ${faseLabel}`
        }
        acoes={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportarCsv} disabled={recorteAtivo.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => lista.refetch()} disabled={lista.isFetching}>
              {lista.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        }
      />

      {lista.isError && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Falha ao ler a fila: {(lista.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fila por situação</CardTitle>
          <CardDescription>
            Cada aba é um recorte da mesma leitura. O código de cadastro é o código de conversa.
          </CardDescription>

          {/* Filtro de fase — interseção com a aba, sempre visível */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-medium text-muted-foreground">Fase</span>
            <ToggleGroup
              type="single"
              value={fase}
              onValueChange={(v) => v && setFase(v)}
              className="flex-wrap justify-start"
            >
              <ToggleGroupItem value="todas" size="sm" className="gap-1.5 text-xs">
                Todas
                <Badge variant="secondary" className="text-[10px]">{contagemFase.total}</Badge>
              </ToggleGroupItem>
              {fases.map((f) => (
                <ToggleGroupItem key={f.codigo} value={f.codigo} size="sm" className="gap-1.5 text-xs">
                  {f.nome}
                  <Badge variant="secondary" className="text-[10px]">
                    {contagemFase.porCodigo.get(f.codigo) ?? 0}
                  </Badge>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por código de cadastro, SKU ou nome"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 className="mr-2 h-4 w-4" />
                  Colunas ({colunasVisiveis.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
                  <span>Colunas da view</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVisiveis(COLUNAS_PADRAO)}>
                    Padrão
                  </Button>
                </div>
                <ScrollArea className="h-80">
                  <div className="space-y-1 p-2">
                    {COLUNAS.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={visiveis.includes(c.key)}
                          onCheckedChange={() => alternarColuna(c.key)}
                        />
                        <span className="truncate">{c.rotulo}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={aba} onValueChange={(v) => setAba(v as AbaId)}>
            <TabsList className="mb-4 flex-wrap">
              {ABAS.map((a) => (
                <TabsTrigger key={a.id} value={a.id} className="gap-2">
                  {a.label}
                  <Badge variant="secondary" className="text-[11px]">{contagemAba[a.id] ?? 0}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {aba === "falta_ficha" && (
            <p className="mb-3 text-sm text-muted-foreground">
              Sem cadastro no Bling o produto não emite nota fiscal. A criação do cadastro
              virá numa próxima entrega; por ora esta aba só mostra quem está nessa situação.
            </p>
          )}
          {aba === "furo" && (
            <p className="mb-3 text-sm text-muted-foreground">
              Produto que já fatura, mas tem campo obrigatório da própria fase vazio.
            </p>
          )}

          {lista.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : recorte.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum produto neste recorte.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {colunasVisiveis.map((c) => (
                        <TableHead
                          key={c.key}
                          className={c.alinharDireita ? "text-right" : undefined}
                          aria-sort={
                            ordem.coluna === c.key
                              ? (ordem.dir === "asc" ? "ascending" : "descending")
                              : "none"
                          }
                        >
                          {ORDENAVEIS.has(c.key) ? (
                            <button
                              type="button"
                              onClick={() => ordenar(c.key)}
                              className="group inline-flex items-center gap-1 hover:text-foreground"
                            >
                              {c.rotulo}
                              {ordem.coluna !== c.key ? (
                                <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
                              ) : ordem.dir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )}
                            </button>
                          ) : (
                            c.rotulo
                          )}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visivelNaPagina.map((l) => (
                      <TableRow key={l.sku}>
                        {colunasVisiveis.map((c) => (
                          <TableCell key={c.key} className={c.alinharDireita ? "text-right" : undefined}>
                            {celula(l, c)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {(l.fase === "ativo" || l.fase === "pre_venda") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={emAcao === l.sku}
                                onClick={() => agir(l.sku, "inativo")}
                              >
                                <Ban className="mr-1.5 h-3.5 w-3.5" />
                                Descontinuar
                              </Button>
                            )}
                            {l.sugestao === "pronto_para_ativo" && (
                              <Button
                                size="sm"
                                disabled={emAcao === l.sku}
                                onClick={() => agir(l.sku, "ativo")}
                              >
                                {emAcao === l.sku
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />}
                                Promover para Ativo
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {rodape}
            </>
          )}

          {/* ================= Aba Conciliação ================= */}
          {ehConc && (
            conc.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : conc.isError ? (
              <Card className="border-destructive">
                <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Falha ao ler a conciliação: {(conc.error as Error)?.message}
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  Compara o cadastro do SNCF com Bling, XPM e o cartório de códigos.
                  Esta aba aponta; corrigir é pela Ficha do Produto ou pelo dono do sistema de origem.
                </p>

                {/* Resumo clicável */}
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={filtroDiv === "todas" ? "default" : "outline"}
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setFiltroDiv("todas")}
                  >
                    Com divergência
                    <Badge variant="secondary" className="text-[10px]">{concBase.length}</Badge>
                  </Button>
                  <Button
                    size="sm"
                    variant={filtroDiv === "criticas" ? "default" : "outline"}
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setFiltroDiv("criticas")}
                  >
                    Críticas
                    <Badge variant="secondary" className="text-[10px]">{concCriticas}</Badge>
                  </Button>
                  {concContagemSlugs.map((s) => (
                    <Button
                      key={s.slug}
                      size="sm"
                      variant={filtroDiv === s.slug ? "default" : "outline"}
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => setFiltroDiv(s.slug)}
                    >
                      {rotuloDoSlug(s.slug)}
                      <Badge variant="secondary" className="text-[10px]">{s.n}</Badge>
                    </Button>
                  ))}
                </div>

                {concRecorte.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum produto com divergência neste recorte.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Nome comercial</TableHead>
                            <TableHead>Fase</TableHead>
                            <TableHead>Cartório · Bling · XPM</TableHead>
                            <TableHead className="text-right">Divergências</TableHead>
                            <TableHead>Quais</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visivelConc.map((l) => {
                            const divs = l.divergencias ?? [];
                            const presencas: { nome: string; ok: boolean | null }[] = [
                              { nome: "Cartório", ok: l.cartorio_estado != null },
                              { nome: "Bling", ok: l.existe_bling },
                              { nome: "XPM", ok: l.existe_xpm },
                            ];
                            return (
                              <Fragment key={l.sku}>
                                <TableRow
                                  className="cursor-pointer"
                                  onClick={() => setExpandido((e) => (e === l.sku ? null : l.sku))}
                                >
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      {expandido === l.sku
                                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                      {l.cod_cadastro ? (
                                        <Link
                                          to={`/vendas/produto/ficha/${encodeURIComponent(l.cod_cadastro)}`}
                                          className="font-medium tracking-tight underline-offset-2 hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {l.cod_cadastro}
                                        </Link>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm">{l.sku}</TableCell>
                                  <TableCell className="text-sm">{l.nome_comercial ?? "—"}</TableCell>
                                  <TableCell><Badge variant="outline">{l.fase ?? "—"}</Badge></TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {presencas.map((p) => (
                                        <Tooltip key={p.nome}>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex items-center gap-1">
                                              {p.ok
                                                ? <Check className="h-4 w-4 text-success" />
                                                : <X className="h-4 w-4 text-destructive" />}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>{p.nome}: {p.ok ? "presente" : "ausente"}</TooltipContent>
                                        </Tooltip>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{l.qtd_divergencias ?? 0}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap items-center gap-1">
                                      {divs.slice(0, 3).map((s) => (
                                        <Tooltip key={s}>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex">
                                              <Badge
                                                variant={sevDoSlug(s) === "critico" ? "destructive" : "outline"}
                                                className={sevDoSlug(s) === "critico" ? "text-[11px] font-normal" : "border-warning/60 text-[11px] font-normal text-warning"}
                                              >
                                                {rotuloDoSlug(s)}
                                              </Badge>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            {DIC_DIV[s]?.explicacao ?? `Divergência sem rótulo no dicionário: ${s}`}
                                          </TooltipContent>
                                        </Tooltip>
                                      ))}
                                      {divs.length > 3 && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="inline-flex">
                                              <Badge variant="secondary" className="text-[11px] font-normal">+{divs.length - 3}</Badge>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            {divs.slice(3).map(rotuloDoSlug).join(", ")}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {expandido === l.sku && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="bg-muted/30 p-4">
                                      <DeParaConciliacao l={l} />
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {rodape}
                  </>
                )}
              </>
            )
          )}
        </CardContent>
      </Card>

      {/* 409 — saldo em estoque na descontinuação */}
      <AlertDialog open={!!confirmSaldo} onOpenChange={(o) => !o && setConfirmSaldo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descontinuar com saldo em estoque?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O produto <strong>{confirmSaldo?.sku}</strong> ainda tem saldo disponível.
                  Descontinuar não apaga o saldo — ele passa a ser queima.
                </p>
                <div className="rounded-md border bg-muted/40 p-3 text-center">
                  <div className="text-xs uppercase text-muted-foreground">Saldo disponível</div>
                  <div className="text-2xl font-semibold">{fmtNum(confirmSaldo?.saldo ?? 0)}</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const sku = confirmSaldo?.sku;
                setConfirmSaldo(null);
                if (sku) agir(sku, "inativo", true);
              }}
            >
              Descontinuar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 422 — campos faltando */}
      <Dialog open={!!faltando} onOpenChange={(o) => !o && setFaltando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ficha incompleta</DialogTitle>
            <DialogDescription>
              O produto <strong>{faltando?.sku}</strong> não pode avançar de fase enquanto
              estes campos estiverem vazios:
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {(faltando?.campos ?? []).length === 0 ? (
              <span className="text-sm text-muted-foreground">A função não detalhou os campos.</span>
            ) : (
              faltando!.campos.map((c) => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaltando(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 502 — resposta bruta do FOP */}
      <Dialog open={!!erroFop} onOpenChange={(o) => !o && setErroFop(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              O FOP recusou a mudança
            </DialogTitle>
            <DialogDescription>
              Resposta na íntegra da trava do banco do FOP para <strong>{erroFop?.sku}</strong>.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
            {erroFop?.corpo}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErroFop(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
    </TooltipProvider>
  );
}
