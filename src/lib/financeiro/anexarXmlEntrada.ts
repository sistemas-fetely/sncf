import { supabase } from "@/integrations/supabase/client";
import type { NFParsed } from "@/lib/financeiro/types";

/** Resultado da edge nf-entrada-xml-anexar por chave. */
export type ResultadoAnexo = "anexado" | "ja_tinha" | "nao_existe" | "erro";
export interface ItemAnexo { chave: string; resultado: ResultadoAnexo; motivo?: string; arquivo?: string }

export interface RelatorioArquivo {
  novas: number;
  anexadas: number;
  jaTinham: number;
  erros: { arquivo: string; motivo: string }[];
}

export const relatorioVazio = (): RelatorioArquivo => ({ novas: 0, anexadas: 0, jaTinham: 0, erros: [] });

/** NF lida de um XML (não PDF) e com chave — só essas têm original a guardar. */
export function ehXmlComChave(nf: NFParsed): boolean {
  const f = nf._arquivo as File | undefined;
  if (!f || !nf.nf_chave_acesso) return false;
  return f.type.includes("xml") || f.name.toLowerCase().endsWith(".xml");
}

const LOTE = 20;

/** Envia os XMLs à edge (que usa o mesmo helper de cópia da Qive). Lança se a chamada falhar inteira. */
export async function anexarXmls(nfs: NFParsed[]): Promise<ItemAnexo[]> {
  const out: ItemAnexo[] = [];
  for (let i = 0; i < nfs.length; i += LOTE) {
    const bloco = nfs.slice(i, i + LOTE);
    const itens = await Promise.all(bloco.map(async (nf) => ({
      chave: String(nf.nf_chave_acesso),
      xml: await (nf._arquivo as File).text(),
    })));
    const { data, error } = await supabase.functions.invoke("nf-entrada-xml-anexar", { body: { itens } });
    if (error) {
      let msg = error.message;
      try { const b = await (error as any).context?.json?.(); if (b?.erro) msg = b.erro; } catch { /* mantém msg */ }
      throw new Error(`Falha ao guardar XMLs: ${msg}`);
    }
    if (!data?.ok) throw new Error(`Falha ao guardar XMLs: ${data?.erro ?? "resposta inválida"}`);
    const nomes = new Map(bloco.map((nf) => [String(nf.nf_chave_acesso), (nf._arquivo as File).name]));
    for (const r of data.resultados as ItemAnexo[]) out.push({ ...r, arquivo: nomes.get(r.chave) });
  }
  return out;
}
