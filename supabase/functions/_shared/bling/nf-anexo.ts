// Módulo compartilhado: resolução e validação de anexos de NF (PDF/XML) do Bling.
//
// Por que existe: `nfs_emitidas.pdf_url` NÃO é endereço permanente — é URL
// assinada com validade de ~48h. Quando expira, o Bling responde HTTP 200 com
// text/html e a página "Validação de Acesso". Um guard de `res.ok` não pega
// isso, e o arquivo entregue ao cliente vira uma página de login com nome de
// nota fiscal. Toda a lógica de resolver link fresco + validar bytes vive aqui,
// em um lugar só, consumida por `nf-download` e pelo ramo `anexos_nf` de
// `enviar-pedido-bling`.
import { ensureFreshToken, makeBlingClient, BLING_BASE, type BlingConfig } from "./bling-client.ts";

export type OrigemLink = "bling_fresco" | "cache_sem_bling_id";

export type NfAnexoRow = {
  id: string;
  bling_id?: string | number | null;
  numero?: string | number | null;
  serie?: string | number | null;
  pdf_url?: string | null;
  xml_url?: string | null;
};

export type LinkPdfResolvido = {
  url: string;
  origem: OrigemLink;
  xml: string | null;
  backfill: boolean;
};

/** Erro com status HTTP e contexto para o chamador devolver ao operador. */
export class NfAnexoError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "NfAnexoError";
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Resolve um link de PDF utilizável.
 * Com `bling_id`, SEMPRE chama GET /nfe/{bling_id} para obter link fresco e faz
 * backfill de `pdf_url` (e `xml_url`, se vier e estiver vazio). O `pdf_url`
 * salvo é tratado como cache, nunca como fonte de verdade.
 */
export async function resolverLinkPdfFresco(
  supabase: any,
  cfg: BlingConfig | null,
  nf: NfAnexoRow,
): Promise<LinkPdfResolvido> {
  const rotulo = nf.numero ?? nf.bling_id ?? nf.id;

  if (nf.bling_id) {
    let config = cfg;
    if (!config?.access_token) {
      const { data: cfgData } = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();
      config = (cfgData ?? null) as BlingConfig | null;
    }
    if (!config?.access_token) {
      throw new NfAnexoError(409, "Bling não conectado. Conecte a integração para resolver o PDF.", {
        nf_id: nf.id,
      });
    }

    const token = await ensureFreshToken(supabase, config);
    const client = makeBlingClient(supabase, config, token);

    console.log("[nf-anexo] resolvendo link fresco no Bling", { nf_id: nf.id, bling_id: nf.bling_id });
    const res = await client.get(`/nfe/${nf.bling_id}`);
    const d = res?.data ?? {};
    const link = String(d.linkPDF ?? d.linkDanfe ?? "").trim();
    const linkXml = String(d.xml ?? "").trim();

    if (!link) {
      throw new NfAnexoError(
        502,
        `Bling não retornou linkPDF nem linkDanfe para a NF ${rotulo} (${BLING_BASE}/nfe/${nf.bling_id}).`,
        { nf_id: nf.id, bling_id: nf.bling_id },
      );
    }

    const patch: Record<string, unknown> = { pdf_url: link };
    if (linkXml && !nf.xml_url) patch.xml_url = linkXml;
    const { error: upErr } = await supabase.from("nfs_emitidas").update(patch).eq("id", nf.id);
    if (upErr) {
      throw new NfAnexoError(500, `PDF resolvido, mas o backfill falhou: ${upErr.message}`, {
        nf_id: nf.id,
      });
    }

    return {
      url: link,
      origem: "bling_fresco",
      xml: linkXml || nf.xml_url || null,
      backfill: true,
    };
  }

  if (nf.pdf_url) {
    console.log("[nf-anexo] usando pdf_url em cache (sem bling_id) — link pode estar expirado", {
      nf_id: nf.id,
      numero: nf.numero,
    });
    return {
      url: nf.pdf_url,
      origem: "cache_sem_bling_id",
      xml: nf.xml_url ?? null,
      backfill: false,
    };
  }

  throw new NfAnexoError(
    404,
    `NF ${rotulo} não tem pdf_url nem bling_id — não há como resolver o PDF no Bling.`,
    { nf_id: nf.id },
  );
}

/**
 * Baixa o PDF pelo servidor e valida de verdade: status, content-type,
 * assinatura `%PDF-` e detecção da tela "Validação de Acesso" do Bling.
 * Lança `NfAnexoError` em qualquer suspeita — nunca devolve bytes duvidosos.
 */
export async function baixarPdfValidado(
  url: string,
  origem: OrigemLink,
  ctx: Record<string, unknown> = {},
): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { Accept: "application/pdf,*/*" } });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  console.log("[nf-anexo] resposta do Bling", {
    ...ctx,
    origem_link: origem,
    status: res.status,
    content_type: ct || null,
    url_final: res.url,
    redirecionado: res.redirected,
  });

  if (!res.ok) {
    const trecho = (await res.text().catch(() => "")).slice(0, 300);
    throw new NfAnexoError(502, `Bling recusou o download do PDF (HTTP ${res.status}).`, {
      detalhe: trecho,
      ...ctx,
      origem_link: origem,
    });
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const assinatura = new TextDecoder().decode(bytes.slice(0, 5));
  if (!ct.includes("pdf") && assinatura !== "%PDF-") {
    const corpo = new TextDecoder().decode(bytes.slice(0, 1000));
    const ehValidacao =
      corpo.includes("Validação de Acesso") || corpo.includes("Valida&ccedil;&atilde;o de Acesso");
    const msg = ehValidacao
      ? origem === "bling_fresco"
        ? "O Bling recusou o acesso ao PDF mesmo com link renovado (tela de Validação de Acesso)."
        : "O link salvo desta NF expirou e ela não tem bling_id para renovar — o Bling devolveu a tela de Validação de Acesso."
      : `A resposta do Bling não é um PDF (content-type: ${ct || "desconhecido"}).`;
    throw new NfAnexoError(502, msg, {
      detalhe: corpo.slice(0, 300),
      ...ctx,
      origem_link: origem,
    });
  }

  return bytes;
}

/** Confirma que o conteúdo é XML de NF-e. Lança com trecho do corpo se não for. */
export function validarXmlNf(conteudo: string, ctx: Record<string, unknown> = {}): string {
  const texto = (conteudo ?? "").trim();
  const ehXml =
    texto.startsWith("<?xml") || texto.includes("<nfeProc") || texto.includes("<NFe");
  if (!ehXml) {
    throw new NfAnexoError(
      502,
      `O conteúdo do XML não é XML de NF-e. Primeiros 200 caracteres: ${texto.slice(0, 200)}`,
      { ...ctx },
    );
  }
  return texto;
}
