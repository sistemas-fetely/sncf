import { useState, useRef } from "react";
import { Loader2, Upload, FileText, AlertCircle, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback quando importação identifica 1 processo único — leva pra tela de revisão */
  onProcessoUnico: (resultado: any, importacaoId: string) => void;
  /** Callback quando IA identifica múltiplos processos no PDF */
  onMultiplos: (processos: any[], arquivoNome: string, importacaoId: string) => void;
}

export function ImportarPdfDialog({ open, onOpenChange, onProcessoUnico, onMultiplos }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleArquivo = (file: File) => {
    setErro(null);
    if (file.type !== "application/pdf") {
      setErro("Arquivo precisa ser PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErro("PDF muito grande (máximo 10MB).");
      return;
    }
    setArquivo(file);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImportar = async () => {
    if (!arquivo) return;
    setProcessando(true);
    setErro(null);

    try {
      const base64 = await fileToBase64(arquivo);

      const { data, error } = await supabase.functions.invoke("importar-processo-pdf", {
        body: {
          arquivo_base64: base64,
          arquivo_nome: arquivo.name,
        },
      });

      if (error) throw error;

      if (!data.sucesso && !data.eh_processo) {
        setErro(`Esse PDF não parece ser um documento de processo. ${data.motivo || ""}`);
        return;
      }

      if (data.multiplos) {
        onMultiplos(data.resultado.processos || [], arquivo.name, data.importacao_id);
        onOpenChange(false);
        return;
      }

      onProcessoUnico(data.resultado, data.importacao_id);
      onOpenChange(false);
    } catch (e: any) {
      const msg = e.message || "Erro ao processar PDF";
      setErro(msg);
      toast.error(msg);
    } finally {
      setProcessando(false);
    }
  };

  const handleClose = () => {
    if (processando) return;
    setArquivo(null);
    setErro(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleClose() : onOpenChange(o))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-info" />
            Importar processo de PDF
          </DialogTitle>
          <DialogDescription>
            Envie um PDF (manual, SOP, treinamento). A IA vai estruturar o processo e você revisa antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Dropzone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) handleArquivo(file);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleArquivo(file);
              }}
            />
            {arquivo ? (
              <div className="flex items-center gap-3 text-left">
                <FileText className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{arquivo.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(arquivo.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setArquivo(null);
                    setErro(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Trocar arquivo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Clique ou arraste um PDF</p>
                  <p className="text-xs text-muted-foreground">Máximo 10MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex gap-2 items-start text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          {/* Loading */}
          {processando && (
            <div className="flex gap-3 items-start bg-muted/50 rounded-md p-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Analisando PDF com IA...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Isso pode levar entre 15 e 45 segundos dependendo do tamanho.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={processando}>
            Cancelar
          </Button>
          <Button onClick={handleImportar} disabled={!arquivo || processando} className="gap-1.5">
            {processando ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" /> Analisar com IA</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
