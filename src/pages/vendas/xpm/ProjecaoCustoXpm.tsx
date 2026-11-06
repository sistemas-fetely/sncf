import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { FaturaCompletaSheet, ImportarFaturaBotao, useFaturaXpm } from "./components/FaturaXpm";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Mensal = {
  mes: string; tipo: 'realizado' | 'projetado';
  mensal: number | null; entrada: number | null; venda: number | null; total: number | null;
  minimo: number | null; piso_aplicado: boolean | null; giro_mensal: number | null; desconto: number | null;
  detalhe: unknown;
};
type Lote = { pedido?: string | null; caixas?: number | null; unidades?: number | null; entrada?: number | null; armazenagem_mes?: number | null; mes_entrada?: string | null };
type Decomp = { arm?: number | null; seguro?: number | null; end_virtual?: number | null; giro?: number | null; nfs?: string | null; versao?: number | string | null; status?: string | null };
type Entrada = {
  id: number; numero_pedido: string | null; processo_ref: string | null; status: string | null;
  chegou: boolean | null; em_transito: boolean | null;
  eta: string | null; data_chegada: string | null; entrada_xpm: string | null;
  data_base: string | null; data_base_fonte: string | null; competencia_base: string | null;
  ja_na_base: boolean | null; conta_na_projecao: boolean | null;
  conteineres: number | null; caixas: number | null; unidades: number | null;
  m3_bruto: number | null; m3_liquido: number | null; m3_fonte: string | null;
  skus: number | null; skus_novos: number | null; un_vela: number | null; un_outros: number | null;
  valor_mercadoria: number | null; valor_estimado_flag: boolean | null;
  custo_conteineres: number | null; custo_recebimento: number | null; custo_insumos: number | null;
  custo_entrada_total: number | null; posicoes_estimadas: number | null;
  mensal_armazenagem: number | null; mensal_seguro: number | null;
  incremento_mensal_mes1: number | null; meses_venda: number | null;
  rs_por_m3_fator: number | null; pos_por_m3_fator: number | null;
  posicoes_pallet: number | null; posicoes_bin: number | null; skus_sem_medida: number | null;
  preco_pallet: number | null; preco_bin: number | null;
  posicoes_fonte: string | null; rs_por_pos_fator: number | null;
};
type Param = { chave: string; valor: number | null; descricao: string | null };

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const dataBr = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const mesBr = (d: string | null) => {
  if (!d) return "—";
  const [y, m] = d.slice(0, 7).split("-");
  return `${["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(m) - 1]}/${y.slice(2)}`;
};

const SERIES = [
  { key: "mensal", label: "Mensal", cor: "hsl(var(--chart-1))", classe: "bg-chart-1" },
  { key: "entrada", label: "Entrada", cor: "hsl(var(--chart-3))", classe: "bg-chart-3" },
  { key: "venda", label: "Venda", cor: "hsl(var(--chart-2))", classe: "bg-chart-2" },
] as const;

// cor da série do gráfico, em classe Tailwind, para uso nos blocos do detalhe
const corDaSerie = (k: (typeof SERIES)[number]["key"]) => SERIES.find((s) => s.key === k)?.classe ?? "bg-muted";

const giroPct = (g: number | null | undefined) => {
  if (g == null) return null;
  const n = Number(g); const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%/mês";
};
const mesAno = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

function lerDetalhe(r: Mensal): { decomp: Decomp | null; lotes: Lote[] } {
  const d = r.detalhe as any;
  if (Array.isArray(d)) {
    const ult = d.length ? d[d.length - 1] : null;
    const temDecomp = ult && ("arm" in ult || "seguro" in ult || "end_virtual" in ult);
    return { decomp: temDecomp ? ult : null, lotes: (temDecomp ? d.slice(0, -1) : d) as Lote[] };
  }
  if (d && typeof d === "object") return { decomp: d as Decomp, lotes: [] };
  return { decomp: null, lotes: [] };
}

