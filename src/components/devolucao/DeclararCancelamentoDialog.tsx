import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { chamarRascunhoNfDevolucao } from "@/components/devolucao/NfDevolucaoBloco";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format-currency";
import { Switch } from "@/components/ui/switch";
import { interpretarListaColada, type ResultadoColagem } from "@/lib/devolucao/colarListaItens";
import { normalizarNumeroPedido } from "@/lib/devolucao/normalizarNumeroPedido";
import { textoMotivoCancelamento, usaMotivosTransferencia } from "@/lib/devolucao/motivoCancelamento";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tipo = "total" | "parcial";
type Esteira = { tipo: Tipo; esteira: string; rotulo: string; permitido: boolean; implementado: boolean; rpc_alvo: string | null; o_que_acontece: string | null; lacuna: string | null };
type Momento = {
  ok: boolean; erro?: string; pedido_id: string; id_externo: string; origem: string; canal?: string; canal_devolucao: "b2b" | "b2c" | "site_sp" | "interno";
  estagio: string; momento: string; momento_rotulo: string;
  shopify_id?: string | null;
  nf: { id: string; numero: string } | null;
  devolucao_aberta: { numero: string; status: string } | null;
  esteiras: Esteira[];
};
type ItemNf = { codigo: string; descricao: string; quantidade: number; valor: number };

const CANAL: Record<string, string> = { b2b: "B2B", b2c: "B2C Shopify", site_sp: "Site SP" };
const ACAO_HUMANA: Record<string, string> = { "cancelar-expedicao-xpm": "Depois, corta a separação na XPM" };
const GRUPO: Record<string, string> = { cliente: "Cliente", fetely: "Fetely", transportadora: "Transportadora" };

function fmtData(v: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (v ?? "—");
}

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as any)(nome, args);
  if (error) throw new Error(error.message);
  return data as any;
}

interface Props {
  pedidoId?: string; trigger?: ReactNode; onConcluido?: () => void;
  /** Modo controlado: quando `open` vem, o diálogo não renderiza gatilho próprio. */
  open?: boolean; onOpenChange?: (o: boolean) => void;
}

