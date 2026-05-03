/**
 * Helper compartilhado: monta ZIP de pacote fiscal pra envio ao contador.
 *
 * Usado em 2 lugares:
 *   - EnviarPeloSistemaDialog.tsx (envia pelo sistema)
 *   - DocumentosPendentes.tsx (Exportar Pacote local)
 *
 * Por que existe
 *   Bug histórico: ZIP era montado lendo só de contas_pagar_documentos. Quando
 *   a NF estava via nf_stage_id mas o "move" Stage→Docs falhou (silencioso),
 *   o ZIP saía vazio e o envio quebrava.
 *
 * Resolução
 *   1. Lê de contas_pagar_documentos (canal direto)
 *   2. Detecta storage_path com prefixo "nfs-stage/" e roteia pro bucket certo
 *   3. Pra contas SEM doc registrado mas com nf_stage_id, faz fallback final:
 *      busca direto no nfs_stage (cinto + suspensório — depois do backfill,
 *      esse caminho deve quase nunca disparar)
 *
 * Doutrina
 *   "NF cadastrada ≠ NF anexada." O envio só inclui evidência (arquivo).
 *   Se uma conta tem nf_aplicavel=false, ela passa sem NF — não erra.
 *
 *   #15: XML é dado, PDF é prova. Pacote ao contador exige PDF/imagem.
 *   XML standalone é importante no banco (parsing, fiscal) mas NÃO é o que
 *   o contador precisa receber. Filtra extensão na hora de montar o ZIP.
 */
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface DocRow {
  id: string;
  conta_id: string;
  nome_arquivo: string;
  storage_path: string;
  tipo: string;
  contas_pagar_receber: {
    descricao: string | null;
    valor: number;
    data_pagamento: string | null;
    fornecedor_cliente: string | null;
    nf_aplicavel: boolean | null;
    parceiros_comerciais: { razao_social: string | null } | null;
  } | null;
}

interface StageFallback {
  conta_id: string;
  fornecedor: string;
  descricao: string;
  valor: number;
  data_pagamento: string | null;
  arquivo_storage_path: string | null;
  arquivo_nome: string | null;
  nf_aplicavel: boolean;
}

export interface MontarPacoteResult {
  blob: Blob;
  qtdDocumentos: number;
  contasSemDoc: string[]; // contas que ficaram sem nenhum arquivo (transparência)
}

// -----------------------------------------------------------------------------
// Roteamento de bucket
// -----------------------------------------------------------------------------
//
// Convenção (cravada pelo backfill):
//   - Path SEM prefixo de bucket → bucket "financeiro-docs"
//   - Path COM prefixo "nfs-stage/" → bucket "nfs-stage" (stripa o prefixo)

