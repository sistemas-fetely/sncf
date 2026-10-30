import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Mensal = {
  mes: string; competencia_base: string | null;
  base_estoque_fixo: number | null; base_expedicao: number | null;
  incremento_estoque: number | null; custo_entrada: number | null;
  minimo: number | null; total_projetado: number | null; piso_aplicado: boolean | null;
  tipo: 'realizado' | 'projetado'; desconto: number | null;
  detalhe: unknown;
};
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
  posicoes_cubagem: number | null; posicoes_piso_sku: number | null;
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
  { key: "base_estoque_fixo", label: "Estoque", cor: "hsl(var(--chart-1))" },
  { key: "base_expedicao", label: "Expedição", cor: "hsl(var(--chart-2))" },
  { key: "incremento_estoque", label: "Lotes novos", cor: "hsl(var(--chart-3))" },
  { key: "custo_entrada", label: "Entrada", cor: "hsl(var(--chart-5))" },
] as const;

// Tooltip dos cabeçalhos de parcela da tabela mensal (chave → explicação curta).
const TOOLTIP_PARCELA: Record<string, string> = {
  base_estoque_fixo: "armazenagem (pallets + bins) + seguro + endereço virtual + insumos — congelado no último mês real para os projetados",
  base_expedicao: "unidades expedidas × preço (projetado: parâmetro unidades_expedidas_mes)",
  incremento_estoque: "incremento mensal dos lotes que chegaram após o último mês real, caindo 1/meses de venda por mês",
  custo_entrada: "recebimento, descarga, adequação, contêiner extra, HE — uma vez, no mês de chegada",
};

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
  const dados = useMemo(() => (q.data ?? []).map((r) => ({ ...r, rotulo: mesBr(r.mes),
    ...Object.fromEntries(SERIES.map((s) => [s.key, Number(r[s.key] ?? 0)])) })), [q.data]);
  // competencia_base vem da primeira linha projetada (nas realizadas também vem igual, mas por segurança).
  const primeiraProjetada = q.data?.find((r) => r.tipo === "projetado");
  const base = primeiraProjetada?.competencia_base ?? null;
  const temRealizado = (q.data ?? []).some((r) => r.tipo === "realizado");
  const paramQ = useQuery({
    queryKey: ["xpm-projecao-param", "meses_venda_padrao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("xpm_projecao_param").select("valor").eq("chave", "meses_venda_padrao").maybeSingle();
      if (error) throw error;
      return data as { valor: number | null } | null;
    },
  });
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Quanto a XPM vai custar nos próximos meses</h2>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.error ? <Erro e={q.error} /> : (
        <>
          <div className="h-[340px] w-full rounded-md border bg-card p-2">
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
                      <LabelList dataKey="total_projetado" position="top"
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
          </div>
          <TooltipProvider>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th rowSpan={2} className="px-2 py-1.5 text-left align-bottom">Mês</th>
                  <th rowSpan={2} className="px-2 py-1.5 text-left align-bottom">Tipo</th>
                  <th colSpan={5} className="px-2 py-1.5 text-center border-b">Parcelas (somam o total)</th>
                  <th rowSpan={2} className="px-2 py-1.5 text-right align-bottom border-l">= Total</th>
                  <th rowSpan={2} className="px-2 py-1.5 text-right align-bottom font-normal">Piso contratual (referência, não soma)</th>
                </tr>
                <tr>
                  {SERIES.map((s) => (
                    <th key={s.key} className="px-2 py-1.5 text-right">
                      <UiTooltip>
                        <TooltipTrigger asChild><span className="underline decoration-dotted">{s.label}</span></TooltipTrigger>
                        <TooltipContent className="max-w-64">{TOOLTIP_PARCELA[s.key]}</TooltipContent>
                      </UiTooltip>
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">
                    <UiTooltip>
                      <TooltipTrigger asChild><span className="underline decoration-dotted">Desconto</span></TooltipTrigger>
                      <TooltipContent>abatimento concedido pela XPM na fatura</TooltipContent>
                    </UiTooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.mes} className={`border-t ${r.tipo === "realizado" ? "bg-muted/20" : ""}`}>
                    <td className="px-2 py-1">{mesBr(r.mes)}</td>
                    <td className="px-2 py-1">
                      <Badge variant={r.tipo === "realizado" ? "outline" : "secondary"}>{r.tipo === "realizado" ? "real" : "proj."}</Badge>
                    </td>
                    {SERIES.map((s) => (
                      <td key={s.key} className="px-2 py-1 text-right tabular-nums">{brl(Number(r[s.key] ?? 0))}</td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.desconto == null ? "—" : (
                        <span className={Number(r.desconto) < 0 ? "text-destructive" : undefined}>{brl(r.desconto)}</span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold border-l whitespace-nowrap">
                      {r.piso_aplicado && (
                        <UiTooltip>
                          <TooltipTrigger asChild><Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">piso</Badge></TooltipTrigger>
                          <TooltipContent>Soma ficou abaixo do mínimo contratual; cobra o mínimo</TooltipContent>
                        </UiTooltip>
                      )}
                      {brl(r.total_projetado)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{brl(r.minimo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9} className="px-2 py-1.5 italic text-muted-foreground">
                    Soma das 5 parcelas = Total, em todos os meses. O piso contratual só vale quando a soma fica abaixo dele.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          </TooltipProvider>
          <p className="text-xs text-muted-foreground">
            Realizado = faturas conferidas. Projeção congela estoque e expedição no último mês real ({mesBr(base ?? null)}) e soma os lotes chegando, caindo 1/{num(paramQ.data?.valor)} por mês. Se a soma ficar abaixo do mínimo contratual, cobra-se o mínimo.
          </p>
        </>
      )}
    </section>
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
                          {r.posicoes_fonte === "piso por SKU novo" && (
                            <UiTooltip>
                              <TooltipTrigger asChild><Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">define posições</Badge></TooltipTrigger>
                              <TooltipContent>Cada SKU novo ocupa ao menos 1 posição própria; aqui o piso por SKU ({num(r.posicoes_piso_sku)}) supera a cubagem ({num(r.posicoes_cubagem)})</TooltipContent>
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
                              <div>Armazenagem: {num(r.posicoes_estimadas, 1)} posições × R$ {num(r.rs_por_pos_fator, 2)}/posição = {brl(r.mensal_armazenagem)}</div>
                              <div className="text-muted-foreground">cubagem → {num(r.posicoes_cubagem, 1)} pos ({num(r.pos_por_m3_fator, 2)} pos/m³) · piso por SKU novo → {num(r.posicoes_piso_sku, 1)} pos · vale o maior ({r.posicoes_fonte ?? "—"})</div>
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
