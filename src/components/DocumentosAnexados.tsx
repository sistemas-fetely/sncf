import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Eye, Loader2, Image as ImageIcon, Upload, Trash2, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getUrlAssinada } from "@/lib/storage/arquivoPrivado";

interface StorageFile {
  name: string;
  /** URL pública legada — usada apenas para GRAVAÇÃO em foto_url (formato não muda) */
  url: string;
  /** URL assinada para leitura (bucket privado) */
  signedUrl: string | null;
  isImage: boolean;
  folder: string;
}

const LABEL_MAP: Record<string, string> = {
  rg_cnh_frente: "RG ou CNH (Frente)",
  rg_cnh_verso: "RG ou CNH (Verso)",
  contrato_social: "Contrato Social",
  cartao_cnpj: "Cartão CNPJ",
};

function friendlyName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return LABEL_MAP[base] || base.replace(/_/g, " ");
}

function isImageFile(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(name);
}

interface DocumentosAnexadosProps {
  colaboradorId?: string;
  contratoPjId?: string;
  currentFotoUrl?: string | null;
  onFotoUpdated?: (url: string) => void;
}

export function DocumentosAnexados({ colaboradorId, contratoPjId, currentFotoUrl, onFotoUpdated }: DocumentosAnexadosProps) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [settingPhoto, setSettingPhoto] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const directFolder = colaboradorId
    ? `clt-${colaboradorId}`
    : contratoPjId
    ? `pj-${contratoPjId}`
    : null;

  const loadFiles = async () => {
    setLoading(true);
    try {
      const allFiles: StorageFile[] = [];

      // 1) Files from convite (pre-cadastro uploads)
      let query = supabase.from("convites_cadastro").select("token");
      if (colaboradorId) query = query.eq("colaborador_id", colaboradorId);
      else if (contratoPjId) query = query.eq("contrato_pj_id", contratoPjId);

      const { data: convites } = await query;

      for (const convite of convites || []) {
        const { data: storageFiles } = await supabase.storage
          .from("documentos-cadastro")
          .list(convite.token, { limit: 50 });

        if (storageFiles) {
          for (const sf of storageFiles) {
            if (sf.name === ".emptyFolderPlaceholder") continue;
            const { data: urlData } = supabase.storage
              .from("documentos-cadastro")
              .getPublicUrl(`${convite.token}/${sf.name}`);
            allFiles.push({
              name: sf.name,
              url: urlData.publicUrl,
              signedUrl: await getUrlAssinada("documentos-cadastro", `${convite.token}/${sf.name}`),
              isImage: isImageFile(sf.name),
              folder: convite.token,
            });
          }
        }
      }

      // 2) Files uploaded directly by HR
      if (directFolder) {
        const { data: directFiles } = await supabase.storage
          .from("documentos-cadastro")
          .list(directFolder, { limit: 50 });

        if (directFiles) {
          for (const sf of directFiles) {
            if (sf.name === ".emptyFolderPlaceholder") continue;
            const { data: urlData } = supabase.storage
              .from("documentos-cadastro")
              .getPublicUrl(`${directFolder}/${sf.name}`);
            allFiles.push({
              name: sf.name,
              url: urlData.publicUrl,
              signedUrl: await getUrlAssinada("documentos-cadastro", `${directFolder}/${sf.name}`),
              isImage: isImageFile(sf.name),
              folder: directFolder,
            });
          }
        }
      }

      setFiles(allFiles);
    } catch (err) {
      console.error("Erro ao carregar documentos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [colaboradorId, contratoPjId]);

  const handleUpload = async (file: File) => {
    if (!directFolder) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    const allowedTypes = [
      "image/jpeg", "image/png", "image/webp", "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG, WebP, PDF ou DOC/DOCX.");
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${directFolder}/${safeName}`;

    const { error } = await supabase.storage
      .from("documentos-cadastro")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error("Erro ao enviar: " + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("documentos-cadastro")
      .getPublicUrl(filePath);

    setFiles((prev) => [
      ...prev,
      {
        name: safeName,
        url: urlData.publicUrl,
        signedUrl: await getUrlAssinada("documentos-cadastro", filePath),
        isImage: isImageFile(safeName),
        folder: directFolder,
      },
    ]);
    toast.success("Documento enviado com sucesso!");
    setUploading(false);
  };

  const handleDelete = async (file: StorageFile) => {
    const filePath = `${file.folder}/${file.name}`;
    const { error } = await supabase.storage
      .from("documentos-cadastro")
      .remove([filePath]);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
      return;
    }
    setFiles((prev) => prev.filter((f) => !(f.name === file.name && f.folder === file.folder)));
    toast.success("Documento removido.");
  };

  const handleSetAsPhoto = async (file: StorageFile) => {
    setSettingPhoto(file.url);
    try {
      if (colaboradorId) {
        const { error } = await supabase.from("colaboradores_clt").update({ foto_url: file.url }).eq("id", colaboradorId);
        if (error) throw error;
      } else if (contratoPjId) {
        const { error } = await supabase.from("contratos_pj").update({ foto_url: file.url } as any).eq("id", contratoPjId);
        if (error) throw error;
      }
      onFotoUpdated?.(file.url);
      toast.success("Foto de perfil atualizada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir foto");
    } finally {
      setSettingPhoto(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando documentos anexados...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar Documento
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <span className="text-xs text-muted-foreground">JPG, PNG, WebP, PDF ou DOC (máx. 10MB)</span>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nenhum documento anexado encontrado.</p>
      ) : (
        <div className="space-y-3">
          {files.map((file) => (
            <Card key={`${file.folder}/${file.name}`} className="border-muted">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {file.isImage ? (
                    <ImageIcon className="h-5 w-5 text-primary shrink-0" />
                  ) : (
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                  )}
                  <span className="text-sm font-medium">{friendlyName(file.name)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {file.isImage && onFotoUpdated && (
                    <Button
                      variant={currentFotoUrl === file.url ? "secondary" : "outline"}
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      disabled={settingPhoto === file.url}
                      onClick={() => handleSetAsPhoto(file)}
                      title="Definir como foto de perfil"
                    >
                      {settingPhoto === file.url ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserCircle className="h-3.5 w-3.5" />
                      )}
                      {currentFotoUrl === file.url ? "Foto definida" : "Usar como foto"}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Visualizar"
                    disabled={!file.signedUrl}
                    onClick={() => { setPreviewTitle(friendlyName(file.name)); setPreviewUrl(file.signedUrl); }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Download">
                    <a href={file.signedUrl ?? undefined} target="_blank" rel="noopener noreferrer" download>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(file)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center overflow-auto max-h-[70vh]">
            {previewUrl && (
              previewUrl.match(/\.pdf$/i) ? (
                <iframe src={previewUrl} className="w-full h-[65vh] border rounded" />
              ) : (
                <img src={previewUrl} alt={previewTitle} className="max-w-full max-h-[65vh] object-contain rounded" />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}