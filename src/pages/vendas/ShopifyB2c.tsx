import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PipelineB2c, type ContagemEstagio } from "@/components/vendas/PipelineB2c";
import {
  BarraLoteCd, CelulaCdEfetivo, ConfirmaCdDivergente, EscolhaCdCelula, ToggleCdB2c, nomeCurtoCd,
} from "@/components/vendas/EscolhaCdB2c";
import { PedidoB2cDrawer } from "@/components/vendas/PedidoB2cDrawer";
import { ExportarB2cButton } from "@/components/vendas/ExportarB2cButton";
import { DashB2c } from "@/components/vendas/DashB2c";
import { CabecalhoOrdenavel, LINHA_CABECALHO_COLADO, type DirecaoOrdenacao } from "@/components/tabela/CabecalhoOrdenavel";
import { RodapePaginacao, lerTamanhoPaginaSalvo, type PageSizeOption } from "@/components/tabela/RodapePaginacao";
import {
  usePedidosB2c, usePedidoAlertaDim, useCentrosB2c,
  type PedidoB2cRow, type AlertaDim, type CentroB2c,
} from "@/hooks/vendas/useB2c";
import { fmtDataHora } from "@/lib/data";
import { formatBRL } from "@/lib/format-currency";
import { AbaPermitida, ConteudoAba, usePodeVerAba } from "@/components/AbaGate";

/**
 * Casa do B2C — mesma linguagem da Casa dos Pedidos, regras do canal loja.
 * FONTE-UNICA: contador de aba e card de pipeline leem a MESMA view que a
 * tabela daquela aba mostra. Pagamento já vem resolvido na porta: o funil aqui
 * é faturar, expedir, rastrear e entregar.
 */

// DESMONTE-ABAS-B2C (17/09/2026): Carrinhos e Pós-venda saíram — não davam
// retorno à operação. O dado continua: shopify_checkouts alimenta
// /vendas/shopify/checkouts e devolucao vive em Devoluções Fiscais.
// Link salvo com ?aba=carrinhos cai em fila pela guarda abaixo.
const ABAS = ["fila", "dash"] as const;
type Aba = (typeof ABAS)[number];

type ColunaB2c =
  | "pedido" | "bling" | "data" | "cliente" | "valor"
  | "estagio" | "dono" | "proxima_acao" | "financeiro" | "rastreio";

type OrdenacaoB2c = { coluna: ColunaB2c; dir: DirecaoOrdenacao } | null;