export function DeclararCancelamentoDialog({ pedidoId, trigger, onConcluido, open: openProp, onOpenChange }: Props) {
  const qc = useQueryClient();
  const controlado = openProp !== undefined;
  const [openInterno, setOpenInterno] = useState(false);
  const open = controlado ? !!openProp : openInterno;
  const setOpen = (o: boolean) => { if (!controlado) setOpenInterno(o); onOpenChange?.(o); };
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<{ id: string; id_externo: string }[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [selId, setSelId] = useState<string | null>(pedidoId ?? null);
  const [tipo, setTipo] = useState<Tipo>("total");
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [colarAberto, setColarAberto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  const [resultadoColagem, setResultadoColagem] = useState<ResultadoColagem | null>(null);
  const [soVoltam, setSoVoltam] = useState(false);
  const [filtroItem, setFiltroItem] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [desfecho, setDesfecho] = useState<string>("");
  const [previa, setPrevia] = useState<any | null>(null);
  const [previaErro, setPreviaErro] = useState<string | null>(null);
  const [previaIniciada, setPreviaIniciada] = useState(false);
  const [previando, setPreviando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [erroExec, setErroExec] = useState<string | null>(null);
  const [erroXpm, setErroXpm] = useState<string | null>(null);
  const seq = useRef(0);

  function reset() {
    setBusca(""); setOpcoes(null); setSelId(pedidoId ?? null); setTipo("total"); setQtds({});
    setColarAberto(false); setTextoColado(""); setResultadoColagem(null); setSoVoltam(false); setFiltroItem("");
    setMotivoCodigo(""); setMotivo(""); setDesfecho(""); setPrevia(null); setPreviaErro(null); setPreviaIniciada(false); setErroExec(null); setErroXpm(null);
  }

  // Ao abrir (ou trocar de pedido no modo controlado), começa limpo com o pedido recebido.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pedidoId]);

  const momentoQ = useQuery({
    queryKey: ["fn_pedido_momento", selId],
    enabled: open && !!selId,
    queryFn: async () => {
      const d = (await rpc("fn_pedido_momento", { p_pedido_id: selId })) as Momento;
      if (d?.ok === false) throw new Error(d.erro ?? "Pedido sem momento");
      return d;
    },
  });
  const m = momentoQ.data;
  const interno = usaMotivosTransferencia(m);

  const blingNumeroQ = useQuery({
    queryKey: ["devolucao", "bling-pedido-numero", m?.shopify_id],
    enabled: open && !!m?.shopify_id && m?.canal_devolucao === "b2c",
    queryFn: async () => {
      if (!m?.shopify_id) return null;
      const { data, error } = await supabase.from("bling_pedido_fila_b2c")
        .select("bling_pedido_numero").eq("shopify_pedido_id", String(m.shopify_id)).maybeSingle();
      if (error) throw new Error(error.message);
      return data?.bling_pedido_numero ?? null;
    },
  });

  const itensQ = useQuery({
    queryKey: ["nf_itens_json", m?.nf?.id],
    enabled: open && !!m?.nf?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("nfs_emitidas").select("itens_json").eq("id", m!.nf!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return (((data as any)?.itens_json ?? []) as ItemNf[]);
    },
  });

  const motivosQ = useQuery({
    queryKey: ["parametros", "devolucao_motivo"],
    enabled: open && !!m && !interno,
    queryFn: async () => {
      const { data, error } = await supabase.from("parametros").select("valor,label,pai_valor,ordem")
        .eq("categoria", "devolucao_motivo").eq("ativo", true).order("ordem");
      if (error) throw new Error(error.message);
      return (data ?? []) as { valor: string; label: string; pai_valor: string | null }[];
    },
  });
  const motivosTransferenciaQ = useQuery({
    queryKey: ["transferencia_motivo_cancelamento"],
    enabled: open && interno,
    queryFn: async () => {
      const { data, error } = await supabase.from("transferencia_motivo_cancelamento")
        .select("codigo,rotulo,descricao,ordem,ativo").eq("ativo", true).order("ordem");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const motivoTexto = textoMotivoCancelamento(interno,
    motivosTransferenciaQ.data?.find((x) => x.codigo === motivoCodigo)?.rotulo, motivo);
  const motivosAgrupados = useMemo(() => {
    const g = new Map<string, { valor: string; label: string }[]>();
    for (const x of motivosQ.data ?? []) {
      const k = x.pai_valor ?? "";
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(x);
    }
    return [...g.entries()];
  }, [motivosQ.data]);

  const esteira = (t: Tipo) => m?.esteiras?.find((e) => e.tipo === t);
  const esteiraAtual = esteira(tipo);
  const itens = useMemo(() => Object.entries(qtds).filter(([, q]) => q > 0).map(([sku, quantidade]) => ({ sku, quantidade })), [qtds]);
  const itensVisiveis = useMemo(() => {
    const f = filtroItem.trim().toLowerCase();
    return (itensQ.data ?? []).filter((it) =>
      (!soVoltam || (qtds[it.codigo] ?? 0) > 0) &&
      (!f || it.codigo.toLowerCase().includes(f) || (it.descricao ?? "").toLowerCase().includes(f)));
  }, [itensQ.data, soVoltam, filtroItem, qtds]);
  const resumoParcial = useMemo(() => {
    let unidades = 0, valor = 0, n = 0;
    for (const it of itensQ.data ?? []) {
      const q = qtds[it.codigo] ?? 0;
      if (q > 0) { n++; unidades += q; valor += q * Number(it.valor ?? 0); }
    }
    return { itens: n, unidades, valor };
  }, [itensQ.data, qtds]);
  const mostrarDesfecho = m?.canal_devolucao === "b2b" && (
    ["entregue", "nf_nao_expedida"].includes(m.momento) ||
    (previa?.pendencias ?? []).some((p: string) => /desfecho/i.test(p))
  );

  // B2B parcial: dívida em aberto define se haver/reembolso são possíveis.
  const b2bParcial = m?.canal_devolucao === "b2b" && tipo === "parcial";
  const haverQ = useQuery({
    queryKey: ["fn_devolucao_haver_disponivel_b2b", selId],
    enabled: open && !!selId && b2bParcial,
    queryFn: async () => (await rpc("fn_devolucao_haver_disponivel_b2b", { p_pedido_id: selId })) as
      { pago: number; aberto: number; ja_creditado: number; disponivel: number },
  });
  const emAberto = b2bParcial ? Number(haverQ.data?.aberto ?? 0) : 0;
  const bloqueiaCredito = emAberto > 0;
  useEffect(() => {
    if (b2bParcial && (desfecho === "" || (bloqueiaCredito && (desfecho === "haver" || desfecho === "reembolso")))) setDesfecho("nenhum");
    if (!b2bParcial && (desfecho === "abater_divida" || desfecho === "nenhum")) setDesfecho("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueiaCredito, b2bParcial]);
  const dicaCredito = `Pedido com ${formatBRL(emAberto)} em aberto — devolução sobre dívida é abatida na parcela. Crédito/reembolso só sobre o que já foi pago.`;

  async function buscar() {
    const cands = normalizarNumeroPedido(busca);
    if (!cands.length) return;
    setBuscando(true); setOpcoes(null);
    try {
      const { data, error } = await supabase.from("pedidos").select("id,id_externo").in("id_externo", cands);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; id_externo: string }[];
      if (rows.length === 1) { setSelId(rows[0].id); setOpcoes(null); }
      else { setOpcoes(rows); if (!rows.length) toast.error(`Nenhum pedido encontrado para ${cands.join(", ")}`); }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBuscando(false); }
  }

  function args(dry: boolean) {
    return {
      p_pedido_id: selId, p_tipo: tipo, p_motivo: motivoTexto,
      p_itens: tipo === "parcial" ? itens : null,
      p_desfecho: mostrarDesfecho && desfecho ? desfecho : null,
      p_motivo_codigo: motivoCodigo || null, p_dry_run: dry,
    };
  }

  async function verPrevia() {
    const meu = ++seq.current;
    setPreviando(true); setPreviaErro(null);
    try {
      const d = await rpc("declarar_cancelamento", args(true));
      if (meu !== seq.current) return;
      if (d?.ok === false) { setPrevia(null); setPreviaErro(d.erro ?? "Prévia recusada"); return; }
      console.info("[declarar_cancelamento prévia]", { esteira: d?.esteira, rpc: d?.rpc });
      setPrevia(d);
    } catch (e) {
      if (meu !== seq.current) return;
      setPrevia(null); setPreviaErro(e instanceof Error ? e.message : String(e));
    } finally { if (meu === seq.current) setPreviando(false); }
  }

  // Recalcula a prévia (debounce 400ms) depois da primeira vez.
  const chave = JSON.stringify([selId, tipo, itens, motivo.trim(), motivoCodigo, desfecho]);
  const ultimaChave = useRef(chave);
  useEffect(() => {
    if (!previaIniciada || chave === ultimaChave.current) return;
    ultimaChave.current = chave;
    seq.current++; // invalida prévia anterior
    setPrevia(null); setPreviaErro(null);
    const t = setTimeout(() => { void verPrevia(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, previaIniciada]);

  async function cortarXpm(motivoTxt: string) {
    const { data: ped, error: e1 } = await supabase.from("pedidos").select("xpm_expedicao_codigo").eq("id", selId!).maybeSingle();
    if (e1) throw new Error(e1.message);
    const codigo = (ped as any)?.xpm_expedicao_codigo;
    if (!codigo) throw new Error("Pedido sem código de expedição XPM");
    const { data, error } = await supabase.functions.invoke("cancelar-expedicao-xpm", { body: { expedicao_codigo: codigo, motivo: motivoTxt } });
    let corpo: unknown = data;
    if (error) {
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.json === "function") corpo = await ctx.json().catch(() => null);
    }
    const resp = (corpo ?? {}) as any;
    if (resp?.sucesso !== true) {
      throw new Error([resp?.erro ?? error?.message ?? "Falha desconhecida ao cancelar na XPM",
        resp?.resposta_xpm ? `Resposta da XPM: ${JSON.stringify(resp.resposta_xpm)}` : null].filter(Boolean).join(" — "));
    }
  }

  async function confirmar() {
    setExecutando(true); setErroExec(null); setErroXpm(null);
    try {
      const d = await rpc("declarar_cancelamento", args(false));
      if (d?.ok === false) { setErroExec(d.erro ?? "Execução recusada"); return; }
      console.info("[declarar_cancelamento execução]", { esteira: d?.esteira, rpc: d?.rpc, resultado: d?.resultado });
      let falhaXpm: string | null = null;
      if ((d?.acoes_complementares ?? []).includes("cancelar-expedicao-xpm")) {
        try { await cortarXpm(motivo.trim()); }
        catch (e) { falhaXpm = e instanceof Error ? e.message : String(e); }
      }
      const dev = d?.resultado?.devolucao_numero ?? d?.resultado?.devolucao?.devolucao_numero;
      toast.success(dev ? `${dev} aberta` : `Pedido ${d?.pedido ?? m?.id_externo} cancelado`);
      // NF de entrada no Bling (27/10/2026): mesma edge da Mesa de Devoluções.
      const fiscal = d?.resultado?.devolucao?.gerar_nf_no_bling === true ? d.resultado.devolucao
        : d?.resultado?.gerar_nf_no_bling === true ? d.resultado : null;
      const fiscalAcao = d?.resultado?.devolucao?.fiscal_acao ?? d?.resultado?.fiscal_acao;
      if (fiscal?.devolucao_id) {
        try {
          await chamarRascunhoNfDevolucao(fiscal.devolucao_id, "gerar");
          toast.success(`${fiscal.devolucao_numero ?? dev ?? "Devolução"}: rascunho da NF de entrada gerado no Bling`);
        } catch (e) {
          toast.error(`${fiscal.devolucao_numero ?? dev ?? "Devolução"}: falha ao gerar a NF de entrada no Bling — ${e instanceof Error ? e.message : String(e)}`, { duration: 15000 });
        }
      } else if (fiscalAcao === "cancelar_nf") {
        toast.warning("NF com menos de 24h: cancele a NF no Bling em até 24h.", { duration: 15000 });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["vw_devolucao_funil"] }),
        qc.invalidateQueries({ queryKey: ["fn_pedido_momento"] }),
        qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(selId!) }),
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").includes("pedido") }),
      ]);
      if (falhaXpm) {
        setErroXpm(`Pedido cancelado, mas o corte na XPM falhou: ${falhaXpm} — corte manualmente`);
        onConcluido?.();
        return; // mantém aberto para o aviso ficar visível
      }
      onConcluido?.();
      setOpen(false); reset();
    } catch (e) {
      setErroExec(e instanceof Error ? e.message : String(e));
    } finally { setExecutando(false); }
  }

  const motivoOk = motivo.trim().length >= 5;
  const parcialOk = tipo !== "parcial" || itens.length > 0;
  const podePrevia = !!m && motivoOk && parcialOk && !!esteiraAtual?.permitido && !!esteiraAtual?.implementado;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      {(!controlado || trigger) && <DialogTrigger asChild>{trigger ?? <Button size="sm">Cancelar / Devolver</Button>}</DialogTrigger>}
      <DialogContent className="max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancelar / Devolver pedido</DialogTitle>
          <DialogDescription>Declare o fato. O sistema escolhe o caminho certo.</DialogDescription>
        </DialogHeader>

        {!selId && (
          <div className="space-y-2">
            <Label>Número do pedido</Label>
            <div className="flex gap-2">
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SHP-1401, #1401, PED-2348, VD-0037"
                onKeyDown={(e) => { if (e.key === "Enter") void buscar(); }} autoFocus />
              <Button variant="outline" onClick={() => void buscar()} disabled={buscando || !busca.trim()}>
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {opcoes && opcoes.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground w-full">Mais de um pedido encontrado:</span>
                {opcoes.map((o) => <Button key={o.id} size="sm" variant="outline" onClick={() => setSelId(o.id)}>{o.id_externo}</Button>)}
              </div>
            )}
          </div>
        )}

        {selId && momentoQ.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando pedido…</div>}
        {momentoQ.isError && <Alert variant="destructive"><AlertDescription>{(momentoQ.error as Error).message}</AlertDescription></Alert>}

        {m && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
              <span className="font-semibold">{m.id_externo}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-sm">{CANAL[m.canal_devolucao] ?? m.canal_devolucao}</span>
              <Badge variant="secondary">{m.momento_rotulo}</Badge>
              {m.nf?.numero && <span className="text-sm text-muted-foreground">NF nº {m.nf.numero}</span>}
              {m.canal_devolucao === "b2c" && blingNumeroQ.data && <span className="text-sm text-muted-foreground">Bling nº {blingNumeroQ.data}</span>}
              {!pedidoId && <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => { reset(); setSelId(null); }}>Trocar pedido</Button>}
            </div>
            {blingNumeroQ.isError && <p className="text-xs text-destructive">{blingNumeroQ.error.message}</p>}

            {m.devolucao_aberta ? (
              <Alert>
                <AlertDescription>
                  Já existe a devolução {m.devolucao_aberta.numero} ({m.devolucao_aberta.status}).{" "}
                  <Link to="/devolucoes" className="underline">Abrir Devoluções e Correções</Link>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Total ou parcial</Label>
                  <ToggleGroup type="single" value={tipo} onValueChange={(v) => v && setTipo(v as Tipo)} className="justify-start">
                    {(["total", "parcial"] as Tipo[]).map((t) => {
                      const e = esteira(t);
                      return (
                        <ToggleGroupItem key={t} value={t} disabled={!e || !e.permitido} variant="outline">
                          {t === "total" ? "Total" : "Parcial"}
                          {e && !e.implementado && <Badge variant="outline" className="ml-2">Ainda não disponível</Badge>}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                  {(["total", "parcial"] as Tipo[]).map((t) => {
                    const e = esteira(t);
                    if (!e) return null;
                    if (!e.permitido) return <p key={t} className="text-xs text-muted-foreground">{t === "total" ? "Total" : "Parcial"}: {e.o_que_acontece}</p>;
                    if (!e.implementado) return <p key={t} className="text-xs text-muted-foreground">{t === "total" ? "Total" : "Parcial"}: {e.lacuna}</p>;
                    return null;
                  })}
                </div>

                {tipo === "parcial" && (
                  <div className="rounded-md border bg-card">
                    {itensQ.isLoading ? <div className="p-3 text-sm text-muted-foreground">Carregando itens da NF…</div>
                      : itensQ.isError ? <Alert variant="destructive"><AlertDescription>{(itensQ.error as Error).message}</AlertDescription></Alert>
                      : !m.nf ? <div className="p-3 text-sm text-muted-foreground">Pedido sem NF.</div>
                      : (
                        <div>
                        <div className="flex flex-wrap items-center gap-2 border-b p-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setColarAberto((v) => !v)}>Colar lista</Button>
                          <Input placeholder="Buscar código ou descrição" value={filtroItem} onChange={(e) => setFiltroItem(e.target.value)} className="h-8 w-56" />
                          <div className="flex items-center gap-2 text-sm">
                            <Switch id="so-voltam" checked={soVoltam} onCheckedChange={setSoVoltam} />
                            <Label htmlFor="so-voltam" className="font-normal">Mostrar só itens que voltam</Label>
                          </div>
                        </div>
                        {colarAberto && (
                          <div className="space-y-2 border-b p-2">
                            <Textarea rows={5} value={textoColado} onChange={(e) => setTextoColado(e.target.value)}
                              placeholder={"Cole do Excel: uma linha por item, CÓDIGO e QTD (TAB, ; ou espaço). Sem qtd = qtd cheia da NF."} className="font-mono text-xs" />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" disabled={!textoColado.trim()} onClick={() => {
                                const r = interpretarListaColada(textoColado, itensQ.data ?? []);
                                setQtds((q) => ({ ...q, ...r.casados }));
                                setResultadoColagem(r);
                                setSoVoltam(true);
                              }}>Aplicar</Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => { setColarAberto(false); setTextoColado(""); }}>Fechar</Button>
                            </div>
                            {resultadoColagem && (
                              <div className="space-y-1 text-sm">
                                <p>{Object.keys(resultadoColagem.casados).length} itens casados · {resultadoColagem.naoEncontrados.length} não encontrados · {resultadoColagem.acimaNf.length} com qtd acima da NF</p>
                                {resultadoColagem.naoEncontrados.length > 0 && (
                                  <p className="text-destructive">Não encontrados na NF (não aplicados): {resultadoColagem.naoEncontrados.join(", ")}</p>
                                )}
                                {resultadoColagem.acimaNf.length > 0 && (
                                  <p className="text-destructive">Qtd acima da NF (não aplicados): {resultadoColagem.acimaNf.map((a) => `${a.codigo} (${a.qtd} > ${a.qtdNf})`).join(", ")}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="max-h-[50vh] overflow-auto">
                        <Table>
                          <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Qtd na NF</TableHead><TableHead className="w-40">Qtd que volta <button type="button" className="ml-1 text-xs font-normal text-primary underline" onClick={() => setQtds({})}>zerar todos</button></TableHead></TableRow></TableHeader>
                          <TableBody>
                            {itensVisiveis.map((it) => (
                              <TableRow key={it.codigo}>
                                <TableCell className="font-mono text-xs">{it.codigo}</TableCell>
                                <TableCell className="text-sm">{it.descricao}</TableCell>
                                <TableCell className="text-right">{it.quantidade}</TableCell>
                                <TableCell>
                                  <div className="flex items-center">
                                  <Input type="number" min={0} max={it.quantidade} value={qtds[it.codigo] ?? 0} className="h-8 w-20"
                                    onChange={(e) => {
                                      const n = Math.max(0, Math.min(Number(it.quantidade), Math.floor(Number(e.target.value) || 0)));
                                      setQtds((q) => ({ ...q, [it.codigo]: n }));
                                    }} />
                                  <button type="button" className="ml-2 text-xs text-primary underline"
                                    onClick={() => setQtds((q) => ({ ...q, [it.codigo]: Number(it.quantidade) }))}>tudo</button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                        <div className="sticky bottom-0 border-t bg-muted p-2 text-sm">
                          {resumoParcial.itens} itens marcados · {resumoParcial.unidades} unidades · valor pela NF <strong>{formatBRL(resumoParcial.valor)}</strong>
                        </div>
                        </div>
                      )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Select value={motivoCodigo} onValueChange={setMotivoCodigo}>
                    <SelectTrigger><SelectValue placeholder="Escolha o motivo (recomendado)" /></SelectTrigger>
                    <SelectContent>
                      {interno ? motivosTransferenciaQ.data?.map((x) => (
                        <SelectItem key={x.codigo} value={x.codigo}>{x.rotulo}</SelectItem>
                      )) : motivosAgrupados.map(([g, lst]) => (
                        <SelectGroup key={g || "_"}>
                          {g && <SelectLabel>{GRUPO[g] ?? g}</SelectLabel>}
                          {lst.map((x) => <SelectItem key={x.valor} value={x.valor}>{x.label}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {interno && motivosTransferenciaQ.isLoading && <p className="text-xs text-muted-foreground">Carregando motivos…</p>}
                  {interno && motivosTransferenciaQ.isError && <p className="text-xs text-destructive">{motivosTransferenciaQ.error.message}</p>}
                  <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Descreva o que aconteceu (mínimo 5 caracteres)" rows={3} />
                </div>

                {mostrarDesfecho && (
                  <div className="space-y-2">
                    <Label>Desfecho para o cliente</Label>
                    <Select value={desfecho} onValueChange={setDesfecho}>
                      <SelectTrigger><SelectValue placeholder="Escolha o desfecho" /></SelectTrigger>
                      <SelectContent>
                        {b2bParcial && <SelectItem value="nenhum">A definir</SelectItem>}
                        {b2bParcial && <SelectItem value="abater_divida">Abater dívida</SelectItem>}
                        {bloqueiaCredito ? (
                          <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><div><SelectItem value="haver" disabled>Haver (crédito)</SelectItem></div></TooltipTrigger>
                              <TooltipContent className="max-w-xs">{dicaCredito}</TooltipContent></Tooltip>
                          </TooltipProvider>
                        ) : <SelectItem value="haver">Haver (crédito)</SelectItem>}
                        <SelectItem value="troca">Troca</SelectItem>
                        {bloqueiaCredito ? (
                          <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><div><SelectItem value="reembolso" disabled>Reembolso</SelectItem></div></TooltipTrigger>
                              <TooltipContent className="max-w-xs">{dicaCredito}</TooltipContent></Tooltip>
                          </TooltipProvider>
                        ) : <SelectItem value="reembolso">Reembolso</SelectItem>}
                      </SelectContent>
                    </Select>
                    {haverQ.isError && <p className="text-xs text-destructive">{(haverQ.error as Error).message}</p>}
                  </div>
                )}

                {!previaIniciada && (
                  <Button variant="outline" onClick={() => { setPreviaIniciada(true); ultimaChave.current = chave; void verPrevia(); }} disabled={!podePrevia || previando}>
                    {previando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Ver o que vai acontecer
                  </Button>
                )}

                {previando && previaIniciada && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Atualizando prévia…</div>}
                {previaErro && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap">{previaErro}</AlertDescription></Alert>}
                {previa && (
                  <div className="rounded-md border bg-card p-3 space-y-2 text-sm">
                    <div className="font-semibold">{previa.esteira_rotulo}</div>
                    {previa.o_que_acontece && <p>{previa.o_que_acontece}</p>}
                    {tipo === "parcial" && previa.valor_itens != null && <p>Valor dos itens: <strong>{formatBRL(Number(previa.valor_itens))}</strong></p>}
                    {(previa.acoes_complementares ?? []).length > 0 && (
                      <ul className="list-disc pl-5 text-muted-foreground">
                        {previa.acoes_complementares.map((a: string) => <li key={a}>{ACAO_HUMANA[a] ?? a}</li>)}
                      </ul>
                    )}
                    {previa.parcela_abater && (
                      <div className="rounded-md border border-info/40 bg-info/10 p-2">
                        Abate na parcela {previa.parcela_abater.numero}: {formatBRL(Number(previa.parcela_abater.saldo_atual))} → {formatBRL(Number(previa.parcela_abater.novo_valor))} · venc. {fmtData(previa.parcela_abater.vencimento)}. O boleto atual vai para baixa e o novo sai pela remessa de reemissão (aba Banco).
                      </div>
                    )}
                    {(previa.pendencias ?? []).length > 0 && (
                      <ul className="list-disc pl-5 text-destructive">
                        {previa.pendencias.map((p: string, i: number) => <li key={i}>{p}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {erroExec && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap">{erroExec}</AlertDescription></Alert>}
        {erroXpm && <Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap">{erroXpm}</AlertDescription></Alert>}

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Fechar</Button>
          {!erroXpm && (
            <Button onClick={() => void confirmar()} disabled={executando || previando || previa?.pode_executar !== true || !!m?.devolucao_aberta}>
              {executando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Confirmar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
