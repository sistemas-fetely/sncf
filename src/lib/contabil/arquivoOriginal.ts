import { supabase } from "@/integrations/supabase/client";

export const BUCKET_CONTABIL = "contabil";

/** Nome seguro para o Storage: sem acento, sem barra, espaços viram "_". */
export function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "");
  return limpo || "arquivo";
}

/**
 * Caminho do original bancário. A conta e a fonte só são conhecidas depois do
 * parser, então o caminho é ancorado no id da importação; o pacote do contador
 * reagrupa por conta/fonte a partir da própria linha de extrato_importacoes.
 */
export function caminhoOriginalBanco(importacaoId: string, nomeArquivo: string, data = new Date()): string {
  const comp = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
  return `bancos/${comp}/${importacaoId}/${nomeSeguro(nomeArquivo)}`;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sobe o arquivo original e grava caminho + sha + bytes na importação.
 * Fail-loud: qualquer erro sobe com a mensagem real do Storage/banco.
 */
export async function guardarOriginalBanco(importacaoId: string, file: File) {
  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const path = caminhoOriginalBanco(importacaoId, file.name);
  const { error: errUp } = await supabase.storage
    .from(BUCKET_CONTABIL)
    .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (errUp) throw new Error(`Não foi possível guardar o arquivo original: ${errUp.message}`);
  const { data, error } = await supabase.rpc("fn_extrato_importacao_anexar_original", {
    p_importacao_id: importacaoId,
    p_storage_path: path,
    p_sha256: sha,
    p_bytes: file.size,
  });
  if (error) throw new Error(`Arquivo subiu, mas não foi registrado: ${error.message}`);
  return data as { ok: boolean; mesmo_arquivo_que: string | null };
}
