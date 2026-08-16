import { useState, useRef, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, FileText, Loader2, CheckCircle2, UserCircle } from "lucide-react";
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

interface StepUploadDocumentosProps {
  tipo: "clt" | "pj";
  folderKey: string;
  uploadedFiles: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
}

const CLT_DOCUMENTS: DocumentSlot[] = [
  { key: "foto_rosto", label: "Foto Social" },
  { key: "rg_cnh_frente", label: "RG ou CNH (Frente)" },
  { key: "rg_cnh_verso", label: "RG ou CNH (Verso)" },
  { key: "comprovante_residencia", label: "Comprovante de Residência" },
];

const PJ_DOCUMENTS: DocumentSlot[] = [
  { key: "foto_rosto", label: "Foto Social" },
  { key: "rg_cnh_frente", label: "RG ou CNH (Frente)" },
  { key: "rg_cnh_verso", label: "RG ou CNH (Verso)" },
  { key: "contrato_social", label: "Contrato Social da Empresa" },
  { key: "cartao_cnpj", label: "Cartão CNPJ" },
];

export function StepUploadDocumentos({ tipo, folderKey, uploadedFiles, onFilesChange }: StepUploadDocumentosProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  // Superfície anônima: pré-visualização vem do File local, nunca do storage.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewsRef = useRef<Record<string, string>>({});
  previewsRef.current = previews;
  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { setValue, watch } = useFormContext();
  const currentFotoUrl = watch("foto_url");

  const documents = tipo === "clt" ? CLT_DOCUMENTS : PJ_DOCUMENTS;

  const getUploadedFile = (key: string) => uploadedFiles.find(f => f.key === key);

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
    const filePath = `${folderKey}/${key}.${ext}`;

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

    const newFiles = uploadedFiles.filter(f => f.key !== key);
    newFiles.push({ key, name: file.name, url: urlData.publicUrl });
    onFilesChange(newFiles);

    toast.success("Documento enviado!");
    setUploading(null);
  };

  const handleRemove = async (key: string) => {
    const file = getUploadedFile(key);
    if (!file) return;

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${folderKey}/${key}.${ext}`;

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

    onFilesChange(uploadedFiles.filter(f => f.key !== key));
    toast.success("Documento removido.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Upload de Documentos</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Envie os documentos disponíveis. Todos os campos são opcionais — documentos faltantes podem ser adicionados depois no detalhe do colaborador.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Formatos aceitos: JPG, PNG, WebP ou PDF (máx. 10MB cada).
        </p>
      </div>

      <div className="space-y-4">
        {documents.map((doc) => {
          const uploaded = getUploadedFile(doc.key);
          const isUploading = uploading === doc.key;

          return (
            <Card key={doc.key} className={uploaded ? "border-success/40 bg-success/10" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {previews[doc.key] && (
                      <img
                        src={previews[doc.key]}
                        alt={doc.label}
                        className="h-10 w-10 rounded object-cover border shrink-0"
                      />
                    )}
                    {uploaded ? (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div>
                      <Label className="text-sm font-medium">
                        {doc.label} {doc.required && <span className="text-destructive">*</span>}
                      </Label>
                      {uploaded && (
                        <p className="text-xs text-muted-foreground mt-0.5">{uploaded.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploaded && uploaded.url && doc.key === "foto_rosto" && (
                      <Button
                        type="button"
                        variant={currentFotoUrl === uploaded.url ? "secondary" : "outline"}
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => {
                          setValue("foto_url", uploaded.url);
                          toast.success("Foto de perfil atualizada!");
                        }}
                      >
                        <UserCircle className="h-3.5 w-3.5" />
                        {currentFotoUrl === uploaded.url ? "Foto definida" : "Usar foto no cadastro"}
                      </Button>
                    )}
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
                      ref={(el) => { fileInputRefs.current[doc.key] = el; }}
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
    </div>
  );
}
