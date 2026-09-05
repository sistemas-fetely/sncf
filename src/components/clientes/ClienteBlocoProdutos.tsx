/**
 * ANÁLISE DE PRODUTO DO CLIENTE — o que ele compra e o que vender.
 *
 * Grão de oferta = COLEÇÃO (ninguém compra vela por número), e a curva ABC da
 * carteira decide a conversa quando o cliente diz "não vendeu": curva A
 * encalhada é problema de exposição/preço na loja dele; curva C é giro baixo
 * nosso e pede outra ação.
 *
 * Só leitura. Gate por `tela.cliente_produtos`: sem concessão, nada renderiza.
 * FAIL-LOUD em cada bloco: carregando → erro → vazio → conteúdo.
 */
import { useState } from "react";
import { ChevronDown, Copy, Loader2 } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatBRL } from "@/lib/format-currency";
import { usePodeVerAba } from "@/components/AbaGate";
import {
  useClienteCadastro,
  useColecaoItens,
  useKpiCliente,
  useMixAbc,
  useMixCliente,
  useProdutosCliente,
  useRecompraCliente,
  useSugestaoVenda,
  type ColecaoItemCliente,
  type CurvaAbc,
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

/** Faixa de preço da coleção: um valor quando min === max. */
function faixaPreco(min: number, max: number) {
  if (min === max) return formatBRL(min);
  return `${formatBRL(min)}–${max.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Selo de uma letra com a curva da carteira. Curva A não é verde: primary basta. */
function SeloCurva({ curva }: { curva: CurvaAbc | null }) {
  if (!curva) return null;
  const classe =
    curva === "A"
      ? "bg-primary/15 text-primary"
      : curva === "C"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${classe}`}
      title={`curva ${curva} da carteira`}
    >
      {curva}
    </span>
  );
}

function Estado({
  carregando,
  erro,
  vazio,
  msgVazio,
  msgErro,
  children,
}: {
  carregando: boolean;
  erro?: unknown;
  vazio: boolean;
  msgVazio: string;
  msgErro: string;
  children: React.ReactNode;
}) {
  if (carregando)
    return (
      <p className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> carregando
      </p>
    );
  if (erro)
    return (
      <p className="text-[13px] font-normal text-destructive">
        {(erro as any)?.message ?? msgErro}
      </p>
    );
  if (vazio) return <p className="text-[13px] font-normal text-muted-foreground">{msgVazio}</p>;
  return <>{children}</>;
}

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

/** Linha compacta de coleção sugerida. Não é card: a família já é o bloco. */
function LinhaColecao({ s, mostrarPorque }: { s: SugestaoVenda; mostrarPorque?: boolean }) {
  function copiar() {
    navigator.clipboard
      .writeText(`${s.familia} — coleção ${s.colecao} (${faixaPreco(s.preco_min, s.preco_max)})`)
      .then(() => toast("Sugestão copiada"));
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <span className="min-w-0 flex-1 truncate text-[13px] font-normal" title={s.colecao}>
        {s.colecao}
      </span>
      <SeloCurva curva={s.curva} />
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground">
        {s.clientes_compram} clientes compram
      </span>
      <span className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground">
        {s.n_itens} itens
      </span>
      <span className="shrink-0 text-[13px] tabular-nums">{faixaPreco(s.preco_min, s.preco_max)}</span>
      <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-[11px]" onClick={copiar}>
        <Copy className="h-3 w-3" /> Copiar
      </Button>
      {mostrarPorque && s.porque && (
        <p className="w-full text-[11px] font-normal text-muted-foreground">{s.porque}</p>
      )}
    </div>
  );
}

/** Item que falta na coleção do cliente. */
function LinhaItemFaltante({ item }: { item: ColecaoItemCliente }) {
  function copiar() {
    navigator.clipboard.writeText(item.sku).then(() => toast("SKU copiado"));
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      <span className="min-w-0 flex-1 truncate text-[13px] font-normal" title={item.nome}>
        {item.nome}
      </span>
      <span className="shrink-0 text-[13px] tabular-nums">{formatBRL(item.preco_venda)}</span>
      <SeloCurva curva={item.curva} />
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground">
        {item.clientes_compram} clientes compram
      </span>
      <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-[11px]" onClick={copiar}>
        <Copy className="h-3 w-3" /> Copiar
      </Button>
    </div>
  );
}

interface ColecaoAgrupada {
  chave: string;
  familia: string;
  colecao: string;
  total: number;
  comprados: number;
  valor: number;
  faltantes: ColecaoItemCliente[];
}

