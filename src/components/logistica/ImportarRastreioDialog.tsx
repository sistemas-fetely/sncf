import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  lerPreviewRastreio,
  useImportarRastreioNf,
  type PreviewRastreio,
} from "@/hooks/logistica/useImportarRastreioNf";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transportadoraId: string;
  transportadoraNome: string;
}

export function ImportarRastreioDialog({ open, onOpenChange, transportadoraId, transportadoraNome }: Props) {
  const [preview, setPreview] = useState<PreviewRastreio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { processando, etapa, resultado, importar, reset } =
    useImportarRastreioNf(transportadoraId);

  async function aoSelecionarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setCarregando(true);
    reset();
    try {
      const p = await lerPreviewRastreio(arquivo);
      setPreview(p);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error("Erro ao ler arquivo: " + ((e as any)?.message ?? String(e)));
      setPreview(null);
    } finally {
      setCarregando(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) aoSelecionarArquivo(f);
  }

  function fechar() {
    if (processando) return;
    setPreview(null);
    reset();
    onOpenChange(false);
  }

  async function executar() {
    if (!preview) return;
    try {
      await importar(preview);
    } catch {
      // erro já tratado no hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar rastreio (NF) — {transportadoraNome}</DialogTitle>
        </DialogHeader>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition"
          onClick={() => document.getElementById("rastreio-file-input")?.click()}
        >
          <input
            type="file"
            id="rastreio-file-input"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              aoSelecionarArquivo(f);
            }}
          />
          <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm">
            Arraste o arquivo de rastreio (notas-fiscais_*.xlsx) ou <span className="underline">clique para selecionar</span>
          </p>
        </div>

        {carregando && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivo…
          </div>
        )}

        {preview && (
          <div className="space-y-2 text-sm border rounded-md p-3 bg-muted/30">
            <div className="font-medium truncate">{preview.arquivo.name}</div>
            <div>{preview.totalLinhas} NF(s) detectada(s)</div>
            {preview.headerOk ? (
              <div className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" /> Header OK
              </div>
            ) : (
              <div className="flex items-start gap-1.5 text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>Colunas faltantes: {preview.colunasFaltantes.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {processando && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {etapa || "Processando…"}
          </div>
        )}

        {resultado && (
          <div className="space-y-1 text-sm border rounded-md p-3 bg-success/10 text-success">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Rastreio importado
            </div>
            <div>
              {resultado.processadas} NF(s) processada(s)
              {resultado.devolucoes > 0 ? ` · ${resultado.devolucoes} devolução(ões)` : ""}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={processando}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            onClick={executar}
            disabled={!preview || !preview.headerOk || processando || !!resultado}
            className="gap-2"
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar rastreio (NF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
