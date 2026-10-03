import { LinkCartaoDialog, rotuloFormaPagamento, useCfgParcelas } from "@/components/venda-direta/LinkCartao";
import { RemontarPagamentoDialog } from "@/components/venda-direta/RemontarPagamento";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Ban, ChevronRight, CreditCard, ExternalLink, List, PackageCheck, Plus, QrCode,
  RefreshCw, RotateCcw, Settings, ShoppingBag, Truck, Wallet, type LucideIcon,
} from "lucide-react";
import { AvisarClienteButton, ConfiguracoesVDDialog, useParametrosVD } from "@/components/venda-direta/MensagensVendaDireta";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TabelaFetely } from "@/components/ui/tabela-fetely";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import { reprocessarFilaB2c } from "@/hooks/vendas/useB2c";
import {
  ConfirmarCartaoDialog, ConfirmarPixManualDialog, RegistrarRetiradaDialog, RegistrarEntregaDialog, VerPixDialog, QK_VD_GESTAO, type LinhaVD,
} from "@/components/venda-direta/AcoesVendaDireta";
import { CancelarVendaDiretaDialog } from "@/components/venda-direta/CancelarVendaDiretaDialog";
import { GavetaPedidoVD, useProdutosPorSku } from "@/components/venda-direta/GavetaPedidoVD";

type Situacao =
  | "aguardando_pagamento" | "descendo_bling" | "aguardando_nf" | "separacao"
  | "pronto_retirada" | "em_transporte" | "travado" | "pausado" | "entregue" | "cancelado" | "outro";

interface Linha extends LinhaVD {
  recebido_em: string | null;
  cancelado_em: string | null;
  modal: "retirada" | "sedex" | "pac" | "frete_fetely" | "entrega" | null;
  frete: { servico?: string | null; custo?: number | null; cobrado?: number | null; fonte?: string | null; gratis?: boolean | null } | null;
  pagamento: "pix" | "cartao" | null;
  cliente_telefone: string | null;
  cliente_cpf_mascarado: string | null;
  endereco_entrega: Record<string, unknown> | null;
  pagamento_confirmado_em: string | null;
  link_pagamento: string | null;
  fila_id: string | null;
  fila_erro: string | null;
  bling_pedido_numero: string | number | null;
  nf_numero: string | number | null;
  entrou_na_fase_em: string | null;
  situacao: Situacao;
  horas_sem_pagamento: number | null;
  alerta_sem_pagamento: boolean | null;
  pagamento_desatualizado: boolean | null;
  faltando_site_sp: { sku: string; quantidade: number; saldo_site_sp: number }[] | null;
  codigo_rastreio: string | null;
  rastreio_servico: string | null;
}

type Filtro =
  | "pagamento" | "faturamento" | "separacao" | "retirada_envio" | "entregue"
  | "travado" | "pausado" | "sem_pagamento" | "pagamento_desatualizado" | "falta_site_sp";

const temFalta = (l: Linha) => Array.isArray(l.faltando_site_sp) && l.faltando_site_sp.length > 0;

const PROCESSO: { f: Filtro; label: string; s: Situacao[]; detalhe?: Partial<Record<Situacao, string>> }[] = [
  { f: "pagamento", label: "Pagamento", s: ["aguardando_pagamento"] },
  { f: "faturamento", label: "Faturamento", s: ["descendo_bling", "aguardando_nf"], detalhe: { descendo_bling: "descendo ao Bling", aguardando_nf: "aguardando NF" } },
  { f: "separacao", label: "Separação", s: ["separacao"] },
  { f: "retirada_envio", label: "Retirada / Envio", s: ["pronto_retirada", "em_transporte"], detalhe: { pronto_retirada: "prontos p/ retirada", em_transporte: "em transporte" } },
  { f: "entregue", label: "Entregue (30 dias)", s: ["entregue"] },
];