export default function ProjecaoCustoXpm() {
  const mensal = useQuery({
    queryKey: ["xpm-projecao-mensal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_xpm_projecao_mensal").select("*").order("mes");
      if (error) throw error;
      return (data ?? []) as Mensal[];
    },
  });
  const entrada = useQuery({
    queryKey: ["xpm-projecao-entrada"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_xpm_projecao_entrada").select("*");
      if (error) throw error;
      // conta_na_projecao primeiro (por data_base); depois já na base; sem data_base por último.
      const grupo = (r: Entrada) => (!r.data_base ? 2 : r.conta_na_projecao ? 0 : 1);
      return ((data ?? []) as Entrada[]).sort((a, b) =>
        grupo(a) - grupo(b) || (a.data_base ?? "").localeCompare(b.data_base ?? ""));
    },
  });

  return (
    <div className="p-4 space-y-8">
      <BlocoMensal q={mensal} />
      <BlocoEntrada q={entrada} />
      <BlocoParametros />
    </div>
  );
}

function Erro({ e }: { e: unknown }) {
  return <div className="text-sm text-destructive">Erro: {(e as Error)?.message ?? String(e)}</div>;
}

function BlocoMensal({ q }: { q: ReturnType<typeof useQuery<Mensal[]>> }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const tog = (k: string) => setAberto((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const dados = useMemo(() => (q.data ?? []).map((r) => ({ ...r, rotulo: mesBr(r.mes),
    ...Object.fromEntries(SERIES.map((s) => [s.key, Number(r[s.key] ?? 0)])) })), [q.data]);
  const primeiraProjetada = q.data?.find((r) => r.tipo === "projetado");
  const temRealizado = (q.data ?? []).some((r) => r.tipo === "realizado");
  const giro = giroPct(primeiraProjetada?.giro_mensal);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Quanto a XPM vai custar nos próximos meses</h2>
        <ImportarFaturaBotao />
      </div>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.error ? <Erro e={q.error} /> : (
        <>
          <Card className="h-[340px] w-full p-2">
            <ResponsiveContainer>
              <BarChart data={dados} margin={{ top: 24, right: 12, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickFormatter={(v) => num(v / 1000) + " mil"} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(v: number, n: string) => [brl(v), n]}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SERIES.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.cor}>
                    {dados.map((d) => (
                      <Cell key={d.mes} fill={s.cor} fillOpacity={d.tipo === "realizado" ? 0.45 : 1} />
                    ))}
                    {i === SERIES.length - 1 && (
                      <LabelList dataKey="total" position="top"
                        formatter={(v: number) => brl(v)} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                    )}
                  </Bar>
                ))}
                {temRealizado && primeiraProjetada && (
                  <ReferenceLine x={mesBr(primeiraProjetada.mes)} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5"
                    label={{ value: "projeção →", position: "insideTopRight", fontSize: 11, fill: "hsl(var(--muted-foreground))", dy: -12 }} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-md border bg-card p-2.5 shadow-sm">
              <div className="font-semibold">Mensal</div>
              <div className="text-muted-foreground">Custo de ter estoque: armazenagem + seguro + endereço virtual. Nos meses projetados cai pelo giro medido{giro ? ` (giro ${giro})` : ""}.</div>
            </div>
            <div className="rounded-md border bg-card p-2.5 shadow-sm">
              <div className="font-semibold">Entrada</div>
              <div className="text-muted-foreground">Esporádico: recebimento, containers, descarga, adequação, HE. Só nos meses em que um lote entra na XPM.</div>
            </div>
            <div className="rounded-md border bg-card p-2.5 shadow-sm">
              <div className="font-semibold">Venda</div>
              <div className="text-muted-foreground">Atrelado à saída: expedição + caixas (insumos) + pedidos emergenciais. Projetado pela média dos 3 últimos meses reais.</div>
            </div>
          </div>
          <TooltipProvider>
          <Card className="overflow-hidden">
            <CardContent className="p-0 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted text-foreground dark:bg-background/70">
                <tr className="border-l-2 border-l-transparent border-b border-border">
                  <th className="w-6" />
                  <th className="px-2 py-2 text-left font-semibold">Mês</th>
                  <th className="px-2 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-2 py-2 text-right font-semibold tabular-nums">Mensal</th>
                  <th className="px-2 py-2 text-right font-semibold tabular-nums">Entrada</th>
                  <th className="px-2 py-2 text-right font-semibold tabular-nums">Venda</th>
                  <th className="px-2 py-2 text-right font-semibold tabular-nums border-l">= Total</th>
                  <th className="px-2 py-2 text-right font-medium tabular-nums">Piso contratual (referência)</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r, i) => {
                  const ab = aberto.has(r.mes);
                  const real = r.tipo === "realizado";
                  const { decomp, lotes } = lerDetalhe(r);
                  return (
                    <Fragment key={r.mes}>
                      <tr
                        className={cn(
                          "border-t bg-card cursor-pointer hover:bg-muted/40 border-l-2 border-l-transparent dark:hover:bg-accent",
                          i % 2 === 1 && "bg-muted/20 dark:bg-background/35",
                          real && "border-l-primary",
                        )}
                        onClick={() => tog(r.mes)}
                      >
                        <td className="px-1 py-1.5">{ab ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{mesBr(r.mes)}</td>
                        <td className="px-2 py-1.5">
                          <Badge variant={real ? "outline" : "secondary"}>{real ? "real" : "proj."}</Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{brl(r.mensal)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{brl(r.entrada)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{brl(r.venda)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold border-l bg-muted/30 dark:bg-background/60 whitespace-nowrap">
                          {r.piso_aplicado && (
                            <UiTooltip>
                              <TooltipTrigger asChild><Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">piso</Badge></TooltipTrigger>
                              <TooltipContent>Soma ficou abaixo do mínimo contratual; cobra o mínimo</TooltipContent>
                            </UiTooltip>
                          )}
                          {brl(r.total)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">{brl(r.minimo)}</td>
                      </tr>
                      {ab && (
                        <tr className="bg-muted/40 border-y dark:bg-background/70">
                          <td className={cn(real && "border-l-2 border-l-primary")} />
                          <td colSpan={7} className="px-3 py-3 space-y-2">
                            {!real && (
                              <div className="overflow-hidden rounded-md border bg-card shadow-sm">
                                <div className={cn("h-1", corDaSerie("mensal"))} />
                                <div className="p-2.5 space-y-1">
                                  <div className="font-semibold">Mensal</div>
                                  {decomp ? (
                                    <div>Armazenagem {brl(decomp.arm)} · Seguro {brl(decomp.seguro)} · Endereço virtual {brl(decomp.end_virtual)}
                                      {!real && giroPct(decomp.giro ?? r.giro_mensal) ? ` · giro ${giroPct(decomp.giro ?? r.giro_mensal)}` : ""}</div>
                                  ) : <div className="text-muted-foreground">—</div>}
                                </div>
                              </div>
                            )}
                            {real ? (
                              <DetalheFaturaReal mes={r.mes} desconto={r.desconto} />
                            ) : (
                              <div className="rounded-md border bg-card p-2.5 shadow-sm space-y-1">
                                <div className="font-semibold">Lotes</div>
                                {lotes.length === 0 ? <div className="text-muted-foreground">Nenhum lote.</div> : (
                                  <ul className="space-y-0.5">
                                    {lotes.map((l, i) => (
                                      <li key={i}><span className="font-medium">{l.pedido ?? "—"}</span>: entrou em {mesAno(l.mes_entrada)} · {num(l.caixas)} caixas · {num(l.unidades)} unidades · entrada {brl(l.entrada)} · armazenagem {brl(l.armazenagem_mes)}/mês</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={8} className="px-3 py-2 italic text-muted-foreground">
                    Mensal + Entrada + Venda = Total. O piso contratual só vale quando a soma fica abaixo dele.
                  </td>
                </tr>
              </tfoot>
            </table>
            </CardContent>
          </Card>
          </TooltipProvider>
        </>
      )}
    </section>
  );
}

type LinhaNat = {
  fatura_id: string; versao: number | null; fatura_status: string | null; valor_faturar: number | null;
  natureza: string | null; ordem: number | null; processo: string | null; descricao: string | null; uom: string | null;
  qtde_cobrada: number | null; preco_cobrado: number | null; valor_cobrado: number | null;
  qtde_medida: number | null; fonte_medida: string | null; divergencia_qtde: number | null; divergencia_valor: number | null;
  status: string | null; nota: string | null;
  pedidos_expedidos: number | null; unidades_expedidas: number | null; pedidos_b2c: number | null; pedidos_b2b: number | null;
  unidades_b2c: number | null; unidades_b2b: number | null; caixas_expedicao: number | null;
  unidades_recebidas: number | null; nfs_recebidas: number | null; volumes_descarga: number | null;
  custo_venda_por_pedido: number | null; custo_venda_por_unidade: number | null;
};
const brl2 = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-[11px] text-foreground">{children}</span>;
}

function DetalheFaturaReal({ mes, desconto }: { mes: string; desconto: number | null }) {
  const [verCompleta, setVerCompleta] = useState(false);
  const q = useQuery({
    queryKey: ["xpm-fatura-natureza", mes],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_xpm_fatura_natureza").select("*")
        .eq("competencia", mes.slice(0, 10)).order("ordem");
      if (error) throw error;
      return (data ?? []) as LinhaNat[];
    },
  });
  const primeira = q.data?.[0];
  const fat = useFaturaXpm(primeira?.fatura_id);
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (q.error) return <Erro e={q.error} />;
  if (!primeira) return <div className="text-muted-foreground">Nenhuma fatura importada para este mês.</div>;
  const p = primeira;
  const de = (n: string) => (q.data ?? []).filter((l) => l.natureza === n);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">versão {p.versao ?? "—"} · {p.fatura_status ?? "—"}</Badge>
        <Badge variant="secondary">A faturar {brl2(p.valor_faturar)}</Badge>
        {desconto != null && Number(desconto) !== 0 && <Chip>desconto {brl2(desconto)}</Chip>}
        <button className="text-xs underline text-primary" onClick={(e) => { e.stopPropagation(); setVerCompleta(true); }}>ver fatura completa</button>
      </div>
      {fat.error && <Erro e={fat.error} />}
      {fat.data?.observacao && (
        <div className="flex gap-2 rounded-md border border-warning/40 px-2 py-1.5 text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span className="break-words">{fat.data.observacao}</span>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <BlocoNatureza titulo="Mensal" linhas={de("mensal")} cor={corDaSerie("mensal")} />
        <BlocoNatureza titulo="Entrada" linhas={de("entrada")} cor={corDaSerie("entrada")} chips={[
          `${num(p.unidades_recebidas)} unidades recebidas · ${num(p.nfs_recebidas)} NFs · ${num(p.volumes_descarga)} volumes`,
        ]} />
        <BlocoNatureza titulo="Venda" linhas={de("venda")} cor={corDaSerie("venda")} destaque chips={[
          `${num(p.pedidos_expedidos)} pedidos (${num(p.pedidos_b2c)} B2C · ${num(p.pedidos_b2b)} B2B) · ${num(p.unidades_expedidas)} unidades (${num(p.unidades_b2c)} B2C · ${num(p.unidades_b2b)} B2B) · ${num(p.caixas_expedicao)} caixas`,
          `${brl2(p.custo_venda_por_pedido)} por pedido · ${brl2(p.custo_venda_por_unidade)} por unidade`,
        ]} />
      </div>
      <FaturaCompletaSheet faturaId={p.fatura_id} open={verCompleta} onOpenChange={setVerCompleta} />
    </div>
  );
}

function BlocoNatureza({ titulo, linhas, chips, destaque, cor }: { titulo: string; linhas: LinhaNat[]; chips?: string[]; destaque?: boolean; cor: string }) {
  const visiveis = linhas.filter((l) => Number(l.valor_cobrado ?? 0) !== 0);
  const subtotal = linhas.reduce((a, l) => a + Number(l.valor_cobrado ?? 0), 0);
  return (
    <div className={cn("overflow-hidden rounded-md border bg-card shadow-sm", destaque && "border-primary/40")}>
      <div className={cn("h-1", cor)} />
      <div className="p-2.5 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold"><span className={cn("h-2 w-2 shrink-0 rounded-full", cor)} />{titulo}</span>
        <span className="text-base font-bold tabular-nums whitespace-nowrap">{brl2(subtotal)}</span>
      </div>
      {chips?.length ? <div className="flex flex-wrap gap-1">{chips.map((c) => <Chip key={c}>{c}</Chip>)}</div> : null}
      {visiveis.length === 0 ? <div className="text-muted-foreground">Sem cobrança.</div> : (
        <ul className="divide-y">
          {visiveis.map((l, i) => {
            const div = Number(l.divergencia_valor ?? 0) !== 0 || Number(l.divergencia_qtde ?? 0) !== 0;
            return (
              <li key={i} className="py-1">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate" title={`${l.processo ?? ""} · ${l.descricao ?? ""}`}>
                    <span className="text-muted-foreground">{l.processo} · </span>{l.descricao}
                  </span>
                  <span className="tabular-nums whitespace-nowrap">{brl2(l.valor_cobrado)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <span>{num(l.qtde_cobrada, 2)} {l.uom ?? ""} × {brl2(l.preco_cobrado)}</span>
                  {div && (
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                          divergente {l.divergencia_qtde != null ? `${num(l.divergencia_qtde, 2)} un` : ""}{l.divergencia_valor != null ? ` · ${brl2(l.divergencia_valor)}` : ""}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Medido SNCF {num(l.qtde_medida, 2)} · fonte: {l.fonte_medida ?? "—"}{l.nota ? ` · ${l.nota}` : ""}</TooltipContent>
                    </UiTooltip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

function BlocoEntrada({ q }: { q: ReturnType<typeof useQuery<Entrada[]>> }) {
  const [aberto, setAberto] = useState<Set<number>>(new Set());
  const linhas = q.data ?? [];
  const contam = linhas.filter((r) => r.conta_na_projecao);
  const soma = (k: keyof Entrada) => contam.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const tog = (id: number) => setAberto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cols = 12;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">O que está chegando</h2>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.error ? <Erro e={q.error} /> : (
        <TooltipProvider>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-6" />
                  <th className="px-2 py-1.5 text-left">Pedido</th>
                  <th className="px-2 py-1.5 text-left">Status</th>
                  <th className="px-2 py-1.5 text-left">Chegada</th>
                  <th className="px-2 py-1.5 text-right">Contêineres</th>
                  <th className="px-2 py-1.5 text-right">Caixas</th>
                  <th className="px-2 py-1.5 text-right">Unidades</th>
                  <th className="px-2 py-1.5 text-right">m³</th>
                  <th className="px-2 py-1.5 text-right">SKUs novos</th>
                  <th className="px-2 py-1.5 text-right">Valor mercadoria</th>
                  <th className="px-2 py-1.5 text-right">Custo de entrada</th>
                  <th className="px-2 py-1.5 text-right">Incremento/mês (mês 1)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={cols} className="px-2 py-6 text-center text-muted-foreground">Nenhuma importação chegando.</td></tr>
                )}
                {linhas.map((r) => {
                  const ab = aberto.has(r.id);
                  const semData = !r.data_base;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-t cursor-pointer hover:bg-muted/30 ${semData || !r.conta_na_projecao ? "text-muted-foreground" : ""}`} onClick={() => tog(r.id)}>
                        <td className="px-1">{ab ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                        <td className="px-2 py-1 font-medium whitespace-nowrap">
                          {r.processo_ref ?? r.numero_pedido ?? "—"}
                          {!r.conta_na_projecao && r.ja_na_base && (
                            <UiTooltip>
                              <TooltipTrigger asChild><Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">já na base</Badge></TooltipTrigger>
                              <TooltipContent>Já estava no estoque da última fatura conferida; não soma na projeção</TooltipContent>
                            </UiTooltip>
                          )}
                        </td>
                        <td className="px-2 py-1">{r.status ?? "—"}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {semData ? <span className="italic">sem data</span> : (
                            <>{dataBr(r.data_base)}{r.data_base_fonte && <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">{r.data_base_fonte}</Badge>}</>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.conteineres, 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.caixas)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.unidades)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <UiTooltip>
                            <TooltipTrigger asChild><span className="underline decoration-dotted">{num(r.m3_liquido, 1)}</span></TooltipTrigger>
                            <TooltipContent>bruto {num(r.m3_bruto, 1)} m³ · fonte: {r.m3_fonte ?? "—"}</TooltipContent>
                          </UiTooltip>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                          {num(r.skus_novos)}
                          {r.posicoes_fonte?.startsWith("cubagem") && (
                            <UiTooltip>
                              <TooltipTrigger asChild><Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">sem itens</Badge></TooltipTrigger>
                              <TooltipContent>Lote sem itens cadastrados: posições estimadas por cubagem × fator médio. Cadastre os itens para a conta SKU a SKU.</TooltipContent>
                            </UiTooltip>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                          {r.valor_estimado_flag ? (
                            <UiTooltip>
                              <TooltipTrigger asChild><span className="underline decoration-dotted">{brl(r.valor_mercadoria)} <span className="text-muted-foreground">estim.</span></span></TooltipTrigger>
                              <TooltipContent>estimado por FOB × fator</TooltipContent>
                            </UiTooltip>
                          ) : brl(r.valor_mercadoria)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{brl(r.custo_entrada_total)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{brl(r.incremento_mensal_mes1)}</td>
                      </tr>
                      {ab && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={cols - 1} className="px-2 py-2">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-w-3xl">
                              <div className="font-medium text-muted-foreground">Entrada (uma vez)</div>
                              <div className="font-medium text-muted-foreground">Mensal (mês 1)</div>
                              <div>Contêineres: {brl(r.custo_conteineres)}</div>
                              {r.posicoes_fonte?.startsWith("SKU") ? (
                                <>
                                  <div>Armazenagem: {num(r.posicoes_pallet ?? 0)} pallets × R$ {num(r.preco_pallet, 2)} + {num(r.posicoes_bin ?? 0)} bins × R$ {num(r.preco_bin, 2)} = {brl(r.mensal_armazenagem)}</div>
                                  <div className="text-muted-foreground">SKU a SKU: cada SKU vai pra 1 pallet ou N bins, o que custar menos (capacidades nos parâmetros){(r.skus_sem_medida ?? 0) > 0 ? ` · ${num(r.skus_sem_medida)} SKUs sem medida` : ""}</div>
                                </>
                              ) : (
                                <>
                                  <div>Armazenagem: {num(r.posicoes_estimadas, 1)} posições × R$ {num(r.rs_por_pos_fator, 2)} = {brl(r.mensal_armazenagem)}</div>
                                  <div className="text-muted-foreground">cubagem × fator médio do estoque ({num(r.pos_por_m3_fator, 2)} pos/m³) — sem itens cadastrados</div>
                                </>
                              )}
                              <div>Recebimento por caixa: {brl(r.custo_recebimento)}</div>
                              <div>Seguro: {brl(r.mensal_seguro)}</div>
                              <div>Insumos: {brl(r.custo_insumos)}</div>
                              <div>Meses de venda: {num(r.meses_venda)}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {linhas.length > 0 && (
                <tfoot className="border-t bg-muted/40 font-semibold">
                  <tr>
                    <td /><td className="px-2 py-1.5" colSpan={3}>Total</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("conteineres"), 1)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("caixas"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("unidades"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("m3_liquido"), 1)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("skus_novos"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("valor_mercadoria"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("custo_entrada_total"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("incremento_mensal_mes1"))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Posições por lote: com itens cadastrados, cada SKU ocupa 1 pallet ou N bins (o mais barato; capacidades calibradas nas faturas). Sem itens, cubagem × fator médio.</p>
        </TooltipProvider>
      )}
    </section>
  );
}

function BlocoParametros() {
  const [aberto, setAberto] = useState(false);
  const q = useQuery({
    queryKey: ["xpm-projecao-param"],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("xpm_projecao_param").select("chave, valor, descricao").order("chave");
      if (error) throw error;
      return (data ?? []) as Param[];
    },
  });
  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <CollapsibleTrigger className="flex items-center gap-1 text-base font-semibold">
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Parâmetros
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">Preços de serviço vêm da tabela de preços da XPM (aba Faturamento), não daqui.</p>
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.error ? <Erro e={q.error} /> : (
          <div className="overflow-auto rounded-md border max-w-3xl">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr><th className="px-2 py-1.5 text-left">Descrição</th><th className="px-2 py-1.5 text-left w-48">Valor</th></tr>
              </thead>
              <tbody>{(q.data ?? []).map((p) => <LinhaParam key={p.chave} p={p} />)}</tbody>
            </table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function LinhaParam({ p }: { p: Param }) {
  const qc = useQueryClient();
  const [v, setV] = useState(p.valor == null ? "" : String(p.valor));
  const mudou = v !== (p.valor == null ? "" : String(p.valor));
  const m = useMutation({
    mutationFn: async () => {
      const n = Number(v.replace(",", "."));
      if (v.trim() === "" || !Number.isFinite(n)) throw new Error("Valor numérico inválido");
      const { data, error } = await (supabase as any).from("xpm_projecao_param").update({ valor: n }).eq("chave", p.chave).select("chave");
      if (error) throw error;
      if (!data?.length) throw new Error("Nenhuma linha atualizada (sem permissão?)");
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["xpm-projecao-param"] }),
        qc.invalidateQueries({ queryKey: ["xpm-projecao-entrada"] }),
        qc.invalidateQueries({ queryKey: ["xpm-projecao-mensal"] }),
      ]);
      toast.success("Parâmetro salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <tr className="border-t">
      <td className="px-2 py-1">{p.descricao ?? p.chave}<div className="text-[10px] text-muted-foreground font-mono">{p.chave}</div></td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          <Input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" className="h-7 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter" && mudou) m.mutate(); }} />
          {mudou && <Button size="sm" className="h-7" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}</Button>}
        </div>
      </td>
    </tr>
  );
}
