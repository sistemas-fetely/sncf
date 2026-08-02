import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, Loader2, CheckCircle2, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import VendasSemPedido from "@/components/conciliacao-cartao/VendasSemPedido";
import ConciliacaoAutomatica from "@/components/conciliacao-cartao/ConciliacaoAutomatica";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;


type Status = "exato" | "ajuste_provavel" | "divergente" | "sem_candidato";

type Sugestao = {
  ofx_id: string;
  ofx_data: string;
  ofx_valor: number;
  natureza: "CRED" | "DEB";
  bandeira: string;
  soma_grupo: number;
  n_parcelas: number;
  parcela_ids: string[];
  delta: number;
  status: Status;
};

type Parcela = {
  id: string;
  data_transacao: string;
  descricao: string;
  valor: number;
};

const STATUS_LABEL: Record<Status, string> = {
  exato: "Exato",
  ajuste_provavel: "Ajuste provável",
  divergente: "Divergente",
  sem_candidato: "Sem candidato",
};

const STATUS_CLASS: Record<Status, string> = {
  exato: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ajuste_provavel: "bg-amber-100 text-amber-800 border-amber-300",
  divergente: "bg-red-100 text-red-800 border-red-300",
  sem_candidato: "bg-muted text-muted-foreground border-border",
};

const DISABLED_REASON: Partial<Record<Status, string>> = {
  divergente: "Soma das parcelas diverge do crédito — verifique os relatórios SafraPay do dia.",
  sem_candidato: "Nenhuma liquidação SafraPay deste dia bate com o crédito — importe o SafraPay Tipo 2 do período.",
};

