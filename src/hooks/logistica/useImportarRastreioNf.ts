// Destino no repo: src/hooks/logistica/useImportarRastreioNf.ts
// Importador de RASTREIO por NF — layout Ícaro (arquivo "notas-fiscais_*.xlsx", aba "Notas fiscais").
// Escreve em transp_rastreio_nf via RPC fn_importar_rastreio_nf(p_transportadora_id, p_arquivo, p_nfs jsonb).
// Molde: useImportarFretesTransportadora. Braspress NÃO usa este hook (vai pelo useImportarBraspress).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { str, num, padCnpj, cleanCte, cleanNf, parseDataBR, onlyDigits, acharLinhaHeader } from "./_parse";

// Colunas-chave que precisam existir no header (validação de layout).
const COLUNAS_CHAVE = [
  "NF-e", "Serie NF-e", "Chave NF-e", "CT-e/Minuta",
  "Ocorrência Ativa", "Status", "Previsão de Entrega",
];

export type PreviewRastreio = {
  arquivo: File;
  totalLinhas: number;
  headerOk: boolean;
  colunasFaltantes: string[];
  headerIdx: number;
  header: string[];
  rows: any[][]; // linhas de dados (arrays por posição)
};

function idxDe(header: string[], nome: string): number {
  const alvo = nome.trim().toUpperCase();
  return header.findIndex((h) => (h ?? "").trim().toUpperCase() === alvo);
}

export async function lerPreviewRastreio(arquivo: File): Promise<PreviewRastreio> {
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 -> array de arrays (preserva colunas duplicadas como "Data/Hora")
  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  const hIdx = acharLinhaHeader(matrix, ["NF-e", "Ocorrência Ativa"]);
  if (hIdx < 0) {
    return { arquivo, totalLinhas: 0, headerOk: false, colunasFaltantes: COLUNAS_CHAVE, headerIdx: -1, header: [], rows: [] };
  }
  const header = (matrix[hIdx] || []).map((c) => (c == null ? "" : String(c).trim()));
  const presentes = new Set(header.map((h) => h.toUpperCase()));
  const colunasFaltantes = COLUNAS_CHAVE.filter((c) => !presentes.has(c.toUpperCase()));
  const rows = matrix.slice(hIdx + 1).filter((r) => Array.isArray(r) && r.some((v) => v !== null && v !== ""));
  return {
    arquivo,
    totalLinhas: rows.length,
    headerOk: colunasFaltantes.length === 0,
    colunasFaltantes,
    headerIdx: hIdx,
    header,
    rows,
  };
}

