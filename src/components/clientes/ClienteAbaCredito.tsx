/** Crédito do cliente — última análise decidida + limite disponível. Somente leitura. */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import { useAnaliseCreditoVigente } from "@/hooks/clientes/useClientePainel";
import { useContaClienteCobertura } from "@/hooks/financeiro/useContaCliente";

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

export function ClienteAbaCredito({ parceiroId }: { parceiroId: string }) {
  const analise = useAnaliseCreditoVigente(parceiroId);
  const cobertura = useContaClienteCobertura(parceiroId);

  return (
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
  );
}
