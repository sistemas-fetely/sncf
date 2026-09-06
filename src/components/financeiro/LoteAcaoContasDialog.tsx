import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { hojeISO } from "@/lib/data";
import type { TituloPagarAcao } from "@/hooks/financeiro/useTituloPagarEstado";

/**
 * Ação de lote no eixo ESTADO. A ação NUNCA é montada por condicional aqui —
 * ela chega pronta da dimensão (`useTituloPagarAcoes`), já reduzida à interseção
 * dos títulos selecionados. Este componente só confirma e executa.
 *
 * Sucesso parcial é visível item a item: `falharam > 0` abre um segundo dialog
 * com cada título e a mensagem de erro exata do banco. Nunca resumido em toast.
 */

type Resumo = {
  titulos: number;
  valor_total: number;
  sem_nf_verificada: number;
  estados: unknown;
};

type Falha = { cpr_id: string; descricao: string | null; erro: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ids: string[];
  acao: TituloPagarAcao | null;
  /** Data pretendida inicial, calculada a partir do menor vencimento dos títulos selecionados. */
  dataPretendidaInicial?: string | null;
  /** Chamado quando o lote foi aplicado sem falhas (para limpar a seleção). */
  onAplicado: () => void;
}

export function LoteAcaoContasDialog({ open, onOpenChange, ids, acao, onAplicado }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [dataPretendida, setDataPretendida] = useState("");
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<{ aplicados: number; falhas: Falha[] } | null>(null);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setDataPretendida("");
      setResultado(null);
    }
  }, [open]);

  const resumoQuery = useQuery({
    queryKey: ["titulo-pagar-lote-resumo", ids.slice().sort().join(",")],
    enabled: open && ids.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_titulo_pagar_lote_resumo", {
        p_cpr_ids: ids,
      });
      if (error) throw error;
      return data as Resumo;
    },
  });

  const exigeMotivo = !!acao?.exige_motivo;
  const exigeData = !!acao?.exige_data_pretendida;
  const motivoOk = !exigeMotivo || motivo.trim().length >= 5;
  const dataOk = !exigeData || !!dataPretendida;

  async function executar() {
    if (!acao) return;
    setExecutando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_titulo_pagar_transicionar_lote", {
        p_cpr_ids: ids,
        p_para: acao.para,
        p_motivo: exigeMotivo ? motivo.trim() : null,
        p_data_pretendida: exigeData ? dataPretendida : null,
      });
      if (error) throw error;

      const aplicados = Number(data?.aplicados ?? 0);
      const falharam = Number(data?.falharam ?? 0);
      const falhas = (data?.falhas ?? []) as Falha[];

      qc.invalidateQueries({ queryKey: ["contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["titulo-pagar-acoes"] });
      qc.invalidateQueries({ queryKey: ["cp-historico"] });

      if (falharam > 0) {
        setResultado({ aplicados, falhas });
        onOpenChange(false);
        return;
      }

      toast.success(`${aplicados} título${aplicados === 1 ? "" : "s"} atualizado${aplicados === 1 ? "" : "s"}`);
      onOpenChange(false);
      onAplicado();
    } catch (e) {
      // O limite de 500 do banco chega por aqui — mensagem mostrada como veio.
      toast.error(e instanceof Error ? e.message : String(e), { duration: 8000 });
    } finally {
      setExecutando(false);
    }
  }

  const resumo = resumoQuery.data;

  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao?.rotulo_acao}
              {resumo ? ` — ${resumo.titulos} títulos, ${formatBRL(Number(resumo.valor_total || 0))}` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resumoQuery.isLoading
                ? "Somando os títulos selecionados..."
                : resumoQuery.error
                  ? (resumoQuery.error as Error).message
                  : `Esta ação vale para todos os ${ids.length} títulos selecionados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!!resumo && Number(resumo.sem_nf_verificada) > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {resumo.sem_nf_verificada} destes títulos NÃO têm nota fiscal verificada.
              </span>
            </div>
          )}

          {exigeMotivo && (
            <div className="space-y-2">
              <Label htmlFor="motivo-lote">Motivo (vale para todos)</Label>
              <Textarea
                id="motivo-lote"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Explique em pelo menos 5 caracteres"
              />
            </div>
          )}

          {exigeData && (
            <div className="space-y-2">
              <Label htmlFor="data-lote">Data pretendida (vale para todos)</Label>
              <Input
                id="data-lote"
                type="date"
                value={dataPretendida}
                onChange={(e) => setDataPretendida(e.target.value)}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando || !motivoOk || !dataOk}
              onClick={(e) => {
                e.preventDefault();
                executar();
              }}
            >
              {executando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {acao?.rotulo_acao ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resultado com falha parcial — item a item, nunca resumido. */}
      <Dialog open={!!resultado} onOpenChange={(v) => !v && setResultado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resultado?.aplicados ?? 0} aplicados, {resultado?.falhas.length ?? 0} falharam
            </DialogTitle>
            <DialogDescription>
              Cada título abaixo foi recusado pelo banco com a mensagem exata.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-80 pr-3">
            <ul className="space-y-2">
              {resultado?.falhas.map((f) => (
                <li key={f.cpr_id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{f.descricao || f.cpr_id}</div>
                  <div className="text-destructive text-xs mt-0.5">{f.erro}</div>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setResultado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default LoteAcaoContasDialog;
