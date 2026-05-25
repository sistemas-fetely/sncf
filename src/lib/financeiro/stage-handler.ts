/**
 * Stage Handler - Gerencia NFs em stage (etapa intermediária).
 *
 * Fluxo:
 * 1. Importadores (PDF/XML/CSV) parseiam arquivos e chamam moverParaStage()
 * 2. NFs ficam em nfs_stage com status 'pendente' ou 'classificada'
 * 3. Usuário classifica/edita na tela "NFs em Stage"
 * 4. Quando pronto, chama enviarParaContasPagar() que cria registros em contas_pagar_receber
 *
 * Vantagens:
 * - PDFs persistem no bucket nfs-stage (não dependem do localStorage)
 * - Multi-sessão: importa hoje, classifica amanhã
 * - Auditoria clara de quem importou e quando
 */
import { supabase } from "@/integrations/supabase/client";
import type { NFParsed } from "./types";

const BUCKET = "nfs-stage";

export interface StageResult {
  sucesso: number;
  duplicatas: number;
  enriquecidas: number;
  erros: string[];
  loteId: string;
  stageIds: string[];
  stageIdsCriados: string[];
  boletosCriados: number;
}

/**
 * Move NFs parseadas para o stage. Faz upload de PDFs/XMLs no bucket.
 */
