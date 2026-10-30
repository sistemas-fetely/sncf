import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  incremento_estoque: number | null; incremento_expedicao: number | null;
  custo_entrada: number | null; total_projetado: number | null;
};
type Entrada = {
  id: number; numero_pedido: string | null; processo_ref: string | null; status: string | null;
  eta: string | null; data_chegada: string | null; data_base: string | null;
  conteineres: number | null; caixas: number | null; unidades: number | null; m3: number | null;
  skus_novos: number | null; valor_mercadoria: number | null; valor_estimado_flag: boolean | null;
  custo_conteineres: number | null; custo_recebimento: number | null; custo_insumos: number | null;
  custo_entrada_total: number | null; posicoes_pallet: number | null; mensal_pallet: number | null;
  posicoes_picking: number | null; mensal_picking: number | null; mensal_seguro: number | null;
  incremento_mensal_mes1: number | null; expedicao_total_lote: number | null;
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
  { key: "base_estoque_fixo", label: "Estoque atual (armazenagem + seguro + fixo)", cor: "hsl(var(--chart-1))" },
  { key: "base_expedicao", label: "Expedição base", cor: "hsl(var(--chart-2))" },
  { key: "incremento_estoque", label: "Estoque dos lotes chegando", cor: "hsl(var(--chart-3))" },
  { key: "incremento_expedicao", label: "Expedição dos lotes chegando", cor: "hsl(var(--chart-4))" },
  { key: "custo_entrada", label: "Custo de entrada", cor: "hsl(var(--chart-5))" },
] as const;

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
      return ((data ?? []) as Entrada[]).sort((a, b) =>
        !a.data_base ? 1 : !b.data_base ? -1 : a.data_base.localeCompare(b.data_base));
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
  const base = q.data?.[0]?.competencia_base;
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
                    {i === SERIES.length - 1 && (
                      <LabelList dataKey="total_projetado" position="top"
                        formatter={(v: number) => brl(v)} style={{ fontSize: 10, fill: "hsl(var(--foreground))" }} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left">Mês</th>
                  {SERIES.map((s) => <th key={s.key} className="px-2 py-1.5 text-right">{s.label}</th>)}
                  <th className="px-2 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.mes} className="border-t">
                    <td className="px-2 py-1">{mesBr(r.mes)}</td>
                    {SERIES.map((s) => <td key={s.key} className="px-2 py-1 text-right tabular-nums">{brl(r[s.key])}</td>)}
                    <td className="px-2 py-1 text-right tabular-nums font-semibold">{brl(r.total_projetado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Base = última fatura conferida ({mesBr(base ?? null)}). Incrementos caem conforme o lote vende (meses de venda nos parâmetros). Expedição só acontece se vender nesse ritmo.
          </p>
        </>
      )}
    </section>
  );
}

function BlocoEntrada({ q }: { q: ReturnType<typeof useQuery<Entrada[]>> }) {
  const [aberto, setAberto] = useState<Set<number>>(new Set());
  const linhas = q.data ?? [];
  const soma = (k: keyof Entrada) => linhas.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const tog = (id: number) => setAberto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cols = 13;
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
                  <th className="px-2 py-1.5 text-right">Expedição do lote</th>
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
                      <tr className={`border-t cursor-pointer hover:bg-muted/30 ${semData ? "text-muted-foreground" : ""}`} onClick={() => tog(r.id)}>
                        <td className="px-1">{ab ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</td>
                        <td className="px-2 py-1 font-medium">{r.processo_ref ?? r.numero_pedido ?? "—"}</td>
                        <td className="px-2 py-1">{r.status ?? "—"}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {semData ? <span className="italic">sem data</span> : r.data_chegada ? dataBr(r.data_chegada) : (
                            <>{dataBr(r.eta)} <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">ETA</Badge></>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.conteineres, 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.caixas)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.unidades)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.m3, 1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num(r.skus_novos)}</td>
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
                        <td className="px-2 py-1 text-right tabular-nums">{brl(r.expedicao_total_lote)}</td>
                      </tr>
                      {ab && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={cols - 1} className="px-2 py-2">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-w-3xl">
                              <div className="font-medium text-muted-foreground">Entrada (uma vez)</div>
                              <div className="font-medium text-muted-foreground">Mensal (mês 1)</div>
                              <div>Contêineres: {brl(r.custo_conteineres)}</div>
                              <div>Posições pallet ({num(r.posicoes_pallet, 1)}) × preço: {brl(r.mensal_pallet)}</div>
                              <div>Recebimento por caixa: {brl(r.custo_recebimento)}</div>
                              <div>Posições picking ({num(r.posicoes_picking, 1)}) × preço: {brl(r.mensal_picking)}</div>
                              <div>Insumos: {brl(r.custo_insumos)}</div>
                              <div>Seguro: {brl(r.mensal_seguro)}</div>
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
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("m3"), 1)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(soma("skus_novos"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("valor_mercadoria"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("custo_entrada_total"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("incremento_mensal_mes1"))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{brl(soma("expedicao_total_lote"))}</td>
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
