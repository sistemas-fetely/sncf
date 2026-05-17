import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy as Duplicate,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { sha256Hex } from "@/lib/repositorio/hash";
import { sanitizeStorageKey } from "@/lib/repositorio/storage-key";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type Estado = "pendente" | "upload" | "classificando" | "concluido" | "duplicado" | "erro";

interface ItemFila {
  id: string;
  file: File;
  estado: Estado;
  progresso: number;
  erro?: string;
  tipoIA?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPT = ".pdf,.xml,.ofx,.png,.jpg,.jpeg";

export function UploadEmLoteSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [processando, setProcessando] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function adicionarArquivos(files: FileList | File[]) {
    const novos: ItemFila[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      estado: "pendente",
      progresso: 0,
    }));
    setItens((prev) => [...prev, ...novos]);
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  async function processar(fecharAoFim: boolean) {
    if (itens.length === 0) {
      toast.info("Adicione arquivos antes de subir.");
      return;
    }
    setProcessando(true);
    const loteId = crypto.randomUUID();

    // processa sequencial pra não saturar IA
    for (const item of itens) {
      if (item.estado === "concluido" || item.estado === "duplicado") continue;

      try {
        // 1. hash
        setItens((p) =>
          p.map((i) => (i.id === item.id ? { ...i, estado: "upload", progresso: 20 } : i)),
        );
        const hash = await sha256Hex(item.file);

        // 2. upload bucket
        const safeName = sanitizeStorageKey(item.file.name);
        const storagePath = `repositorio/${loteId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("ged")
          .upload(storagePath, item.file, { contentType: item.file.type });
        if (upErr) throw upErr;

        setItens((p) =>
          p.map((i) => (i.id === item.id ? { ...i, progresso: 50 } : i)),
        );

        // 3. registrar intake
        const { data: intakeRes, error: intakeErr } = await supabase.rpc(
          "registrar_documento_intake",
          {
            p_dados: {
              arquivo_original: item.file.name,
              storage_path: storagePath,
              mime_type: item.file.type || "application/octet-stream",
              tamanho_bytes: item.file.size,
              nome: item.file.name,
              hash_arquivo: hash,
              lote_id: loteId,
              origem_porta: "repositorio",
            },
          },
        );
        if (intakeErr) throw intakeErr;

        const res = intakeRes as { id?: string; ja_existe?: boolean } | null;
        if (res?.ja_existe) {
          setItens((p) =>
            p.map((i) =>
              i.id === item.id ? { ...i, estado: "duplicado", progresso: 100 } : i,
            ),
          );
          continue;
        }
        const gedId = res?.id;
        if (!gedId) throw new Error("Falha ao registrar documento");

        // 4. classificar com IA
        setItens((p) =>
          p.map((i) =>
            i.id === item.id ? { ...i, estado: "classificando", progresso: 70 } : i,
          ),
        );

        const fd = new FormData();
        fd.append("file", item.file);
        const { data: iaRes, error: iaErr } = await supabase.functions.invoke(
          "classificar-documento-ged",
          { body: fd },
        );

        if (iaErr || !iaRes) {
          // Falha de IA não bloqueia — documento fica em aguardando
          console.error("Falha IA:", iaErr);
          setItens((p) =>
            p.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    estado: "concluido",
                    progresso: 100,
                    erro: "Sem classificação IA (operador classifica depois)",
                  }
                : i,
            ),
          );
          continue;
        }

        // 5. marcar classificado
        const { error: classErr } = await supabase.rpc("marcar_documento_classificado", {
          p_ged_documento_id: gedId,
          p_resultado_ia: iaRes as never,
        });
        if (classErr) throw classErr;

        setItens((p) =>
          p.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  estado: "concluido",
                  progresso: 100,
                  tipoIA: (iaRes as { tipo_documento?: string }).tipo_documento,
                }
              : i,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setItens((p) =>
          p.map((i) =>
            i.id === item.id ? { ...i, estado: "erro", erro: msg, progresso: 100 } : i,
          ),
        );
        toast.error(`Erro em ${item.file.name}: ${msg}`, { duration: 15000 });
      }
    }

    setProcessando(false);
    qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
    qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });

    const ok = itens.filter((i) => i.estado === "concluido" || i.estado === "duplicado").length;
    toast.success(`Processamento concluído (${ok}/${itens.length})`);

    if (fecharAoFim) {
      setItens([]);
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !processando && onOpenChange(v)}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Subir arquivos ao Repositório</SheetTitle>
          <SheetDescription>
            A IA classifica automaticamente. Pode subir PDF, XML, OFX, imagens.
          </SheetDescription>
        </SheetHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
          }}
          className={cn(
            "mt-4 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            dragOver ? "border-[#1A4A3A] bg-[#1A4A3A]/5" : "border-muted-foreground/30",
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm mb-3">Arraste arquivos aqui ou</p>
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) adicionarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
              Selecionar arquivos
            </label>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {itens.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum arquivo selecionado
            </p>
          )}
          {itens.map((i) => (
            <div key={i.id} className="border rounded-lg p-3 bg-card">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(i.file.size / 1024).toFixed(1)} KB
                    {i.tipoIA && (
                      <>
                        {" · "}
                        <span className="text-[#1A4A3A] font-medium uppercase">{i.tipoIA}</span>
                      </>
                    )}
                  </p>
                </div>
                <EstadoIcone estado={i.estado} />
                {!processando && i.estado === "pendente" && (
                  <button
                    onClick={() => removerItem(i.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {i.estado !== "pendente" && (
                <Progress
                  value={i.progresso}
                  className={cn(
                    "h-1.5 mt-2",
                    i.estado === "erro" && "[&>div]:bg-red-500",
                    i.estado === "duplicado" && "[&>div]:bg-yellow-500",
                    i.estado === "concluido" && "[&>div]:bg-green-600",
                  )}
                />
              )}
              {i.erro && (
                <p className="text-xs text-muted-foreground mt-1" title={i.erro}>
                  {i.erro}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={processando || itens.length === 0}
            onClick={() => processar(false)}
          >
            {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Subir e continuar
          </Button>
          <Button
            className="flex-1 bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
            disabled={processando || itens.length === 0}
            onClick={() => processar(true)}
          >
            Subir e fechar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EstadoIcone({ estado }: { estado: Estado }) {
  if (estado === "upload") return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
  if (estado === "classificando")
    return <Sparkles className="h-4 w-4 text-yellow-600 animate-pulse" />;
  if (estado === "concluido") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (estado === "duplicado") return <Duplicate className="h-4 w-4 text-yellow-600" />;
  if (estado === "erro") return <AlertCircle className="h-4 w-4 text-red-600" />;
  return null;
}
