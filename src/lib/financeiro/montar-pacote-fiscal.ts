/**
 * Helper compartilhado: monta ZIP de pacote fiscal pra envio ao contador.
 *
 * Usado em 2 lugares:
 *   - EnviarPeloSistemaDialog.tsx (envia pelo sistema)
 *   - DocumentosPendentes.tsx (Exportar Pacote local)
 *
 * Por que existe
 *   Bug histórico: ZIP era montado lendo só de contas_pagar_documentos. Quando
 *   a NF estava vinculada via nfs_stage.conta_pagar_id (modelo N:1) mas o
 *   "move" Stage→Docs falhou (silencioso), o ZIP saía vazio e o envio quebrava.
 *
 * Resolução
 *   1. Lê de contas_pagar_documentos (canal direto)
 *   2. Detecta storage_path com prefixo "nfs-stage/" e roteia pro bucket certo
 *   3. Pra contas SEM doc registrado mas com NFs vinculadas em nfs_stage
 *      (conta_pagar_id = cpr.id), faz fallback final: busca direto no nfs_stage
 *      (cinto + suspensório — depois do backfill, esse caminho deve quase nunca disparar)
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
  conta_pagar_id: string;
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
  conta_pagar_id: string;
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
      id, nome_arquivo, storage_path, tipo, conta_pagar_id,
      contas_pagar_receber!inner(
        descricao, valor, data_pagamento,
        fornecedor_cliente, nf_aplicavel,
        parceiros_comerciais:parceiro_id(razao_social)
      )
    `,
    )
    .in("conta_pagar_id", contaIds);

  if (errDocs) throw errDocs;
  const docs = (docsRaw || []) as DocRow[];

  // 2. Identifica contas sem doc registrado — candidatas a fallback Stage
  const contasComDoc = new Set(docs.map((d) => d.conta_pagar_id));
  const contasSemDoc = contaIds.filter((id) => !contasComDoc.has(id));

  // 3. Fallback Stage: pra contas órfãs, busca TODAS as NFs anexadas via conta_pagar_id.
  //    Modelo N:1: 1 CPR pode ter N NFs anexadas (caso típico: 3 NFs do mesmo
  //    fornecedor consolidadas em 1 lançamento de cartão).
  const fallbacks: StageFallback[] = [];
  if (contasSemDoc.length > 0) {
    // 3a. Dados base das CPRs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cprData, error: errCpr } = await (supabase as any)
      .from("contas_pagar_receber")
      .select(
        `
        id, descricao, valor, data_pagamento, fornecedor_cliente, nf_aplicavel,
        parceiros_comerciais:parceiro_id(razao_social)
      `,
      )
      .in("id", contasSemDoc);

    if (errCpr) throw errCpr;

    const cprMap = new Map<
      string,
      {
        descricao: string | null;
        valor: number;
        data_pagamento: string | null;
        fornecedor_cliente: string | null;
        nf_aplicavel: boolean | null;
        parceiros_comerciais: { razao_social: string | null } | null;
      }
    >();
    for (const c of (cprData || []) as Array<{
      id: string;
      descricao: string | null;
      valor: number;
      data_pagamento: string | null;
      fornecedor_cliente: string | null;
      nf_aplicavel: boolean | null;
      parceiros_comerciais: { razao_social: string | null } | null;
    }>) {
      cprMap.set(c.id, c);
    }

    // 3b. Busca TODAS as NFs anexadas a essas CPRs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nfsData, error: errNfs } = await (supabase as any)
      .from("nfs_stage")
      .select(
        `
        id,
        conta_pagar_id,
        documentos:nfs_stage_documentos(tipo, storage_path, arquivo_nome)
      `,
      )
      .in("conta_pagar_id", contasSemDoc);

    if (errNfs) throw errNfs;

    // 3c. Agrupa por conta_pagar_id
    const nfsPorConta = new Map<
      string,
      Array<{
        id: string;
        pdfDanfe: { tipo: string; storage_path: string; arquivo_nome: string | null } | null;
      }>
    >();
    for (const nf of (nfsData || []) as Array<{
      id: string;
      conta_pagar_id: string;
      documentos: Array<{
        tipo: string;
        storage_path: string;
        arquivo_nome: string | null;
      }> | null;
    }>) {
      // Doutrina #15: pacote ao contador = APENAS PDF DANFE.
      const pdfDanfe = nf.documentos?.find((d) => d.tipo === "pdf_danfe") || null;
      const arr = nfsPorConta.get(nf.conta_pagar_id) || [];
      arr.push({ id: nf.id, pdfDanfe });
      nfsPorConta.set(nf.conta_pagar_id, arr);
    }

    // 3d. Monta fallbacks: 1 entrada por NF anexada com PDF DANFE
    for (const [contaId, nfs] of nfsPorConta) {
      const cpr = cprMap.get(contaId);
      if (!cpr) continue;
      const fornecedor =
        cpr.parceiros_comerciais?.razao_social ||
        cpr.fornecedor_cliente ||
        "Sem-fornecedor";
      const nfsComDanfe = nfs.filter((n) => n.pdfDanfe !== null);
      const total = nfsComDanfe.length;
      nfsComDanfe.forEach((nf, idx) => {
        const sufixo = total > 1 ? ` (NF ${idx + 1} de ${total})` : "";
        fallbacks.push({
          conta_pagar_id: contaId,
          fornecedor,
          descricao: (cpr.descricao || "") + sufixo,
          valor: cpr.valor,
          data_pagamento: cpr.data_pagamento,
          arquivo_storage_path: nf.pdfDanfe!.storage_path,
          arquivo_nome: nf.pdfDanfe!.arquivo_nome,
          nf_aplicavel: cpr.nf_aplicavel ?? true,
        });
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
      contasComArquivo.add(d.conta_pagar_id);
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
    if (contasComArquivo.has(f.conta_pagar_id)) continue;

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
        contasComArquivo.add(f.conta_pagar_id);
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