export async function moverParaStage(
  nfs: NFParsed[],
  arquivosOrigem: { nf: NFParsed; arquivo?: File }[] = [],
): Promise<StageResult> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const loteId = crypto.randomUUID();

  const result: StageResult = {
    sucesso: 0,
    duplicatas: 0,
    enriquecidas: 0,
    erros: [],
    loteId,
    stageIds: [],
    stageIdsCriados: [],
    boletosCriados: 0,
  };

  // Mapa NF -> arquivo (busca por chave única)
  const mapaArquivos = new Map<string, File>();
  for (const item of arquivosOrigem) {
    const k = chaveArquivo(item.nf);
    if (item.arquivo && k) mapaArquivos.set(k, item.arquivo);
  }

  for (const nf of nfs) {
    try {
      // Skip duplicata explícita (flag legada)
      if (nf._duplicata) {
        result.duplicatas++;
        continue;
      }

      // Upload do arquivo (PDF ou XML, conforme a fonte)
      let storagePath: string | null = null;
      const arquivo = mapaArquivos.get(chaveArquivo(nf));
      if (arquivo) {
        const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        storagePath = `lote-${loteId}/${Date.now()}_${nomeLimpo}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, arquivo, {
            contentType: arquivo.type || "application/pdf",
            upsert: true,
          });
        if (upErr) {
          result.erros.push(`Upload de ${arquivo.name}: ${upErr.message}`);
          continue;
        }
      }

      // Monta payload pra RPC merge_nf_stage
      // RPC vai decidir CRIAR ou ENRIQUECER por chave_acesso
      const status = "nao_vinculada"; // Stage virou repositório — vínculo é decisão futura

      const tipoDoc = inferirTipoDoc(nf);

      // BOLETO: vai direto para Contas a Pagar com PDF anexado
      if (tipoDoc === "pdf_boleto") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cprData, error: cprErr } = await (supabase as any)
          .from("contas_pagar_receber")
          .insert({
            tipo: "pagar",
            descricao: nf._categoria_nome || nf.fornecedor_nome || "Boleto importado",
            valor: nf.valor || 0,
            data_vencimento: nf.nf_data_vencimento || null,
            nf_data_emissao: nf.nf_data_emissao || null,
            plano_contas_id: nf._plano_contas_id || null,
            parceiro_id: nf._parceiro_id_resolvido || null,
            fornecedor_cliente: nf.fornecedor_nome || null,
            parcelas: 1,
            parcela_atual: 1,
            status: "aberto",
            origem: "manual",
          })
          .select("id")
          .single();

        if (cprErr) {
          result.erros.push(`Boleto CPR: ${cprErr.message}`);
        } else {
          if (storagePath && cprData?.id) {
            await supabase.from("contas_pagar_documentos").insert({
              conta_pagar_id: cprData.id,
              tipo: "boleto",
              nome_arquivo: arquivo?.name || "boleto.pdf",
              storage_path: storagePath,
              tamanho_bytes: arquivo?.size || null,
            });
          }
          result.boletosCriados = (result.boletosCriados || 0) + 1;
        }
        continue;
      }

      const payload: Record<string, unknown> = {
        fonte: nf._source || "pdf_nfe",
        tipo_doc: tipoDoc, // xml | pdf_danfe | pdf_boleto — RPC roteia pra nfs_stage_documentos
        arquivo_nome: arquivo?.name || null,
        arquivo_storage_path: storagePath,
        linha_digitavel: nf.linha_digitavel || null,
        importacao_lote_id: loteId,
        fornecedor_cnpj: nf.fornecedor_cnpj || null,
        fornecedor_razao_social: nf.fornecedor_nome || null,
        fornecedor_cliente: nf.fornecedor_nome || null,
        parceiro_id: nf._parceiro_id_resolvido || null,
        nf_numero: nf.nf_numero || null,
        nf_chave_acesso: nf.nf_chave_acesso || null,
        nf_data_emissao: nf.nf_data_emissao || null,
        nf_serie: nf.nf_serie || null,
        valor: nf.valor || 0,
        descricao: nf._categoria_nome || null,
        plano_contas_id: nf._plano_contas_id || null,
        data_vencimento: nf.nf_data_vencimento || nf.nf_data_emissao || null,
        status,
        itens: nf.itens || null,
        // Tipo de documento + moeda estrangeira
        tipo_documento: nf.tipo_documento || "nfe",
        pais_emissor: nf.pais_emissor || "BR",
        moeda: nf.moeda || "BRL",
        valor_origem: nf.valor_origem ?? null,
        taxa_conversao: nf.taxa_conversao ?? null,
        numero_parcela: nf.numero_parcela ?? null,
        total_parcelas: nf.total_parcelas ?? null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
        "merge_nf_stage",
        { p_nf: payload, p_user_id: userId },
      );

      if (rpcErr) {
        result.erros.push(`Merge: ${rpcErr.message}`);
        continue;
      }

      const r = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

      if (r?.acao === "criada") {
        result.sucesso++;
      } else if (typeof r?.acao === "string" && r.acao.startsWith("enriquecida")) {
        result.enriquecidas++;
      } else if (r?.acao === "duplicada_descartada" || r?.acao === "duplicada") {
        result.duplicatas++;
      } else {
        result.sucesso++;
      }

      if (r?.stage_id && r.acao !== "duplicada_descartada" && r.acao !== "duplicada") {
        result.stageIds.push(r.stage_id);
      }
      if (r?.stage_id && r.acao === "criada") {
        result.stageIdsCriados.push(r.stage_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.erros.push(msg);
    }
  }

  // === Auto-classificação por IA (Doutrina #101) ===
  // Dispara classificar-nfs-ia para as NFs recém-criadas que ficaram sem categoria.
  // A edge function verifica regras_categorizacao antes de chamar Gemini, então
  // CNPJs já mapeados manualmente nunca são sobrescritos.
  // Não-bloqueante: falha aqui não invalida a importação.
  if (result.stageIdsCriados.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: semCategoria } = await (supabase as any)
        .from("nfs_stage")
        .select("id")
        .in("id", result.stageIdsCriados)
        .is("plano_contas_id", null);

      const idsParaClassificar: string[] = (semCategoria || []).map(
        (r: { id: string }) => r.id,
      );

      if (idsParaClassificar.length > 0) {
        // Fire-and-forget: não aguarda resposta, não bloqueia retorno.
        supabase.functions
          .invoke("classificar-nfs-ia", { body: { ids: idsParaClassificar } })
          .catch((e) => {
            console.warn("Auto-classificação IA falhou (não-bloqueante):", e);
          });
      }
    } catch (e) {
      console.warn("Auto-classificação IA pulada (erro de leitura):", e);
    }
  }

  return result;
}

/**
 * Envia NFs do stage para a tabela contas_pagar_receber.
 * Faz inclusive a vinculação com conta_pagar_existente_id se houver match.
 */
export async function enviarStageParaContasPagar(
  stageIds: string[],
): Promise<{
  sucesso: number;
  erros: string[];
  detalhes: { criadas: number; enriquecidas: number };
}> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const result = {
    sucesso: 0,
    erros: [] as string[],
    detalhes: { criadas: 0, enriquecidas: 0 },
  };

  if (stageIds.length === 0) return result;

  // Chama RPC que faz match→enriquece OU cria, com proteção contra duplicata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "enviar_stage_para_contas_pagar",
    {
      p_stage_ids: stageIds,
      p_user_id: userId,
    },
  );

  if (error) {
    result.erros.push(`RPC falhou: ${error.message}`);
    return result;
  }

  type ResultadoRPC = {
    stage_id: string;
    conta_pagar_id: string | null;
    acao: string;
    erro: string | null;
  };

  for (const r of (data || []) as ResultadoRPC[]) {
    if (r.acao === "erro") {
      result.erros.push(`Stage ${r.stage_id}: ${r.erro || "erro desconhecido"}`);
      continue;
    }

    result.sucesso++;
    if (r.acao === "criada") result.detalhes.criadas++;
    else if (r.acao.startsWith("enriquecida")) result.detalhes.enriquecidas++;

    // Move PDF do bucket nfs-stage pra financeiro-docs (mantém comportamento existente)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stageInfo } = await (supabase as any)
        .from("nfs_stage")
        .select(`
          documentos:nfs_stage_documentos(tipo, storage_path, arquivo_nome)
        `)
        .eq("id", r.stage_id)
        .maybeSingle();

      // Pacote/anexo principal: PDF DANFE preferencialmente
      const pdfDanfe = stageInfo?.documentos?.find(
        (d: any) => d.tipo === "pdf_danfe",
      );
      if (pdfDanfe && r.conta_pagar_id) {
        await moverArquivoParaContasPagar(
          pdfDanfe.storage_path,
          r.conta_pagar_id,
          pdfDanfe.arquivo_nome || "documento.pdf",
        );
      }
    } catch (e) {
      console.error(
        `Falha ao mover arquivo para conta ${r.conta_pagar_id}:`,
        e,
      );
      // Não bloqueia: a NF está vinculada via nfs_stage.conta_pagar_id (modelo N:1)
      // e o helper de envio tem fallback. Mas a falha agora SAI do escuro.
      result.erros.push(
        `Conta ${r.conta_pagar_id}: arquivo da NF não foi movido pro bucket de docs (continua acessível via Stage). Erro: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

/**
 * Move arquivo do bucket nfs-stage pra financeiro-docs vinculando à conta criada.
 */
async function moverArquivoParaContasPagar(
  pathStage: string,
  contaId: string,
  nomeArquivo: string,
): Promise<void> {
  try {
    // Download do arquivo no stage
    const { data: blob } = await supabase.storage.from(BUCKET).download(pathStage);
    if (!blob) return;

    // Upload no financeiro-docs
    const ext = nomeArquivo.split(".").pop() || "pdf";
    const tipoDoc = ext === "xml" ? "outro" : "nf";
    const novoPath = `cp/${contaId}/${Date.now()}_${nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("financeiro-docs")
      .upload(novoPath, blob);
    if (upErr) {
      console.warn("Falha ao mover doc:", upErr);
      return;
    }

    // Registra em contas_pagar_documentos
    await supabase.from("contas_pagar_documentos").insert({
      conta_pagar_id: contaId,
      tipo: tipoDoc,
      nome_arquivo: nomeArquivo,
      storage_path: novoPath,
      tamanho_bytes: blob.size,
    });

    // Apaga do bucket nfs-stage
    await supabase.storage.from(BUCKET).remove([pathStage]);
  } catch (e) {
    console.warn("Erro mover arquivo:", e);
  }
}

async function marcarComoImportada(
  stageId: string,
  contaPagarId: string,
  userId: string | null,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("nfs_stage")
    .update({
      status: "importada",
      conta_pagar_id: contaPagarId,
      importada_em: new Date().toISOString(),
      importada_por: userId,
    })
    .eq("id", stageId);
}

function montarDescricao(nf: Record<string, unknown>): string {
  const fornecedor =
    (nf.fornecedor_razao_social as string) || (nf.fornecedor_cliente as string) || "";
  const numero = nf.nf_numero ? `NF ${nf.nf_numero}` : "";
  if (fornecedor && numero) return `${fornecedor} — ${numero}`;
  if (fornecedor) return fornecedor;
  if (numero) return numero;
  return "NF importada";
}

function chaveArquivo(nf: NFParsed): string {
  return [nf.nf_chave_acesso, nf.fornecedor_cnpj, nf.nf_numero, nf.valor]
    .filter(Boolean)
    .join("|");
}

/**
 * Decide o tipo_doc canônico (alimenta nfs_stage_documentos via RPC):
 *   xml         → arquivo XML de NF-e/NFS-e
 *   pdf_boleto  → PDF identificado como boleto bancário
 *   pdf_danfe   → demais PDFs fiscais (DANFE, NFS-e, recibo)
 */
function inferirTipoDoc(nf: NFParsed): "xml" | "pdf_danfe" | "pdf_boleto" {
  const src = (nf as unknown as { _source?: string })._source || "";
  if (src.includes("xml")) return "xml";
  if (nf.tipo_documento === "boleto") return "pdf_boleto";
  return "pdf_danfe";
}

/**
 * Descarta NFs do stage (apaga registros + arquivos).
 */
export async function descartarStage(stageIds: string[]): Promise<number> {
  // Pega paths pra apagar do bucket
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nfs } = await (supabase as any)
    .from("nfs_stage")
    .select("documentos:nfs_stage_documentos(storage_path)")
    .in("id", stageIds);

  // Apaga arquivos (todos os tipos: xml, pdf_danfe, pdf_boleto)
  const paths = (nfs || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((n: any) => (n.documentos || []).map((d: any) => d.storage_path))
    .filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  // Apaga registros
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from("nfs_stage")
    .delete({ count: "exact" })
    .in("id", stageIds);

  if (error) throw error;
  return count || 0;
}
