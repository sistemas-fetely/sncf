/**
 * NOME-DE-ARQUIVO-FALA-O-PEDIDO: quem recebe o arquivo (cliente, contador, a
 * propria SOps na pasta de Downloads) precisa saber de que PEDIDO e de que NF
 * ele e sem abrir. Formato: `PED-2108_NF-000346-1`.
 *
 * FONTE-UNICA: as 7 superficies que baixam NF chamavam a mesma expressao
 * `NF-${numero}-${serie}` copiada inline. Passou a viver aqui — mudar o padrao
 * e uma edicao, nao sete.
 *
 * A extensao NAO entra aqui: `useDownloadNfPdf` concatena `.pdf` / `.xml`.
 */

/** Mantem o nome seguro em qualquer sistema de arquivos e em URL. */
function limpar(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export interface NomeArquivoNfArgs {
  /** Referencia legivel do pedido (`pedidos.id_externo`, `pedido_ref` no B2C). */
  pedidoRef?: string | null;
  numero?: string | null;
  serie?: string | null;
  /** Ultimo recurso quando a NF nao tem numero (rara, mas existe). */
  fallbackId?: string | null;
}

export function nomeArquivoNf({
  pedidoRef,
  numero,
  serie,
  fallbackId,
}: NomeArquivoNfArgs): string {
  const partes: string[] = [];

  const ped = limpar(pedidoRef);
  if (ped) partes.push(ped);

  // O rotulo `NF-` NUNCA cai fora: sem ele, `PED-2108.xml` nao diz que e nota.
  const num = limpar(numero);
  if (num) {
    const ser = limpar(serie);
    partes.push(`NF-${num}${ser ? `-${ser}` : ""}`);
  } else {
    partes.push(`NF-${limpar(fallbackId) || "sem-identificacao"}`);
  }

  return partes.join("_");
}