/** Uma coleção do cliente: progresso e, quando falta item, expansível. */
function LinhaColecaoDele({ c }: { c: ColecaoAgrupada }) {
  const [aberto, setAberto] = useState(false);
  const falta = c.total - c.comprados;
  const pct = c.total === 0 ? 0 : (c.comprados / c.total) * 100;
  const visiveis = c.faltantes.slice(0, 6);
  const resto = c.faltantes.length - visiveis.length;

  const cabecalho = (
    <div className="grid w-full items-center gap-3 sm:grid-cols-[minmax(140px,1.2fr)_minmax(100px,1fr)_auto]">
      <span className="flex min-w-0 items-center gap-2 text-left">
        {falta > 0 && (
          <ChevronDown
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        )}
        <span className="truncate text-[13px] font-normal" title={c.colecao}>
          {c.colecao}
        </span>
        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">{c.familia}</span>
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right text-[11px] font-normal tabular-nums text-muted-foreground">
        {c.comprados} de {c.total} itens
      </span>
    </div>
  );

  if (falta === 0) return <div className="py-1.5">{cabecalho}</div>;

  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="py-1.5">
      <CollapsibleTrigger className="w-full">{cabecalho}</CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 divide-y divide-border/60 pl-5">
          {visiveis.map((item) => (
            <LinhaItemFaltante key={item.sku} item={item} />
          ))}
          {resto > 0 && (
            <p className="py-1 text-[11px] font-normal tabular-nums text-muted-foreground">
              e mais {resto} itens
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  const abc = useMixAbc(parceiroId);
  const itens = useColecaoItens(parceiroId);

  if (gate.carregando || !gate.podeVer) return null;

  const k = kpi.data ?? null;
  const linhasProduto = produtos.data ?? [];
  const linhasMix = mix.data ?? [];
  const sugestoes = sugestao.data ?? [];
  const r = recompra.data ?? null;
  const linhasAbc = abc.data ?? [];
  const linhasItens = itens.data ?? [];

  // ---------- faixa de números ----------
  const familiasCompradas = linhasMix.filter((l) => l.valor_cliente > 0).length;
  const totalFamilias = linhasMix.length;
  const colecoesCompradas = linhasProduto.filter((l) => l.eixo === "colecao" && l.valor > 0).length;
  const potencialTotal = linhasMix.reduce((s, l) => s + Math.max(0, l.potencial_reais), 0);

  // ---------- donuts ----------
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

  // ---------- 2.1 curva ABC ----------
  const ORDEM_CURVA: CurvaAbc[] = ["A", "B", "C"];
  const porCurva = (c: CurvaAbc) => linhasAbc.find((l) => l.curva === c) ?? null;
  const pctA = porCurva("A")?.pct_cliente ?? 0;
  const pctC = porCurva("C")?.pct_cliente ?? 0;
  const fraseAbc =
    pctA >= 80
      ? `${pctBR(pctA)} do que ele levou é curva A — se encalhar na loja, o problema é exposição ou preço, não o produto.`
      : pctC >= 15
        ? `${pctBR(pctC)} do que ele levou é curva C — giro baixo na carteira inteira; se encalhar, combine outra ação (troca, promoção).`
        : "Mix equilibrado entre as curvas — na reclamação de venda, cheque item a item qual curva o produto está.";
  const curvaCQueCarrega = linhasItens
    .filter((i) => i.comprou && i.curva === "C")
    .sort((a, b) => b.valor_cliente - a.valor_cliente)
    .slice(0, 3);
  const corSegmento = (c: CurvaAbc) =>
    c === "A" ? "bg-primary" : c === "B" ? "bg-muted-foreground/50" : "bg-warning";

  const BarraAbc = ({ tipo }: { tipo: "cliente" | "carteira" }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-normal text-muted-foreground">
        <span>{tipo === "cliente" ? "Este cliente" : "Carteira"}</span>
      </div>
      <div
        className={`flex h-4 w-full overflow-hidden rounded-full bg-muted ${tipo === "carteira" ? "opacity-60" : ""}`}
      >
        {ORDEM_CURVA.map((c) => {
          const linha = porCurva(c);
          const pct = tipo === "cliente" ? (linha?.pct_cliente ?? 0) : (linha?.pct_carteira ?? 0);
          if (pct <= 0) return null;
          return (
            <div
              key={c}
              className={`flex items-center justify-center ${corSegmento(c)}`}
              style={{ width: `${pct}%` }}
              title={`curva ${c}: ${pctBR(pct)}`}
            >
              {pct >= 10 && (
                <span className="text-[11px] font-normal tabular-nums text-background">{pctBR(pct)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---------- 2.2 as coleções dele ----------
  const mapaColecoes = new Map<string, ColecaoAgrupada>();
  for (const item of linhasItens) {
    const chave = `${item.familia}||${item.colecao}`;
    let g = mapaColecoes.get(chave);
    if (!g) {
      g = {
        chave,
        familia: item.familia,
        colecao: item.colecao,
        total: 0,
        comprados: 0,
        valor: 0,
        faltantes: [],
      };
      mapaColecoes.set(chave, g);
    }
    g.total += 1;
    if (item.comprou) {
      g.comprados += 1;
      g.valor += item.valor_cliente;
    } else {
      g.faltantes.push(item);
    }
  }
  const colecoesDele = [...mapaColecoes.values()]
    .filter((c) => c.comprados > 0)
    .sort((a, b) => b.valor - a.valor);
  for (const c of colecoesDele) {
    c.faltantes.sort((a, b) => b.clientes_compram - a.clientes_compram);
  }
  const colecoesIncompletas = colecoesDele.filter((c) => c.total > c.comprados);
  const colecoesCompletas = colecoesDele.filter((c) => c.total === c.comprados);

  // ---------- 2.3 espaço e o que oferecer ----------
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
  const colecoesPorFamilia = (familia: string) =>
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
      for (const s of colecoesPorFamilia(l.familia).slice(0, 3)) {
        partes.push(
          `  • Coleção ${s.colecao} — curva ${s.curva}, ${s.clientes_compram} clientes compram, ${faixaPreco(s.preco_min, s.preco_max)}`,
        );
      }
    }
    const incompletas = [...colecoesIncompletas]
      .sort((a, b) => b.total - b.comprados - (a.total - a.comprados))
      .slice(0, 5);
    if (incompletas.length > 0) {
      partes.push("Completar coleções que ele já tem:");
      for (const c of incompletas) {
        partes.push(`  • ${c.colecao} (${c.familia}): tem ${c.comprados} de ${c.total} itens`);
      }
    }
    navigator.clipboard.writeText(partes.join("\n")).then(() => toast("Briefing copiado"));
  }

  return (
    <div className="space-y-4">
      {/* FAIXA DE NÚMEROS */}
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

      {/* DONUTS */}
      <div className="space-y-3">
        <TituloSecao>O que este cliente compra</TituloSecao>
        <div className="grid gap-[10px] lg:grid-cols-2">
          <Donut titulo="Compra por família" fatias={fatiasFamilia} carregando={produtos.isLoading} erro={produtos.error} cor={corFatia} />
          <Donut titulo="Compra por coleção" fatias={fatiasColecao} carregando={produtos.isLoading} erro={produtos.error} cor={corFatia} />
        </div>
      </div>

      {/* 2.1 QUALIDADE DO QUE ELE COMPRA */}
      <div className="space-y-3">
        <TituloSecao>Qualidade do que ele compra</TituloSecao>
        <div className="space-y-3 rounded-lg border border-border/60 bg-card p-3">
          <Estado
            carregando={abc.isLoading}
            erro={abc.isError ? abc.error : null}
            vazio={linhasAbc.length === 0}
            msgVazio="Sem histórico suficiente para classificar as curvas."
            msgErro="Falha ao consultar a curva ABC do cliente."
          >
            <div className="space-y-3">
              <BarraAbc tipo="cliente" />
              <BarraAbc tipo="carteira" />
              <div className="flex items-center gap-3 text-[11px] font-normal text-muted-foreground">
                {ORDEM_CURVA.map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-sm ${corSegmento(c)}`} />
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[13px] font-normal tabular-nums">{fraseAbc}</p>
              {curvaCQueCarrega.length > 0 && (
                <p className="text-[11px] font-normal text-muted-foreground">
                  Curva C que ele carrega: {curvaCQueCarrega.map((i) => i.nome).join(" · ")}
                </p>
              )}
            </div>
          </Estado>
        </div>
      </div>

      {/* 2.2 AS COLEÇÕES DELE */}
      <div className="space-y-3">
        <TituloSecao>As coleções dele — o que falta em cada uma</TituloSecao>
        <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3">
          <Estado
            carregando={itens.isLoading}
            erro={itens.isError ? itens.error : null}
            vazio={colecoesDele.length === 0}
            msgVazio="Ele ainda não comprou itens de nenhuma coleção."
            msgErro="Falha ao consultar os itens das coleções."
          >
            <>
              <div className="divide-y divide-border/60">
                {colecoesIncompletas.map((c) => (
                  <LinhaColecaoDele key={c.chave} c={c} />
                ))}
              </div>
              {colecoesCompletas.length > 0 && (
                <p className="text-[11px] font-normal text-muted-foreground">
                  Completas: {colecoesCompletas.map((c) => `${c.colecao} (${c.familia})`).join(" · ")}
                </p>
              )}
              {colecoesIncompletas.length === 0 && colecoesCompletas.length > 0 && (
                <p className="text-[13px] font-normal text-muted-foreground">
                  Nenhuma coleção com item faltando.
                </p>
              )}
            </>
          </Estado>
        </div>
      </div>

      {/* 2.3 ONDE HÁ ESPAÇO E O QUE OFERECER */}
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
              {/* Completar a mesa — aqui o `porque` é específico da coleção, então aparece */}
              {completar.length > 0 && (
                <div className="border-l-[3px] border-l-primary pl-3">
                  <p className="text-[13px] font-medium">Completar a mesa</p>
                  <div className="mt-1 divide-y divide-border/60">
                    {completar.map((s, i) => (
                      <LinhaColecao key={`${s.familia}-${s.colecao}-${i}`} s={s} mostrarPorque />
                    ))}
                  </div>
                </div>
              )}

              {comEspaco.map((l) => {
                const cols = colecoesPorFamilia(l.familia);
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
                      {cols.length === 0 ? (
                        <p className="py-1 text-[11px] font-normal text-muted-foreground">
                          sem coleção de giro comprovado para sugerir aqui
                        </p>
                      ) : (
                        cols.map((s, i) => <LinhaColecao key={`${s.colecao}-${i}`} s={s} />)
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
