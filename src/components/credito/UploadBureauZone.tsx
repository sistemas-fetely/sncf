import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadBureauPDF } from "@/hooks/credito/useUploadBureauPDF";

interface Props {
  analise_id: string;
  disabled?: boolean;
}

export function UploadBureauZone({ analise_id, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadBureauPDF();

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      alert("Aceita apenas arquivos PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Arquivo grande demais (máximo 10 MB)");
      return;
    }
    await upload.mutateAsync({ analise_id, file });
  };

  return (
    <Card
      className={cn(
        "border-2 border-dashed transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-muted",
        disabled && "opacity-50 pointer-events-none",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
        {upload.isPending ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="font-medium">Processando bureau...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload + extração da IA. Aguarde alguns segundos.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Anexar Serasa ou Boa Vista (PDF)</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Arraste o arquivo aqui ou clique para selecionar. A IA detecta a fonte e extrai os dados.
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || upload.isPending}
            >
              <Upload className="h-4 w-4" />
              Selecionar arquivo
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
          </>
        )}
      </div>
    </Card>
  );
}
