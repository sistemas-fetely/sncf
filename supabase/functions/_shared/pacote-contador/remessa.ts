// Pacote do Contador v2 — links e e-mail das partes (compartilhado pela geração e pelo novo link).
// deno-lint-ignore-file no-explicit-any
export const BUCKET = "contabil";
export const TTL_LINK_DIAS = 30;

export type Parte = { indice: number; path: string; bytes: number; arquivos: number; link?: string | null; link_expira_em?: string | null };

/** Gera signed URLs novas para todas as partes; lança com a mensagem real do Storage. */
export async function assinarPartes(admin: any, partes: Parte[]): Promise<{ partes: Parte[]; expira: string }> {
  const expira = new Date(Date.now() + TTL_LINK_DIAS * 86400_000).toISOString();
  const out: Parte[] = [];
  for (const p of partes) {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(p.path, TTL_LINK_DIAS * 86400, {
      download: p.path.split("/").pop(),
    });
    if (error || !data?.signedUrl) throw new Error(`Falha ao gerar link de ${p.path}: ${error?.message ?? "sem URL"}`);
    out.push({ ...p, link: data.signedUrl, link_expira_em: expira });
  }
  return { partes: out, expira };
}

const fmtBR = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const mb = (b: number) => `${(b / 1048576).toFixed(1).replace(".", ",")} MB`;

/** Mesmo caminho do gerar-pacote-contabil: send-transactional-email (Resend), template pacote-fiscal-contador. */
export async function enviarEmailRemessa(opts: {
  supabaseUrl: string; anonKey: string; authHeader: string; remessa: any; partes: Parte[]; expira: string; motivo: "envio" | "reenvio";
}): Promise<{ enviados: number; erros: string[] }> {
  const { remessa, partes } = opts;
  const dest: string[] = remessa.destinatarios ?? [];
  const erros: string[] = []; let enviados = 0;
  if (!dest.length) return { enviados, erros };
  const m = remessa.manifesto ?? {};
  const rotulo = `${String(remessa.competencia).slice(5, 7)}/${String(remessa.competencia).slice(0, 4)}`;
  const linhas = [
    remessa.observacao ?? "",
    "",
    `Pacote ${rotulo} — versão ${remessa.versao} (${partes.length} parte${partes.length > 1 ? "s" : ""}):`,
    ...partes.map((p) => `Parte ${p.indice} (${mb(p.bytes)}): ${p.link}`),
    "",
    "Resumo do manifesto:",
    ...Object.entries(m.pastas ?? {}).map(([k, v]: [string, any]) => `- ${k}: ${v.arquivos} arquivo(s)`),
    `- Faltantes: ${(m.faltantes ?? []).length} (lista completa no manifesto.pdf dentro do pacote)`,
  ].filter((l, i) => i > 0 || l);
  for (const email of dest) {
    try {
      const resp = await fetch(`${opts.supabaseUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { Authorization: opts.authHeader, apikey: opts.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: "pacote-fiscal-contador",
          recipientEmail: email,
          idempotencyKey: `pacote-contador-v2-${remessa.id}-${opts.motivo}-${opts.expira}-${email}`,
          templateData: {
            mensagem_personalizada: linhas.join("\n"),
            descricao_remessa: `Pacote contábil ${rotulo} v${remessa.versao}`,
            qtd_contas: Object.keys(m.bancos ?? {}).length,
            qtd_documentos: Number(m.total_arquivos ?? 0),
            link_zip: partes[0]?.link ?? "",
            link_expira_em: fmtBR(opts.expira),
            periodo: `${fmtBR(remessa.periodo_inicio)} a ${fmtBR(remessa.periodo_fim)}`,
            remetente_nome: "Equipe Fetély",
          },
          metadata: { remessa_id: remessa.id, feature: "pacote_contador_v2" },
        }),
      });
      const res = await resp.json().catch(() => null);
      if (!resp.ok || res?.error) { erros.push(`${email}: ${res?.error ?? `HTTP ${resp.status}`}`); continue; }
      enviados++;
    } catch (e) { erros.push(`${email}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { enviados, erros };
}
