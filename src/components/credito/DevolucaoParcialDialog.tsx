import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";

type Desfecho = "haver" | "troca" | "reembolso" | "abater_divida";

interface Props {
  pedidoId: string;
  pedidoIdExterno: string | null;
  parceiroId: string | null;
  open: boolean;
  onClose: () => void;
}

const DESFECHO_LABEL: Record<Desfecho, string> = {
  haver: "Manter como haver",
  troca: "Troca por outro produto",
  reembolso: "Reembolso em dinheiro",
  abater_divida: "Abater da dívida em aberto",
};

const STATUS_TERMINAIS = new Set([
  "pago",
  "pago_com_atraso",
  "pago_judicial",
  "cancelado",
  "cancelado_recuperacao",
  "devolvido",
  "baixado_por_perda",
  "renegociado",
]);

const BOLETO_STATUS_REEMISSAO = new Set(["registrado", "vencido", "rejeitado"]);

type Parcela = {
  id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  data_vencimento_atual: string | null;
  valor_atual: number | null;
  valor_bruto: number | null;
  status: string | null;
  boleto_status: string | null;
};

function fmtDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function DevolucaoParcialDialog({
  pedidoId, pedidoIdExterno, parceiroId, open, onClose,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [valorStr, setValorStr] = useState("");
  const [nfDevolucao, setNfDevolucao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [desfecho, setDesfecho] = useState<Desfecho>("haver");
  const [tituloAbater, setTituloAbater] = useState<string>("");
  const [novaData, setNovaData] = useState<string>("");

  const parcelasQ = useQuery({
    queryKey: ["parcelas-abertas-devolucao-parcial", pedidoId],
    enabled: open,
    staleTime: 0,
    queryFn: async (): Promise<Parcela[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulos_a_receber")
        .select("id, numero_titulo, numero_parcela, total_parcelas, data_vencimento_atual, valor_atual, valor_bruto, status, boleto_status")
        .eq("pedido_id", pedidoId)
        .order("numero_parcela", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Parcela[];
    },
  });

  const parcelas = parcelasQ.data ?? [];

  const total = useMemo(
    () => parcelas
      .filter((t) => t.status !== "cancelado" && t.status !== "devolvido" && t.status !== "cancelado_recuperacao")
      .reduce((s, t) => s + Number(t.valor_bruto ?? 0), 0),
    [parcelas],
  );

  const parcelasAbertas = useMemo(
    () => parcelas.filter((t) => !STATUS_TERMINAIS.has(String(t.status ?? ""))),
    [parcelas],
  );

  const parcelaSelecionada = useMemo(
    () => parcelasAbertas.find((p) => p.id === tituloAbater) ?? null,
    [parcelasAbertas, tituloAbater],
  );

  const valorNum = useMemo(() => {
    const n = Number(valorStr.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [valorStr]);

  const excedeTotal = total > 0 && valorNum > total + 0.005;

  // regras específicas do abater_divida
  const precisaReemissao =
    !!parcelaSelecionada && BOLETO_STATUS_REEMISSAO.has(String(parcelaSelecionada.boleto_status ?? ""));
  const vencimentoJaPassou = useMemo(() => {
    if (!parcelaSelecionada?.data_vencimento_atual) return false;
    return parcelaSelecionada.data_vencimento_atual.slice(0, 10) < new Date().toISOString().slice(0, 10);
  }, [parcelaSelecionada]);
  const novaDataObrigatoria = precisaReemissao && vencimentoJaPassou;
  const abaterZera =
    !!parcelaSelecionada &&
    valorNum > 0 &&
    valorNum >= Number(parcelaSelecionada.valor_atual ?? 0) - 0.005;

  const podeConfirmar = (() => {
    if (!(valorNum > 0) || excedeTotal) return false;
    if (motivo.trim().length < 5) return false;
    if (!desfecho) return false;
    if (desfecho === "abater_divida") {
      if (!parcelaSelecionada) return false;
      if (abaterZera) return false;
      if (novaDataObrigatoria && !novaData) return false;
    }
    return true;
  })();

  const mut = useMutation({
    mutationFn: async () => {
      const params: Record<string, unknown> = {
        p_pedido_id: pedidoId,
        p_valor: valorNum,
        p_nf_devolucao: nfDevolucao.trim() || null,
        p_motivo: motivo.trim(),
        p_desfecho: desfecho,
      };
      if (desfecho === "abater_divida") {
        params.p_titulo_abater = tituloAbater;
        // envia nova data só se o boleto permitir; senão fica null
        params.p_nova_data = precisaReemissao && novaData ? novaData : null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_devolucao_parcial", params);
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar devolução parcial.");
      return data as {
        ok: true;
        pedido_id: string;
        valor_devolvido: number;
        desfecho: Desfecho;
        haver_id: string | null;
        nf_devolucao: string | null;
        reembolso: boolean;
        aviso?: string;
        abate?: {
          aplicado_agora: boolean;
          modo: "desconto_aplicado_direto" | "baixa_e_reemissao";
          novo_valor: number;
          titulo_id: string;
        };
      };
    },
    onSuccess: (data) => {
      toast.success(
        `Devolução parcial de ${formatBRL(data.valor_devolvido)} registrada`,
        { description: `Desfecho: ${DESFECHO_LABEL[data.desfecho]}` },
      );
      if (data.desfecho === "troca") {
        toast(`Crédito de ${formatBRL(data.valor_devolvido)} gerado — use ao criar o novo pedido do cliente`, {
          duration: 12000,
          action: parceiroId
            ? { label: "Ver crédito do cliente", onClick: () => navigate(`/credito/clientes/${parceiroId}`) }
            : undefined,
        });
      } else if (data.desfecho === "reembolso") {
        toast.info("Crédito encerrado (devolvido) — pagamento ao cliente é feito por fora.", { duration: 10000 });
      } else if (data.desfecho === "abater_divida" && data.abate) {
        if (data.abate.aplicado_agora) {
          toast.success(`Parcela reduzida para ${formatBRL(data.abate.novo_valor)}`);
        } else {
          toast.warning(
            `Baixa do boleto atual solicitada — gere a Remessa de Baixa na Aba Banco. O novo valor (${formatBRL(data.abate.novo_valor)}) será aplicado quando o banco confirmar.`,
            { duration: 15000 },
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["credito-cliente"] });
      qc.invalidateQueries({ queryKey: ["haveres-cliente"] });
      qc.invalidateQueries({ queryKey: ["baixas-pendentes"] });
      if (parceiroId) {
        qc.invalidateQueries({ queryKey: ["cliente-detalhe", parceiroId] });
      }
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !mut.isPending && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Devolução parcial — pedido {pedidoIdExterno ?? ""}
          </DialogTitle>
          <DialogDescription>
            O cliente devolve parte do valor. Não encerra o pedido — apenas registra a devolução e roteia o desfecho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Valor devolvido (R$)</Label>
              <span className="text-xs text-muted-foreground">
                Total do pedido: <strong>{formatBRL(total)}</strong>
              </span>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder="0,00"
            />
            {excedeTotal && (
              <p className="text-xs text-red-700">
                Valor não pode exceder o total do pedido ({formatBRL(total)}).
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>NF de retorno (opcional)</Label>
            <Input
              value={nfDevolucao}
              onChange={(e) => setNfDevolucao(e.target.value)}
              placeholder="número da NF de devolução — pode preencher depois"
            />
          </div>

          <div className="space-y-1">
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique o motivo da devolução parcial..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Desfecho</Label>
            <RadioGroup value={desfecho} onValueChange={(v) => setDesfecho(v as Desfecho)}>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-haver" value="haver" className="mt-0.5" />
                <Label htmlFor="desf-haver" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Manter como haver</strong> — crédito fica disponível para o cliente usar em compras futuras.
                </Label>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-troca" value="troca" className="mt-0.5" />
                <Label htmlFor="desf-troca" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Troca por outro produto</strong> — crédito fica disponível e deve ser consumido ao criar o novo pedido.
                </Label>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-reembolso" value="reembolso" className="mt-0.5" />
                <Label htmlFor="desf-reembolso" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Reembolso em dinheiro</strong> — o crédito é encerrado (devolvido); o pagamento ao cliente é feito por fora.
                </Label>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border">
                <RadioGroupItem id="desf-abater" value="abater_divida" className="mt-0.5" />
                <Label htmlFor="desf-abater" className="font-normal text-xs cursor-pointer leading-relaxed">
                  <strong>Abater da dívida em aberto</strong> — reduz o valor que o cliente ainda deve, na parcela escolhida.
                </Label>
              </div>
            </RadioGroup>
          </div>

          {desfecho === "abater_divida" && (
            <div className="space-y-3 rounded border p-3 bg-muted/30">
              <div className="space-y-1">
                <Label>Parcela a abater</Label>
                <Select value={tituloAbater} onValueChange={setTituloAbater}>
                  <SelectTrigger>
                    <SelectValue placeholder={
                      parcelasQ.isLoading
                        ? "Carregando parcelas..."
                        : parcelasAbertas.length === 0
                          ? "Nenhuma parcela em aberto"
                          : "Escolha a parcela"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {parcelasAbertas.map((p) => {
                      const label = [
                        p.numero_titulo ?? `parcela ${p.numero_parcela ?? "?"}`,
                        fmtDateBR(p.data_vencimento_atual),
                        formatBRL(Number(p.valor_atual ?? 0)),
                        p.boleto_status ? `boleto: ${p.boleto_status}` : "sem boleto",
                      ].join(" · ");
                      return (
                        <SelectItem key={p.id} value={p.id}>{label}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {abaterZera && parcelaSelecionada && (
                  <p className="text-xs text-red-700">
                    O valor devolvido ({formatBRL(valorNum)}) é maior ou igual à parcela ({formatBRL(Number(parcelaSelecionada.valor_atual ?? 0))}).
                    Escolha outra parcela ou use haver/reembolso.
                  </p>
                )}
              </div>

              {parcelaSelecionada && precisaReemissao && (
                <div className="space-y-1">
                  <Label>
                    Nova data de vencimento
                    {novaDataObrigatoria ? " (obrigatória)" : " (opcional)"}
                  </Label>
                  <Input
                    type="date"
                    value={novaData}
                    onChange={(e) => setNovaData(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    O boleto atual será baixado e um novo será emitido com o valor menor.
                  </p>
                </div>
              )}
            </div>
          )}

          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 !text-amber-700" />
            <AlertDescription className="text-xs text-amber-900">
              {desfecho === "abater_divida" ? (
                <>Reduz a dívida da parcela escolhida. <strong>NÃO gera haver nem crédito.</strong></>
              ) : (
                <>
                  Não altera as parcelas em aberto — o cliente segue devendo o valor original e fica
                  com crédito de <strong>{formatBRL(valorNum || 0)}</strong>.
                </>
              )}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Registrando..." : "Confirmar devolução parcial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
