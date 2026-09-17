/**
 * ERRO-DA-EDGE-É-INFORMAÇÃO.
 *
 * Quando uma edge function responde com status não-2xx, o supabase-js devolve
 * `data = null` e um `FunctionsHttpError` cujo corpo HTTP fica preso em
 * `error.context` (um `Response`). Ler só `data?.erro ?? error?.message` joga
 * fora o motivo real e o operador vê apenas
 * "Edge Function returned a non-2xx status code".
 *
 * Este formatador lê esse corpo e monta a mensagem humana. Nunca lança: roda
 * dentro de `catch`.
 */

type ItemMotivo = {
  numero_titulo?: string;
  titulo_id?: string;
  motivo?: string;
};

type CorpoErro = {
  erro?: unknown;
  erros?: unknown;
  pulados?: unknown;
};

const MAX_ITENS = 6;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Lê o corpo JSON preso em `error.context`. Corpo não-JSON não derruba nada. */
async function lerCorpo(error: unknown): Promise<CorpoErro | null> {
  try {
    if (!ehObjeto(error)) return null;
    const ctx = (error as { context?: unknown }).context;
    if (!ehObjeto(ctx)) return null;
    const json = (ctx as { json?: unknown }).json;
    if (typeof json !== "function") return null;
    const corpo = await (json as () => Promise<unknown>).call(ctx);
    return ehObjeto(corpo) ? (corpo as CorpoErro) : null;
  } catch {
    return null;
  }
}

function itensDe(v: unknown): ItemMotivo[] {
  if (!Array.isArray(v)) return [];
  return v.filter(ehObjeto) as ItemMotivo[];
}

function formatarItens(itens: ItemMotivo[]): string {
  if (itens.length === 0) return "";
  const mostrados = itens.slice(0, MAX_ITENS).map((x) => {
    const quem = x.numero_titulo ?? x.titulo_id ?? "?";
    return `${quem}: ${x.motivo ?? "sem motivo"}`;
  });
  const resto = itens.length - mostrados.length;
  const texto = mostrados.join(" · ");
  return resto > 0 ? `${texto} · +${resto} outros` : texto;
}

/**
 * Mensagem humana para uma falha de edge function.
 *
 * @param data corpo devolvido quando a edge respondeu 200 com `ok:false`
 * @param error erro do supabase-js (pode carregar o corpo em `.context`)
 * @param fallback texto quando nada mais produziu mensagem
 */
export async function mensagemErroEdge(
  data: unknown,
  error: unknown,
  fallback: string,
): Promise<string> {
  try {
    const corpo = (await lerCorpo(error)) ?? (ehObjeto(data) ? (data as CorpoErro) : null);

    const partes: string[] = [];
    if (corpo) {
      if (typeof corpo.erro === "string" && corpo.erro.trim()) partes.push(corpo.erro.trim());
      const itens = [...itensDe(corpo.erros), ...itensDe(corpo.pulados)];
      const lista = formatarItens(itens);
      if (lista) partes.push(lista);
    }

    const montada = partes.filter(Boolean).join(" — ");
    if (montada) return montada;

    const msg = ehObjeto(error) ? (error as { message?: unknown }).message : undefined;
    if (typeof msg === "string" && msg.trim()) return msg.trim();

    return fallback;
  } catch {
    return fallback;
  }
}
