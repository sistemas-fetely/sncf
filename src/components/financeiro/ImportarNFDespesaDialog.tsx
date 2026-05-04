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
import {
  SelecionarBoletosDialog,
  BoletoStageDoc,
} from "@/components/financeiro/SelecionarBoletosDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StageResult } from "@/lib/financeiro/stage-handler";

interface DespesaInitialData {
  nfStageId: string;
  nfStageDocumentoId?: string;
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
  const [boletosDialogOpen, setBoletosDialogOpen] = useState(false);
  const [stageInfo, setStageInfo] = useState<{
    id: string;
    fornecedor: string;
    parceiroId: string | null;
    categoriaId: string | null;
    descricao: string | null;
    dataEmissao: string | null;
    boletos: BoletoStageDoc[];
  } | null>(null);
  const [criandoDespesas, setCriandoDespesas] = useState(false);

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
          "id, fornecedor_razao_social, valor, valor_exibido, nf_data_emissao, data_vencimento, categoria_id, parceiro_id, descricao, qtd_boletos, documentos",
        )
        .eq("id", stageId)
        .maybeSingle();

      if (!stage) {
        onDespesaPronta({ nfStageId: stageId });
        return;
      }

      const documentos =
        (stage.documentos as Array<{
          id: string;
          tipo: string;
          arquivo_nome: string | null;
          valor: number | null;
          data_vencimento: string | null;
          linha_digitavel: string | null;
        }>) || [];
      const boletos = documentos.filter((d) => d.tipo === "pdf_boleto");

      // 2+ boletos → abre modal de seleção
      if (boletos.length >= 2) {
        setStageInfo({
          id: stage.id,
          fornecedor: stage.fornecedor_razao_social || "Fornecedor",
          parceiroId: stage.parceiro_id ?? null,
          categoriaId: stage.categoria_id ?? null,
          descricao: stage.descricao ?? null,
          dataEmissao: stage.nf_data_emissao ?? null,
          boletos: boletos.map((b) => ({
            id: b.id,
            arquivo_nome: b.arquivo_nome,
            valor: b.valor,
            data_vencimento: b.data_vencimento,
            linha_digitavel: b.linha_digitavel,
          })),
        });
        setBoletosDialogOpen(true);
        onOpenChange(false);
        return;
      }

      // 0-1 boletos → comportamento original
      const unico = boletos[0];
      onDespesaPronta({
        nfStageId: stage.id,
        nfStageDocumentoId: unico?.id,
        parceiroId: stage.parceiro_id ?? null,
        fornecedorNome: stage.fornecedor_razao_social ?? undefined,
        valor:
          unico?.valor ??
          (stage.valor_exibido as number | null) ??
          (stage.valor as number | null) ??
          undefined,
        dataEmissao: stage.nf_data_emissao ?? undefined,
        dataVencimento:
          unico?.data_vencimento ?? stage.data_vencimento ?? undefined,
        categoriaId: stage.categoria_id ?? null,
        descricao: stage.descricao ?? null,
      });
    } finally {
      setCarregando(false);
    }
  }

  async function lancarBoletosSelecionados(
    boletosSelecionados: BoletoStageDoc[],
  ) {
    if (!stageInfo) return;
    setCriandoDespesas(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const rows = boletosSelecionados.map((b, idx) => ({
        tipo: "pagar" as const,
        descricao: `${stageInfo.descricao || stageInfo.fornecedor} (${idx + 1}/${boletosSelecionados.length})`,
        valor: b.valor || 0,
        data_vencimento: b.data_vencimento,
        nf_data_emissao: stageInfo.dataEmissao,
        conta_id: stageInfo.categoriaId,
        parceiro_id: stageInfo.parceiroId,
        fornecedor_cliente: stageInfo.fornecedor,
        parcelas: 1,
        parcela_atual: 1,
        status: "aberto",
        origem: "manual",
        nf_stage_id: stageInfo.id,
        nfs_stage_documento_id: b.id,
        criada_por: userId,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("contas_pagar_receber")
        .insert(rows);
      if (error) throw error;

      await supabase
        .from("nfs_stage")
        .update({ status: "vinculada" })
        .eq("id", stageInfo.id);

      toast.success(
        `${boletosSelecionados.length} despesa${boletosSelecionados.length === 1 ? "" : "s"} criada${boletosSelecionados.length === 1 ? "" : "s"}!`,
      );
      setBoletosDialogOpen(false);
      setStageInfo(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Falha ao criar despesas: " + msg);
    } finally {
      setCriandoDespesas(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar NF / Boleto / Recibo</DialogTitle>
            <DialogDescription>
              Faça upload do arquivo. Após a importação, a despesa será aberta
              pré-preenchida.
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

      {stageInfo && (
        <SelecionarBoletosDialog
          open={boletosDialogOpen}
          onOpenChange={(v) => {
            setBoletosDialogOpen(v);
            if (!v) setStageInfo(null);
          }}
          fornecedor={stageInfo.fornecedor}
          boletos={stageInfo.boletos}
          onConfirmar={lancarBoletosSelecionados}
          processando={criandoDespesas}
        />
      )}
    </>
  );
}
