import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileCode, Loader2, Upload } from "lucide-react";
import JSZip from "jszip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseXmlAny,
  detectarTipoXml,
} from "@/lib/financeiro/xml-parser";
import { isXmlNFSeAbrasf } from "@/lib/financeiro/xml-nfse-parser";
import { isXmlCte, getCteTomadorCnpj } from "@/lib/financeiro/xml-cte-parser";
import { verificarDuplicatas } from "@/lib/financeiro/import-handler";
import { moverParaStage, type StageResult } from "@/lib/financeiro/stage-handler";
import { limparCnpj, parseDataBR, parseValorBR } from "@/lib/financeiro/parsers";
import type { NFParsed } from "@/lib/financeiro/types";
import { PreviewNFsImportSimples } from "./PreviewNFsImportSimples";

interface Props {
  onImported?: (result: StageResult) => void;
}

interface ZipReport {
  total: number;
  importadosNFe: number;
  importadosNFSe: number;
  importadosCTe: number;
  duplicatas: number;
  ignorados: Record<string, number>;
  erros: number;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function isPdf(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

function isXml(file: File): boolean {
  if (file.type.includes("xml")) return true;
  return file.name.toLowerCase().endsWith(".xml");
}

function isZip(file: File): boolean {
  if (file.type === "application/zip" || file.type === "application/x-zip-compressed") {
    return true;
  }
  return file.name.toLowerCase().endsWith(".zip");
}

async function parseXmlFile(file: File): Promise<NFParsed | null> {
  const xml = await readFileAsText(file);
  const nf = parseXmlAny(xml);
  if (!nf) return null;
  nf._arquivo = file;
  (nf as any)._source = (nf as any)._source || "xml_nfe";
  return nf;
}

async function parsePdfFile(file: File): Promise<NFParsed | null> {
  const formData = new FormData();
  formData.append("file", file);
  const { data, error } = await supabase.functions.invoke("parse-nf-pdf", {
    body: formData,
  });
  if (error) throw error;
  const payload = (data?.data || data || {}) as Record<string, any>;
  if (
    !payload ||
    (!payload.fornecedor_razao_social &&
      !payload.razao_social_prestador &&
      !payload.emitente_nome)
  ) {
    return null;
  }
  const tipoDoc = payload.tipo_documento || "nfe";
  const isBoleto = tipoDoc === "boleto";

  const nfNumeroResolvido =
    isBoleto && payload.numero_documento_referencia
      ? String(payload.numero_documento_referencia)
      : String(payload.numero_documento || payload.numero || "");

  const chaveAcessoLimpa = (() => {
    if (isBoleto) return undefined;
    const raw = payload.chave_acesso;
    if (!raw) return undefined;
    const digitsOnly = String(raw).replace(/\D/g, "");
    if (digitsOnly.length !== 44) return undefined;
    return digitsOnly;
  })();

  const nf: NFParsed = {
    nf_numero: nfNumeroResolvido,
    nf_serie: payload.serie ? String(payload.serie) : "",
    nf_data_emissao:
      parseDataBR(payload.data_emissao) || payload.data_emissao || null,
    nf_data_vencimento:
      parseDataBR(payload.data_vencimento) || payload.data_vencimento || null,
    nf_natureza_operacao: payload.descricao || payload.natureza_operacao || "",
    nf_chave_acesso: chaveAcessoLimpa,
    fornecedor_nome:
      payload.fornecedor_razao_social ||
      payload.razao_social_prestador ||
      payload.emitente_nome ||
      "Fornecedor",
    fornecedor_cnpj:
      limparCnpj(
        payload.fornecedor_cnpj ||
          payload.cnpj_prestador ||
          payload.emitente_cnpj ||
          "",
      ) || undefined,
    valor: parseValorBR(payload.valor || payload.valor_total),
    meio_pagamento: null,
    itens: Array.isArray(payload.itens)
      ? payload.itens.map((it: any) => ({
          descricao: String(it.descricao || ""),
          ncm: it.ncm ? String(it.ncm) : undefined,
          quantidade: parseValorBR(it.quantidade),
          valor_unitario: parseValorBR(it.valor_unitario),
          valor_total: parseValorBR(it.valor_total),
        }))
      : [],
    _source: "pdf_nfe",
    _arquivo: file,
    tipo_documento: tipoDoc,
    pais_emissor: payload.pais_emissor || "BR",
    moeda: payload.moeda || "BRL",
    valor_origem: payload.valor_origem ?? null,
    taxa_conversao: payload.taxa_conversao ?? null,
    linha_digitavel: payload.linha_digitavel || null,
    numero_parcela: payload.numero_parcela ?? null,
    total_parcelas: payload.total_parcelas ?? null,
    numero_documento_referencia: payload.numero_documento_referencia || null,
    confianca: (payload.confianca === "alta" || payload.confianca === "baixa")
      ? payload.confianca
      : "baixa",
  } as NFParsed;
  return nf;
}

/**
 * Busca CNPJs Fetely (unidades ativas). Normaliza para dígitos.
 */
async function fetchCnpjsFetely(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("unidades")
    .select("cnpj")
    .eq("ativa", true)
    .not("cnpj", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data || []) {
    const d = String((row as any).cnpj || "").replace(/\D/g, "");
    if (d) set.add(d);
  }
  return set;
}

/**
 * Extrai CNPJ do <dest> num XML NF-e (independente de namespace).
 */
function extrairCnpjTagNFe(xml: string, tag: "dest" | "emit"): string {
  const re = new RegExp(
    `<${tag}[^>]*>[\\s\\S]*?<CNPJ>\\s*([0-9]+)\\s*</CNPJ>`,
    "i",
  );
  const m = xml.match(re);
  return m ? m[1].replace(/\D/g, "") : "";
}

/**
 * Extrai CNPJ do tomador de uma NFS-e ABRASF.
 */
function extrairCnpjTomadorNFSe(xml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return "";
  const tomadores = doc.getElementsByTagName("TomadorServico");
  if (tomadores.length === 0) return "";
  const t = tomadores[0];
  const cnpjEls = t.getElementsByTagName("Cnpj");
  const raw = cnpjEls[0]?.textContent || "";
  return raw.replace(/\D/g, "");
}

type ClassifResult =
  | { acao: "importar"; tipo: "nfe" | "nfse" | "cte" }
  | { acao: "ignorar"; motivo: string };

function classificarXml(
  xml: string,
  caminho: string,
  cnpjsFetely: Set<string>,
): ClassifResult {
  const lower = xml.toLowerCase();

  // Eventos (sem documento completo)
  if (
    lower.includes("<proceventonfe") ||
    lower.includes("<proceventocte") ||
    lower.includes("<evento") && !lower.includes("<nfeproc") && !lower.includes("<cteproc")
  ) {
    if (!lower.includes("<infnfe") && !lower.includes("<infcte") && !lower.includes("<infnfse")) {
      return { acao: "ignorar", motivo: "evento" };
    }
  }

  // Canceladas pelo caminho
  if (caminho.toLowerCase().includes("cancelad")) {
    return { acao: "ignorar", motivo: "cancelada" };
  }

  const tipo = detectarTipoXml(xml);

  if (tipo === "nfe") {
    const dest = extrairCnpjTagNFe(xml, "dest");
    const emit = extrairCnpjTagNFe(xml, "emit");
    if (dest && cnpjsFetely.has(dest)) return { acao: "importar", tipo: "nfe" };
    if (emit && cnpjsFetely.has(emit)) return { acao: "ignorar", motivo: "emitida (venda)" };
    return { acao: "ignorar", motivo: "não destinada à Fetely" };
  }

  if (tipo === "cte") {
    const tomador = getCteTomadorCnpj(xml);
    if (tomador && cnpjsFetely.has(tomador)) return { acao: "importar", tipo: "cte" };
    return { acao: "ignorar", motivo: "CTe não tomador" };
  }

  if (tipo === "nfse") {
    const tomador = extrairCnpjTomadorNFSe(xml);
    if (tomador && cnpjsFetely.has(tomador)) return { acao: "importar", tipo: "nfse" };
    return { acao: "ignorar", motivo: "NFS-e não tomada pela Fetely" };
  }

  // fallback por regex quando detector geral falha (namespace exótico)
  if (isXmlCte(xml)) {
    const tomador = getCteTomadorCnpj(xml);
    if (tomador && cnpjsFetely.has(tomador)) return { acao: "importar", tipo: "cte" };
    return { acao: "ignorar", motivo: "CTe não tomador" };
  }
  if (isXmlNFSeAbrasf(xml)) {
    const tomador = extrairCnpjTomadorNFSe(xml);
    if (tomador && cnpjsFetely.has(tomador)) return { acao: "importar", tipo: "nfse" };
    return { acao: "ignorar", motivo: "NFS-e não tomada pela Fetely" };
  }

  return { acao: "ignorar", motivo: "formato não reconhecido" };
}

export function ImportadorNFs({ onImported }: Props) {
  const qc = useQueryClient();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<NFParsed[]>([]);
  const [zipProgress, setZipProgress] = useState<{ atual: number; total: number } | null>(null);
  const [zipReport, setZipReport] = useState<ZipReport | null>(null);

  async function processarZip(file: File): Promise<NFParsed[]> {
    const cnpjs = await fetchCnpjsFetely();
    if (cnpjs.size === 0) {
      toast.warning("Nenhum CNPJ Fetely cadastrado em Unidades — importação de ZIP não pode filtrar destinatários.");
    }
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter(
      (e) => !e.dir && e.name.toLowerCase().endsWith(".xml"),
    );

    const report: ZipReport = {
      total: entries.length,
      importadosNFe: 0,
      importadosNFSe: 0,
      importadosCTe: 0,
      duplicatas: 0,
      ignorados: {},
      erros: 0,
    };

    const aprovadas: NFParsed[] = [];
    setZipProgress({ atual: 0, total: entries.length });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const xml = await entry.async("string");
        const classif = classificarXml(xml, entry.name, cnpjs);
        if (classif.acao === "ignorar") {
          report.ignorados[classif.motivo] = (report.ignorados[classif.motivo] || 0) + 1;
        } else {
          const nf = parseXmlAny(xml);
          if (!nf) {
            report.erros += 1;
          } else {
            // Cria File sintético pra manter pipeline uniforme (upload anexo se aplicável)
            const nomeArquivo = entry.name.split("/").pop() || entry.name;
            const arquivoSint = new File([xml], nomeArquivo, { type: "text/xml" });
            nf._arquivo = arquivoSint;
            aprovadas.push(nf);
            if (classif.tipo === "nfe") report.importadosNFe += 1;
            else if (classif.tipo === "nfse") report.importadosNFSe += 1;
            else if (classif.tipo === "cte") report.importadosCTe += 1;
          }
        }
      } catch {
        report.erros += 1;
      }
      if ((i + 1) % 5 === 0 || i === entries.length - 1) {
        setZipProgress({ atual: i + 1, total: entries.length });
      }
    }

    // verificarDuplicatas roda no set aprovado — duplicatas contadas no report
    const processadas = await verificarDuplicatas(aprovadas);
    const dups = processadas.filter((n) => n._duplicata || n._ja_existe).length;
    report.duplicatas = dups;
    setZipReport(report);
    return processadas.map((n) => ({
      ...n,
      _selecionada: !n._duplicata && !n._ambigua,
    }));
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setParsing(true);
    try {
      const novas: NFParsed[] = [];
      for (const f of files) {
        try {
          if (isZip(f)) {
            const doZip = await processarZip(f);
            novas.push(...doZip);
            continue;
          }
          let nf: NFParsed | null = null;
          if (isXml(f)) {
            nf = await parseXmlFile(f);
            if (!nf) {
              toast.warning(
                `Não foi possível ler ${f.name} — pode ser NFS-e municipal não-ABRASF.`,
              );
              continue;
            }
          } else if (isPdf(f)) {
            nf = await parsePdfFile(f);
            if (!nf) {
              toast.warning(`PDF ${f.name}: sem dados extraídos`);
              continue;
            }
          } else {
            toast.warning(`Formato não suportado: ${f.name}`);
            continue;
          }
          novas.push(nf);
        } catch (err: any) {
          toast.error(`Erro em ${f.name}: ${err?.message || err}`);
        }
      }

      // Para arquivos avulsos (não-zip), passa por verificarDuplicatas normal.
      // Itens já vindos do ZIP já foram deduplicados. Distingue pela flag _selecionada
      // ainda não definida para os avulsos.
      const jaProcessadas = novas.filter((n) => n._selecionada !== undefined);
      const paraProcessar = novas.filter((n) => n._selecionada === undefined);

      let processadas = await verificarDuplicatas(paraProcessar);
      processadas = processadas.map((n) => ({
        ...n,
        _selecionada: !n._duplicata && !n._ambigua,
      }));

      const todas = [...jaProcessadas, ...processadas];
      if (todas.length > 0) {
        setPreview((prev) => [...prev, ...todas]);
        toast.success(
          `${todas.length} arquivo${todas.length === 1 ? "" : "s"} processado${todas.length === 1 ? "" : "s"}`,
        );
      }
    } finally {
      setParsing(false);
      setZipProgress(null);
      e.target.value = "";
    }
  }

