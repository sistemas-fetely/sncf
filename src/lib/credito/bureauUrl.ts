import { supabase } from "@/integrations/supabase/client";

/**
 * Gera URL assinada temporária (5 min) pra abrir PDF do bureau anexado.
 */
export async function getBureauPDFUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage
    .from("ged")
    .createSignedUrl(storagePath, 300);
  if (error) {
    console.error("Erro gerando URL assinada:", error);
    return null;
  }
  return data?.signedUrl || null;
}
