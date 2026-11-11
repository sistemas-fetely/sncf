import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ordenarPor, SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { useEstadoTela } from "@/lib/navegacao";
import { alertaDevolucoes, alertaNoPrazo, analisarPeriodo, type GrupoPeriodo } from "@/lib/logistica/entregasPeriodo";
import { ddmm } from "@/lib/logistica/formato";
import type { RemessaRow } from "@/hooks/logistica/useLogisticaRemessas";
import { cn } from "@/lib/utils";
import { Indicador } from "@/components/shared/Indicador";

const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (n: number | null) => n == null ? "—" : decimal.format(n);
const dias = (n: number | null) => n == null ? "—" : `${num(n)} dias`;
const pct = (n: number | null) => n == null ? "—" : `${num(n)}%`;
const destino = (r: RemessaRow) => [r.cidade_destino, r.uf_destino].filter(Boolean).join("/") || "—";
type ColGrupo = "chave" | "remessas" | "entregues" | "prazoMedio" | "pctNoPrazo" | "atrasoMedio";
const valoresGrupo = {
  chave: (r: GrupoPeriodo) => r.chave, remessas: (r: GrupoPeriodo) => r.remessas,
  entregues: (r: GrupoPeriodo) => r.entregues, prazoMedio: (r: GrupoPeriodo) => r.prazoMedio,
  pctNoPrazo: (r: GrupoPeriodo) => r.pctNoPrazo, atrasoMedio: (r: GrupoPeriodo) => r.atrasoMedio,
};

function TabelaGrupo({ titulo, rotulo, linhas, filtroUf, selecionarUf }: {
  titulo: string; rotulo: string; linhas: GrupoPeriodo[]; filtroUf?: string | null; selecionarUf?: (uf: string) => void;
}) {
  const [nav, setNav] = useEstadoTela({ coluna: "remessas", direcao: "desc" }, { prefixo: rotulo === "UF" ? "epuf" : "epcanal" });
  const coluna = nav.coluna in valoresGrupo ? nav.coluna as ColGrupo : "remessas";
  const sort: SortState<ColGrupo> = { column: coluna, direction: nav.direcao === "asc" ? "asc" : "desc" };
  const onSort = (v: SortState<ColGrupo> | null) => setNav({ coluna: v?.column ?? "remessas", direcao: v?.direction ?? "desc" });
  const ordenadas = ordenarPor(linhas, sort, valoresGrupo);
  return <section className="min-w-0 space-y-2">
    <h3 className="text-sm font-medium">{titulo}</h3>
    <div className="max-h-80 overflow-auto"><Table className="text-xs [&_th]:px-1.5 [&_th]:text-xs [&_th_button]:gap-1 [&_td]:px-1.5 [&_td]:py-2">
      <TableHeader><TableRow>
        <SortableTableHead column="chave" sort={sort} onSort={onSort}>{rotulo}</SortableTableHead>
        <SortableTableHead column="remessas" sort={sort} onSort={onSort} align="right">Remessas</SortableTableHead>
        <SortableTableHead column="entregues" sort={sort} onSort={onSort} align="right">Entregues</SortableTableHead>
        <SortableTableHead column="prazoMedio" sort={sort} onSort={onSort} align="right">Prazo médio</SortableTableHead>
        <SortableTableHead column="pctNoPrazo" sort={sort} onSort={onSort} align="right">No prazo %</SortableTableHead>
        <SortableTableHead column="atrasoMedio" sort={sort} onSort={onSort} align="right">Atraso médio</SortableTableHead>
      </TableRow></TableHeader>
      <TableBody>{ordenadas.map(r => <TableRow key={r.chave} className={cn(filtroUf === r.chave && "bg-primary/10")}>
        <TableCell>{selecionarUf ? <Button size="sm" variant="ghost" onClick={() => selecionarUf(r.chave)} aria-label={`Filtrar UF ${r.chave}`} className="h-7 px-2">{r.chave}</Button> : <span className="uppercase">{r.chave}</span>}</TableCell>
        <TableCell className="text-right tabular-nums">{r.remessas}</TableCell>
        <TableCell className="text-right tabular-nums">{r.entregues}</TableCell>
        <TableCell className={cn("text-right tabular-nums whitespace-nowrap", r.prazoMedio == null && "text-muted-foreground")}>{num(r.prazoMedio)}</TableCell>
        <TableCell className={cn("text-right tabular-nums", r.pctNoPrazo == null && "text-muted-foreground")}>{pct(r.pctNoPrazo)}</TableCell>
        <TableCell className={cn("text-right tabular-nums", r.atrasoMedio == null && "text-muted-foreground")}>{num(r.atrasoMedio)}</TableCell>
      </TableRow>)}</TableBody>
    </Table></div>
  </section>;
}

