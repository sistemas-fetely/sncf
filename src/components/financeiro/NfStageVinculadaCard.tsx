import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, FileText } from "lucide-react";

interface Props {
  nfStageId: string;
  onRemover: () => void;
}

const TIPO_LABEL: Record<string, string> = {
  nfe: "NF-e",
  nfse: "NFS-e",
  recibo: "Recibo",
};

export function NfStageVinculadaCard({ nfStageId, onRemover }: Props) {
  const { data: nf } = useQuery({
    queryKey: ["nf-stage-vinculada", nfStageId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("nfs_stage")
        .select("id, tipo_documento, fornecedor_razao_social, nf_numero, valor, nf_data_emissao")
        .eq("id", nfStageId)
        .single();
      if (error) return null;
      return data;
    },
  });

  if (!nf) return null;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-success/40 bg-success/50">
      <FileText className="h-4 w-4 text-success shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] border-success/40 text-success">
            {TIPO_LABEL[nf.tipo_documento] || nf.tipo_documento}
          </Badge>
          <span className="text-sm font-medium truncate">
            {nf.fornecedor_razao_social}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          NF {nf.nf_numero} · R$ {Number(nf.valor).toFixed(2)}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemover}
        className="shrink-0 h-8 w-8 p-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
