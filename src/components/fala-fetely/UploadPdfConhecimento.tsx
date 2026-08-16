import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ConhecimentoSugeridoCard,
  type ConhecimentoSugerido,
} from "./ConhecimentoSugeridoCard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConhecimentosCriados?: () => void;
}

const FRASES_PROCESSANDO = [
  "Enviando o PDF...",
  "Lendo o documento com carinho...",
  "Identificando tópicos relevantes...",
  "Organizando o conhecimento...",
  "Quase lá...",
];

export function UploadPdfConhecimento({ open, onOpenChange, onConhecimentosCriados }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<"upload" | "processando" | "preview">("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [fraseAtual, setFraseAtual] = useState(FRASES_PROCESSANDO[0]);

  const [conhecimentosSugeridos, setConhecimentosSugeridos] = useState<ConhecimentoSugerido[]>([]);
  const [resumoDocumento, setResumoDocumento] = useState("");
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");

  // Rotação de frases durante processamento
  useEffect(() => {
    if (etapa !== "processando") return;
    let idx = 0;
    setFraseAtual(FRASES_PROCESSANDO[0]);
    const interval = setInterval(() => {
      idx = (idx + 1) % FRASES_PROCESSANDO.length;
      setFraseAtual(FRASES_PROCESSANDO[idx]);
    }, 1800);
    return () => clearInterval(interval);
  }, [etapa]);

  function fechar() {
    if (processando || salvando) return;
    onOpenChange(false);
    setTimeout(() => {
      setEtapa("upload");
      setArquivo(null);
      setConhecimentosSugeridos([]);
      setResumoDocumento("");
      setImportacaoId(null);
      setArquivoNome("");
    }, 200);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) validarESetar(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) validarESetar(f);
  }

  function validarESetar(f: File) {
    if (f.type !== "application/pdf") {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Apenas PDFs são aceitos.",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O limite é 15MB.",
        variant: "destructive",
      });
      return;
    }
    setArquivo(f);
  }

  async function handleUpload() {
    if (!arquivo || !user) return;
    setProcessando(true);
    setEtapa("processando");

    try {
      // 1. Criar registro de importação
      const { data: importacao, error: impErr } = await supabase
        .from("fala_fetely_importacoes_pdf")
        .insert({
          user_id: user.id,
          arquivo_url: "",
          arquivo_nome: arquivo.name,
          tamanho_bytes: arquivo.size,
          status: "processando",
        })
        .select()
        .single();

      if (impErr) throw impErr;

      // 2. Upload pro Storage
      const path = `${user.id}/${importacao.id}-${arquivo.name}`;
      const { error: upErr } = await supabase.storage
        .from("fala-fetely-fontes")
        .upload(path, arquivo, { contentType: "application/pdf" });

      if (upErr) throw upErr;

      // 3. Atualizar registro com path
      await supabase
        .from("fala_fetely_importacoes_pdf")
        .update({ arquivo_url: path })
        .eq("id", importacao.id);

      // 4. Chamar Edge Function
      const { data: resultado, error: fnErr } = await supabase.functions.invoke(
        "processar-pdf-conhecimento",
        { body: { importacao_id: importacao.id, arquivo_url: path } },
      );

      if (fnErr) throw fnErr;
      if (!resultado?.sucesso) throw new Error(resultado?.erro || "Falha no processamento");

      // 5. Passar para preview
      const sugeridos: ConhecimentoSugerido[] = (resultado.conhecimentos_sugeridos || []).map(
        (c: any) => ({
          ...c,
          incluir: true,
        }),
      );
      setConhecimentosSugeridos(sugeridos);
      setResumoDocumento(resultado.resumo_documento || "");
      setImportacaoId(importacao.id);
      setArquivoNome(arquivo.name);
      setEtapa("preview");
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao processar PDF",
        description: e.message ?? "Erro desconhecido",
        variant: "destructive",
      });
      setEtapa("upload");
    } finally {
      setProcessando(false);
    }
  }

  function atualizarConhecimento(idx: number, novo: ConhecimentoSugerido) {
    setConhecimentosSugeridos((prev) => prev.map((c, i) => (i === idx ? novo : c)));
  }

  function removerConhecimento(idx: number) {
    setConhecimentosSugeridos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function criarTodos() {
    if (!user || !importacaoId) return;
    setSalvando(true);

    try {
      const inseridos = conhecimentosSugeridos
        .filter((c) => c.incluir !== false)
        .map((c) => ({
          categoria: c.categoria,
          titulo: c.titulo,
          conteudo: c.conteudo,
          tags: c.tags || [],
          publico_alvo: c.publico_alvo_sugerido || "todos",
          fonte: `Extraído de PDF: ${arquivoNome}`,
          fonte_arquivo_nome: arquivoNome,
          lote_importacao_id: importacaoId,
          criado_por: user.id,
          origem: "manual",
        }));

      if (inseridos.length === 0) {
        toast({
          title: "Nada para criar",
          description: "Marque ao menos um conhecimento.",
          variant: "destructive",
        });
        setSalvando(false);
        return;
      }

      const { error } = await supabase.from("fala_fetely_conhecimento").insert(inseridos);
      if (error) throw error;

      await supabase
        .from("fala_fetely_importacoes_pdf")
        .update({
          status: "concluida",
          conhecimentos_criados: inseridos.length,
          concluida_em: new Date().toISOString(),
        })
        .eq("id", importacaoId);

      toast({
        title: `${inseridos.length} conhecimento(s) criado(s)! 💚`,
        description: "Já estão disponíveis para o Fala Fetely.",
      });

      onConhecimentosCriados?.();
      fechar();
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao criar",
        description: e.message ?? "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  const totalIncluidos = conhecimentosSugeridos.filter((c) => c.incluir !== false).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {etapa === "upload" && (
          <>
            <DialogHeader>
              <DialogTitle>📄 Importar conhecimento de PDF</DialogTitle>
              <DialogDescription>
                Faça upload de um manual, política ou procedimento em PDF. A IA vai ler o documento
                e sugerir tópicos para sua revisão antes de adicionar à Base de Conhecimento.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  arrastando
                    ? "border-[#1A4A3A] bg-success/10"
                    : "border-muted hover:border-[#1A4A3A]/50"
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <FileText className="h-12 w-12 mx-auto mb-3 text-[#1A4A3A]" />
                <p className="font-medium mb-1">Arraste um PDF aqui</p>
                <p className="text-xs text-muted-foreground mb-3">ou</p>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="pdf-upload"
                  ref={inputRef}
                />
                <Button variant="outline" onClick={() => inputRef.current?.click()}>
                  Selecionar arquivo
                </Button>
                <p className="text-xs text-muted-foreground mt-3">PDF · Máximo 15MB</p>
              </div>

              {arquivo && (
                <div className="bg-success/10 border border-success/40 rounded-lg p-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-success" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{arquivo.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => setArquivo(null)}
                    className="text-muted-foreground hover:text-foreground"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="bg-muted/50 border rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium">💡 Como funciona:</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-4 list-disc">
                  <li>A IA lê o PDF e identifica tópicos independentes</li>
                  <li>Você revisa cada tópico antes de adicionar</li>
                  <li>Pode editar, descartar ou ajustar aplicabilidade</li>
                  <li>O PDF original fica arquivado como referência</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={fechar} disabled={processando}>
                Cancelar
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!arquivo || processando}
                style={{ backgroundColor: "#1A4A3A" }}
                className="text-white gap-2 hover:opacity-90"
              >
                {processando && <Loader2 className="h-4 w-4 animate-spin" />}
                {processando ? "Analisando documento..." : "Enviar e analisar"}
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "processando" && (
          <>
            <DialogHeader>
              <DialogTitle>Processando documento</DialogTitle>
              <DialogDescription>
                Isso pode levar alguns segundos dependendo do tamanho do PDF.
              </DialogDescription>
            </DialogHeader>
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-[#1A4A3A]" />
              </div>
              <p
                key={fraseAtual}
                className="text-sm font-medium text-[#1A4A3A] animate-in fade-in duration-500"
              >
                {fraseAtual}
              </p>
            </div>
          </>
        )}

        {etapa === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Revisar conhecimentos extraídos</DialogTitle>
              <DialogDescription>
                {resumoDocumento && <span>{resumoDocumento}. </span>}
                Encontrei {conhecimentosSugeridos.length} tópico(s). Revise cada um antes de
                adicionar.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {conhecimentosSugeridos.map((c, idx) => (
                <ConhecimentoSugeridoCard
                  key={idx}
                  conhecimento={c}
                  index={idx}
                  onChange={(novo) => atualizarConhecimento(idx, novo)}
                  onRemover={() => removerConhecimento(idx)}
                />
              ))}

              {conhecimentosSugeridos.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhum conhecimento para adicionar.</p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={fechar} disabled={salvando}>
                Cancelar tudo
              </Button>
              <Button
                onClick={criarTodos}
                disabled={totalIncluidos === 0 || salvando}
                style={{ backgroundColor: "#1A4A3A" }}
                className="text-white gap-2 hover:opacity-90"
              >
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar {totalIncluidos} conhecimento(s)
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
