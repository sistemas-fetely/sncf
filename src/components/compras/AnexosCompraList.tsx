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
import { useAnexosCompraRegistrada } from "@/hooks/compras/useAnexosCompraRegistrada";
import type { CompraRegistradaAnexoRow, CompraAnexoTipo } from "@/lib/compras/types";

const tipos: { value: CompraAnexoTipo; label: string }[] = [
  { value: "nf", label: "Nota Fiscal" },
  { value: "recibo", label: "Recibo" },
  { value: "comprovante_pagamento", label: "Comprovante de pagamento" },
  { value: "outro", label: "Outro" },
];

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

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export interface AnexoPendente {
  _local_id: string;
  file: File;
  tipo: CompraAnexoTipo;
}

interface PendenteProps {
  mode: "pendente";
  pendentes: AnexoPendente[];
  onChange: (pendentes: AnexoPendente[]) => void;
}

interface VinculadoProps {
  mode: "vinculado";
  compraId: string;
  anexos: CompraRegistradaAnexoRow[];
  onChange: (anexos: CompraRegistradaAnexoRow[]) => void;
  readOnly?: boolean;
}

type Props = PendenteProps | VinculadoProps;

export function AnexosCompraList(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTipo, setPendingTipo] = useState<CompraAnexoTipo>("nf");
  const [uploading, setUploading] = useState(false);

  const isPendente = props.mode === "pendente";
  const compraId = isPendente ? undefined : props.compraId;
  const readOnly = !isPendente && props.readOnly;

  const { upload, remove, getSignedUrl } = useAnexosCompraRegistrada(compraId);

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

  const confirmAdd = async () => {
    if (!pendingFile) return;
    if (isPendente) {
      props.onChange([
        ...props.pendentes,
        { _local_id: crypto.randomUUID(), file: pendingFile, tipo: pendingTipo },
      ]);
      setPendingFile(null);
      return;
    }
    setUploading(true);
    try {
      const created = await upload({ file: pendingFile, tipo: pendingTipo });
      props.onChange([...props.anexos, created as unknown as CompraRegistradaAnexoRow]);
      setPendingFile(null);
      toast.success("Arquivo enviado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveVinculado = async (a: CompraRegistradaAnexoRow) => {
    if (isPendente) return;
    try {
      await remove(a.id, a.storage_path);
      props.onChange(props.anexos.filter((x) => x.id !== a.id));
      toast.success("Anexo removido");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleOpen = async (a: CompraRegistradaAnexoRow) => {
    try {
      const url = await getSignedUrl(a.storage_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const lista = isPendente ? props.pendentes : props.anexos;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Anexos da compra (opcional)</h3>
        <Badge variant="secondary">
          {lista.length} {lista.length === 1 ? "arquivo" : "arquivos"}
        </Badge>
      </div>

      {!readOnly && (
        <>
          <div
            className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">
              NF, recibo ou comprovante — até 25MB
            </p>
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
              <Select value={pendingTipo} onValueChange={(v) => setPendingTipo(v as CompraAnexoTipo)}>
                <SelectTrigger className="w-[200px] h-8">
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
              <Button size="sm" onClick={confirmAdd} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingFile(null)}>
                Cancelar
              </Button>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        {isPendente
          ? props.pendentes.map((a) => (
              <div key={a._local_id} className="flex items-center gap-2 p-2 border rounded-md">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.file.name}</div>
                  <div className="text-xs text-muted-foreground">{fmtBytes(a.file.size)}</div>
                </div>
                <Badge variant="outline">{tipos.find((t) => t.value === a.tipo)?.label}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    props.onChange(props.pendentes.filter((x) => x._local_id !== a._local_id))
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          : props.anexos.map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-2 border rounded-md">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.nome_original}</div>
                  <div className="text-xs text-muted-foreground">{fmtBytes(a.tamanho_bytes)}</div>
                </div>
                <Badge variant="outline">
                  {tipos.find((t) => t.value === a.tipo)?.label || a.tipo}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => handleOpen(a)}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => handleRemoveVinculado(a)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}
