/**
 * Posição e Crédito do cliente. DUAS PERGUNTAS DIFERENTES, rotuladas de propósito:
 *  - "Saldo da conta"      = dinheiro que já entrou e ainda não foi consumido.
 *  - "Crédito disponível"  = limite aprovado que ainda não foi usado.
 * Confundir as duas foi a origem das cinco telas divergentes.
 *
 * Tipografia segue o Sistema Visual Fetély v2: rótulo 11px em muted-foreground
 * acima, número 21px abaixo (herói maior), título de seção 15px peso 500.
 * Pesos: só 400 e 500. Número é tipografia: tabular-nums, alinhado à direita.
 * Cor em indicador entra como régua lateral de 3px, nunca fundo ou texto solto.
 */
import { Loader2 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  useAnaliseCreditoVigente,
  useKpiCliente,
  useProdutosCliente,
  useRecompraCliente,
  useSerieMensalCliente,
} from "@/hooks/clientes/useClientePainel";
import {
  useContaClienteCobertura,
  useContasClienteSaldo,
} from "@/hooks/financeiro/useContaCliente";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Régua lateral de 3px no token do estado. Sem fundo, sem texto colorido. */
type Regua = "success" | "warning" | "destructive" | undefined;
const REGUA: Record<Exclude<Regua, undefined>, string> = {
  success: "border-l-[3px] border-l-success",
  warning: "border-l-[3px] border-l-warning",
  destructive: "border-l-[3px] border-l-destructive",
};

function TituloSecao({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-medium leading-tight">{children}</h3>;
}

function Barra({ pct, tom }: { pct: number; tom: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
  regua,
  heroi,
  children,
}: {
  rotulo: string;
  valor: string;
  legenda?: string;
  regua?: Regua;
  heroi?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-card p-3",
        regua && REGUA[regua],
      )}
    >
      <p className="text-[11px] font-normal text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "font-medium tabular-nums",
          heroi ? "text-[32px] leading-[1.15]" : "text-[21px] leading-[1.2]",
        )}
      >
        {valor}
      </p>
      {legenda && (
        <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">{legenda}</p>
      )}
      {children}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]">
      <span className="font-normal text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{value || "—"}</span>
    </div>
  );
}

const FAIXAS = [
  { chave: "faixa_1_7", rotulo: "1–7 dias", cor: "bg-warning/40" },
  { chave: "faixa_8_30", rotulo: "8–30 dias", cor: "bg-warning/70" },
  { chave: "faixa_31_60", rotulo: "31–60 dias", cor: "bg-destructive/60" },
  { chave: "faixa_60_mais", rotulo: "+60 dias", cor: "bg-destructive" },
] as const;

