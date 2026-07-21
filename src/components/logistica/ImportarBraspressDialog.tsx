import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  lerPreviewBraspress,
  useImportarBraspress,
  type PreviewBraspress,
} from "@/hooks/logistica/useImportarBraspress";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transportadoraId: string;
  transportadoraNome: string;
}

export function ImportarBraspressDialog({ open, onOpenChange, transportadoraId, transportadoraNome }: Props) {
  const [preview, setPreview] = useState<PreviewBraspress | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { processando, etapa, resultado, importar, reset } =
    useImportarBraspress(transportadoraId);

  async function aoSelecionarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setCarregando(true);
    reset();
    try {
      const p = await lerPreviewBraspress(arquivo);
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
          <DialogTitle>Importar encomendas — {transportadoraNome}</DialogTitle>
        </DialogHeader>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition"
          onClick={() => document.getElementById("braspress-file-input")?.click()}
        >
          <input
            type="file"
            id="braspress-file-input"
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
            Arraste o arquivo Braspress (export_minhas_encomendas_*.xlsx) ou{" "}
            <span className="underline">clique para selecionar</span>
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
            <div>{preview.totalLinhas} linha(s) detectada(s)</div>
            <div className="text-xs text-muted-foreground">
              {preview.comCte} com CT-e → vão para Fretes + Rastreio · {preview.semCte} sem CT-e → só Rastreio
            </div>
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
              <CheckCircle2 className="h-4 w-4" /> Importação concluída
            </div>
            <div>
              {resultado.fretes} frete(s) · {resultado.rastreios} rastreio(s)
              {resultado.semCte > 0 ? ` · ${resultado.semCte} sem CT-e (só rastreio)` : ""}
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
            Importar encomendas (frete + rastreio)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
