import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const COLUNAS_ESPERADAS = [
  "Data Frete", "Tipo Frete", "N° Minuta", "N° CT-e", "Série", "Emissão CT-e",
  "Notas Fiscais", "N° Referência", "Doc. Ant.", "Nº DI/DTA", "Nº HAwb", "Nº MAwb",
  "Remetente", "Cidade Remetente", "UF Remetente",
  "Destinatário", "Cidade Destinatário", "UF Destinatário",
  "Volumes", "Peso real", "Peso taxado", "Valor NF",
  "Total Frete", "Frete peso", "Valor da coleta", "Valor da entrega",
  "Ad Valorem", "Valor do redespacho", "GRIS", "ITR", "TDE",
  "Valor despacho", "SEC/CAT", "Adicionais", "Outros valores",
  "Valor pedágio", "Valor Imposto",
  "Prazo Entrega", "Última ocorrência", "Data última ocorrência",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawRow = Record<string, any>;

export type PreviewArquivo = {
  arquivo: File;
  totalLinhas: number;
  headerOk: boolean;
  colunasFaltantes: string[];
  rawRows: RawRow[];
};

// ────── helpers ──────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (s === "") return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  let normalizado: string;
  if (temVirgula && temPonto) normalizado = s.replace(/\./g, "").replace(",", ".");
  else if (temVirgula) normalizado = s.replace(",", ".");
  else normalizado = s;
  const n = parseFloat(normalizado);
  return isNaN(n) ? null : n;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function int(v: any): number | null { const n = num(v); return n == null ? null : Math.trunc(n); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Limpa o padrão ="123" usado pela Ícaro para forçar texto no Excel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function limparExcelText(v: any): string | null {
  const s = str(v);
  if (!s) return null;
  return s.replace(/^="?/, "").replace(/"?$/, "").trim() || null;
}

// dd/mm/yyyy HH:MM (HH:MM opcional) → ISO
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDataBR(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  // tenta dd/mm/yyyy[ HH:MM[:SS]]
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10) - 1;
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(ano, mes, dia, hh, mm, ss);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // fallback ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ────── leitura ──────

function parseCsvLine(linha: string): string[] {
  const out: string[] = [];
  let cur = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') { cur += '"'; i++; }
      else dentroAspas = !dentroAspas;
    } else if (c === ";" && !dentroAspas) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function lerCsvIcaro(arquivo: File): Promise<RawRow[]> {
  const buffer = await arquivo.arrayBuffer();
  // Ícaro exporta em windows-1252 com ; como separador
  const texto = new TextDecoder("windows-1252").decode(buffer);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length === 0) return [];
  const headers = parseCsvLine(linhas[0]).map((h) => h.trim());
  const rows: RawRow[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = parseCsvLine(linhas[i]);
    const obj: RawRow = {};
    headers.forEach((h, idx) => {
      obj[h] = campos[idx] ?? null;
    });
    rows.push(obj);
  }
  return rows;
}

async function lerXlsx(arquivo: File): Promise<RawRow[]> {
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null, raw: true });
}

export async function lerPreview(arquivo: File): Promise<PreviewArquivo> {
  const nome = arquivo.name.toLowerCase();
  const rows = nome.endsWith(".csv") ? await lerCsvIcaro(arquivo) : await lerXlsx(arquivo);
  const headersPresentes = new Set(Object.keys(rows[0] ?? {}).map((h) => h.trim()));
  const colunasFaltantes = COLUNAS_ESPERADAS.filter((c) => !headersPresentes.has(c));
  return {
    arquivo,
    totalLinhas: rows.length,
    headerOk: colunasFaltantes.length === 0,
    colunasFaltantes,
    rawRows: rows,
  };
}

// ────── hook ──────