function TooltipSemana({ active, payload }: { active?: boolean; payload?: { payload: GrupoPeriodo }[] }) {
  const semana = payload?.[0]?.payload;
  if (!active || !semana) return null;
  return <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md space-y-1">
    <p className="font-medium">Semana de {ddmm(semana.chave)}</p>
    <p>Remessas: {semana.remessas}</p><p>Entregues: {semana.entregues}</p>
    <p>Prazo médio: {dias(semana.prazoMedio)}</p><p>No prazo: {pct(semana.pctNoPrazo)}</p>
  </div>;
}

export function AnaliseEntregasPeriodo({ linhas, filtroUf, selecionarUf, abrirRemessa }: {
  linhas: RemessaRow[]; filtroUf: string | null; selecionarUf: (uf: string) => void; abrirRemessa: (pedido: string) => void;
}) {
  const a = useMemo(() => analisarPeriodo(linhas), [linhas]);
  const r = a.resumo;
  return <div className="space-y-6 border-b pb-6">
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <Indicador titulo="Entregues" valor={r.entregues} subtexto={`de ${r.remessas} remessas`} />
      <Indicador titulo="Prazo médio" valor={dias(r.prazoMedio)} />
      <Indicador titulo="No prazo" valor={pct(r.pctNoPrazo)} subtexto={`${r.noPrazo} de ${r.comPrevisao} com previsão`} alerta={alertaNoPrazo(r.pctNoPrazo)} />
      <Indicador titulo="Atraso médio" valor={dias(r.atrasoMedio)} subtexto={`em ${r.atrasadas} atrasadas`} />
      <Indicador titulo="Reentregas" valor={r.reentregas} />
      <Indicador titulo="Devoluções" valor={r.devolucoes} alerta={alertaDevolucoes(r.devolucoes)} />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">Evolução semanal</h3>
        <ChartContainer className="h-72 w-full aspect-auto" config={{ remessas: { label: "Remessas", color: "hsl(var(--primary))" }, pctNoPrazo: { label: "No prazo", color: "hsl(var(--info))" } }}>
          <ComposedChart data={a.semanas} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="chave" tickFormatter={ddmm} tick={{ fontSize: 11 }} minTickGap={16} />
            <YAxis yAxisId="remessas" allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} width={40} tick={{ fontSize: 11 }} />
            <Tooltip content={<TooltipSemana />} /><Legend />
            <Bar yAxisId="remessas" dataKey="remessas" name="Remessas despachadas" fill="var(--color-remessas)" maxBarSize={32} />
            <Line yAxisId="pct" dataKey="pctNoPrazo" name="No prazo %" stroke="var(--color-pctNoPrazo)" strokeWidth={2} connectNulls={false} dot={{ r: 3 }} />
          </ComposedChart>
        </ChartContainer>
      </section>
      <TabelaGrupo titulo="Por destino" rotulo="UF" linhas={a.destinos} filtroUf={filtroUf} selecionarUf={selecionarUf} />
    </div>
    <div className={cn("grid gap-6", a.canais.length > 1 && "xl:grid-cols-2")}>
      {a.canais.length > 1 && <TabelaGrupo titulo="Por canal" rotulo="Canal" linhas={a.canais} />}
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">Maiores atrasos</h3>
        {!a.atrasos.length ? <p className="py-6 text-sm text-muted-foreground">Nenhuma entrega atrasada no período.</p> :
          <div className="overflow-x-auto"><Table className="table-fixed text-xs [&_th]:px-1 [&_td]:px-1 [&_td]:py-2">
            <TableHeader><TableRow><TableHead className="w-[17%]">Referência</TableHead><TableHead className="w-[25%]">Cliente</TableHead><TableHead className="w-[22%]">Destino</TableHead><TableHead className="w-[12%]">Previsão</TableHead><TableHead className="w-[12%]">Entregue em</TableHead><TableHead className="w-[12%] text-right">Atraso (d)</TableHead></TableRow></TableHeader>
            <TableBody>{a.atrasos.map((r, i) => <TableRow key={r.pedido_id ?? i} className="cursor-pointer" onClick={() => r.pedido_id && abrirRemessa(r.pedido_id)}>
              <TableCell>{r.pedido_id ? <Button variant="link" title={r.referencia} className="h-auto max-w-full justify-start p-0" onClick={e => { e.stopPropagation(); if (r.pedido_id) abrirRemessa(r.pedido_id); }}><span className="truncate">{r.referencia}</span></Button> : r.referencia}</TableCell>
              <TableCell className="max-w-[160px] truncate" title={r.cliente ?? undefined}>{r.cliente ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="break-words">{destino(r)}</TableCell><TableCell className={cn(!r.previsao_entrega && "text-muted-foreground")}>{ddmm(r.previsao_entrega)}</TableCell>
              <TableCell>{ddmm(r.entregue_em)}</TableCell><TableCell className="text-right tabular-nums text-warning">{r.dias_atraso}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>}
      </section>
    </div>
  </div>;
}