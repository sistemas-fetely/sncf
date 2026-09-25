/**
 * Cliente HTTP do Portal do Representante.
 *
 * O representante NÃO tem conta no Supabase Auth: não usamos o cliente
 * autenticado do app. Tudo passa pela edge `portal-representante`, por fetch.
 * A sessão vive apenas na memória do React durante a visita.
 */

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-representante`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type PortalAcao =
  | "solicitar"
  | "abrir"
  | "painel"
  | "sair"
  | "estimar"
  | "contestar"
  | "aceitar_cartilha"
  | "extratos";

const ERRO_REDE =
  "Não foi possível falar com o servidor agora. Verifique sua conexão e tente novamente.";

export async function chamarPortal<T = any>(
  acao: PortalAcao,
  corpo: Record<string, unknown> = {},
): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({ acao, ...corpo }),
    });
  } catch {
    throw new Error(ERRO_REDE);
  }

  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    throw new Error(ERRO_REDE);
  }

  // FAIL-LOUD: a mensagem do banco/edge é a mensagem do usuário. Nada inventado.
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.erro || json?.mensagem || ERRO_REDE);
  }
  return json as T;
}

export function fmtBRL(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function fmtPct(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;
}

export function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function fmtCompetencia(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

/**
 * Envio da nota fiscal pelo representante (multipart).
 * Vai para a edge `portal-documento-upload`, que valida a sessão com service role.
 */
export async function enviarDocumentoPortal(dados: {
  sessao: string;
  extrato_id: string;
  tipo: "nf_servico" | "rpa";
  numero: string;
  data_emissao: string;
  valor: string;
  arquivo: File;
}): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-documento-upload`;
  const form = new FormData();
  form.append("sessao", dados.sessao);
  form.append("extrato_id", dados.extrato_id);
  form.append("tipo", dados.tipo);
  form.append("numero", dados.numero);
  form.append("data_emissao", dados.data_emissao);
  form.append("valor", dados.valor);
  form.append("arquivo", dados.arquivo, dados.arquivo.name);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: form,
    });
  } catch {
    throw new Error(ERRO_REDE);
  }
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    throw new Error(ERRO_REDE);
  }
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.erro || json?.error || json?.mensagem || ERRO_REDE);
  }
  return json;
}
