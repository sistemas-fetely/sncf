/**
 * Card de Saúde do sistema de auditoria.
 * Doutrina: monitor cego não publica nota. Quando `confiavel` é false o card
 * some com o número e explica a supressão — nota alta por cegueira é mentira.
 * Eixo sem nota (null) NÃO é zero: barra tracejada e observação no lugar.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import {
  useHistoricoSaudeAuditoria,
  useSaudeAuditoria,
  type EixoSaude,
  type FaixaSaude,
} from "@/hooks/auditoria/useSaudeAuditoria";

const FAIXA_ROTULO: Record<FaixaSaude, string> = {
  saudavel: "Saudável",
  aceitavel: "Aceitável",
  atencao: "Atenção",
  critico: "Crítico",
  nao_confiavel: "Não confiável",
};

/** Cores por faixa, só tokens semânticos do projeto. */
const FAIXA_TEXTO: Record<FaixaSaude, string> = {
  saudavel: "text-success",
  aceitavel: "text-success/80",
  atencao: "text-warning",
  critico: "text-destructive",
  nao_confiavel: "text-muted-foreground",
};
const FAIXA_BARRA: Record<FaixaSaude, string> = {
  saudavel: "bg-success",
  aceitavel: "bg-success/70",
  atencao: "bg-warning",
  critico: "bg-destructive",
  nao_confiavel: "bg-muted-foreground",
};

function faixaDaNota(nota: number | null | undefined): FaixaSaude {
  if (nota == null) return "nao_confiavel";
  if (nota >= 85) return "saudavel";
  if (nota >= 70) return "aceitavel";
  if (nota >= 50) return "atencao";
  return "critico";
}

const num = (v: number | null | undefined, casas = 1) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

