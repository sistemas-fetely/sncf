/**
 * FUNIL DE DEVOLUÇÕES (30/09/2026): uma linha por devolução, lida da view
 * canônica `vw_devolucao_funil`. As 7 etapas (e1–e7) têm rótulo e descrição
 * na dimensão `devolucao_etapa`. A conferência física é uma etapa do funil
 * (ConferirRetornoDialog, inalterado).
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FilterInput } from "@/components/ui/filter-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { QuarentenaEstoquePainel, buscarQuarentenaFila } from "@/components/estoque/QuarentenaEstoquePainel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Loader2, PackageCheck, RefreshCw, Search, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { fmtDataHora } from "@/lib/data";
import { LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao, lerTamanhoPaginaSalvo, type PageSizeOption } from "@/components/tabela/RodapePaginacao";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import { useDevolucoesRetornoPendente } from "@/hooks/estoque/useDevolucoesRetornoPendente";
import { ConferirRetornoDialog } from "@/components/estoque/ConferirRetornoDialog";
import { CancelamentoReembolsoPainel } from "@/components/devolucao/CancelamentoReembolsoPainel";
import { BlocoFiscalSiteSp } from "@/components/devolucao/FiscalSiteSp";
import { useSearchParams } from "react-router-dom";
import { DEVOLUCAO_ATIVA, useDevolucoesVD } from "@/components/venda-direta/DevolucaoVendaDireta";

type Funil = {
  id: string; numero: string | null; canal: string | null; status: string | null; status_efetivo: string | null;
  pedido_ref: string | null; cliente: string | null; motivo_rotulo: string | null; motivo_exibicao: string | null; culpa: string | null;
  dias_desde: number | null; valor_credito: number | null; skus: number | null;
  qtd_declarada: number | null; qtd_retornada: number | null; qtd_pendente: number | null;
  destino_codigo: string | null; reversa_origem: string | null; rastreio_efetivo: string | null; rastreio_status: string | null;
  frete_reverso_por_conta: string | null;
  exige_transferencia_cd: boolean | null;
  sem_retorno_fisico: boolean | null;
  destino_retorno: string | null;
  pendencias_encerramento: string[] | null;
  transferencia_pedido_id: string | null; transferencia_numero: string | null; transferencia_ok: boolean | null;
  e1_aberta: boolean; e2_reversa: boolean; e3_recebida: boolean; e4_conferida: boolean;
  e5_nf_resolvida: boolean; e6_ressarcida: boolean; e7_encerrada: boolean;
  nf_vinculo_confirmado: boolean | null; nf_retorno_sugerida: string | null;
  refund_ok: boolean | null; refund_valor: number | null;
  recebido_em: string | null; criado_em: string | null; encerrado_em: string | null;
};
type Etapa = { codigo: string; rotulo: string; ordem: number; natureza: string | null; descricao: string | null; obrigatoria_encerramento: boolean };

const QK_FUNIL = ["vw_devolucao_funil"];
const QK_QUARENTENA = ["vw_quarentena_fila"] as const;
const ETAPA_CAMPO: Record<number, keyof Funil> = {
  1: "e1_aberta", 2: "e2_reversa", 3: "e3_recebida", 4: "e4_conferida", 5: "e5_nf_resolvida", 6: "e6_ressarcida", 7: "e7_encerrada",
};
const ALTURA_CASA_HEADER = 64;
const CHAVE_PAGINA_DEVOLUCAO = "fetely:estoque:retorno-devolucao:page-size";
const sb = supabase as any;

function formatNum(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(v ?? 0));
}
/** dd/mm/aa em Brasília (timestamptz). */
function fmtDataCurta(v: string | null | undefined, vazio = "—") {
  if (!v) return vazio;
  const d = new Date(v);
  if (isNaN(d.getTime())) return vazio;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
}
/** dd/mm em Brasília (timestamptz). */
function fmtDiaMes(v: string | null | undefined, vazio = "—") {
  if (!v) return vazio;
  const d = new Date(v);
  if (isNaN(d.getTime())) return vazio;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}
