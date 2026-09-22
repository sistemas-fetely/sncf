/**
 * Cobertura do cliente.
 *
 * O pedido não é mais o dono do dinheiro: ele valida contra o saldo da conta do
 * cliente. O botão "Liberar por cobertura" é PRÉ-RESERVA MANUAL — o empenho
 * acontece sozinho na descida para pré-separação (guarda em `transicionar_pedido`,
 * desde 10/09) — e convive com o portão antigo, sem mexer nele.
 *
 * O card lê o empenho vivo do pedido via `empenho_deste_pedido` para não
 * oferecer ato sem efeito: pedido já empenhado não mostra o botão.
 *
 * DIMENSÃO-VIA-TABELA: quando o card aparece e se libera não é decisão dele —
 * quem decide é `politica_cobertura_financeira_estagio`, lida pelo estágio.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import {
  useContaClienteCobertura,
  useLiberarPorCobertura,
  usePoliticaCoberturaFinanceira,
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
  const { data: cob, isLoading, isError, error } = useContaClienteCobertura(parceiroId, pedidoId);
  const liberar = useLiberarPorCobertura();
  const { data: politica } = usePoliticaCoberturaFinanceira(estagio ?? null);
  const [empenhado, setEmpenhado] = useState(false);
  const [rota, setRota] = useState<string | null>(null);

  if (!parceiroId) return null;

  if (politica && (politica.modo === "oculto" || !politica.mostra_card)) return null;

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
  const valorConhecido = valor > 0;
  // EMPENHO-AUTOMATICO: a descida para pré-separação já empenha sozinha. A RPC
  // devolve quanto DESTE pedido está empenhado (conta_cliente_empenho vivo).
  const empenhoPedido = Number(cob.empenho_deste_pedido ?? 0);
  const jaEmpenhadoIntegral = valorConhecido && empenhoPedido >= valor;
  const faltaEmpenhar = Math.max(0, valor - empenhoPedido); // o que ainda precisa ser empenhado
  // cobertura_total já desconta o empenho do próprio pedido — comparar contra o
  // valor cheio contava o próprio empenho como falta.
  const cobre = valorConhecido && (jaEmpenhadoIntegral || total >= faltaEmpenhar);
  const falta = Math.max(0, faltaEmpenhar - total);
  const empenhoParcial = empenhoPedido > 0 && empenhoPedido < valor;

  // Política no comando: sem modo 'decisao' (ou enquanto ela carrega) o botão
  // não existe — card em modo informativo/read-only. Sum também quando nada
  // resta a empenhar: oferecer o ato seria botão sem efeito.
  const modoDecisao = politica?.modo === "decisao";
  const podeLiberar =
    !!pedidoId && modoDecisao && politica.permite_liberar && cobre && !empenhado && !jaEmpenhadoIntegral;

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

      // ok: false com rota NÃO é erro — é rota. FALTA-TEM-DONO: cada falta tem
      // seu dono e a mensagem diz quem é, sem toast de erro.
      if (!res.ok && (res.rota === "analise_credito" || res.rota === "aguardar_deposito" || res.rota === "manutencao_indice")) {
        setRota(res.mensagem ?? "Rota informada pelo banco.");
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
        !valorConhecido
          ? "border-border/60 bg-muted/30"
          : cobre
            ? "border-success/40 bg-success/5"
            : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Cobertura do cliente</span>
        <div className="flex items-center gap-1.5">
          {(jaEmpenhadoIntegral || empenhado) && <Selo estado="success">empenhado</Selo>}
          {valorConhecido &&
            (cobre ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ))}
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-lg font-semibold",
            !valorConhecido ? "text-muted-foreground" : cobre ? "text-success" : "text-warning",
          )}
        >
          {formatBRL(total)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          pedido {formatBRL(valor)}
        </span>
      </div>

      {!valorConhecido && (
        <p className="text-[11px] text-muted-foreground">
          valor do pedido indisponível — cobertura não avaliada
        </p>
      )}
      {valorConhecido && !cobre && (
        <p className="text-[11px] text-warning">
          {cob.classe === "portao"
            ? `falta ${formatBRL(falta)} — rota: aguardar depósito`
            : `falta ${formatBRL(falta)} — rota: análise de crédito`}
        </p>
      )}
      {cob.forma_a_prazo === false && cob.fonte3_elegivel === false && (
        <p className="text-[11px] text-muted-foreground">
          pedido à vista — limite de crédito não conta como cobertura
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {empenhoPedido > 0 && (
          <>
            <dt>Empenhado neste pedido</dt>
            <dd className="text-right text-foreground">{formatBRL(empenhoPedido)}</dd>
          </>
        )}
        <dt>Saldo disponível</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte1_saldo_disponivel)}</dd>
        <dt>Limite disponível</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte3_limite_disponivel)}</dd>
        <dt>Exposição em aberto</dt>
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
