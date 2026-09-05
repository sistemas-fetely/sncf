/**
 * Cobertura do cliente.
 *
 * O pedido não é mais o dono do dinheiro: ele valida contra o saldo da conta do
 * cliente. O botão "Liberar por cobertura" é o CAMINHO NOVO — convive com o
 * portão antigo e não mexe nele.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import {
  useContaClienteCobertura,
  useLiberarPorCobertura,
} from "@/hooks/financeiro/useContaCliente";
import { Selo } from "@/components/ui/selo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  parceiroId: string | null | undefined;
  valorPedido: number | null | undefined;
  pedidoId?: string | null;
  estagio?: string | null;
}

export function CoberturaClienteCard({ parceiroId, valorPedido, pedidoId, estagio }: Props) {
  const { data: cob, isLoading, isError, error } = useContaClienteCobertura(parceiroId);
  const liberar = useLiberarPorCobertura();
  const [empenhado, setEmpenhado] = useState(false);
  const [rota, setRota] = useState<string | null>(null);

  if (!parceiroId) return null;

  if (isLoading) {
    return (
      <div className="rounded-md border border-border/60 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cobertura do cliente
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
        <p className="font-medium text-destructive">Cobertura do cliente indisponível</p>
        <p className="text-muted-foreground mt-0.5">{(error as any)?.message ?? "Falha ao consultar."}</p>
      </div>
    );
  }

  if (!cob) return null;

  const valor = Number(valorPedido ?? 0);
  const total = Number(cob.cobertura_total ?? 0);
  const cobre = valor > 0 ? total >= valor : total > 0;
  const falta = Math.max(0, valor - total);

  const estagioPermite = !!estagio && estagio !== "faturado" && estagio !== "cancelado";
  const podeLiberar = !!pedidoId && estagioPermite && cobre && !empenhado;

  async function liberarPorCobertura() {
    if (!pedidoId) return;
    setRota(null);
    try {
      const res = await liberar.mutateAsync({ pedido_id: pedidoId, parceiro_id: parceiroId });

      if (res.ja_empenhado) {
        setEmpenhado(true);
        return;
      }

      if (res.ok && res.coberto) {
        setEmpenhado(true);
        toast.success(
          `Cobertura empenhada: ${formatBRL(res.empenhado_saldo ?? 0)} de saldo + ${formatBRL(
            res.empenhado_limite ?? 0,
          )} de limite`,
        );
        return;
      }

      // ok: false com rota analise_credito NÃO é erro — é rota.
      if (!res.ok && res.rota === "analise_credito") {
        setRota(res.mensagem ?? "Rota: análise de crédito.");
        return;
      }

      throw new Error(res.erro || res.mensagem || "O banco recusou a liberação por cobertura.");
    } catch (e: any) {
      toast.error("Não foi possível liberar por cobertura", {
        description: e?.message ?? "Erro desconhecido.",
      });
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2",
        cobre ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Cobertura do cliente</span>
        <div className="flex items-center gap-1.5">
          {empenhado && <Selo estado="success">empenhado</Selo>}
          {cobre ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-lg font-semibold", cobre ? "text-success" : "text-warning")}>
          {formatBRL(total)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          pedido {formatBRL(valor)}
        </span>
      </div>

      {!cobre && (
        <p className="text-[11px] text-warning">
          falta {formatBRL(falta)} — rota: análise de crédito
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <dt>Saldo em conta</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte1_saldo_disponivel)}</dd>
        <dt>Limite disponível</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte3_limite_disponivel)}</dd>
        <dt>Em aberto</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.exposicao_em_aberto)}</dd>
        <dt>Vencido em aberto</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.vencido_em_aberto)}</dd>
      </dl>

      {cob.sinal_analise_credito && (
        <Selo estado="warning">sinal para análise de crédito</Selo>
      )}

      {rota && <p className="text-[11px] text-warning">{rota}</p>}

      {podeLiberar && (
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={liberarPorCobertura}
          disabled={liberar.isPending}
        >
          {liberar.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Liberar por cobertura
        </Button>
      )}
    </div>
  );
}