function resolverBucketEPath(storagePath: string): {
  bucket: string;
  pathReal: string;
} {
  if (storagePath.startsWith("nfs-stage/")) {
    return {
      bucket: "nfs-stage",
      pathReal: storagePath.replace(/^nfs-stage\//, ""),
    };
  }
  return { bucket: "financeiro-docs", pathReal: storagePath };
}

function sanitizarPasta(nome: string): string {
  return nome.replace(/[\/\\:*?"<>|]/g, "_").trim() || "Sem-fornecedor";
}

// Doutrina #15: só PDF/imagem vão pro contador. XML standalone fica no banco.
const ehArquivoVisual = (nome: string): boolean =>
  /\.(pdf|jpg|jpeg|png)$/i.test(nome);

// -----------------------------------------------------------------------------
// Função principal
// -----------------------------------------------------------------------------

export async function montarZipPacoteFiscal(
  contaIds: string[],
): Promise<MontarPacoteResult> {
  if (contaIds.length === 0) {
    throw new Error("Nenhuma conta selecionada");
  }

  // 1. Busca docs registrados em contas_pagar_documentos (canal canônico)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docsRaw, error: errDocs } = await (supabase as any)
    .from("contas_pagar_documentos")
    .select(
      `
      id, nome_arquivo, storage_path, tipo, conta_id,
      contas_pagar_receber!inner(
        descricao, valor, data_pagamento,
        fornecedor_cliente, nf_aplicavel,
        parceiros_comerciais:parceiro_id(razao_social)
      )
    `,
    )
    .in("conta_id", contaIds);

  if (errDocs) throw errDocs;
  const docs = (docsRaw || []) as DocRow[];

  // 2. Identifica contas sem doc registrado — candidatas a fallback Stage
  const contasComDoc = new Set(docs.map((d) => d.conta_id));
  const contasSemDoc = contaIds.filter((id) => !contasComDoc.has(id));

  // 3. Fallback Stage: pra contas órfãs com nf_stage_id, busca direto no Stage
  const fallbacks: StageFallback[] = [];
  if (contasSemDoc.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stageData, error: errStage } = await (supabase as any)
      .from("contas_pagar_receber")
      .select(
        `
        id, descricao, valor, data_pagamento, fornecedor_cliente, nf_aplicavel,
        nf_stage_id,
        nfs_stage:nf_stage_id(
          id,
          documentos:nfs_stage_documentos(tipo, storage_path, arquivo_nome)
        ),
        parceiros_comerciais:parceiro_id(razao_social)
      `,
      )
      .in("id", contasSemDoc);

    if (errStage) throw errStage;

    for (const c of (stageData || []) as Array<{
      id: string;
      descricao: string | null;
      valor: number;
      data_pagamento: string | null;
      fornecedor_cliente: string | null;
      nf_aplicavel: boolean | null;
      nf_stage_id: string | null;
      nfs_stage: {
        id: string;
        documentos: Array<{
          tipo: string;
          storage_path: string;
          arquivo_nome: string | null;
        }> | null;
      } | null;
      parceiros_comerciais: { razao_social: string | null } | null;
    }>) {
      if (!c.nfs_stage) continue;
      // Doutrina #15: pacote ao contador = APENAS PDF DANFE. XML e Boleto fora.
      const pdfDanfe = c.nfs_stage.documentos?.find(
        (d) => d.tipo === "pdf_danfe",
      );
      if (!pdfDanfe) {
        continue;
      }
      fallbacks.push({
        conta_id: c.id,
        fornecedor:
          c.parceiros_comerciais?.razao_social ||
          c.fornecedor_cliente ||
          "Sem-fornecedor",
        descricao: c.descricao || "",
        valor: c.valor,
        data_pagamento: c.data_pagamento,
        arquivo_storage_path: pdfDanfe.storage_path,
        arquivo_nome: pdfDanfe.arquivo_nome,
        nf_aplicavel: c.nf_aplicavel ?? true,
      });
    }
  }

  // 4. Decide se há algo pra empacotar
  if (docs.length === 0 && fallbacks.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dispensadas } = await (supabase as any)
      .from("contas_pagar_receber")
      .select("id, nf_aplicavel")
      .in("id", contaIds)
      .eq("nf_aplicavel", false);

    const qtdDispensadas = (dispensadas || []).length;

    if (qtdDispensadas === 0) {
      throw new Error(
        "Nenhum documento encontrado nas contas selecionadas. " +
          "Verifique se as NFs estão anexadas ou se há contas marcadas como 'NF não aplicável'.",
      );
    }
  }

  // 5. Monta ZIP
  const zip = new JSZip();
  const csvLinhas = [
    "Fornecedor;Descrição;Valor;Data Pagamento;Tipo;Arquivo;Origem",
  ];
  let baixados = 0;
  const contasComArquivo = new Set<string>();

  // 5a. Docs do canal direto (incluindo paths apontando pro Stage via prefixo)
  for (const d of docs) {
    // Doutrina #15: pula XML standalone — não vai pro contador
    if (!ehArquivoVisual(d.nome_arquivo)) {
      console.info(
        `[pacote-fiscal] Ignorando ${d.nome_arquivo} (não é PDF/imagem). XML fica no banco como dado.`,
      );
      continue;
    }
    const { bucket, pathReal } = resolverBucketEPath(d.storage_path);
    const fornecedor = sanitizarPasta(
      d.contas_pagar_receber?.parceiros_comerciais?.razao_social ||
        d.contas_pagar_receber?.fornecedor_cliente ||
        "Sem-fornecedor",
    );

    try {
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(pathReal, 60 * 30);
      if (!signed?.signedUrl) {
        console.warn(`Signed URL falhou pra ${pathReal} (bucket ${bucket})`);
        continue;
      }
      const res = await fetch(signed.signedUrl);
      if (!res.ok) {
        console.warn(`Fetch falhou pra ${pathReal}: ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      zip.file(`${fornecedor}/${d.nome_arquivo}`, blob);
      baixados++;
      contasComArquivo.add(d.conta_id);
      csvLinhas.push(
        [
          fornecedor,
          (d.contas_pagar_receber?.descricao || "").replace(/;/g, ","),
          d.contas_pagar_receber?.valor?.toString() || "0",
          d.contas_pagar_receber?.data_pagamento || "",
          d.tipo || "",
          d.nome_arquivo,
          bucket,
        ].join(";"),
      );
    } catch (e) {
      console.error(`Falha ao baixar doc ${d.nome_arquivo}:`, e);
    }
  }

  // 5b. Fallback Stage (cinto + suspensório — pós backfill quase nunca dispara)
  for (const f of fallbacks) {
    if (contasComArquivo.has(f.conta_id)) continue;

    const fornecedor = sanitizarPasta(f.fornecedor);
    const arquivos: Array<{ path: string; nome: string; tipo: string }> = [];

    // Doutrina #15: só inclui arquivo_storage_path se for PDF/imagem.
    // xml_storage_path NUNCA entra no pacote do contador.
    if (
      f.arquivo_storage_path &&
      f.arquivo_nome &&
      ehArquivoVisual(f.arquivo_nome)
    ) {
      arquivos.push({
        path: f.arquivo_storage_path,
        nome: f.arquivo_nome,
        tipo: "nf",
      });
    }

    for (const arq of arquivos) {
      try {
        const { data: signed } = await supabase.storage
          .from("nfs-stage")
          .createSignedUrl(arq.path, 60 * 30);
        if (!signed?.signedUrl) continue;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) continue;
        const blob = await res.blob();
        zip.file(`${fornecedor}/${arq.nome}`, blob);
        baixados++;
        contasComArquivo.add(f.conta_id);
        csvLinhas.push(
          [
            fornecedor,
            f.descricao.replace(/;/g, ","),
            f.valor.toString(),
            f.data_pagamento || "",
            arq.tipo,
            arq.nome,
            "nfs-stage (fallback)",
          ].join(";"),
        );
      } catch (e) {
        console.error(`Fallback Stage falhou pra ${arq.path}:`, e);
      }
    }
  }

  // 6. Identifica contas que ficaram sem arquivo (excluindo dispensadas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contasInfo } = await (supabase as any)
    .from("contas_pagar_receber")
    .select("id, nf_aplicavel, fornecedor_cliente")
    .in("id", contaIds);

  const contasSemArquivoFinal: string[] = [];
  for (const c of (contasInfo || []) as Array<{
    id: string;
    nf_aplicavel: boolean | null;
    fornecedor_cliente: string | null;
  }>) {
    if (contasComArquivo.has(c.id)) continue;
    if (c.nf_aplicavel === false) continue;
    contasSemArquivoFinal.push(c.fornecedor_cliente || c.id);
  }

  zip.file("_resumo.csv", csvLinhas.join("\n"));
  const blob = await zip.generateAsync({ type: "blob" });

  return {
    blob,
    qtdDocumentos: baixados,
    contasSemDoc: contasSemArquivoFinal,
  };
}
