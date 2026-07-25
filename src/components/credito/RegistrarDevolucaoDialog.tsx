import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface Props {
  pedidoId: string;
  pedidoIdExterno: string | null;
  open: boolean;
  onClose: () => void;
}

type Tratamento =
  | "aberto_encerrado"
  | "pago_fantasma_revertido_sem_haver"
  | "pago_com_lastro_revisar_haver"
  | string;

interface PreviewItem {
  numero_titulo: string;
  valor: number;
  status_atual: string;
  boleto_atual: string | null;
  vai_para: string;
  boleto_vai_para: string | null;
  cpr_vai_para: string | null;
  tratamento: Tratamento;
}

interface PreviewOk {
  ok: true;
  estagio: string;
  titulos_a_devolver: number;
  boletos_a_baixar: number;
  havers_a_revisar: number;
  havers_valor_total?: number;
  fantasmas_a_reverter: number;
  itens: PreviewItem[];
}
interface PreviewErr {
  ok: false;
  erro: string;
  estagio?: string;
}
type Preview = PreviewOk | PreviewErr;

const TRATAMENTO_LABEL: Record<string, { text: string; cls: string }> = {
  aberto_encerrado: {
    text: "encerra (não pago)",
    cls: "bg-muted text-muted-foreground border-border",
  },
  pago_fantasma_revertido_sem_haver: {
    text: "pago sem lastro → revertido (sem haver)",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
  },
  pago_com_lastro_revisar_haver: {
    text: "pago com lastro → revisar haver (manual)",
    cls: "bg-red-50 text-red-800 border-red-200",
  },
};

function BadgeTratamento({ t }: { t: Tratamento }) {
  const cfg = TRATAMENTO_LABEL[t];
  if (!cfg) {
    return (
      <Badge variant="outline" className="text-[10px]">
        {t}
      </Badge>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
        cfg.cls,
      )}
    >
      {cfg.text}
    </span>
  );
}

