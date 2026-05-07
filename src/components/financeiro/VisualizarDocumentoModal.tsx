import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format-currency";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  nfStageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VisualizarDocumentoModal({ nfStageId, open, onOpenChange }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [tipoDoc, setTipoDoc] = useState<string | null>(null);

  const { data: nf, isLoading } = useQuery({
    queryKey: ["nf-stage-doc-modal", nfStageId],
    enabled: open && !!nfStageId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select(
          "id, nf_chave_acesso, nf_numero, fornecedor_razao_social, valor, tipo_documento, resumo_pdf_storage_path, nfs_stage_documentos(tipo, storage_path, arquivo_nome)",
        )
        .eq("id", nfStageId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setSignedUrl(null);
    setTipoDoc(null);
    if (!open || !nf) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docs: Array<{ tipo: string; storage_path: string }> = nf.nfs_stage_documentos || [];
      const preferOrder = ["pdf_danfe", "pdf_boleto", "xml"];
      const escolhido = preferOrder.map((t) => docs.find((d) => d.tipo === t)).find(Boolean);
      if (escolhido) {
        const { data } = await supabase.storage
          .from("nfs-stage")
          .createSignedUrl(escolhido.storage_path, 60 * 10);
        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          setTipoDoc(escolhido.tipo);
          return;
        }
      }
      // fallback: resumo PDF
      if (nf.resumo_pdf_storage_path) {
        const { data } = await supabase.storage
          .from("nfs-stage")
          .createSignedUrl(nf.resumo_pdf_storage_path, 60 * 10);
        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          setTipoDoc("resumo_pdf");
        }
      }
    })().catch((e) => toast.error("Erro ao carregar documento: " + (e?.message || e)));
  }, [open, nf]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documento Fiscal
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : nf ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm border rounded-lg p-3 bg-muted/30">
              <div>
                <div className="text-xs text-muted-foreground">Fornecedor</div>
                <div className="font-medium">{nf.fornecedor_razao_social || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Número NF</div>
                <div className="font-medium">{nf.nf_numero || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Valor</div>
                <div className="font-medium">{formatBRL(Number(nf.valor || 0))}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Chave de Acesso</div>
                <div className="font-mono text-[11px] break-all">{nf.nf_chave_acesso || "—"}</div>
              </div>
            </div>

            {signedUrl ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    {tipoDoc === "pdf_danfe"
                      ? "DANFE (PDF)"
                      : tipoDoc === "pdf_boleto"
                      ? "Boleto (PDF)"
                      : tipoDoc === "xml"
                      ? "XML"
                      : "Resumo (PDF)"}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Abrir em nova aba
                    </a>
                  </Button>
                </div>
                {tipoDoc === "xml" ? (
                  <div className="border rounded-lg p-4 bg-muted text-center">
                    <Button asChild>
                      <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                        Baixar XML
                      </a>
                    </Button>
                  </div>
                ) : (
                  <iframe
                    src={signedUrl}
                    className="w-full h-[600px] border rounded-lg"
                    title="Documento"
                  />
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Documento não disponível para visualização
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">Documento não encontrado</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