  async function doImport() {
    const selecionadas = preview.filter((n) => n._selecionada && !n._duplicata);
    if (selecionadas.length === 0) {
      toast.warning("Nenhuma NF selecionada para importar");
      return;
    }

    setImporting(true);
    try {
      const arquivosOrigem = selecionadas
        .filter((nf) => nf._arquivo)
        .map((nf) => ({ nf, arquivo: nf._arquivo as File }));

      const result = await moverParaStage(selecionadas, arquivosOrigem);

      const resumo: string[] = [];
      if (result.sucesso > 0) resumo.push(`${result.sucesso} NFs no stage`);
      if (result.enriquecidas > 0) resumo.push(`${result.enriquecidas} enriquecidas`);
      if (result.boletosCriados > 0)
        resumo.push(
          `${result.boletosCriados} boleto${result.boletosCriados === 1 ? "" : "s"} lançado${result.boletosCriados === 1 ? "" : "s"} em Contas a Pagar`,
        );
      if (result.duplicatas > 0)
        resumo.push(`${result.duplicatas} duplicatas (ignoradas)`);

      if (result.erros.length > 0) {
        const ehTudoDuplicata = result.erros.every((e) =>
          e.toLowerCase().includes("duplicate key") ||
          e.toLowerCase().includes("uq_nfs_stage") ||
          e.toLowerCase().includes("uniq_nfs_stage"),
        );

        if (ehTudoDuplicata) {
          toast.warning(
            "Esta NF já está no repositório. Vá em 'Nova Despesa' → 'Anexar do Repositório de NFs' para vinculá-la a uma despesa.",
            { duration: 6000 },
          );
        } else {
          toast.error(
            `Importação concluída com erros: ${resumo.join(", ")}. ${result.erros.slice(0, 3).join("; ")}`,
            { duration: 15000, closeButton: true },
          );
        }
        console.error(result.erros);
      } else if (resumo.length > 0) {
        toast.success(`✅ ${resumo.join(", ")}`);
      }

      if (result.sucesso + result.enriquecidas > 0) {
        setPreview([]);
        qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      }

      if (result.boletosCriados > 0) {
        qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      }

      onImported?.(result);
    } catch (e) {
      toast.error(
        "Falha na importação: " + (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCode className="h-5 w-5 text-admin" />
            Importar NFs (XML + PDF + ZIP)
          </CardTitle>
          <CardDescription>
            Selecione XMLs, PDFs (DANFEs) ou o ZIP mensal do Qive. Detecção automática:
            NF-e, NFS-e e CTe onde a Fetely é destinatária/tomadora entram no stage;
            emitidas, não-tomador, eventos e canceladas ficam de fora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Selecionar arquivos
              <input
                type="file"
                accept=".xml,.zip,application/pdf,text/xml,application/xml,application/zip,application/x-zip-compressed"
                multiple
                className="hidden"
                onChange={handleFiles}
                disabled={parsing || importing}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              XML, PDF, ZIP (Qive) — múltiplos suportados
            </span>
            {zipProgress && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processando ZIP: {zipProgress.atual} de {zipProgress.total}
              </span>
            )}
          </div>

          <PreviewNFsImportSimples
            nfs={preview}
            onChange={setPreview}
            onImport={doImport}
            importing={importing}
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!zipReport}
        onOpenChange={(open) => !open && setZipReport(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório da importação do ZIP</DialogTitle>
            <DialogDescription>
              Resumo do processamento dos XMLs contidos no arquivo.
            </DialogDescription>
          </DialogHeader>
          {zipReport && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Total de XMLs no ZIP</span>
                <span className="font-medium">{zipReport.total}</span>
              </div>
              <div>
                <div className="font-medium mb-1">Importados</div>
                <ul className="ml-4 space-y-0.5 text-muted-foreground">
                  <li>NF-e: <span className="text-foreground font-medium">{zipReport.importadosNFe}</span></li>
                  <li>NFS-e: <span className="text-foreground font-medium">{zipReport.importadosNFSe}</span></li>
                  <li>CTe: <span className="text-foreground font-medium">{zipReport.importadosCTe}</span></li>
                </ul>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duplicatas puladas</span>
                <span className="font-medium">{zipReport.duplicatas}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Erros de leitura</span>
                <span className="font-medium">{zipReport.erros}</span>
              </div>
              {Object.keys(zipReport.ignorados).length > 0 && (
                <div>
                  <div className="font-medium mb-1">Ignorados por motivo</div>
                  <ul className="ml-4 space-y-0.5 text-muted-foreground">
                    {Object.entries(zipReport.ignorados)
                      .sort((a, b) => b[1] - a[1])
                      .map(([motivo, count]) => (
                        <li key={motivo}>
                          {motivo}: <span className="text-foreground font-medium">{count}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setZipReport(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