export function useImportarFretesTransportadora(transportadoraId: string | null) {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [resultado, setResultado] = useState<{ total: number } | null>(null);

  async function importar(preview: PreviewArquivo) {
    if (!transportadoraId) {
      toast.error("Selecione uma transportadora antes de importar.");
      return;
    }
    if (!preview.headerOk) {
      toast.error("Header inválido — colunas faltantes: " + preview.colunasFaltantes.join(", "));
      return;
    }

    setProcessando(true);
    setResultado(null);
    setEtapa("Identificando usuário…");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { data: userRes } = await sb.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    const agora = new Date().toISOString();

    setEtapa("Normalizando linhas…");

    const linhas = preview.rawRows.map((r) => ({
      transportadora_id: transportadoraId,
      data_frete: parseDataBR(r["Data Frete"]),
      tipo_frete: str(r["Tipo Frete"]),
      minuta: str(r["N° Minuta"]),
      cte_numero: str(r["N° CT-e"]),
      cte_serie: str(r["Série"]),
      cte_emissao: parseDataBR(r["Emissão CT-e"]),
      nf_numero: limparExcelText(r["Notas Fiscais"]),
      referencia: str(r["N° Referência"]),
      doc_anterior: str(r["Doc. Ant."]),
      di_dta: str(r["Nº DI/DTA"]),
      hawb: str(r["Nº HAwb"]),
      mawb: str(r["Nº MAwb"]),
      remetente: str(r["Remetente"]),
      remetente_cidade: str(r["Cidade Remetente"]),
      remetente_uf: str(r["UF Remetente"]),
      destinatario: str(r["Destinatário"]),
      destinatario_cidade: str(r["Cidade Destinatário"]),
      destinatario_uf: str(r["UF Destinatário"]),
      volumes: int(r["Volumes"]),
      peso_real: num(r["Peso real"]),
      peso_taxado: num(r["Peso taxado"]),
      valor_nf: num(r["Valor NF"]),
      frete_total: num(r["Total Frete"]),
      frete_peso: num(r["Frete peso"]),
      valor_coleta: num(r["Valor da coleta"]),
      valor_entrega: num(r["Valor da entrega"]),
      ad_valorem: num(r["Ad Valorem"]),
      valor_redespacho: num(r["Valor do redespacho"]),
      gris: num(r["GRIS"]),
      itr: num(r["ITR"]),
      tde: num(r["TDE"]),
      valor_despacho: num(r["Valor despacho"]),
      sec_cat: num(r["SEC/CAT"]),
      adicionais: num(r["Adicionais"]),
      outros_valores: num(r["Outros valores"]),
      valor_pedagio: num(r["Valor pedágio"]),
      valor_imposto: num(r["Valor Imposto"]),
      prazo_entrega: parseDataBR(r["Prazo Entrega"]),
      ocorrencia_texto: str(r["Última ocorrência"]),
      ocorrencia_data: parseDataBR(r["Data última ocorrência"]),
      importado_arquivo: preview.arquivo.name,
      importado_por: uid,
      importado_em: agora,
      atualizado_em: agora,
    }));

    // só linhas que têm a chave de conflito completa
    const linhasValidas = linhas.filter((l) => l.cte_numero && l.cte_serie);
    const descartadas = linhas.length - linhasValidas.length;

    const CHUNK = 300;
    for (let i = 0; i < linhasValidas.length; i += CHUNK) {
      const lote = linhasValidas.slice(i, i + CHUNK);
      setEtapa(`Enviando ${Math.min(i + CHUNK, linhasValidas.length)}/${linhasValidas.length}…`);
      const { error } = await sb
        .from("transp_fretes")
        .upsert(lote, { onConflict: "transportadora_id,cte_numero,cte_serie" });
      if (error) {
        setProcessando(false);
        toast.error("Erro ao gravar fretes: " + error.message);
        throw error;
      }
    }

    setEtapa("");
    setProcessando(false);
    setResultado({ total: linhasValidas.length });
    toast.success(
      `Importação concluída — ${linhasValidas.length} frete(s)` +
        (descartadas > 0 ? ` · ${descartadas} descartada(s) por falta de CT-e/Série` : "")
    );

    qc.invalidateQueries({ queryKey: ["logistica", "fretes", transportadoraId] });
  }

  return { processando, etapa, resultado, importar, reset: () => setResultado(null) };
}
