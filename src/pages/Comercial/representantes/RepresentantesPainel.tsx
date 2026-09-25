import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaReconciliacao } from "./AbaReconciliacao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, ArrowUpDown, Search, RefreshCw } from "lucide-react";
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
import { lerTudo, fmtPct2, fmtInt, TOOLTIP_SEM_CONTRAPARTE, type Linha } from "./dados";
import { VincularContraparteDialog, type AlvoContraparte } from "./VincularContraparteDialog";

type Col = { k: string; label: string; tipo: "brl" | "int" | "pct" | "data" };
const COLS: Col[] = [
  { k: "pedidos_total", label: "Pedidos", tipo: "int" },
  { k: "notas_faturadas", label: "Notas", tipo: "int" },
  { k: "clientes_distintos", label: "Clientes", tipo: "int" },
  { k: "valor_vendido_bruto", label: "Vendido", tipo: "brl" },
  { k: "ticket_medio", label: "Ticket médio", tipo: "brl" },
  { k: "desconto_medio_pct", label: "Desconto médio %", tipo: "pct" },
  { k: "pct_efetivo_medio", label: "% efetivo", tipo: "pct" },
  { k: "comissao_apurada", label: "Comissão apurada", tipo: "brl" },
  { k: "comissao_liberada", label: "Liberada", tipo: "brl" },
  { k: "comissao_pendente", label: "Pendente", tipo: "brl" },
  { k: "prev_comissao_30d", label: "Previsto 30d", tipo: "brl" },
  { k: "carteira_a_receber", label: "Carteira a receber", tipo: "brl" },
  { k: "carteira_vencida", label: "Vencida", tipo: "brl" },
  { k: "inadimplencia_pct", label: "Inadimplência %", tipo: "pct" },
  { k: "ultima_venda", label: "Última venda", tipo: "data" },
];

function fmt(c: Col, v: unknown) {
  if (c.tipo === "brl") return fmtBRL(v as number);
  if (c.tipo === "int") return fmtInt(v);
  if (c.tipo === "pct") return fmtPct2(v);
  return fmtData(v as string);
}

function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
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

type Chip = { label: string; ok: boolean; okTxt: string; faltaTxt: string };
function prontidao(r: Linha): Chip[] {
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
    queryFn: () => lerTudo("vw_representante_kpi", (x) => x.eq("tipo", "representante")),
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
      vendido: s("valor_vendido_bruto"), apurada: s("comissao_apurada"), liberada: s("comissao_liberada"),
      pendente: s("comissao_pendente"), prev30: s("prev_comissao_30d"), vencida: s("carteira_vencida"),
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
  const th = (k: string, label: string, extra?: string) => (
    <TableHead key={k} className={cn("sticky top-0 z-40 whitespace-nowrap bg-muted", extra)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setOrd((o) => ({ k, asc: o.k === k ? !o.asc : false }))}>
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );
  const thFixo = "sticky left-0 z-50 w-56 border-r bg-muted";
  const tdFixo = "sticky left-0 z-20 w-56 border-r bg-card";


  const cards = [
    ["Vendido no total", tot.vendido], ["Comissão apurada", tot.apurada], ["Comissão liberada", tot.liberada],
    ["Comissão pendente", tot.pendente], ["Previsto 30 dias", tot.prev30], ["Carteira vencida", tot.vencida],
  ] as const;
  const NCOL = COLS.length + 6;

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
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <Table containerClassName="max-h-[min(70vh,48rem)]">
          <TableHeader><TableRow>
            {th("representante", "Representante", thFixo)}
            <TableHead className="sticky top-0 z-40 bg-muted">Prontidão</TableHead>
            {th("regiao", "Região")}
            <TableHead className="sticky top-0 z-40 bg-muted">Telefone</TableHead>
            {th("fop_comissao_percent", "% do FOP")}
            {COLS.map((c) => th(c.k, c.label))}
            <TableHead className="sticky top-0 z-40 whitespace-nowrap bg-muted">Apto a pagamento</TableHead>
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
                  <TableCell className={cn("font-medium whitespace-nowrap", tdFixo)}>{r.representante}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {prontidao(r).map((c) => {
                        const clicavel = c.label === "Contraparte" && !c.ok;
                        return (
                          <Dica key={c.label} texto={clicavel ? `${c.faltaTxt} Clique para vincular.` : c.ok ? c.okTxt : c.faltaTxt}>
                            <Badge variant="outline"
                              onClick={clicavel ? () => setAlvo({ vendedor_id: r.vendedor_id, nome: r.representante,
                                email: r.email_contato, telefone: r.telefone, documento: r.documento }) : undefined}
                              className={cn("px-1.5 py-0 text-[10px] whitespace-nowrap",
                                c.ok ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground",
                                clicavel && "cursor-pointer underline decoration-dotted hover:bg-accent")}>
                              {c.label}
                            </Badge>
                          </Dica>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.regiao || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.telefone || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums" onClick={(e) => e.stopPropagation()}>
                    {r.fop_comissao_percent != null && r.fop_comissao_percent !== "" ? (
                      <Dica texto="Percentual individual cadastrado no FOP, fora da régua da cartilha">
                        <span className="underline decoration-dotted">{fmtPct2(r.fop_comissao_percent)}</span>
                      </Dica>
                    ) : "—"}
                  </TableCell>
                  {COLS.map((c) => (
                    <TableCell key={c.k} className={cn("whitespace-nowrap tabular-nums",
                      c.k === "inadimplencia_pct" && Number(r[c.k]) > 0 && "bg-destructive/10 text-destructive")}>
                      {fmt(c, r[c.k])}
                    </TableCell>
                  ))}
                  <TableCell onClick={(e) => e.stopPropagation()}><BadgeApto apto={!!r.apto_a_pagamento} /></TableCell>
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
