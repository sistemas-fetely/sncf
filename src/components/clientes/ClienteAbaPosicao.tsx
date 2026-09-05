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
import { useAnaliseCreditoVigente } from "@/hooks/clientes/useClientePainel";
import {
  useContaClienteCobertura,
  useContasClienteSaldo,
} from "@/hooks/financeiro/useContaCliente";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
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
            {cobertura.data.sinal_analise_credito && (
              <Selo estado="warning">sinal para análise de crédito</Selo>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="grid gap-3 md:grid-cols-2">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Limite hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
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
              <>
                <div>
                  <p className="text-[11px] text-muted-foreground">Crédito disponível</p>
                  <p className="text-2xl font-semibold">
                    {formatBRL(cobertura.data.fonte3_limite_disponivel)}
                  </p>
                </div>
                <Linha label="Limite vigente" value={formatBRL(cobertura.data.limite_vigente)} />
                <Linha
                  label="Exposição em aberto"
                  value={formatBRL(cobertura.data.exposicao_em_aberto)}
                />
                <Linha
                  label="Vencido em aberto"
                  value={formatBRL(cobertura.data.vencido_em_aberto)}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
