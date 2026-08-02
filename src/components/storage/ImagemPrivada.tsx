import { useUrlAssinada } from "@/lib/storage/arquivoPrivado";
import { Loader2, ImageOff } from "lucide-react";

interface ImagemPrivadaProps {
  bucket: string;
  valor: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * Renderiza imagem de bucket privado via URL assinada. Só telas autenticadas.
 */
export function ImagemPrivada({ bucket, valor, alt, className }: ImagemPrivadaProps) {
  const { url, carregando, erro } = useUrlAssinada(bucket, valor);

  if (carregando) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className ?? ""}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (erro || !url) {
    return (
      <div
        className={`flex items-center justify-center bg-muted ${className ?? ""}`}
        title={erro || "Arquivo indisponível"}
      >
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return <img src={url} alt={alt} className={className} />;
}