function AbaConciliarExtrato() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [processando, setProcessando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Sugestao | null>(null);

  const { data: sugestoes = [], isLoading } = useQuery({
    queryKey: ["conciliacao-cartao-sugestoes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_conciliacao_cartao_sugestoes")
        .select("*");
      if (error) throw error;
      return (data || []) as Sugestao[];
    },
  });

  const kpi = useMemo(() => {
    const c = { exato: 0, ajuste_provavel: 0, divergente: 0, sem_candidato: 0 };
    for (const s of sugestoes) c[s.status]++;
    return c;
  }, [sugestoes]);

  async function executarRPC(s: Sugestao) {
    setProcessando(s.ofx_id);
    try {
      const { data, error } = await sb.rpc("conciliar_lote_cartao", {
        p_ofx_id: s.ofx_id,
        p_parcela_ids: s.parcela_ids,
      });
      if (error) throw error;

      const resp = (data ?? {}) as { ok?: boolean; error?: string; aviso?: string };
      if (resp.ok === true) {
        const base = `Conciliado: ${s.n_parcelas} parcela${s.n_parcelas > 1 ? "s" : ""} · ${formatBRL(s.ofx_valor)}`;
        toast.success(base, resp.aviso ? { description: resp.aviso } : undefined);
        qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
        qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
      } else {
        toast.error(resp.error || "Falha ao conciliar lote");
      }
    } catch (e) {
      toast.error("Erro ao conciliar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProcessando(null);
      setConfirmar(null);
    }
  }

  async function onConciliar(s: Sugestao) {
    if (s.status === "ajuste_provavel") {
      setConfirmar(s);
      return;
    }
    await executarRPC(s);
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Créditos de cartão no OFX vs. lotes de parcelas SafraPay. Confirme para conciliar o crédito com as parcelas correspondentes.
        </p>



        {/* KPIs */}
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className={cn(STATUS_CLASS.exato, "font-medium")}>
            {kpi.exato} exato{kpi.exato === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.ajuste_provavel, "font-medium")}>
            {kpi.ajuste_provavel} com ajuste
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.divergente, "font-medium")}>
            {kpi.divergente} divergente{kpi.divergente === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline" className={cn(STATUS_CLASS.sem_candidato, "font-medium")}>
            {kpi.sem_candidato} sem candidato
          </Badge>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Data</TableHead>
                  <TableHead>Valor OFX</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Natureza</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && sugestoes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum crédito de cartão a conciliar — os créditos do OFX e as liquidações SafraPay do período já estão batidos.
                    </TableCell>
                  </TableRow>
                )}
                {sugestoes.map((s) => {
                  const isOpen = !!expanded[s.ofx_id];
                  const podeConciliar = s.status === "exato" || s.status === "ajuste_provavel";
                  const disabledReason = DISABLED_REASON[s.status];
                  const btn = (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!podeConciliar || processando === s.ofx_id}
                      onClick={() => onConciliar(s)}
                      className="gap-1"
                    >
                      {processando === s.ofx_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Conciliar
                    </Button>
                  );
                  return (
                    <Fragment key={s.ofx_id}>
                      <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [s.ofx_id]: !e[s.ofx_id] }))}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatDateBR(s.ofx_data)}</TableCell>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">{formatBRL(s.ofx_valor)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.bandeira || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.natureza === "CRED" ? "Crédito" : "Débito"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.n_parcelas} parcela{s.n_parcelas === 1 ? "" : "s"} · soma {formatBRL(s.soma_grupo)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn(STATUS_CLASS[s.status], "text-xs font-medium")}>
                              {STATUS_LABEL[s.status]}
                            </Badge>
                            {Number(s.delta) !== 0 && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                diferença {formatBRL(Math.abs(Number(s.delta)))}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {disabledReason ? (
                            <Tooltip>
                              <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                              <TooltipContent><p className="max-w-xs">{disabledReason}</p></TooltipContent>
                            </Tooltip>
                          ) : btn}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <ParcelasRow ofxId={s.ofx_id} parcelaIds={s.parcela_ids} />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AlertDialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar conciliação com ajuste</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmar && (
                  <>
                    Este lote tem diferença de {formatBRL(Math.abs(Number(confirmar.delta)))} — provável mensalidade SafraPay PRO abatida do crédito. Conciliar mesmo assim?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!processando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!!processando}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmar) void executarRPC(confirmar);
                }}
              >
                {processando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Conciliar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

export default function ConciliacaoCartao() {
  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-admin" />
          Conciliação de Cartão
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          SafraPay × OFX × títulos. Vincule a venda ao pedido e concilie o extrato.
        </p>
      </div>

      <Tabs defaultValue="vincular">
        <TabsList>
          <TabsTrigger value="vincular">Vincular vendas</TabsTrigger>
          <TabsTrigger value="automatica">Conciliação automática</TabsTrigger>
          <TabsTrigger value="extrato">Conciliar extrato</TabsTrigger>
        </TabsList>
        <TabsContent value="vincular" className="mt-6 space-y-6">
          <VendasSemPedido />
          <AbaVincularVendas />
        </TabsContent>
        <TabsContent value="automatica" className="mt-6">
          <ConciliacaoAutomatica />
        </TabsContent>
        <TabsContent value="extrato" className="mt-6">
          <AbaConciliarExtrato />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ PERNA 1 — Vincular vendas ============================ */

type Forca = "exato" | "aproximado" | "fraco";

type Fila = "lote" | "decidir" | "travada" | "vinculada";

type VendaFila = {
  nsu: string;
  data_venda: string;
  produto: string | null;
  modalidade: string | null;
  parcelas_safrapay: number;
  valor_bruto: number;
  valor_liquido: number;
  mdr: number;
  pedido_id: string;
  pedido_ref: string;
  cliente: string | null;
  nf_data: string | null;
  parcelas_no_sistema: number | null;
  parcelas_titulo: number | null;
  total_titulos: number | null;
  ja_tem_nsu: boolean;
  nsu_atual: string | null;
  delta_valor: number | null;
  delta_pct: number | null;
  dias_nf_venda: number | null;
  divergencia_parcelas: boolean;
  candidato_viavel: boolean | null;
  forca: Forca;
  rn: number;
  candidatos: number;
  exatos: number;
  fila: Fila;
  eh_melhor_candidato: boolean;
  elegivel_lote: boolean;
  nota_sugerida: string | null;
};

type Venda = {
  nsu: string;
  fila: Fila;
  melhor: VendaFila;
  candidatos: VendaFila[];
};

const FORCA_LABEL: Record<Forca, string> = {
  exato: "Exata",
  aproximado: "Aproximada",
  fraco: "Fraca",
};

const FORCA_CLASS: Record<Forca, string> = {
  exato: "bg-emerald-100 text-emerald-800 border-emerald-300",
  aproximado: "bg-amber-100 text-amber-800 border-amber-300",
  fraco: "bg-muted text-muted-foreground border-border",
};

function Delta({ c }: { c: VendaFila }) {
  const pct = Number(c.delta_pct ?? 0);
  return (
    <span className={cn("tabular-nums whitespace-nowrap", Math.abs(pct) > 3 && "text-destructive")}>
      {formatBRL(Number(c.delta_valor ?? 0))} ({pct.toFixed(2)}%)
    </span>
  );
}

// candidato_viavel vem da view: (nsu_atual IS NULL OR nsu_atual = nsu) AND NOT divergencia_parcelas.
// Cobre só essas duas recusas da RPC; as demais guardas continuam sendo julgadas pelo banco.
const ehViavel = (c: VendaFila) => c.candidato_viavel === true;

function motivoInviavel(c: VendaFila): string {
  if (c.nsu_atual && c.nsu_atual !== c.nsu) return `pedido já vinculado ao NSU ${c.nsu_atual}`;
  if (c.divergencia_parcelas)
    return `parcelas divergem: venda ${c.parcelas_safrapay}x, título ${c.parcelas_titulo ?? "—"}x`;
  return "descartado pela fila";
}

function AbaVincularVendas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [alvo, setAlvo] = useState<VendaFila | null>(null);
  const [nota, setNota] = useState("");
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({});
  const [descartados, setDescartados] = useState<Record<string, boolean>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [loteAberto, setLoteAberto] = useState(false);
  const [obsLote, setObsLote] = useState("");
  const [progresso, setProgresso] = useState<{ i: number; n: number } | null>(null);

  const { data: linhas = [], isLoading, isError, error } = useQuery({
    queryKey: ["conciliacao-cartao-fila"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_safrapay_venda_fila")
        .select("*")
        .order("rn", { ascending: true });
      if (error) throw error;
      return (data || []) as VendaFila[];
    },
  });

  const { lote, decidir, travadas, jaVinculadas } = useMemo(() => {
    const mapa = new Map<string, VendaFila[]>();
    for (const l of linhas) {
      const arr = mapa.get(l.nsu) || [];
      arr.push(l);
      mapa.set(l.nsu, arr);
    }
    const vendas: Venda[] = Array.from(mapa.entries()).map(([nsu, cands]) => {
      const candidatos = [...cands].sort((a, b) => Number(a.rn) - Number(b.rn));
      const melhor = candidatos.find((c) => c.eh_melhor_candidato) || candidatos[0];
      return { nsu, fila: melhor.fila, melhor, candidatos };
    });
    const porValor = (a: Venda, b: Venda) => Number(b.melhor.valor_bruto) - Number(a.melhor.valor_bruto);
    return {
      lote: vendas.filter((v) => v.fila === "lote").sort(porValor),
      decidir: vendas.filter((v) => v.fila === "decidir").sort(porValor),
      travadas: vendas.filter((v) => v.fila === "travada").sort(porValor),
      jaVinculadas: vendas.filter((v) => v.fila === "vinculada").length,
    };
  }, [linhas]);

  const soma = (vs: Venda[]) => vs.reduce((s, v) => s + Number(v.melhor.valor_bruto), 0);

  const selecionadas = useMemo(
    () => lote.filter((v) => !desmarcados[v.nsu]),
    [lote, desmarcados]
  );
  const todasMarcadas = lote.length > 0 && selecionadas.length === lote.length;

  const vincular = useMutation({
    mutationFn: async ({ c, obs }: { c: VendaFila; obs: string }) => {
      const { data, error } = await sb.rpc("vincular_venda_cartao_pedido", {
        p_nsu: c.nsu,
        p_pedido_id: c.pedido_id,
        p_nota: obs,
      });
      if (error) throw error;
      const resp = (data ?? {}) as { ok?: boolean; error?: string; parcelas_carimbadas?: number };
      if (resp.ok === false) throw new Error(resp.error || "Falha ao vincular venda");
      return resp;
    },
    onSuccess: (resp, vars) => {
      toast.success(
        `NSU ${vars.c.nsu} vinculado ao ${vars.c.pedido_ref} · ${resp.parcelas_carimbadas ?? 0} parcelas carimbadas`
      );
      setAlvo(null);
      setNota("");
      qc.invalidateQueries({ queryKey: ["conciliacao-cartao-fila"] });
      qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  const notaOk = nota.trim().length >= 5;

  async function executarLote() {
    const alvos = selecionadas.map((v) => v.melhor);
    const obs = obsLote.trim();
    const falhas: Record<string, string> = {};
    let ok = 0;
    setProgresso({ i: 0, n: alvos.length });
    for (let i = 0; i < alvos.length; i++) {
      const c = alvos[i];
      setProgresso({ i: i + 1, n: alvos.length });
      try {
        const notaFinal = `${c.nota_sugerida ?? ""}${obs ? " " + obs : ""}`.trim();
        const { data, error } = await sb.rpc("vincular_venda_cartao_pedido", {
          p_nsu: c.nsu,
          p_pedido_id: c.pedido_id,
          p_nota: notaFinal,
        });
        if (error) throw error;
        const resp = (data ?? {}) as { ok?: boolean; error?: string };
        if (resp.ok === false) throw new Error(resp.error || "Falha ao vincular venda");
        ok++;
      } catch (e) {
        falhas[c.nsu] = e instanceof Error ? e.message : String(e);
      }
    }
    const n = alvos.length;
    const f = Object.keys(falhas).length;
    setErros(falhas);
    if (f > 0) {
      setDesmarcados((d) => {
        const next = { ...d };
        for (const nsu of Object.keys(falhas)) next[nsu] = true;
        return next;
      });
      toast.error(`${ok} de ${n} vinculadas · ${f} falharam`);
    } else {
      toast.success(`${ok} de ${n} vinculadas`);
    }
    setProgresso(null);
    setLoteAberto(false);
    setObsLote("");
    qc.invalidateQueries({ queryKey: ["conciliacao-cartao-fila"] });
    qc.invalidateQueries({ queryKey: ["conciliacao-cartao-sugestoes"] });
  }

  function OutrosCandidatos({ v }: { v: Venda }) {
    const outros = v.candidatos.filter((c) => c !== v.melhor);
    if (!outros.length) return null;
    return (
      <div className="space-y-1 py-1">
        {outros.map((c) => (
          <div key={c.pedido_id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{c.pedido_ref}</span>
            <span className="truncate max-w-[220px]">{c.cliente || "—"}</span>
            <span className="tabular-nums">{c.parcelas_no_sistema ?? "—"}x no sistema</span>
            <span className="font-mono tabular-nums">títulos {formatBRL(Number(c.total_titulos ?? 0))}</span>
            <span>Δ <Delta c={c} /></span>
            <Badge variant="outline" className={cn(FORCA_CLASS[c.forca], "text-xs")}>{FORCA_LABEL[c.forca]}</Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1 min-w-[280px]">
            Vendas SafraPay sem NSU carimbado × pedidos candidatos. Vincular carimba o NSU nos títulos do pedido.
          </p>
          <Badge variant="outline" className="font-medium">{jaVinculadas} já vinculadas</Badge>
        </div>

        {isError && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">
              Erro ao carregar a fila de vendas: {error instanceof Error ? error.message : String(error)}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        )}

        {/* Seção A */}
        {!isLoading && !isError && (
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Prontas para vincular · {lote.length} vendas · {formatBRL(soma(lote))}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-3 px-4 pb-3 border-b">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={todasMarcadas}
                    disabled={!lote.length || !!progresso}
                    onCheckedChange={(v) => {
                      if (v) setDesmarcados({});
                      else setDesmarcados(Object.fromEntries(lote.map((l) => [l.nsu, true])));
                    }}
                  />
                  Selecionar todas
                </label>
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={selecionadas.length === 0 || !!progresso}
                  onClick={() => { setObsLote(""); setLoteAberto(true); }}
                >
                  {progresso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Vincular {selecionadas.length} selecionadas
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {progresso ? `${progresso.i}/${progresso.n}` : `${selecionadas.length} selecionada${selecionadas.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>NSU</TableHead>
                    <TableHead>Data da venda</TableHead>
                    <TableHead>Bandeira</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Valor bruto</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Δ</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lote.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Nenhuma venda pronta para vínculo em lote.
                      </TableCell>
                    </TableRow>
                  )}
                  {lote.map((v) => {
                    const c = v.melhor;
                    const isOpen = !!expanded[v.nsu];
                    return (
                      <Fragment key={v.nsu}>
                        <TableRow>
                          <TableCell>
                            <Checkbox
                              checked={!desmarcados[v.nsu]}
                              disabled={!!progresso}
                              onCheckedChange={(val) =>
                                setDesmarcados((d) => ({ ...d, [v.nsu]: !val }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{v.nsu}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateBR(c.data_venda)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{c.produto || "—"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{c.parcelas_safrapay}x</TableCell>
                          <TableCell className="font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatBRL(Number(c.valor_bruto))}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="link"
                              className="h-auto p-0 font-mono text-xs"
                              onClick={() => navigate(`/pedidos/${c.pedido_id}`)}
                            >
                              {c.pedido_ref}
                            </Button>
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <span className="block truncate">{c.cliente || "—"}</span>
                          </TableCell>
                          <TableCell className="text-xs"><Delta c={c} /></TableCell>
                          <TableCell>
                            {Number(c.candidatos) > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto py-1 text-xs text-muted-foreground gap-1"
                                onClick={() => setExpanded((e) => ({ ...e, [v.nsu]: !e[v.nsu] }))}
                              >
                                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                ver outros ({Number(c.candidatos) - 1})
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                        {erros[v.nsu] && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell />
                            <TableCell colSpan={9} className="pt-0 text-xs text-destructive">
                              {erros[v.nsu]}
                            </TableCell>
                          </TableRow>
                        )}
                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={9}><OutrosCandidatos v={v} /></TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Seção B */}
        {!isLoading && !isError && (
          <Card className="border-amber-500/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Precisam de decisão · {decidir.length} vendas · {formatBRL(soma(decidir))}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Nenhuma candidata bate no centavo. A diferença costuma ser desconto ou frete entre o pedido e o valor passado no cartão.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>NSU</TableHead>
                    <TableHead>Data da venda</TableHead>
                    <TableHead>Bandeira</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Valor bruto</TableHead>
                    <TableHead>Valor líquido</TableHead>
                    <TableHead>Candidatos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decidir.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhuma venda pendente de decisão.
                      </TableCell>
                    </TableRow>
                  )}
                  {decidir.map((v) => {
                    const isOpen = !!expanded[v.nsu];
                    const viaveis = v.candidatos.filter(ehViavel);
                    const inviaveis = v.candidatos.filter((c) => !ehViavel(c));
                    const semViavel = viaveis.length === 0;
                    const descartadosAbertos = !!descartados[v.nsu];
                    return (
                      <Fragment key={v.nsu}>
                        <TableRow className="cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [v.nsu]: !e[v.nsu] }))}>
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{v.nsu}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDateBR(v.melhor.data_venda)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{v.melhor.produto || "—"}</Badge>
                            {v.melhor.modalidade && (
                              <div className="text-xs text-muted-foreground mt-1">{v.melhor.modalidade}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{v.melhor.parcelas_safrapay}x</TableCell>
                          <TableCell className="font-mono font-semibold tabular-nums whitespace-nowrap">
                            {formatBRL(Number(v.melhor.valor_bruto))}
                          </TableCell>
                          <TableCell className="tabular-nums whitespace-nowrap">
                            {formatBRL(Number(v.melhor.valor_liquido))}
                            <div className="text-xs text-muted-foreground">MDR {formatBRL(Number(v.melhor.mdr))}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {Number(v.melhor.candidatos)} candidato{Number(v.melhor.candidatos) === 1 ? "" : "s"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={7} className="py-2">
                              <div className="space-y-2">
                                {v.candidatos.map((c) => {
                                  const bloqueado = c.divergencia_parcelas || c.ja_tem_nsu;
                                  const motivo = c.divergencia_parcelas
                                    ? "Corrija o número de parcelas do título antes de vincular — carimbar o NSU aqui esconderia o furo."
                                    : c.ja_tem_nsu
                                      ? "Pedido já vinculado a este NSU."
                                      : null;
                                  const btn = (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1"
                                      disabled={bloqueado || vincular.isPending}
                                      onClick={() => { setAlvo(c); setNota(""); }}
                                    >
                                      <Link2 className="h-3.5 w-3.5" />
                                      Vincular
                                    </Button>
                                  );
                                  return (
                                    <div key={c.pedido_id} className="flex flex-wrap items-center justify-between gap-3 text-xs py-2 border-b border-border/40 last:border-0">
                                      <div className="flex flex-wrap items-center gap-3 min-w-0">
                                        <Button
                                          variant="link"
                                          className="h-auto p-0 font-mono text-xs"
                                          onClick={() => navigate(`/pedidos/${c.pedido_id}`)}
                                        >
                                          {c.pedido_ref}
                                        </Button>
                                        <span className="truncate max-w-[240px]">{c.cliente || "—"}</span>
                                        <span className="text-muted-foreground whitespace-nowrap">
                                          NF {formatDateBR(c.nf_data)} · {c.dias_nf_venda ?? "—"} dias
                                        </span>
                                        <span className="tabular-nums whitespace-nowrap">
                                          {c.parcelas_no_sistema ?? "—"}x no sistema
                                        </span>
                                        <span className="font-mono tabular-nums whitespace-nowrap">
                                          títulos {formatBRL(Number(c.total_titulos ?? 0))}
                                        </span>
                                        <span>Δ <Delta c={c} /></span>
                                        {c.divergencia_parcelas && (
                                          <Badge variant="destructive" className="text-xs">
                                            Parcelas: sistema {c.parcelas_no_sistema ?? "—"} × SafraPay {c.parcelas_safrapay}
                                          </Badge>
                                        )}
                                        {c.ja_tem_nsu && (
                                          <Badge variant="outline" className="text-xs font-mono">NSU {c.nsu_atual}</Badge>
                                        )}
                                      </div>
                                      {motivo ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
                                          <TooltipContent><p className="max-w-xs">{motivo}</p></TooltipContent>
                                        </Tooltip>
                                      ) : btn}
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Seção C */}
        {!isLoading && !isError && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Travadas · {travadas.length} vendas · {formatBRL(soma(travadas))}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Corrija o número de parcelas do título antes de vincular. Carimbar o NSU aqui esconderia o furo.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NSU</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Parcelas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {travadas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma venda travada.
                      </TableCell>
                    </TableRow>
                  )}
                  {travadas.map((v) => {
                    const c = v.melhor;
                    return (
                      <TableRow key={v.nsu}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{v.nsu}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateBR(c.data_venda)}</TableCell>
                        <TableCell className="font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatBRL(Number(c.valor_bruto))}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() => navigate(`/pedidos/${c.pedido_id}`)}
                          >
                            {c.pedido_ref}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-xs">
                            Parcelas: sistema {c.parcelas_no_sistema ?? "—"} × SafraPay {c.parcelas_safrapay}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Três pernas: vincular a venda ao pedido carimba o NSU nos títulos; conciliar o extrato casa o crédito do OFX com as liquidações SafraPay; com NSU nos dois lados, a parcela casa com o título sem ambiguidade. Sistema sugere, humano confirma — força exata não dispensa conferência.
        </p>

        {/* Diálogo do lote */}
        <AlertDialog open={loteAberto} onOpenChange={(v) => { if (!v && !progresso) { setLoteAberto(false); setObsLote(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Vincular {selecionadas.length} vendas</AlertDialogTitle>
              <AlertDialogDescription>
                Todas têm candidata exata e única. O NSU será carimbado em todas as parcelas de cada pedido e a previsão passa a contar da data da venda.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="max-h-56 overflow-y-auto rounded border border-border/60 p-2 space-y-1 text-xs">
              {selecionadas.map((v) => (
                <div key={v.nsu} className="flex flex-wrap items-center gap-2 tabular-nums">
                  <span className="font-mono">{v.nsu}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-mono">{v.melhor.pedido_ref}</span>
                  <span>· {formatBRL(Number(v.melhor.valor_bruto))}</span>
                  <span>· Δ {formatBRL(Number(v.melhor.delta_valor ?? 0))}</span>
                </div>
              ))}
            </div>

            <Textarea
              value={obsLote}
              onChange={(e) => setObsLote(e.target.value)}
              placeholder="Observação (opcional) — a evidência de cada vínculo é registrada automaticamente."
              disabled={!!progresso}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!progresso}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!!progresso || selecionadas.length === 0}
                onClick={(e) => { e.preventDefault(); void executarLote(); }}
              >
                {progresso ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{progresso.i}/{progresso.n}</>
                ) : (
                  <><Link2 className="h-4 w-4 mr-2" />Vincular {selecionadas.length} vendas</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Diálogo individual (Seção B) */}
        <AlertDialog open={!!alvo} onOpenChange={(v) => { if (!v && !vincular.isPending) { setAlvo(null); setNota(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Vincular venda ao pedido</AlertDialogTitle>
              <AlertDialogDescription>
                O NSU será carimbado em todas as parcelas deste pedido e a previsão de liquidação passa a contar da data da venda.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {alvo && (
              <div className="grid grid-cols-2 gap-4 text-sm py-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Venda SafraPay</p>
                  <p className="font-mono text-xs">{alvo.nsu}</p>
                  <p>{formatDateBR(alvo.data_venda)}</p>
                  <p className="font-mono tabular-nums font-semibold">{formatBRL(Number(alvo.valor_bruto))}</p>
                  <p className="tabular-nums">{alvo.parcelas_safrapay}x</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pedido</p>
                  <p className="font-mono text-xs">{alvo.pedido_ref}</p>
                  <p className="truncate">{alvo.cliente || "—"}</p>
                  <p className="font-mono tabular-nums font-semibold">{formatBRL(Number(alvo.total_titulos ?? 0))}</p>
                  <p className="tabular-nums">{alvo.parcelas_no_sistema ?? "—"}x</p>
                </div>
                <div className="col-span-2 text-xs">Δ <Delta c={alvo} /></div>
              </div>
            )}

            <div className="space-y-1">
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota obrigatória: por que este pedido é esta venda?"
                disabled={vincular.isPending}
              />
              <p className={cn("text-xs", notaOk ? "text-muted-foreground" : "text-destructive")}>
                {nota.trim().length}/5 caracteres mínimos
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={vincular.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!notaOk || vincular.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (alvo && notaOk) vincular.mutate({ c: alvo, obs: nota.trim() });
                }}
              >
                {vincular.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Vincular
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function ParcelasRow({ ofxId, parcelaIds }: { ofxId: string; parcelaIds: string[] }) {
  const { data: parcelas = [], isLoading } = useQuery({
    queryKey: ["conciliacao-cartao-parcelas", ofxId],
    queryFn: async () => {
      if (!parcelaIds?.length) return [] as Parcela[];
      const { data, error } = await sb
        .from("movimentacoes_bancarias")
        .select("id, data_transacao, descricao, valor")
        .in("id", parcelaIds)
        .order("valor", { ascending: true });
      if (error) throw error;
      return (data || []) as Parcela[];
    },
  });

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell />
      <TableCell colSpan={7} className="py-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />Carregando parcelas…</div>
        ) : parcelas.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">Nenhuma parcela encontrada.</div>
        ) : (
          <div className="space-y-1">
            {parcelas.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs gap-4 py-1 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground whitespace-nowrap">{formatDateBR(p.data_transacao)}</span>
                  <span className="truncate">{p.descricao}</span>
                </div>
                <span className="font-mono whitespace-nowrap">{formatBRL(Number(p.valor))}</span>
              </div>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
