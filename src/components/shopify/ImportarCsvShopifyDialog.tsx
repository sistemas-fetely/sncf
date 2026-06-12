import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  parseCsvPreview,
  useImportarCsvShopify,
} from "@/hooks/shopify/useImportarCsvShopify";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Preview {
  arquivo: File;
  totalLinhas: number;
  headerOk: boolean;
  colunasFaltantes: string[];
  rawRows: Record<string, string>[];
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const passos = [
    { n: 1, label: "Carregar" },
    { n: 2, label: "Processar" },
    { n: 3, label: "Concluído" },
  ];
  return (
    <div className="flex items-center justify-between mb-2">
      {passos.map((p, i) => (
        <div key={p.n} className="flex items-center flex-1">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
              step >= p.n
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step > p.n ? <CheckCircle2 className="h-4 w-4" /> : p.n}
          </div>
          <span className="ml-2 text-xs">{p.label}</span>
          {i < passos.length - 1 && (
            <div className={`flex-1 h-px mx-3 ${step > p.n ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ImportarCsvShopifyDialog({ open, onOpenChange }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { processando, etapa, progresso, resultado, importar, reset } = useImportarCsvShopify();

  const stepNum: 1 | 2 | 3 = etapa === "carregar" ? 1 : etapa === "processar" ? 2 : 3;

  async function aoSelecionarArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setCarregando(true);
    reset();
    try {
      const p = await parseCsvPreview(arquivo);
      setPreview(p);
      if (!p.headerOk) {
        toast.error("Colunas faltantes: " + p.colunasFaltantes.join(", "));
      }
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error("Erro ao ler CSV: " + ((e as any)?.message ?? String(e)));
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

  async function processar() {
    if (!preview || !preview.headerOk) return;
    try {
      await importar(preview.rawRows);
    } catch {
      // erro já tratado via toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar CSV Shopify</DialogTitle>
        </DialogHeader>

        <StepIndicator step={stepNum} />

        {etapa !== "concluido" && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition"
            onClick={() => document.getElementById("shopify-csv-input")?.click()}
          >
            <input
              type="file"
              id="shopify-csv-input"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                aoSelecionarArquivo(f);
              }}
            />
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm">
              Arraste o arquivo .csv aqui ou <span className="underline">clique para selecionar</span>
            </p>
          </div>
        )}

        {carregando && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivo…
          </div>
        )}

        {preview && etapa !== "concluido" && (
          <div className="space-y-2 text-sm border rounded-md p-3 bg-muted/30">
            <div className="font-medium truncate">{preview.arquivo.name}</div>
            <div>{preview.totalLinhas} linha(s) detectada(s)</div>
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
            <Loader2 className="h-4 w-4 animate-spin" /> {progresso || "Processando…"}
          </div>
        )}

        {resultado && (
          <div className="space-y-1 text-sm border rounded-md p-3 bg-success/10 text-success">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-4 w-4" /> Importação concluída
            </div>
            <div>{resultado.total_linhas} linhas processadas</div>
            <div>{resultado.total_pedidos} pedidos importados</div>
            <div>{resultado.total_itens} itens</div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={processando}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button
              onClick={processar}
              disabled={!preview || !preview.headerOk || processando}
              className="gap-2"
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Processar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
