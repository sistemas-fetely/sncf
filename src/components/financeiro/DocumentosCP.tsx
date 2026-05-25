import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Eye, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export const TIPO_DOC_LABEL: Record<string, string> = {
  nf: "NF",
  recibo: "Recibo",
  boleto: "Boleto",
  orcamento: "Orçamento",
  proposta: "Proposta",
  ticket_cartao: "Ticket cartão",
  comprovante: "Comprovante",
  contrato: "Contrato",
  outro: "Outro",
};

interface Doc {
  id: string;
  tipo: string;
  nome_arquivo: string;
  storage_path: string;
}

interface Props {
  contaId: string;
  docsStatus: "ok" | "pendente" | "parcial" | string;
  nfChaveAcesso?: string | null;
  nfNumero?: string | null;
  origem?: string | null;
}

export default function DocumentosCP({
  contaId,
  docsStatus,
  nfChaveAcesso,
  nfNumero,
  origem,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tipoDocUpload, setTipoDocUpload] = useState<string>("outro");
  const [uploading, setUploading] = useState(false);

  const { data: documentos } = useQuery({
    queryKey: ["cp-documentos", contaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_documentos")
        .select("id, tipo, nome_arquivo, storage_path")
        .eq("conta_pagar_id", contaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Doc[];
    },
  });

  async function abrirDoc(path: string) {
    const { data } = await supabase.storage
      .from("financeiro-docs")
      .createSignedUrl(path, 60 * 10);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Não foi possível gerar o link");
  }

  async function removerDoc(doc: Doc) {
    if (!confirm(`Remover "${doc.nome_arquivo}"?`)) return;
    const { error: delErr } = await supabase
      .from("contas_pagar_documentos")
      .delete()
      .eq("id", doc.id);
    if (delErr) {
      toast.error("Erro: " + delErr.message);
      return;
    }
    await supabase.storage.from("financeiro-docs").remove([doc.storage_path]);
    toast.success("Documento removido");
    qc.invalidateQueries({ queryKey: ["cp-documentos", contaId] });
    qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", contaId] });
    qc.invalidateQueries({ queryKey: ["contas-pagar"] });
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const tipo = tipoDocUpload || "outro"; // fallback para "outro" se vazio

    setUploading(true);
    try {
      const path = `cp/${contaId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("financeiro-docs")
        .upload(path, file);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase
        .from("contas_pagar_documentos")
        .insert({
          conta_pagar_id: contaId,
          tipo,
          nome_arquivo: file.name,
          storage_path: path,
          tamanho_bytes: file.size,
          uploaded_por: user?.id || null,
        });
      if (insErr) throw insErr;

      toast.success("Documento anexado!");
      setTipoDocUpload("outro");
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["cp-documentos", contaId] });
      qc.invalidateQueries({ queryKey: ["conta-pagar-detalhe", contaId] });
      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro no upload: " + msg);
    } finally {
      setUploading(false);
    }
  }

  const docsStatusBadge =
    docsStatus === "ok" ? (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px]">
        Documentação OK
      </Badge>
    ) : docsStatus === "parcial" ? (
      <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px]">
        Parcial (falta NF ou recibo)
      </Badge>
    ) : (
      <Badge variant="outline" className="border-amber-400 text-amber-600 text-[10px]">
        Pendente
      </Badge>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase">Documentos</p>
        {docsStatusBadge}
      </div>

      {/* NF vinculada via Qive/XML */}
      {nfChaveAcesso && (
        <div className="flex items-center gap-2 p-2 rounded border text-xs bg-green-50">
          <FileText className="h-3 w-3 text-green-700" />
          <span className="flex-1 truncate">
            NF {nfNumero || "vinculada"}{origem ? ` (via ${origem})` : ""}
          </span>
          <Badge variant="outline" className="text-[9px] border-green-500 text-green-700">
            NF
          </Badge>
        </div>
      )}

      {/* Lista de documentos enviados */}
      {(documentos || []).map((doc) => (
        <div
          key={doc.id}
          className="flex items-center justify-between p-2 rounded border text-xs"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{doc.nome_arquivo}</span>
            <Badge variant="outline" className="text-[9px] shrink-0">
              {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}
            </Badge>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => abrirDoc(doc.storage_path)}
            >
              <Eye className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
              onClick={() => removerDoc(doc)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Upload novo documento */}
      <div className="flex gap-2">
        <Select value={tipoDocUpload} onValueChange={setTipoDocUpload}>
          <SelectTrigger className="w-32 text-xs h-8">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nf">NF</SelectItem>
            <SelectItem value="recibo">Recibo</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="orcamento">Orçamento</SelectItem>
            <SelectItem value="proposta">Proposta</SelectItem>
            <SelectItem value="ticket_cartao">Ticket cartão</SelectItem>
            <SelectItem value="comprovante">Comprovante</SelectItem>
            <SelectItem value="contrato">Contrato</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-xs h-8"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3" /> {uploading ? "Enviando..." : "Anexar"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic"
          className="hidden"
          onChange={handleUploadDoc}
        />
      </div>

      {docsStatus !== "ok" && (
        <p className="text-[11px] text-amber-600">
          ⚠ Falta NF ou recibo. Ticket de cartão sozinho não serve para compliance.
        </p>
      )}
    </div>
  );
}
