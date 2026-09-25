import { useEffect, useMemo, useState, type ReactNode } from "react";
import { VincularContraparteDialog, type AlvoContraparte } from "./VincularContraparteDialog";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Printer, User } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

import { fmtBRL, fmtCompetencia, fmtData } from "../comissoes/fmt";
import { lerTudo, fmtPct2, fmtInt, SITUACAO, type Linha } from "./dados";
import { BadgeApto, Dica, prontidao } from "./RepresentantesPainel";

function useFailLoud(err: unknown, oque: string) {
  useEffect(() => {
    if (err) toast.error(`Falha ao carregar ${oque}: ${formatError(err)}`);
  }, [err, oque]);
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function Kpi({ l, v }: { l: string; v: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className="mt-1 text-lg font-medium tabular-nums">{v}</div>
    </CardContent></Card>
  );
}

function Graficos({ serie, print }: { serie: Linha[]; print?: boolean }) {
  const dados = serie.map((s) => ({
    mes: fmtCompetencia(s.mes),
    base: Number(s.base_faturada ?? 0),
    apurada: Number(s.comissao_apurada ?? 0),
    prevista: Number(s.comissao_prevista ?? 0),
  }));
  if (dados.length === 0) return <Vazio>Sem série mensal para este representante.</Vazio>;
  const tick = (v: number) => v.toLocaleString("pt-BR", { notation: "compact" });
  const tip = (v: number) => fmtBRL(v);
  const bar = (
    <BarChart data={dados} width={print ? 680 : undefined} height={print ? 240 : undefined}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis dataKey="mes" fontSize={11} /><YAxis tickFormatter={tick} fontSize={11} />
      <RTooltip formatter={tip} /><Legend />
      <Bar dataKey="base" name="Base faturada" fill="hsl(var(--primary))" isAnimationActive={!print} />
      <Bar dataKey="apurada" name="Comissão apurada" fill="hsl(var(--success))" isAnimationActive={!print} />
    </BarChart>
  );
  const line = (
    <LineChart data={dados} width={print ? 680 : undefined} height={print ? 200 : undefined}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
      <XAxis dataKey="mes" fontSize={11} /><YAxis tickFormatter={tick} fontSize={11} />
      <RTooltip formatter={tip} />
      <Line dataKey="prevista" name="Comissão prevista" stroke="hsl(var(--info))" strokeWidth={2} isAnimationActive={!print} />
    </LineChart>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Evolução mensal</CardTitle></CardHeader>
        <CardContent>{print ? bar : <ResponsiveContainer width="100%" height={260}>{bar}</ResponsiveContainer>}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Comissão prevista por mês</CardTitle></CardHeader>
        <CardContent>{print ? line : <ResponsiveContainer width="100%" height={260}>{line}</ResponsiveContainer>}</CardContent></Card>
    </div>
  );
}

function CardCadastro({ v, k, print }: { v?: Linha; k: Linha; print?: boolean }) {
  const [alvo, setAlvo] = useState<AlvoContraparte | null>(null);
  const item = (l: string, val: ReactNode) => (
    <div><div className="text-xs text-muted-foreground">{l}</div><div>{val}</div></div>
  );
  const doc = String(v?.documento ?? "").trim();
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Cadastro</CardTitle>
        {!print && !k.apto_a_pagamento && (
          <Button size="sm" variant="outline" onClick={() => setAlvo({
            vendedor_id: String(k.vendedor_id), nome: v?.nome_exibicao ?? k.representante,
            email: v?.email_contato ?? k.email_contato, telefone: v?.telefone, documento: v?.documento,
          })}>Vincular contraparte</Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
        {item("Nome", v?.nome_exibicao ?? k.representante)}
        {item("E-mail", v?.email_contato ?? k.email_contato ?? "—")}
        {item("Telefone", v?.telefone || "—")}
        {item("Região", v?.regiao || "—")}
        {item("% do FOP", v?.fop_comissao_percent != null && v?.fop_comissao_percent !== ""
          ? <Dica texto="Percentual individual cadastrado no FOP, fora da régua da cartilha">
              <span className="underline decoration-dotted">{fmtPct2(v.fop_comissao_percent)}</span>
            </Dica>
          : "—")}
        {item("Documento", doc || <span className="text-warning">não informado</span>)}
        {item("Empresa", v?.empresa || "—")}
        {item("Último login no FOP", v?.fop_ultimo_login ? new Date(v.fop_ultimo_login).toLocaleString("pt-BR") : "nunca")}
        {item("Última sincronia", v?.sincronizado_em ? new Date(v.sincronizado_em).toLocaleString("pt-BR") : "nunca sincronizado")}
        <div className="sm:col-span-4">
          <div className="text-xs text-muted-foreground mb-1">Prontidão</div>
          <div className="flex flex-wrap gap-1">
            {prontidao({ ...k, documento: v?.documento ?? k.documento, fop_login_count: v?.fop_login_count ?? k.fop_login_count }).map((c) => {
              const clicavel = !print && c.label === "Contraparte" && !c.ok;
              return (
                <Dica key={c.label} texto={clicavel ? `${c.faltaTxt} Clique para vincular.` : c.ok ? c.okTxt : c.faltaTxt}>
                  <Badge variant="outline"
                    onClick={clicavel ? () => setAlvo({ vendedor_id: String(k.vendedor_id), nome: v?.nome_exibicao ?? k.representante,
                      email: v?.email_contato ?? k.email_contato, telefone: v?.telefone, documento: v?.documento }) : undefined}
                    className={cn("px-1.5 py-0 text-[10px] whitespace-nowrap",
                      c.ok ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground",
                      clicavel && "cursor-pointer underline decoration-dotted hover:bg-accent")}>
                    {c.label}
                  </Badge>
                </Dica>
              );
            })}
          </div>
        </div>
      </CardContent>
      {!print && <VincularContraparteDialog alvo={alvo} onClose={() => setAlvo(null)} />}
    </Card>
  );
}

function SituacaoFinanceira({ k }: { k: Linha }) {
  const destaque = (l: string, val: unknown) => (
    <div><div className="text-xs text-muted-foreground">{l}</div>
      <div className={cn("mt-1 text-lg font-medium tabular-nums", Number(val ?? 0) === 0 && "text-muted-foreground/50")}>{fmtBRL(Number(val ?? 0))}</div></div>
  );
  const estorno = Number(k.estorno_a_compensar ?? 0);
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Situação financeira</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4 text-sm">
        {destaque("Recebida", k.comissao_recebida)}
        <div><div className="text-xs text-muted-foreground">Último pagamento</div>
          <div className="mt-1">{k.ultimo_pagamento ? new Date(k.ultimo_pagamento).toLocaleDateString("pt-BR") : "Nunca recebeu"}</div></div>
        <div>
          {destaque("A receber", k.comissao_a_receber)}
          <div className="mt-1 pl-3 text-xs text-muted-foreground space-y-0.5">
            <div className="flex justify-between gap-2"><span>Direito adquirido — cliente já pagou</span>
              <span className="tabular-nums">{fmtBRL(Number(k.a_receber_direito_adquirido ?? 0))}</span></div>
            <div className="flex justify-between gap-2"><span>Depende do cliente pagar</span>
              <span className="tabular-nums">{fmtBRL(Number(k.a_receber_depende_do_cliente ?? 0))}</span></div>
          </div>
        </div>
        <div>
          {destaque("Próximo recebimento", k.proximo_recebimento)}
          <div className="text-xs text-muted-foreground">
            {k.proximo_recebimento_data && <div>{fmtData(k.proximo_recebimento_data)}</div>}
            {k.proximo_recebimento_competencia && <div>Competência {fmtCompetencia(String(k.proximo_recebimento_competencia))}</div>}
          </div>
        </div>
        <div><div className="text-xs text-muted-foreground">Cliente pagou, aguardando liberação</div>
          <div className="tabular-nums">{fmtBRL(Number(k.a_liberar_cliente_ja_pagou ?? 0))}</div></div>
        {estorno > 0 && (
          <div><div className="text-xs text-muted-foreground">Estorno a compensar</div>
            <div className="tabular-nums text-destructive">{fmtBRL(estorno)}</div></div>
        )}
        {k.bloqueio_pagamento === true && (
          <p className="sm:col-span-4 text-xs text-warning">{String(k.bloqueio_motivo ?? "")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({ k, v, serie, print }: { k: Linha; v?: Linha; serie: Linha[]; print?: boolean }) {
  return (
    <div className="space-y-4">
      <CardCadastro v={v} k={k} print={print} />
      <SituacaoFinanceira k={k} />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi l="Vendido" v={fmtBRL(k.valor_vendido_bruto)} />
        <Kpi l="Notas faturadas" v={fmtInt(k.notas_faturadas)} />
        <Kpi l="Base faturada" v={fmtBRL(k.base_faturada)} />
        <Kpi l="Comissão apurada" v={fmtBRL(k.comissao_apurada)} />
        <Kpi l="Liberada" v={fmtBRL(k.comissao_liberada)} />
        <Kpi l="Pendente" v={fmtBRL(k.comissao_pendente)} />
        <Kpi l="Ticket médio" v={fmtBRL(k.ticket_medio)} />
        <Kpi l="Desconto médio %" v={fmtPct2(k.desconto_medio_pct)} />
        <Kpi l="% efetivo médio" v={fmtPct2(k.pct_efetivo_medio)} />
        <Kpi l="Clientes atendidos" v={fmtInt(k.clientes_distintos)} />
      </div>
      <Graficos serie={serie} print={print} />
      <Card className="break-inside-avoid">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Saúde da carteira</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5 text-sm">
          <div><div className="text-xs text-muted-foreground">Carteira a receber</div><div className="tabular-nums">{fmtBRL(k.carteira_a_receber)}</div></div>
          <div><div className="text-xs text-muted-foreground">Carteira vencida</div>
            <div className={Number(k.carteira_vencida) > 0 ? "tabular-nums text-destructive" : "tabular-nums"}>{fmtBRL(k.carteira_vencida)}</div></div>
          <div><div className="text-xs text-muted-foreground">Parcelas vencidas</div><div className="tabular-nums">{fmtInt(k.parcelas_vencidas)}</div></div>
          <div><div className="text-xs text-muted-foreground">Maior atraso</div><div className="tabular-nums">{fmtInt(k.maior_atraso_dias)} dias</div></div>
          <div><div className="text-xs text-muted-foreground">Comissão travada</div><div className="tabular-nums">{fmtBRL(k.comissao_travada_inadimplencia)}</div></div>
          <p className="sm:col-span-5 text-xs text-muted-foreground">
            Comissão retida por inadimplência do cliente — não é estornada, fica aguardando o pagamento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Extrato({ det }: { det: Linha[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const r of det) {
      const key = String(r.nf_id ?? r.nf);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    for (const g of m.values()) g.sort((a, b) => Number(a.numero_parcela ?? 0) - Number(b.numero_parcela ?? 0));
    return [...m.values()];
  }, [det]);
  const tot = useMemo(() => {
    let apurada = 0, liberado = 0;
    for (const g of grupos) apurada += Number(g[0].comissao_da_nota ?? 0);
    for (const r of det) liberado += Number(r.valor_liberado ?? 0);
    return { apurada, liberado, aLiberar: apurada - liberado };
  }, [grupos, det]);
  if (det.length === 0) return <Vazio>Nenhuma nota comissionada para este representante ainda.</Vazio>;
  return (
    <Card><CardContent className="p-0">
      <Table className="text-xs" containerClassName="max-h-[min(70vh,48rem)]">
        <TableHeader><TableRow>
          {["NF", "Emissão", "Pedido", "Cliente", "Base comissionável", "Desconto %", "% efetivo", "Comissão da nota", "Parcela", "Valor da parcela", "Vencimento", "Situação", "Comissão da parcela", "Valor liberado", "Data liquidação"]
            .map((h, i) => <TableHead key={h} className={cn("sticky top-0 z-40 whitespace-nowrap bg-muted", i === 0 && "left-0 z-50 w-20 border-r")}>{h}</TableHead>)}
        </TableRow></TableHeader>

        <TableBody>
          {grupos.map((g) => g.map((r, i) => {
            const s = SITUACAO[r.situacao_parcela] ?? { label: r.situacao_parcela ?? "—", cls: "" };
            return (
              <TableRow key={`${r.nf_id}-${r.titulo_id ?? i}`} className={i === 0 ? "border-t-2" : ""}>
                <TableCell className="sticky left-0 z-20 w-20 border-r bg-card">{i === 0 ? r.nf : ""}</TableCell>
                <TableCell>{i === 0 ? fmtData(r.nf_emissao) : ""}</TableCell>
                <TableCell>{i === 0 ? r.pedido : ""}</TableCell>
                <TableCell className="max-w-[180px] truncate" title={r.cliente}>{i === 0 ? r.cliente : ""}</TableCell>
                <TableCell className="tabular-nums">{i === 0 ? fmtBRL(r.base_comissionavel) : ""}</TableCell>
                <TableCell className="tabular-nums">{i === 0 ? fmtPct2(r.desconto_pct) : ""}</TableCell>
                <TableCell className="tabular-nums">{i === 0 ? fmtPct2(r.pct_efetivo) : ""}</TableCell>
                <TableCell className="tabular-nums">{i === 0 ? fmtBRL(r.comissao_da_nota) : ""}</TableCell>
                <TableCell>{r.numero_parcela ? `${r.numero_parcela}/${r.total_parcelas ?? "?"}` : "—"}</TableCell>
                <TableCell className="tabular-nums">{fmtBRL(r.valor_parcela)}</TableCell>
                <TableCell>{fmtData(r.vencimento)}</TableCell>
                <TableCell><Badge variant="outline" className={`whitespace-nowrap ${s.cls}`}>{s.label}</Badge></TableCell>
                <TableCell className="tabular-nums">{fmtBRL(r.comissao_da_parcela)}</TableCell>
                <TableCell className="tabular-nums">{fmtBRL(r.valor_liberado)}</TableCell>
                <TableCell>{fmtData(r.data_liquidacao)}</TableCell>
              </TableRow>
            );
          }))}
        </TableBody>
        <TableFooter><TableRow>
          <TableCell colSpan={15} className="text-sm">
            Comissão total apurada: <b className="font-medium">{fmtBRL(tot.apurada)}</b> · Total liberado: <b className="font-medium">{fmtBRL(tot.liberado)}</b> · Total a liberar: <b className="font-medium">{fmtBRL(tot.aLiberar)}</b>
          </TableCell>
        </TableRow></TableFooter>
      </Table>
    </CardContent></Card>
  );
}

function Pagamentos({ pags }: { pags: Linha[] }) {
  if (pags.length === 0)
    return <Vazio>Nenhuma competência fechada ainda. O fechamento roda automaticamente no dia 1 de cada mês.</Vazio>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Competência</TableHead><TableHead>Valor total</TableHead><TableHead>Pagar até</TableHead><TableHead>Título a pagar</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {pags.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{fmtCompetencia(p.competencia)}</TableCell>
              <TableCell className="tabular-nums">{fmtBRL(p.valor_total)}</TableCell>
              <TableCell>{fmtData(p.pagar_ate)}</TableCell>
              <TableCell>{p.cpr_id
                ? <Badge variant="outline" className="bg-success/15 text-success border-success/30">Gerado</Badge>
                : <Badge variant="outline" className="bg-muted text-muted-foreground">Sem título</Badge>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

export default function RepresentanteFicha() {
  const { vendedorId = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const aba = sp.get("aba") ?? "resumo";

  const kq = useQuery({
    queryKey: ["representante-kpi", vendedorId],
    queryFn: () => lerTudo("vw_representante_financeiro", (x) => x.eq("vendedor_id", vendedorId)),
  });
  const sq = useQuery({
    queryKey: ["representante-serie", vendedorId],
    queryFn: () => lerTudo("vw_representante_serie_mensal", (x) => x.eq("vendedor_id", vendedorId), { col: "mes" }),
  });
  const dq = useQuery({
    queryKey: ["representante-detalhe", vendedorId],
    queryFn: () => lerTudo("vw_comissao_detalhe", (x) => x.eq("vendedor_id", vendedorId), { col: "nf_emissao", asc: false }),
  });
  const pq = useQuery({
    queryKey: ["representante-pagamentos", vendedorId],
    queryFn: () => lerTudo("comissao_extrato", (x) => x.eq("vendedor_id", vendedorId), { col: "competencia", asc: false }),
  });
  const vq = useQuery({
    queryKey: ["vendedor-cadastro", vendedorId],
    queryFn: () => lerTudo("vendedores", (x) => x.eq("id", vendedorId)),
  });
  useFailLoud(vq.error, "cadastro do representante");
  useFailLoud(kq.error, "indicadores do representante");
  useFailLoud(sq.error, "série mensal");
  useFailLoud(dq.error, "extrato de comissão");
  useFailLoud(pq.error, "pagamentos");

  const k = kq.data?.[0];
  const serie = sq.data ?? [], det = dq.data ?? [], pags = pq.data ?? [];

  if (kq.isLoading) return <PageShell><div className="p-8 text-muted-foreground">Carregando…</div></PageShell>;
  if (!k)
    return (
      <PageShell>
        <Vazio>{kq.error ? `Não foi possível carregar: ${formatError(kq.error)}` : "Representante não encontrado na base de indicadores."}
          {" "}<Link className="underline" to="/comercial/representantes">Voltar ao painel</Link></Vazio>
      </PageShell>
    );

  const periodo = `${fmtData(k.primeira_venda)} → ${fmtData(k.ultima_venda)}`;
  const competencia = sp.get("competencia");
  const parametrosImpressao = new URLSearchParams();
  if (competencia) parametrosImpressao.set("competencia", competencia);
  const rotaImpressao = `/comercial/representantes/${vendedorId}/extrato-impressao?${parametrosImpressao.toString()}`;

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Representantes", to: "/comercial/representantes" }, { label: k.representante }]}
        titulo={k.representante}
        icone={User}
        estado={`${k.email_contato ?? "sem e-mail"} · Relacionamento: ${periodo}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/comercial/representantes"><ArrowLeft className="h-4 w-4 mr-1" />Painel</Link></Button>
        <Badge variant="outline" className="capitalize">{k.tipo}</Badge>
        <BadgeApto apto={!!k.apto_a_pagamento} />
        <div className="flex-1" />
        <Button asChild size="sm" variant="outline">
          <Link to={rotaImpressao}><Printer className="h-4 w-4 mr-1" />Baixar PDF</Link>
        </Button>
      </div>

      <Tabs value={aba} onValueChange={(v) => setSp((p) => { p.set("aba", v); return p; }, { replace: true })} className="mt-4">
        <TabsList>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="extrato">Extrato</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="resumo" className="mt-4"><Resumo k={k} v={vq.data?.[0]} serie={serie} /></TabsContent>
        <TabsContent value="extrato" className="mt-4">{dq.isLoading ? "Carregando…" : <Extrato det={det} />}</TabsContent>
        <TabsContent value="pagamentos" className="mt-4">{pq.isLoading ? "Carregando…" : <Pagamentos pags={pags} />}</TabsContent>
      </Tabs>
    </PageShell>
  );
}
