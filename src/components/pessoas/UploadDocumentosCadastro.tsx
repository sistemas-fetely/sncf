/**
 * UploadDocumentosCadastro — herdeiro do antigo StepUploadDocumentos
 * (src/components/cadastro-publico/, apagado em 02/09/2026 junto com o
 * modelo de token/convite, que saiu do banco).
 *
 * Agora o caminho no bucket é {pessoa_id}/{tipo}.{ext} — a policy só deixa
 * a própria pessoa escrever na pasta do seu pessoa_id.
 * Preview vem do File local; delete é FAIL-LOUD (arquivo que não saiu do
 * bucket não sai da lista).
 */

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

interface DocumentSlot {
  key: string;
  label: string;
  required?: boolean;
}

export interface UploadedFile {
  key: string;
  name: string;
  url: string;
}

interface Props {
  pessoaId: string;
  documentos: DocumentSlot[];
  uploadedFiles: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

export default function UploadDocumentosCadastro({ pessoaId, documentos, uploadedFiles, onFilesChange }: Props) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  previewsRef.current = previews;
  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getUploadedFile = (key: string) => uploadedFiles.find((f) => f.key === key);

  const handleUpload = async (key: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Formato não suportado. Use JPG, PNG, WebP ou PDF.");
      return;
    }

    setUploading(key);

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${pessoaId}/${key}.${ext}`;

    const { error } = await supabase.storage
      .from("documentos-cadastro")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error("Erro ao enviar arquivo: " + error.message);
      setUploading(null);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("documentos-cadastro")
      .getPublicUrl(filePath);

    if (file.type.startsWith("image/")) {
      const blobUrl = URL.createObjectURL(file);
      setPreviews((prev) => {
        if (prev[key]) URL.revokeObjectURL(prev[key]);
        return { ...prev, [key]: blobUrl };
      });
    }

    const newFiles = uploadedFiles.filter((f) => f.key !== key);
    newFiles.push({ key, name: file.name, url: urlData.publicUrl });
    onFilesChange(newFiles);

    toast.success("Documento enviado");
    setUploading(null);
  };

  const handleRemove = async (key: string) => {
    const file = getUploadedFile(key);
    if (!file) return;

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${pessoaId}/${key}.${ext}`;

    const { error } = await supabase.storage.from("documentos-cadastro").remove([filePath]);

    if (error) {
      // FAIL-LOUD: o arquivo continua no bucket, então não sai da lista.
      toast.error("Erro ao remover arquivo: " + error.message);
      return;
    }

    setPreviews((prev) => {
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      const { [key]: _removido, ...resto } = prev;
      return resto;
    });

    onFilesChange(uploadedFiles.filter((f) => f.key !== key));
    toast.success("Documento removido");
  };

  return (
    <div className="space-y-4">
      {documentos.map((doc) => {
        const uploaded = getUploadedFile(doc.key);
        const isUploading = uploading === doc.key;

        return (
          <Card key={doc.key} className={uploaded ? "border-success/40 bg-success/10" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {previews[doc.key] && (
                    <img
                      src={previews[doc.key]}
                      alt={doc.label}
                      className="h-10 w-10 shrink-0 rounded border object-cover"
                    />
                  )}
                  {uploaded ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <Label className="text-sm font-medium">
                      {doc.label} {doc.required && <span className="text-destructive">*</span>}
                    </Label>
                    {uploaded && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{uploaded.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {uploaded && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemove(doc.key)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={uploaded ? "outline" : "default"}
                    size="sm"
                    disabled={isUploading}
                    onClick={() => fileInputRefs.current[doc.key]?.click()}
                    className="gap-2"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploaded ? "Substituir" : "Enviar"}
                  </Button>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[doc.key] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(doc.key, f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
