// Grava um lote de PI em ESTAGIO. Nada toca produto aqui: pi_import_stage nasce com estado
// 'lido' e quem julga identidade e fn_pi_conferir_lote. Erro do Postgres sobe como veio
// (FAIL-LOUD) — importacao silenciosa e pior que importacao que falha.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { extrairLinhas } from "./lerPlanilhaPI";

type StageInsert = Database["public"]["Tables"]["pi_import_stage"]["Insert"];

export type LinhaExtraida = {
  linhaNum: number;
  bruto: Record<string, unknown>;
  campos: Record<string, unknown>;
};

export type MetadadosLote = {
  arquivoNome: string;
  formato: string | null;
  fornecedor: string | null;
  piNumero: string | null;
  linhaCabecalho: number;
  mapeamento: Record<string, string>;
};

const CAMPOS_STAGE = [
  "sku",
  "cod_cadastro",
  "ean",
  "dun",
  "inner_qtd",
  "descricao",
  "qtd",
  "peso_g",
] as const;

type CampoStage = (typeof CAMPOS_STAGE)[number];

function montarStageRow(loteId: string, l: LinhaExtraida) {
  const row: Record<string, unknown> = {
    lote_id: loteId,
    linha_num: l.linhaNum,
    bruto: l.bruto,
  };

  for (const campo of CAMPOS_STAGE) {
    if (Object.prototype.hasOwnProperty.call(l.campos, campo)) {
      row[campo] = l.campos[campo];
    }
  }

  return row;
}

export async function gravarLotePI(
  meta: MetadadosLote,
  linhas: LinhaExtraida[],
): Promise<{ loteId: string; gravadas: number }> {
  if (linhas.length === 0) {
    throw new Error("nenhuma linha para gravar");
  }

  const { data: lote, error: erroLote } = await supabase
    .from("pi_import_lote")
    .insert({
      arquivo_nome: meta.arquivoNome,
      formato: meta.formato,
      fornecedor: meta.fornecedor,
      pi_numero: meta.piNumero,
      linha_cabecalho: meta.linhaCabecalho,
      total_linhas: linhas.length,
      mapeamento: meta.mapeamento,
    })
    .select("id")
    .single<{ id: string }>();

  if (erroLote) {
    throw new Error(`pi_import_lote: ${erroLote.message}`);
  }
  if (!lote?.id) {
    throw new Error("pi_import_lote: nao retornou id do lote");
  }

  const loteId = lote.id;
  const rows = linhas.map((l) => montarStageRow(loteId, l));
  const TAMANHO_BLOCO = 500;
  let gravadas = 0;

  for (let i = 0; i < rows.length; i += TAMANHO_BLOCO) {
    const bloco = rows.slice(i, i + TAMANHO_BLOCO);
    const primeiro = bloco[0]?.linha_num ?? "?";
    const ultimo = bloco[bloco.length - 1]?.linha_num ?? "?";

    const { error } = await supabase.from("pi_import_stage").insert(bloco);

    if (error) {
      throw new Error(
        `pi_import_stage (linhas ${primeiro} a ${ultimo}): ${error.message}`,
      );
    }

    gravadas += bloco.length;
  }

  return { loteId, gravadas };
}
