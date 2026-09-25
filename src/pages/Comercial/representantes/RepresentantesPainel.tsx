import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaReconciliacao } from "./AbaReconciliacao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, ArrowUpDown, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { fmtBRL, fmtData } from "../comissoes/fmt";
import { lerTudo, fmtInt, TOOLTIP_SEM_CONTRAPARTE, type Linha } from "./dados";
import { VincularContraparteDialog, type AlvoContraparte } from "./VincularContraparteDialog";

type Col = { k: string; label: string; tipo: "brl" | "int" };
// Tabela com 11 colunas (Representante + Região + estas 3 + 3 novas + as 3 FIN).
// As demais métricas continuam na ficha do representante (aba Resumo).
// Mesmo padrão de fonte e proporções das outras tabelas grandes (Títulos a Receber):
// fonte padrão, larguras naturais — legibilidade vem antes de caber.
const COLS: Col[] = [
  { k: "pedidos_total", label: "Pedidos", tipo: "int" },
  { k: "clientes_distintos", label: "Clientes", tipo: "int" },
  { k: "valor_vendido_bruto", label: "Vendido", tipo: "brl" },
];

function fmt(c: Col, v: unknown) {
  return c.tipo === "brl" ? fmtBRL(v as number) : fmtInt(v);
}

export function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="max-w-xs">{texto}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BadgeApto({ apto }: { apto: boolean }) {
  if (apto) return <Badge className="bg-success/15 text-success border-success/30" variant="outline">Apto</Badge>;
  return (
    <Dica texto={TOOLTIP_SEM_CONTRAPARTE}>
      <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Sem contraparte</Badge>
    </Dica>
  );
}

export type Chip = { label: string; ok: boolean; okTxt: string; faltaTxt: string };
export function prontidao(r: Linha): Chip[] {
  return [
    { label: "Documento", ok: !!String(r.documento ?? "").trim(), okTxt: "CPF/CNPJ cadastrado no FOP.",
      faltaTxt: "Sem CPF/CNPJ no cadastro do FOP. Sem documento não é possível criar a contraparte nem pagar a comissão." },
    { label: "Contraparte", ok: !!r.apto_a_pagamento, okTxt: "Tem cadastro em parceiros comerciais.", faltaTxt: TOOLTIP_SEM_CONTRAPARTE },
    { label: "Já vendeu", ok: Number(r.pedidos_total ?? 0) > 0, okTxt: "Tem pedidos registrados.",
      faltaTxt: "Nenhum pedido registrado para este representante ainda." },
    { label: "Já logou", ok: Number(r.fop_login_count ?? 0) > 0, okTxt: "Já entrou no FOP.",
      faltaTxt: "Nunca entrou no FOP — confira se recebeu o acesso." },
  ];
}

const FIN: { k: string; label: string; dica?: string }[] = [
  { k: "comissao_recebida", label: "Recebida", dica: "Tudo que o representante já recebeu de fato — título de comissão quitado." },
  { k: "comissao_a_receber", label: "A receber" },
  { k: "proximo_recebimento", label: "Próximo recebimento", dica: "Valor da comissão a ser paga no próximo ciclo de pagamento." },
];

function dicaAReceber(r: Linha) {
  return `Tudo que ainda falta o representante receber pelos pedidos já vendidos. Direito adquirido (cliente já pagou): ${fmtBRL(Number(r.a_receber_direito_adquirido ?? 0))} · Depende do cliente pagar: ${fmtBRL(Number(r.a_receber_depende_do_cliente ?? 0))}`;
}

const FILTROS = [
  ["todos", "Todos"], ["ativos", "Ativos"], ["com_venda", "Com venda"],
  ["prontos", "Prontos para pagamento"], ["pendencias", "Pendências"],
] as const;
type Filtro = (typeof FILTROS)[number][0];

type ErroSync = { nome?: string; nome_completo?: string; email?: string; motivo?: string; erro?: string };

