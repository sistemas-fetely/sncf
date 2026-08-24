import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Copy, ExternalLink } from "lucide-react";
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
import { PipelineB2c } from "@/components/vendas/PipelineB2c";
import { PedidoB2cDrawer } from "@/components/vendas/PedidoB2cDrawer";
import { ExportarB2cButton } from "@/components/vendas/ExportarB2cButton";
import { DashB2c } from "@/components/vendas/DashB2c";
import {
  usePedidosB2c, useCarrinhosAbandonados, useDevolucoesB2c, type PedidoB2cRow,
} from "@/hooks/vendas/useB2c";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissoesDoUsuario, temPermissaoTela } from "@/hooks/usePermissoesDoUsuario";
import { AbaPermitida, ConteudoAba } from "@/components/AbaGate";

/**
 * Casa do B2C — mesma linguagem da Casa dos Pedidos, regras do canal loja.
 * FONTE-UNICA: contador de aba e card de pipeline leem a MESMA view que a
 * tabela daquela aba mostra. Pagamento já vem resolvido na porta: o funil aqui
 * é faturar, expedir, rastrear e entregar.
 */

const ABAS = ["fila", "dash", "carrinhos", "posvenda"] as const;
type Aba = (typeof ABAS)[number];

const ALERTA_ESTADO: Record<string, EstadoSelo> = {
  pago_sem_nf: "warning",
  faturado_sem_expedicao: "warning",
  expedido_sem_rastreio: "destructive",
  prazo_estourado: "destructive",
  sem_conciliacao_mp: "muted",
  reembolso_parcial: "muted",
  sla_xpm_estourado: "destructive",
};

function rotuloAlerta(a: string): string {
  return a.replace(/_/g, " ");
}

function txt(v: string | null | undefined): string {
  return v && String(v).trim() !== "" ? String(v) : "—";
}

function diasTexto(d: number | null): string {
  if (d == null) return "—";
  return `há ${d} d`;
}

