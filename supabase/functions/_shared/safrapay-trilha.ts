// deno-lint-ignore-file no-explicit-any
/** A trilha usa datas civis de São Paulo, como o registro manual de cartão. */
export function dataTrilhaSafra(data: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(data));
}

/** Mesma normalização da RPC: signinToken não faz parte do endereço do checkout. */
export function urlTrilhaSafra(url: string): string {
  return url.trim().replace(/([?&])signinToken=[^&#]*&?/gi, "$1").replace(/[?&]$/, "");
}

export async function registrarTrilhaSafra(sb: any, pedido: { id: string; origem: string | null },
  link: { url: string; criado_em: string; expira_em: string }, ehPix: boolean): Promise<void> {
  if (pedido.origem === "venda_direta") return;
  // Reaproveitar o link não renova validade nem cria outra entrada na trilha.
  const { data, error } = await sb.from("pedido_link_pagamento").select("id")
    .eq("pedido_id", pedido.id).eq("status", "ativo").eq("link", urlTrilhaSafra(link.url)).maybeSingle();
  if (error) throw new Error(`Ler trilha do link: ${error.message}`);
  if (data) return;
  const { error: erro } = await sb.rpc("registrar_link_pagamento", {
    p_pedido_id: pedido.id, p_link: link.url,
    p_gerado_em: dataTrilhaSafra(link.criado_em), p_expira_em: dataTrilhaSafra(link.expira_em),
    p_tipo_pagamento: ehPix ? "pix" : "cartao", p_motivo: null,
  });
  if (erro) throw new Error(`Link criado no Safrapay mas não registrado na trilha: ${erro.message}`);
}

/** Só encerra a URL correspondente: jamais invalida um link novo do mesmo pedido. */
export async function substituirTrilhaSafra(sb: any, link: { pedido_id: string; url?: string | null; titulo_id?: string | null }): Promise<void> {
  if (!link.url || link.titulo_id) return;
  const { error } = await sb.from("pedido_link_pagamento")
    .update({ status: "substituido", updated_at: new Date().toISOString() })
    .eq("pedido_id", link.pedido_id).eq("link", urlTrilhaSafra(link.url)).eq("status", "ativo");
  if (error) throw new Error(`Encerrar trilha do link: ${error.message}`);
}