export function RegistrarDevolucaoDialog({ pedidoId, pedidoIdExterno, open, onClose }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [nfDevolucao, setNfDevolucao] = useState("");
  const [gerarHaver, setGerarHaver] = useState(false);

  const preview = useQuery({
    queryKey: ["preview-devolucao", pedidoId],
    enabled: open,
    staleTime: 0,
    queryFn: async (): Promise<Preview> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("preview_devolucao_pedido", {
        p_pedido_id: pedidoId,
      });
      if (error) throw new Error(error.message);
      return data as Preview;
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_devolucao_pedido", {
        p_pedido_id: pedidoId,
        p_nf_devolucao: nfDevolucao.trim() || null,
        p_motivo: motivo.trim(),
        p_gerar_haver: gerarHaver,
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar devolução.");
      return data as {
        ok: true;
        titulos_devolvidos: number;
        boletos_baixa_solicitada: number;
        cprs_cancelados: number;
        pagos_fantasma_revertidos: { numero_titulo: string; valor: number }[];
        pagos_com_lastro_a_revisar: { numero_titulo: string; valor: number }[];
        nf_devolucao: string | null;
        haver_gerado_id?: string | null;
        haver_valor?: number | null;
      };
    },
    onSuccess: (data) => {
      const partes = [
        `${data.titulos_devolvidos} título(s) devolvido(s)`,
        `${data.boletos_baixa_solicitada} boleto(s) com baixa solicitada`,
      ];
      if (data.pagos_fantasma_revertidos.length > 0) {
        partes.push(`${data.pagos_fantasma_revertidos.length} pago(s) fantasma(s) revertido(s)`);
      }
      if (data.pagos_com_lastro_a_revisar.length > 0) {
        partes.push(`${data.pagos_com_lastro_a_revisar.length} pago(s) com lastro a revisar`);
      }
      if (data.haver_gerado_id) {
        partes.push(`Haver de ${formatBRL(data.haver_valor ?? 0)} gerado para o cliente.`);
      }
      toast.success("Devolução registrada", { description: partes.join(" · ") });

      if (data.boletos_baixa_solicitada > 0) {
        toast.warning("Gere a Remessa de Baixa na Aba Banco para matar os boletos no Safra.", {
          duration: 10000,
        });
      }
      if (data.pagos_com_lastro_a_revisar.length > 0 && !data.haver_gerado_id) {
        toast.warning(
          `Títulos pagos com lastro (${data.pagos_com_lastro_a_revisar
            .map((p) => p.numero_titulo)
            .join(", ")}) — decidir haver manualmente.`,
          { duration: 12000 },
        );
      }
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewOk = preview.data && preview.data.ok === true ? preview.data : null;
  const previewErr = preview.data && preview.data.ok === false ? preview.data : null;

  const podeConfirmar =
    !!previewOk && motivo.trim().length >= 5 && !mut.isPending && !preview.isLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar devolução — pedido {pedidoIdExterno ?? ""}</DialogTitle>
          <DialogDescription>
            Encerramento total do pedido (pós-NF). A NF permanece; os títulos e boletos são
            tratados abaixo. <strong>Afeta o pedido inteiro.</strong>
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {preview.error && (
          <Alert className="border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4 !text-red-700" />
            <AlertDescription className="text-xs text-red-900">
              Erro ao carregar preview: {(preview.error as Error).message}
            </AlertDescription>
          </Alert>
        )}

        {previewErr && (
          <Alert className="border-red-300 bg-red-50">
            <AlertTriangle className="h-4 w-4 !text-red-700" />
            <AlertDescription className="text-xs text-red-900">
              {previewErr.erro}
              {previewErr.estagio ? ` (estágio: ${previewErr.estagio})` : ""}
            </AlertDescription>
          </Alert>
        )}

        {previewOk && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded border">
                <div className="text-muted-foreground">Títulos a devolver</div>
                <div className="text-base font-semibold">{previewOk.titulos_a_devolver}</div>
              </div>
              <div className="p-2 rounded border">
                <div className="text-muted-foreground">Boletos a baixar</div>
                <div className="text-base font-semibold">{previewOk.boletos_a_baixar}</div>
              </div>
              <div className="p-2 rounded border">
                <div className="text-muted-foreground">Havers a revisar</div>
                <div className="text-base font-semibold">{previewOk.havers_a_revisar}</div>
              </div>
              <div className="p-2 rounded border">
                <div className="text-muted-foreground">Fantasmas a reverter</div>
                <div className="text-base font-semibold">{previewOk.fantasmas_a_reverter}</div>
              </div>
            </div>

            <div className="rounded-md border mt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Boleto</TableHead>
                    <TableHead>CPR</TableHead>
                    <TableHead>Tratamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewOk.itens.map((it) => (
                    <TableRow key={it.numero_titulo}>
                      <TableCell className="font-mono text-xs">{it.numero_titulo}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatBRL(it.valor)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="text-muted-foreground">{it.status_atual}</span>{" "}
                        <span>→ <strong>devolvido</strong></span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {it.boleto_atual ? (
                          <>
                            <span className="text-muted-foreground">{it.boleto_atual}</span>
                            {it.boleto_vai_para && (
                              <> → <strong>{it.boleto_vai_para}</strong></>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{it.cpr_vai_para ?? "—"}</TableCell>
                      <TableCell>
                        <BadgeTratamento t={it.tratamento} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 mt-3">
              <div className="space-y-1">
                <Label>Motivo (obrigatório)</Label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Explique o motivo da devolução..."
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label>NF de devolução (opcional)</Label>
                <Input
                  value={nfDevolucao}
                  onChange={(e) => setNfDevolucao(e.target.value)}
                  placeholder="número da NF de retorno — pode preencher depois"
                />
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Registrando..." : "Confirmar devolução"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