export default function ShopifyB2c() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get("aba");
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "fila";
  const estagioParam = searchParams.get("estagio");
  // Carrinhos abandonados: dado de contato de quem NÃO comprou — uso de
  // marketing, separado de operar a fila de pedidos.
  const { roles } = useAuth();
  const { data: permitidas } = usePermissoesDoUsuario();
  const podeVerCarrinhos =
    (roles ?? []).includes("super_admin") ||
    temPermissaoTela("tela.b2c_carrinhos", permitidas);

  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("todas");
  const [alerta, setAlerta] = useState("todos");
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [selecionado, setSelecionado] = useState<PedidoB2cRow | null>(null);

  const { data: pedidos, isLoading, isError, error } = usePedidosB2c();
  const { data: carrinhos, isLoading: carregandoCarrinhos } = useCarrinhosAbandonados();
  const { data: devolucoes, isLoading: carregandoDevolucoes } = useDevolucoesB2c();

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

  const carrinhosResumo = useMemo(
    () => ({
      qtd: (carrinhos ?? []).length,
      valor: (carrinhos ?? []).reduce((s, c) => s + Number(c.total_price ?? 0), 0),
    }),
    [carrinhos],
  );

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

  const copiar = (v: string) => {
    void navigator.clipboard.writeText(v);
    toast.success("Código de rastreio copiado.");
  };

  return (
    <PageShell>
      <CasaPageHeader
        breadcrumb={[{ label: "Vendas" }, { label: "Loja B2C" }]}
        title="Loja · B2C"
        subtitle="Pedidos da loja Shopify. Pagamento vem resolvido na porta — o funil aqui é faturar, expedir, rastrear e entregar."
        // Exportação leva a base para fora: nível 3 (Coordenador) para cima — o componente se autoprotege.
        actions={<ExportarB2cButton linhas={filtrados} />}
      />

        <Tabs value={aba} onValueChange={setAba} className="space-y-4">
          <TabsList>
            <TabsTrigger value="fila">Fila</TabsTrigger>
            <AbaPermitida slug="tela.dash_b2c">
              <TabsTrigger value="dash">Dash</TabsTrigger>
            </AbaPermitida>
            <div className="w-px bg-border mx-1.5 self-stretch" aria-hidden />
            {podeVerCarrinhos && (
              <TabsTrigger value="carrinhos">
                Carrinhos{carrinhosResumo.qtd > 0 ? ` (${carrinhosResumo.qtd})` : ""}
              </TabsTrigger>
            )}
            <TabsTrigger value="posvenda">Pós-venda</TabsTrigger>
          </TabsList>

        <TabsContent value="fila" className="space-y-4">
          <div className="sticky top-14 z-20 -mx-6 border-b border-border bg-background px-6 py-2">
            <PipelineB2c
              estagioAtivo={estagioParam}
              onClickEstagio={(e) => setEstagio(e)}
              onLimparFiltro={() => setEstagio(null)}
              incluirCancelados={incluirCancelados}
              onToggleCancelados={setIncluirCancelados}
              filaAtiva={filaAtiva}
              carrinhos={carrinhosResumo}
              onAbrirCarrinhos={() => setAba("carrinhos")}
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
                    {rotuloAlerta(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filtrados.length} pedido{filtrados.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Erro ao carregar os pedidos da loja: {(error as Error)?.message ?? "erro desconhecido"}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <TooltipProvider>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pedido</TableHead>
                          <TableHead>Data / Idade</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Estágio</TableHead>
                          <TableHead>Dono</TableHead>
                          <TableHead>Próxima ação</TableHead>
                          <TableHead>Financeiro</TableHead>
                          <TableHead>Rastreio</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow>
                            <TableCell colSpan={10} className="py-8 text-center">
                              <Skeleton className="mx-auto h-4 w-32" />
                            </TableCell>
                          </TableRow>
                        ) : filtrados.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                              Nenhum pedido nesta seleção.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filtrados.map((p) => (
                            <TableRow
                              key={p.shopify_id ?? p.order_name ?? ""}
                              onClick={() => setSelecionado(p)}
                              className="cursor-pointer"
                            >
                              <TableCell className="whitespace-nowrap">
                                <span className="font-mono text-xs">{txt(p.order_name)}</span>
                                {p.alerta && (
                                  <div className="mt-1">
                                    <Selo estado={ALERTA_ESTADO[p.alerta] ?? "muted"}>
                                      {rotuloAlerta(p.alerta)}
                                    </Selo>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {formatDateBR(p.data_pedido)}
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
                              <TableCell className="max-w-[220px] text-xs">
                                <span className="line-clamp-2">{txt(p.proxima_acao)}</span>
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
                                        copiar(p.tracking_number!);
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
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dash">
          <ConteudoAba slug="tela.dash_b2c">
            <DashB2c pedidos={lista} isLoading={isLoading} />
          </ConteudoAba>
        </TabsContent>

        {podeVerCarrinhos && (
          <TabsContent value="carrinhos" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {carrinhosResumo.qtd} carrinho(s) abandonado(s) · {formatBRL(carrinhosResumo.valor)} em jogo.
            </p>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Checkout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carregandoCarrinhos ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center">
                          <Skeleton className="mx-auto h-4 w-32" />
                        </TableCell>
                      </TableRow>
                    ) : (carrinhos ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum carrinho abandonado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (carrinhos ?? []).map((c) => {
                        const idade = c.created_at_shopify
                          ? Math.floor(
                              (Date.now() - new Date(c.created_at_shopify).getTime()) / 86400000,
                            )
                          : null;
                        return (
                          <TableRow key={c.token}>
                            <TableCell className="text-xs">{txt(c.email)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {formatBRL(c.total_price)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDateBR(c.created_at_shopify)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {idade != null ? `${idade} d` : "—"}
                            </TableCell>
                            <TableCell>
                              {c.abandoned_checkout_url ? (
                                <a
                                  href={c.abandoned_checkout_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-gold"
                                >
                                  Abrir <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="posvenda">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carregandoDevolucoes ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center">
                        <Skeleton className="mx-auto h-4 w-32" />
                      </TableCell>
                    </TableRow>
                  ) : (devolucoes ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhuma devolução da loja registrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (devolucoes ?? []).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.numero}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {txt(d.shopify_pedido_id ?? d.pedido_id)}
                        </TableCell>
                        <TableCell>
                          <Selo estado={d.status === "encerrada" ? "success" : "warning"}>{d.status}</Selo>
                        </TableCell>
                        <TableCell className="text-xs">{d.tipo}</TableCell>
                        <TableCell className="max-w-[280px] text-xs">
                          <span className="line-clamp-2">
                            {txt(d.motivo_categoria)} · {d.motivo_texto}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatBRL(d.valor_credito)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateBR(d.criado_em)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PedidoB2cDrawer
        pedido={selecionado}
        open={selecionado !== null}
        onOpenChange={(o) => !o && setSelecionado(null)}
      />
    </PageShell>
  );
}
