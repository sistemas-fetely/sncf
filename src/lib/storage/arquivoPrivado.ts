import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Leitura de arquivos em buckets que estão migrando de público para privado.
 *
 * Regra central:
 * - Superfície AUTENTICADA lê via URL assinada (createSignedUrl).
 * - Superfície ANÔNIMA nunca lê do storage (usa preview local do File).
 *
 * A gravação NÃO muda: as colunas continuam guardando o que já guardavam
 * (path puro ou URL pública legada). `extrairStoragePath` cobre os dois casos,
 * então não é preciso backfill.
 */

/**
 * Aceita um path puro (`pasta/arquivo.jpg`) ou uma URL pública legada
 * (`https://.../storage/v1/object/public/<bucket>/<path>`) e devolve sempre o path.
 */
export function extrairStoragePath(valor: string, bucket: string): string {
  if (!valor) return "";
  let v = valor.trim();

  // URL pública legada (ou assinada) do Supabase Storage
  const marcadores = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];
  for (const m of marcadores) {
    const i = v.indexOf(m);
    if (i !== -1) {
      v = v.slice(i + m.length);
      break;
    }
  }

  // remove querystring (token de URL assinada, cache-busting etc.)
  const q = v.indexOf("?");
  if (q !== -1) v = v.slice(0, q);

  // path puro pode vir prefixado com o nome do bucket ou com barra
  v = v.replace(/^\/+/, "");
  if (v.startsWith(`${bucket}/`)) v = v.slice(bucket.length + 1);

  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Devolve uma URL assinada para leitura. Em erro devolve `null` e loga.
 */
export async function getUrlAssinada(
  bucket: string,
  valor: string,
  expiraEm = 3600,
): Promise<string | null> {
  const path = extrairStoragePath(valor, bucket);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiraEm);

  if (error) {
    console.error(`[arquivoPrivado] falha ao assinar ${bucket}/${path}:`, error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Hook de leitura assinada. Só para telas autenticadas.
 */
export function useUrlAssinada(bucket: string, valor: string | null | undefined) {
  const query = useQuery({
    queryKey: ["url-assinada", bucket, valor ? extrairStoragePath(valor, bucket) : null],
    enabled: !!valor,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const url = await getUrlAssinada(bucket, valor as string);
      if (!url) throw new Error("Não foi possível gerar o link do arquivo");
      return url;
    },
  });

  return {
    url: query.data ?? null,
    carregando: query.isLoading,
    erro: query.error ? (query.error as Error).message : null,
  };
}