export default function RepresentantesPainel() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba") === "reconciliacao" ? "reconciliacao" : "painel";
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ord, setOrd] = useState<{ k: string; asc: boolean }>({ k: "valor_vendido_bruto", asc: false });
  const [sincronizando, setSincronizando] = useState(false);
  const [errosSync, setErrosSync] = useState<ErroSync[] | null>(null);
  const [alvo, setAlvo] = useState<AlvoContraparte | null>(null);

  const q = useQuery({
    queryKey: ["representante-kpi"],
    queryFn: () => lerTudo("vw_representante_financeiro", (x) => x.eq("tipo", "representante")),
  });
  const vq = useQuery({
    queryKey: ["vendedores-espelho"],
    queryFn: () => lerTudo("vendedores", undefined, undefined, "id,documento,regiao,telefone,fop_comissao_percent,fop_login_count,sincronizado_em"),
  });
  useEffect(() => {
    if (q.error) toast.error(`Falha ao carregar representantes: ${formatError(q.error)}`);
  }, [q.error]);
  useEffect(() => {
    if (vq.error) toast.error(`Falha ao carregar cadastro dos vendedores: ${formatError(vq.error)}`);
  }, [vq.error]);

  const ultimaSync = useMemo(() => {
    let max: string | null = null;
    for (const v of vq.data ?? []) if (v.sincronizado_em && (!max || v.sincronizado_em > max)) max = v.sincronizado_em;
    return max;
  }, [vq.data]);

  const linhas = useMemo(() => {
    const m = new Map((vq.data ?? []).map((v) => [v.id, v]));
    return (q.data ?? []).map((r): Linha => {
      const v: Linha = m.get(r.vendedor_id) ?? {};
      return { ...v, ...r, documento: v.documento, regiao: v.regiao, telefone: v.telefone,
        fop_comissao_percent: v.fop_comissao_percent, fop_login_count: v.fop_login_count };
    });
  }, [q.data, vq.data]);

  const tot = useMemo(() => {
    const s = (k: string) => linhas.reduce((a, r) => a + Number(r[k] ?? 0), 0);
    return {
      vendido: s("valor_vendido_bruto"), recebida: s("comissao_recebida"), aReceber: s("comissao_a_receber"),
      proxima: s("proximo_recebimento"), vencida: s("carteira_vencida"),
    };
  }, [linhas]);

  const vis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let f = t ? linhas.filter((r) => String(r.representante ?? "").toLowerCase().includes(t)) : linhas;
    f = f.filter((r) => {
      const doc = !!String(r.documento ?? "").trim();
      if (filtro === "ativos") return !!r.ativo;
      if (filtro === "com_venda") return Number(r.pedidos_total ?? 0) > 0;
      if (filtro === "prontos") return doc && !!r.apto_a_pagamento;
      if (filtro === "pendencias") return !doc || !r.apto_a_pagamento;
      return true;
    });
    return [...f].sort((a: Linha, b: Linha) => {
      const va = a[ord.k], vb = b[ord.k];
      const cmp = ["representante", "ultima_venda", "regiao"].includes(ord.k)
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : ord.k === "ultima_venda_data"
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : Number(va ?? 0) - Number(vb ?? 0);
      return ord.asc ? cmp : -cmp;
    });
  }, [linhas, busca, ord, filtro]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-vendedores-fop", { body: {} });
      if (error) {
        let detalhe = formatError(error);
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) { const b = await ctx.json(); if (b?.erro) detalhe = b.erro; }
        } catch { /* mantém a mensagem original */ }
        throw new Error(detalhe);
      }
      if (!data || typeof data !== "object") throw new Error("A sincronia não devolveu resultado.");
      const d = data as { criados?: number; atualizados?: number; recebidos?: number; erros?: ErroSync[] };
      toast.success(`${d.criados ?? 0} criados, ${d.atualizados ?? 0} atualizados`, {
        description: d.recebidos != null ? `${d.recebidos} recebidos do FOP` : undefined,
      });
      if (Array.isArray(d.erros) && d.erros.length > 0) setErrosSync(d.erros);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["representante-kpi"] }),
        qc.invalidateQueries({ queryKey: ["vendedores-espelho"] }),
      ]);
    } catch (e) {
      toast.error(`Falha ao sincronizar do FOP: ${formatError(e)}`);
    } finally {
      setSincronizando(false);
    }
  }

  // Mesmo padrão de tabela fixa da Mesa de Produto / Conciliação: cabeçalho sticky top-0
  // dentro do container rolável da Table, e primeira coluna sticky left-0.
  const th = (k: string, label: string, extra?: string, dica?: string) => {
    const btn = (
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setOrd((o) => ({ k, asc: o.k === k ? !o.asc : false }))}>
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    );
    return (
      <TableHead key={k} className={cn("sticky top-0 z-40 bg-muted align-bottom leading-tight", extra)}>
        {dica ? <Dica texto={dica}>{btn}</Dica> : btn}
      </TableHead>
    );
  };
  const thFixo = "sticky left-0 z-50 border-r bg-muted";
  const tdFixo = "sticky left-0 z-20 border-r bg-card";

  const DICA_DESCONTO = "Desconto médio concedido nas notas já apuradas. Quanto maior o desconto, menor o percentual de comissão, conforme a régua.";
  const dicaMedia3m = (r: Linha) => {
    const meses = Number(r.meses_ativos_90d ?? 0);
    let t = `Média mensal dos últimos 90 dias: ${fmtBRL(Number(r.vendido_90d ?? 0))} em ${meses} mês(es) com venda.`;
    if (meses < 3) t += " Atenção: menos de 3 meses de operação — a média ainda não é representativa.";
    return t;
  };
  const fmtPct = (v: unknown) =>
    `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;


  const cards = [
    ["Vendido no total", tot.vendido], ["Recebida", tot.recebida], ["A receber", tot.aReceber],
    ["Próximo recebimento", tot.proxima], ["Carteira vencida", tot.vencida],
  ] as const;
  const NCOL = COLS.length + 3 + FIN.length + 2; // + Representante + Região + 3 colunas novas

  return (
    <PageShell>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Representantes" }]}
        titulo="Gestão de Representantes"
        icone={Users}
        estado={`Espelho do cadastro do FOP. O FOP cadastra, o SNCF lê.${ultimaSync ? ` Última sincronia: ${new Date(ultimaSync).toLocaleString("pt-BR")}` : ""}`}
      />
      <Tabs value={aba} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set("aba", v); return n; }, { replace: true })}>
        <TabsList className="mb-3">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="reconciliacao">Reconciliação</TabsTrigger>
        </TabsList>
        <TabsContent value="reconciliacao"><AbaReconciliacao /></TabsContent>
        <TabsContent value="painel">
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={sincronizar} disabled={sincronizando}>
          <RefreshCw className={cn("h-4 w-4 mr-1", sincronizando && "animate-spin")} />
          {sincronizando ? "Sincronizando…" : "Sincronizar do FOP"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([l, v]) => (
          <Card key={l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={cn("mt-1 text-lg font-medium tabular-nums", l === "Carteira vencida" && v > 0 && "text-destructive")}>{fmtBRL(v)}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar representante" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map(([k, l]) => (
            <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} onClick={() => setFiltro(k)}>{l}</Button>
          ))}
        </div>
      </div>

      <Card className="mt-3"><CardContent className="p-0">
        <Table containerClassName="max-h-[min(70vh,48rem)]" className="w-full">
          <TableHeader><TableRow>
            {th("representante", "Representante", thFixo)}
            {th("regiao", "Região")}
            {COLS.map((c) => th(c.k, c.label, "text-right"))}
            {th("ultima_venda_data", "Última venda", "text-right")}
            {th("desconto_medio_pct", "Desconto médio %", "text-right", DICA_DESCONTO)}
            {th("media_mensal_3m", "Média mensal (3m)", "text-right")}
            {FIN.map((c) => th(c.k, c.label, "text-right", c.dica))}
          </TableRow></TableHeader>

          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={NCOL} className="text-center text-muted-foreground py-8">Carregando…</TableCell></TableRow>
            ) : vis.length === 0 ? (
              <TableRow><TableCell colSpan={NCOL} className="text-center text-muted-foreground py-8">
                {linhas.length === 0
                  ? "Nenhum representante espelhado ainda. Use \"Sincronizar do FOP\" para trazer o cadastro."
                  : "Nenhum representante bate com a busca ou o filtro."}
              </TableCell></TableRow>
            ) : vis.map((r) => {
              const semVenda = Number(r.pedidos_total ?? 0) === 0;
              return (
                <TableRow key={r.vendedor_id} className={cn("cursor-pointer", semVenda && "opacity-60")}
                  onClick={() => nav(`/comercial/representantes/${r.vendedor_id}`)}>
                  <TableCell className={cn("font-medium", tdFixo)}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate" title={String(r.representante ?? "")}>{r.representante}</span>
                      {r.bloqueio_pagamento === true && (
                        <span onClick={(e) => e.stopPropagation()}>
                          <Dica texto={String(r.bloqueio_motivo ?? "")}>
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="Pagamento bloqueado" />
                          </Dica>
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="truncate" title={String(r.regiao ?? "")}>{r.regiao || "—"}</TableCell>
                  {COLS.map((c) => (
                    <TableCell key={c.k} className="whitespace-nowrap text-right tabular-nums">
                      {fmt(c, r[c.k])}
                    </TableCell>
                  ))}
                  {(() => {
                    const uv = r.ultima_venda_valor != null ? Number(r.ultima_venda_valor) : null;
                    const dias = r.dias_sem_vender != null ? Number(r.dias_sem_vender) : null;
                    const corData = dias != null && dias > 90 ? "text-destructive" : dias != null && dias > 60 ? "text-warning" : "text-muted-foreground";
                    const dicaUv = dias != null && dias > 60
                      ? `Sem vender há ${dias} dias.`
                      : `Pedido ${r.ultima_venda_pedido ?? "—"}`;
                    return (
                      <TableCell className="whitespace-nowrap text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                        {uv == null ? <span className="text-muted-foreground/50">—</span> : (
                          <Dica texto={dicaUv}>
                            <span className="underline decoration-dotted">
                              {fmtBRL(uv)}
                              {r.ultima_venda_data && (
                                <div className={cn("text-[10px]", corData)}>{fmtData(r.ultima_venda_data as string)}</div>
                              )}
                            </span>
                          </Dica>
                        )}
                      </TableCell>
                    );
                  })()}
                  <TableCell className="whitespace-nowrap text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                    {r.desconto_medio_pct == null ? <span className="text-muted-foreground/50">—</span> : (
                      <Dica texto={DICA_DESCONTO}>
                        <span className="underline decoration-dotted">{fmtPct(r.desconto_medio_pct)}</span>
                      </Dica>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                    {Number(r.media_mensal_3m ?? 0) === 0 ? <span className="text-muted-foreground/50">—</span> : (
                      <Dica texto={dicaMedia3m(r)}>
                        <span className="underline decoration-dotted">{fmtBRL(Number(r.media_mensal_3m))}</span>
                      </Dica>
                    )}
                  </TableCell>
                  {FIN.map((c) => {
                    const n = Number(r[c.k] ?? 0);
                    const vazio = c.k === "proximo_recebimento" && n === 0;
                    const valor = (
                      <span className={cn(vazio && "text-muted-foreground/50")}>
                        {vazio ? "—" : fmtBRL(n)}
                        {c.k === "proximo_recebimento" && !vazio && r.proximo_recebimento_data && (
                          <div className="text-[10px] text-muted-foreground">{fmtData(r.proximo_recebimento_data as string)}</div>
                        )}
                      </span>
                    );
                    return (
                      <TableCell key={c.k} className={cn("whitespace-nowrap text-right tabular-nums", !vazio && n === 0 && "text-muted-foreground/50")}
                        onClick={c.k === "comissao_a_receber" ? (e) => e.stopPropagation() : undefined}>
                        {c.k === "comissao_a_receber" ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Dica texto={dicaAReceber(r)}><span className="underline decoration-dotted">{valor}</span></Dica>
                            {Number(r.carteira_vencida ?? 0) > 0 && (
                              <Dica texto={dicaInadimplencia(r)}>
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive cursor-help" aria-label="Carteira vencida" />
                              </Dica>
                            )}
                          </span>
                        ) : valor}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!errosSync} onOpenChange={(o) => !o && setErrosSync(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registros que o SNCF não conseguiu espelhar ({errosSync?.length ?? 0})</DialogTitle></DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {(errosSync ?? []).map((e, i) => (
              <div key={i} className="rounded-md border p-2">
                <div className="font-medium">{e.nome ?? e.nome_completo ?? e.email ?? "(sem nome)"}</div>
                <div className="text-muted-foreground">{e.motivo ?? e.erro ?? JSON.stringify(e)}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <VincularContraparteDialog alvo={alvo} onClose={() => setAlvo(null)} />
    </PageShell>
  );
}
