import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { ImportadorNFs } from "@/components/financeiro/ImportadorNFs";
import { supabase } from "@/integrations/supabase/client";
import type { StageResult } from "@/lib/financeiro/stage-handler";

interface DespesaInitialData {
  nfStageId: string;
  parceiroId?: string | null;
  fornecedorNome?: string;
  valor?: number;
  dataEmissao?: string;
  dataVencimento?: string;
  categoriaId?: string | null;
  descricao?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDespesaPronta: (data: DespesaInitialData) => void;
}

export function ImportarNFDespesaDialog({
  open,
  onOpenChange,
  onDespesaPronta,
}: Props) {
  const [carregando, setCarregando] = useState(false);

  async function handleImported(result: StageResult) {
    const stageId = result.stageIds[0];
    if (!stageId) {
      onOpenChange(false);
      return;
    }

    setCarregando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stage } = await (supabase as any)
        .from("vw_nfs_stage_completude")
        .select(
          "id, fornecedor_razao_social, valor, nf_data_emissao, data_vencimento, categoria_id, parceiro_id, descricao",
        )
        .eq("id", stageId)
        .maybeSingle();

      if (stage) {
        onDespesaPronta({
          nfStageId: stage.id,
          parceiroId: stage.parceiro_id ?? null,
          fornecedorNome: stage.fornecedor_razao_social ?? undefined,
          valor: stage.valor ?? undefined,
          dataEmissao: stage.nf_data_emissao ?? undefined,
          dataVencimento: stage.data_vencimento ?? undefined,
          categoriaId: stage.categoria_id ?? null,
          descricao: stage.descricao ?? null,
        });
      } else {
        onDespesaPronta({ nfStageId: stageId });
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar NF / Boleto / Recibo</DialogTitle>
          <DialogDescription>
            Faça upload do arquivo. Após a importação, a despesa será aberta pré-preenchida.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando dados da NF...
          </div>
        ) : (
          <ImportadorNFs onImported={handleImported} />
        )}
      </DialogContent>
    </Dialog>
  );
}
