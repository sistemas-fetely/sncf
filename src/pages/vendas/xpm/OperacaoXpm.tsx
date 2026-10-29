import { Fragment, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCopy, ExternalLink, FileText, ListChecks, Loader2, Megaphone, PauseCircle, Scissors, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { useEstadoTela, abrirDetalhe } from "@/lib/navegacao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CodProduto } from "@/components/produto/CodProduto";
import { cn } from "@/lib/utils";
import { EntradaXpm } from "./components/EntradaXpm";

// XPM v2 · F1 (29/10/2026): só problemas da XPM, cada linha com saída (vw_xpm_pendencia.saidas).
interface Pendencia {
  tipo: string; rotulo: string | null; descricao_humana: string | null; saidas: string[] | null;
  referencia: string; codigo: string | null; pedido_sncf: string | null; pedido_id: string | null;
  canal: string | null; cliente: string | null; estagio_codigo: string | null; fase_rotulo: string | null;
  nf_numero: string | null; dias: number | null; pausada: boolean | null; cobrancas: number | null; ultima_cobranca_em: string | null;
}
interface TipoPend { chave: string; rotulo: string; descricao_humana: string | null; ordem: number }
type AcaoDialog = "cobrar" | "fechar" | "aceitar_corte" | "pausar";

const dias1 = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} d`);
function haQuanto(iso: string | null) {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
  return h < 24 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} d`;
}
const pedidoDe = (p: Pendencia) => p.pedido_sncf ?? p.referencia;
const situacaoDe = (p: Pendencia) => p.fase_rotulo ?? p.estagio_codigo ?? "—";

