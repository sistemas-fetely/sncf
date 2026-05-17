import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileCode, Loader2, Upload } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseXmlAny } from "@/lib/financeiro/xml-parser";
import { verificarDuplicatas } from "@/lib/financeiro/import-handler";
import { moverParaStage, type StageResult } from "@/lib/financeiro/stage-handler";
import { limparCnpj, parseDataBR, parseValorBR } from "@/lib/financeiro/parsers";
import type { NFParsed } from "@/lib/financeiro/types";
import { PreviewNFsImportSimples } from "./PreviewNFsImportSimples";

interface Props {
  onImported?: (result: StageResult) => void;
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

  // Pra boleto, número da NF está em numero_documento_referencia (quando preenchido).
  // numero_documento do boleto é "Nosso Número" do banco — não identifica a NF.
  const nfNumeroResolvido =
    isBoleto && payload.numero_documento_referencia
      ? String(payload.numero_documento_referencia)
      : String(payload.numero_documento || payload.numero || "");

  // Defesa em profundidade: chave_acesso só pra NF-e/NFS-e e exatamente 44 dígitos numéricos.
  // Edge function já filtra; redundância intencional pra blindar contra inconsistência futura.
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
    // Campos de boleto (Edge Function preenche quando tipo_documento === "boleto")
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

function normalizarNumeroNF(n: string | undefined): string {
  if (!n) return "";
  return n.replace(/\D/g, "").replace(/^0+/, "");
}

export function ImportadorNFs({ onImported }: Props) {
  const qc = useQueryClient();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<NFParsed[]>([]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setParsing(true);
    try {
      const novas: NFParsed[] = [];
      for (const f of files) {
        try {
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

      let processadas = [...novas];
      processadas = await verificarDuplicatas(processadas);
      processadas = processadas.map((n) => ({
        ...n,
        _selecionada: !n._duplicata && !n._ambigua,
      }));

      if (processadas.length > 0) {
        setPreview((prev) => [...prev, ...processadas]);
        toast.success(
          `${processadas.length} arquivo${processadas.length === 1 ? "" : "s"} processado${processadas.length === 1 ? "" : "s"}`,
        );
      }
    } finally {
      setParsing(false);
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileCode className="h-5 w-5 text-admin" />
          Importar NFs (XML + PDF)
        </CardTitle>
        <CardDescription>
          Selecione XMLs ou PDFs (DANFEs). Detecção automática. NF entra no stage
          e fica disponível pra processamento posterior.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Selecionar arquivos
            <input
              type="file"
              accept=".xml,application/pdf,text/xml,application/xml"
              multiple
              className="hidden"
              onChange={handleFiles}
              disabled={parsing || importing}
            />
          </label>
          <span className="text-xs text-muted-foreground">
            XML, PDF, múltiplos suportados
          </span>
        </div>

        <PreviewNFsImportSimples
          nfs={preview}
          onChange={setPreview}
          onImport={doImport}
          importing={importing}
        />
      </CardContent>
    </Card>
  );
}
