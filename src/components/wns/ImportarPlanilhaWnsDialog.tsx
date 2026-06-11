import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { lerPreview, useImportarPlanilhaWns, type PreviewArquivo } from "@/hooks/wns/useImportarPlanilhaWns";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportarPlanilhaWnsDialog({ open, onOpenChange }: Props) {
  const [preview, setPreview] = useState<PreviewArquivo | null>(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const { processando, etapa, resultado, importar, reset } = useImportarPlanilhaWns();

  async function aoSelecionarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setCarregandoPreview(true);
    reset();
    try {
      const p = await lerPreview(arquivo);
      setPreview(p);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error("Erro ao ler arquivo: " + ((e as any)?.message ?? String(e)));
      setPreview(null);
    } finally {
      setCarregandoPreview(false);
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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar planilha WNS / XPM</DialogTitle>
        </DialogHeader>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition"
          onClick={() => document.getElementById("wns-xlsx-input")?.click()}
        >
          <input
            type="file"
            id="wns-xlsx-input"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              aoSelecionarArquivo(f);
            }}
          />
          <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm">
            Arraste o arquivo .xlsx aqui ou <span className="underline">clique para selecionar</span>
          </p>
        </div>

        {carregandoPreview && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivo…
          </div>
        )}

        {preview && (
          <div className="space-y-2 text-sm border rounded-md p-3 bg-muted/30">
            <div className="font-medium truncate">{preview.arquivo.name}</div>
            <div>
              {preview.totalLinhas} linha(s) detectada(s)
            </div>
            {preview.headerOk ? (
              <div className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" /> Header OK — 24 colunas
              </div>
            ) : (
              <div className="flex items-start gap-1.5 text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>
                  Colunas faltantes: {preview.colunasFaltantes.join(", ")}
                </span>
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
            <div>{resultado.total_linhas} linhas processadas</div>
            <div>{resultado.pedidos_consolidados} pedidos consolidados</div>
            <div>{resultado.skus_consolidados} SKUs consolidados</div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={processando}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            onClick={() => preview && importar(preview)}
            disabled={!preview || !preview.headerOk || processando || !!resultado}
            className="gap-2"
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
