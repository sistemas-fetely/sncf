export interface EtiquetaMarketplace {
  ok: boolean;
  erro?: string;
  bling_pedido_id: string;
  formato: "PDF" | "ZPL";
  pdf_base64?: string;
  zpl?: string;
  arquivos: string[];
}

export async function confirmarEtiquetaMarketplace(
  etiqueta: EtiquetaMarketplace,
  anotar: (descricao: string, metadata: { origem: string; formato: string }) => Promise<unknown>,
  marcar: () => Promise<unknown>,
) {
  if (etiqueta.formato !== "PDF" || !etiqueta.pdf_base64) throw new Error("Bling retornou somente ZPL; a etiqueta PDF não foi impressa.");
  // Anotação primeiro: falha de registro nunca libera o documento sem evidência.
  await anotar(`Etiqueta do marketplace impressa (Bling id ${etiqueta.bling_pedido_id})`, { origem: "bling", formato: etiqueta.formato });
  await marcar();
}