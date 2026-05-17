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
  CriarDespesaDeNFDialog,
  type NFParaCriar,
  type BoletoFisico,
} from "@/components/financeiro/CriarDespesaDeNFDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StageResult } from "@/lib/financeiro/stage-handler";
import { useQueryClient } from "@tanstack/react-query";
import { addMonths } from "date-fns";

interface ItemFila {
  nf: NFParaCriar;
  boletos: BoletoFisico[];
}

interface DespesaInitialData {
  nfStageId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Mantido para compatibilidade — não é mais chamado no fluxo normal */
  onDespesaPronta: (data: DespesaInitialData) => void;
}

function valorDaParcela(total: number, qtdParcelas: number, indice: number): number {
  if (qtdParcelas <= 1) return total;
  const totalCentavos = Math.round(total * 100);
  const baseCentavos = Math.floor(totalCentavos / qtdParcelas);
  const restoCentavos = totalCentavos - baseCentavos * qtdParcelas;
  return (
    indice === qtdParcelas - 1 ? baseCentavos + restoCentavos : baseCentavos
  ) / 100;
}

export function ImportarNFDespesaDialog({
  open,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const [carregando, setCarregando] = useState(false);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [filaIndex, setFilaIndex] = useState(0);
  const [criandoDespesa, setCriandoDespesa] = useState(false);

  async function handleImported(result: StageResult) {
    if (!result.stageIdsCriados || result.stageIdsCriados.length === 0) {
      onOpenChange(false);
      return;
    }

    setCarregando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stages, error } = await (supabase as any)
        .from("nfs_stage")
        .select(
          "id, fornecedor_razao_social, fornecedor_cliente, nf_numero, valor, nf_data_emissao, data_vencimento, parceiro_id, categoria_id, descricao",
        )
        .in("id", result.stageIdsCriados);

      if (error) throw error;
      if (!stages || stages.length === 0) {
        onOpenChange(false);
        return;
      }

      // Carrega boletos físicos (best-effort: se falhar, segue sem boletos)
      const boletosPorStage = new Map<string, BoletoFisico[]>();
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: docs } = await (supabase as any)
          .from("nfs_stage_documentos")
          .select("id, nfs_stage_id, tipo, valor, data_vencimento")
          .in("nfs_stage_id", result.stageIdsCriados)
          .eq("tipo", "pdf_boleto");

        for (const d of docs || []) {
          const arr = boletosPorStage.get(d.nfs_stage_id) || [];
          arr.push({
            id: d.id,
            valor: d.valor,
            data_vencimento: d.data_vencimento,
          });
          boletosPorStage.set(d.nfs_stage_id, arr);
        }
      } catch (e) {
        console.warn("[ImportarNFDespesaDialog] boletos não carregados:", e);
      }

      const novaFila: ItemFila[] = stages.map((s: Record<string, unknown>) => ({
        nf: {
          stageId: s.id as string,
          fornecedor:
            (s.fornecedor_razao_social as string | null) ||
            (s.fornecedor_cliente as string | null) ||
            "Fornecedor",
          nfNumero: (s.nf_numero as string | null) ?? null,
          valor: Number(s.valor) || 0,
          dataEmissao: (s.nf_data_emissao as string | null) ?? null,
          dataVencimento: (s.data_vencimento as string | null) ?? null,
          parceiroId: (s.parceiro_id as string | null) ?? null,
          categoriaId: (s.categoria_id as string | null) ?? null,
          descricao: (s.descricao as string | null) ?? null,
        },
        boletos: boletosPorStage.get(s.id as string) || [],
      }));

      setFila(novaFila);
      setFilaIndex(0);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Falha ao carregar NFs do stage: " + msg);
      onOpenChange(false);
    } finally {
      setCarregando(false);
    }
  }

  async function criarDespesa(data: {
    formaPgtoId: string | null;
    parcelas: number;
    dataPrimeiraParcela: string;
  }) {
    const item = fila[filaIndex];
    if (!item) return;

    setCriandoDespesa(true);
    try {
      const { nf, boletos } = item;
      const grupoId = data.parcelas > 1 ? crypto.randomUUID() : null;
      const baseDate = new Date(data.dataPrimeiraParcela + "T00:00:00");
      const temBoletos =
        boletos.length === data.parcelas && boletos.length > 1;

      const rows = [];
      for (let i = 0; i < data.parcelas; i++) {
        const venc =
          temBoletos && boletos[i]?.data_vencimento
            ? boletos[i].data_vencimento!
            : addMonths(baseDate, i).toISOString().slice(0, 10);

        rows.push({
          tipo: "pagar",
          descricao:
            data.parcelas > 1
              ? `${nf.descricao || nf.fornecedor} (${i + 1}/${data.parcelas})`
              : nf.descricao || nf.fornecedor,
          valor: valorDaParcela(nf.valor, data.parcelas, i),
          data_vencimento: venc,
          nf_data_emissao: nf.dataEmissao,
          conta_id: nf.categoriaId,
          parceiro_id: nf.parceiroId,
          fornecedor_cliente: nf.fornecedor,
          forma_pagamento_id: data.formaPgtoId,
          parcelas: data.parcelas,
          parcela_atual: i + 1,
          parcela_grupo_id: grupoId,
          status: "aberto",
          origem: nf.stageId ? "nf_import" : "manual",
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inseridas, error } = await (supabase as any)
        .from("contas_pagar_receber")
        .insert(rows)
        .select("id, parcela_atual");
      if (error) throw error;

      // Vincula a NF à PRIMEIRA parcela (modelo N:1: NF aponta para uma CPR).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const primeira = (inseridas || []).find((r: any) => r.parcela_atual === 1);
      if (primeira && nf.stageId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: vincErr } = await (supabase as any).rpc("vincular_nf_a_conta", {
          p_nf_id: nf.stageId,
          p_conta_id: primeira.id,
        });
        if (vincErr) {
          console.warn("Falha ao vincular NF à parcela 1:", vincErr);
        }
      }

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["nfs-stage"] });

      toast.success(
        data.parcelas > 1
          ? `${data.parcelas} parcelas criadas para ${nf.fornecedor}`
          : `Despesa criada para ${nf.fornecedor}`,
      );

      avancarFila();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[criarDespesa] erro:", e);
      toast.error("Falha ao criar despesa: " + msg);
    } finally {
      setCriandoDespesa(false);
    }
  }

  function avancarFila() {
    const proximo = filaIndex + 1;
    if (proximo >= fila.length) {
      setFila([]);
      setFilaIndex(0);
    } else {
      setFilaIndex(proximo);
    }
  }

  function pularNF() {
    if (criandoDespesa) return;
    avancarFila();
  }

  const itemAtual = fila[filaIndex];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar NFs</DialogTitle>
            <DialogDescription>
              Selecione XMLs ou PDFs (DANFEs ou boletos). Após o import, será
              perguntado para cada NF nova como criar a despesa (forma de
              pagamento e parcelas).
            </DialogDescription>
          </DialogHeader>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando NFs para confirmação...
            </div>
          ) : (
            <ImportadorNFs onImported={handleImported} />
          )}
        </DialogContent>
      </Dialog>

      {itemAtual && (
        <CriarDespesaDeNFDialog
          open={true}
          nf={itemAtual.nf}
          boletos={itemAtual.boletos}
          posicaoFila={{ atual: filaIndex + 1, total: fila.length }}
          processando={criandoDespesa}
          onConfirmar={criarDespesa}
          onPular={pularNF}
        />
      )}
    </>
  );
}
