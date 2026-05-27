import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText } from "lucide-react";
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
    <div
      className={cn(
        "border-2 border-dashed rounded-md flex items-center justify-between gap-3 px-4 py-3 transition-colors",
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
      <div className="flex items-center gap-3 min-w-0">
        {upload.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <p className="text-sm text-muted-foreground truncate">
          {upload.isPending
            ? "Processando bureau..."
            : "Arraste Serasa ou Boa Vista (PDF) ou clique pra anexar"}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 shrink-0"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || upload.isPending}
      >
        <Upload className="h-3.5 w-3.5" />
        Anexar bureau
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
    </div>
  );
}