const LABEL: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento", descendo_bling: "Descendo ao Bling", aguardando_nf: "Aguardando NF",
  separacao: "Separação", pronto_retirada: "Pronto p/ retirada", em_transporte: "Em transporte", travado: "Travado",
  pausado: "Pausado", entregue: "Entregue", cancelado: "Cancelado", outro: "Outro",
};

const MODAL_LABEL: Record<string, string> = {
  retirada: "Retirada", sedex: "SEDEX", pac: "PAC", entrega: "PAC", frete_fetely: "Frete Fetely",
};
const modalLabel = (m: string | null) => (m ? (MODAL_LABEL[m] ?? m) : "—");
const FONTE_LABEL: Record<string, string> = { api: "cotação Correios", plano_b: "tabela (plano B)", tabela: "tabela Fetely" };

const soDigitos = (s: string) => s.replace(/\D/g, "");
const TRINTA_DIAS = 30 * 24 * 3600 * 1000;

function tempoDesde(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

interface Acao { k: string; label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; destrutiva?: boolean }

function BotaoIcone({ a }: { a: Acao }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={a.disabled ? 0 : -1}>
          <Button size="icon" variant="ghost" className={cn("h-8 w-8", a.destrutiva && "text-destructive hover:text-destructive")} aria-label={a.label} disabled={a.disabled} onClick={a.onClick}>
            <a.icon className="h-4 w-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{a.label}</TooltipContent>
    </Tooltip>
  );
}

