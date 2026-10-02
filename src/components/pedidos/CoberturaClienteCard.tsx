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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { supabase } from "@/integrations/supabase/client";
import {
  QK_CONTA_CLIENTE_COBERTURA,
  useContaClienteCobertura,
  useLiberarPorCobertura,
  usePoliticaCoberturaFinanceira,
} from "@/hooks/financeiro/useContaCliente";
import { Selo } from "@/components/ui/selo";
import { Button } from "@/components/ui/button";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { cn } from "@/lib/utils";

interface Props {
  parceiroId: string | null | undefined;
  valorPedido: number | null | undefined;
  pedidoId?: string | null;
  estagio?: string | null;
}

interface CreditoClienteLivre {
  registro_id: string;
  origem: string | null;
  saldo: number;
  descricao: string | null;
  recebido_em: string | null;
}

const QK_CREDITOS_CLIENTE_LIVRES = "creditos-cliente-livres";
const ESTAGIOS_APLICACAO_CREDITO = new Set([
  "recebido",
  "em_analise",
  "em_analise_credito",
  "cobranca",
  "aguardando_pagamento",
]);

const ROTULOS_ORIGEM: Record<string, string> = {
  devolucao: "Devolução",
  bonificacao: "Bonificação",
  sobra_pagamento: "Sobra de pagamento",
  adiantamento: "Adiantamento liberado",
};

function motivoLimiteInelegivel(formaAPrazo: boolean | null | undefined, classeMotivo: string | null | undefined) {
  if (formaAPrazo === false) return "não conta — pedido à vista";
  if (classeMotivo === "limite_zero") return "cliente sem limite concedido";
  if (classeMotivo === "limite_vencido") return "limite vencido";
  return classeMotivo?.split("_").join(" ") || "limite não elegível";
}