export default function OperacaoXpm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [estado, setEstado] = useEstadoTela({ tipo: "", busca: "" }, { prefixo: "op", replaceKeys: ["busca"] });
  const [expandido, setExpandido] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ acao: AcaoDialog; p: Pendencia } | null>(null);

  const pendQ = useQuery({
    queryKey: ["xpm-pendencias"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Pendencia[]> => {
      const { data, error } = await (supabase as any).from("vw_xpm_pendencia").select("*");
      if (error) throw new Error(rawMessage(error));
      return (data ?? []) as Pendencia[];
    },
  });
  const tiposQ = useQuery({
    queryKey: ["xpm-pendencia-tipos"],
    queryFn: async (): Promise<TipoPend[]> => {
      const { data, error } = await (supabase as any).from("xpm_pendencia_tipo").select("chave, rotulo, descricao_humana, ordem").eq("ativo", true).order("ordem");
      if (error) throw new Error(rawMessage(error));
      return (data ?? []) as TipoPend[];
    },
  });

  const todas = pendQ.data ?? [];
  const tipos = tiposQ.data ?? [];
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of todas) m.set(p.tipo, (m.get(p.tipo) ?? 0) + 1);
    return m;
  }, [todas]);
  const filtradas = useMemo(() => {
    const t = estado.busca.trim().toLowerCase();
    return todas.filter((p) => (!estado.tipo || p.tipo === estado.tipo) && (!t ||
      [p.pedido_sncf, p.referencia, p.codigo, p.cliente, p.nf_numero].some((v) => v?.toLowerCase().includes(t))));
  }, [todas, estado.tipo, estado.busca]);
  const grupos = useMemo(() => {
    const ordem = new Map(tipos.map((t, i) => [t.chave, i]));
    const m = new Map<string, Pendencia[]>();
    for (const p of filtradas) m.set(p.tipo, [...(m.get(p.tipo) ?? []), p]);
    return [...m.entries()]
      .sort((a, b) => (ordem.get(a[0]) ?? 999) - (ordem.get(b[0]) ?? 999))
      .map(([tipo, linhas]) => {
        const t = tipos.find((x) => x.chave === tipo);
        return { tipo, rotulo: t?.rotulo ?? linhas[0].rotulo ?? tipo, descricao: t?.descricao_humana ?? linhas[0].descricao_humana, linhas: [...linhas].sort((a, b) => Number(b.dias ?? 0) - Number(a.dias ?? 0)) };
      });
  }, [filtradas, tipos]);

  const abrirPedido = (p: Pendencia) => p.pedido_id && abrirDetalhe(navigate, location, `/pedidos/${p.pedido_id}`, { foco: p.referencia, label: "XPM · Operação" });

  const Acoes = ({ p }: { p: Pendencia }) => (
    <div className="flex flex-wrap justify-end gap-1">
      {(p.saidas ?? []).map((s) => {
        if (s === "cobrar") return <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "cobrar", p })}><Megaphone className="h-3.5 w-3.5" />Cobrar</Button>;
        if (s === "fechar") return <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "fechar", p })}><CheckCircle2 className="h-3.5 w-3.5" />Fechar</Button>;
        if (s === "aceitar_corte") return <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "aceitar_corte", p })}><Scissors className="h-3.5 w-3.5" />Aceitar corte</Button>;
        if (s === "pausar") return <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={() => setDlg({ acao: "pausar", p })}><PauseCircle className="h-3.5 w-3.5" />Pausar</Button>;
        if (s === "ver_itens") return <Button key={s} size="sm" variant={expandido === p.referencia ? "secondary" : "outline"} className="h-7 gap-1 px-2" onClick={() => setExpandido(expandido === p.referencia ? null : p.referencia)}><ListChecks className="h-3.5 w-3.5" />Itens</Button>;
        if (s === "abrir_tarefa") return (
          <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" asChild>
            <a href="/tarefas?origem=estoque" target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Tarefa</a>
          </Button>);
        if (s === "ir_fiscal") return (
          <Button key={s} size="sm" variant="outline" className="h-7 gap-1 px-2" asChild><a href="/fiscal"><FileText className="h-3.5 w-3.5" />Fiscal</a></Button>);
        return <Badge key={s} variant="outline">{s}</Badge>;
      })}
    </div>
  );

  const CelPedido = ({ p }: { p: Pendencia }) => (
    <div className="min-w-0">
      <div className="font-medium">{pedidoDe(p)}</div>
      {p.codigo && p.tipo !== "entrada_com_diferenca" && <div className="text-xs text-muted-foreground">XPM {p.codigo}</div>}
      {p.pedido_id && <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => abrirPedido(p)}>abrir no pedido</button>}
    </div>
  );
  const CelCanal = ({ p }: { p: Pendencia }) => p.canal === "entrada" ? <Badge variant="outline">Entrada</Badge> : p.canal ? <Badge variant="secondary">{p.canal}</Badge> : <span>—</span>;
  const CelTempo = ({ p }: { p: Pendencia }) => {
    const d = Number(p.dias ?? 0);
    return <span className={cn("tabular-nums whitespace-nowrap", d >= 7 ? "font-medium text-destructive" : d >= 3 ? "font-medium text-warning" : "")}>{dias1(p.dias)}</span>;
  };
  const CelCobr = ({ p }: { p: Pendencia }) => Number(p.cobrancas ?? 0) > 0
    ? <span className="whitespace-nowrap text-xs">{p.cobrancas} · última há {haQuanto(p.ultima_cobranca_em)}</span>
    : <span className="text-xs text-muted-foreground">—</span>;
  const CelSituacao = ({ p }: { p: Pendencia }) => (
    <div><div>{situacaoDe(p)}</div>{p.nf_numero && <div className="text-xs text-muted-foreground">NF {p.nf_numero}</div>}</div>
  );

  return (
    <div className="space-y-6 p-4 md:px-8">
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <CardTitle className="text-base">O que precisa de ação na XPM</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={!estado.tipo ? "default" : "outline"} className="h-7" onClick={() => setEstado({ tipo: "" })}>Todas · {todas.length}</Button>
            {tipos.map((t) => {
              const n = contagem.get(t.chave) ?? 0;
              return (
                <Button key={t.chave} size="sm" variant={estado.tipo === t.chave ? "default" : "outline"}
                  className={cn("h-7", n === 0 && estado.tipo !== t.chave && "text-muted-foreground")}
                  onClick={() => setEstado({ tipo: estado.tipo === t.chave ? "" : t.chave })}>
                  {t.rotulo} · <span className="tabular-nums">{n}</span>
                </Button>
              );
            })}
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input value={estado.busca} onChange={(e) => setEstado({ busca: e.target.value })} placeholder="Pedido, XPM, cliente, NF" className="h-8 pl-8" />
              {estado.busca && <button type="button" className="absolute right-2 top-2" onClick={() => setEstado({ busca: "" })}><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {pendQ.isLoading || tiposQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : pendQ.error || tiposQ.error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{((pendQ.error ?? tiposQ.error) as Error).message}</p>
          ) : grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada pendente na XPM agora.</p>
          ) : grupos.map((g) => (
            <section key={g.tipo} className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">{g.rotulo} <span className="font-normal text-muted-foreground">· {g.linhas.length}</span></h3>
                {g.descricao && <p className="text-xs text-muted-foreground">{g.descricao}</p>}
              </div>
              {/* Desktop */}
              <div className="hidden overflow-x-auto rounded-md border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Canal</TableHead>
                      <TableHead>Situação na XPM</TableHead><TableHead>Há quanto tempo</TableHead><TableHead>Cobranças</TableHead>
                      <TableHead /><TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.linhas.map((p) => (
                      <Fragment key={p.tipo + p.referencia}>
                        <TableRow data-foco-id={p.referencia}>
                          <TableCell><CelPedido p={p} /></TableCell>
                          <TableCell className="max-w-[220px] truncate" title={p.cliente ?? undefined}>{p.cliente ?? "—"}</TableCell>
                          <TableCell><CelCanal p={p} /></TableCell>
                          <TableCell><CelSituacao p={p} /></TableCell>
                          <TableCell><CelTempo p={p} /></TableCell>
                          <TableCell><CelCobr p={p} /></TableCell>
                          <TableCell>{p.pausada && <Badge variant="outline" className="border-warning text-warning">Pausada</Badge>}</TableCell>
                          <TableCell><Acoes p={p} /></TableCell>
                        </TableRow>
                        {expandido === p.referencia && (
                          <TableRow><TableCell colSpan={8} className="bg-muted/30"><ItensExpedicao codigo={p.codigo ?? p.referencia} /></TableCell></TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile */}
              <div className="space-y-2 md:hidden">
                {g.linhas.map((p) => (
                  <div key={p.tipo + p.referencia} data-foco-id={p.referencia} className="space-y-2 rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2"><CelPedido p={p} /><CelTempo p={p} /></div>
                    <div className="truncate text-muted-foreground">{p.cliente ?? "—"}</div>
                    <div className="flex flex-wrap items-center gap-2"><CelCanal p={p} />{p.pausada && <Badge variant="outline" className="border-warning text-warning">Pausada</Badge>}<CelCobr p={p} /></div>
                    <CelSituacao p={p} />
                    <Acoes p={p} />
                    {expandido === p.referencia && <ItensExpedicao codigo={p.codigo ?? p.referencia} />}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Entrada</h2>
          <p className="text-sm text-muted-foreground">Planilha de recebimento para a XPM e Termo de Conferência de volta.</p>
        </div>
        <EntradaXpm />
      </section>

      {dlg && <DialogAcao acao={dlg.acao} p={dlg.p} onClose={() => setDlg(null)} onFeito={async () => {
        await Promise.all(["xpm-pendencias", "xpm-expedicoes", "xpm-pausas"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      }} />}
    </div>
  );
}

function ItensExpedicao({ codigo }: { codigo: string }) {
  const q = useQuery({
    queryKey: ["xpm-expedicao-itens", codigo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("xpm_expedicao_item")
        .select("id, sequencia, codigo_produto, quantidade_solicitada, quantidade_atendida").eq("expedicao_codigo", codigo).order("sequencia");
      if (error) throw new Error(rawMessage(error));
      return (data ?? []) as { id: string; codigo_produto: string | null; quantidade_solicitada: number | null; quantidade_atendida: number | null }[];
    },
  });
  if (q.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data?.length) return <p className="text-sm text-muted-foreground">Expedição sem itens registrados.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Solicitado</TableHead><TableHead className="text-right">Atendido</TableHead><TableHead className="text-right">Corte</TableHead></TableRow></TableHeader>
        <TableBody>
          {q.data.map((i) => {
            const corte = Number(i.quantidade_solicitada ?? 0) - Number(i.quantidade_atendida ?? 0);
            return (
              <TableRow key={i.id}>
                <TableCell><CodProduto chave={i.codigo_produto} /></TableCell>
                <TableCell className="text-right tabular-nums">{i.quantidade_solicitada ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{i.quantidade_atendida ?? "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", corte > 0 && "font-medium text-destructive")}>{corte > 0 ? corte : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const TITULO: Record<AcaoDialog, string> = { cobrar: "Cobrar XPM", fechar: "Fechar pendência", aceitar_corte: "Aceitar corte", pausar: "Pausar expedição" };

function DialogAcao({ acao, p, onClose, onFeito }: { acao: AcaoDialog; p: Pendencia; onClose: () => void; onFeito: () => Promise<void> }) {
  const textoPadrao = `Pedido ${pedidoDe(p)}${p.codigo ? ` (${p.codigo})` : ""} está em ${situacaoDe(p)} há ${Math.round(Number(p.dias ?? 0))} dias. Podem verificar?`;
  const [texto, setTexto] = useState(acao === "cobrar" ? textoPadrao : "");
  const [motivoId, setMotivoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const motivosQ = useQuery({
    queryKey: ["xpm-motivos-pausa"],
    enabled: acao === "pausar",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("xpm_motivo_pausa").select("id, descricao, codigo").eq("ativo", true).order("ordem");
      if (error) throw new Error(rawMessage(error));
      return (data ?? []) as { id: string; descricao: string | null; codigo: string }[];
    },
  });
  const exigeMotivo = acao === "fechar" || acao === "aceitar_corte";
  const invalido = (exigeMotivo && texto.trim().length === 0) || (acao === "pausar" && !motivoId);

  const enviar = async () => {
    setEnviando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_xpm_pendencia_acao", {
        p_tipo: p.tipo, p_referencia: p.referencia, p_acao: acao,
        p_motivo: exigeMotivo ? texto.trim() : null,
        p_observacao: acao === "cobrar" || acao === "pausar" ? texto.trim() || null : null,
        p_motivo_pausa_id: acao === "pausar" ? motivoId : null,
      });
      if (error) throw new Error(rawMessage(error));
      const msg = typeof data === "string" ? data : data?.mensagem ?? `${TITULO[acao]} registrado — ${pedidoDe(p)}`;
      toast.success(msg);
      await onFeito();
      onClose();
    } catch (e) {
      toast.error(`${TITULO[acao]} falhou`, { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TITULO[acao]}</DialogTitle>
          <DialogDescription>{pedidoDe(p)}{p.codigo ? ` · XPM ${p.codigo}` : ""} · {situacaoDe(p)}</DialogDescription>
        </DialogHeader>
        {acao === "pausar" && (
          <div className="space-y-1">
            <Label>Motivo</Label>
            <Select value={motivoId} onValueChange={setMotivoId}>
              <SelectTrigger><SelectValue placeholder={motivosQ.isLoading ? "Carregando…" : "Selecione o motivo"} /></SelectTrigger>
              <SelectContent>{(motivosQ.data ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.descricao ?? m.codigo}</SelectItem>)}</SelectContent>
            </Select>
            {motivosQ.error && <p className="text-sm text-destructive">{(motivosQ.error as Error).message}</p>}
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="op-texto">{acao === "cobrar" ? "Mensagem (opcional)" : acao === "pausar" ? "Observação" : "Motivo*"}</Label>
          <Textarea id="op-texto" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          {acao === "cobrar" && (
            <Button variant="outline" className="gap-1" onClick={async () => {
              try { await navigator.clipboard.writeText(texto); toast.success("Mensagem copiada"); }
              catch (e) { toast.error("Não foi possível copiar", { description: (e as Error).message }); }
            }}><ClipboardCopy className="h-4 w-4" />Copiar para WhatsApp</Button>
          )}
          <Button disabled={invalido || enviando} onClick={enviar} className="gap-1">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {acao === "cobrar" ? "Registrar cobrança" : TITULO[acao]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
