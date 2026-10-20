import { toast } from "sonner";

// 20/10/2026 (PIX): para PIX, `link_pagamento` guarda o copia-e-cola (EMV), não uma URL.
// Com `pix_token`, o que vai para a área de transferência é a página pública /pagar/:token.
// Fonte única da URL: ninguém monta `/pagar/` fora daqui.

export const ROTULO_LINK_PIX_COPIADO = "Link de pagamento PIX copiado";

export function urlPaginaPix(token: string): string {
  return `${window.location.origin}/pagar/${token}`;
}

/** O que copiar: página pública quando há token; senão o link de sempre. */
export function alvoCopiaPagamento(pixToken: string | null | undefined, link: string | null | undefined): string | null {
  return pixToken ? urlPaginaPix(pixToken) : link ?? null;
}

/** Copia com toast. Sem token, usa `rotulo` (o texto que o ponto já usava). */
export async function copiarLinkPagamento({
  pixToken, link, rotulo = "Link de pagamento copiado", erro = "Não foi possível copiar o link",
}: { pixToken?: string | null; link?: string | null; rotulo?: string; erro?: string }): Promise<void> {
  const alvo = alvoCopiaPagamento(pixToken, link);
  if (!alvo) return;
  try {
    await navigator.clipboard.writeText(alvo);
    toast.success(pixToken ? ROTULO_LINK_PIX_COPIADO : rotulo);
  } catch (e) {
    toast.error(erro, { description: e instanceof Error ? e.message : undefined });
  }
}
