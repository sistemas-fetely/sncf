// Grava parceiros_comerciais.bling_id e CONFIRMA a gravação.
// HTTP 200 do Bling não confirma nada no SNCF: só há sucesso quando o UPDATE
// devolve a linha gravada com o mesmo bling_id. Conflito no índice único
// ux_parceiros_bling_id identifica o outro parceiro dono do id (provável
// duplicata) — nunca mescla nem desativa nada aqui.

export type ResultadoGravacao =
  | { ok: true }
  | {
    ok: false;
    erro: string;
    conflito?: { parceiro_id: string; razao_social: string | null; documento: string | null };
  };

const digitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// deno-lint-ignore no-explicit-any
export async function gravarBlingIdConfirmado(supabase: any, parceiroId: string, blingId: string): Promise<ResultadoGravacao> {
  const { data, error } = await supabase
    .from("parceiros_comerciais")
    .update({ bling_id: blingId })
    .eq("id", parceiroId)
    .select("id, bling_id");

  if (error) {
    if (error.code === "23505") {
      const { data: dono, error: eDono } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, cpf, cnpj")
        .eq("bling_id", blingId)
        .neq("id", parceiroId)
        .limit(1);
      if (eDono) {
        return { ok: false, erro: `id Bling ${blingId} já pertence a outro parceiro (falha ao identificar qual: ${eDono.message})` };
      }
      const outro = Array.isArray(dono) ? dono[0] : null;
      if (outro) {
        const documento = digitos(outro.cnpj || outro.cpf) || null;
        return {
          ok: false,
          erro: `id Bling ${blingId} já está gravado em outro parceiro (${outro.razao_social ?? "sem nome"}${documento ? `, doc ${documento}` : ""}, id ${outro.id}) — provável cadastro duplicado; mesclar exige decisão humana`,
          conflito: { parceiro_id: outro.id, razao_social: outro.razao_social ?? null, documento },
        };
      }
      return { ok: false, erro: `id Bling ${blingId} viola índice único: ${error.message}` };
    }
    return { ok: false, erro: `Falha ao gravar bling_id no SNCF: ${error.message}` };
  }

  const linha = Array.isArray(data) ? data[0] : null;
  if (!linha) return { ok: false, erro: "Falha ao gravar bling_id no SNCF: nenhuma linha atualizada" };
  if (String(linha.bling_id ?? "") !== blingId) {
    return { ok: false, erro: `Falha ao gravar bling_id no SNCF: gravado ${linha.bling_id ?? "nulo"}, esperado ${blingId}` };
  }
  return { ok: true };
}
