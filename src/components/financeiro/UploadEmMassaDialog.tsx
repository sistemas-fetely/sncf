import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { toast } from "sonner";
import { TIPO_DOC_LABEL } from "./DocumentosCP";

type ContaCandidata = {
  id: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  fornecedor_cliente: string | null;
  parceiro_razao_social: string | null;
};

type ArquivoStaged = {
  file: File;
  contaIdSugerida: string | null;
  scoreSugestao: number;
  tipoDoc: string;
  status: "pronto" | "enviando" | "enviado" | "erro";
  erro?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UploadEmMassaDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const [arquivos, setArquivos] = useState<ArquivoStaged[]>([]);
  const [enviando, setEnviando] = useState(false);

  // Carrega contas pendentes/parciais como candidatas
  const { data: contasCandidatas } = useQuery({
    queryKey: ["upload-massa-candidatas"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .select(
          "id, descricao, valor, data_vencimento, fornecedor_cliente, parceiros_comerciais:parceiro_id(razao_social)",
        )
        .eq("tipo", "pagar")
        .in("docs_status", ["pendente", "parcial"]);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data as any[]) || []).map((c) => ({
        id: c.id,
        descricao: c.descricao,
        valor: Number(c.valor),
        data_vencimento: c.data_vencimento,
        fornecedor_cliente: c.fornecedor_cliente,
        parceiro_razao_social: c.parceiros_comerciais?.razao_social || null,
      })) as ContaCandidata[];
    },
    enabled: open,
  });

  function tentarMatchAutomatico(file: File): { contaId: string | null; score: number } {
    if (!contasCandidatas || contasCandidatas.length === 0) return { contaId: null, score: 0 };

    const nome = file.name.toLowerCase();
    let melhorScore = 0;
    let melhorId: string | null = null;

    for (const c of contasCandidatas) {
      let score = 0;

      // Nome do parceiro no filename
      const parceiroNome = (c.parceiro_razao_social || c.fornecedor_cliente || "").toLowerCase();
      if (parceiroNome.length >= 4) {
        const tokens = parceiroNome.split(/\s+/).filter((t) => t.length >= 4);
        for (const t of tokens) {
          if (nome.includes(t)) {
            score += 40;
            break;
          }
        }
      }

      // Valor no filename (formato: "300.00", "300,00", "300")
      const valorStr1 = c.valor.toFixed(2);
      const valorStr2 = c.valor.toFixed(2).replace(".", ",");
      const valorStr3 = String(Math.round(c.valor));
      if (nome.includes(valorStr1) || nome.includes(valorStr2) || nome.includes(valorStr3)) {
        score += 30;
      }

      // Data no filename (procura YYYYMMDD ou DD-MM ou similar)
      const dataParts = c.data_vencimento.split("-");
      if (dataParts.length === 3) {
        const ano = dataParts[0];
        const mes = dataParts[1];
        const dia = dataParts[2];
        if (nome.includes(`${ano}${mes}${dia}`) || nome.includes(`${dia}${mes}${ano}`)) {
          score += 30;
        } else if (nome.includes(`${dia}-${mes}`) || nome.includes(`${dia}/${mes}`)) {
          score += 15;
        }
      }

      if (score > melhorScore) {
        melhorScore = score;
        melhorId = c.id;
      }
    }

    return { contaId: melhorScore >= 40 ? melhorId : null, score: melhorScore };
  }

  const onFilesAdded = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const novos: ArquivoStaged[] = [];
      Array.from(files).forEach((file) => {
        const { contaId, score } = tentarMatchAutomatico(file);
        // Inferência simples de tipo pelo nome do arquivo
        const nomeLow = file.name.toLowerCase();
        let tipoInicial = "outro";
        if (nomeLow.includes("nf") || nomeLow.includes("nota") || nomeLow.includes("danfe")) tipoInicial = "nf";
        else if (nomeLow.includes("recibo")) tipoInicial = "recibo";
        else if (nomeLow.includes("boleto")) tipoInicial = "boleto";
        else if (nomeLow.includes("comprovante") || nomeLow.includes("pix") || nomeLow.includes("ted")) tipoInicial = "comprovante";
        novos.push({
          file,
          contaIdSugerida: contaId,
          scoreSugestao: score,
          tipoDoc: tipoInicial,
          status: "pronto",
        });
      });
      setArquivos((prev) => [...prev, ...novos]);
    },
    [contasCandidatas],
  );

  function alterarConta(idx: number, contaId: string) {
    setArquivos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], contaIdSugerida: contaId === "none" ? null : contaId, scoreSugestao: 100 };
      return next;
    });
  }

  function alterarTipo(idx: number, tipo: string) {
    setArquivos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], tipoDoc: tipo };
      return next;
    });
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleEnviarTodos() {
    const prontos = arquivos.filter((a) => a.contaIdSugerida && a.status === "pronto");
    if (prontos.length === 0) {
      toast.error("Nenhum arquivo vinculado a uma conta. Selecione a conta pra cada arquivo antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      for (let i = 0; i < arquivos.length; i++) {
        const a = arquivos[i];
        if (!a.contaIdSugerida || a.status !== "pronto") continue;

        setArquivos((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "enviando" };
          return next;
        });

        try {
          const ext = a.file.name.split(".").pop() || "bin";
          const path = `${a.contaIdSugerida}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("financeiro-docs")
            .upload(path, a.file);
          if (upErr) throw upErr;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insErr } = await (supabase as any).from("contas_pagar_documentos").insert({
            conta_pagar_id: a.contaIdSugerida,
            tipo: a.tipoDoc,
            nome_arquivo: a.file.name,
            storage_path: path,
            tamanho_bytes: a.file.size,
            uploaded_por: user?.id || null,
          });
          if (insErr) throw insErr;

          setArquivos((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], status: "enviado" };
            return next;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setArquivos((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], status: "erro", erro: msg };
            return next;
          });
        }
      }

      const enviados = arquivos.filter((a) => a.status === "enviado").length;
      toast.success(`${enviados} arquivo(s) enviado(s) com sucesso.`);
    } finally {
      setEnviando(false);
    }
  }

  function handleClose() {
    setArquivos([]);
    onClose();
  }

  const totalProntos = arquivos.filter((a) => a.contaIdSugerida && a.status === "pronto").length;
  const totalSemMatch = arquivos.filter((a) => !a.contaIdSugerida && a.status === "pronto").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload em Massa de Documentos
          </DialogTitle>
          <DialogDescription>
            Arraste os PDFs aqui (ou clique pra selecionar). O sistema tenta vincular cada arquivo
            à conta certa automaticamente — você revisa antes de enviar.
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/30 cursor-pointer"
          onClick={() => document.getElementById("upload-massa-input")?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            onFilesAdded(e.dataTransfer.files);
          }}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Arraste os arquivos aqui ou clique pra selecionar</p>
          <p className="text-xs text-muted-foreground mt-1">PDFs, imagens, qualquer formato</p>
          <input
            id="upload-massa-input"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFilesAdded(e.target.files)}
          />
        </div>

        {/* Resumo */}
        {arquivos.length > 0 && (
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
              {totalProntos} prontos
            </Badge>
            {totalSemMatch > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                {totalSemMatch} sem match (revisar)
              </Badge>
            )}
          </div>
        )}

        {/* Lista */}
        {arquivos.length > 0 && (
          <div className="flex-1 overflow-auto space-y-2 border rounded-md p-2">
            {arquivos.map((a, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 border rounded-md">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" title={a.file.name}>
                    {a.file.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Select
                      value={a.contaIdSugerida || "none"}
                      onValueChange={(v) => alterarConta(idx, v)}
                      disabled={a.status !== "pronto"}
                    >
                      <SelectTrigger className="h-7 text-[10px] flex-1 max-w-[280px]">
                        <SelectValue placeholder="Vincular a conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— sem vinculação —</SelectItem>
                        {(contasCandidatas || []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.parceiro_razao_social || c.fornecedor_cliente || "?"} •{" "}
                            {formatBRL(c.valor)} • {c.data_vencimento.split("-").reverse().join("/")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={a.tipoDoc}
                      onValueChange={(v) => alterarTipo(idx, v)}
                      disabled={a.status !== "pronto"}
                    >
                      <SelectTrigger className="h-7 text-[10px] w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_DOC_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {a.scoreSugestao > 0 && a.status === "pronto" && (
                      <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
                        {a.scoreSugestao}
                      </Badge>
                    )}
                  </div>
                  {a.status === "erro" && (
                    <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {a.erro}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {a.status === "enviando" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {a.status === "enviado" && <Check className="h-4 w-4 text-emerald-600" />}
                  {a.status === "pronto" && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removerArquivo(idx)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleClose} disabled={enviando}>
            Fechar
          </Button>
          <Button
            onClick={handleEnviarTodos}
            disabled={enviando || totalProntos === 0}
            className="gap-2"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar {totalProntos} arquivo(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