function CardEtapa({ label, n, ativo, onClick, tooltip, tom, pequeno }: {
  label: string; n: number; ativo: boolean; onClick: () => void; tooltip?: ReactNode; tom?: "warning" | "destructive"; pequeno?: boolean;
}) {
  const destaque = n > 0 ? tom : undefined;
  const card = (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "flex-1 cursor-pointer bg-card transition-colors hover:bg-muted/50",
        ativo && "ring-2 ring-primary",
        destaque === "destructive" && "border-destructive bg-destructive/10",
        destaque === "warning" && "border-warning bg-warning/10",
      )}
    >
      <CardContent className={pequeno ? "p-2" : "p-3"}>
        <div className={cn("text-xs text-muted-foreground", destaque === "destructive" && "text-destructive", destaque === "warning" && "text-warning")}>{label}</div>
        <div className={cn("font-medium tabular-nums", pequeno ? "text-lg" : "text-2xl", destaque === "destructive" && "text-destructive", destaque === "warning" && "text-warning")}>{n}</div>
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export default function VendaDiretaGestao() {
  const qc = useQueryClient();
  const { podeEditar } = usePermissoesTela("tela.venda_direta_gestao");
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [config, setConfig] = useState(false);
  const qp = useParametrosVD();
  const cfgPixNoLink = useCfgParcelas().data?.pix_no_link === true;
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [cartao, setCartao] = useState<Linha | null>(null);
  const [retirada, setRetirada] = useState<Linha | null>(null);
  const [entrega, setEntrega] = useState<Linha | null>(null);
  const [pix, setPix] = useState<Linha | null>(null);
  const [pixManual, setPixManual] = useState<Linha | null>(null);
  const [linkCartao, setLinkCartao] = useState<Linha | null>(null);
  const [remontar, setRemontar] = useState<Linha | null>(null);
  const [pixNovo, setPixNovo] = useState<string | null>(null);
  const [cancelar, setCancelar] = useState<Linha | null>(null);
  const [gavetaId, setGavetaId] = useState<string | null>(null);
  const [confirmaPausado, setConfirmaPausado] = useState<Linha | null>(null);

  const q = useQuery({
    queryKey: QK_VD_GESTAO,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await supabase
        .from("vw_venda_direta_gestao" as never)
        .select("*")
        .order("recebido_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const reprocessar = useMutation({
    mutationFn: (l: Linha) => reprocessarFilaB2c([l.fila_id!], "bling", "Reprocessado na gestão VD"),
    onSuccess: (_r, l) => {
      toast.success(`Descida de ${l.id_externo} reenviada para a fila`);
      qc.invalidateQueries({ queryKey: QK_VD_GESTAO });
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  // Entregue conta só os últimos 30 dias — cartão e filtro seguem a mesma régua.
  const visiveis = useMemo(
    () => (q.data ?? []).filter((l) =>
      l.situacao !== "entregue" ||
      (l.entrou_na_fase_em && Date.now() - new Date(l.entrou_na_fase_em).getTime() <= TRINTA_DIAS)),
    [q.data],
  );
  const ativos = useMemo(() => visiveis.filter((l) => l.situacao !== "cancelado"), [visiveis]);

  const porSituacao = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of ativos) c[l.situacao] = (c[l.situacao] ?? 0) + 1;
    return c;
  }, [ativos]);
  const nCancelados = visiveis.length - ativos.length;

  const bate = (l: Linha, f: Filtro) => {
    const p = PROCESSO.find((x) => x.f === f);
    if (p) return p.s.includes(l.situacao);
    if (f === "travado" || f === "pausado") return l.situacao === f;
    if (f === "sem_pagamento") return !!l.alerta_sem_pagamento;
    if (f === "pagamento_desatualizado") return !!l.pagamento_desatualizado;
    return temFalta(l);
  };
  const contar = (f: Filtro) => ativos.filter((l) => bate(l, f)).length;

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const td = soDigitos(t);
    const base = mostrarCancelados ? visiveis : ativos;
    return base.filter((l) => {
      if (filtro && !bate(l, filtro)) return false;
      if (!t) return true;
      return (l.id_externo ?? "").toLowerCase().includes(t) ||
        (l.cliente_nome ?? "").toLowerCase().includes(t) ||
        (td.length >= 3 && soDigitos(l.cliente_telefone ?? "").includes(td));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, ativos, filtro, busca, mostrarCancelados]);

  useEffect(() => { setPagina(1); }, [filtro, busca, mostrarCancelados]);
  const pag = linhas.slice((pagina - 1) * tamanho, pagina * tamanho);

  const skusFalta = useMemo(
    () => Array.from(new Set(pag.flatMap((l) => (l.faltando_site_sp ?? []).map((f) => f.sku)))),
    [pag],
  );
  const prodFalta = useProdutosPorSku(skusFalta);

  const gaveta = gavetaId ? (q.data ?? []).find((l) => l.id === gavetaId) ?? null : null;

  const tentarCancelar = (l: Linha) => {
    if (l.pagamento_confirmado_em) {
      toast.error("Este pedido tem pagamento confirmado — precisa de estorno antes de cancelar.");
      return;
    }
    setCancelar(l);
  };

  /** Ações de etapa (sem Avisar — ele é um componente próprio). */
  const acoesEtapa = (l: Linha, naGaveta: boolean): Acao[] => {
    if (!podeEditar) return [];
    const a: Acao[] = [];
    if (l.situacao === "aguardando_pagamento") {
      if (l.pagamento === "cartao") a.push({ k: "link", label: "Link do cartão", icon: CreditCard, onClick: () => setLinkCartao(l) });
      if (l.pagamento === "pix" && !l.pagamento_desatualizado) a.push({ k: "pix", label: "Ver PIX", icon: QrCode, onClick: () => setPix(l), disabled: !l.provisao_id });
      if (l.pagamento === "cartao") a.push({ k: "conf", label: "Confirmar pagamento manual", icon: Wallet, onClick: () => setCartao(l) });
      if (l.pagamento === "pix" && !l.pagamento_desatualizado) a.push({ k: "conf", label: "Confirmar pagamento manual", icon: Wallet, onClick: () => setPixManual(l), disabled: !l.provisao_id });
    }
    if (l.pagamento_desatualizado) a.push({ k: "remontar", label: "Remontar pagamento", icon: RefreshCw, onClick: () => setRemontar(l) });
    if (l.situacao === "travado" && l.fila_id) {
      a.push({ k: "repro", label: "Reprocessar descida", icon: RotateCcw, onClick: () => reprocessar.mutate(l), disabled: reprocessar.isPending });
    }
    if (naGaveta && l.situacao === "pausado" && l.fila_id) {
      a.push({ k: "repro", label: "Reprocessar descida", icon: RotateCcw, onClick: () => setConfirmaPausado(l), disabled: reprocessar.isPending });
    }
    if (l.situacao === "pronto_retirada") a.push({ k: "ret", label: "Registrar retirada", icon: PackageCheck, onClick: () => setRetirada(l) });
    if (l.situacao === "em_transporte" && l.modal === "frete_fetely") a.push({ k: "ent", label: "Registrar entrega", icon: Truck, onClick: () => setEntrega(l) });
    return a;
  };
  const podeCancelar = (l: Linha) => podeEditar && l.situacao !== "entregue" && l.situacao !== "cancelado";
  const avisoDe = (l: Linha, icone: boolean) =>
    podeEditar && (l.alerta_sem_pagamento || l.situacao === "aguardando_pagamento"
      ? <AvisarClienteButton linha={l} chave="cobrar_pagamento" label="Cobrar no WhatsApp" icone={icone} />
      : <AvisarClienteButton linha={l} icone={icone} />);

  const fechar = (fn: (v: null) => void) => () => { fn(null); qc.invalidateQueries({ queryKey: QK_VD_GESTAO }); };

  return (
    <PageShell>
      <PageHeader
        titulo="Pedidos Site SP"
        breadcrumb={[{ label: "Operação" }, { label: "Pedidos Site SP" }]}
        icone={ShoppingBag}
        estado={`Venda direta do Site SP, do pagamento à entrega${q.dataUpdatedAt ? ` · atualizada às ${new Date(q.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        acoes={
          podeEditar && (
            <div className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Configurações dos Pedidos Site SP" onClick={() => setConfig(true)}><Settings className="h-4 w-4" /></Button>
              <Button asChild><Link to="/pedidos/venda-direta/novo"><Plus className="mr-1 h-4 w-4" />Novo pedido</Link></Button>
            </div>
          )
        }
      />

      <TooltipProvider>
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Processo</div>
          <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
            {PROCESSO.map((p, i) => {
              const n = p.s.reduce((acc, s) => acc + (porSituacao[s] ?? 0), 0);
              const tip = p.detalhe ? Object.entries(p.detalhe).map(([s, t]) => `${porSituacao[s] ?? 0} ${t}`).join(" · ") : undefined;
              return (
                <Fragment key={p.f}>
                  {i > 0 && <ChevronRight className="hidden h-4 w-4 shrink-0 self-center text-muted-foreground md:block" aria-hidden="true" />}
                  <CardEtapa label={p.label} n={n} ativo={filtro === p.f} tooltip={tip} onClick={() => setFiltro(filtro === p.f ? null : p.f)} />
                </Fragment>
              );
            })}
          </div>
          <div className="pt-2 text-xs text-muted-foreground">Atenção</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {([
              { f: "travado", label: "Travado", tom: "destructive" },
              { f: "pausado", label: "Pausado", tom: "warning" },
              { f: "sem_pagamento", label: `Sem pagamento +${qp.data?.alerta_sem_pagamento_horas ?? "?"}h`, tom: "warning" },
              { f: "pagamento_desatualizado", label: "Pagamento desatualizado", tom: "warning" },
              { f: "falta_site_sp", label: "Falta no Site SP", tom: "destructive" },
            ] as { f: Filtro; label: string; tom: "warning" | "destructive" }[]).map((c) => (
              <CardEtapa key={c.f} pequeno label={c.label} n={contar(c.f)} tom={c.tom} ativo={filtro === c.f} onClick={() => setFiltro(filtro === c.f ? null : c.f)} />
            ))}
          </div>
        </div>

        <TabelaFetely
          busca={{ valor: busca, aoMudar: setBusca, placeholder: "Nº VD, nome ou telefone" }}
          filtros={
            <div className="flex items-center gap-2">
              <Switch id="vd-cancelados" checked={mostrarCancelados} onCheckedChange={setMostrarCancelados} />
              <Label htmlFor="vd-cancelados" className="text-sm font-normal">Mostrar cancelados <span className="tabular-nums text-muted-foreground">({nCancelados})</span></Label>
            </div>
          }
          carregando={q.isLoading}
          erro={q.isError ? `Erro ao carregar: ${rawMessage(q.error)}` : null}
          aoTentarNovamente={() => q.refetch()}
          vazio={{ mensagem: "Nenhum pedido do Site SP ainda.", acao: podeEditar ? <Button asChild><Link to="/pedidos/venda-direta/novo">Criar o primeiro pedido</Link></Button> : undefined }}
          semResultado="Nenhum pedido para esse filtro."
          total={mostrarCancelados ? visiveis.length : ativos.length}
          exibidos={linhas.length}
          rotulo="pedidos"
        >
          <div className="overflow-hidden rounded-md border bg-card">
            <div className="max-h-[calc(100vh-18rem)] overflow-auto">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Entrega · Pagto</TableHead>
                    <TableHead className="text-right">Frete</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="whitespace-nowrap">Na fase há</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pag.map((l) => {
                    const etapa = acoesEtapa(l, false);
                    const aviso = avisoDe(l, true);
                    return (
                      <TableRow
                        key={l.id}
                        className="cursor-pointer"
                        onClick={(e) => {
                          const el = e.target as HTMLElement;
                          if (el.closest("button, a, input, label")) return;
                          setGavetaId(l.id);
                        }}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="cursor-pointer text-primary underline-offset-2 hover:underline" onClick={() => setGavetaId(l.id)}>{l.id_externo}</button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes</TooltipContent>
                            </Tooltip>

                            {l.fila_erro && (
                              <Tooltip>
                                <TooltipTrigger asChild><AlertTriangle className="h-4 w-4 text-destructive" aria-label="Erro na fila" /></TooltipTrigger>
                                <TooltipContent className="max-w-sm whitespace-pre-wrap">{l.fila_erro}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{l.cliente_nome ?? "—"}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">{l.cliente_telefone ?? ""}</div>
                        </TableCell>
                        <TableCell>
                          <div className="whitespace-nowrap text-xs text-muted-foreground">{modalLabel(l.modal)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{rotuloFormaPagamento(l.pagamento, cfgPixNoLink)}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.frete ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{l.frete.gratis || Number(l.frete.cobrado ?? 0) === 0 ? "Grátis" : formatBRL(l.frete.cobrado)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Custo {l.frete.custo != null ? formatBRL(l.frete.custo) : "—"} · fonte {l.frete.fonte ? (FONTE_LABEL[l.frete.fonte] ?? l.frete.fonte) : "—"}
                              </TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(l.valor_liquido)}</TableCell>
                        <TableCell>
                          <Badge variant={l.situacao === "travado" ? "destructive" : l.situacao === "cancelado" || l.situacao === "pausado" ? "outline" : "secondary"}
                            className={cn(l.situacao === "pausado" && "text-muted-foreground")}>
                            {LABEL[l.situacao] ?? l.situacao}
                          </Badge>
                          <div className="mt-1 space-y-0.5 text-xs">
                            {l.alerta_sem_pagamento && (
                              <div className="text-warning-strong">
                                Sem pagamento há {Math.floor(Number(l.horas_sem_pagamento ?? 0))}h
                              </div>
                            )}
                            {l.pagamento_desatualizado && (
                              <Tooltip>
                                <TooltipTrigger asChild><span className="block cursor-help text-warning-strong">Pagamento desatualizado</span></TooltipTrigger>
                                <TooltipContent className="max-w-sm">Os itens mudaram depois do pedido. O PIX/link antigo não vale mais — remonte e reenvie ao cliente.</TooltipContent>
                              </Tooltip>
                            )}
                            {temFalta(l) && (
                              <Tooltip>
                                <TooltipTrigger asChild><span className="block cursor-help text-destructive-strong">Falta no Site SP</span></TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  {prodFalta.isError && <div>{rawMessage(prodFalta.error)}</div>}
                                  {l.faltando_site_sp!.map((f) => {
                                    const p = prodFalta.data?.get(f.sku);
                                    return <div key={f.sku} className="tabular-nums">{p?.cod_cadastro ?? f.sku}{p?.nome_comercial ? ` ${p.nome_comercial}` : ""} · pedido {f.quantidade} · saldo {f.saldo_site_sp}</div>;
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{tempoDesde(l.entrou_na_fase_em)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {aviso}
                            {etapa.map((a) => <BotaoIcone key={a.k} a={a} />)}
                            {(aviso || etapa.length > 0) && <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />}
                            <BotaoIcone a={{ k: "itens", label: "Ver itens", icon: List, onClick: () => setGavetaId(l.id) }} />
                            {podeCancelar(l) && <BotaoIcone a={{ k: "cancel", label: "Cancelar", icon: Ban, onClick: () => tentarCancelar(l), destrutiva: true }} />}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                                  <Link to={`/pedidos/${l.id}`} aria-label="Abrir pedido"><ExternalLink className="h-4 w-4" /></Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir pedido</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <RodapePaginacao
              total={linhas.length}
              pagina={pagina}
              tamanhoPagina={tamanho}
              tela="venda_direta_gestao"
              onPagina={setPagina}
              onTamanhoPagina={setTamanho}
            />
          </div>
        </TabelaFetely>

        <GavetaPedidoVD
          linha={gaveta}
          modalLabel={modalLabel}
          onClose={() => setGavetaId(null)}
          acoes={gaveta && (
            <>
              {avisoDe(gaveta, false)}
              {acoesEtapa(gaveta, true).map((a) => (
                <Button key={a.k} size="sm" variant="outline" disabled={a.disabled} onClick={a.onClick}>
                  <a.icon className="mr-1 h-3.5 w-3.5" />{a.label}
                </Button>
              ))}
              {podeCancelar(gaveta) && (
                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => tentarCancelar(gaveta)}>
                  <Ban className="mr-1 h-3.5 w-3.5" />Cancelar
                </Button>
              )}
              <Button size="sm" asChild><Link to={`/pedidos/${gaveta.id}`}><ExternalLink className="mr-1 h-3.5 w-3.5" />Abrir pedido</Link></Button>
            </>
          )}
        />
      </TooltipProvider>

      <AlertDialog open={!!confirmaPausado} onOpenChange={(v) => !v && setConfirmaPausado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocessar {confirmaPausado?.id_externo}?</AlertDialogTitle>
            <AlertDialogDescription>Este pedido foi pausado de propósito. Reprocessar mesmo assim?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmaPausado) reprocessar.mutate(confirmaPausado); setConfirmaPausado(null); }}>Reprocessar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmarCartaoDialog linha={cartao} onClose={fechar(setCartao)} />
      <RegistrarRetiradaDialog linha={retirada} onClose={fechar(setRetirada)} />
      <RegistrarEntregaDialog linha={entrega} onClose={fechar(setEntrega)} />
      <VerPixDialog linha={pix} payloadNovo={pixNovo} onClose={() => { setPix(null); setPixNovo(null); qc.invalidateQueries({ queryKey: QK_VD_GESTAO }); }} />
      <RemontarPagamentoDialog
        linha={remontar}
        onClose={fechar(setRemontar)}
        onPix={(l, payload) => { setPixNovo(payload); setPix(l); }}
        onCartao={(l) => setLinkCartao(l)}
      />
      <ConfirmarPixManualDialog linha={pixManual} onClose={fechar(setPixManual)} />
      <ConfiguracoesVDDialog aberto={config} onClose={() => setConfig(false)} />
      <LinkCartaoDialog linha={linkCartao} onClose={fechar(setLinkCartao)} />
      <CancelarVendaDiretaDialog linha={cancelar} onClose={fechar(setCancelar)} />
    </PageShell>
  );
}
