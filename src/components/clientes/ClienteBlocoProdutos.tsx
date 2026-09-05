/**
 * ANÁLISE DE PRODUTO DO CLIENTE — o que ele compra e o que vender.
 *
 * Junta num lugar só o que estava espalhado: os dois donuts de composição, o
 * confronto com a média da carteira e as sugestões de SKU. A família com espaço
 * é o cabeçalho; os SKUs sugeridos daquela família ficam DENTRO dela — assim o
 * argumento é dito UMA vez e não se repete card a card.
 *
 * Só leitura. Gate por `tela.cliente_produtos`: sem concessão, nada renderiza.
 * FAIL-LOUD em cada bloco: carregando → erro → vazio → conteúdo.
 */
import { Copy, Loader2 } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { usePodeVerAba } from "@/components/AbaGate";
import {
  useClienteCadastro,
  useKpiCliente,
  useMixCliente,
  useProdutosCliente,
  useRecompraCliente,
  useSugestaoVenda,
  type SugestaoVenda,
} from "@/hooks/clientes/useClientePainel";
import { toast } from "sonner";

const SLUG_PRODUTOS = "tela.cliente_produtos";

function TituloSecao({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-medium leading-tight">{children}</h3>;
}

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const pctBR = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function Indicador({
  rotulo,
  valor,
  legenda,
}: {
  rotulo: string;
  valor: string;
  legenda?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <p className="text-[11px] font-normal text-muted-foreground">{rotulo}</p>
      <p className="text-[21px] font-normal leading-[1.2] tabular-nums">{valor}</p>
      {legenda && (
        <p className="mt-0.5 text-[11px] font-normal text-muted-foreground">{legenda}</p>
      )}
    </div>
  );
}

interface Fatia {
  nome: string;
  valor: number;
  recomprado: boolean;
}

/**
 * Donut de composição com legenda ao lado. Só leitura.
 * FAIL-LOUD: carregando → erro → vazio → gráfico. Erro NUNCA vira estado vazio.
 */
function Donut({
  titulo,
  fatias,
  carregando,
  erro,
  cor,
}: {
  titulo: string;
  fatias: Fatia[];
  carregando: boolean;
  erro?: unknown;
  cor: (nome: string, index: number) => string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
      <TituloSecao>{titulo}</TituloSecao>
      {carregando && (
        <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> carregando
        </p>
      )}
      {!carregando && erro && (
        <p className="text-[13px] font-normal text-destructive">
          {(erro as any)?.message ?? "Falha ao consultar a composição de compra."}
        </p>
      )}
      {!carregando && !erro && fatias.length === 0 && (
        <p className="text-[13px] font-normal text-muted-foreground">Sem itens faturados ainda.</p>
      )}
      {!carregando && !erro && fatias.length > 0 && (
        <div className="grid min-h-[240px] items-center gap-3 sm:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1.2fr)]">
          <div className="h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fatias}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius="52%"
                  outerRadius="82%"
                  paddingAngle={1}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {fatias.map((item, index) => (
                    <Cell key={`${item.nome}-${index}`} fill={cor(item.nome, index)} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatBRL(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-0 space-y-2">
            {fatias.map((item, index) => (
              <div key={`${item.nome}-legenda`} className="flex min-w-0 items-center gap-2 text-[11px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: cor(item.nome, index) }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.nome}>
                  {item.nome}
                </span>
                {item.recomprado && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                    title="cliente já recomprou"
                    aria-label="recomprado"
                  />
                )}
                <span className="shrink-0 tabular-nums">{formatBRL(item.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Linha compacta de SKU sugerido. Não é card: a família já é o bloco. */
function LinhaSku({ s, mostrarPorque }: { s: SugestaoVenda; mostrarPorque?: boolean }) {
  function copiar() {
    navigator.clipboard.writeText(s.sku).then(() => toast("SKU copiado"));
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <span className="min-w-0 flex-1 truncate text-[13px] font-normal" title={s.nome}>
        {s.nome}
      </span>
      <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{s.colecao}</span>
      <span className="shrink-0 text-[13px] tabular-nums">{formatBRL(s.preco_venda)}</span>
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground">
        {s.clientes_compram} clientes compram
      </span>
      <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-[11px]" onClick={copiar}>
        <Copy className="h-3 w-3" /> Copiar
      </Button>
      {mostrarPorque && s.porque && (
        <p className="w-full text-[11px] font-normal text-muted-foreground">{s.porque}</p>
      )}
    </div>
  );
}

export function ClienteBlocoProdutos({ parceiroId }: { parceiroId: string }) {
  const gate = usePodeVerAba(SLUG_PRODUTOS);

  const cadastro = useClienteCadastro(parceiroId);
  const kpi = useKpiCliente(parceiroId);
  const produtos = useProdutosCliente(parceiroId);
  const mix = useMixCliente(parceiroId);
  const sugestao = useSugestaoVenda(parceiroId);
  const recompra = useRecompraCliente(parceiroId);

  if (gate.carregando || !gate.podeVer) return null;

  const k = kpi.data ?? null;
  const linhasProduto = produtos.data ?? [];
  const linhasMix = mix.data ?? [];
  const sugestoes = sugestao.data ?? [];
  const r = recompra.data ?? null;

  // ---------- 3.1 faixa de números ----------
  const familiasCompradas = linhasMix.filter((l) => l.valor_cliente > 0).length;
  const totalFamilias = linhasMix.length;
  const colecoesCompradas = linhasProduto.filter((l) => l.eixo === "colecao" && l.valor > 0).length;
  const potencialTotal = linhasMix.reduce((s, l) => s + Math.max(0, l.potencial_reais), 0);

  // ---------- 3.2 donuts ----------
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
  const montarFatias = (eixo: "familia" | "colecao", topo: number | null): Fatia[] => {
    const base = linhasProduto
      .filter((l) => l.eixo === eixo)
      .sort((a, b) => b.valor - a.valor)
      .map((l) => ({ nome: l.grupo, valor: l.valor, recomprado: !!l.recomprado }));
    if (topo == null || base.length <= topo) return base;
    const resto = base.slice(topo);
    return [
      ...base.slice(0, topo),
      { nome: "Outros", valor: resto.reduce((t, i) => t + i.valor, 0), recomprado: false },
    ];
  };
  const fatiasFamilia = montarFatias("familia", null);
  const fatiasColecao = montarFatias("colecao", 8);
  const corFatia = (nome: string, index: number) =>
    nome === "Outros" ? COR_OUTROS : coresPizza[index % coresPizza.length];

  // ---------- 3.3 espaço e o que oferecer ----------
  const ultimaCompraFamilia = new Map(
    linhasProduto.filter((l) => l.eixo === "familia").map((l) => [l.grupo, l.ultima_compra]),
  );
  const comEspaco = linhasMix
    .filter((l) => l.potencial_reais > 0)
    .sort((a, b) => b.potencial_reais - a.potencial_reais);
  const acimaDaMedia = linhasMix.filter((l) => l.potencial_reais <= 0 && l.valor_cliente > 0);
  const escala = Math.max(
    1,
    ...linhasMix.map((l) => Math.max(l.pct_cliente, l.pct_carteira)),
  );
  const completar = sugestoes.filter((s) => s.motivo === "completar_colecao");
  const skusPorFamilia = (familia: string) =>
    sugestoes.filter((s) => s.motivo !== "completar_colecao" && s.familia === familia);

  const carregandoSecao = mix.isLoading || sugestao.isLoading;
  const erroSecao = mix.isError ? mix.error : sugestao.isError ? sugestao.error : null;

  function copiarBriefing() {
    const nome = cadastro.data?.nome_fantasia || cadastro.data?.razao_social || "Cliente";
    const partes: string[] = [nome, `Potencial não explorado: ${formatBRL(potencialTotal)}`, ""];
    for (const l of comEspaco.slice(0, 5)) {
      partes.push(
        `${l.familia} — hoje ${pctBR(l.pct_cliente)}, carteira ${pctBR(l.pct_carteira)} (+${formatBRL(l.potencial_reais)})`,
      );
      for (const s of skusPorFamilia(l.familia).slice(0, 3)) {
        partes.push(`  • ${s.nome} — ${formatBRL(s.preco_venda)} (${s.clientes_compram} clientes compram)`);
      }
    }
    navigator.clipboard.writeText(partes.join("\n")).then(() => toast("Briefing copiado"));
  }

  return (
    <div className="space-y-4">
      {/* 3.1 FAIXA DE NÚMEROS */}
      <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
        <Indicador
          rotulo="Comprado"
          valor={k?.total_faturado == null ? "—" : formatBRL(k.total_faturado)}
          legenda={`${Number(k?.pedidos_faturados ?? 0)} pedido(s) faturado(s)`}
        />
        <Indicador
          rotulo="Ticket médio"
          valor={k?.ticket_medio == null ? "—" : formatBRL(k.ticket_medio)}
          legenda="por pedido"
        />
        <Indicador
          rotulo="Cobertura de catálogo"
          valor={totalFamilias === 0 ? "—" : `${familiasCompradas} de ${totalFamilias}`}
          legenda={`${r?.colecoes_distintas ?? colecoesCompradas} coleção(ões) compradas`}
        />
        <Indicador
          rotulo="Potencial não explorado"
          valor={formatBRL(potencialTotal)}
          legenda="se comprasse como a carteira"
        />
      </div>

      {/* 3.2 DONUTS */}
      <div className="space-y-3">
        <TituloSecao>O que este cliente compra</TituloSecao>
        <div className="grid gap-[10px] lg:grid-cols-2">
          <Donut titulo="Compra por família" fatias={fatiasFamilia} carregando={produtos.isLoading} erro={produtos.error} cor={corFatia} />
          <Donut titulo="Compra por coleção" fatias={fatiasColecao} carregando={produtos.isLoading} erro={produtos.error} cor={corFatia} />
        </div>
      </div>

      {/* 3.3 ONDE HÁ ESPAÇO E O QUE OFERECER */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TituloSecao>Onde há espaço e o que oferecer</TituloSecao>
          {!carregandoSecao && !erroSecao && (comEspaco.length > 0 || completar.length > 0) && (
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]" onClick={copiarBriefing}>
              <Copy className="h-3 w-3" /> Copiar briefing da visita
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
          {carregandoSecao && (
            <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando
            </p>
          )}
          {!carregandoSecao && erroSecao && (
            <p className="text-[13px] font-normal text-destructive">
              {(erroSecao as any)?.message ?? "Falha ao consultar o mix e as sugestões."}
            </p>
          )}
          {!carregandoSecao && !erroSecao && comEspaco.length === 0 && completar.length === 0 && (
            <p className="text-[13px] font-normal text-muted-foreground">
              Sem espaço identificado — este cliente compra acima da carteira em todas as famílias.
            </p>
          )}

          {!carregandoSecao && !erroSecao && (comEspaco.length > 0 || completar.length > 0) && (
            <>
              {/* Completar a mesa — aqui o `porque` é específico do SKU, então aparece */}
              {completar.length > 0 && (
                <div className="border-l-[3px] border-l-primary pl-3">
                  <p className="text-[13px] font-medium">Completar a mesa</p>
                  <div className="mt-1 divide-y divide-border/60">
                    {completar.map((s, i) => (
                      <LinhaSku key={`${s.sku}-${i}`} s={s} mostrarPorque />
                    ))}
                  </div>
                </div>
              )}

              {comEspaco.map((l) => {
                const skus = skusPorFamilia(l.familia);
                const ultima = ultimaCompraFamilia.get(l.familia) ?? null;
                return (
                  <div key={l.familia} className="border-l-[3px] border-l-warning pl-3">
                    <div className="grid items-center gap-3 sm:grid-cols-[minmax(110px,1fr)_minmax(120px,1.6fr)_auto]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[13px] font-normal" title={l.familia}>
                          {l.familia}
                        </span>
                        {l.nunca_comprou && (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                            nunca comprou
                          </span>
                        )}
                      </span>

                      {/* bullet: barra do cliente + tick da média da carteira */}
                      <div className="relative h-3 w-full">
                        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-warning"
                            style={{ width: `${Math.min(100, (l.pct_cliente / escala) * 100)}%` }}
                          />
                        </div>
                        <span
                          className="absolute top-0 h-3 w-[2px] rounded-sm bg-muted-foreground"
                          style={{ left: `calc(${Math.min(100, (l.pct_carteira / escala) * 100)}% - 1px)` }}
                          title={`média da carteira: ${pctBR(l.pct_carteira)}`}
                          aria-label="média da carteira"
                        />
                      </div>

                      <div className="text-right">
                        <span className="block text-[13px] tabular-nums text-warning">
                          +{formatBRL(l.potencial_reais)}
                        </span>
                        <span className="block text-[11px] font-normal tabular-nums text-muted-foreground">
                          compra {pctBR(l.pct_cliente)} · carteira {pctBR(l.pct_carteira)}
                          {ultima ? ` · última compra em ${dataBR(ultima)}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 divide-y divide-border/60">
                      {skus.length === 0 ? (
                        <p className="py-1 text-[11px] font-normal text-muted-foreground">
                          sem SKU de giro comprovado para sugerir aqui
                        </p>
                      ) : (
                        skus.map((s, i) => <LinhaSku key={`${s.sku}-${i}`} s={s} />)
                      )}
                    </div>
                  </div>
                );
              })}

              {acimaDaMedia.length > 0 && (
                <p className="text-[11px] font-normal tabular-nums text-muted-foreground">
                  Acima da média:{" "}
                  {acimaDaMedia.map((l) => `${l.familia} ${pctBR(l.pct_cliente)}`).join(" · ")}
                </p>
              )}

              <p className="text-[11px] font-normal text-muted-foreground">
                marca vertical = média da carteira
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