const statusDe = (d: Funil) => String(d.status_efetivo ?? d.status ?? "");

async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw error;
  if (data && typeof data === "object" && (data as any).ok === false) throw new Error((data as any).erro ?? "O banco recusou a operação.");
  return data;
}

function FunilSteps({ d, etapas }: { d: Funil; etapas: Etapa[] }) {
  return (
    <div className="flex items-center gap-1">
      {etapas.map((e) => {
        const campo = ETAPA_CAMPO[e.ordem];
        const feito = campo ? Boolean(d[campo]) : false;
        const sugerida = e.ordem === 5 && !feito && !!d.nf_retorno_sugerida;
        const naoAplica = !!d.sem_retorno_fisico && e.ordem >= 2 && e.ordem <= 4;
        return (
          <Tooltip key={e.codigo}>
            <TooltipTrigger asChild>
              <span className={cn("h-3 w-3 rounded-full border",
                naoAplica ? "border-dashed bg-background border-muted-foreground/40" : feito ? "bg-primary border-primary" : sugerida ? "bg-warning border-warning" : "bg-muted border-border")} />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="font-medium">{e.ordem}. {e.rotulo}</div>
              {naoAplica && <div className="text-xs">Não se aplica — sem retorno físico (o produto não saiu do Site SP).</div>}
              {!naoAplica && e.descricao && <div className="text-xs">{e.descricao}</div>}
              {sugerida && <div className="text-xs mt-1">NF de retorno {d.nf_retorno_sugerida} capturada — confirme o vínculo na mesa fiscal</div>}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default function RetornoDevolucao() {
  const qc = useQueryClient();
  const funilQ = useQuery({
    queryKey: QK_FUNIL,
    queryFn: async () => {
      const out: Funil[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("vw_devolucao_funil").select("*").order("criado_em", { ascending: false }).order("id").range(de, de + 999);
        if (error) throw error;
        out.push(...((data ?? []) as Funil[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const etapasQ = useQuery({
    queryKey: ["devolucao_etapa"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb.from("devolucao_etapa")
        .select("codigo, rotulo, ordem, natureza, descricao, obrigatoria_encerramento")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Etapa[];
    },
  });
  const statusQ = useQuery({
    queryKey: ["devolucao_status"],
    queryFn: async () => {
      const { data, error } = await sb.from("devolucao_status").select("codigo, rotulo, eh_final");
      if (error) throw error;
      return (data ?? []) as { codigo: string; rotulo: string; eh_final: boolean }[];
    },
  });
  const quarentenaQ = useQuery({ queryKey: QK_QUARENTENA, queryFn: buscarQuarentenaFila });
  const reembolsosQ = useDevolucoesVD();
  const statusMap = useMemo(() => new Map((statusQ.data ?? []).map((s) => [s.codigo, s])), [statusQ.data]);
  // Aberta = status com eh_final=false na dimensão (inclui retorno_concluido).
  const ehAberta = (d: Funil) => statusMap.get(statusDe(d))?.eh_final !== true;
  const rotuloStatus = (d: Funil) => statusMap.get(statusDe(d))?.rotulo ?? (statusDe(d) || "—");
  const pendQ = useDevolucoesRetornoPendente();
  const [aba, setAba] = useAbaUrl("funil");

  const devolucoes = funilQ.data ?? [];
  const etapas = etapasQ.data ?? [];
  const pendMap = useMemo(() => new Map((pendQ.data ?? []).map((p) => [p.devolucao_id, p])), [pendQ.data]);

  const [searchParams] = useSearchParams();
  const [busca, setBusca] = useState(() => searchParams.get("q") ?? "");
  const [canal, setCanal] = useState<"todos" | "b2b" | "b2c" | "site_sp">("todos");
  const [soAbertas, setSoAbertas] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [conferirId, setConferirId] = useState<string | null>(null);
  const [receber, setReceber] = useState<Funil | null>(null);
  const [reversa, setReversa] = useState<Funil | null>(null);
  const [estornar, setEstornar] = useState<Funil | null>(null);
  const [vincular, setVincular] = useState<Funil | null>(null);
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const acaoLinha = async (id: string, nome: string, args: Record<string, unknown>, msg: string) => {
    setAcaoId(id);
    try {
      await rpc(nome, args);
      toast.success(msg);
      await invalidar();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setAcaoId(null);
    }
  };
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() => lerTamanhoPaginaSalvo(CHAVE_PAGINA_DEVOLUCAO));

  useEffect(() => { setPagina(1); }, [busca, canal, soAbertas]);

  const kpisRef = useRef<HTMLDivElement>(null);
  const [alturaKpis, setAlturaKpis] = useState(0);
  useEffect(() => {
    const el = kpisRef.current;
    if (!el) return;
    const medir = () => setAlturaKpis(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return devolucoes.filter((d) => {
      if (canal !== "todos" && d.canal !== canal) return false;
      if (soAbertas && !ehAberta(d)) return false;
      if (!q) return true;
      const p = pendMap.get(d.id);
      return (
        d.numero?.toLowerCase().includes(q) || d.pedido_ref?.toLowerCase().includes(q) ||
        d.cliente?.toLowerCase().includes(q) || d.rastreio_efetivo?.toLowerCase().includes(q) ||
        p?.nf?.toLowerCase().includes(q) ||
        p?.itens.some((i) => i.sku.toLowerCase().includes(q) || i.nome_comercial?.toLowerCase().includes(q))
      );
    });
  }, [devolucoes, busca, canal, soAbertas, pendMap, statusMap]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginaItens = filtrados.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);

  const abertas = devolucoes.filter(ehAberta);
  const paradas = abertas.filter((d) => (d.dias_desde ?? 0) > 30).length;
  const totalUnidades = devolucoes.reduce((s, d) => s + Number(d.qtd_pendente ?? 0), 0);
  const totalValor = (pendQ.data ?? []).reduce((s, p) => s + p.valor_custo_pendente, 0);
  const quarentena = useMemo(() => {
    const linhas = quarentenaQ.data?.linhas ?? [];
    const unidades = linhas.reduce((s, linha) => s + Number(linha.saldo), 0);
    const skus = new Set(linhas.map((linha) => `${linha.sku}|${linha.centro}|${linha.devolucao_id ?? ""}`)).size;
    const movimentos = linhas.map((linha) => linha.ultimo_mov ? new Date(linha.ultimo_mov).getTime() : NaN).filter(Number.isFinite);
    const maisAntigo = movimentos.length ? Math.min(...movimentos) : null;
    const agoraBrasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getTime();
    const dias = maisAntigo == null ? 0 : Math.max(0, Math.floor((agoraBrasilia - maisAntigo) / 86_400_000));
    return { unidades, skus, dias };
  }, [quarentenaQ.data]);
  const reembolsosPendentes = (reembolsosQ.data ?? []).filter((d) => !d.devolucao_id && DEVOLUCAO_ATIVA.has(d.status)).length;

  const invalidar = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK_FUNIL }),
      qc.invalidateQueries({ queryKey: ["devolucao-retorno-pendente"] }),
    ]);
  };

  const conferir = conferirId ? pendMap.get(conferirId) ?? null : null;
  const isFetching = funilQ.isFetching || pendQ.isFetching;

  return (
    <PageShell variant="dados" className="animate-casa-fade-in">
      <TooltipProvider delayDuration={150}>
      <div style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaKpis}px` } as CSSProperties}>
        <CasaPageHeader
          breadcrumb={[{ label: "Casa", to: "/" }, { label: "SOPs" }, { label: "Produto" }, { label: "Estoque" }, { label: "Devoluções" }]}
          title="Devoluções"
          subtitle={aba === "reembolso" ? "Sem NF: pedido pago e não faturado — só o dinheiro volta." : aba === "funil" ? "Com NF: da abertura ao encerramento — produto e nota voltam." : "Funil completo: da abertura ao encerramento. Retorno parcial é normal."}
          actions={
            <Button variant="outline" size="sm" onClick={() => { void funilQ.refetch(); void pendQ.refetch(); }} disabled={isFetching} className="gap-2">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />Atualizar
            </Button>
          }
        />

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="funil">Cancelamento com NF</TabsTrigger>
            <TabsTrigger value="quarentena">Quarentena</TabsTrigger>
            <TabsTrigger value="reembolso">Cancelamento sem NF{reembolsosPendentes > 0 && <Badge variant="secondary" className="ml-2 font-normal tabular-nums">{reembolsosPendentes}</Badge>}</TabsTrigger>
          </TabsList>
          <TabsContent value="funil" className="mt-4">
        <div ref={kpisRef} className="sticky top-16 z-20 -mx-6 grid grid-cols-2 gap-3 bg-background px-6 py-2 lg:grid-cols-5">
          <div className="rounded-md border bg-card p-4"><div className="text-xs text-muted-foreground">Devoluções abertas</div><div className="text-2xl font-medium tabular-nums">{formatNum(abertas.length)}</div></div>
          <div className="rounded-md border bg-card p-4"><div className="text-xs text-muted-foreground">Paradas há +30d</div><div className="text-2xl font-medium tabular-nums">{formatNum(paradas)}</div></div>
          <div className="rounded-md border bg-card p-4"><div className="text-xs text-muted-foreground">Unidades pendentes</div><div className="text-2xl font-medium tabular-nums">{formatNum(totalUnidades)}</div></div>
          <div className="rounded-md border bg-card p-4"><div className="text-xs text-muted-foreground">Custo parado</div><div className="text-2xl font-medium tabular-nums">{formatBRL(totalValor)}</div></div>
          <div role="button" tabIndex={0} aria-label="Abrir quarentena" onClick={() => setAba("quarentena")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAba("quarentena"); } }} className={cn("cursor-pointer rounded-md border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", quarentena.unidades > 0 && "border-warning/30 bg-warning/10")}>
            <div className="text-xs text-muted-foreground">Em quarentena</div>
            <div className={cn("text-2xl font-medium tabular-nums", quarentena.unidades > 0 && "text-warning")}>{formatNum(quarentena.unidades)}</div>
            <div className="text-xs text-muted-foreground">{quarentena.unidades > 0 ? `${quarentena.skus} SKU(s) · mais antigo há ${quarentena.dias} d` : "nada aguardando validação"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <FilterInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por devolução, pedido, cliente, NF, SKU ou produto" className="pl-9" />
          </div>
          <ToggleGroup type="single" size="sm" variant="outline" value={canal} onValueChange={(v) => v && setCanal(v as typeof canal)}>
            <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
            <ToggleGroupItem value="b2b">B2B</ToggleGroupItem>
            <ToggleGroupItem value="b2c">B2C</ToggleGroupItem>
            <ToggleGroupItem value="site_sp">Site SP</ToggleGroupItem>
          </ToggleGroup>
          <label className="flex items-center gap-2 text-sm"><Switch checked={soAbertas} onCheckedChange={setSoAbertas} />Só abertas</label>
          <span className="text-xs text-muted-foreground ml-auto">{filtrados.length} {filtrados.length === 1 ? "devolução" : "devoluções"}</span>
        </div>

        {(funilQ.isError || etapasQ.isError || pendQ.isError) && (
          <Alert variant="destructive" className="mb-4"><AlertDescription>{formatError(funilQ.error ?? etapasQ.error ?? pendQ.error)}</AlertDescription></Alert>
        )}

        <div className="rounded-md border bg-card">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className={LINHA_CABECALHO_COLADO}>
                <TableHead className="w-8" />
                <TableHead className="w-[190px]">Devolução</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="w-[80px] whitespace-nowrap">Data</TableHead>
                <TableHead className="w-[80px] text-right">Dias</TableHead>
                <TableHead className="group w-[150px]">
                  <span className="inline-flex items-center gap-1">
                    Funil
                    <InfoMetrica rotulo="Funil da devolução" ariaLabel="Como ler o funil">
                      <div className="space-y-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">O que é</div>
                          <div className="mt-0.5">As 7 etapas da devolução, da abertura ao encerramento. Cada bolinha é uma etapa.</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Etapas</div>
                          <ol className="mt-0.5 space-y-1">
                            {etapas.map((etapa) => (
                              <li key={etapa.codigo}>
                                <span className="font-medium">{etapa.ordem}. {etapa.rotulo}</span>
                                {etapa.obrigatoria_encerramento && (
                                  <Badge variant="outline" className="ml-1.5 h-4 px-1 py-0 align-middle text-[9px] font-normal text-muted-foreground">obrigatória</Badge>
                                )}
                                {etapa.descricao && <span> — {etapa.descricao}</span>}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Como ler</div>
                          <div className="mt-0.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <span className="inline-block h-3 w-3 rounded-full border border-primary bg-primary" aria-hidden />
                              <span>cheia = etapa cumprida</span><span aria-hidden>·</span>
                              <span className="inline-block h-3 w-3 rounded-full border border-warning bg-warning" aria-hidden />
                              <span>âmbar = NF de retorno sugerida, aguardando confirmação</span><span aria-hidden>·</span>
                              <span className="inline-block h-3 w-3 rounded-full border border-border bg-muted" aria-hidden />
                              <span>vazia = pendente.</span>
                            </div>
                            <div>Retorno parcial é normal. A devolução encerra sozinha quando todas as obrigatórias fecham; o que falta aparece em 'Para encerrar' na linha expandida.</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">De onde vem</div>
                          <div className="mt-0.5">Recebida é declarada pelo operador. As demais são derivadas do sistema: rastreio, estoque, NF capturada do Bling e reembolso da loja.</div>
                        </div>
                      </div>
                    </InfoMetrica>
                  </span>
                </TableHead>
                <TableHead className="w-[90px] text-right">Pendente</TableHead>
                <TableHead className="w-[130px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {funilQ.isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground"><PackageCheck className="h-5 w-5 mx-auto mb-2 opacity-60" />Nenhuma devolução encontrada.</TableCell></TableRow>
              ) : paginaItens.map((d) => {
                const aberto = expandido === d.id;
                const dias = d.dias_desde ?? 0;
                const p = pendMap.get(d.id);
                return (
                  <Fragment key={d.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandido(aberto ? null : d.id)}>
                      <TableCell>{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{d.numero ?? "—"}</span>
                          {d.canal === "b2c" && <Badge variant="outline" className="font-normal">B2C</Badge>}
                          {d.canal === "site_sp" && <Badge variant="outline" className="font-normal">Site SP</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">Pedido {d.pedido_ref ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px] truncate">{d.cliente ?? "—"}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{d.motivo_exibicao ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-sm">
                        <span title={fmtDataHora(d.criado_em)}>{fmtDataCurta(d.criado_em)}</span>
                        {d.recebido_em && (
                          <div className="text-[11px] text-muted-foreground whitespace-nowrap" title={fmtDataHora(d.recebido_em)}>
                            receb. {fmtDiaMes(d.recebido_em)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={cn("font-normal tabular-nums whitespace-nowrap",
                          dias > 30 ? "bg-destructive/10 text-destructive border-destructive/20"
                            : dias > 10 ? "bg-warning/10 text-warning border-warning/20"
                              : "bg-success/10 text-success border-success/20")}>
                          {formatNum(d.dias_desde)} d
                        </Badge>
                      </TableCell>
                      <TableCell><FunilSteps d={d} etapas={etapas} /></TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatNum(d.qtd_pendente)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {!d.e3_recebida && ehAberta(d) ? (
                          <Button size="sm" className="gap-2" onClick={() => setReceber(d)}><PackageCheck className="h-4 w-4" />Receber</Button>
                        ) : d.e3_recebida && !d.e4_conferida ? (
                          <Button size="sm" className="gap-2" disabled={!p}
                            title={p ? undefined : "Sem itens pendentes de conferência para esta devolução"}
                            onClick={() => setConferirId(d.id)}><Undo2 className="h-4 w-4" />Conferir</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setExpandido(aberto ? null : d.id)}>Detalhes</Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={9}>
                          <div className="grid gap-4 p-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">Logística reversa</div>
                              {d.rastreio_efetivo ? (
                                <>
                                  <div className="font-mono">{d.rastreio_efetivo}</div>
                                  <div className="text-muted-foreground">{d.rastreio_status ?? "Sem status de rastreio"}{d.reversa_origem ? ` · ${d.reversa_origem}` : ""}</div>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => setReversa(d)}>Registrar etiqueta reversa</Button>
                              )}
                              {d.frete_reverso_por_conta && <div className="text-xs text-muted-foreground">Frete por conta: {d.frete_reverso_por_conta}</div>}
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">Financeiro</div>
                              {d.canal === "site_sp" ? (
                                <div className="text-muted-foreground">Ressarcimento abaixo · {rotuloStatus(d)}</div>
                              ) : d.canal === "b2c" ? (
                                d.refund_ok
                                  ? <Badge variant="outline" className="bg-success/10 text-success border-success/20 font-normal">Reembolsado {formatBRL(d.refund_valor ?? 0)} na loja</Badge>
                                  : <Badge variant="outline" className="bg-muted text-muted-foreground font-normal">Sem reembolso na loja</Badge>
                              ) : (
                                <>
                                  <div>Crédito: {d.valor_credito != null ? formatBRL(d.valor_credito) : "—"}</div>
                                  <div className="text-muted-foreground">Desfecho: {d.e6_ressarcida ? "ressarcida" : "pendente"} · {rotuloStatus(d)}</div>
                                </>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">Recebimento</div>
                              {d.e3_recebida ? (
                                <>
                                  <div>{d.destino_codigo ?? "—"} · {fmtDataHora(d.recebido_em)}</div>
                                  {d.exige_transferencia_cd && d.recebido_em != null && (
                                    d.transferencia_ok ? (
                                      <Badge variant="outline" className="bg-success/10 text-success border-success/20 font-normal">{d.transferencia_numero ?? "TRS"}</Badge>
                                    ) : d.transferencia_pedido_id ? (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-normal">{d.transferencia_numero ?? "TRS"} vinculada · aguardando NF</Badge>
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={acaoId === d.id}
                                          onClick={() => void acaoLinha(d.id, "vincular_transferencia_devolucao", { p_devolucao_id: d.id, p_transferencia_pedido_id: null }, "Transferência desvinculada.")}>Desvincular</Button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-normal">Transferência CD pendente</Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            Retorno físico no SITE-SP de venda emitida por SC — emitir transferência SC→SP (CFOP 6152) para fechar o fiscal.
                                          </TooltipContent>
                                        </Tooltip>
                                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setVincular(d)}>Vincular transferência</Button>
                                      </div>
                                    )
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setEstornar(d)}>Estornar recebimento</Button>
                                </>
                              ) : <div className="text-muted-foreground">Ainda não recebida</div>}
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground">Itens</div>
                              <div>Declarado {formatNum(d.qtd_declarada)} × retornado {formatNum(d.qtd_retornada)} · {formatNum(d.skus)} SKU(s)</div>
                              {p && (
                                <ul className="text-xs text-muted-foreground space-y-0.5">
                                  {p.itens.map((i) => (
                                    <li key={i.sku}><span className="font-mono">{i.sku}</span> {i.nome_comercial ?? ""} — saiu {formatNum(i.qtd_saiu)}, voltou {formatNum(i.qtd_ja_retornada)}, pendente {formatNum(i.qtd_pendente)}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                          {d.canal === "site_sp" && (
                            <div className="mx-2 mb-2 grid gap-3 md:grid-cols-2">
                              <div className="space-y-2 rounded-md border bg-card p-3">
                                <div className="text-xs font-medium text-muted-foreground">Fiscal</div>
                                <BlocoFiscalSiteSp devolucaoId={d.id} nfResolvida={d.e5_nf_resolvida} />
                              </div>
                              <div className="space-y-2 rounded-md border bg-card p-3">
                                <div className="text-xs font-medium text-muted-foreground">Ressarcimento</div>
                                <CancelamentoReembolsoPainel devolucaoId={d.id} aguardandoConferencia={!d.sem_retorno_fisico && !d.e4_conferida} />
                              </div>
                            </div>
                          )}
                          {ehAberta(d) && (
                            <div className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                              <span className="text-xs font-medium text-muted-foreground">Para encerrar</span>
                              <Badge variant="outline" className="font-normal">{rotuloStatus(d)}</Badge>
                              {(d.pendencias_encerramento ?? []).map((pz) => (
                                <Badge key={pz} variant="outline" className="bg-warning/10 text-warning border-warning/20 font-normal">{pz}</Badge>
                              ))}
                              <Button size="sm" variant="outline" className="ml-auto h-7" disabled={acaoId === d.id}
                                onClick={() => void acaoLinha(d.id, "encerrar_devolucao", { p_devolucao_id: d.id }, "Devolução encerrada.")}>
                                {acaoId === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Encerrar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <RodapePaginacao total={filtrados.length} pagina={paginaAtual} tamanhoPagina={tamanhoPagina}
          chavePreferencia={CHAVE_PAGINA_DEVOLUCAO} onPagina={setPagina} onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)} />
          </TabsContent>

          <TabsContent value="quarentena" className="mt-4">
            <QuarentenaEstoquePainel />
          </TabsContent>
          <TabsContent value="reembolso" className="mt-4">
            <CancelamentoReembolsoPainel />
          </TabsContent>
        </Tabs>
      </div>
      </TooltipProvider>

      <ConferirRetornoDialog open={!!conferir} onOpenChange={(v) => { if (!v) { setConferirId(null); void invalidar(); } }} devolucao={conferir} />
      <ReceberDialog d={receber} onFechar={() => setReceber(null)} onOk={invalidar} />
      <ReversaDialog d={reversa} onFechar={() => setReversa(null)} onOk={invalidar} />
      <EstornarDialog d={estornar} onFechar={() => setEstornar(null)} onOk={invalidar} />
      <VincularTransferenciaDialog d={vincular} onFechar={() => setVincular(null)} onOk={invalidar} />
    </PageShell>
  );
}

type DlgProps = { d: Funil | null; onFechar: () => void; onOk: () => Promise<void> };

function useAcao(onOk: () => Promise<void>, onFechar: () => void) {
  const [rodando, setRodando] = useState(false);
  const run = async (nome: string, args: Record<string, unknown>, msg: string) => {
    setRodando(true);
    try {
      await rpc(nome, args);
      toast.success(msg);
      await onOk();
      onFechar();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setRodando(false);
    }
  };
  return { rodando, run };
}

function ReceberDialog({ d, onFechar, onOk }: DlgProps) {
  const [centro, setCentro] = useState("XPM-SC");
  const [obs, setObs] = useState("");
  const { rodando, run } = useAcao(onOk, onFechar);
  useEffect(() => { if (d) { setCentro("XPM-SC"); setObs(""); } }, [d]);
  return (
    <Dialog open={!!d} onOpenChange={(o) => { if (!o && !rodando) onFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Receber devolução {d?.numero ?? ""}</DialogTitle><DialogDescription>Declara a chegada física no centro.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Centro</Label>
            <Select value={centro} onValueChange={setCentro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="XPM-SC">XPM-SC</SelectItem><SelectItem value="SITE-SP">SITE-SP</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Observação</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={rodando}>Cancelar</Button>
          <Button disabled={rodando} onClick={() => d && run("declarar_recebimento_devolucao",
            { p_devolucao_id: d.id, p_centro: centro, p_obs: obs.trim() || null, p_data: new Date().toISOString() },
            `Devolução ${d.numero ?? ""} recebida em ${centro}`)}>
            {rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReversaDialog({ d, onFechar, onOk }: DlgProps) {
  const [rastreio, setRastreio] = useState("");
  const [origem, setOrigem] = useState("correios");
  const [obs, setObs] = useState("");
  const { rodando, run } = useAcao(onOk, onFechar);
  useEffect(() => { if (d) { setRastreio(""); setOrigem("correios"); setObs(""); } }, [d]);
  return (
    <Dialog open={!!d} onOpenChange={(o) => { if (!o && !rodando) onFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Etiqueta reversa — {d?.numero ?? ""}</DialogTitle><DialogDescription>Registre o rastreio da logística reversa.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Rastreio *</Label><Input value={rastreio} onChange={(e) => setRastreio(e.target.value)} /></div>
          <div className="space-y-1"><Label>Origem</Label>
            <Select value={origem} onValueChange={setOrigem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bling">Bling</SelectItem>
                <SelectItem value="correios">Correios</SelectItem>
                <SelectItem value="cliente_postou">Cliente postou</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Observação</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={rodando}>Cancelar</Button>
          <Button disabled={rodando || !rastreio.trim()} onClick={() => d && run("registrar_reversa_devolucao",
            { p_devolucao_id: d.id, p_rastreio: rastreio.trim(), p_origem: origem, p_obs: obs.trim() || null },
            `Etiqueta reversa registrada em ${d.numero ?? ""}`)}>
            {rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EstornarDialog({ d, onFechar, onOk }: DlgProps) {
  const [motivo, setMotivo] = useState("");
  const { rodando, run } = useAcao(onOk, onFechar);
  useEffect(() => { if (d) setMotivo(""); }, [d]);
  return (
    <Dialog open={!!d} onOpenChange={(o) => { if (!o && !rodando) onFechar(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Estornar recebimento — {d?.numero ?? ""}</DialogTitle><DialogDescription>Desfaz a declaração de chegada física.</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label>Motivo *</Label><Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={rodando}>Cancelar</Button>
          <Button variant="destructive" disabled={rodando || !motivo.trim()} onClick={() => d && run("estornar_recebimento_devolucao",
            { p_devolucao_id: d.id, p_motivo: motivo.trim() }, `Recebimento de ${d.numero ?? ""} estornado`)}>
            {rodando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Estornar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Trs = { id: string; id_externo: string | null; data_pedido: string | null; qtd_total_pecas: number | null; estagio: string | null };

function VincularTransferenciaDialog({ d, onFechar, onOk }: DlgProps) {
  const { rodando, run } = useAcao(onOk, onFechar);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { setSel(null); }, [d?.id]);
  const trsQ = useQuery({
    queryKey: ["vw_devolucao_funil", "trs-candidatas", d?.destino_retorno],
    enabled: !!d?.destino_retorno,
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data, error } = await sb.from("v_transferencias_internas")
        .select("id, id_externo, data_pedido, qtd_total_pecas, estagio")
        .eq("destino_centro_id", d!.destino_retorno).is("cancelado_em", null)
        .gte("data_pedido", desde).order("data_pedido", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Trs[];
    },
  });
  const lista = trsQ.data ?? [];
  return (
    <Dialog open={!!d} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular transferência · {d?.numero}</DialogTitle>
          <DialogDescription>Transferências para o centro do recebimento, últimos 90 dias.</DialogDescription>
        </DialogHeader>
        {!d?.destino_retorno ? (
          <Alert><AlertDescription>Devolução sem centro de recebimento definido.</AlertDescription></Alert>
        ) : trsQ.isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : trsQ.error ? (
          <Alert variant="destructive"><AlertDescription>{formatError(trsQ.error)}</AlertDescription></Alert>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma transferência para este centro. Crie a TRS SC→SP no módulo de Transferências.</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Transferência</TableHead><TableHead>Data</TableHead>
                <TableHead className="text-right">Peças</TableHead><TableHead>Estágio</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lista.map((t) => (
                  <TableRow key={t.id} className={cn("cursor-pointer", sel === t.id && "bg-primary/10 hover:bg-primary/10")} onClick={() => setSel(t.id)}>
                    <TableCell className="font-mono text-xs">{t.id_externo ?? "—"}</TableCell>
                    <TableCell>{fmtDataHora(t.data_pedido)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNum(t.qtd_total_pecas)}</TableCell>
                    <TableCell>{t.estagio ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!sel || rodando}
            onClick={() => d && sel && void run("vincular_transferencia_devolucao", { p_devolucao_id: d.id, p_transferencia_pedido_id: sel }, "Transferência vinculada.")}>
            {rodando && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
