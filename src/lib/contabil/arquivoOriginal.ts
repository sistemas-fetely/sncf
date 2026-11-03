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

/** Competência AAAA-MM do arquivo pelo fim do período (YYYY-MM-DD); null se desconhecido. */
export function competenciaDoArquivo(periodoFim: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(periodoFim ?? "");
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Mesmo caminho, trocando só a pasta da competência (bancos/<AAAA-MM>/<id>/<arquivo>). */
export function caminhoNaCompetencia(pathAtual: string, competencia: string): string {
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error(`Competência inválida: ${competencia}`);
  const m = /^bancos\/[^/]+\/(.+)$/.exec(pathAtual);
  if (!m) throw new Error(`Caminho de original inesperado: ${pathAtual}`);
  return `bancos/${competencia}/${m[1]}`;
}

/** Move o original para a pasta da competência e registra o novo caminho. No-op se já está lá. */
export async function moverOriginalParaCompetencia(importacaoId: string, competencia: string): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("extrato_importacoes").select("arquivo_storage_path").eq("id", importacaoId).single();
  if (error) throw error;
  const atual = (row as { arquivo_storage_path: string | null }).arquivo_storage_path;
  if (!atual) return null;
  const novo = caminhoNaCompetencia(atual, competencia);
  if (novo === atual) return atual;
  const { error: errMv } = await supabase.storage.from(BUCKET_CONTABIL).move(atual, novo);
  if (errMv) throw new Error(`Não foi possível mover o original: ${errMv.message}`);
  const { error: errReg } = await supabase.rpc("fn_extrato_importacao_mover_original", {
    p_importacao_id: importacaoId, p_novo_path: novo,
  });
  if (errReg) throw new Error(`Original movido, mas o caminho não foi registrado: ${errReg.message}`);
  return novo;
}

/** Baixa o original guardado como File, para reprocessar sem pedir o arquivo de novo. */
export async function baixarOriginalComoArquivo(path: string, nome: string): Promise<File> {
  const { data, error } = await supabase.storage.from(BUCKET_CONTABIL).download(path);
  if (error || !data) throw new Error(`Não foi possível baixar o original: ${error?.message ?? "vazio"}`);
  return new File([data], nome, { type: data.type || "application/octet-stream" });
}