function TooltipSerie({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-[11px] shadow-none">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex justify-between gap-4">
          <span className="font-normal text-muted-foreground">{p.name}</span>
          <span className="tabular-nums">{formatBRL(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export function ClienteAbaPosicao({ parceiroId }: { parceiroId: string }) {
  const saldos = useContasClienteSaldo();
  const cobertura = useContaClienteCobertura(parceiroId);
  const analise = useAnaliseCreditoVigente(parceiroId);
  const kpi = useKpiCliente(parceiroId);
  const serie = useSerieMensalCliente(parceiroId);
  const produtos = useProdutosCliente(parceiroId);
  const recompra = useRecompraCliente(parceiroId);

  const k = kpi.data ?? null;
  const nDias = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} dias`);
  const nPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
  const temLimite = Number(k?.limite_concedido ?? 0) > 0;
  const utilizacao = k?.utilizacao_limite_pct;
  const titulosPagos = Number(k?.titulos_pagos ?? 0);

  const conta = (saldos.data ?? []).find((c) => c.parceiro_id === parceiroId) ?? null;
  const saldo = Number(conta?.saldo ?? 0);
  const creditoDisponivel = Number(cobertura.data?.fonte3_limite_disponivel ?? 0);
  const vencido = Number(conta?.vencido_em_aberto ?? 0);

  const dados = serie.data ?? [];
  const r = recompra.data ?? null;
  const primeiraCompra = Number(r?.compras ?? 0) < 2;
  const coresPizza = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--chart-1) / 0.65)",
    "hsl(var(--chart-2) / 0.65)",
    "hsl(var(--chart-3) / 0.65)",
    "hsl(var(--chart-4) / 0.65)",
  ];
  const COR_OUTROS = "hsl(var(--muted-foreground))";

  const linhas = produtos.data ?? [];
  const montarFatias = (eixo: "familia" | "colecao", topo: number | null) => {
    const base = linhas
      .filter((l) => l.eixo === eixo)
      .sort((a, b) => b.valor - a.valor)
      .map((l) => ({ nome: l.grupo, valor: l.valor, recomprado: !!l.recomprado }));
    if (topo == null || base.length <= topo) return base;
    const resto = base.slice(topo);
    return [
      ...base.slice(0, topo),
      {
        nome: "Outros",
        valor: resto.reduce((t, i) => t + i.valor, 0),
        recomprado: false,
      },
    ];
  };
  const fatiasFamilia = montarFatias("familia", null);
  const fatiasColecao = montarFatias("colecao", 8);
  const corFatia = (nome: string, index: number) =>
    nome === "Outros" ? COR_OUTROS : coresPizza[index % coresPizza.length];

  const faixas = FAIXAS.map((f) => ({
    ...f,
    valor: Number((conta as any)?.[f.chave] ?? 0),
  }));
  const totalFaixas = faixas.reduce((s, f) => s + f.valor, 0);

  return (
    <div className="space-y-4">
      {/* FAIXA 1 — herói: as duas perguntas de dinheiro */}
      <div className="grid gap-[10px] lg:grid-cols-2">
        <Indicador
          heroi
          rotulo="Saldo da conta"
          valor={saldos.isError ? "—" : formatBRL(saldo)}
          regua={saldo < 0 ? "destructive" : undefined}
          legenda={`dinheiro do cliente já reconhecido — ${
            saldo > 0 ? "crédito a favor dele" : saldo < 0 ? "ele está devendo" : "conta zerada"
          }`}
        />
        <Indicador
          heroi
          rotulo="Crédito disponível"
          valor={cobertura.isError ? "—" : formatBRL(creditoDisponivel)}
          legenda="limite aprovado ainda não usado — não é dinheiro na conta"
        />
      </div>

      {/* FAIXA 2 — secundários */}
      <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
        <Indicador
          rotulo="Vencido em aberto"
          valor={formatBRL(vencido)}
          regua={vencido > 0 ? "destructive" : undefined}
        />
        <Indicador rotulo="A vencer" valor={formatBRL(conta?.a_vencer ?? 0)} />
        <Indicador
          rotulo="Crédito futuro (boleto)"
          valor={formatBRL(conta?.credito_futuro_boleto ?? 0)}
        />
        <Indicador rotulo="Última movimentação" valor={dataBR(conta?.ultima_movimentacao)} />
      </div>

      {/* COBERTURA */}
      <div className="space-y-3">
        <TituloSecao>Cobertura para novos pedidos</TituloSecao>
        {cobertura.isLoading && (
          <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> consultando
          </p>
        )}
        {cobertura.isError && (
          <p className="text-[13px] font-normal text-destructive">
            {(cobertura.error as any)?.message ?? "Falha ao consultar a cobertura."}
          </p>
        )}
        {cobertura.data && (
          <div className="grid gap-[10px] lg:grid-cols-3">
            <Indicador
              rotulo="Cobertura total"
              valor={formatBRL(cobertura.data.cobertura_total)}
              legenda="o quanto ainda dá para liberar"
            >
              {cobertura.data.sinal_analise_credito && (
                <div className="pt-2">
                  <Selo estado="warning">sinal para análise de crédito</Selo>
                </div>
              )}
            </Indicador>
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-normal text-muted-foreground">
                <dt>Saldo disponível</dt>
                <dd className="text-right text-[13px] tabular-nums text-foreground">
                  {formatBRL(cobertura.data.fonte1_saldo_disponivel)}
                </dd>
                <dt>Limite vigente</dt>
                <dd className="text-right text-[13px] tabular-nums text-foreground">
                  {formatBRL(cobertura.data.limite_vigente)}
                </dd>
                <dt>Limite disponível</dt>
                <dd className="text-right text-[13px] tabular-nums text-foreground">
                  {formatBRL(cobertura.data.fonte3_limite_disponivel)}
                </dd>
                <dt>Exposição em aberto</dt>
                <dd className="text-right text-[13px] tabular-nums text-foreground">
                  {formatBRL(cobertura.data.exposicao_em_aberto)}
                </dd>
              </dl>
            </div>
            {temLimite && utilizacao != null && (
              <Indicador
                rotulo="Utilização do limite"
                valor={nPct(utilizacao)}
                legenda="do limite aprovado já comprometido"
                regua={utilizacao >= 80 ? "destructive" : utilizacao >= 50 ? "warning" : undefined}
              >
                <div className="pt-2">
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
                </div>
              </Indicador>
            )}
          </div>
        )}
      </div>

      {/* COMPORTAMENTO DE PAGAMENTO */}
      <div className="space-y-3">
        <TituloSecao>Comportamento de pagamento</TituloSecao>
        {kpi.isLoading && (
          <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> carregando
          </p>
        )}
        {!kpi.isLoading && titulosPagos === 0 && (
          <p className="text-[13px] font-normal text-muted-foreground">
            Sem histórico de pagamento ainda.
          </p>
        )}
        {!kpi.isLoading && titulosPagos > 0 && k && (
          <>
            <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4 xl:grid-cols-6">
              <Indicador
                rotulo="Pontualidade"
                valor={nPct(k.pontualidade_pct)}
                legenda="títulos pagos até o vencimento"
                regua={
                  k.pontualidade_pct == null
                    ? undefined
                    : k.pontualidade_pct < 50
                      ? "destructive"
                      : k.pontualidade_pct < 80
                        ? "warning"
                        : undefined
                }
              >
                {k.pontualidade_pct != null && (
                  <div className="pt-2">
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
                  </div>
                )}
              </Indicador>
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
                regua={
                  k.atraso_medio_dias != null && Math.round(k.atraso_medio_dias) > 0
                    ? "destructive"
                    : undefined
                }
              />
              {Number(k.pior_atraso_dias ?? 0) > 0 && (
                <Indicador
                  rotulo="Pior atraso"
                  valor={nDias(k.pior_atraso_dias)}
                  regua="destructive"
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
            <p className="text-[11px] font-normal tabular-nums text-muted-foreground">
              base: {titulosPagos} títulos pagos
            </p>
          </>
        )}
      </div>

      {/* RELACIONAMENTO */}
      {k && (
        <div className="space-y-3">
          <TituloSecao>Relacionamento</TituloSecao>
          <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4 xl:grid-cols-8">
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
            <Indicador
              rotulo="Intervalo médio de recompra"
              valor={primeiraCompra || r?.intervalo_medio_dias == null ? "—" : nDias(r.intervalo_medio_dias)}
              legenda={primeiraCompra ? "primeira compra" : undefined}
            />
            <Indicador
              rotulo="Próxima compra estimada"
              valor={primeiraCompra ? "—" : dataBR(r?.proxima_compra_estimada)}
              legenda={primeiraCompra ? "primeira compra" : r?.atrasado_recompra ? "recompra atrasada" : undefined}
              regua={r?.atrasado_recompra ? "warning" : undefined}
            />
            <Indicador
              rotulo="Coleções recompradas"
              valor={
                r?.colecoes_recompradas == null || r?.colecoes_distintas == null
                  ? "—"
                  : `${r.colecoes_recompradas} de ${r.colecoes_distintas}`
              }
            />

          </div>
        </div>
      )}

      {/* GRÁFICOS — linha 1: movimento (largura total) */}
      <div className="grid gap-[10px]">

        <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
          <TituloSecao>Movimento dos últimos meses</TituloSecao>
          {serie.isLoading && (
            <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando
            </p>
          )}
          {!serie.isLoading && dados.length < 2 && (
            <p className="text-[13px] font-normal text-muted-foreground">Histórico curto demais para gráfico.</p>
          )}
          {!serie.isLoading && dados.length >= 2 && (
            <>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dados} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                    <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(Number(v))} />
                    <Tooltip content={<TooltipSerie />} />
                    <Bar dataKey="faturado" name="Faturado" fill="hsl(var(--muted-foreground))" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="recebido" name="Recebido" fill="hsl(var(--success))" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="saldo_acumulado" name="Saldo acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-normal text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Faturado</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success/75" /> Recebido</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-primary" /> Saldo acumulado</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* GRÁFICOS — linha 2: composição por família e por coleção */}
      <div className="grid gap-[10px] lg:grid-cols-2">
        <Donut titulo="Compra por família" fatias={fatiasFamilia} carregando={produtos.isLoading} cor={corFatia} />
        <Donut titulo="Compra por coleção" fatias={fatiasColecao} carregando={produtos.isLoading} cor={corFatia} />
      </div>


      {/* AGING — barra empilhada única, só quando há vencido */}
      {vencido > 0 && totalFaixas > 0 && (
        <div className="space-y-3">
          <TituloSecao>Aging do vencido</TituloSecao>
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[21px] font-medium leading-[1.2] tabular-nums">
                {formatBRL(vencido)}
              </p>
              <p className="text-[11px] font-normal tabular-nums text-muted-foreground">
                atraso máximo: {Number(conta?.dias_atraso_max ?? 0)} dias
                {conta?.qtd_titulos_abertos != null
                  ? ` · ${conta.qtd_titulos_abertos} título(s) em aberto`
                  : ""}
              </p>
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {faixas.map((f) =>
                f.valor > 0 ? (
                  <div
                    key={f.chave}
                    className={f.cor}
                    style={{ width: `${(f.valor / totalFaixas) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {faixas.map((f) => (
                <span
                  key={f.chave}
                  className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground"
                >
                  <span className={cn("h-2 w-2 rounded-sm", f.cor)} />
                  {f.rotulo}
                  <span className="tabular-nums text-foreground">{formatBRL(f.valor)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ANÁLISE DE CRÉDITO */}
      <Card className="bg-card shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px] font-medium">Última análise decidida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {analise.isLoading && (
            <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando
            </p>
          )}
          {analise.isError && (
            <p className="text-[13px] font-normal text-destructive">
              {(analise.error as any)?.message ?? "Falha ao carregar a análise."}
            </p>
          )}
          {!analise.isLoading && !analise.isError && !analise.data && (
            <p className="text-[13px] font-normal text-muted-foreground">
              Este cliente não tem análise de crédito decidida.
            </p>
          )}
          {analise.data && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-normal text-muted-foreground">Decisão</span>
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
                <div className="rounded-lg border border-border/60 bg-card border-l-[3px] border-l-warning p-3">
                  <p className="text-[11px] font-normal text-muted-foreground">Ressalva</p>
                  <p className="text-[13px] font-normal">{analise.data.ressalva}</p>
                </div>
              )}
              {analise.data.parecer_final && (
                <div className="rounded-lg border border-border/60 bg-card p-3">
                  <p className="text-[11px] font-normal text-muted-foreground">Parecer</p>
                  <p className="whitespace-pre-line text-[13px] font-normal">
                    {analise.data.parecer_final}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
