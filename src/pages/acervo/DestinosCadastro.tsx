import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, ChevronDown, Download, FileSpreadsheet, Loader2, Upload, ExternalLink, Info,
} from "lucide-react";

const VERDE = "#1A4A3A";

const COL_NCM = "NCM";
const COL_ORIGEM = "Origem";
const COL_CODIGO = "Código";
const COL_GRUPO = "Grupo de produtos";
const COL_CEST = "CEST";
const COL_PESO = "Peso líquido (Kg)";
const COL_ALTURA = "Altura do Produto";
const COL_LARGURA = "Largura do produto";
const COL_PROFUNDIDADE = "Profundidade do produto";

/** Grupos REAIS do Bling — a tela nunca escreve neles, só audita. */
const GRUPO_ESPERADO: Record<string, string> = {
  "2": "L1 - Produto Nacional Importado",
  "0": "L2 - Produto Nacional",
};

interface EstoqueSncf {
  sku: string;
  nome_comercial: string | null;
  estoque_virtual: number | null;
  tem_razao: boolean | null;
}

/** Formato BR idêntico ao arquivo de entrada: 1404 -> "1.404,00" */
function numeroBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Lê número em formato BR do CSV. Vazio => null. */
function parseNumeroBR(v: string | undefined): number | null {
  const s = (v ?? "").replace(/\t/g, "").trim();
  if (s === "") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}


/** Campos completáveis: coluna do CSV -> campo da view. Origem NUNCA entra aqui. */
const MAPA_FISCAL: { coluna: string; campo: keyof FiscalSncf; rotulo: string }[] = [
  { coluna: COL_NCM, campo: "ncm_sncf", rotulo: "NCM" },
  { coluna: COL_CEST, campo: "cest_sncf", rotulo: "CEST" },
  { coluna: COL_PESO, campo: "peso_liquido_br", rotulo: "Peso líquido" },
  { coluna: COL_ALTURA, campo: "altura_br", rotulo: "Altura" },
  { coluna: COL_LARGURA, campo: "largura_br", rotulo: "Largura" },
  { coluna: COL_PROFUNDIDADE, campo: "profundidade_br", rotulo: "Profundidade" },
];

interface FiscalSncf {
  sku: string;
  nome_comercial: string | null;
  ncm_sncf: string | null;
  cest_sncf: string | null;
  peso_liquido_br: string | null;
  altura_br: string | null;
  largura_br: string | null;
  profundidade_br: string | null;
  ean: string | null;
  ativo_sncf: boolean | null;
  situacao_sugerida: string | null;
}

/** Normaliza só para COMPARAR: remove tabs de proteção e espaços. */
function chaveSku(v: string): string {
  return v.replace(/\t/g, "").trim().toUpperCase();
}

/** Vazio de verdade. "0,00" é valor preenchido. */
function celulaVazia(v: string | undefined): boolean {
  return (v ?? "").replace(/\t/g, "").trim() === "";
}

function semAcento(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}


interface ParsedCsv {
  header: string[];
  rows: string[][];
}


/**
 * Parser de CSV do Bling: separador ';', campos entre aspas duplas,
 * CRLF, aspas escapadas como "". Devolve as células VERBATIM
 * (inclusive tabs de proteção do Excel em Código e GTIN/EAN).
 */
