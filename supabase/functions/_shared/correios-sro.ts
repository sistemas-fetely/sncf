import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function makeSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getTokenValido(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("correios_token")
    .select("token, expira_em, atualizado_em")
    .eq("ambiente", "PRODUCAO")
    .gt("expira_em", new Date().toISOString())
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`token Correios: erro ao ler (${error.message})`);
  if (!data?.token) throw new Error("token Correios ausente/expirado — refresh não rodou");
  return data.token as string;
}

export interface RastreioResult {
  ok: boolean;
  erro?: string;
  status?: string;
  entregue?: boolean;
  eventos?: number;
}

export async function rastrearCodigoSRO(
  supabase: SupabaseClient,
  codigo: string,
  tokenCache?: { token?: string },
): Promise<RastreioResult> {
  try {
    const token = tokenCache?.token ?? (await getTokenValido(supabase));
    if (tokenCache && !tokenCache.token) tokenCache.token = token;

    const url = `https://api.correios.com.br/srorastro/v1/objetos/${codigo}?resultado=T`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const bodyText = await resp.text();
    if (!resp.ok) {
      return { ok: false, erro: `SRO ${resp.status}: ${bodyText.slice(0, 200)}` };
    }

    const dados = JSON.parse(bodyText);
    const objeto = dados?.objetos?.[0];
    const eventos: any[] = objeto?.eventos ?? [];
    const ultimo = eventos[0];
    const descricao: string | undefined = ultimo?.descricao;
    const entregue = eventos.some((e) =>
      e?.codigo === "BDE" || (typeof e?.descricao === "string" && /entregue/i.test(e.descricao))
    );
    const status = descricao ?? "Sem eventos";
    const dtPrevistaRaw: string | undefined = objeto?.dtPrevista;
    const previsaoEntrega =
      typeof dtPrevistaRaw === "string" && dtPrevistaRaw.length >= 10
        ? dtPrevistaRaw.slice(0, 10)
        : null;

    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      status_atual: status,
      entregue,
      data_ultima_atualizacao: nowIso,
      atualizado_em: nowIso,
    };
    if (eventos.length > 0) update.eventos = eventos;
    if (previsaoEntrega) update.previsao_entrega = previsaoEntrega;

    const { error: upErr } = await supabase
      .from("pedido_rastreamento")
      .update(update)
      .eq("codigo_rastreio", codigo);

    if (upErr) return { ok: false, erro: `update: ${upErr.message}` };

    return { ok: true, status, entregue, eventos: eventos.length };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
