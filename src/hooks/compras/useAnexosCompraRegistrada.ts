import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CompraAnexoTipo } from "@/lib/compras/types";

const BUCKET = "compras-registradas-anexos";
const MAX_BYTES = 25 * 1024 * 1024;

const sanitize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);

export function useAnexosCompraRegistrada(compraId?: string) {
  const { user } = useAuth();

  const upload = async ({
    file,
    tipo,
    compra_id,
  }: {
    file: File;
    tipo: CompraAnexoTipo;
    compra_id?: string;
  }) => {
    const cid = compra_id || compraId;
    if (!cid) throw new Error("compra_id obrigatório");
    if (file.size > MAX_BYTES) throw new Error("Arquivo excede 25MB");

    const anexoId = crypto.randomUUID();
    const path = `${cid}/${anexoId}-${sanitize(file.name)}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data, error } = await supabase
      .from("compras_registradas_anexos")
      .insert({
        id: anexoId,
        compra_registrada_id: cid,
        tipo,
        nome_original: file.name,
        mime_type: file.type,
        tamanho_bytes: file.size,
        storage_path: path,
        uploaded_by: user!.id,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    return data;
  };

  const remove = async (anexo_id: string, storage_path: string) => {
    await supabase.storage.from(BUCKET).remove([storage_path]);
    const { error } = await supabase
      .from("compras_registradas_anexos")
      .delete()
      .eq("id", anexo_id);
    if (error) throw error;
  };

  const getSignedUrl = async (storage_path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storage_path, 60);
    if (error) throw error;
    return data.signedUrl;
  };

  return { upload, remove, getSignedUrl };
}
