import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { useUrlAssinada } from "@/lib/storage/arquivoPrivado";

interface FotoUploadProps {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  folder?: string;
}

export function FotoUpload({ value, onChange, folder = "fotos" }: FotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Tela autenticada (StepDadosPessoais / StepDadosPessoaisPJ) — leitura assinada
  const { url: urlLeitura } = useUrlAssinada("documentos-cadastro", value);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("documentos-cadastro")
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("documentos-cadastro")
        .getPublicUrl(path);

      onChange(urlData.publicUrl);
      toast.success("Foto enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    onChange(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Label className="text-center">Foto</Label>
      <Avatar className="h-24 w-24 border-2 border-border">
        <AvatarImage src={urlLeitura || undefined} alt="Foto" className="object-cover" />
        <AvatarFallback className="bg-muted">
          <User className="h-10 w-10 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
          {value ? "Alterar" : "Enviar"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