export function useImportarRastreioNf(transportadoraId: string | null) {
  const qc = useQueryClient();
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [resultado, setResultado] = useState<{ processadas: number; devolucoes: number } | null>(null);

  async function importar(preview: PreviewRastreio) {
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

    const sb: any = supabase;
    const h = preview.header;

    // índices (resolve o "Data/Hora" duplicado: ocorrência ativa + 1)
    const iOcorrAtiva = idxDe(h, "Ocorrência Ativa");
    const cols = {
      nf_numero: idxDe(h, "NF-e"),
      nf_serie: idxDe(h, "Serie NF-e"),
      chave: idxDe(h, "Chave NF-e"),
      cte: idxDe(h, "CT-e/Minuta"),
      destinatario: idxDe(h, "Destinatário"),
      cnpj: idxDe(h, "CPF/CNPJ Destinatário"),
      cep: idxDe(h, "CEP Destino"),
      cidade: idxDe(h, "Cidade Destino"),
      uf: idxDe(h, "UF Destino"),
      status: idxDe(h, "Status"),
      ocorrAtiva: iOcorrAtiva,
      ocorrData: iOcorrAtiva >= 0 ? iOcorrAtiva + 1 : -1, // Data/Hora logo após "Ocorrência Ativa"
      dataEntrega: idxDe(h, "Data de Entrega"),
      previsao: idxDe(h, "Previsão de Entrega"),
      recebedor: idxDe(h, "Recebedor"),
      valorNf: idxDe(h, "Valor NF-e"),
      valorCte: idxDe(h, "Valor CT-e"),
      centroCusto: idxDe(h, "Centro de Custo"),
      natureza: idxDe(h, "Natureza da Mercadoria"),
    };
    const at = (r: any[], i: number) => (i >= 0 ? r[i] : null);

    setEtapa("Normalizando linhas…");
    const nfs = preview.rows
      .map((r) => ({
        nf_numero: cleanNf(at(r, cols.nf_numero)),
        nf_serie: str(at(r, cols.nf_serie)),
        chave_nfe: onlyDigits(at(r, cols.chave)),
        cte_numero: cleanCte(at(r, cols.cte)),
        destinatario: str(at(r, cols.destinatario)),
        cnpj_destinatario: padCnpj(at(r, cols.cnpj)),
        cep_destino: str(at(r, cols.cep)),
        cidade_destino: str(at(r, cols.cidade)),
        uf_destino: str(at(r, cols.uf)),
        status: str(at(r, cols.status)),
        ocorrencia_ativa: str(at(r, cols.ocorrAtiva)),
        ocorrencia_data: parseDataBR(at(r, cols.ocorrData)),
        data_entrega: parseDataBR(at(r, cols.dataEntrega)),
        previsao_entrega: parseDataBR(at(r, cols.previsao)),
        recebedor: str(at(r, cols.recebedor)),
        valor_nf: num(at(r, cols.valorNf)),
        valor_cte: num(at(r, cols.valorCte)),
        centro_custo: str(at(r, cols.centroCusto)),
        natureza_mercadoria: str(at(r, cols.natureza)),
      }))
      .filter((n) => n.nf_numero); // RPC exige nf_numero

    const descartadas = preview.rows.length - nfs.length;
    if (nfs.length === 0) {
      setProcessando(false);
      toast.error("Nenhuma linha com NF válida para importar.");
      return;
    }

    // GUARD-COUNT-EM-TRANSPORTADORA-ID (antes)
    setEtapa("Contagem inicial…");
    const { count: antes } = await sb
      .from("transp_rastreio_nf")
      .select("*", { count: "exact", head: true })
      .eq("transportadora_id", transportadoraId);

    setEtapa(`Enviando ${nfs.length} NF(s)…`);
    const { data, error } = await sb.rpc("fn_importar_rastreio_nf", {
      p_transportadora_id: transportadoraId,
      p_arquivo: preview.arquivo.name,
      p_nfs: nfs,
    });
    if (error) {
      setProcessando(false);
      toast.error("Erro ao importar rastreio: " + error.message);
      throw error;
    }

    // GUARD-COUNT (depois)
    const { count: depois } = await sb
      .from("transp_rastreio_nf")
      .select("*", { count: "exact", head: true })
      .eq("transportadora_id", transportadoraId);

    const processadas = Number(data?.nfs_processadas ?? nfs.length);
    const devolucoes = Number(data?.devolucoes ?? 0);
    const novas = (depois ?? 0) - (antes ?? 0);

    setEtapa("");
    setProcessando(false);
    setResultado({ processadas, devolucoes });

    toast.success(
      `Rastreio importado — ${processadas} NF(s) processada(s)` +
        ` · ${novas} nova(s), ${processadas - novas} atualizada(s)` +
        (devolucoes > 0 ? ` · ${devolucoes} devolução(ões)` : "") +
        (descartadas > 0 ? ` · ${descartadas} linha(s) sem NF descartada(s)` : "")
    );

    qc.invalidateQueries({ queryKey: ["logistica", "rastreio", transportadoraId] });
    qc.invalidateQueries({ queryKey: ["logistica", "fretes", transportadoraId] });
  }

  return { processando, etapa, resultado, importar, reset: () => setResultado(null) };
}