/** Primeiro clique: data e dinheiro descem (recente/maior primeiro), texto sobe. */
const DIR_INICIAL_B2C: Record<ColunaB2c, DirecaoOrdenacao> = {
  pedido: "desc", bling: "desc", data: "desc", cliente: "asc", valor: "desc",
  estagio: "asc", dono: "asc", proxima_acao: "asc", financeiro: "desc", rastreio: "asc",
};

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` do bloco do funil. */
const ALTURA_CASA_HEADER = 64;

/** Preferencia de tamanho de pagina desta fila (a Casa dos Pedidos tem a sua). */
const CHAVE_PAGINA_B2C = "fetely:vendas:shopify:fila:page-size";

function txt(v: string | null | undefined): string {
  return v && String(v).trim() !== "" ? String(v) : "—";
}

function diasTexto(d: number | null): string {
  if (d == null) return "—";
  return `há ${d} d`;
}

// BADGE-LÊ-A-MESMA-FONTE-DA-TELA: o estado da descida ao Bling vem da PRÓPRIA
// view da tela (colunas fila_*). Sem query paralela à tabela da fila.
const STATUS_FILA_SEM_ALERTA = new Set([
  "aguardando_destino", "enviado", "pendente", "processando", "pausado",
]);

/** Fila em dia não é problema: alerta só com erro na descida ou sem linha na fila. */
function alertaSuprimidoPorFila(p: PedidoB2cRow): boolean {
  if (!p.fila_status) return false;
  return STATUS_FILA_SEM_ALERTA.has(p.fila_status);
}

/** Próxima ação exibida — reflete o estado real da descida ao Bling. */
function proximaAcaoExibida(p: PedidoB2cRow): string | null {
  switch (p.fila_status) {
    case "aguardando_destino":
      return "Escolha o CD para liberar a descida";
    case "enviado":
      return "No Bling — aguardando faturamento";
    case "pendente":
    case "processando":
      return "Desce automático em até 10 min";
    case "erro":
      return p.fila_ultimo_erro?.trim() || "Erro na descida ao Bling";
    case "pausado":
      return "Pausado (ver fila)";
    default:
      return p.proxima_acao;
  }
}

function truncarErro(texto: string, max = 80): string {
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export default function ShopifyB2c() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get("aba");
  const estagioParam = searchParams.get("estagio");

  // Guarda nominal por aba.
  const permFila = usePodeVerAba("tela.b2c");
  const permDash = usePodeVerAba("tela.dash_b2c");

  const permissoes: Record<Aba, { podeVer: boolean; carregando: boolean }> = {
    fila: permFila,
    dash: permDash,
  };

  const carregandoPermissoes = ABAS.some((a) => permissoes[a].carregando);
  const primeiraPermitida = ABAS.find((a) => permissoes[a].podeVer);
  const abaSolicitada: Aba = ABAS.includes(abaParam as Aba)
    ? (abaParam as Aba)
    : "fila";
  const abaEfetiva: Aba | undefined = carregandoPermissoes
    ? abaSolicitada
    : permissoes[abaSolicitada].podeVer
      ? abaSolicitada
      : primeiraPermitida;

  // Redireciona para a primeira aba permitida quando a URL aponta para uma proibida.
  useEffect(() => {
    if (carregandoPermissoes) return;
    if (abaEfetiva && abaEfetiva !== abaSolicitada) {
      const next = new URLSearchParams(searchParams);
      if (abaEfetiva === "fila") next.delete("aba");
      else next.set("aba", abaEfetiva);
      setSearchParams(next);
    }
  }, [carregandoPermissoes, abaEfetiva, abaSolicitada, searchParams, setSearchParams]);


  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("todas");
  const [alerta, setAlerta] = useState("todos");
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [selecionado, setSelecionado] = useState<PedidoB2cRow | null>(null);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoB2c>(null);
  const [cdFiltro, setCdFiltro] = useState("todos");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [gravandoCd, setGravandoCd] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{
    pedidos: PedidoB2cRow[];
    centro: CentroB2c;
    sugeridoNome: string | null;
  } | null>(null);

  const ordenarPor = (coluna: ColunaB2c) => {
    setOrdenacao((atual) => {
      if (!atual || atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_B2C[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta a ordem padrao da view (data do pedido, mais recente primeiro).
      return invertida === DIR_INICIAL_B2C[coluna] ? null : { coluna, dir: invertida };
    });
  };

  // TOPO-COLADO-SE-MEDE: o cabecalho cola logo abaixo do funil, e a altura do
  // funil muda (quebra de linha, card a mais). Mede em runtime, nao chuta.
  const pipelineRef = useRef<HTMLDivElement>(null);
  const [alturaPipeline, setAlturaPipeline] = useState(0);

  useEffect(() => {
    const el = pipelineRef.current;
    if (!el) return;
    const medir = () => setAlturaPipeline(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [abaEfetiva]);

  const { data: pedidos, isLoading, isError, error } = usePedidosB2c();
  const {
    data: alertasDim,
    isError: alertasDimErro,
    error: alertasDimErroObj,
  } = usePedidoAlertaDim();

  const setAba = (valor: string) => {
    const next = new URLSearchParams(searchParams);
    if (valor === "fila") next.delete("aba");
    else next.set("aba", valor);
    setSearchParams(next);
  };

  const setEstagio = (estagio: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (estagio) next.set("estagio", estagio);
    else next.delete("estagio");
    setSearchParams(next);
  };

  const lista = useMemo(() => pedidos ?? [], [pedidos]);

  // Alertas do card do funil que deixam de contar: pedido com a descida em dia
  // (aguardando destino, na fila ou já no Bling) não é problema — só erro.
  const reducaoAlerta = useMemo(() => {
    const m: Record<string, number> = {};
    let qualquer = false;
    lista.forEach((p) => {
      if (p.alerta && alertaSuprimidoPorFila(p)) {
        const estagio = p.estagio ?? "";
        m[estagio] = (m[estagio] ?? 0) + 1;
        qualquer = true;
      }
    });
    return qualquer ? m : undefined;
  }, [lista]);

  const ufs = useMemo(() => {
    const set = new Set<string>();
    lista.forEach((p) => p.shipping_province && set.add(p.shipping_province));
    return Array.from(set).sort();
  }, [lista]);

  const alertas = useMemo(() => {
    const set = new Set<string>();
    lista.forEach((p) => p.alerta && set.add(p.alerta));
    return Array.from(set).sort();
  }, [lista]);

  const filaAtiva = useMemo(() => {
    const ativos = lista.filter((p) => p.na_carteira_ativa);
    return {
      qtd: ativos.length,
      valor: ativos.reduce((s, p) => s + Number(p.total ?? 0), 0),
    };
  }, [lista]);

  const mapaAlerta = useMemo(() => {
    const m = new Map<string, AlertaDim>();
    (alertasDim ?? []).forEach((a) => m.set(a.codigo, a));
    return m;
  }, [alertasDim]);

  function severidadeDoAlerta(codigo: string | null): EstadoSelo {
    if (!codigo) return "muted";
    const a = mapaAlerta.get(codigo);
    const s = a?.severidade;
    if (s === "success" || s === "warning" || s === "destructive" || s === "info" || s === "muted") {
      return s;
    }
    return "muted";
  }

  function rotuloDoAlerta(codigo: string | null): string {
    if (!codigo) return "";
    const a = mapaAlerta.get(codigo);
    if (a?.rotulo) return a.rotulo;
    return codigo.replace(/_/g, " ");
  }


  const filtrados = useMemo(() => {
    let r = lista;
    if (!incluirCancelados) r = r.filter((p) => p.estagio !== "cancelado");
    if (estagioParam) r = r.filter((p) => p.estagio === estagioParam);
    if (uf !== "todas") r = r.filter((p) => p.shipping_province === uf);
    if (alerta !== "todos") r = r.filter((p) => p.alerta === alerta);
    const q = busca.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (p) =>
          (p.order_name ?? "").toLowerCase().includes(q) ||
          (p.id_externo ?? "").toLowerCase().includes(q) ||
          (p.cliente ?? "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [lista, incluirCancelados, estagioParam, uf, alerta, busca]);

  // VAZIO-VAI-PRO-FIM: celula sem dado nunca ganha primeiro lugar, nos dois sentidos.
  const ordenados = useMemo(() => {
    if (!ordenacao) return filtrados;
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (p: PedidoB2cRow): string | number | null => {
      switch (ordenacao.coluna) {
        case "pedido": return p.order_name ?? null;
        case "bling": return p.bling_pedido_numero ?? null;
        case "data": {
          const t = p.created_at_shopify ? Date.parse(p.created_at_shopify) : NaN;
          return Number.isNaN(t) ? null : t;
        }
        case "cliente": return p.cliente ?? null;
        case "valor": return Number(p.total ?? 0);
        case "estagio": return p.estagio_ordem ?? null;
        case "dono": return p.area_responsavel ?? null;
        case "proxima_acao": return p.proxima_acao ?? null;
        // Quanto mais pendencia, maior o numero — decrescente traz o buraco pra cima.
        case "financeiro": return (p.tem_nf ? 0 : 2) + (p.tem_recebimento ? 0 : 1);
        case "rastreio": return p.tracking_number ?? null;
        default: return null;
      }
    };
    return [...filtrados].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [filtrados, ordenacao]);

  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_B2C),
  );

  // Trocar a seleção joga o operador de volta pra primeira página — senão ele
  // fica olhando uma página 7 que já não existe.
  useEffect(() => {
    setPagina(1);
  }, [busca, uf, alerta, estagioParam, incluirCancelados, ordenacao]);

  const totalPaginasB2c = Math.max(1, Math.ceil(ordenados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginasB2c);
  const paginaItens = ordenados.slice(
    (paginaAtual - 1) * tamanhoPagina,
    paginaAtual * tamanhoPagina,
  );


  const copiar = (v: string, label: string) => {
    void navigator.clipboard.writeText(v);
    toast.success(`${label} copiado.`);
  };

  return (
    <PageShell>
      <CasaPageHeader
        breadcrumb={[{ label: "Vendas" }, { label: "Loja B2C" }]}
        title="Loja · B2C"
        subtitle="Pedidos da loja Shopify. Pagamento vem resolvido na porta — o funil aqui é faturar, expedir, rastrear e entregar."
        // Exportação leva a base para fora: nível 3 (Coordenador) para cima — o componente se autoprotege.
        actions={<ExportarB2cButton linhas={ordenados} />}
      />

      {carregandoPermissoes ? (
        <CarregandoAba />
      ) : !primeiraPermitida ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-6 text-sm text-muted-foreground text-center">
          Você não tem acesso a nenhuma aba desta tela.
        </div>
      ) : (
        <Tabs value={abaEfetiva ?? abaSolicitada} onValueChange={setAba} className="space-y-4">
          <TabsList>
            <AbaPermitida slug="tela.b2c">
              <TabsTrigger value="fila">Fila</TabsTrigger>
            </AbaPermitida>
            <AbaPermitida slug="tela.dash_b2c">
              <TabsTrigger value="dash">Dash</TabsTrigger>
            </AbaPermitida>
          </TabsList>

        <TabsContent
          value="fila"
          className="space-y-4"
          style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaPipeline}px` } as CSSProperties}
        >
          <ConteudoAba slug="tela.b2c">
          <div
            ref={pipelineRef}
            className="sticky top-16 z-20 -mx-6 border-b border-border bg-background px-6 py-2"
          >
            <PipelineB2c
              estagioAtivo={estagioParam}
              onClickEstagio={(e) => setEstagio(e)}
              onLimparFiltro={() => setEstagio(null)}
              incluirCancelados={incluirCancelados}
              onToggleCancelados={setIncluirCancelados}
              filaAtiva={filaAtiva}
              reducaoAlerta={reducaoAlerta}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por pedido ou cliente…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-[240px]"
            />
            <Select value={estagioParam ?? "todos"} onValueChange={(v) => setEstagio(v === "todos" ? null : v)}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Estágio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Estágio: todos</SelectItem>
                {Array.from(
                  new Map(lista.filter((p) => p.estagio).map((p) => [p.estagio!, p.estagio_rotulo ?? p.estagio!])),
                ).map(([codigo, rotulo]) => (
                  <SelectItem key={codigo} value={codigo}>
                    {rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as UFs</SelectItem>
                {ufs.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={alerta} onValueChange={setAlerta}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Alerta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Alerta: todos</SelectItem>
                {alertas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {rotuloDoAlerta(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filtrados.length} pedido{filtrados.length !== 1 ? "s" : ""}
            </span>
            {ordenacao && (
              <span className="text-xs text-muted-foreground">
                · ordenado por {ordenacao.coluna === "proxima_acao" ? "próxima ação" : ordenacao.coluna}{" "}
                ({ordenacao.dir === "asc" ? "crescente" : "decrescente"})
              </span>
            )}
          </div>

          {isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Erro ao carregar os pedidos da loja: {(error as Error)?.message ?? "erro desconhecido"}
            </div>
          )}

          {alertasDimErro && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Dimensão de alertas não carregou. Os selos abaixo estão sem cor e sem rótulo oficial, então um alerta grave pode estar aparecendo em cinza.{" "}
              {(alertasDimErroObj as Error)?.message ?? "erro desconhecido"}
            </div>
          )}

          {filaBlingErro && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Fila de descida ao Bling não carregou. A coluna Bling e a próxima ação podem estar desatualizadas.{" "}
              {(filaBlingErroObj as Error)?.message ?? "erro desconhecido"}
            </div>
          )}

          {!isError && (
            <Card>
              <CardContent className="p-0">
                <TooltipProvider>
                    <Table containerClassName="overflow-visible">
                      <TableHeader>
                        <TableRow className={LINHA_CABECALHO_COLADO}>
                          <CabecalhoOrdenavel rotulo="Pedido" dir={ordenacao?.coluna === "pedido" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("pedido")} />
                          <CabecalhoOrdenavel rotulo="Bling" dir={ordenacao?.coluna === "bling" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("bling")} />
                          <CabecalhoOrdenavel rotulo="Data / Idade" dir={ordenacao?.coluna === "data" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("data")} />
                          <CabecalhoOrdenavel rotulo="Cliente" dir={ordenacao?.coluna === "cliente" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("cliente")} />
                          <CabecalhoOrdenavel rotulo="Valor" className="text-right" alinharDireita dir={ordenacao?.coluna === "valor" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("valor")} />
                          <CabecalhoOrdenavel rotulo="Estágio" dir={ordenacao?.coluna === "estagio" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("estagio")} />
                          <CabecalhoOrdenavel rotulo="Dono" dir={ordenacao?.coluna === "dono" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("dono")} />
                          <CabecalhoOrdenavel rotulo="Próxima ação" dir={ordenacao?.coluna === "proxima_acao" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("proxima_acao")} />
                          <CabecalhoOrdenavel rotulo="Financeiro" dir={ordenacao?.coluna === "financeiro" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("financeiro")} />
                          <CabecalhoOrdenavel rotulo="Rastreio" dir={ordenacao?.coluna === "rastreio" ? ordenacao.dir : null} onOrdenar={() => ordenarPor("rastreio")} />
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow>
                            <TableCell colSpan={11} className="py-8 text-center">
                              <Skeleton className="mx-auto h-4 w-32" />
                            </TableCell>
                          </TableRow>
                        ) : filtrados.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                              Nenhum pedido nesta seleção.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginaItens.map((p, idx) => (
                            <TableRow
                              key={`${p.shopify_id ?? p.order_name ?? "sem-id"}-${idx}`}
                              onClick={() => setSelecionado(p)}
                              className="cursor-pointer"
                            >
                              <TableCell className="whitespace-nowrap">
                                <span className="font-mono text-xs">{txt(p.order_name)}</span>
                                {p.alerta && !alertaSuprimidoPorFila(p, mapaFilaBling) && (
                                  <div className="mt-1">
                                    {p.bloqueio_motivo ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>
                                            <Selo estado={severidadeDoAlerta(p.alerta)}>
                                              {rotuloDoAlerta(p.alerta)}
                                            </Selo>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="max-w-xs space-y-1">
                                            <p className="text-sm">{p.bloqueio_motivo}</p>
                                            {p.bloqueio_tentativas != null && (
                                              <p className="text-xs text-muted-foreground">
                                                {p.bloqueio_tentativas} tentativa
                                                {p.bloqueio_tentativas === 1 ? "" : "s"}, última em{" "}
                                                {fmtDataHora(p.bloqueio_em)}
                                              </p>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <Selo estado={severidadeDoAlerta(p.alerta)}>
                                        {rotuloDoAlerta(p.alerta)}
                                      </Selo>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {(() => {
                                  // Pedido sem nascer no SNCF: a fila de descida é a verdade.
                                  const f = filaDoPedido(p, mapaFilaBling);
                                  if (f && f.status !== "pausado") {
                                    return (
                                      <div className="flex flex-col items-start gap-0.5">
                                        {f.status === "enviado" && f.bling_pedido_id && (
                                          <button
                                            type="button"
                                            title="Copiar número do pedido Bling"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              copiar(f.bling_pedido_id!, "Pedido Bling");
                                            }}
                                            className="inline-flex items-center gap-1 font-mono text-xs transition-colors hover:text-gold"
                                          >
                                            <span>#{f.bling_pedido_id}</span>
                                            <Copy className="h-3 w-3 text-muted-foreground" />
                                          </button>
                                        )}
                                        {(f.status === "pendente" || f.status === "processando") && (
                                          <span className="text-xs text-muted-foreground">na fila</span>
                                        )}
                                        {f.status === "erro" && (
                                          <Selo estado="destructive">erro</Selo>
                                        )}
                                        {f.status === "enviado" && (
                                          <Selo estado="success">No Bling</Selo>
                                        )}
                                      </div>
                                    );
                                  }
                                  return p.bling_pedido_numero || p.nf_refs ? (
                                    <div className="flex flex-col items-start gap-0.5">
                                      {p.bling_pedido_numero && (
                                        <button
                                          type="button"
                                          title="Copiar número do pedido Bling"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copiar(p.bling_pedido_numero!, "Pedido Bling");
                                          }}
                                          className="inline-flex items-center gap-1 font-mono text-xs transition-colors hover:text-gold"
                                        >
                                          <span>#{p.bling_pedido_numero}</span>
                                          <Copy className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                      )}
                                      {p.nf_refs && (
                                        <button
                                          type="button"
                                          title="Copiar NF"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copiar(p.nf_refs!, "NF");
                                          }}
                                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-gold"
                                        >
                                          <span>NF {p.nf_refs}</span>
                                          <Copy className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {fmtDataHora(p.created_at_shopify)}
                                <div className="text-muted-foreground">{diasTexto(p.dias_no_estagio)}</div>
                              </TableCell>
                              <TableCell className="max-w-[220px] text-xs">
                                <div className="truncate">{txt(p.cliente)}</div>
                                <div className="truncate text-muted-foreground">
                                  {txt(p.shipping_city)}
                                  {p.shipping_province ? `/${p.shipping_province}` : ""}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{formatBRL(p.total)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>Frete: {formatBRL(p.shipping_cost)}</TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Selo estado={p.estagio === "cancelado" ? "destructive" : p.eh_final ? "success" : "info"}>
                                  {txt(p.estagio_rotulo)}
                                </Selo>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {txt(p.area_responsavel)}
                              </TableCell>
                              <TableCell className="min-w-[260px] text-xs">
                                {(() => {
                                  const f = filaDoPedido(p, mapaFilaBling);
                                  if (f?.status === "erro" && f.ultimo_erro?.trim()) {
                                    return (
                                      <span className="line-clamp-2 text-destructive" title={f.ultimo_erro}>
                                        {truncarErro(f.ultimo_erro)}
                                      </span>
                                    );
                                  }
                                  if (f?.status === "pausado") {
                                    return (
                                      <span className="line-clamp-2 text-muted-foreground">
                                        {proximaAcaoExibida(p, mapaFilaBling)}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="line-clamp-2">
                                      {txt(proximaAcaoExibida(p, mapaFilaBling))}
                                    </span>
                                  );
                                })()}
                                {p.bloqueio_motivo && !alertaSuprimidoPorFila(p, mapaFilaBling) && (
                                  (() => {
                                    const partes = p.bloqueio_motivo
                                      .split(" · ")
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    if (partes.length > 1) {
                                      return (
                                        <ul className="mt-1 list-disc list-inside text-xs text-destructive">
                                          {partes.map((parte, idx) => (
                                            <li key={idx}>{parte}</li>
                                          ))}
                                        </ul>
                                      );
                                    }
                                    return (
                                      <p className="mt-1 text-xs text-destructive">{partes[0]}</p>
                                    );
                                  })()
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Selo estado={p.tem_nf ? "success" : "muted"}>NF</Selo>
                                  <Selo estado={p.tem_recebimento ? "success" : "muted"}>MP</Selo>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {p.tracking_number ? (
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-xs">{p.tracking_number}</span>
                                    <button
                                      type="button"
                                      title="Copiar código"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copiar(p.tracking_number!, "Código de rastreio");
                                      }}
                                      className="text-muted-foreground transition-colors hover:text-gold"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </button>
                                    {p.tracking_url && (
                                      <a
                                        href={p.tracking_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Abrir rastreio"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-muted-foreground transition-colors hover:text-gold"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="w-8">
                                {p.coerencia_status === "divergente" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex text-warning">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Itens não batem com o total do pedido</TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                </TooltipProvider>
                <RodapePaginacao
                  total={ordenados.length}
                  pagina={paginaAtual}
                  tamanhoPagina={tamanhoPagina}
                  chavePreferencia={CHAVE_PAGINA_B2C}
                  onPagina={setPagina}
                  onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
                />
              </CardContent>
            </Card>
          )}
          </ConteudoAba>
        </TabsContent>

        <TabsContent value="dash">
          <ConteudoAba slug="tela.dash_b2c">
            <DashB2c pedidos={lista} isLoading={isLoading} />
          </ConteudoAba>
        </TabsContent>
      </Tabs>
      )}

      <PedidoB2cDrawer
        pedido={selecionado}
        open={selecionado !== null}
        onOpenChange={(o) => !o && setSelecionado(null)}
      />
    </PageShell>
  );
}

function CarregandoAba() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