function BarraEixo({
  nome,
  eixo,
  cinza,
}: {
  nome: string;
  eixo: EixoSaude;
  cinza?: boolean;
}) {
  const avaliavel = eixo.nota != null;
  const faixa = cinza ? "nao_confiavel" : faixaDaNota(eixo.nota);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {nome} · {Math.round((eixo.peso ?? 0) * 100)}%
        </span>
        {avaliavel ? (
          <span className={`text-xs font-semibold tabular-nums ${FAIXA_TEXTO[faixa]}`}>
            {num(eixo.nota)}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">não avaliável</span>
        )}
      </div>
      {avaliavel ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${FAIXA_BARRA[faixa]}`}
            style={{ width: `${Math.max(0, Math.min(100, eixo.nota as number))}%` }}
          />
        </div>
      ) : (
        <div className="h-2 w-full rounded-full border border-dashed border-border" />
      )}
      {!avaliavel && eixo.observacao && (
        <p className="text-[11px] leading-snug text-muted-foreground">{eixo.observacao}</p>
      )}
    </div>
  );
}

export default function CardSaudeAuditoria() {
  const [aberto, setAberto] = useState(false);
  const { data, isLoading, isError, error } = useSaudeAuditoria();
  const historico = useHistoricoSaudeAuditoria(aberto);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <Skeleton className="h-16 w-40" />
            <div className="space-y-3">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-start gap-2 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">
              Não foi possível calcular a saúde do sistema
            </p>
            <p className="text-xs text-muted-foreground">{formatError(error)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cinza = !data.confiavel;
  const faixa: FaixaSaude = cinza ? "nao_confiavel" : (data.faixa ?? faixaDaNota(data.nota));
  const g = data.eixos.gravidade;
  const t = data.eixos.tratamento;
  const e = data.eixos.envelhecimento;
  const c = data.eixos.confiabilidade;
  const serie = (historico.data ?? []).filter((p) => p.nota != null);

  return (
    <Card className={cinza ? "bg-muted/40" : undefined}>
      <Collapsible open={aberto} onOpenChange={setAberto}>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="w-full text-left"
          aria-expanded={aberto}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Saúde do sistema
              </p>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
              />
            </div>

            {cinza ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Saúde não confiável
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.motivo_supressao ??
                      "O motor não tem cobertura suficiente para publicar uma nota."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid items-center gap-5 md:grid-cols-[220px_1fr]">
                <div>
                  <div className="flex items-end gap-1">
                    <span className={`text-4xl font-semibold tabular-nums ${FAIXA_TEXTO[faixa]}`}>
                      {num(data.nota)}
                    </span>
                    <span className="pb-1 text-xs text-muted-foreground">/100</span>
                  </div>
                  <p className={`text-sm font-medium ${FAIXA_TEXTO[faixa]}`}>
                    {FAIXA_ROTULO[faixa]}
                  </p>
                  {data.variacao_7d != null ? (
                    <p
                      className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                        data.variacao_7d >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {data.variacao_7d >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {num(Math.abs(data.variacao_7d))} pts em 7 dias
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      sem histórico ainda
                    </p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <BarraEixo nome="Gravidade" eixo={g} />
                  <BarraEixo nome="Tratamento" eixo={t} />
                  <BarraEixo nome="Envelhecimento" eixo={e} />
                  <BarraEixo nome="Confiabilidade" eixo={c} />
                </div>
              </div>
            )}
          </CardContent>
        </button>

        <CollapsibleContent>
          <CardContent className="space-y-5 border-t pt-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Decomposição da gravidade
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Dinheiro (60% do eixo)</p>
                  <p className="text-lg font-semibold tabular-nums">{num(g.dinheiro)}</p>
                  <p className="text-xs text-muted-foreground">
                    Valor vivo: {formatBRL(Number(data.contexto.valor_vivo || 0))}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Severidade (40% do eixo)</p>
                  <p className="text-lg font-semibold tabular-nums">{num(g.severidade)}</p>
                  <p className="text-xs text-muted-foreground">
                    Penalidade: {num(g.penalidade_pontos)} pontos
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">Gravidade</p>
                <p className="text-xs text-muted-foreground">
                  {data.contexto.achados_vivos} vivos · {data.contexto.bloqueantes} bloqueantes ·{" "}
                  {data.contexto.atencao} atenção · {data.contexto.informativo} informativo
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">Tratamento</p>
                <p className="text-xs text-muted-foreground">
                  {t.tocados ?? 0} tocados de {t.elegiveis ?? 0} elegíveis
                </p>
                {t.nota == null && t.observacao && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{t.observacao}</p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">Envelhecimento</p>
                <p className="text-xs text-muted-foreground">
                  Idade média: {num(e.idade_media_dias)} dias
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs font-medium">Confiabilidade</p>
                <p className="text-xs text-muted-foreground">
                  {c.regras_ok ?? 0} ok de {c.regras_ativas ?? 0} ativas ·{" "}
                  {c.regras_bloqueadas ?? 0} bloqueadas
                </p>
                <p className="text-xs text-muted-foreground">
                  Última execução há {num(c.horas_ultima_execucao)} h · frescor{" "}
                  {num(c.fator_frescor, 2)}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nota ao longo do tempo
              </p>
              {historico.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : historico.isError ? (
                <p className="text-xs text-destructive">
                  Falha ao carregar o histórico: {formatError(historico.error)}
                </p>
              ) : serie.length < 2 ? (
                <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                  Histórico começa hoje — a tendência aparece a partir de amanhã.
                </p>
              ) : (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={serie.map((p) => ({
                        dia: String(p.dia ?? p.medido_em).slice(0, 10),
                        nota: Number(p.nota),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                      <Tooltip
                        formatter={(v: number) => [num(v), "Nota"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="nota"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground">
              {data.contexto.ancora.aviso} Âncora: nota {num(data.contexto.ancora.nota, 0)} calibrada
              em{" "}
              {String(data.contexto.ancora.data).slice(0, 10).split("-").reverse().join("/")}. A nota
              absoluta é uma convenção; o que é real é o movimento.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