function parseCsvBling(text: string): ParsedCsv {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (dentroAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroAspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
      i++;
      continue;
    }
    if (c === ";") {
      linha.push(campo);
      campo = "";
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      rows.push(linha);
      linha = [];
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    rows.push(linha);
  }
  const naoVazias = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (naoVazias.length === 0) throw new Error("Arquivo vazio ou sem linhas legíveis.");
  const [header, ...resto] = naoVazias;
  return { header: header.map((h) => h.trim()), rows: resto };
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function gerarCsv(header: string[], rows: string[][]): Blob {
  const linhas = [header, ...rows].map((r) => r.map(csvEscape).join(";"));
  const conteudo = "\uFEFF" + linhas.join("\r\n") + "\r\n";
  return new Blob([conteudo], { type: "text/csv;charset=utf-8" });
}

function corGrupo(grupo: string) {
  if (grupo === "FISCAL-REVISAR" || grupo === "FISCAL-NAO-MERCADORIA") return "amber";
  return "ok";
}

export default function DestinosCadastro() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [grupos, setGrupos] = useState<string[] | null>(null); // por linha
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [fiscal, setFiscal] = useState<Map<string, FiscalSncf> | null>(null);
  const [fiscalErro, setFiscalErro] = useState<string | null>(null);
  const [fiscalCarregando, setFiscalCarregando] = useState(false);
  const [detalheAberto, setDetalheAberto] = useState(false);
  const [estoque, setEstoque] = useState<Map<string, EstoqueSncf> | null>(null);
  const [estoqueErro, setEstoqueErro] = useState<string | null>(null);
  const [ancoras, setAncoras] = useState<Map<string, string> | null>(null); // sku -> origem_fisc

  const carregarFiscal = async () => {
    setFiscalCarregando(true);
    setFiscalErro(null);
    setEstoqueErro(null);
    try {
      const [resFiscal, resEstoque, resAncora] = await Promise.all([
        (supabase as any)
          .from("vw_bling_completar_fiscal")
          .select(
            "sku, nome_comercial, ncm_sncf, cest_sncf, peso_liquido_br, altura_br, largura_br, profundidade_br, ean, ativo_sncf, situacao_sugerida",
          ),
        (supabase as any)
          .from("vw_estoque")
          .select("sku, nome_comercial, estoque_virtual, tem_razao")
          .range(0, 9999),
        (supabase as any)
          .from("sncf_produtos")
          .select("sku, origem_fisc")
          .range(0, 9999),
      ]);

      if (resEstoque.error) setEstoqueErro(formatError(resEstoque.error));
      else {
        const me = new Map<string, EstoqueSncf>();
        for (const r of (resEstoque.data ?? []) as EstoqueSncf[]) {
          if (r.sku) me.set(chaveSku(r.sku), r);
        }
        setEstoque(me);
      }

      if (resAncora.error) setAncoras(null);
      else {
        const ma = new Map<string, string>();
        for (const r of (resAncora.data ?? []) as { sku: string | null; origem_fisc: string | null }[]) {
          if (r.sku && r.origem_fisc) ma.set(chaveSku(r.sku), String(r.origem_fisc).trim());
        }
        setAncoras(ma);
      }

      if (resFiscal.error) throw resFiscal.error;
      const m = new Map<string, FiscalSncf>();
      for (const r of (resFiscal.data ?? []) as FiscalSncf[]) {
        if (r.sku) m.set(chaveSku(r.sku), r);
      }
      setFiscal(m);
    } catch (e) {
      setFiscal(null);
      setFiscalErro(formatError(e));
    } finally {
      setFiscalCarregando(false);
    }
  };

  const idx = useMemo(() => {
    if (!parsed) return null;
    const find = (nome: string) => parsed.header.findIndex((h) => h === nome);
    return {
      ncm: find(COL_NCM),
      origem: find(COL_ORIGEM),
      codigo: find(COL_CODIGO),
      grupo: find(COL_GRUPO),
      descricao: parsed.header.findIndex((h) => h === "Descrição"),
      situacao: parsed.header.findIndex((h) => semAcento(h) === "situacao"),
      estoque: parsed.header.findIndex((h) => semAcento(h) === "estoque"),
      preco: parsed.header.findIndex((h) => {
        const n = semAcento(h);
        return n.includes("preco") && n.includes("venda");
      }),
    };
  }, [parsed]);



  const resetar = () => {
    setParsed(null);
    setGrupos(null);
    setErro(null);
    setArquivoNome(null);
    setDetalheAberto(false);
  };

  const handleArquivo = async (file: File) => {
    resetar();
    setProcessando(true);
    setArquivoNome(file.name);
    try {
      const texto = await file.text();
      const p = parseCsvBling(texto);

      const faltando = [COL_NCM, COL_ORIGEM, COL_CODIGO, COL_GRUPO].filter(
        (c) => !p.header.includes(c),
      );
      if (faltando.length > 0) {
        throw new Error(
          `CSV inválido: coluna${faltando.length > 1 ? "s" : ""} obrigatória${faltando.length > 1 ? "s" : ""} não encontrada${faltando.length > 1 ? "s" : ""}: ${faltando.join(", ")}. Use o export original do Bling, sem editar o cabeçalho.`,
        );
      }

      const iNcm = p.header.indexOf(COL_NCM);
      const iOrigem = p.header.indexOf(COL_ORIGEM);

      // Pares distintos NCM+Origem — no máximo ~15, uma chamada por par distinto.
      const pares = new Map<string, { ncm: string; origem: string }>();
      for (const r of p.rows) {
        const ncm = (r[iNcm] ?? "").trim();
        const origem = (r[iOrigem] ?? "").trim();
        pares.set(`${ncm}|${origem}`, { ncm, origem });
      }

      // Uma chamada por par distinto (~15), todas em paralelo — nunca por linha.
      const entradas = [...pares.entries()];
      const respostas = await Promise.all(
        entradas.map(async ([, par]) => {
          const { data, error } = await (supabase as any).rpc("fn_grupo_fiscal", {
            p_ncm: par.ncm,
            p_origem: par.origem,
          });
          if (error) throw error;
          return (data as string) ?? "FISCAL-REVISAR";
        }),
      );
      const resolvidos = new Map<string, string>();
      entradas.forEach(([chave], i) => resolvidos.set(chave, respostas[i]));

      const porLinha = p.rows.map((r) => {
        const chave = `${(r[iNcm] ?? "").trim()}|${(r[iOrigem] ?? "").trim()}`;
        return resolvidos.get(chave) ?? "FISCAL-REVISAR";
      });

      setParsed(p);
      setGrupos(porLinha);
      toast.success(`${p.rows.length} produto(s) lido(s) · ${pares.size} par(es) NCM+Origem`);
      await carregarFiscal();
    } catch (e) {
      const msg = formatError(e);
      setErro(msg);
      setParsed(null);
      setGrupos(null);
      toast.error(msg);
    } finally {
      setProcessando(false);
    }
  };

  /**
   * Plano de completar: por linha, quais colunas vazias o SNCF preenche.
   * Nunca sobrescreve célula com valor. Nunca toca em Origem.
   */
  const plano = useMemo(() => {
    if (!parsed || !idx) return null;
    const indices = new Map<string, number>();
    for (const m of MAPA_FISCAL) {
      const i = parsed.header.findIndex((h) => h === m.coluna);
      if (i >= 0) indices.set(m.coluna, i);
    }
    const porLinha: { col: number; valor: string; rotulo: string }[][] = [];
    const detalhes: { codigo: string; descricao: string; campos: string[] }[] = [];
    let naoEncontrados = 0;

    parsed.rows.forEach((r) => {
      const preenche: { col: number; valor: string; rotulo: string }[] = [];
      const codigoRaw = r[idx.codigo] ?? "";
      const info = fiscal?.get(chaveSku(codigoRaw));
      if (fiscal && !info) naoEncontrados++;
      if (info) {
        for (const m of MAPA_FISCAL) {
          const col = indices.get(m.coluna);
          if (col === undefined) continue;
          if (!celulaVazia(r[col])) continue;
          const valor = (info[m.campo] as string | null) ?? "";
          if (valor.trim() === "") continue;
          preenche.push({ col, valor, rotulo: m.rotulo });
        }
      }
      porLinha.push(preenche);
      if (preenche.length > 0) {
        detalhes.push({
          codigo: codigoRaw.replace(/\t/g, "").trim(),
          descricao: idx.descricao >= 0 ? r[idx.descricao] ?? "" : info?.nome_comercial ?? "",
          campos: preenche.map((p) => p.rotulo),
        });
      }
    });

    return { porLinha, detalhes, naoEncontrados };
  }, [parsed, idx, fiscal]);

  /**
   * Plano de Estoque: só substitui quando tem_razao = true.
   * Sem razão, SKU ausente ou valor nulo => coluna volta VERBATIM. Nunca escreve 0 por ausência.
   */
  const planoEstoque = useMemo(() => {
    if (!parsed || !idx || idx.estoque < 0 || !estoque) return null;
    const porLinha: (string | null)[] = [];
    const diffs: {
      codigo: string;
      nome: string;
      csv: number | null;
      sncf: number;
      delta: number;
    }[] = [];
    let iguais = 0;
    let sobem = 0;
    let descem = 0;
    let semRazao = 0;
    let semAncora = 0;

    parsed.rows.forEach((r) => {
      const codigoRaw = r[idx.codigo] ?? "";
      const info = estoque.get(chaveSku(codigoRaw));
      if (!info) {
        semAncora++;
        porLinha.push(null);
        return;
      }
      if (info.tem_razao !== true) {
        semRazao++;
        porLinha.push(null);
        return;
      }
      const valor = info.estoque_virtual;
      if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
        semRazao++;
        porLinha.push(null);
        return;
      }
      const sncf = Number(valor);
      const csv = parseNumeroBR(r[idx.estoque]);
      porLinha.push(numeroBR(sncf));
      if (csv !== null && Math.abs(csv - sncf) < 0.005) {
        iguais++;
        return;
      }
      const base = csv ?? 0;
      if (sncf > base) sobem++;
      else descem++;
      diffs.push({
        codigo: codigoRaw.replace(/\t/g, "").trim(),
        nome:
          idx.descricao >= 0 ? r[idx.descricao] ?? "" : info.nome_comercial ?? "",
        csv,
        sncf,
        delta: sncf - base,
      });
    });

    diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return {
      porLinha,
      iguais,
      sobem,
      descem,
      semRazao,
      semAncora,
      aAtualizar: sobem + descem,
      top: diffs.slice(0, 15),
    };
  }, [parsed, idx, estoque]);


  /** AUDITORIA INFORMATIVA: quebra pelo grupo que veio do CSV. Nunca escreve. */
  const contagem = useMemo(() => {
    if (!parsed || !idx) return [];
    const m = new Map<string, number>();
    for (const r of parsed.rows) {
      const g = (r[idx.grupo] ?? "").replace(/\t/g, "").trim() || "(vazio)";
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [parsed, idx]);

  /** Grupo do CSV vs esperado pela âncora origem_fisc. Só sinalização. */
  const grupoDivergente = useMemo(() => {
    if (!parsed || !idx || !ancoras) return null;
    let n = 0;
    for (const r of parsed.rows) {
      const origem = ancoras.get(chaveSku(r[idx.codigo] ?? ""));
      if (!origem) continue;
      const esperado = GRUPO_ESPERADO[origem];
      if (!esperado) continue;
      const atual = (r[idx.grupo] ?? "").replace(/\t/g, "").trim();
      if (atual !== esperado) n++;
    }
    return n;
  }, [parsed, idx, ancoras]);


  const paraRevisar = useMemo(() => {
    if (!parsed || !grupos || !idx) return [];
    return parsed.rows
      .map((r, i) => ({ r, grupo: grupos[i] }))
      .filter((x) => x.grupo === "FISCAL-REVISAR" || x.grupo === "FISCAL-NAO-MERCADORIA")
      .map((x) => ({
        codigo: x.r[idx.codigo] ?? "",
        descricao: idx.descricao >= 0 ? x.r[idx.descricao] ?? "" : "",
        grupo: x.grupo,
      }));
  }, [parsed, grupos, idx]);

  /**
   * Plano de Situação: SKU presente no SNCF manda o valor sugerido.
   * SKU AUSENTE da view não é tocado — ausência não autoriza inativar.
   */
  const planoSituacao = useMemo(() => {
    if (!parsed || !idx || idx.situacao < 0 || !fiscal) return null;
    const porLinha: (string | null)[] = [];
    const mudancas: { codigo: string; descricao: string; de: string; para: string }[] = [];
    parsed.rows.forEach((r) => {
      const info = fiscal.get(chaveSku(r[idx.codigo] ?? ""));
      const sugerida = (info?.situacao_sugerida ?? "").trim();
      if (!info || sugerida === "") {
        porLinha.push(null);
        return;
      }
      porLinha.push(sugerida);
      const atual = (r[idx.situacao] ?? "").replace(/\t/g, "").trim();
      if (semAcento(atual) !== semAcento(sugerida)) {
        mudancas.push({
          codigo: (r[idx.codigo] ?? "").replace(/\t/g, "").trim(),
          descricao: idx.descricao >= 0 ? r[idx.descricao] ?? "" : info.nome_comercial ?? "",
          de: atual === "" ? "—" : atual,
          para: sugerida,
        });
      }
    });
    const indoParaInativo = mudancas.filter((m) => semAcento(m.para) === "inativo").length;
    return { porLinha, mudancas, indoParaInativo };
  }, [parsed, idx, fiscal]);

  const resumo = useMemo(() => {
    if (!parsed || !grupos || !idx) return null;
    let jaPreenchido = 0;
    let vaiMudar = 0;
    parsed.rows.forEach((r, i) => {
      const mudaFiscal = (plano?.porLinha[i]?.length ?? 0) > 0;
      const sit = planoSituacao?.porLinha[i];
      const mudaSituacao =
        !!sit &&
        idx.situacao >= 0 &&
        semAcento((r[idx.situacao] ?? "").replace(/\t/g, "").trim()) !== semAcento(sit);
      const est = planoEstoque?.porLinha[i];
      const mudaEstoque =
        !!est &&
        idx.estoque >= 0 &&
        (r[idx.estoque] ?? "").replace(/\t/g, "").trim() !== est;
      if (mudaFiscal || mudaSituacao || mudaEstoque) vaiMudar++;
      else jaPreenchido++;
    });
    return { jaPreenchido, vaiMudar, completados: plano?.detalhes.length ?? 0 };
  }, [parsed, grupos, idx, plano, planoSituacao, planoEstoque]);



  // NCM vazio avaliado DEPOIS do completar pelo SNCF, separado por motivo.
  const semNcm = useMemo(() => {
    if (!parsed || !idx) return { falhaCompletar: [], ausenteSncf: [] } as {
      falhaCompletar: { codigo: string; descricao: string; preco: string }[];
      ausenteSncf: { codigo: string; descricao: string; preco: string }[];
    };
    const falhaCompletar: { codigo: string; descricao: string; preco: string }[] = [];
    const ausenteSncf: { codigo: string; descricao: string; preco: string }[] = [];
    parsed.rows.forEach((r, i) => {
      if (!celulaVazia(r[idx.ncm])) return;
      if (plano?.porLinha[i]?.some((p) => p.col === idx.ncm)) return;
      const linha = {
        codigo: (r[idx.codigo] ?? "").replace(/\t/g, "").trim(),
        descricao: idx.descricao >= 0 ? r[idx.descricao] ?? "" : "",
        preco: idx.preco >= 0 ? (r[idx.preco] ?? "").trim() : "",
      };
      const existe = fiscal ? fiscal.has(chaveSku(r[idx.codigo] ?? "")) : true;
      if (existe) falhaCompletar.push(linha);
      else ausenteSncf.push(linha);
    });
    return { falhaCompletar, ausenteSncf };
  }, [parsed, idx, plano, fiscal]);

  const baixar = () => {
    if (!parsed || !grupos || !idx) return;
    try {
      const rows = parsed.rows.map((r, i) => {
        const copia = [...r];
        while (copia.length < parsed.header.length) copia.push("");
        copia[idx.grupo] = grupos[i];
        for (const p of plano?.porLinha[i] ?? []) copia[p.col] = p.valor;
        const sit = planoSituacao?.porLinha[i];
        if (sit && idx.situacao >= 0) copia[idx.situacao] = sit;
        return copia;
      });
      const blob = gerarCsv(parsed.header, rows);
      const hoje = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bling_produtos_grupos_${hoje}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo gerado");
    } catch (e) {
      toast.error(formatError(e));
    }
  };



  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Destinos de Cadastro</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prepara arquivos de cadastro para os sistemas de destino. Nada é gravado no banco nesta
          tela — ela lê o arquivo, calcula e devolve outro arquivo.
        </p>
      </div>

      <Tabs defaultValue="bling">
        <TabsList>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="xpm">XPM</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
        </TabsList>

        <TabsContent value="bling" className="mt-4 space-y-4">
          {/* PASSO 1 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> 1. Subir o export do Bling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Gere o arquivo em{" "}
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  Bling &gt; Cadastros &gt; Produtos &gt; Exportar dados para planilha
                </code>{" "}
                e suba o <strong>.csv</strong> sem editar nada.
              </p>
              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleArquivo(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  onClick={() => inputRef.current?.click()}
                  disabled={processando}
                  style={{ backgroundColor: VERDE }}
                  className="text-white hover:opacity-90 gap-2"
                >
                  {processando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Escolher arquivo
                </Button>
                {arquivoNome && (
                  <span className="text-xs text-muted-foreground truncate">{arquivoNome}</span>
                )}
                {parsed && (
                  <Button variant="ghost" size="sm" onClick={resetar}>
                    Limpar
                  </Button>
                )}
              </div>

              {erro && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Não foi possível processar o arquivo</AlertTitle>
                  <AlertDescription className="text-xs break-words">{erro}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* PASSO 2 */}
          {parsed && grupos && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  2. Prévia
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {parsed.rows.length} produto(s) · {parsed.header.length} colunas
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Esta tela pode alterar apenas estas colunas:{" "}
                    <strong>
                      Grupo de produtos, Situação, NCM, CEST, Peso líquido, Altura, Largura,
                      Profundidade
                    </strong>
                    . Todas as demais voltam verbatim. A coluna <strong>Origem</strong> nunca é
                    tocada.
                  </AlertDescription>
                </Alert>


                {fiscalCarregando && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados fiscais do
                    SNCF…
                  </p>
                )}

                {fiscalErro && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Completar fiscal indisponível</AlertTitle>
                    <AlertDescription className="text-xs space-y-2 break-words">
                      <p>{fiscalErro}</p>
                      <p>
                        Você pode seguir só com o Grupo de Produtos — nenhum campo fiscal vazio será
                        completado.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void carregarFiscal()}
                        disabled={fiscalCarregando}
                      >
                        Tentar de novo
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {resumo && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Já preenchido</p>
                      <p className="text-2xl font-bold">{resumo.jaPreenchido}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Vai mudar</p>
                      <p className="text-2xl font-bold">{resumo.vaiMudar}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Completado pelo SNCF</p>
                      <p className="text-2xl font-bold">{resumo.completados}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Situação a mudar</p>
                      <p className="text-2xl font-bold">
                        {planoSituacao ? planoSituacao.mudancas.length : "—"}
                      </p>
                    </div>
                  </div>
                )}

                {planoSituacao && planoSituacao.mudancas.length > 0 && (
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      planoSituacao.indoParaInativo > 0
                        ? "border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20"
                        : ""
                    }`}
                  >
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {planoSituacao.indoParaInativo > 0 && (
                        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                      )}
                      Situação a mudar: {planoSituacao.mudancas.length} linha
                      {planoSituacao.mudancas.length > 1 ? "s" : ""}
                    </p>
                    {planoSituacao.indoParaInativo > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Estes produtos estão inativos no SNCF e ativos no Bling. A importação vai
                        inativá-los.
                      </p>
                    )}
                    <div className="max-h-56 overflow-auto text-xs space-y-1">
                      {planoSituacao.mudancas.map((m, i) => (
                        <div key={`${m.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{m.codigo}</span>
                          <span className="text-muted-foreground truncate flex-1">
                            {m.descricao}
                          </span>
                          <span className="shrink-0 font-mono">
                            {m.de} → <strong>{m.para}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {resumo?.vaiMudar === 0 && (
                  <Alert className="border-emerald-500/50 bg-emerald-50/60 dark:bg-emerald-950/20">
                    <Info className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-400">
                      O Bling já está sincronizado. O download é opcional.
                    </AlertDescription>
                  </Alert>
                )}

                {plano && plano.naoEncontrados > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {plano.naoEncontrados} SKU não encontrado no SNCF — essas linhas não recebem
                    completar fiscal (informativo).
                  </p>
                )}

                {plano && plano.detalhes.length > 0 && (
                  <div className="rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setDetalheAberto((v) => !v)}
                      className="w-full flex items-center justify-between p-3 text-sm font-medium"
                    >
                      <span>
                        Detalhamento do que foi completado ({plano.detalhes.length} linha
                        {plano.detalhes.length > 1 ? "s" : ""})
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${detalheAberto ? "rotate-180" : ""}`}
                      />
                    </button>
                    {detalheAberto && (
                      <div className="border-t max-h-72 overflow-auto p-3 space-y-1 text-xs">
                        {plano.detalhes.map((d, i) => (
                          <div key={`${d.codigo}-${i}`} className="flex gap-2">
                            <span className="font-mono shrink-0">{d.codigo}</span>
                            <span className="text-muted-foreground truncate flex-1">
                              {d.descricao}
                            </span>
                            <span className="shrink-0 text-emerald-700 dark:text-emerald-400">
                              {d.campos.join(", ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}



                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo de Produtos</TableHead>
                        <TableHead className="text-right">Produtos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contagem.map(([grupo, qtd]) => (
                        <TableRow
                          key={grupo}
                          className={
                            corGrupo(grupo) === "amber"
                              ? "bg-amber-50 dark:bg-amber-950/20"
                              : undefined
                          }
                        >
                          <TableCell className="font-mono text-xs">{grupo}</TableCell>
                          <TableCell className="text-right font-medium">{qtd}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {semNcm.falhaCompletar.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                    <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {semNcm.falhaCompletar.length} produto(s) com NCM vazio e SKU existente no
                      SNCF
                    </p>
                    <p className="text-xs text-destructive">
                      O SNCF tem o NCM destes SKUs mas o preenchimento não ocorreu — reporte.
                    </p>
                    <div className="max-h-56 overflow-auto text-xs space-y-1">
                      {semNcm.falhaCompletar.map((l, i) => (
                        <div key={`${l.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{l.codigo}</span>
                          <span className="text-muted-foreground truncate">{l.descricao}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {semNcm.ausenteSncf.length > 0 && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {semNcm.ausenteSncf.length} produto(s) com NCM vazio e código ausente do SNCF
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Estes códigos existem no Bling e não no SNCF. Como FOP/SNCF é a razão, ou o
                      código do Bling está errado, ou falta cadastrar aqui. Exige decisão humana.
                    </p>
                    <div className="max-h-56 overflow-auto text-xs space-y-1">
                      {semNcm.ausenteSncf.map((l, i) => (
                        <div key={`${l.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{l.codigo}</span>
                          <span className="text-muted-foreground truncate flex-1">
                            {l.descricao}
                          </span>
                          <span className="font-mono shrink-0">{l.preco || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {paraRevisar.length > 0 && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {paraRevisar.length} produto(s) exigem decisão humana (FISCAL-REVISAR /
                      FISCAL-NAO-MERCADORIA)
                    </p>
                    <div className="max-h-72 overflow-auto text-xs space-y-1">
                      {paraRevisar.map((l, i) => (
                        <div key={`${l.codigo}-${i}`} className="flex gap-2">
                          <span className="font-mono shrink-0">{l.codigo.trim()}</span>
                          <span className="text-muted-foreground truncate flex-1">
                            {l.descricao}
                          </span>
                          <span className="font-mono shrink-0 text-amber-700 dark:text-amber-400">
                            {l.grupo}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* PASSO 3 */}
          {parsed && grupos && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">3. Baixar para reimportar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={baixar}
                  style={{ backgroundColor: VERDE }}
                  className="text-white hover:opacity-90 gap-2"
                >
                  <Download className="h-4 w-4" />
                  Baixar CSV enriquecido
                </Button>
                <p className="text-sm text-muted-foreground">
                  Importe em{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    Bling &gt; Todas as configurações &gt; Importações de Dados &gt; Importar e
                    atualizar produtos
                  </code>
                  , modo <strong>Atualizar</strong>. Máximo 1.000 produtos por arquivo.
                </p>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Faça backup no Bling antes de atualizar em massa.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="xpm" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Em construção</p>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/vendas/xpm">
                  Ir para XPM <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shopify" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Em construção</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