export function CoberturaClienteCard({ parceiroId, valorPedido, pedidoId, estagio }: Props) {
  const qc = useQueryClient();
  const { data: cob, isLoading, isError, error } = useContaClienteCobertura(parceiroId, pedidoId);
  const liberar = useLiberarPorCobertura();
  const { data: politica } = usePoliticaCoberturaFinanceira(estagio ?? null);
  const [empenhado, setEmpenhado] = useState(false);
  const [rota, setRota] = useState<string | null>(null);

  const creditosQ = useQuery({
    queryKey: [QK_CREDITOS_CLIENTE_LIVRES, parceiroId],
    enabled: !!parceiroId,
    queryFn: async (): Promise<CreditoClienteLivre[]> => {
      if (!parceiroId) return [];
      const { data, error: queryError } = await supabase
        .from("vw_credito_cliente_consolidado")
        .select("registro_id, origem, saldo, descricao, recebido_em")
        .eq("parceiro_id", parceiroId)
        .eq("natureza", "livre")
        .gt("saldo", 0)
        .order("recebido_em", { ascending: true });
      if (queryError) throw queryError;
      return (data ?? []) as CreditoClienteLivre[];
    },
  });

  const aplicarHaver = useMutation({
    mutationFn: async (haver: CreditoClienteLivre) => {
      if (!pedidoId) throw new Error("Pedido indisponível para aplicação do crédito.");
      const { data, error: mutationError } = await supabase.rpc("aplicar_haver_pedido", {
        p_haver_id: haver.registro_id,
        p_pedido_id: pedidoId,
      });
      if (mutationError) throw mutationError;
      return { resposta: (data ?? {}) as Record<string, unknown>, haver };
    },
    onSuccess: ({ resposta, haver }) => {
      const valorAplicado = Number(resposta.valor_aplicado ?? haver.saldo ?? 0);
      const diferenca = Number(resposta.diferenca ?? 0);
      const complemento =
        diferenca > 0
          ? ` — resta ${formatBRL(diferenca)} a cobrar — remonte o plano em Cobrança se já houver portão montado`
          : "";
      toast.success(`Crédito de ${formatBRL(valorAplicado)} aplicado${complemento}`);
      invalidarPedido(qc, pedidoId);
      qc.invalidateQueries({ queryKey: [QK_CONTA_CLIENTE_COBERTURA, parceiroId] });
      qc.invalidateQueries({ queryKey: [QK_CREDITOS_CLIENTE_LIVRES, parceiroId] });
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

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

  const detalhesCobertura = cob as typeof cob & {
    classe_motivo?: string | null;
    empenhos_vivos_saldo?: number | null;
    empenhos_vivos_limite?: number | null;
  };

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
  // REGRA ÚNICA DE LIBERAÇÃO: sem empenho prévio e cobertura para todo o valor
  // ainda necessário. O banco continua sendo a autoridade final da ação.
  const podeLiberar = !!pedidoId && empenhoPedido === 0 && total >= faltaEmpenhar && !empenhado;
  const empenhosOutros =
    Number(detalhesCobertura.empenhos_vivos_saldo ?? 0) +
    Number(detalhesCobertura.empenhos_vivos_limite ?? 0);
  const limiteElegivel = cob.fonte3_elegivel !== false;
  const podeAplicarCredito = !!pedidoId && ESTAGIOS_APLICACAO_CREDITO.has(estagio ?? "");

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
        <div className="group flex items-center gap-1.5">
          <span className="text-xs font-medium">Cobertura do cliente</span>
          <InfoMetrica rotulo="Cobertura do cliente">
            Cobertura = dinheiro na conta do cliente + limite de crédito (limite só vale em pedido a prazo).
          </InfoMetrica>
        </div>
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

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <dt>Dinheiro na conta</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte1_saldo_disponivel)}</dd>
        <dt>Limite de crédito</dt>
        <dd className="text-right">
          <span className={cn("text-foreground", !limiteElegivel && "line-through opacity-50") }>
            {formatBRL(cob.fonte3_limite_disponivel)}
          </span>
          {!limiteElegivel && (
            <span className="ml-1 text-muted-foreground">
              · {motivoLimiteInelegivel(cob.forma_a_prazo, detalhesCobertura.classe_motivo)}
            </span>
          )}
        </dd>
        {empenhosOutros > 0 && (
          <>
            <dt>Empenhado em outros pedidos</dt>
            <dd className="text-right text-foreground">{formatBRL(empenhosOutros)}</dd>
          </>
        )}
        {Number(cob.vencido_em_aberto ?? 0) > 0 && (
          <>
            <dt className="text-warning">Vencido em aberto</dt>
            <dd className="text-right font-medium text-warning">{formatBRL(cob.vencido_em_aberto)}</dd>
          </>
        )}
      </dl>

      {(creditosQ.data?.length ?? 0) > 0 && (
        <div className="border-t border-border/60 pt-2 space-y-2">
          <p className="text-xs font-medium">Crédito do cliente</p>
          {creditosQ.data?.map((haver) => {
            const origem = ROTULOS_ORIGEM[haver.origem ?? ""] ?? haver.origem?.split("_").join(" ") ?? "Crédito";
            const aplicandoEste = aplicarHaver.isPending && aplicarHaver.variables?.registro_id === haver.registro_id;
            return (
              <div key={haver.registro_id} className="rounded-md border border-border/60 bg-background/60 p-2 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{origem}</span>
                  <span className="shrink-0 text-sm font-semibold text-success">{formatBRL(haver.saldo)}</span>
                </div>
                {haver.descricao && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-[11px] text-muted-foreground">{haver.descricao}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{haver.descricao}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {podeAplicarCredito && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-xs"
                    disabled={aplicarHaver.isPending}
                    onClick={() => aplicarHaver.mutate(haver)}
                  >
                    {aplicandoEste && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Aplicar neste pedido
                  </Button>
                )}
              </div>
            );
          })}
          {!podeAplicarCredito && (
            <p className="text-[11px] text-muted-foreground" title="aplicação de crédito acontece antes do faturamento">
              Aplicação de crédito acontece antes do faturamento.
            </p>
          )}
        </div>
      )}

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
          {empenhoParcial ? "Completar empenho" : "Liberar por cobertura"}
        </Button>
      )}
      {!podeLiberar && valorConhecido && (
        <p className="text-[11px] text-muted-foreground">
          {empenhoPedido > 0 || empenhado
            ? `Este pedido já tem ${formatBRL(empenhoPedido || valor)} empenhado — a liberação já aconteceu/está na fila`
            : `Cobertura insuficiente — falta ${formatBRL(falta)}`}
        </p>
      )}
    </div>
  );
}
