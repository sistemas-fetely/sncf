import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
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
    isMultiStage?: boolean;
  } | null>(null);
  const [criandoDespesas, setCriandoDespesas] = useState(false);

  async function handleImported(result: StageResult) {
    if (result.stageIds.length === 0) {
      onOpenChange(false);
      return;
    }

    setCarregando(true);
    try {
      // Consulta todos os stages do lote (não só o primeiro)
      const stageQueries = await Promise.all(
        result.stageIds.map((id) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("vw_nfs_stage_completude")
            .select(
              "id, fornecedor_razao_social, valor, valor_exibido, nf_data_emissao, data_vencimento, categoria_id, parceiro_id, descricao, qtd_boletos, documentos",
            )
            .eq("id", id)
            .maybeSingle()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((r: any) => r.data),
        ),
      );

      const stages = stageQueries.filter(Boolean);

      if (stages.length === 0) {
        onDespesaPronta({ nfStageId: result.stageIds[0] });
        return;
      }

      // Coleta todos os boletos de todos os stages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todosBoletos: BoletoStageDoc[] = stages.flatMap((stage: any) => {
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

        if (boletos.length === 0) {
          return [
            {
              id: `stage_${stage.id}`,
              arquivo_nome: stage.descricao || stage.fornecedor_razao_social,
              valor:
                (stage.valor_exibido as number | null) ??
                (stage.valor as number | null) ??
                null,
              data_vencimento: stage.data_vencimento ?? null,
              linha_digitavel: null,
              nf_stage_id: stage.id,
              parceiro_id: stage.parceiro_id ?? null,
              categoria_id: stage.categoria_id ?? null,
              descricao: stage.descricao ?? null,
              fornecedor: stage.fornecedor_razao_social ?? null,
              data_emissao: stage.nf_data_emissao ?? null,
            } as BoletoStageDoc,
          ];
        }

        return boletos.map((b) => ({
          id: b.id,
          arquivo_nome: b.arquivo_nome,
          valor:
            b.valor ??
            (stage.valor_exibido as number | null) ??
            (stage.valor as number | null) ??
            null,
          data_vencimento: b.data_vencimento ?? stage.data_vencimento ?? null,
          linha_digitavel: b.linha_digitavel,
          nf_stage_id: stage.id,
          parceiro_id: stage.parceiro_id ?? null,
          categoria_id: stage.categoria_id ?? null,
          descricao: stage.descricao ?? null,
          fornecedor: stage.fornecedor_razao_social ?? null,
          data_emissao: stage.nf_data_emissao ?? null,
        }));
      });

      const isMultiStage = stages.length > 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const primeiroStage = stages[0] as any;

      // Stage único com 0–1 boleto: comportamento original (abre sheet direto)
      if (!isMultiStage && todosBoletos.length <= 1) {
        const unico = todosBoletos[0];
        onDespesaPronta({
          nfStageId: primeiroStage.id,
          nfStageDocumentoId:
            unico && !unico.id.startsWith("stage_") ? unico.id : undefined,
          parceiroId: primeiroStage.parceiro_id ?? null,
          fornecedorNome: primeiroStage.fornecedor_razao_social ?? undefined,
          valor:
            unico?.valor ??
            (primeiroStage.valor_exibido as number | null) ??
            (primeiroStage.valor as number | null) ??
            undefined,
          dataEmissao: primeiroStage.nf_data_emissao ?? undefined,
          dataVencimento:
            unico?.data_vencimento ?? primeiroStage.data_vencimento ?? undefined,
          categoriaId: primeiroStage.categoria_id ?? null,
          descricao: primeiroStage.descricao ?? null,
        });
        return;
      }

      // Stage único com 2+ boletos OU multi-stage: abre SelecionarBoletosDialog
      setStageInfo({
        id: primeiroStage.id,
        fornecedor: primeiroStage.fornecedor_razao_social || "Fornecedor",
        parceiroId: primeiroStage.parceiro_id ?? null,
        categoriaId: primeiroStage.categoria_id ?? null,
        descricao: primeiroStage.descricao ?? null,
        dataEmissao: primeiroStage.nf_data_emissao ?? null,
        boletos: todosBoletos,
        isMultiStage,
      });
      setBoletosDialogOpen(true);
      onOpenChange(false);
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
      const rows = boletosSelecionados.map((b, idx) => ({
        tipo: "pagar" as const,
        descricao: `${b.descricao || stageInfo.descricao || b.fornecedor || stageInfo.fornecedor} (${idx + 1}/${boletosSelecionados.length})`,
        valor: b.valor || 0,
        data_vencimento: b.data_vencimento,
        nf_data_emissao: b.data_emissao ?? stageInfo.dataEmissao,
        conta_id: b.categoria_id ?? stageInfo.categoriaId,
        parceiro_id: b.parceiro_id ?? stageInfo.parceiroId,
        fornecedor_cliente: b.fornecedor ?? stageInfo.fornecedor,
        parcelas: 1,
        parcela_atual: 1,
        status: "aberto",
        origem: "manual",
        nf_stage_id: b.nf_stage_id ?? stageInfo.id,
        nfs_stage_documento_id: b.id.startsWith("stage_") ? undefined : b.id,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("contas_pagar_receber")
        .insert(rows);
      if (error) throw error;

      // Status do stage é recalculado automaticamente por trigger no banco
      // (ver função recalcular_status_nf_stage / Fase E)

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });
      toast.success(
        `${boletosSelecionados.length} despesa${boletosSelecionados.length === 1 ? "" : "s"} criada${boletosSelecionados.length === 1 ? "" : "s"}!`,
      );
      setBoletosDialogOpen(false);
      setStageInfo(null);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : (e as any)?.message ?? JSON.stringify(e);
      console.error("[lancarBoletosSelecionados] erro completo:", e);
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
          mostrarFornecedor={stageInfo?.isMultiStage}
        />
      )}
    </>
  );
}
