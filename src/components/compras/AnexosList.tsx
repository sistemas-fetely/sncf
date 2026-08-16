import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAnexosPedidoCompra } from "@/hooks/compras/useAnexosPedidoCompra";
import type { PedidoCompraAnexoRow, PedidoCompraAnexoTipo } from "@/lib/compras/types";

const tipos: { value: PedidoCompraAnexoTipo; label: string }[] = [
  { value: "cotacao", label: "Cotação" },
  { value: "orcamento", label: "Orçamento" },
  { value: "proposta", label: "Proposta" },
  { value: "imagem_referencia", label: "Imagem de referência" },
  { value: "outro", label: "Outro" },
];

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/xml",
  "text/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

interface Props {
  pedidoId?: string;
  anexos: PedidoCompraAnexoRow[];
  onChange: (anexos: PedidoCompraAnexoRow[]) => void;
  onRemoverPendente?: (anexo: PedidoCompraAnexoRow) => void;
  readOnly?: boolean;
}

export function AnexosList({ pedidoId, anexos, onChange, onRemoverPendente, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTipo, setPendingTipo] = useState<PedidoCompraAnexoTipo>("orcamento");
  const [uploading, setUploading] = useState(false);
  const { upload, remove, getSignedUrl } = useAnexosPedidoCompra(pedidoId);

  const handleFile = (file: File) => {
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast.error("Tipo de arquivo não permitido");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Arquivo excede 25MB");
      return;
    }
    setPendingFile(file);
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    if (!pedidoId) {
      toast.error("Salve o rascunho antes de anexar arquivos");
      return;
    }
    setUploading(true);
    try {
      const created = await upload({ file: pendingFile, tipo: pendingTipo });
      onChange([...anexos, created as unknown as PedidoCompraAnexoRow]);
      setPendingFile(null);
      toast.success("Arquivo enviado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (a: PedidoCompraAnexoRow) => {
    if (onRemoverPendente) {
      onRemoverPendente(a);
      onChange(anexos.filter((x) => x.id !== a.id));
      return;
    }
    try {
      await remove(a.id, a.storage_path);
      onChange(anexos.filter((x) => x.id !== a.id));
      toast.success("Anexo removido");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleOpen = async (a: PedidoCompraAnexoRow) => {
    try {
      const url = await getSignedUrl(a.storage_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Anexos (opcional)</h3>
        <Badge variant="secondary">
          {anexos.length} {anexos.length === 1 ? "arquivo" : "arquivos"}
        </Badge>
      </div>

      {!readOnly && (
        <>
          <div
            className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Arraste arquivos aqui ou clique pra selecionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">PDF, imagens, planilhas — até 25MB</p>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {pendingFile && (
            <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/30">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{pendingFile.name}</div>
                <div className="text-xs text-muted-foreground">{fmtBytes(pendingFile.size)}</div>
              </div>
              <Select value={pendingTipo} onValueChange={(v) => setPendingTipo(v as PedidoCompraAnexoTipo)}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={confirmUpload} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingFile(null)}>
                Cancelar
              </Button>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        {anexos.map((a) => (
          <div key={a.id} className="flex items-center gap-2 p-2 border rounded-md">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{a.nome_original}</div>
              <div className="text-xs text-muted-foreground">{fmtBytes(a.tamanho_bytes)}</div>
            </div>
            <Badge variant="outline">{tipos.find((t) => t.value === a.tipo)?.label || a.tipo}</Badge>
            <Button size="sm" variant="ghost" onClick={() => handleOpen(a)}>
              <ExternalLink className="h-4 w-4" />
            </Button>
            {!readOnly && (
              <Button size="sm" variant="ghost" onClick={() => handleRemove(a)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
