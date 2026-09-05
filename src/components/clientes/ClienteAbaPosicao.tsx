/**
 * Posição e Crédito do cliente. DUAS PERGUNTAS DIFERENTES, rotuladas de propósito:
 *  - "Saldo da conta"      = dinheiro que já entrou e ainda não foi consumido.
 *  - "Crédito disponível"  = limite aprovado que ainda não foi usado.
 * Confundir as duas foi a origem das cinco telas divergentes.
 */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { Separator } from "@/components/ui/separator";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { useAnaliseCreditoVigente, useKpiCliente } from "@/hooks/clientes/useClientePainel";
import {
  useContaClienteCobertura,
  useContasClienteSaldo,
} from "@/hooks/financeiro/useContaCliente";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function Barra({ pct, tom }: { pct: number; tom: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn("h-full rounded-full", tom)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  legenda,
  tom,
}: {
  rotulo: string;
  valor: string;
  legenda?: string;
  tom?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 p-2.5">
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={cn("text-sm font-medium", tom)}>{valor}</p>
      {legenda && <p className="text-[10px] text-muted-foreground">{legenda}</p>}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

export function ClienteAbaPosicao({ parceiroId }: { parceiroId: string }) {
  const saldos = useContasClienteSaldo();
  const cobertura = useContaClienteCobertura(parceiroId);
  const analise = useAnaliseCreditoVigente(parceiroId);
  const kpi = useKpiCliente(parceiroId);

  const k = kpi.data ?? null;
  const nDias = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} dias`);
  const nPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
  const temLimite = Number(k?.limite_concedido ?? 0) > 0;
  const utilizacao = k?.utilizacao_limite_pct;
  const titulosPagos = Number(k?.titulos_pagos ?? 0);

  const conta = (saldos.data ?? []).find((c) => c.parceiro_id === parceiroId) ?? null;
  const saldo = Number(conta?.saldo ?? 0);
  const creditoDisponivel = Number(cobertura.data?.fonte3_limite_disponivel ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border/60 p-3">
          <p className="text-[11px] text-muted-foreground">Saldo da conta</p>
          <p
            className={cn(
              "text-2xl font-semibold",
              saldo > 0 ? "text-success" : saldo < 0 ? "text-warning" : "",
            )}
          >
            {saldos.isError ? "—" : formatBRL(saldo)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            dinheiro do cliente já reconhecido —{" "}
            {saldo > 0 ? "crédito a favor dele" : saldo < 0 ? "ele está devendo" : "conta zerada"}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-3">
          <p className="text-[11px] text-muted-foreground">Crédito disponível</p>
          <p className="text-2xl font-semibold">
            {cobertura.isError ? "—" : formatBRL(creditoDisponivel)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            limite aprovado ainda não usado — não é dinheiro na conta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Vencido em aberto</p>
          <p className="text-sm font-medium text-destructive">
            {formatBRL(conta?.vencido_em_aberto ?? 0)}
          </p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">A vencer</p>
          <p className="text-sm font-medium">{formatBRL(conta?.a_vencer ?? 0)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Crédito futuro (boleto)</p>
          <p className="text-sm font-medium">{formatBRL(conta?.credito_futuro_boleto ?? 0)}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Última movimentação</p>
          <p className="text-sm font-medium">{dataBR(conta?.ultima_movimentacao)}</p>
        </div>
      </div>

      {/* AGING — só existe quando há vencido em aberto. Substitui a tela
          "Vencimentos x Cliente", desativada no banco. */}
      {Number(conta?.vencido_em_aberto ?? 0) > 0 && (
        <div className="rounded-md border border-border/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium">Aging do vencido</p>
            <p className="text-[11px] text-muted-foreground">
              atraso máximo: {Number(conta?.dias_atraso_max ?? 0)} dias
              {conta?.qtd_titulos_abertos != null
                ? ` · ${conta.qtd_titulos_abertos} título(s) em aberto`
                : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { rotulo: "1–7 dias", valor: conta?.faixa_1_7 },
              { rotulo: "8–30", valor: conta?.faixa_8_30 },
              { rotulo: "31–60", valor: conta?.faixa_31_60 },
              { rotulo: "+60", valor: conta?.faixa_60_mais },
            ].map((f) => (
              <div key={f.rotulo} className="rounded-md bg-muted/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">{f.rotulo}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    Number(f.valor ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {formatBRL(f.valor ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-medium">Cobertura para novos pedidos</p>
        {cobertura.isLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> consultando
          </p>
        )}
        {cobertura.isError && (
          <p className="text-xs text-destructive">
            {(cobertura.error as any)?.message ?? "Falha ao consultar a cobertura."}
          </p>
        )}
        {cobertura.data && (
          <div className="rounded-md border border-border/60 p-3 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">
                {formatBRL(cobertura.data.cobertura_total)}
              </span>
              <span className="text-[11px] text-muted-foreground">cobertura total</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <dt>Saldo disponível</dt>
              <dd className="text-right text-foreground">
                {formatBRL(cobertura.data.fonte1_saldo_disponivel)}
              </dd>
              <dt>Limite vigente</dt>
              <dd className="text-right text-foreground">
                {formatBRL(cobertura.data.limite_vigente)}
              </dd>
              <dt>Limite disponível</dt>
              <dd className="text-right text-foreground">
                {formatBRL(cobertura.data.fonte3_limite_disponivel)}
              </dd>
              <dt>Exposição em aberto</dt>
              <dd className="text-right text-foreground">
                {formatBRL(cobertura.data.exposicao_em_aberto)}
              </dd>
            </dl>
            {temLimite && utilizacao != null && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Utilização do limite</span>
                  <span className="font-medium">{nPct(utilizacao)}</span>
                </div>
                <Barra
                  pct={utilizacao}
                  tom={
                    utilizacao >= 80
                      ? "bg-destructive"
                      : utilizacao >= 50
                        ? "bg-warning"
                        : "bg-success"
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  do limite aprovado já comprometido
                </p>
              </div>
            )}
            {cobertura.data.sinal_analise_credito && (
              <Selo estado="warning">sinal para análise de crédito</Selo>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-medium">Comportamento de pagamento</p>
        {kpi.isLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> carregando
          </p>
        )}
        {!kpi.isLoading && titulosPagos === 0 && (
          <p className="text-xs text-muted-foreground">Sem histórico de pagamento ainda.</p>
        )}
        {!kpi.isLoading && titulosPagos > 0 && k && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="rounded-md border border-border/60 p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">Pontualidade</p>
                  <p className="text-sm font-medium">{nPct(k.pontualidade_pct)}</p>
                </div>
                {k.pontualidade_pct != null && (
                  <Barra
                    pct={k.pontualidade_pct}
                    tom={
                      k.pontualidade_pct >= 80
                        ? "bg-success"
                        : k.pontualidade_pct >= 50
                          ? "bg-warning"
                          : "bg-destructive"
                    }
                  />
                )}
                <p className="text-[10px] text-muted-foreground">
                  títulos pagos até o vencimento
                </p>
              </div>
              <Indicador
                rotulo="Prazo médio de recebimento"
                valor={nDias(k.pmr_dias)}
                legenda="do faturamento até o pagamento"
              />
              <Indicador
                rotulo="Prazo médio concedido"
                valor={nDias(k.prazo_medio_concedido)}
                legenda="prazo que damos a ele"
              />
              <Indicador
                rotulo="Atraso médio"
                valor={
                  k.atraso_medio_dias == null
                    ? "—"
                    : Math.round(k.atraso_medio_dias) < 0
                      ? `${Math.abs(Math.round(k.atraso_medio_dias))} dias adiantado`
                      : Math.round(k.atraso_medio_dias) > 0
                        ? `${Math.round(k.atraso_medio_dias)} dias de atraso`
                        : "em dia"
                }
                tom={
                  k.atraso_medio_dias == null || Math.round(k.atraso_medio_dias) === 0
                    ? undefined
                    : k.atraso_medio_dias < 0
                      ? "text-success"
                      : "text-destructive"
                }
              />
              {Number(k.pior_atraso_dias ?? 0) > 0 && (
                <Indicador
                  rotulo="Pior atraso"
                  valor={nDias(k.pior_atraso_dias)}
                  tom="text-destructive"
                />
              )}
              {Number(k.pagamento_antecipado_pct ?? 0) > 0 && (
                <Indicador
                  rotulo="Pagamento antecipado"
                  valor={nPct(k.pagamento_antecipado_pct)}
                  legenda="paga antes de faturar"
                />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">base: {titulosPagos} títulos pagos</p>
          </>
        )}
      </div>

      {k && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Relacionamento</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Indicador
              rotulo="Ticket médio"
              valor={k.ticket_medio == null ? "—" : formatBRL(k.ticket_medio)}
            />
            <Indicador
              rotulo="Pedidos faturados"
              valor={k.pedidos_faturados == null ? "—" : String(k.pedidos_faturados)}
            />
            <Indicador
              rotulo="Total faturado"
              valor={k.total_faturado == null ? "—" : formatBRL(k.total_faturado)}
            />
            <Indicador rotulo="Cliente desde" valor={dataBR(k.primeira_compra)} />
            <Indicador
              rotulo="Última compra"
              valor={dataBR(k.ultima_compra)}
              legenda={
                k.dias_desde_ultima_compra == null
                  ? undefined
                  : `há ${Math.round(k.dias_desde_ultima_compra)} dias`
              }
            />
          </div>
        </div>
      )}

      <Separator />

      <div className="grid gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Última análise decidida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {analise.isLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> carregando
              </p>
            )}
            {analise.isError && (
              <p className="text-xs text-destructive">
                {(analise.error as any)?.message ?? "Falha ao carregar a análise."}
              </p>
            )}
            {!analise.isLoading && !analise.isError && !analise.data && (
              <p className="text-xs text-muted-foreground">
                Este cliente não tem análise de crédito decidida.
              </p>
            )}
            {analise.data && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm">Decisão</span>
                  <Selo
                    estado={
                      analise.data.status_final === "aprovado"
                        ? "success"
                        : analise.data.status_final === "reprovado"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {analise.data.status_final ?? "—"}
                  </Selo>
                </div>
                <Linha
                  label="Limite concedido"
                  value={
                    analise.data.limite_concedido == null
                      ? null
                      : formatBRL(analise.data.limite_concedido)
                  }
                />
                <Linha
                  label="Prazo máximo"
                  value={
                    analise.data.prazo_max_dias == null
                      ? null
                      : `${analise.data.prazo_max_dias} dias`
                  }
                />
                <Linha label="Validade" value={dataBR(analise.data.validade_ate)} />
                <Linha label="Perfil aplicado" value={analise.data.perfil_aplicado} />
                <Linha label="Decidida em" value={dataBR(analise.data.decidido_em)} />
                {analise.data.ressalva && (
                  <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
                    <p className="text-[11px] font-medium text-warning">Ressalva</p>
                    <p className="text-[11px] text-muted-foreground">{analise.data.ressalva}</p>
                  </div>
                )}
                {analise.data.parecer_final && (
                  <div className="rounded-md border border-border/60 p-2.5">
                    <p className="text-[11px] font-medium">Parecer</p>
                    <p className="text-[11px] text-muted-foreground whitespace-pre-line">
                      {analise.data.parecer_final}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
